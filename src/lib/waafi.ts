// WaafiPay: ask the customer to pay an order from their mobile wallet.
//
// "Send" posts API_PURCHASE to WaafiPay with the payer's number. The customer's phone shows the payment
// prompt; when they enter their PIN WaafiPay answers APPROVED and the payment is recorded as received.
// WaafiPay routes the request to the wallet behind the number (61 EVC Plus, 68 Jeeb, 63 ZAAD …).
//
// Safety:
// - Credentials come only from the environment (WAAFI_*); nothing works until they are set.
// - One payment request at a time per payment: while one waits for the customer (up to 3 minutes) a
//   second "Send" is refused, so a customer is never asked to pay twice.
// - The amount always comes from the order on the server, never from the browser.
// - If WaafiPay's answer is lost (timeout), the signed webhook (POST /api/v1/webhooks/waafi) still
//   records the payment; the payment stays locked until then or until the 3 minutes pass.
// - Nothing is ever marked paid without APPROVED from WaafiPay or a verified webhook.
import { createHmac, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import { AppError, ensure } from './errors';
import { activateOrder, audit, transaction } from './orders';
import { syncPaymentStatus } from './operations';
import { constantEqual, type Actor } from './security';
import { describeOperator, parseSomaliMobile } from './somali-phone';
import { decimal, money, MOBILE_WALLETS } from './domain';

const URLS = {
  sandbox: 'https://sandbox.waafipay.com/asm',
  production: 'https://api.waafipay.net/asm',
} as const;
/** How long a payment stays locked while the customer is asked for their PIN. */
export const PROCESSING_WINDOW_MS = 3 * 60 * 1000;

export function waafiConfig() {
  const env = process.env.WAAFI_ENV === 'production' ? 'production' : 'sandbox';
  const merchantUid = process.env.WAAFI_MERCHANT_UID?.trim(),
    apiUserId = process.env.WAAFI_API_USER_ID?.trim(),
    apiKey = process.env.WAAFI_API_KEY?.trim();
  return {
    configured: Boolean(merchantUid && apiUserId && apiKey),
    env,
    url: process.env.WAAFI_API_URL?.trim() || URLS[env],
    merchantUid,
    apiUserId,
    apiKey,
    currency: process.env.WAAFI_CURRENCY?.trim() || 'USD',
    webhookSecret: process.env.WAAFI_WEBHOOK_SECRET?.trim(),
  };
}
/** Safe to show staff: no keys. */
export function waafiStatus() {
  const c = waafiConfig();
  return {
    configured: c.configured,
    env: c.env,
    merchant: c.merchantUid ? c.merchantUid.slice(0, 3) + '•••' + c.merchantUid.slice(-2) : null,
    webhook: Boolean(c.webhookSecret),
    /** Names (never values) of the settings the server can't see, to tell staff what to fix. */
    missing: (
      [
        ['WAAFI_MERCHANT_UID', c.merchantUid],
        ['WAAFI_API_USER_ID', c.apiUserId],
        ['WAAFI_API_KEY', c.apiKey],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k),
  };
}

type Outcome =
  | { kind: 'approved'; transactionId: string; amountCents?: number; raw: unknown }
  | { kind: 'declined'; message: string; code?: string; raw: unknown }
  | { kind: 'unknown'; message: string; raw?: unknown };

/** The customer-facing reason for a declined request, in plain words. */
function declineMessage(body: any) {
  const msg = String(body?.responseMsg || body?.params?.description || '').trim();
  if (/insufficient|haraaga|balance/i.test(msg)) return 'Haraaga macmiilka kuma filna.';
  if (/cancel|reject|diid/i.test(msg)) return 'Macmiilka ayaa diiday codsiga lacagta.';
  if (/timeout|time out|expired/i.test(msg))
    return 'Macmiilka PIN-ka ma gelin waqtigii loo qabtay.';
  if (/invalid.*(account|subscriber|number)|not.*registered|not found/i.test(msg))
    return 'Lambarkan wallet uma diiwaangashana ama ma shaqeynayo.';
  if (body?.responseCode === '5301' || /HPPKEY|credential|unauthori/i.test(msg))
    return 'Xogta WaafiPay (credentials) waa khalad. Hubi WAAFI_* settings-ka.';
  return msg || 'WaafiPay wuu diiday codsiga.';
}

async function postPurchase(
  payerMsisdn: string,
  amountCents: number,
  referenceId: string,
  invoiceId: string,
  description: string,
): Promise<Outcome> {
  const c = waafiConfig();
  const request = {
    schemaVersion: '1.0',
    requestId: randomUUID(),
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    channelName: 'WEB',
    serviceName: 'API_PURCHASE',
    serviceParams: {
      merchantUid: c.merchantUid,
      apiUserId: c.apiUserId,
      apiKey: c.apiKey,
      paymentMethod: 'MWALLET_ACCOUNT',
      payerInfo: { accountNo: payerMsisdn },
      transactionInfo: {
        referenceId,
        invoiceId,
        amount: decimal(amountCents),
        currency: c.currency,
        description,
      },
    },
  };
  let response: Response;
  try {
    response = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(Number(process.env.WAAFI_TIMEOUT_MS) || 120_000),
    });
  } catch (e) {
    return {
      kind: 'unknown',
      message:
        e instanceof Error && e.name === 'TimeoutError'
          ? 'WaafiPay jawaab ma soo celin waqtigii loo qabtay.'
          : 'WaafiPay lama gaari karo hadda.',
    };
  }
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    return { kind: 'unknown', message: `WaafiPay jawaab aan la fahmin (${response.status}).` };
  }
  const state = String(body?.params?.state || '').toUpperCase();
  if (body?.responseCode === '2001' && state === 'APPROVED' && body?.params?.transactionId)
    return {
      kind: 'approved',
      transactionId: String(body.params.transactionId),
      amountCents: body.params.txAmount !== undefined ? money(body.params.txAmount) : undefined,
      raw: redact(body),
    };
  if (response.status >= 500)
    return { kind: 'unknown', message: 'WaafiPay khalad ayaa ku dhacay.', raw: redact(body) };
  return {
    kind: 'declined',
    message: declineMessage(body),
    code: body?.errorCode || body?.responseCode,
    raw: redact(body),
  };
}
const redact = (body: any) => {
  if (!body || typeof body !== 'object') return body;
  const { params, ...rest } = body;
  return { ...rest, params: params && { ...params, accountNo: undefined } };
};
const referenceFor = (paymentId: string, attempt: number) => `${paymentId}-${attempt}`;
const paymentIdFromReference = (ref: string) =>
  /^[0-9a-f-]{36}-\d+$/i.test(ref) ? ref.slice(0, 36) : null;

async function recordApproved(
  tx: Prisma.TransactionClient,
  paymentId: string,
  transactionId: string,
  payload: Prisma.InputJsonValue,
  eventId: string,
) {
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.paidAt) return p;
  const updated = await tx.payment.update({
    where: { id: paymentId },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      provider: 'waafi',
      providerTransactionId: transactionId,
      processingAt: null,
      lastError: null,
    },
  });
  await tx.paymentEvent.create({
    data: { paymentId, providerEventId: eventId, type: 'SUCCEEDED', payload },
  });
  await syncPaymentStatus(tx, p.orderId);
  await activateOrder(tx, p.orderId);
  return updated;
}

/** Who may ask a customer to pay: order staff, and a rider for an order assigned to them. */
async function loadPayment(paymentId: string, user: Actor) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, order: { restaurantId: user.restaurantId } },
    include: { order: { include: { delivery: true } } },
  });
  ensure(payment, 'Lacag-bixinta lama helin', 404);
  if (user.role === 'RIDER')
    ensure(payment.order.delivery?.riderId === user.id, 'Dalabkan adiga laguma qoondeyn', 403);
  else ensure(['OWNER', 'MANAGER', 'CASHIER'].includes(user.role), 'Ma lihid oggolaanshaha', 403);
  return payment;
}

/**
 * Sends the payment request to the customer's phone and waits for their answer.
 * `phone` replaces the number on the payment (e.g. the customer pays from another number).
 */
export async function sendWaafiPayment(paymentId: string, user: Actor, phone?: string) {
  const config = waafiConfig();
  ensure(
    config.configured,
    'WaafiPay weli lama xirin. Geli WAAFI_MERCHANT_UID, WAAFI_API_USER_ID iyo WAAFI_API_KEY.',
    501,
  );
  const payment = await loadPayment(paymentId, user);
  ensure(
    !['CANCELLED', 'REJECTED'].includes(payment.order.status),
    'Dalabkan waa la joojiyey',
    409,
  );
  ensure(
    ['PENDING', 'UNPAID', 'FAILED'].includes(payment.status),
    'Lacagtan horay ayaa loo bixiyey',
    409,
  );
  const payer = parseSomaliMobile(phone || payment.providerReference || payment.order.guestPhone);
  ensure(payer, 'Lambarka lacagta lama garan karo. Geli lambar Soomaali ah (tusaale 61xxxxxxx).');
  ensure((MOBILE_WALLETS as readonly string[]).includes(payer.wallet), 'Wallet-kan lama taageero');
  const amountCents = money(payment.amount);
  ensure(amountCents > 0, 'Lacag la bixiyo ma jirto');

  // Claim the payment: only one request may wait for the customer at a time.
  const claim = await transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        paidAt: null,
        status: { in: ['PENDING', 'UNPAID', 'FAILED'] },
        OR: [
          { processingAt: null },
          { processingAt: { lt: new Date(Date.now() - PROCESSING_WINDOW_MS) } },
        ],
      },
      data: {
        processingAt: new Date(),
        attempts: { increment: 1 },
        method: payer.wallet,
        providerReference: payer.msisdn,
        status: 'PENDING',
        lastError: null,
      },
    });
    ensure(
      claimed.count === 1,
      'Codsi lacageed ayaa hadda u socda macmiilka. Sug jawaabta (ilaa 3 daqiiqo).',
      409,
    );
    const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    await audit(tx, user, 'WAAFI_SEND', 'Payment', payment.id, {
      wallet: payer.wallet,
      operator: describeOperator(payer),
      attempt: fresh.attempts,
      amount: decimal(amountCents),
    });
    return fresh;
  });

  const referenceId = referenceFor(payment.id, claim.attempts);
  const outcome = await postPurchase(
    payer.msisdn,
    amountCents,
    referenceId,
    payment.order.orderNumber,
    `Botan ${payment.order.orderNumber}`,
  );

  return transaction(async (tx) => {
    if (outcome.kind === 'approved') {
      if (outcome.amountCents !== undefined && outcome.amountCents !== amountCents) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { processingAt: null, lastError: 'Qadarka WaafiPay kuma eka dalabka. Hubi.' },
        });
        await audit(tx, user, 'WAAFI_AMOUNT_MISMATCH', 'Payment', payment.id, outcome.raw as any);
        throw new AppError(409, 'WaafiPay qadar kale ayuu ansixiyey. La xiriir maamulaha.');
      }
      await recordApproved(
        tx,
        payment.id,
        outcome.transactionId,
        outcome.raw as Prisma.InputJsonValue,
        `waafi:tx:${outcome.transactionId}`,
      );
      await audit(tx, user, 'WAAFI_APPROVED', 'Payment', payment.id, {
        transactionId: outcome.transactionId,
      });
      return {
        status: 'PAID' as const,
        message: `Lacagta waa la helay (${payer.walletName}).`,
        transactionId: outcome.transactionId,
        wallet: payer.wallet,
        operator: describeOperator(payer),
      };
    }
    if (outcome.kind === 'declined') {
      await tx.payment.update({
        where: { id: payment.id },
        data: { processingAt: null, lastError: outcome.message },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          providerEventId: `waafi:req:${referenceId}`,
          type: 'FAILED',
          payload: (outcome.raw ?? {}) as Prisma.InputJsonValue,
        },
      });
      await audit(tx, user, 'WAAFI_DECLINED', 'Payment', payment.id, {
        code: outcome.code ?? null,
        message: outcome.message,
      });
      return {
        status: 'DECLINED' as const,
        message: outcome.message,
        wallet: payer.wallet,
        operator: describeOperator(payer),
      };
    }
    // Unknown outcome: keep the lock so nobody asks the customer again before WaafiPay's webhook or
    // the 3-minute window settles it.
    await tx.payment.update({
      where: { id: payment.id },
      data: { lastError: outcome.message + ' Sug ama hubi taleefanka macmiilka.' },
    });
    await audit(tx, user, 'WAAFI_UNKNOWN', 'Payment', payment.id, { message: outcome.message });
    return {
      status: 'UNKNOWN' as const,
      message:
        outcome.message + ' Haddii macmiilku bixiyey, si toos ah ayaa loo diiwaangelin doonaa.',
      wallet: payer.wallet,
      operator: describeOperator(payer),
    };
  });
}

/**
 * WaafiPay webhook: verifies the HMAC-SHA256 signature over "{timestamp}.{event_id}.{raw body}",
 * rejects stale or repeated events, and records approved payments that the direct answer missed.
 */
export async function handleWaafiWebhook(rawBody: string, headers: Headers) {
  const secret = waafiConfig().webhookSecret;
  ensure(secret, 'Webhook not configured', 501);
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new AppError(400, 'Invalid JSON');
  }
  if (body?.event === 'webhook.test') return { ok: true, test: true };
  const timestamp = headers.get('x-webhook-timestamp') || '',
    eventId = headers.get('x-webhook-event-id') || '',
    signature = (headers.get('x-webhook-signature') || '').toLowerCase();
  ensure(timestamp && eventId && signature, 'Missing signature', 401);
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${eventId}.${rawBody}`)
    .digest('hex');
  ensure(constantEqual(signature, expected), 'Invalid signature', 401);
  const seconds = Number(timestamp) > 1e12 ? Number(timestamp) / 1000 : Number(timestamp);
  const when = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.parse(timestamp);
  ensure(
    Number.isFinite(when) && Math.abs(Date.now() - when) <= 5 * 60 * 1000,
    'Stale webhook',
    401,
  );

  const paymentId = paymentIdFromReference(String(body?.payment?.reference_id || ''));
  if (!paymentId) return { ok: true, ignored: 'unknown reference' };
  const providerEventId = `waafi:event:${eventId}`;
  return transaction(async (tx) => {
    if (await tx.paymentEvent.findUnique({ where: { providerEventId } }))
      return { ok: true, duplicate: true };
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return { ok: true, ignored: 'unknown payment' };
    const event = String(body.event);
    if (event === 'authorization') {
      const cents = money(body.payment.amount);
      if (cents !== money(payment.amount)) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { lastError: 'Webhook: qadarka kuma eka dalabka. Hubi.' },
        });
        return { ok: true, ignored: 'amount mismatch' };
      }
      await recordApproved(
        tx,
        payment.id,
        String(body.payment.transaction_id),
        body,
        providerEventId,
      );
      return { ok: true, recorded: 'paid' };
    }
    if (event === 'declined' && !payment.paidAt) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { processingAt: null, lastError: 'Macmiilka lacagta ma bixin (WaafiPay).' },
      });
      await tx.paymentEvent.create({
        data: { paymentId: payment.id, providerEventId, type: 'FAILED', payload: body },
      });
      return { ok: true, recorded: 'declined' };
    }
    await tx.paymentEvent.create({
      data: {
        paymentId: payment.id,
        providerEventId,
        type: event === 'refund' || event === 'void' ? 'REFUNDED' : 'FAILED',
        payload: body,
      },
    });
    return { ok: true, recorded: event };
  });
}
