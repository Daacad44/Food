import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { createOrder, quote, restaurant, transitionOrder } from '../src/lib/orders';
import {
  capturePayment,
  refundPayment,
  stockMovement,
  purchase,
  receivePurchase,
  finance,
  processOutbox,
  openShift,
  closeShift,
} from '../src/lib/operations';
import { createSession, passwordHash, type Actor } from '../src/lib/security';
import { POST, GET, PATCH, DELETE } from '../src/app/api/v1/[...path]/route';
import type { CheckoutInput } from '../src/lib/domain';
let owner: Actor,
  chef: Actor,
  rider: Actor,
  otherRider: Actor,
  cashier: Actor,
  burger: any,
  r: any,
  stock: any;
let ownerCookie = '',
  chefCookie = '',
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
  return handler(request, { params: Promise.resolve({ path: path.split('/') }) });
}
const input = (): CheckoutInput => ({
  items: [{ menuItemId: burger.id, quantity: 1, modifierOptionIds: [], specialInstructions: '' }],
  type: 'PICKUP',
  guestName: 'Integration Guest',
  guestPhone: '+252610001234',
});
async function login(email: string, password: string) {
  const res = await call('auth/staff/login', 'POST', { email, password });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  r = await restaurant();
  await db.restaurant.update({ where: { id: r.id }, data: { isAcceptingOrders: true } });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++)
    await db.openingHour.updateMany({
      where: { restaurantId: r.id, dayOfWeek },
      data: { opensAt: '00:00', closesAt: '23:59', isClosed: false },
    });
  burger = await db.menuItem.findUniqueOrThrow({
    where: { restaurantId_slug: { restaurantId: r.id, slug: 'beef-burger' } },
  });
  stock = await db.inventoryItem.findFirstOrThrow({
    where: { restaurantId: r.id, name: 'Burger patties' },
  });
  const password = 'IntegrationTest!Password26';
  for (const [email, role] of [
    ['test-owner@botan.local', 'OWNER'],
    ['test-chef@botan.local', 'CHEF'],
    ['test-rider@botan.local', 'RIDER'],
    ['other-rider@botan.local', 'RIDER'],
    ['test-cashier@botan.local', 'CASHIER'],
  ] as const) {
    await db.staffUser.upsert({
      where: { email },
      update: {},
      create: {
        restaurantId: r.id,
        email,
        role,
        fullName: role,
        passwordHash: await passwordHash(password),
      },
    });
  }
  async function staff(email: string): Promise<Actor> {
    const u = await db.staffUser.findUniqueOrThrow({ where: { email } });
    return { id: u.id, role: u.role, name: u.fullName, kind: 'staff', restaurantId: r.id };
  }
  owner = await staff('test-owner@botan.local');
  chef = await staff('test-chef@botan.local');
  rider = await staff('test-rider@botan.local');
  otherRider = await staff('other-rider@botan.local');
  cashier = await staff('test-cashier@botan.local');
  ownerCookie = await login('test-owner@botan.local', password);
  chefCookie = await login('test-chef@botan.local', password);
  riderCookie = await login('test-rider@botan.local', password);
});
afterAll(async () => {
  await db.$disconnect();
});
describe('real PostgreSQL ordering and accounting', () => {
  it('quotes authoritative prices and rejects a forged modifier', async () => {
    const q = await quote(db, input());
    expect(q.total).toBe(750);
    await expect(
      quote(db, {
        ...input(),
        items: [{ ...input().items[0], modifierOptionIds: [randomUUID()] }],
      }),
    ).rejects.toThrow('Invalid modifier');
  });
  it('creates one order under concurrent retries and hides customer details in tracking', async () => {
    const key = randomUUID(),
      payload = input();
    const results = await Promise.all([
      createOrder(payload, key, null),
      createOrder(payload, key, null),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await db.order.count({ where: { id: results[0].id } })).toBe(1);
    const res = await call('orders/track/' + results[0].token);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe('7.5');
    expect(data).not.toHaveProperty('guestPhone');
    expect(data).not.toHaveProperty('deliveryAddress');
    expect(data).not.toHaveProperty('trackingTokenHash');
  });
  it('rejects idempotency key reuse with a changed payload', async () => {
    const key = randomUUID();
    await createOrder(input(), key, null);
    await expect(createOrder({ ...input(), guestName: 'Someone else' }, key, null)).rejects.toThrow(
      'Idempotency',
    );
  });
  it('deducts inventory once, rejects duplicate confirmation and restores stock on cancel', async () => {
    const before = await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } }),
      o = await createOrder(input(), randomUUID(), null);
    await transitionOrder(o.id, 'CONFIRMED', owner);
    expect(
      Number(
        (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantityOnHand,
      ),
    ).toBe(Number(before.quantityOnHand) - 1);
    await expect(transitionOrder(o.id, 'CONFIRMED', owner)).rejects.toThrow();
    await transitionOrder(o.id, 'CANCELLED', owner);
    expect(
      Number(
        (await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).quantityOnHand,
      ),
    ).toBe(Number(before.quantityOnHand));
    expect(await db.inventoryMovement.count({ where: { referenceId: o.id } })).toBe(2);
  });
  it('rejects insufficient stock without partially confirming an order', async () => {
    const o = await createOrder(input(), randomUUID(), null),
      before = await db.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } });
    await db.inventoryItem.update({ where: { id: stock.id }, data: { quantityOnHand: 0 } });
    await expect(transitionOrder(o.id, 'CONFIRMED', owner)).rejects.toThrow('Insufficient');
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
    await db.inventoryItem.update({
      where: { id: stock.id },
      data: { quantityOnHand: before.quantityOnHand },
    });
  });
  it('handles kitchen preparation, cash capture, completion, partial and full refunds', async () => {
    const o = await createOrder(input(), randomUUID(), null);
    await transitionOrder(o.id, 'CONFIRMED', owner);
    await transitionOrder(o.id, 'PREPARING', chef);
    await transitionOrder(o.id, 'READY', chef);
    await expect(transitionOrder(o.id, 'COMPLETED', owner)).rejects.toThrow('Collect payment');
    const p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment(p.id, owner);
    await capturePayment(p.id, owner);
    await transitionOrder(o.id, 'COMPLETED', owner);
    const key = randomUUID();
    const refund = await refundPayment(p.id, { amount: 2, reason: 'Test partial' }, key, owner);
    expect((await refundPayment(p.id, { amount: 2, reason: 'Test partial' }, key, owner)).id).toBe(
      refund.id,
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe(
      'PARTIALLY_REFUNDED',
    );
    await expect(
      refundPayment(p.id, { amount: 6, reason: 'Too much' }, randomUUID(), owner),
    ).rejects.toThrow('exceeds');
    await refundPayment(p.id, { amount: 5.5, reason: 'Remaining cash' }, randomUUID(), owner);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe(
      'REFUNDED',
    );
  });
  it('restricts kitchen transitions and rider ownership', async () => {
    const zone = await db.deliveryZone.findFirstOrThrow({ where: { restaurantId: r.id } }),
      o = await createOrder(
        {
          ...input(),
          type: 'DELIVERY',
          zoneId: zone.id,
          deliveryAddress: 'Mogadishu test address',
        },
        randomUUID(),
        null,
      );
    await expect(transitionOrder(o.id, 'CONFIRMED', chef)).rejects.toThrow('Kitchen');
    await transitionOrder(o.id, 'CONFIRMED', owner);
    await transitionOrder(o.id, 'PREPARING', chef);
    await transitionOrder(o.id, 'READY', chef);
    await db.delivery.update({
      where: { orderId: o.id },
      data: { riderId: rider.id, status: 'ASSIGNED' },
    });
    await expect(transitionOrder(o.id, 'OUT_FOR_DELIVERY', otherRider)).rejects.toThrow('denied');
    await transitionOrder(o.id, 'OUT_FOR_DELIVERY', rider);
    const p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment(p.id, rider);
    await transitionOrder(o.id, 'COMPLETED', rider, 'Handed directly to customer');
    expect((await db.delivery.findUniqueOrThrow({ where: { orderId: o.id } })).status).toBe(
      'DELIVERED',
    );
  });
  it('caps coupons and restores usage after cancellation', async () => {
    const before = await db.coupon.findUniqueOrThrow({
      where: { restaurantId_code: { restaurantId: r.id, code: 'BOTAN10' } },
    });
    const payload = {
      ...input(),
      items: [{ ...input().items[0], quantity: 2 }],
      couponCode: 'BOTAN10',
    };
    const q = await quote(db, payload);
    expect(q.discount).toBe(150);
    const o = await createOrder(payload, randomUUID(), null);
    await transitionOrder(o.id, 'REJECTED', owner);
    expect((await db.coupon.findUniqueOrThrow({ where: { id: before.id } })).usedCount).toBe(
      before.usedCount,
    );
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
  it('rejects negative inventory and closes shifts against cash captures', async () => {
    await expect(
      stockMovement(
        { inventoryItemId: stock.id, type: 'WASTE', quantityDelta: -10000, notes: 'Test waste' },
        owner,
      ),
    ).rejects.toThrow('negative');
    const shift = await openShift({ openingCash: 20 }, cashier);
    await expect(openShift({ openingCash: 0 }, cashier)).rejects.toThrow();
    const o = await createOrder(input(), randomUUID(), null),
      p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment(p.id, cashier);
    const closed = await closeShift(shift.id, { actualClosingCash: 27.5 }, cashier);
    expect(Number(closed.expectedCash)).toBe(27.5);
  });
  it('reconciles finance to captures less refunds', async () => {
    const summary = await finance(r.id);
    const p = await db.payment.findMany({
      where: { order: { restaurantId: r.id }, paidAt: { not: null } },
      include: { refunds: true },
    });
    const expected = p.reduce(
      (sum, p) => sum + Number(p.amount) - p.refunds.reduce((s, r) => s + Number(r.amount), 0),
      0,
    );
    expect(summary.netSales).toBe(expected);
    expect(summary.days.reduce((s, d) => s + d.amount, 0)).toBe(expected);
  });
  it('supports split cash tenders without prematurely marking the order paid', async () => {
    const o = await createOrder(input(), randomUUID(), null),
      p = await db.payment.findFirstOrThrow({ where: { orderId: o.id } });
    await capturePayment(p.id, owner, 3);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe(
      'PENDING',
    );
    const remaining = await db.payment.findFirstOrThrow({
      where: { orderId: o.id, status: 'PENDING' },
    });
    expect(Number(remaining.amount)).toBe(4.5);
    await capturePayment(remaining.id, owner);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PAID');
    await refundPayment(p.id, { amount: 3, reason: 'Split tender refund' }, randomUUID(), owner);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe(
      'PARTIALLY_REFUNDED',
    );
  });
  it('rejects a changed reviewed price and non-cashier staff ordering', async () => {
    await expect(createOrder(input(), randomUUID(), null, 1)).rejects.toThrow('pricing changed');
    await expect(createOrder(input(), randomUUID(), chef)).rejects.toThrow('Only cashiers');
  });
  it('delivers durable outbox events once', async () => {
    const first = await processOutbox(),
      count = await db.notification.count(),
      second = await processOutbox();
    expect(first.processed).toBeGreaterThan(0);
    expect(second.processed).toBe(0);
    expect(await db.notification.count()).toBe(count);
  });
});
describe('HTTP authorization, validation and sessions', () => {
  it('blocks anonymous administration and cross-origin writes', async () => {
    expect((await call('admin/orders')).status).toBe(401);
    expect(
      (await call('orders', 'POST', input(), '', { origin: 'https://evil.invalid' })).status,
    ).toBe(403);
  });
  it('denies kitchen finance access and redacts kitchen customer information', async () => {
    expect((await call('admin/summary', 'GET', undefined, chefCookie)).status).toBe(403);
    const result = await call('kitchen/orders', 'GET', undefined, chefCookie),
      rows = await result.json();
    expect(result.status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).not.toHaveProperty('guestPhone');
    expect(rows[0]).not.toHaveProperty('payments');
  });
  it('shows a rider only assigned orders', async () => {
    const result = await call('rider/orders', 'GET', undefined, riderCookie),
      rows = await result.json();
    expect(result.status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((o: any) => o.delivery.riderId === rider.id)).toBe(true);
  });
  it('rejects price tampering and unauthenticated payment capture', async () => {
    expect(
      (
        await call('orders', 'POST', { ...input(), total: 0 }, '', {
          'Idempotency-Key': randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect((await call('payments/' + randomUUID() + '/capture', 'POST', {})).status).toBe(401);
  });
  it('refuses unconfigured provider callbacks rather than accepting unsigned payments', async () =>
    expect((await call('webhooks/payments/evc', 'POST', {})).status).toBe(503));
  it('keeps staff password hashes out of manager list responses', async () => {
    const result = await call('admin/resources/staff', 'GET', undefined, ownerCookie),
      rows = await result.json();
    expect(result.status).toBe(200);
    expect(rows[0]).not.toHaveProperty('passwordHash');
  });
  it('requires a valid session and invalidates it on logout', async () => {
    const cookie = await login('test-chef@botan.local', 'IntegrationTest!Password26');
    expect((await call('auth/me', 'GET', undefined, cookie)).status).toBe(200);
    await call('auth/logout', 'POST', {}, cookie);
    expect((await call('kitchen/orders', 'GET', undefined, cookie)).status).toBe(401);
  });
  it('protects customer order and address ownership', async () => {
    const phone = '+252' + Date.now().toString().slice(-9);
    const response = await call('auth/customer/register', 'POST', {
      fullName: 'Test customer',
      phone,
      email: randomUUID() + '@example.test',
      password: 'CustomerPassword!2026',
    });
    expect(response.status).toBe(201);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const orders = await (await call('customers/me/orders', 'GET', undefined, cookie)).json();
    expect(orders).toEqual([]);
    const other = await db.customer.create({
      data: {
        restaurantId: r.id,
        fullName: 'Other customer',
        phone: '+252' + randomUUID().slice(0, 8),
      },
    });
    const foreign = await db.customerAddress.create({
      data: {
        customerId: other.id,
        district: 'Hodan',
        description: 'Private address of another customer',
      },
    });
    const deleted = await call('customers/me/addresses/' + foreign.id, 'DELETE', {}, cookie);
    expect(deleted.status).toBe(404);
    expect(await db.customerAddress.findUnique({ where: { id: foreign.id } })).not.toBeNull();
  });
  it('enforces rating and money constraints at the database layer', async () => {
    await expect(
      db.inventoryItem.update({ where: { id: stock.id }, data: { quantityOnHand: -1 } }),
    ).rejects.toThrow();
  });
  it('accepts dine-in only with a valid table QR token', async () => {
    await expect(createOrder({ ...input(), type: 'DINE_IN' }, randomUUID(), null)).rejects.toThrow(
      'QR',
    );
    const table = await db.diningTable.findFirstOrThrow({ where: { restaurantId: r.id } });
    const order = await createOrder(
      { ...input(), type: 'DINE_IN', tableToken: table.qrToken },
      randomUUID(),
      null,
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).tableId).toBe(table.id);
    expect((await db.diningTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe(
      'OCCUPIED',
    );
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
  it('tracks delivery milestones without exposing rider identity, address or proof notes', async () => {
    const zone = await db.deliveryZone.findFirstOrThrow({ where: { restaurantId: r.id } });
    const o = await createOrder(
      {
        ...input(),
        type: 'DELIVERY',
        zoneId: zone.id,
        deliveryAddress: 'Private delivery address',
      },
      randomUUID(),
      null,
    );
    await db.delivery.update({
      where: { orderId: o.id },
      data: {
        riderId: rider.id,
        status: 'IN_TRANSIT',
        assignedAt: new Date(),
        pickedUpAt: new Date(),
        proofNote: 'Private proof',
      },
    });
    const response = await call('orders/track/' + o.token);
    expect(response.status).toBe(200);
    const view = await response.json();
    expect(view.delivery.status).toBe('IN_TRANSIT');
    expect(view.delivery.pickedUpAt).toBeTruthy();
    expect(view.delivery).not.toHaveProperty('rider');
    expect(view.delivery).not.toHaveProperty('riderId');
    expect(view.delivery).not.toHaveProperty('proofNote');
    expect(view).not.toHaveProperty('deliveryAddress');
  });
  it('allows account tracking only for the order owner', async () => {
    const customer = await db.customer.create({
      data: {
        restaurantId: r.id,
        fullName: 'Tracking customer',
        phone: 'tracking-' + randomUUID(),
      },
    });
    const user: Actor = {
      id: customer.id,
      restaurantId: r.id,
      kind: 'customer',
      role: 'CUSTOMER',
      name: customer.fullName,
    };
    const o = await createOrder(input(), randomUUID(), user),
      cookie = (await createSession(customer.id, 'customer')).split(';')[0];
    const path = 'customers/me/orders/' + o.id + '/track';
    expect((await call(path)).status).toBe(401);
    const response = await call(path, 'GET', undefined, cookie);
    expect(response.status).toBe(200);
    expect((await response.json()).orderNumber).toBe(o.orderNumber);
    const other = await db.customer.create({
      data: {
        restaurantId: r.id,
        fullName: 'Other tracking customer',
        phone: 'other-' + randomUUID(),
      },
    });
    const foreignCookie = (await createSession(other.id, 'customer')).split(';')[0];
    expect((await call(path, 'GET', undefined, foreignCookie)).status).toBe(404);
  });
});
