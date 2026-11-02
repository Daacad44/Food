import { z } from 'zod';
import { ensure } from './errors';
import { audit, transaction, transitionOrderInTransaction } from './orders';
import { capturePaymentInTransaction } from './operations';
import { money } from './domain';
import { MANAGERS, ORDER_TAKERS, passwordHash, type Actor } from './security';

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

export const completeDeliverySchema = z
  .object({
    proofNote: z.string().trim().min(3).max(500),
    /** The rider or staff confirm the outstanding money was received (cash or mobile money). */
    confirmPaymentCollected: z.boolean().default(false),
  })
  .strict();
/**
 * Marks a delivery order as delivered. A rider can complete only an order assigned to them; order
 * takers and managers can also confirm it (e.g. a rider without the app). Money still owed must be
 * explicitly confirmed and is captured in the same transaction.
 */
export async function completeDelivery(orderId: string, body: unknown, user: Actor) {
  const data = completeDeliverySchema.parse(body);
  const rider = user.role === 'RIDER';
  ensure(
    rider || (ORDER_TAKERS as readonly string[]).includes(user.role),
    'Permission denied',
    403,
  );
  return transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: user.restaurantId },
      include: { delivery: true, payments: { include: { refunds: true } } },
    });
    ensure(order && order.type === 'DELIVERY' && order.delivery, 'Delivery order not found', 404);
    if (rider) ensure(order.delivery.riderId === user.id, 'Delivery access denied', 403);
    if (order.status === 'COMPLETED') return order;
    ensure(
      rider
        ? order.status === 'OUT_FOR_DELIVERY'
        : !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status),
      'Dalabkan lama dhammeyn karo',
      409,
    );
    if (order.paymentStatus !== 'PAID') {
      ensure(data.confirmPaymentCollected, 'Xaqiiji in lacagta la qaaday', 409);
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
      rider ? 'RIDER_COMPLETED_DELIVERY' : 'STAFF_COMPLETED_DELIVERY',
      'Delivery',
      order.delivery.id,
      {
        proofNote: data.proofNote,
        confirmPaymentCollected: data.confirmPaymentCollected,
        from: order.status,
      },
    );
    return result;
  });
}
