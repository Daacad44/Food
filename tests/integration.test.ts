import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { assignRider, createOrder, quote, restaurant, transitionOrder } from '../src/lib/orders';
import { completeDelivery, createRider } from '../src/lib/delivery';
import {
  capturePayment,
  refundPayment,
  stockMovement,
  purchase,
  receivePurchase,
  finance,
  processOutbox,
} from '../src/lib/operations';
import { passwordHash, type Actor } from '../src/lib/security';
import { POST, GET, PATCH, DELETE } from '../src/app/api/v1/[...path]/route';
import type { StaffOrderInput } from '../src/lib/domain';
const PASSWORD = 'IntegrationTest!Password26';
let owner: Actor,
  manager: Actor,
  operator: Actor,
  accountant: Actor,
  rider: Actor,
  otherRider: Actor,
  burger: any,
  r: any,
  stock: any;
let ownerCookie = '',
  operatorCookie = '',
  accountantCookie = '',
  riderCookie = '';
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  extra: Record<string, string> = {},
) {
  const request = new Request('http://localhost:3000/api/v1/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const handler =
    method === 'GET' ? GET : method === 'PATCH' ? PATCH : method === 'DELETE' ? DELETE : POST;
  return handler(request, {
    params: Promise.resolve({ path: path.split('?')[0].split('/') }),
  });
}
/** One $7.50 burger, 5% VAT, $1 delivery: $8.88 (7.50 + 0.38 + 1.00). */
const input = (extra: Partial<StaffOrderInput> = {}): StaffOrderInput => ({
  items: [{ menuItemId: burger.id, quantity: 1, modifierOptionIds: [], specialInstructions: '' }],
  customerName: 'Integration Guest',
  customerPhone: '+252610001234',
  deliveryAddress: 'Bakaaro, near the market',
  deliveryFee: 1,
  discountPercent: 0,
  withVat: true,
  paymentMethod: 'CASH',
  paid: false,
  ...extra,
});
const reload = (id: string) =>
  db.order.findUniqueOrThrow({ where: { id }, include: { delivery: true, payments: true } });
async function login(email: string) {
  const res = await call('auth/staff/login', 'POST', { email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  r = await restaurant();
  await db.restaurant.update({ where: { id: r.id }, data: { isAcceptingOrders: true } });
  await db.restaurantSettings.update({ where: { restaurantId: r.id }, data: { taxRate: 5 } });
  burger = await db.menuItem.findUniqueOrThrow({
    where: { restaurantId_slug: { restaurantId: r.id, slug: 'beef-burger' } },
  });
  stock = await db.inventoryItem.findFirstOrThrow({
    where: { restaurantId: r.id, name: 'Burger patties' },
  });
  const hash = await passwordHash(PASSWORD);
  for (const [email, role] of [
    ['test-owner@botan.local', 'OWNER'],
    ['test-manager@botan.local', 'MANAGER'],
    ['test-operator@botan.local', 'OPERATOR'],
    ['test-accountant@botan.local', 'ACCOUNTANT'],
    ['test-rider@botan.local', 'RIDER'],
    ['other-rider@botan.local', 'RIDER'],
  ] as const)
    await db.staffUser.upsert({
      where: { email },
      update: {},
      create: { restaurantId: r.id, email, role, fullName: role, passwordHash: hash },
    });
  const staff = async (email: string): Promise<Actor> => {
    const u = await db.staffUser.findUniqueOrThrow({ where: { email } });
    return { id: u.id, role: u.role, name: u.fullName, kind: 'staff', restaurantId: r.id };
  };
  owner = await staff('test-owner@botan.local');
  manager = await staff('test-manager@botan.local');
  operator = await staff('test-operator@botan.local');
  accountant = await staff('test-accountant@botan.local');
  rider = await staff('test-rider@botan.local');
  otherRider = await staff('other-rider@botan.local');
  ownerCookie = await login('test-owner@botan.local');
  operatorCookie = await login('test-operator@botan.local');
  accountantCookie = await login('test-accountant@botan.local');
  riderCookie = await login('test-rider@botan.local');
});
afterAll(async () => {
  await db.$disconnect();
});

describe('taking a delivery order', () => {
  it('prices on the server: VAT, percentage discount, staff delivery fee', async () => {
    expect((await quote(db, input())).total).toBe(888);
    const q = await quote(db, input({ discountPercent: 10, withVat: false, deliveryFee: 0 }));
    expect([q.subtotal, q.discount, q.tax, q.total]).toEqual([750, 75, 0, 675]);
    const zone = await db.deliveryZone.findFirstOrThrow({ where: { restaurantId: r.id } });
    const zoned = await quote(db, input({ deliveryFee: undefined, zoneId: zone.id }));
    expect(zoned.deliveryFee).toBe(Math.round(Number(zone.deliveryFee) * 100));
    await expect(
      quote(db, input({ items: [{ ...input().items[0], modifierOptionIds: [randomUUID()] }] })),
    ).rejects.toThrow('Invalid modifier');
  });
  it('creates a confirmed, pending order once under concurrent retries', async () => {
    const key = randomUUID(),
      payload = input();
    const [a, b] = await Promise.all([
      createOrder(payload, key, operator),
      createOrder(payload, key, operator),
    ]);
    expect(a.id).toBe(b.id);
    const o = await reload(a.id);
    expect(o.status).toBe('CONFIRMED');
    expect(o.type).toBe('DELIVERY');
    expect(o.delivery?.status).toBe('PENDING');
    expect(o.stockDeducted).toBe(true);
    expect(o.handledById).toBe(operator.id);
    expect(Number(o.total)).toBe(8.88);
  });
  it('rejects idempotency key reuse with a changed payload and stale totals', async () => {
    const key = randomUUID();
    await createOrder(input(), key, operator);
    await expect(createOrder(input({ customerName: 'Changed' }), key, operator)).rejects.toThrow(
      'Idempotency',
    );
    await expect(createOrder(input(), randomUUID(), operator, 1)).rejects.toThrow('Hubi wadarta');
  });
  it('lets only owners, managers and order takers take orders', async () => {
    await createOrder(input(), randomUUID(), manager);
    for (const who of [accountant, rider])
      await expect(createOrder(input(), randomUUID(), who)).rejects.toThrow('oggolaanshaha');
  });
  it('records mobile money: method and payer number, paid or not yet', async () => {
    await expect(
      createOrder(input({ paymentMethod: 'EVC_PLUS' }), randomUUID(), operator),
    ).rejects.toThrow('telefoonka');
    const paid = await createOrder(
      input({ paymentMethod: 'ZAAD', paymentPhone: '+252634000111', paid: true }),
      randomUUID(),
      operator,
    );
    const o = await reload(paid.id);
    expect(o.paymentStatus).toBe('PAID');
    expect(o.payments[0]).toMatchObject({
      method: 'ZAAD',
      providerReference: '+252634000111',
      status: 'PAID',
      provider: 'manual',
    });
  });
  it('deducts stock once and returns it when a manager cancels', async () => {
    const before = Number(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantityOnHand,
    );
    const o = await createOrder(input(), randomUUID(), operator);
    const after = Number(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantityOnHand,
    );
    expect(after).toBe(before - 1);
    await expect(transitionOrder(o.id, 'CANCELLED', operator)).rejects.toThrow('Maamulaha');
    await transitionOrder(o.id, 'CANCELLED', manager);
    expect(
      Number(
        (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantityOnHand,
      ),
    ).toBe(before);
    expect((await reload(o.id)).delivery?.status).toBe('FAILED');
    await expect(transitionOrder(o.id, 'CANCELLED', manager)).rejects.toThrow('Invalid');
  });
  it('rejects an order larger than the stock without changing anything', async () => {
    const count = await db.order.count();
    await expect(
      createOrder(
        input({ items: [{ ...input().items[0], quantity: 100 }] }),
        randomUUID(),
        operator,
      ),
    ).rejects.toThrow('Stock');
    await db.inventoryItem.update({ where: { id: stock.id }, data: { quantityOnHand: 100 } });
    expect(await db.order.count()).toBe(count);
  });
});

describe('riders and delivery', () => {
  it('assigns at order time: the order goes straight out for delivery', async () => {
    const o = await createOrder(input({ riderId: rider.id }), randomUUID(), operator);
    const saved = await reload(o.id);
    expect(saved.status).toBe('OUT_FOR_DELIVERY');
    expect(saved.delivery).toMatchObject({ riderId: rider.id, status: 'ASSIGNED' });
  });
  it('assigns and re-assigns pending orders, audited, and refuses inactive riders', async () => {
    const o = await createOrder(input(), randomUUID(), operator);
    await assignRider(o.id, rider.id, operator);
    await assignRider(o.id, otherRider.id, operator);
    const saved = await reload(o.id);
    expect(saved.status).toBe('OUT_FOR_DELIVERY');
    expect(saved.delivery?.riderId).toBe(otherRider.id);
    expect(
      await db.auditLog.count({
        where: { entityId: saved.delivery!.id, action: 'REASSIGN_RIDER' },
      }),
    ).toBe(1);
    const suspended = await createRider(
      { fullName: 'Suspended Rider', email: `s-${randomUUID()}@botan.local`, password: PASSWORD },
      owner,
    );
    await db.staffUser.update({ where: { id: suspended.id }, data: { status: 'SUSPENDED' } });
    await expect(assignRider(o.id, suspended.id, operator)).rejects.toThrow('Darawalka');
    await expect(assignRider(o.id, operator.id, operator)).rejects.toThrow('Darawalka');
    await expect(assignRider(o.id, rider.id, accountant)).rejects.toThrow('Permission');
  });
  it('lets only managers create riders, always with the rider role', async () => {
    await expect(
      createRider(
        { fullName: 'X', email: `x-${randomUUID()}@botan.local`, password: PASSWORD },
        operator,
      ),
    ).rejects.toThrow('Permission');
    await expect(
      createRider(
        {
          fullName: 'Rider',
          email: `r-${randomUUID()}@botan.local`,
          password: PASSWORD,
          role: 'OWNER',
        },
        owner,
      ),
    ).rejects.toThrow();
  });
  it('lets only the assigned rider complete, with payment confirmation, once', async () => {
    const o = await createOrder(
      input({ paymentMethod: 'EVC_PLUS', paymentPhone: '+252615442493', riderId: rider.id }),
      randomUUID(),
      operator,
    );
    await expect(
      completeDelivery(o.id, { proofNote: 'Delivered', confirmPaymentCollected: true }, otherRider),
    ).rejects.toThrow('access denied');
    await expect(completeDelivery(o.id, { proofNote: 'Delivered' }, rider)).rejects.toThrow(
      'lacagta',
    );
    const body = { proofNote: 'Handed to customer', confirmPaymentCollected: true };
    await Promise.all([completeDelivery(o.id, body, rider), completeDelivery(o.id, body, rider)]);
    const saved = await reload(o.id);
    expect(saved.status).toBe('COMPLETED');
    expect(saved.paymentStatus).toBe('PAID');
    expect(saved.delivery?.status).toBe('DELIVERED');
    expect(saved.payments.filter((p) => p.paidAt)).toHaveLength(1);
    expect(saved.payments[0].method).toBe('EVC_PLUS');
  });
  it('lets an order taker confirm delivery when the rider has no app', async () => {
    const o = await createOrder(input({ paid: true }), randomUUID(), operator);
    await completeDelivery(o.id, { proofNote: 'Rider phoned it in' }, operator);
    expect((await reload(o.id)).status).toBe('COMPLETED');
    await expect(assignRider(o.id, rider.id, operator)).rejects.toThrow('looma qoondeyn');
  });
  it('captures split payments and switches method by hand', async () => {
    const o = await createOrder(input(), randomUUID(), operator),
      p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment(p.id, operator, { amount: 3 });
    expect((await reload(o.id)).paymentStatus).toBe('PENDING');
    const rest = await db.payment.findFirstOrThrow({ where: { orderId: o.id, status: 'PENDING' } });
    expect(Number(rest.amount)).toBe(5.88);
    await expect(capturePayment(rest.id, operator, { method: 'SAHAL' })).rejects.toThrow(
      'telefoonka',
    );
    await capturePayment(rest.id, operator, { method: 'SAHAL', reference: '+252907000000' });
    expect((await reload(o.id)).paymentStatus).toBe('PAID');
    const captured = await db.payment.findUniqueOrThrow({ where: { id: rest.id } });
    expect(captured).toMatchObject({ method: 'SAHAL', providerReference: '+252907000000' });
  });
});

describe('back office', () => {
  it('refunds partially and fully, idempotently', async () => {
    const o = await createOrder(input({ paid: true }), randomUUID(), operator),
      p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    const key = randomUUID();
    const refund = await refundPayment(p.id, { amount: 2, reason: 'Test partial' }, key, owner);
    expect((await refundPayment(p.id, { amount: 2, reason: 'Test partial' }, key, owner)).id).toBe(
      refund.id,
    );
    expect((await reload(o.id)).paymentStatus).toBe('PARTIALLY_REFUNDED');
    await expect(
      refundPayment(p.id, { amount: 7, reason: 'Too much' }, randomUUID(), owner),
    ).rejects.toThrow('exceeds');
    await refundPayment(p.id, { amount: 6.88, reason: 'Remaining' }, randomUUID(), owner);
    expect((await reload(o.id)).paymentStatus).toBe('REFUNDED');
  });
  it('receives a purchase only once and records the stock ledger', async () => {
    const supplier = await db.supplier.create({
        data: { restaurantId: r.id, name: 'Test supplier' },
      }),
      before = await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } }),
      p = await purchase(
        {
          supplierId: supplier.id,
          reference: 'TEST-' + randomUUID(),
          lines: [{ inventoryItemId: stock.id, quantity: 10, unitCost: 2 }],
        },
        owner,
      );
    await receivePurchase(p.id, owner);
    await receivePurchase(p.id, owner);
    expect(
      Number(
        (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantityOnHand,
      ),
    ).toBe(Number(before.quantityOnHand) + 10);
    expect(await db.inventoryMovement.count({ where: { referenceId: p.id } })).toBe(1);
  });
  it('rejects negative inventory', async () =>
    expect(
      stockMovement(
        { inventoryItemId: stock.id, type: 'WASTE', quantityDelta: -10000, notes: 'Test waste' },
        owner,
      ),
    ).rejects.toThrow('negative'));
  it('reconciles finance to captures less refunds, by payment method', async () => {
    const summary = await finance(r.id);
    const p = await db.payment.findMany({
      where: { order: { restaurantId: r.id }, paidAt: { not: null } },
      include: { refunds: true },
    });
    const expected = p.reduce(
      (sum, p) => sum + Number(p.amount) - p.refunds.reduce((s, r) => s + Number(r.amount), 0),
      0,
    );
    expect(summary.netSales).toBeCloseTo(expected, 2);
    expect(summary.byMethod.reduce((s, m) => s + m.amount, 0)).toBeCloseTo(expected, 2);
    expect(summary.byMethod.map((m) => m.method)).toEqual(
      expect.arrayContaining(['ZAAD', 'EVC_PLUS', 'SAHAL', 'CASH']),
    );
  });
  it('delivers durable outbox events once', async () => {
    const first = await processOutbox(),
      second = await processOutbox();
    expect(first.processed).toBeGreaterThan(0);
    expect(second.processed).toBe(0);
  });
});

describe('HTTP: authorization, the orders board and payments', () => {
  it('blocks anonymous access, customers endpoints and cross-origin writes', async () => {
    expect((await call('admin/orders')).status).toBe(401);
    expect((await call('menu/items')).status).toBe(401);
    expect((await call('orders', 'POST', input())).status).toBe(401);
    expect(
      (await call('auth/customer/login', 'POST', { email: 'a@b.so', password: 'x' })).status,
    ).toBe(404);
    expect(
      (await call('orders', 'POST', input(), operatorCookie, { origin: 'https://evil.invalid' }))
        .status,
    ).toBe(403);
  });
  it('signs an order taker in and lands them on order taking', async () => {
    const res = await call('auth/staff/login', 'POST', {
      email: 'test-operator@botan.local',
      password: PASSWORD,
    });
    expect((await res.json()).role).toBe('OPERATOR');
    expect((await call('menu/items', 'GET', undefined, operatorCookie)).status).toBe(200);
  });
  it('takes an order over HTTP with an idempotency key and the reviewed total', async () => {
    const key = randomUUID();
    const res = await call('orders', 'POST', input({ riderId: rider.id }), operatorCookie, {
      'Idempotency-Key': key,
      'X-Expected-Total': '8.88',
    });
    expect(res.status).toBe(201);
    const again = await call('orders', 'POST', input({ riderId: rider.id }), operatorCookie, {
      'Idempotency-Key': key,
      'X-Expected-Total': '8.88',
    });
    expect((await again.json()).id).toBe((await res.json()).id);
    expect(
      (
        await call('orders', 'POST', { ...input(), total: 0 }, operatorCookie, {
          'Idempotency-Key': randomUUID(),
        })
      ).status,
    ).toBe(400);
  });
  it('lists pending / assigned / delivered with counts, by day and by phone', async () => {
    const phone = '+25261' + String(Date.now()).slice(-7);
    const pending = await createOrder(input({ customerPhone: phone }), randomUUID(), operator);
    const assigned = await createOrder(
      input({ customerPhone: phone, riderId: rider.id }),
      randomUUID(),
      operator,
    );
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Mogadishu' }).format(
      new Date(),
    );
    const res = await call(
      `admin/orders?view=pending&from=${day}&to=${day}&q=${encodeURIComponent(phone)}`,
      'GET',
      undefined,
      operatorCookie,
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.orders.map((o: any) => o.id)).toEqual([pending.id]);
    expect(data.counts).toEqual({ pending: 1, assigned: 1, delivered: 0, cancelled: 0 });
    const a = await (
      await call(
        `admin/orders?view=assigned&q=${encodeURIComponent(phone)}`,
        'GET',
        undefined,
        operatorCookie,
      )
    ).json();
    expect(a.orders[0].id).toBe(assigned.id);
    expect(a.orders[0].delivery.rider.fullName).toBe('RIDER');
    expect((await call('admin/orders?view=nope', 'GET', undefined, operatorCookie)).status).toBe(
      400,
    );
  });
  it('assigns over HTTP and lets accountants read but not change orders', async () => {
    const o = await createOrder(input(), randomUUID(), operator);
    expect(
      (await call(`admin/orders/${o.id}/assign`, 'POST', { riderId: rider.id }, accountantCookie))
        .status,
    ).toBe(403);
    expect(
      (await call(`admin/orders/${o.id}/assign`, 'POST', { riderId: rider.id }, operatorCookie))
        .status,
    ).toBe(200);
    expect((await call(`admin/orders/${o.id}`, 'GET', undefined, accountantCookie)).status).toBe(
      200,
    );
    expect(
      (await call(`admin/orders/${o.id}/status`, 'PATCH', { status: 'CANCELLED' }, operatorCookie))
        .status,
    ).toBe(403);
  });
  it('shows a rider only their own orders', async () => {
    const res = await call('rider/orders', 'GET', undefined, riderCookie),
      rows = await res.json();
    expect(res.status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((o: any) => o.delivery.riderId === rider.id)).toBe(true);
    expect((await call('admin/orders', 'GET', undefined, riderCookie)).status).toBe(403);
  });
  it('fills in a returning customer from their last order', async () => {
    const phone = '+25261' + String(Date.now() + 7).slice(-7);
    await createOrder(
      input({ customerPhone: phone, deliveryAddress: 'Hodan, KM4' }),
      randomUUID(),
      operator,
    );
    const found = await (
      await call(
        'customers/lookup?phone=' + encodeURIComponent(phone),
        'GET',
        undefined,
        operatorCookie,
      )
    ).json();
    expect(found).toMatchObject({ deliveryAddress: 'Hodan, KM4', orderCount: 1 });
  });
  it('fails closed for mobile-money automation until a provider is configured', async () => {
    const o = await createOrder(
      input({ paymentMethod: 'EVC_PLUS', paymentPhone: '+252615000000' }),
      randomUUID(),
      operator,
    );
    const p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    expect((await call(`payments/${p.id}/initialize`, 'POST', {}, operatorCookie)).status).toBe(
      501,
    );
    expect((await call('webhooks/payments/evc_plus', 'POST', { status: 'PAID' })).status).toBe(501);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PENDING');
    expect((await call('payments/' + p.id + '/capture', 'POST', {})).status).toBe(401);
  });
  it('keeps password hashes out of lists and only offers the new roles', async () => {
    const rows = await (await call('admin/users', 'GET', undefined, ownerCookie)).json();
    expect(rows[0]).not.toHaveProperty('passwordHash');
    const bad = await call(
      'admin/users',
      'POST',
      {
        fullName: 'Chef',
        email: `c-${randomUUID()}@botan.local`,
        role: 'CHEF',
        password: PASSWORD,
      },
      ownerCookie,
    );
    expect(bad.status).toBe(400);
  });
  it('requires a valid session and invalidates it on logout', async () => {
    const cookie = await login('test-operator@botan.local');
    expect((await call('auth/me', 'GET', undefined, cookie)).status).toBe(200);
    await call('auth/logout', 'POST', {}, cookie);
    expect((await call('admin/orders', 'GET', undefined, cookie)).status).toBe(401);
  });
  it('preserves omitted fields when editing a disabled menu item', async () => {
    await db.menuItem.update({ where: { id: burger.id }, data: { isAvailable: false } });
    const response = await call(
      'admin/resources/menu/' + burger.id,
      'PATCH',
      { description: 'A careful partial update' },
      ownerCookie,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).isAvailable).toBe(false);
    await db.menuItem.update({ where: { id: burger.id }, data: { isAvailable: true } });
  });
});
