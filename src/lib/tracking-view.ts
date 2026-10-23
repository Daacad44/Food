import type { Prisma } from '@prisma/client';
import { orderInclude } from './orders';
type TrackedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** The guest capability link and authenticated account share this explicit privacy boundary. */
export function trackingView(order: TrackedOrder) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    type: order.type,
    total: order.total,
    createdAt: order.createdAt,
    delivery: order.delivery
      ? {
          status: order.delivery.status,
          assignedAt: order.delivery.assignedAt,
          pickedUpAt: order.delivery.pickedUpAt,
          deliveredAt: order.delivery.deliveredAt,
        }
      : null,
    items: order.items.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      modifiers: item.modifiers.map((modifier) => ({ nameSnapshot: modifier.nameSnapshot })),
    })),
    statusEvents: order.statusEvents.map((event) => ({
      toStatus: event.toStatus,
      createdAt: event.createdAt,
    })),
  };
}
