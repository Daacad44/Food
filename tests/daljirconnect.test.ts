import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { restaurant, transitionOrder } from '../src/lib/orders';
import { capturePayment, processOutbox } from '../src/lib/operations';
import { saveResource } from '../src/lib/resources';
import { drainDaljir } from '../src/lib/daljirconnect';
import { passwordHash, type Actor } from '../src/lib/security';
import { POST, GET } from '../src/app/api/v1/[...path]/route';

const SECRET = 'whsec-test-0123456789';
process.env.DALJIRCONNECT_URL = 'https://connect.test';
process.env.DALJIRCONNECT_API_KEY = 'dc_live_test';
process.env.DALJIRCONNECT_WEBHOOK_SECRET = SECRET;
process.env.NEXT_PUBLIC_APP_URL = 'https://food.daljir.tech';

/** A fake DaljirConnect /v2: orders by id, with the same status rules (NEW must be confirmed first). */
type DcOrder = {
  id: string;
  status: string;
  paymentStatus: string;
  externalId: string | null;
  driver?: { name: string; phone: string } | null;
};
let driverSyncs: any[] = [];
const e164 = (p: string) => {
  const d = p.replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : d.startsWith('252') ? `+${d}` : `+252${d.replace(/^0+/, '')}`;
};
const dcOrders = new Map<string, DcOrder>();
const calls: { method: string; path: string; body: any }[] = [];
let menuSyncs: any[] = [];
let failNext: 'network' | 404 | null = null;
const NEXT: Record<string, string[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  PREPARING: ['READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
  const url = new URL(input);
  expect(url.origin).toBe('https://connect.test');
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer dc_live_test');
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  const path = decodeURIComponent(url.pathname.replace('/v2', ''));
  calls.push({ method, path, body });
  if (failNext === 'network') {
    failNext = null;
    throw new Error('connect ECONNREFUSED');
  }
  if (failNext === 404) {
    failNext = null;
    return reply(404, { error: { code: 'NOT_FOUND', message: 'Order not found' } });
  }
  if (path === '/drivers/sync') {
    driverSyncs.push(body);
    return reply(200, { data: { received: body.drivers.length } });
  }
  if (path === '/catalog/sync') {
    menuSyncs.push(body);
    return reply(200, { data: { received: body.products.length } });
  }
  const m = /^\/order\/id:([^/]+)(\/status)?$/.exec(path);
  const o = m && dcOrders.get(m[1]);
  if (!o) return reply(404, { error: { code: 'NOT_FOUND', message: 'Order not found' } });
  if (method === 'GET') return reply(200, { data: o });
  if (method === 'PATCH') {
    Object.assign(
      o,
      body.externalId !== undefined ? { externalId: body.externalId } : {},
      body.paymentStatus ? { paymentStatus: body.paymentStatus } : {},
      body.driver ? { driver: { name: body.driver.name, phone: e164(body.driver.phone) } } : {},
    );
    return reply(200, { data: o });
  }
  if (!NEXT[o.status]?.includes(body.status))
    return reply(400, {
      error: { code: 'VALIDATION_ERROR', message: `cannot go ${o.status} → ${body.status}` },
    });
  o.status = body.status;
  return reply(200, { data: o });
});

let r: any, owner: Actor, menuItem: any, otherItem: any;

function dcOrder(over: Record<string, unknown> = {}) {
  const id = `dc_${randomUUID().slice(0, 8)}`;
  const order = {
    id,
    number: 41,
    type: 'delivery',
    status: 'NEW',
    needsPricing: false,
    total: 27,
    paymentStatus: 'unpaid',
    externalId: null,
    contact: { name: 'Amina Cali', phone: '+252615000001' },
    items: [{ sku: menuItem.id, name: menuItem.name, quantity: 2, notes: 'basbaas badan' }],
    address: 'Hodan, Taleex, agagaarka KM4',
    tableNumber: null,
    notes: null,
    ...over,
  };
  dcOrders.set(id, { id, status: String(order.status), paymentStatus: 'unpaid', externalId: null });
  return order;
}

async function webhook(payload: unknown, signature?: string) {
  const raw = JSON.stringify(payload);
  const sig = signature ?? `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
  const res = await POST(
    new Request('http://localhost:3000/api/v1/webhooks/daljirconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DaljirConnect-Signature': sig },
      body: raw,
    }),
    { params: Promise.resolve({ path: ['webhooks', 'daljirconnect'] }) },
  );
  return { status: res.status, body: await res.json() };
}
const send = (order: unknown, event = 'order.created') =>
  webhook({ id: 'evt_1', event, data: { order } });

beforeAll(async () => {
  r = await restaurant();
  await db.restaurant.update({ where: { id: r.id }, data: { isAcceptingOrders: true } });
  menuItem = await db.menuItem.findUniqueOrThrow({
    where: { restaurantId_slug: { restaurantId: r.id, slug: 'beef-burger' } },
  });
  otherItem = await db.menuItem.findFirstOrThrow({
    where: { restaurantId: r.id, id: { not: menuItem.id } },
  });
  const u = await db.staffUser.upsert({
    where: { email: 'dc-owner@botan.local' },
    update: {},
    create: {
      restaurantId: r.id,
      email: 'dc-owner@botan.local',
      role: 'OWNER',
      fullName: 'Owner',
      passwordHash: await passwordHash('DaljirConnect!Test26'),
    },
  });
  owner = { id: u.id, role: 'OWNER', name: u.fullName, kind: 'staff', restaurantId: r.id };
});
beforeEach(async () => {
  calls.length = 0;
  menuSyncs = [];
  driverSyncs = [];
  failNext = null;
  await db.outboxEvent.updateMany({
    where: { topic: { startsWith: 'daljir.' }, status: 'PENDING' },
    data: { status: 'SENT' },
  });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
});

describe('DaljirConnect (WhatsApp ordering)', () => {
  it('rejects unsigned webhooks and answers the Test ping', async () => {
    expect((await webhook({ event: 'ping' }, 'sha256=bad')).status).toBe(401);
    expect(await webhook({ event: 'ping', data: {} })).toMatchObject({
      status: 200,
      body: { ok: true, event: 'ping' },
    });
  });

  it('imports a WhatsApp order for the staff to approve, once; the zone comes from the address; the number goes back', async () => {
    const o = dcOrder();
    const first = await send(o);
    expect(first.body).toMatchObject({ ok: true, imported: true });
    const again = await send(o, 'order.updated');
    expect(again.body.orderNumber).toBe(first.body.orderNumber);
    const order = await db.order.findUniqueOrThrow({
      where: { externalRef: o.id },
      include: { items: true, zone: true },
    });
    expect(order).toMatchObject({
      status: 'PENDING_APPROVAL',
      channel: 'WHATSAPP',
      guestName: 'Amina Cali',
      guestPhone: '+252615000001',
      type: 'DELIVERY',
    });
    expect(order.zone?.name).toBe('Hodan');
    expect(order.items[0]).toMatchObject({
      menuItemId: menuItem.id,
      quantity: 2,
      specialInstructions: 'basbaas badan',
    });
    // 2 × burger + Hodan fee ≠ the 27 the chat quoted: flagged for the staff.
    expect(order.notes).toContain('WhatsApp #41');
    expect(order.notes).toContain('WhatsApp total was $27.00');

    await drainDaljir();
    expect(dcOrders.get(o.id)!.externalId).toBe(order.orderNumber);
  });

  it('every step in Botan reaches the customer: confirm, kitchen, payment, completion', async () => {
    const o = dcOrder({ type: 'pickup', address: null });
    await send(o);
    const order = await db.order.findUniqueOrThrow({
      where: { externalRef: o.id },
      include: { payments: true },
    });
    await transitionOrder(order.id, 'CONFIRMED', owner);
    await transitionOrder(order.id, 'PREPARING', owner);
    await drainDaljir();
    expect(dcOrders.get(o.id)!.status).toBe('PREPARING');
    // Sent as the current state: CONFIRMED was pushed once even though two events were queued.
    expect(calls.filter((c) => c.path.endsWith('/status')).map((c) => c.body.status)).toEqual([
      'CONFIRMED',
      'PREPARING',
    ]);

    await transitionOrder(order.id, 'READY', owner);
    await capturePayment(order.payments[0].id, owner);
    await transitionOrder(order.id, 'COMPLETED', owner);
    await drainDaljir();
    expect(dcOrders.get(o.id)).toMatchObject({ status: 'DELIVERED', paymentStatus: 'paid' });
  });

  it('a new DaljirConnect order is confirmed before it moves on', async () => {
    const o = dcOrder({ type: 'pickup', address: null });
    await send(o);
    const order = await db.order.findUniqueOrThrow({ where: { externalRef: o.id } });
    await transitionOrder(order.id, 'CONFIRMED', owner);
    await transitionOrder(order.id, 'PREPARING', owner);
    await db.outboxEvent.updateMany({
      where: { topic: 'daljir.order', status: 'PENDING' },
      data: { status: 'SENT' },
    });
    // Only the last event is left: the drain still goes NEW → CONFIRMED → PREPARING.
    await db.outboxEvent.create({
      data: { restaurantId: r.id, topic: 'daljir.order', payload: { dcOrderId: o.id } },
    });
    await drainDaljir();
    expect(dcOrders.get(o.id)!.status).toBe('PREPARING');
  });

  it('when Botan cannot take it (closed), the chat order is cancelled with a reason; unmapped items wait for staff', async () => {
    await db.restaurant.update({ where: { id: r.id }, data: { isAcceptingOrders: false } });
    const closed = dcOrder();
    const res = await send(closed);
    await db.restaurant.update({ where: { id: r.id }, data: { isAcceptingOrders: true } });
    expect(res.body.rejected).toBeTruthy();
    expect(await db.order.count({ where: { externalRef: closed.id } })).toBe(0);
    await drainDaljir();
    expect(dcOrders.get(closed.id)!.status).toBe('CANCELLED');
    expect(calls.find((c) => c.path.endsWith('/status'))!.body.reason).toMatch(/Maqaayadda/);

    expect((await send(dcOrder({ needsPricing: true }))).body.ignored).toBe('needs pricing');
    const offMenu = await send(
      dcOrder({ items: [{ sku: null, name: 'Basbaas dheeri ah', quantity: 1 }] }),
    );
    expect(offMenu.status).toBe(422);
    expect(offMenu.body.error).toMatch(/not linked/);
  });

  it('a cancellation in chat cancels the Botan order', async () => {
    const o = dcOrder({ type: 'pickup', address: null });
    await send(o);
    const res = await send({ ...o, status: 'CANCELLED' }, 'order.updated');
    expect(res.body.cancelled).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { externalRef: o.id } })).status).toBe(
      'CANCELLED',
    );
  });

  it('menu changes sync to DaljirConnect by SKU, with absolute photos and hidden categories as sold out', async () => {
    await saveResource('menu', { isAvailable: false }, owner, otherItem.id);
    // The in-app notification drain leaves DaljirConnect pushes alone.
    await processOutbox();
    expect(await db.outboxEvent.count({ where: { topic: 'daljir.menu', status: 'PENDING' } })).toBe(
      1,
    );
    await drainDaljir();
    const products = menuSyncs[0].products as any[];
    expect(menuSyncs[0].missing).toBe('unavailable');
    expect(products.find((p) => p.sku === otherItem.id).available).toBe(false);
    const burger = products.find((p) => p.sku === menuItem.id);
    expect(burger).toMatchObject({
      name: menuItem.name,
      price: Number(menuItem.basePrice),
      available: true,
    });
    if (menuItem.imageUrl?.startsWith('/'))
      expect(burger.imageUrl).toBe(`https://food.daljir.tech${menuItem.imageUrl}`);
    await saveResource('menu', { isAvailable: true }, owner, otherItem.id);
  });

  it('retries network failures with backoff and stops on a permanent error; the settings page shows it', async () => {
    const o = dcOrder({ type: 'pickup', address: null });
    await send(o);
    failNext = 'network';
    expect(await drainDaljir()).toMatchObject({ failed: 1 });
    const ev = await db.outboxEvent.findFirstOrThrow({
      where: { topic: 'daljir.order', payload: { path: ['dcOrderId'], equals: o.id } },
      orderBy: { createdAt: 'desc' },
    });
    expect(ev).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(ev.lastError).toMatch(/unreachable/);

    await db.outboxEvent.update({ where: { id: ev.id }, data: { availableAt: new Date() } });
    failNext = 404;
    await drainDaljir();
    expect(await db.outboxEvent.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({
      status: 'FAILED',
    });

    const login = await POST(
      new Request('http://localhost:3000/api/v1/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dc-owner@botan.local', password: 'DaljirConnect!Test26' }),
      }),
      { params: Promise.resolve({ path: ['auth', 'staff', 'login'] }) },
    );
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const res = await GET(
      new Request('http://localhost:3000/api/v1/admin/integrations/daljirconnect', {
        headers: { cookie },
      }),
      { params: Promise.resolve({ path: ['admin', 'integrations', 'daljirconnect'] }) },
    );
    const status = await res.json();
    expect(status).toMatchObject({
      configured: true,
      webhookSecretSet: true,
      connectHost: 'connect.test',
      webhookUrl: 'https://food.daljir.tech/api/v1/webhooks/daljirconnect',
    });
    expect(status.whatsappOrders30d).toBeGreaterThan(0);
    expect(status.recent.some((e: any) => e.status === 'FAILED' && /404/.test(e.lastError))).toBe(
      true,
    );
  });

  it('an order for someone else: they are the guest, the notes say who ordered and pays', async () => {
    const o = dcOrder({
      number: 52,
      recipient: { name: 'Hooyo Faadumo', phone: '+252617778888', whatsapp: true },
    });
    expect((await send(o)).body).toMatchObject({ imported: true });
    const order = await db.order.findUniqueOrThrow({ where: { externalRef: o.id } });
    expect(order).toMatchObject({ guestName: 'Hooyo Faadumo', guestPhone: '+252617778888' });
    expect(order.notes).toContain(
      '🎁 Loo dalbay Hooyo Faadumo — waxaa dalbaday oo bixinaya Amina Cali (+252615000001)',
    );
  });

  it('riders sync like the menu; assigning one sends the customer the name and phone, once', async () => {
    const login = await POST(
      new Request('http://localhost:3000/api/v1/auth/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dc-owner@botan.local', password: 'DaljirConnect!Test26' }),
      }),
      { params: Promise.resolve({ path: ['auth', 'staff', 'login'] }) },
    );
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const rider = await saveResource(
      'staff',
      {
        fullName: 'Cali Axmed',
        email: `rider-${randomUUID().slice(0, 6)}@botan.local`,
        phone: '0615551234',
        role: 'RIDER',
        password: 'Rider!Password26',
      },
      owner,
    );
    await drainDaljir();
    expect(driverSyncs.at(-1).missing).toBe('inactive');
    expect(driverSyncs.at(-1).drivers).toContainEqual({
      id: rider.id,
      name: 'Cali Axmed',
      phone: '0615551234',
      active: true,
    });

    const o = dcOrder({ number: 53 });
    await send(o);
    const order = await db.order.findUniqueOrThrow({
      where: { externalRef: o.id },
      include: { delivery: true },
    });
    await transitionOrder(order.id, 'CONFIRMED', owner);
    await drainDaljir();
    calls.length = 0;
    const assign = () =>
      POST(
        new Request(`http://localhost:3000/api/v1/admin/deliveries/${order.delivery!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ riderId: rider.id }),
        }),
        { params: Promise.resolve({ path: ['admin', 'deliveries', order.delivery!.id] }) },
      );
    expect((await assign()).status).toBe(200);
    await drainDaljir();
    expect(dcOrders.get(o.id)!.driver).toEqual({ name: 'Cali Axmed', phone: '+252615551234' });
    const patches = () => calls.filter((c) => c.method === 'PATCH' && c.body.driver);
    expect(patches()).toHaveLength(1);
    // The same rider again: nothing new is sent.
    await assign();
    await drainDaljir();
    expect(patches()).toHaveLength(1);
  });
});
