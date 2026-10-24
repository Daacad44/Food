import { z } from 'zod';
import { ensure } from './errors';
import { audit, event, transaction, transitionOrderInTransaction } from './orders';
import { capturePaymentInTransaction } from './operations';
import { money } from './domain';
import { MANAGERS, passwordHash, type Actor } from './security';

export async function createRider(body: unknown, user: Actor) {
  ensure((MANAGERS as readonly string[]).includes(user.role), 'Permission denied', 403);
  const data = z
    .object({
      fullName: z.string().trim().min(2).max(100),
      email: z.email().toLowerCase(),
      phone: z.string().trim().max(30).optional(),
      password: z
        .string()
        .min(12)
        .refine(
          (value) => Buffer.byteLength(value, 'utf8') <= 72,
          'Password must be at most 72 bytes',
        ),
    })
    .strict()
    .parse(body);
  const hash = await passwordHash(data.password);
  return transaction(async (tx) => {
    const rider = await tx.staffUser.create({
      data: {
        restaurantId: user.restaurantId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        passwordHash: hash,
        role: 'RIDER',
        status: 'ACTIVE',
      },
      select: { id: true, fullName: true, email: true, phone: true, role: true, status: true },
    });
    await audit(tx, user, 'CREATE_RIDER', 'StaffUser', rider.id);
    return rider;
  });
}

export async function assignRider(deliveryId: string, riderId: string, user: Actor) {
  ensure((MANAGERS as readonly string[]).includes(user.role), 'Permission denied', 403);
  return transaction(async (tx) => {
    const delivery = await tx.delivery.findFirst({
      where: { id: deliveryId, order: { restaurantId: user.restaurantId } },
      include: { order: true },
    });
    ensure(delivery, 'Delivery not found', 404);
    ensure(
      ['PENDING', 'ASSIGNED'].includes(delivery.status) &&
        !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(delivery.order.status),
      'Delivery cannot be assigned',
      409,
    );
    ensure(
      await tx.staffUser.findFirst({
        where: { id: riderId, restaurantId: user.restaurantId, role: 'RIDER', status: 'ACTIVE' },
      }),
      'Active rider not found',
      404,
    );
    if (delivery.riderId === riderId) return delivery;
    const result = await tx.delivery.update({
      where: { id: deliveryId },
      data: { riderId, status: 'ASSIGNED', assignedAt: new Date() },
    });
    await audit(tx, user, 'ASSIGN_RIDER', 'Delivery', deliveryId, { riderId });
    await event(tx, user.restaurantId, 'delivery.assigned', { orderId: delivery.orderId, riderId });
    return result;
  });
}

export const completeDeliverySchema = z
  .object({
    proofNote: z.string().trim().min(3).max(500),
    confirmCashCollected: z.boolean().default(false),
  })
  .strict();
export async function completeDelivery(orderId: string, body: unknown, user: Actor) {
  const data = completeDeliverySchema.parse(body);
  ensure(['OWNER', 'MANAGER', 'RIDER'].includes(user.role), 'Permission denied', 403);
  return transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: user.restaurantId },
      include: { delivery: true, payments: { include: { refunds: true } } },
    });
    ensure(order && order.type === 'DELIVERY' && order.delivery, 'Delivery order not found', 404);
    const rider = user.role === 'RIDER';
    if (rider) ensure(order.delivery.riderId === user.id, 'Delivery access denied', 403);
    if (order.status === 'COMPLETED') return order;
    ensure(
      rider
        ? order.status === 'OUT_FOR_DELIVERY'
        : ['READY', 'OUT_FOR_DELIVERY'].includes(order.status),
      'Delivery is not ready to complete',
      409,
    );
    if (order.paymentStatus !== 'PAID') {
      ensure(
        data.confirmCashCollected,
        'Confirm cash collected before completing the delivery',
        409,
      );
      ensure(
        !order.payments.some((payment) => payment.refunds.length > 0),
        'Refunded orders cannot be completed',
        409,
      );
      const pending = order.payments.filter((payment) =>
        ['PENDING', 'UNPAID'].includes(payment.status),
      );
      const captured = order.payments
        .filter((payment) => payment.paidAt)
        .reduce((sum, payment) => sum + money(payment.amount), 0);
      ensure(
        pending.length > 0 &&
          pending.every((payment) => payment.method === 'CASH') &&
          pending.reduce((sum, payment) => sum + money(payment.amount), 0) ===
            money(order.total) - captured,
        'Outstanding payment must be settled before delivery completion',
        409,
      );
      for (const payment of pending) await capturePaymentInTransaction(tx, payment.id, user);
    }
    const result = await transitionOrderInTransaction(
      tx,
      orderId,
      'COMPLETED',
      user,
      data.proofNote,
    );
    await audit(
      tx,
      user,
      rider ? 'RIDER_COMPLETED_DELIVERY' : 'ADMIN_COMPLETED_DELIVERY',
      'Delivery',
      order.delivery.id,
      {
        proofNote: data.proofNote,
        confirmCashCollected: data.confirmCashCollected,
        from: order.status,
      },
    );
    return result;
  });
}
