import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { assignRider, completeDelivery, createRider } from '../src/lib/delivery';
import { createOrder, restaurant, transitionOrder } from '../src/lib/orders';
import { capturePayment } from '../src/lib/operations';
import { createSession, passwordHash, type Actor } from '../src/lib/security';
import { POST, PATCH } from '../src/app/api/v1/[...path]/route';
let owner: Actor, manager: Actor, rider: Actor, other: Actor, cashier: Actor, chef: Actor;
let restaurantId: string, itemId: string, zoneId: string;
const password = 'RiderIntegration!2026';
async function readyOrder() {
  const order = await createOrder(
    {
      items: [{ menuItemId: itemId, quantity: 1, modifierOptionIds: [], specialInstructions: '' }],
      type: 'DELIVERY',
      guestName: 'Delivery test',
      guestPhone: '+252610008888',
      zoneId,
      deliveryAddress: 'Test delivery address',
    },
    randomUUID(),
    owner,
  );
  await transitionOrder(order.id, 'CONFIRMED', owner);
  await transitionOrder(order.id, 'PREPARING', chef);
  await transitionOrder(order.id, 'READY', chef);
  return db.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { delivery: true, payments: true },
  });
}
async function request(path: string, body: unknown, user: Actor, method = 'POST') {
  const cookie = (await createSession(user.id, 'staff')).split(';')[0];
  const req = new Request('http://localhost:3000/api/v1/' + path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (method === 'PATCH' ? PATCH : POST)(req, {
    params: Promise.resolve({ path: path.split('/') }),
  });
}
beforeAll(async () => {
  const r = await restaurant();
  restaurantId = r.id;
  await db.restaurant.update({ where: { id: r.id }, data: { isAcceptingOrders: true } });
  await db.restaurantSettings.update({
    where: { restaurantId: r.id },
    data: { deliveryEnabled: true },
  });
  itemId = (
    await db.menuItem.findFirstOrThrow({ where: { restaurantId: r.id, slug: 'chicken-suqaar' } })
  ).id;
  zoneId = (
    await db.deliveryZone.findFirstOrThrow({ where: { restaurantId: r.id, isActive: true } })
  ).id;
  async function actor(role: 'OWNER' | 'MANAGER' | 'RIDER' | 'CASHIER' | 'CHEF'): Promise<Actor> {
    const staff = await db.staffUser.create({
      data: {
        restaurantId,
        email: randomUUID() + '@delivery.test',
        fullName: role,
        passwordHash: await passwordHash(password),
        role,
      },
    });
    return { id: staff.id, name: staff.fullName, kind: 'staff', role, restaurantId };
  }
  owner = await actor('OWNER');
  manager = await actor('MANAGER');
  rider = await actor('RIDER');
  other = await actor('RIDER');
  cashier = await actor('CASHIER');
  chef = await actor('CHEF');
});
afterAll(async () => {
  await db.$disconnect();
});
describe('rider creation, assignment and delivery completion', () => {
  it('lets a manager create a fixed-role rider without exposing password hashes', async () => {
    const response = await request(
      'admin/delivery/riders',
      {
        fullName: 'New delivery rider',
        email: randomUUID() + '@delivery.test',
        phone: '+252610009999',
        password,
      },
      manager,
    );
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.role).toBe('RIDER');
    expect(result.status).toBe('ACTIVE');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('password');
  });
  it('rejects role escalation and rider creation by non-managers', async () => {
    expect(
      (
        await request(
          'admin/delivery/riders',
          { fullName: 'Bad role', email: randomUUID() + '@delivery.test', password, role: 'OWNER' },
          manager,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          'admin/delivery/riders',
          { fullName: 'Bad role', email: randomUUID() + '@delivery.test', password },
          rider,
        )
      ).status,
    ).toBe(403);
    await expect(
      createRider({ fullName: 'Bad', email: randomUUID() + '@delivery.test', password }, cashier),
    ).rejects.toThrow('Permission denied');
  });
  it('assigns from the order workflow, audits it, and blocks inactive riders', async () => {
    const o = await readyOrder();
    expect(
      (await request('admin/deliveries/' + o.delivery!.id, { riderId: rider.id }, owner, 'PATCH'))
        .status,
    ).toBe(200);
    expect((await db.delivery.findUniqueOrThrow({ where: { id: o.delivery!.id } })).riderId).toBe(
      rider.id,
    );
    expect(
      await db.auditLog.count({ where: { entityId: o.delivery!.id, action: 'ASSIGN_RIDER' } }),
    ).toBe(1);
    await assignRider(o.delivery!.id, rider.id, owner);
    expect(
      await db.auditLog.count({ where: { entityId: o.delivery!.id, action: 'ASSIGN_RIDER' } }),
    ).toBe(1);
    await db.staffUser.update({ where: { id: rider.id }, data: { status: 'SUSPENDED' } });
    try {
      await expect(transitionOrder(o.id, 'OUT_FOR_DELIVERY', owner)).rejects.toThrow('inactive');
      await expect(assignRider(o.delivery!.id, rider.id, owner)).rejects.toThrow('Active rider');
    } finally {
      await db.staffUser.update({ where: { id: rider.id }, data: { status: 'ACTIVE' } });
    }
  });
  it('does not assign cancelled or rejected orders', async () => {
    const o = await readyOrder();
    await transitionOrder(o.id, 'CANCELLED', owner);
    await expect(assignRider(o.delivery!.id, rider.id, owner)).rejects.toThrow(
      'cannot be assigned',
    );
  });
  it('requires explicit cash confirmation before admin manual completion', async () => {
    const o = await readyOrder();
    await expect(
      completeDelivery(o.id, { proofNote: 'Confirmed with customer' }, owner),
    ).rejects.toThrow('Confirm cash');
    expect((await db.payment.findUniqueOrThrow({ where: { id: o.payments[0].id } })).status).toBe(
      'PENDING',
    );
    const result = await completeDelivery(
      o.id,
      { proofNote: 'Confirmed by phone with customer', confirmCashCollected: true },
      owner,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.paymentStatus).toBe('PAID');
    const delivery = await db.delivery.findUniqueOrThrow({ where: { id: o.delivery!.id } });
    expect(delivery.status).toBe('DELIVERED');
    expect(delivery.proofNote).toContain('Confirmed by phone');
    expect(delivery.riderId).toBeNull();
    expect(
      await db.auditLog.count({
        where: { entityId: delivery.id, action: 'ADMIN_COMPLETED_DELIVERY' },
      }),
    ).toBe(1);
  });
  it('lets only the assigned rider complete an order after pickup', async () => {
    const o = await readyOrder();
    await assignRider(o.delivery!.id, rider.id, owner);
    await expect(
      completeDelivery(o.id, { proofNote: 'Handed over', confirmCashCollected: true }, rider),
    ).rejects.toThrow('not ready');
    await transitionOrder(o.id, 'OUT_FOR_DELIVERY', rider);
    expect(
      (
        await request(
          `rider/orders/${o.id}/complete-delivery`,
          { proofNote: 'Wrong rider', confirmCashCollected: true },
          other,
        )
      ).status,
    ).toBe(403);
    const response = await request(
      `rider/orders/${o.id}/complete-delivery`,
      { proofNote: 'Handed to customer', confirmCashCollected: true },
      rider,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('COMPLETED');
  });
  it('captures only outstanding split cash tenders and handles concurrent completion retries once', async () => {
    const o = await readyOrder();
    await assignRider(o.delivery!.id, rider.id, owner);
    await transitionOrder(o.id, 'OUT_FOR_DELIVERY', rider);
    await capturePayment(o.payments[0].id, owner, 2);
    const body = {
      proofNote: 'Customer received order and paid remainder',
      confirmCashCollected: true,
    };
    const results = await Promise.all([
      completeDelivery(o.id, body, rider),
      completeDelivery(o.id, body, rider),
    ]);
    expect(results.every((result) => result.status === 'COMPLETED')).toBe(true);
    const payments = await db.payment.findMany({ where: { orderId: o.id } });
    expect(payments).toHaveLength(2);
    expect(payments.every((payment) => payment.status === 'PAID')).toBe(true);
    expect(payments.reduce((sum, payment) => sum + Number(payment.amount), 0)).toBe(
      Number(o.total),
    );
    expect(
      await db.orderStatusEvent.count({ where: { orderId: o.id, toStatus: 'COMPLETED' } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityId: o.delivery!.id, action: 'RIDER_COMPLETED_DELIVERY' },
      }),
    ).toBe(1);
  });
  it('lets a manager complete prepaid delivery without a second cash capture', async () => {
    const o = await readyOrder();
    await capturePayment(o.payments[0].id, owner);
    expect(
      (
        await request(
          `admin/orders/${o.id}/complete-delivery`,
          { proofNote: 'Prepaid delivery confirmed' },
          manager,
        )
      ).status,
    ).toBe(200);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(1);
    expect(
      await db.auditLog.count({ where: { action: 'CASH_CAPTURE', entityId: o.payments[0].id } }),
    ).toBe(1);
  });
  it('rejects early completion, cashier overrides, missing proof, and non-cash outstanding payments', async () => {
    const o = await readyOrder();
    expect(
      (
        await request(
          `admin/orders/${o.id}/complete-delivery`,
          { proofNote: 'No permission', confirmCashCollected: true },
          cashier,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `admin/orders/${o.id}/complete-delivery`,
          { confirmCashCollected: true },
          owner,
        )
      ).status,
    ).toBe(400);
    await db.payment.update({ where: { id: o.payments[0].id }, data: { method: 'CARD' } });
    await expect(
      completeDelivery(
        o.id,
        { proofNote: 'Card has not settled', confirmCashCollected: true },
        owner,
      ),
    ).rejects.toThrow('Outstanding payment');
  });
  it('rolls back cash collection if delivery completion fails after payment writes', async () => {
    const o = await readyOrder();
    await db.$executeRawUnsafe(
      `ALTER TABLE "Delivery" ADD CONSTRAINT delivery_test_reject_complete CHECK ("id" <> '${o.delivery!.id}'::uuid OR "status" <> 'DELIVERED') NOT VALID`,
    );
    try {
      await expect(
        completeDelivery(
          o.id,
          { proofNote: 'Test completion failure', confirmCashCollected: true },
          owner,
        ),
      ).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(
        'ALTER TABLE "Delivery" DROP CONSTRAINT delivery_test_reject_complete',
      );
    }
    const payment = await db.payment.findUniqueOrThrow({ where: { id: o.payments[0].id } });
    expect(payment.status).toBe('PENDING');
    expect(payment.paidAt).toBeNull();
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('READY');
    expect(
      await db.orderStatusEvent.count({ where: { orderId: o.id, toStatus: 'COMPLETED' } }),
    ).toBe(0);
  });
});
