import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OrderStatus, OrderType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { AppError } from './errors';
import {
  DALJIR_DRIVERS,
  DALJIR_MENU,
  DALJIR_ORDER,
  daljirConfig,
  queueDriversSync,
  queueMenuSync,
  queueOrderSync,
} from './daljir-queue';
import { money } from './domain';
import { createOrder, restaurant, transaction, transitionOrder } from './orders';
import type { Actor } from './security';

// DaljirConnect (WhatsApp AI ordering) ⇄ Botan.
//  • DaljirConnect → Botan: a signed webhook per order; the order is created here as PENDING_APPROVAL, like a website
//    order, and from then on Botan is the master — the kitchen, riders and cashiers work it as usual.
//  • Botan → DaljirConnect: every status change, payment and the order number is pushed back (the customer is told on
//    WhatsApp), and the menu (names, prices, sold-out) is synced by SKU = MenuItem.id. Riders are synced the same way
//    (id, name, phone); assigning one to a delivery sends the customer the rider's name and phone.
//  • An order placed in chat for someone else arrives with a recipient: they are the guest here (name, phone,
//    address); the notes say who ordered it and pays.
// Pushes go through the outbox (daljir.* topics) and are sent by drainDaljir(): right after the request, whenever a
// staff board polls, and by the cron as a fallback.

const terminal: OrderStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED'];
const DC_TERMINAL = ['DELIVERED', 'CANCELLED'];
const DC_STATUS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'CANCELLED',
};
const TYPE: Record<string, OrderType> = {
  delivery: 'DELIVERY',
  pickup: 'PICKUP',
  dine_in: 'DINE_IN',
};
const REJECTED_REASON = 'Maqaayadda ma aqbali karto dalabkan hadda.';

/** A failure retrying won't fix (bad mapping, order unknown on the other side). */
export class PermanentError extends Error {}

// ─── HTTP to DaljirConnect ─────────────────────────────────────────────────

type DcOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  externalId: string | null;
  driver?: { name: string; phone: string } | null;
};

async function dc<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { url, apiKey } = daljirConfig();
  let res: Response;
  try {
    res = await fetch(`${url}/v2${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new Error(`DaljirConnect unreachable: ${(e as Error).message}`.slice(0, 300));
  }
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (res.ok) return json?.data as T;
  const message = `DaljirConnect ${res.status}: ${json?.error?.message ?? res.statusText}`.slice(
    0,
    300,
  );
  // 4xx (except timeouts / rate limits) won't succeed on retry.
  if (res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status))
    throw new PermanentError(message);
  throw new Error(message);
}

// ─── Webhook: DaljirConnect → Botan ────────────────────────────────────────

export function verifySignature(raw: string, header: string | null) {
  const { webhookSecret } = daljirConfig();
  if (!webhookSecret || !header) return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', webhookSecret).update(raw).digest('hex')}`,
  );
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const webhookOrder = z.object({
  id: z.string().min(1),
  number: z.number(),
  type: z.string(),
  status: z.string(),
  needsPricing: z.boolean().default(false),
  total: z.number(),
  contact: z
    .object({ name: z.string().nullable().optional(), phone: z.string().nullable().optional() })
    .nullable()
    .optional(),
  items: z.array(
    z.object({
      sku: z.string().nullable().optional(),
      name: z.string(),
      quantity: z.number().int().min(1),
      notes: z.string().nullable().optional(),
    }),
  ),
  address: z.string().nullable().optional(),
  tableNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** ordered for someone else: they receive it, the contact pays */
  recipient: z
    .object({ name: z.string(), phone: z.string().nullable().optional() })
    .nullable()
    .optional(),
});
type WebhookOrder = z.infer<typeof webhookOrder>;
const webhookBody = z.object({
  event: z.string(),
  data: z.object({ order: webhookOrder.optional() }).passthrough().optional(),
});

/**
 * Status changes from DaljirConnect are not applied — Botan's staff own the order once it is here — except a
 * cancellation (the customer or the team called it off in chat).
 */
const systemActor = (restaurantId: string) =>
  // No staff member did this: status events and audit rows are written without an actor.
  ({
    id: null,
    role: 'OWNER',
    name: 'DaljirConnect',
    kind: 'staff',
    restaurantId,
  }) as unknown as Actor;

export async function handleWebhook(raw: string, signature: string | null) {
  if (!daljirConfig().webhookSecret) throw new AppError(503, 'DaljirConnect is not configured');
  if (!verifySignature(raw, signature)) throw new AppError(401, 'Invalid signature');
  let parsed: z.infer<typeof webhookBody>;
  try {
    parsed = webhookBody.parse(JSON.parse(raw));
  } catch {
    throw new AppError(400, 'Invalid payload');
  }
  if (parsed.event === 'ping') return { ok: true, event: 'ping' };
  const o = parsed.data?.order;
  if (!['order.created', 'order.updated'].includes(parsed.event) || !o)
    return { ok: true, ignored: 'event' };

  const existing = await db.order.findUnique({ where: { externalRef: o.id } });
  if (existing) {
    if (o.status === 'CANCELLED' && !terminal.includes(existing.status)) {
      await transitionOrder(existing.id, 'CANCELLED', systemActor(existing.restaurantId)).catch(
        () => undefined,
      );
      return { ok: true, orderNumber: existing.orderNumber, cancelled: true };
    }
    return { ok: true, orderNumber: existing.orderNumber };
  }
  if (DC_TERMINAL.includes(o.status)) return { ok: true, ignored: 'closed' };
  // Items the team still has to price in DaljirConnect: imported once priced (order.updated).
  if (o.needsPricing) return { ok: true, ignored: 'needs pricing' };
  return importOrder(o);
}

async function importOrder(o: WebhookOrder) {
  const r = await restaurant();
  const type = TYPE[o.type];
  if (!type) throw new AppError(422, `Order type "${o.type}" is not offered by Botan`);
  const items = o.items.map((i) => {
    if (!i.sku || !z.uuid().safeParse(i.sku).success)
      throw new AppError(422, `"${i.name}" is not linked to a Botan menu item (sync the menu)`);
    return {
      menuItemId: i.sku,
      quantity: Math.min(i.quantity, 30),
      modifierOptionIds: [],
      specialInstructions: (i.notes ?? '').slice(0, 300),
    };
  });
  const payerPhone = o.contact?.phone?.trim() ?? '';
  const rawName = o.contact?.name?.trim() ?? '';
  const payerName =
    rawName.length >= 2 && rawName !== payerPhone ? rawName.slice(0, 100) : 'WhatsApp customer';
  // For someone else: the rider calls and hands it to the recipient; the one who ordered pays.
  const gift = o.recipient?.phone
    ? { name: o.recipient.name.trim(), phone: o.recipient.phone.trim() }
    : null;
  const phone = gift?.phone ?? payerPhone;
  if (!/^\+?[\d\s-]{7,20}$/.test(phone))
    throw new AppError(422, 'The customer has no phone number');
  const guestName = gift && gift.name.length >= 2 ? gift.name.slice(0, 100) : payerName;

  const notes = [`WhatsApp #${o.number}`];
  if (gift)
    notes.push(
      `🎁 Loo dalbay ${guestName} — waxaa dalbaday oo bixinaya ${payerName}${payerPhone ? ` (${payerPhone})` : ''}`,
    );
  let zoneId: string | undefined;
  let deliveryAddress: string | undefined;
  if (type === 'DELIVERY') {
    deliveryAddress = o.address?.trim() ?? '';
    if (deliveryAddress.length < 5) throw new AppError(422, 'The delivery address is missing');
    const zones = await db.deliveryZone.findMany({
      where: { restaurantId: r.id, isActive: true },
      orderBy: { deliveryFee: 'asc' },
    });
    if (!zones.length) throw new AppError(422, 'Botan has no active delivery zone');
    const text = deliveryAddress.toLowerCase();
    const zone = zones.find((z) => text.includes(z.name.toLowerCase()));
    zoneId = (zone ?? zones[0]).id;
    if (!zone) notes.push(`Zone not named in the address — check it (${zones[0].name} used)`);
  }
  let tableId: string | undefined;
  if (type === 'DINE_IN' && o.tableNumber) {
    const table = await db.diningTable.findFirst({
      where: { restaurantId: r.id, tableNumber: o.tableNumber.trim(), status: { not: 'DISABLED' } },
    });
    tableId = table?.id;
    if (!table) notes.push(`Table ${o.tableNumber}`);
  }
  if (o.notes) notes.push(o.notes);

  try {
    const created = await createOrder(
      {
        items,
        type,
        guestName,
        guestPhone: phone,
        deliveryAddress,
        zoneId,
        tableId,
        notes: notes.join(' · ').slice(0, 500),
      },
      `daljirconnect:${o.id}`,
      null,
      undefined,
      { channel: 'WHATSAPP', externalRef: o.id },
    );
    // The customer was quoted in chat; delivery zones and tax can make Botan's total differ — flag it for the staff.
    if (money(created.total) !== money(o.total)) {
      const order = await db.order.findUniqueOrThrow({
        where: { id: created.id },
        select: { notes: true },
      });
      await db.order.update({
        where: { id: created.id },
        data: {
          notes: `${order.notes ?? ''} · WhatsApp total was $${o.total.toFixed(2)}`.slice(0, 600),
        },
      });
    }
    return { ok: true, orderNumber: created.orderNumber, imported: true };
  } catch (e) {
    // Botan said no (closed, sold out, out of stock, below the minimum): the customer is told in chat.
    if (e instanceof AppError && e.status < 500 && e.status !== 422) {
      await transaction((tx) =>
        queueOrderSync(tx, r.id, o.id, {
          cancelReason: `${REJECTED_REASON} (${e.message})`.slice(0, 480),
        }),
      );
      return { ok: true, rejected: e.message };
    }
    throw e;
  }
}

// ─── Push: Botan → DaljirConnect ───────────────────────────────────────────

/** Brings the DaljirConnect order in line with Botan: POS number, payment, status (never backwards). */
export async function syncOrder(dcOrderId: string, cancelReason?: string) {
  const ref = `id:${encodeURIComponent(dcOrderId)}`;
  const remote = await dc<DcOrder>(`/order/${ref}`);
  const local = await db.order.findUnique({
    where: { externalRef: dcOrderId },
    include: {
      delivery: { include: { rider: { select: { id: true, fullName: true, phone: true } } } },
    },
  });
  if (!local) {
    // Never created here (rejected): cancel it there so the customer is told.
    if (cancelReason && !DC_TERMINAL.includes(remote.status))
      await dc(`/order/${ref}/status`, {
        method: 'POST',
        body: { status: 'CANCELLED', reason: cancelReason },
      });
    return;
  }
  const patch: Record<string, unknown> = {};
  // The rider assigned here: the customer gets the name and phone (riders without a phone can't be sent).
  const rider = local.delivery?.rider;
  if (
    rider?.phone &&
    (remote.driver?.name !== rider.fullName || remote.driver?.phone !== driverPhone(rider.phone))
  )
    patch.driver = { id: rider.id, name: rider.fullName, phone: rider.phone };
  if (remote.externalId !== local.orderNumber) patch.externalId = local.orderNumber;
  const paid =
    local.paymentStatus === 'PAID'
      ? 'paid'
      : ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(local.paymentStatus)
        ? 'refunded'
        : null;
  if (paid && remote.paymentStatus !== paid)
    Object.assign(patch, { paymentStatus: paid, paymentMethod: 'Cash' });
  if (Object.keys(patch).length) await dc(`/order/${ref}`, { method: 'PATCH', body: patch });

  const target = DC_STATUS[local.status];
  if (!target || target === remote.status || DC_TERMINAL.includes(remote.status)) return;
  // A new order in DaljirConnect has to be confirmed before it can move on.
  if (remote.status === 'NEW' && !['CONFIRMED', 'CANCELLED'].includes(target))
    await dc(`/order/${ref}/status`, { method: 'POST', body: { status: 'CONFIRMED' } });
  await dc(`/order/${ref}/status`, {
    method: 'POST',
    body: {
      status: target,
      ...(target === 'CANCELLED'
        ? { reason: local.status === 'REJECTED' ? REJECTED_REASON : undefined }
        : {}),
    },
  });
}

/** DaljirConnect stores phones as +252…: compare the same way so an unchanged rider isn't sent again. */
function driverPhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('252')) return `+${digits}`;
  return `+252${digits.replace(/^0+/, '')}`;
}

/** All riders (id, name, phone); suspended ones and riders without a phone are inactive there. */
export async function pushDrivers(restaurantId: string) {
  const riders = await db.staffUser.findMany({
    where: { restaurantId, role: 'RIDER' },
    select: { id: true, fullName: true, phone: true, status: true },
    orderBy: { fullName: 'asc' },
  });
  const drivers = riders
    .filter((r) => r.phone && /^\+?[\d\s-]{7,20}$/.test(r.phone))
    .slice(0, 500)
    .map((r) => ({
      id: r.id,
      name: r.fullName.slice(0, 80),
      phone: r.phone!.trim(),
      active: r.status === 'ACTIVE',
    }));
  return dc<Record<string, unknown>>('/drivers/sync', {
    method: 'POST',
    body: { drivers, missing: 'inactive' },
  });
}

/** The whole menu, SKU = MenuItem.id. Items in a hidden category are sold out in chat. */
export async function pushMenu(restaurantId: string) {
  const items = await db.menuItem.findMany({
    where: { restaurantId },
    include: {
      category: true,
      modifierGroups: {
        include: { group: { include: { options: { where: { isAvailable: true } } } } },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  if (!items.length) return { received: 0 };
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const image = (src: string | null) => {
    if (!src) return null;
    const abs = src.startsWith('/') ? (base ? base + src : '') : src;
    return /^https?:\/\/.+/.test(abs) && abs.length <= 1000 ? abs : undefined;
  };
  const products = items.slice(0, 2000).map((i) => {
    const options = i.modifierGroups
      .map(({ group }) =>
        group.options.length
          ? `${group.name}: ${group.options.map((o) => (Number(o.priceDelta) ? `${o.name} +$${Number(o.priceDelta).toFixed(2)}` : o.name)).join(', ')}`
          : '',
      )
      .filter(Boolean)
      .join('; ');
    const description = [i.description, options && `Ikhtiyaar — ${options}`]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 500);
    return {
      sku: i.id,
      name: i.name.slice(0, 120),
      price: money(i.basePrice) / 100,
      category: i.category.name.slice(0, 60),
      description: description || null,
      imageUrl: image(i.imageUrl),
      available: i.isAvailable && i.category.isActive,
    };
  });
  return dc<Record<string, unknown>>('/catalog/sync', {
    method: 'POST',
    body: { products, missing: 'unavailable' },
  });
}

/**
 * Sends pending daljir.* events. Each row is leased first (availableAt pushed forward) so two drains running at once
 * don't both send it; failures back off and stop after 8 attempts or at the first permanent error.
 */
export async function drainDaljir(limit = 20) {
  if (!daljirConfig().enabled) return { sent: 0, failed: 0 };
  const now = new Date();
  const rows = await db.outboxEvent.findMany({
    where: {
      topic: { in: [DALJIR_ORDER, DALJIR_MENU, DALJIR_DRIVERS] },
      status: 'PENDING',
      availableAt: { lte: now },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let sent = 0,
    failed = 0,
    menuResult: unknown = null,
    driversResult: unknown = null;
  for (const row of rows) {
    const lease = await db.outboxEvent.updateMany({
      where: { id: row.id, status: 'PENDING', availableAt: row.availableAt },
      data: { availableAt: new Date(Date.now() + 120_000) },
    });
    if (!lease.count) continue;
    const payload = (row.payload ?? {}) as { dcOrderId?: string; cancelReason?: string };
    try {
      if (row.topic === DALJIR_MENU) menuResult ??= await pushMenu(row.restaurantId);
      else if (row.topic === DALJIR_DRIVERS) driversResult ??= await pushDrivers(row.restaurantId);
      else if (payload.dcOrderId) await syncOrder(payload.dcOrderId, payload.cancelReason);
      await db.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: 'SENT',
          processedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          ...(row.topic === DALJIR_MENU && menuResult
            ? { payload: { result: menuResult } as Prisma.InputJsonValue }
            : row.topic === DALJIR_DRIVERS && driversResult
              ? { payload: { result: driversResult } as Prisma.InputJsonValue }
              : {}),
        },
      });
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const final = e instanceof PermanentError || attempts >= 8;
      await db.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: final ? 'FAILED' : 'PENDING',
          attempts,
          lastError: (e as Error).message.slice(0, 300),
          availableAt: new Date(Date.now() + Math.min(2 ** attempts * 15_000, 3_600_000)),
          ...(final ? { processedAt: new Date() } : {}),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}

// ─── Settings page ─────────────────────────────────────────────────────────

export async function integrationStatus(restaurantId: string, origin: string) {
  const cfg = daljirConfig();
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const [items, lastMenu, orders, pending, recent] = await Promise.all([
    db.menuItem.count({ where: { restaurantId } }),
    db.outboxEvent.findFirst({
      where: { restaurantId, topic: DALJIR_MENU, status: 'SENT' },
      orderBy: { processedAt: 'desc' },
    }),
    db.order.count({ where: { restaurantId, channel: 'WHATSAPP', createdAt: { gte: since } } }),
    db.outboxEvent.count({
      where: { restaurantId, topic: { startsWith: 'daljir.' }, status: 'PENDING' },
    }),
    db.outboxEvent.findMany({
      where: { restaurantId, topic: { startsWith: 'daljir.' } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);
  const refs = recent
    .map((e) => (e.payload as { dcOrderId?: string } | null)?.dcOrderId)
    .filter((x): x is string => Boolean(x));
  const numbers = new Map(
    (
      await db.order.findMany({
        where: { externalRef: { in: refs } },
        select: { externalRef: true, orderNumber: true },
      })
    ).map((o) => [o.externalRef!, o.orderNumber]),
  );
  return {
    configured: cfg.enabled,
    webhookSecretSet: Boolean(cfg.webhookSecret),
    connectHost: cfg.url ? new URL(cfg.url).host : null,
    webhookUrl: `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, '')}/api/v1/webhooks/daljirconnect`,
    menu: {
      items,
      lastSyncAt: lastMenu?.processedAt ?? null,
      lastResult: (lastMenu?.payload as { result?: unknown } | null)?.result ?? null,
    },
    whatsappOrders30d: orders,
    pending,
    recent: recent.map((e) => {
      const ref = (e.payload as { dcOrderId?: string } | null)?.dcOrderId;
      return {
        id: e.id,
        kind: e.topic === DALJIR_MENU ? 'menu' : e.topic === DALJIR_DRIVERS ? 'drivers' : 'order',
        orderNumber: ref ? (numbers.get(ref) ?? null) : null,
        status: e.status,
        attempts: e.attempts,
        lastError: e.lastError,
        createdAt: e.createdAt,
        processedAt: e.processedAt,
      };
    }),
  };
}

/** "Sync menu now": the menu and the riders, queued and sent at once, so the result shows on the page. */
export async function syncMenuNow(restaurantId: string) {
  if (!daljirConfig().enabled)
    throw new AppError(409, 'Set DALJIRCONNECT_URL and DALJIRCONNECT_API_KEY first');
  await transaction(async (tx) => {
    await queueMenuSync(tx, restaurantId);
    await queueDriversSync(tx, restaurantId);
  });
  return drainDaljir();
}

/** Schedules a drain after the response (Next.js `after`); a no-op outside a request (tests, scripts). */
export async function scheduleDrain() {
  if (!daljirConfig().enabled) return;
  try {
    const { after } = await import('next/server');
    after(() =>
      drainDaljir().catch((e) => console.error('DaljirConnect drain failed', (e as Error).message)),
    );
  } catch {
    /* outside a request scope */
  }
}
