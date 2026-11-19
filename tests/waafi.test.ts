import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { abandonDraft, createOrder, restaurant } from '../src/lib/orders';
import { capturePayment } from '../src/lib/operations';
import { passwordHash, type Actor } from '../src/lib/security';
import { describeOperator, parseSomaliMobile } from '../src/lib/somali-phone';
import { handleWaafiWebhook, sendWaafiPayment } from '../src/lib/waafi';
import type { StaffOrderInput } from '../src/lib/domain';

// A stand-in for WaafiPay's API that answers by payer number, like the real service would.
const requests: any[] = [];
let server: Server,
  delayMs = 0;
const SECRET = 'test-webhook-secret';
let r: any, burger: any, zone: any, manager: Actor, cashier: Actor, rider: Actor, otherRider: Actor;

const input = (extra: Partial<StaffOrderInput> = {}): StaffOrderInput => ({
  items: [{ menuItemId: burger.id, quantity: 1, modifierOptionIds: [], specialInstructions: '' }],
  customerName: 'Waafi Guest',
  customerPhone: '615000001',
  deliveryAddress: 'Hodan',
  zoneId: zone.id,
  discountPercent: 0,
  withVat: true,
  paymentMethod: 'MOBILE',
  paid: false,
  ...extra,
});
async function staff(role: 'MANAGER' | 'CASHIER' | 'RIDER') {
  const u = await db.staffUser.create({
    data: {
      restaurantId: r.id,
      email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@botan.local`,
      role,
      fullName: role,
      passwordHash: await passwordHash('WaafiTest!Password26'),
    },
  });
  return { id: u.id, role: u.role, name: u.fullName, kind: 'staff' as const, restaurantId: r.id };
}
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const p = body.serviceParams,
        account = p.payerInfo.accountNo,
        reply = (data: unknown) =>
          setTimeout(() => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(data));
          }, delayMs);
      if (p.apiKey !== 'test-api-key')
        return reply({
          responseCode: '5301',
          errorCode: 'E10301',
          responseMsg: 'RCS_INVALID_HPPKEY',
        });
      if (account.endsWith('0002'))
        return reply({
          responseCode: '5206',
          errorCode: 'E10205',
          responseMsg: 'Payment Failed (Haraaga xisaabtaada kuguma filna, insufficient balance)',
          params: null,
        });
      reply({
        schemaVersion: '1.0',
        timestamp: new Date().toISOString(),
        requestId: body.requestId,
        responseCode: '2001',
        errorCode: '0',
        responseMsg: 'RCS_SUCCESS',
        params: {
          state: 'APPROVED',
          referenceId: p.transactionInfo.referenceId,
          transactionId: 'TX' + Math.floor(Math.random() * 1e9),
          issuerTransactionId: 'ISS1',
          accountNo: account,
          txAmount: p.transactionInfo.amount,
        },
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  Object.assign(process.env, {
    WAAFI_API_URL: `http://127.0.0.1:${port}/asm`,
    WAAFI_MERCHANT_UID: 'M0912345',
    WAAFI_API_USER_ID: '1000123',
    WAAFI_API_KEY: 'test-api-key',
    WAAFI_WEBHOOK_SECRET: SECRET,
  });
  r = await restaurant();
  burger = await db.menuItem.findUniqueOrThrow({
    where: { restaurantId_slug: { restaurantId: r.id, slug: 'beef-burger' } },
  });
  await db.inventoryItem.updateMany({
    where: { restaurantId: r.id },
    data: { quantityOnHand: 500 },
  });
  zone = await db.deliveryZone.upsert({
    where: { restaurantId_name: { restaurantId: r.id, name: 'Waafi zone' } },
    update: { deliveryFee: 1, isActive: true },
    create: { restaurantId: r.id, name: 'Waafi zone', deliveryFee: 1, etaMinutes: 30 },
  });
  manager = await staff('MANAGER');
  cashier = await staff('CASHIER');
  rider = await staff('RIDER');
  otherRider = await staff('RIDER');
});
afterEach(() => {
  delayMs = 0;
  delete process.env.WAAFI_TIMEOUT_MS;
});
afterAll(async () => {
  for (const k of [
    'WAAFI_API_URL',
    'WAAFI_MERCHANT_UID',
    'WAAFI_API_USER_ID',
    'WAAFI_API_KEY',
    'WAAFI_WEBHOOK_SECRET',
  ])
    delete process.env[k];
  server.close();
  await db.$disconnect();
});
const payment = (orderId: string) => db.payment.findFirstOrThrow({ where: { orderId } });

describe('Somali numbers', () => {
  it('normalises every common way of typing a number', () => {
    for (const v of [
      '615442493',
      '0615442493',
      '252615442493',
      '+252 61 544 2493',
      '00252-61-544-2493',
    ])
      expect(parseSomaliMobile(v)?.msisdn).toBe('252615442493');
    expect(parseSomaliMobile('61544249')).toBeNull();
    expect(parseSomaliMobile('645442493')).toBeNull();
    expect(parseSomaliMobile('abc')).toBeNull();
  });
  it('knows the operator and wallet behind each prefix', () => {
    const cases: [string, string, string][] = [
      ['615442493', 'Hormuud · EVC Plus', 'EVC_PLUS'],
      ['775442493', 'Hormuud · EVC Plus', 'EVC_PLUS'],
      ['685442493', 'Somnet (Hormuud) · Jeeb', 'JEEB'],
      ['635442493', 'Telesom · ZAAD', 'ZAAD'],
      ['905442493', 'Golis · SAHAL', 'SAHAL'],
      ['625442493', 'Somtel · eDahab', 'EDAHAB'],
      ['695442493', 'NationLink · e-Maal', 'EMAAL'],
      ['715442493', 'Amtel · MyCash', 'MYCASH'],
    ];
    for (const [n, label, wallet] of cases) {
      const p = parseSomaliMobile(n)!;
      expect(describeOperator(p)).toBe(label);
      expect(p.wallet).toBe(wallet);
    }
  });
});

describe('WaafiPay', () => {
  it('sets the wallet from the number when the order is saved', async () => {
    const o = await createOrder(input({ paymentPhone: '0685000001' }), randomUUID(), cashier);
    expect(o.paymentMethod).toBe('JEEB');
    expect(await payment(o.id)).toMatchObject({
      method: 'JEEB',
      providerReference: '252685000001',
    });
    await expect(
      createOrder(input({ customerPhone: '645000001' }), randomUUID(), cashier),
    ).rejects.toThrow('lama garan karo');
  });
  it('asks the customer to pay the server-side amount and records it when approved', async () => {
    const o = await createOrder(input(), randomUUID(), cashier);
    const result = await sendWaafiPayment(o.paymentId!, cashier);
    expect(result).toMatchObject({
      status: 'PAID',
      wallet: 'EVC_PLUS',
      operator: 'Hormuud · EVC Plus',
    });
    const sent = requests.at(-1);
    expect(sent.serviceName).toBe('API_PURCHASE');
    expect(sent.serviceParams).toMatchObject({
      merchantUid: 'M0912345',
      apiUserId: '1000123',
      paymentMethod: 'MWALLET_ACCOUNT',
      payerInfo: { accountNo: '252615000001' },
      transactionInfo: { amount: '8.88', currency: 'USD', invoiceId: o.orderNumber },
    });
    expect(sent.serviceParams.transactionInfo.referenceId).toBe(`${o.paymentId}-1`);
    const p = await payment(o.id);
    expect(p).toMatchObject({ status: 'PAID', provider: 'waafi', processingAt: null });
    expect(p.providerTransactionId).toMatch(/^TX/);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PAID');
    await expect(sendWaafiPayment(o.paymentId!, cashier)).rejects.toThrow('horay');
  });
  it('reports a decline in plain words and lets staff retry from another number', async () => {
    const o = await createOrder(input({ customerPhone: '615000002' }), randomUUID(), cashier);
    const declined = await sendWaafiPayment(o.paymentId!, cashier);
    expect(declined).toMatchObject({
      status: 'DECLINED',
      message: 'Haraaga macmiilka kuma filna.',
    });
    let p = await payment(o.id);
    expect(p).toMatchObject({
      status: 'PENDING',
      processingAt: null,
      lastError: 'Haraaga macmiilka kuma filna.',
    });
    const paid = await sendWaafiPayment(o.paymentId!, cashier, '0775000001');
    expect(paid).toMatchObject({ status: 'PAID', wallet: 'EVC_PLUS' });
    p = await payment(o.id);
    expect(p).toMatchObject({ attempts: 2, providerReference: '252775000001', lastError: null });
    expect(requests.at(-1).serviceParams.transactionInfo.referenceId).toBe(`${o.paymentId}-2`);
  });
  it('never sends two requests for one payment at the same time', async () => {
    const o = await createOrder(input(), randomUUID(), cashier);
    delayMs = 400;
    const before = requests.length;
    const results = await Promise.allSettled([
      sendWaafiPayment(o.paymentId!, cashier),
      sendWaafiPayment(o.paymentId!, cashier),
    ]);
    expect(requests.length - before).toBe(1);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((x) => x.status === 'rejected') as any).reason.message).toContain('socda');
  });
  it('keeps the payment locked when the answer is lost, then the signed webhook records it', async () => {
    const o = await createOrder(input(), randomUUID(), cashier);
    process.env.WAAFI_TIMEOUT_MS = '100';
    delayMs = 600;
    expect((await sendWaafiPayment(o.paymentId!, cashier)).status).toBe('UNKNOWN');
    await expect(sendWaafiPayment(o.paymentId!, cashier)).rejects.toThrow('socda');
    const p = await payment(o.id);
    await expect(capturePayment(p.id, cashier)).rejects.toThrow('maamulaha');
    await expect(capturePayment(p.id, manager)).rejects.toThrow('WaafiPay');
    const body = JSON.stringify({
      event: 'authorization',
      merchant_uid: 'M0912345',
      payment: {
        transaction_id: 'TXWEBHOOK1',
        amount: 8.88,
        currency: 'USD',
        status: 'approved',
        reference_id: `${p.id}-1`,
      },
    });
    const headers = (
      b: string,
      ts = String(Math.floor(Date.now() / 1000)),
      id = randomUUID(),
      secret = SECRET,
    ) =>
      new Headers({
        'x-webhook-timestamp': ts,
        'x-webhook-event-id': id,
        'x-webhook-signature': createHmac('sha256', secret)
          .update(`${ts}.${id}.${b}`)
          .digest('hex'),
      });
    await expect(
      handleWaafiWebhook(body, headers(body, undefined, undefined, 'wrong')),
    ).rejects.toThrow('signature');
    await expect(
      handleWaafiWebhook(body, headers(body, String(Math.floor(Date.now() / 1000) - 900))),
    ).rejects.toThrow('Stale');
    const h = headers(body);
    expect(await handleWaafiWebhook(body, h)).toMatchObject({ recorded: 'paid' });
    expect(await handleWaafiWebhook(body, h)).toMatchObject({ duplicate: true });
    expect(await payment(o.id)).toMatchObject({
      status: 'PAID',
      providerTransactionId: 'TXWEBHOOK1',
      processingAt: null,
    });
    expect(await handleWaafiWebhook('{"event":"webhook.test"}', new Headers())).toMatchObject({
      test: true,
    });
  });
  it('lets only the assigned rider ask at the door, and refuses cancelled orders', async () => {
    const o = await createOrder(input({ riderId: rider.id }), randomUUID(), cashier);
    await expect(sendWaafiPayment(o.paymentId!, otherRider)).rejects.toThrow('laguma qoondeyn');
    expect((await sendWaafiPayment(o.paymentId!, rider)).status).toBe('PAID');
    const c = await createOrder(input(), randomUUID(), cashier);
    await db.order.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
    await expect(sendWaafiPayment(c.paymentId!, cashier)).rejects.toThrow('joojiyey');
  });
  it('makes the order only after the customer pays: a hidden draft until then', async () => {
    const o = await createOrder(input({ riderId: rider.id }), randomUUID(), cashier);
    expect(o.awaitingPayment).toBe(true);
    let saved = await db.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { delivery: true },
    });
    expect(saved).toMatchObject({ status: 'AWAITING_PAYMENT', stockDeducted: false });
    expect(saved.delivery).toMatchObject({ status: 'PENDING', riderId: rider.id });
    // Not on any board list until it is paid.
    const { viewStatuses } = await import('../src/lib/domain');
    expect(Object.values(viewStatuses).flat()).not.toContain('AWAITING_PAYMENT');
    expect(await db.auditLog.count({ where: { entityId: o.id, action: 'ORDER_CREATE' } })).toBe(0);
    expect((await sendWaafiPayment(o.paymentId!, cashier)).status).toBe('PAID');
    saved = await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { delivery: true } });
    expect(saved).toMatchObject({
      status: 'OUT_FOR_DELIVERY',
      paymentStatus: 'PAID',
      stockDeducted: true,
    });
    expect(saved.confirmedAt).not.toBeNull();
    expect(saved.delivery).toMatchObject({ status: 'ASSIGNED', riderId: rider.id });
    expect(await db.auditLog.count({ where: { entityId: o.id, action: 'ORDER_CREATE' } })).toBe(1);
  });
  it('drops a draft the customer did not pay, but never while an answer is outstanding', async () => {
    const o = await createOrder(input({ customerPhone: '615000002' }), randomUUID(), cashier);
    expect((await sendWaafiPayment(o.paymentId!, cashier)).status).toBe('DECLINED');
    expect(await abandonDraft(o.id, cashier)).toEqual({ status: 'ABANDONED' });
    expect(await payment(o.id)).toMatchObject({ status: 'FAILED' });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
      'AWAITING_PAYMENT',
    );
    const lost = await createOrder(input(), randomUUID(), cashier);
    process.env.WAAFI_TIMEOUT_MS = '100';
    delayMs = 600;
    expect((await sendWaafiPayment(lost.paymentId!, cashier)).status).toBe('UNKNOWN');
    await expect(abandonDraft(lost.id, cashier)).rejects.toThrow('WaafiPay');
    // The late webhook still turns it into an order.
    const p = await payment(lost.id),
      body = JSON.stringify({
        event: 'authorization',
        payment: { transaction_id: 'TXLATE', amount: 8.88, reference_id: `${p.id}-1` },
      }),
      ts = String(Math.floor(Date.now() / 1000)),
      id = randomUUID();
    await handleWaafiWebhook(
      body,
      new Headers({
        'x-webhook-timestamp': ts,
        'x-webhook-event-id': id,
        'x-webhook-signature': createHmac('sha256', SECRET)
          .update(`${ts}.${id}.${body}`)
          .digest('hex'),
      }),
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: lost.id } })).status).toBe('CONFIRMED');
    expect(await abandonDraft(lost.id, cashier)).toEqual({ status: 'CONFIRMED' });
  });
  it('explains wrong credentials and fails closed without them', async () => {
    const o = await createOrder(input(), randomUUID(), cashier);
    process.env.WAAFI_API_KEY = 'bad-key';
    expect(await sendWaafiPayment(o.paymentId!, cashier)).toMatchObject({
      status: 'DECLINED',
      message: expect.stringContaining('credentials'),
    });
    delete process.env.WAAFI_API_KEY;
    await expect(sendWaafiPayment(o.paymentId!, cashier)).rejects.toThrow('lama xirin');
    process.env.WAAFI_API_KEY = 'test-api-key';
    expect((await payment(o.id)).status).toBe('PENDING');
  });
});
