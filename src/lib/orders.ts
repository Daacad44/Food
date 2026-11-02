import { Prisma, type OrderStatus } from '@prisma/client';
import { db } from './db';
import { ensure } from './errors';
import {
  calculateTotals,
  canTransition,
  decimal,
  money,
  percentDiscount,
  type StaffOrderInput,
} from './domain';
import { digest, trackingToken, ORDER_TAKERS, type Actor } from './security';
type Tx = Prisma.TransactionClient;
export async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 20000 });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(e.code) &&
        attempt < 3
      )
        continue;
      throw e;
    }
  }
  throw new Error('Transaction retry exhausted');
}
export async function restaurant(tx: Tx = db) {
  const r = await tx.restaurant.findFirst({
    include: { settings: true, hours: true },
    orderBy: { createdAt: 'asc' },
  });
  ensure(r, 'Restaurant setup incomplete', 503);
  return r;
}
/** Server-side pricing of a staff order. Every amount is in integer cents. */
export async function quote(tx: Tx, input: StaffOrderInput, restaurantId?: string) {
  const r = await restaurant(tx),
    settings = r.settings;
  ensure(!restaurantId || r.id === restaurantId, 'Restaurant not found', 404);
  ensure(settings && r.isAcceptingOrders, 'Maqaayaddu hadda dalab ma qaadanayso', 409);
  const rows = [];
  for (const line of input.items) {
    const item = await tx.menuItem.findUnique({
      where: { id: line.menuItemId },
      include: {
        category: true,
        modifierGroups: { include: { group: { include: { options: true } } } },
        recipes: { include: { inventoryItem: true } },
      },
    });
    ensure(
      item && item.restaurantId === r.id && item.isAvailable && item.category.isActive,
      'Cuntadan hadda lama heli karo',
      409,
    );
    const ids = [...new Set(line.modifierOptionIds)];
    ensure(ids.length === line.modifierOptionIds.length, 'Duplicate modifiers');
    const allowed = item.modifierGroups.flatMap((g) =>
      g.group.options.filter((o) => o.isAvailable),
    );
    const options = ids.map((id) => {
      const o = allowed.find((v) => v.id === id);
      ensure(o, 'Invalid modifier');
      return o;
    });
    for (const { group } of item.modifierGroups) {
      const n = options.filter((o) => o.groupId === group.id).length;
      const min = Math.max(group.minSelect, group.isRequired ? 1 : 0);
      ensure(
        n >= min && n <= group.maxSelect,
        `${item.name} · ${group.name}: dooro ${min}–${group.maxSelect}`,
      );
    }
    const unitPrice = money(item.basePrice),
      modifierPrice = options.reduce((sum, o) => sum + money(o.priceDelta), 0);
    rows.push({
      item,
      options,
      quantity: line.quantity,
      specialInstructions: line.specialInstructions,
      unitPrice,
      modifierPrice,
      lineTotal: (unitPrice + modifierPrice) * line.quantity,
    });
  }
  const needs = new Map<string, number>();
  for (const row of rows)
    for (const recipe of row.item.recipes) {
      const required =
        (needs.get(recipe.inventoryItemId) || 0) + Number(recipe.quantity) * row.quantity;
      needs.set(recipe.inventoryItemId, required);
      ensure(
        recipe.inventoryItem.isActive && Number(recipe.inventoryItem.quantityOnHand) >= required,
        `Stock kuma filna: ${recipe.inventoryItem.name}`,
        409,
      );
    }
  let zone = null;
  if (input.zoneId) {
    zone = await tx.deliveryZone.findUnique({ where: { id: input.zoneId } });
    ensure(zone?.isActive && zone.restaurantId === r.id, 'Delivery zone unavailable');
  }
  const fee =
    input.deliveryFee !== undefined ? money(input.deliveryFee) : zone ? money(zone.deliveryFee) : 0;
  const subtotal = rows.reduce((sum, row) => sum + row.lineTotal, 0);
  return {
    restaurant: r,
    rows,
    zone,
    ...calculateTotals(
      subtotal,
      percentDiscount(subtotal, input.discountPercent),
      input.withVat ? Number(settings.taxRate) : 0,
      fee,
    ),
  };
}
export const orderNumber = (keyHash: string) =>
  `BTN-${Date.now().toString(36).toUpperCase()}-${keyHash.slice(0, 4).toUpperCase()}`;
/**
 * A staff member takes a delivery order. It is confirmed at once (stock is deducted), the payment
 * method and payer's number are recorded, and when a rider is chosen the order goes straight out.
 */
export async function createOrder(
  input: StaffOrderInput,
  key: string,
  user: Actor,
  expectedTotal?: number,
) {
  ensure(
    user.kind === 'staff' && (ORDER_TAKERS as readonly string[]).includes(user.role),
    'Ma lihid oggolaanshaha dalab qaadista',
    403,
  );
  ensure(key.length >= 16 && key.length <= 120, 'Idempotency-Key required');
  ensure(
    input.paymentMethod === 'CASH' || input.paymentPhone,
    'Geli telefoonka lacagta laga soo diray',
  );
  const keyHash = digest(key),
    requestHash = digest(JSON.stringify(input) + user.id),
    token = trackingToken(key);
  return transaction(async (tx) => {
    const old = await tx.order.findUnique({ where: { idempotencyKey: keyHash } });
    if (old) {
      ensure(
        old.requestHash === requestHash,
        'Idempotency key already used for another request',
        409,
      );
      return { id: old.id, orderNumber: old.orderNumber, total: old.total };
    }
    const q = await quote(tx, input, user.restaurantId);
    if (expectedTotal !== undefined)
      ensure(
        Number.isFinite(expectedTotal) && money(expectedTotal) === q.total,
        'Qiimaha menu-ga waa is beddelay. Hubi wadarta mar kale.',
        409,
      );
    const paid = input.paid || q.total === 0;
    const order = await tx.order.create({
      data: {
        restaurantId: q.restaurant.id,
        orderNumber: orderNumber(keyHash),
        idempotencyKey: keyHash,
        requestHash,
        trackingTokenHash: digest(token),
        guestName: input.customerName || 'Macmiil',
        guestPhone: input.customerPhone,
        type: 'DELIVERY',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        paymentStatus: paid ? 'PAID' : 'UNPAID',
        subtotal: decimal(q.subtotal),
        discountAmount: decimal(q.discount),
        taxAmount: decimal(q.tax),
        deliveryFee: decimal(q.deliveryFee),
        total: decimal(q.total),
        deliveryAddress: input.deliveryAddress,
        zoneId: q.zone?.id,
        notes: input.notes,
        handledById: user.id,
        items: {
          create: q.rows.map((row) => ({
            menuItemId: row.item.id,
            nameSnapshot: row.item.name,
            unitPrice: decimal(row.unitPrice),
            quantity: row.quantity,
            modifiersTotal: decimal(row.modifierPrice * row.quantity),
            lineTotal: decimal(row.lineTotal),
            specialInstructions: row.specialInstructions,
            modifiers: {
              create: row.options.map((o) => ({
                modifierOptionId: o.id,
                nameSnapshot: o.name,
                priceSnapshot: o.priceDelta,
              })),
            },
          })),
        },
        statusEvents: { create: { toStatus: 'CONFIRMED', actorId: user.id } },
        payments: {
          create: {
            method: input.paymentMethod,
            provider: 'manual',
            providerReference: input.paymentPhone || null,
            status: paid ? 'PAID' : 'PENDING',
            ...(paid ? { paidAt: new Date() } : {}),
            amount: decimal(q.total),
            idempotencyKey: `order:${keyHash}`,
          },
        },
        delivery: { create: { status: 'PENDING' } },
      },
    });
    await deductStock(tx, order.id, user);
    await tx.order.update({ where: { id: order.id }, data: { stockDeducted: true } });
    await audit(tx, user, 'ORDER_CREATE', 'Order', order.id, {
      total: decimal(q.total),
      paymentMethod: input.paymentMethod,
      paid,
    });
    await event(tx, q.restaurant.id, 'order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
    if (input.riderId) await assignRiderInTransaction(tx, order.id, input.riderId, user);
    return { id: order.id, orderNumber: order.orderNumber, total: order.total };
  });
}
export async function event(
  tx: Tx,
  restaurantId: string,
  topic: string,
  payload: Prisma.InputJsonValue,
) {
  await tx.outboxEvent.create({ data: { restaurantId, topic, payload } });
}
export async function audit(
  tx: Tx,
  user: Actor,
  action: string,
  entityType: string,
  entityId: string,
  after?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: {
      restaurantId: user.restaurantId,
      actorId: user.id,
      action,
      entityType,
      entityId,
      after,
    },
  });
}
/** Takes the recipe quantities of every item out of the pantry, once per order. */
async function deductStock(tx: Tx, orderId: string, user: Actor) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    if (!item.menuItemId) continue;
    const recipes = await tx.recipeIngredient.findMany({
      where: { menuItemId: item.menuItemId },
      include: { inventoryItem: true },
    });
    for (const recipe of recipes) {
      const quantity = Number(recipe.quantity) * item.quantity;
      const updated = await tx.inventoryItem.updateMany({
        where: { id: recipe.inventoryItemId, isActive: true, quantityOnHand: { gte: quantity } },
        data: { quantityOnHand: { decrement: quantity } },
      });
      ensure(updated.count === 1, `Stock kuma filna: ${recipe.inventoryItem.name}`, 409);
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: recipe.inventoryItemId,
          type: 'CONSUMPTION',
          unitCost: recipe.inventoryItem.averageUnitCost,
          quantityDelta: -quantity,
          referenceType: 'ORDER',
          referenceId: orderId,
          actorId: user.id,
        },
      });
    }
  }
}
/** Assigns (or re-assigns) the rider; the order is then out for delivery. */
export async function assignRider(orderId: string, riderId: string, user: Actor) {
  return transaction((tx) => assignRiderInTransaction(tx, orderId, riderId, user));
}
export async function assignRiderInTransaction(
  tx: Tx,
  orderId: string,
  riderId: string,
  user: Actor,
) {
  ensure((ORDER_TAKERS as readonly string[]).includes(user.role), 'Permission denied', 403);
  const order = await tx.order.findFirst({
    where: { id: orderId, restaurantId: user.restaurantId },
    include: { delivery: true },
  });
  ensure(order && order.type === 'DELIVERY', 'Dalabka lama helin', 404);
  ensure(
    !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status),
    'Dalabkan darawal looma qoondeyn karo',
    409,
  );
  ensure(
    await tx.staffUser.findFirst({
      where: { id: riderId, restaurantId: user.restaurantId, role: 'RIDER', status: 'ACTIVE' },
    }),
    'Darawalka lama helin ama waa la hakiyey',
    404,
  );
  const delivery =
    order.delivery || (await tx.delivery.create({ data: { orderId, status: 'PENDING' } }));
  if (delivery.riderId === riderId && order.status === 'OUT_FOR_DELIVERY') return order;
  await tx.delivery.update({
    where: { id: delivery.id },
    data: { riderId, status: 'ASSIGNED', assignedAt: new Date() },
  });
  if (!order.stockDeducted) await deductStock(tx, orderId, user);
  const updated = await tx.order.update({
    where: { id: orderId },
    data: {
      status: 'OUT_FOR_DELIVERY',
      stockDeducted: true,
      ...(order.confirmedAt ? {} : { confirmedAt: new Date() }),
      ...(order.status !== 'OUT_FOR_DELIVERY'
        ? {
            statusEvents: {
              create: { fromStatus: order.status, toStatus: 'OUT_FOR_DELIVERY', actorId: user.id },
            },
          }
        : {}),
    },
  });
  await audit(
    tx,
    user,
    delivery.riderId ? 'REASSIGN_RIDER' : 'ASSIGN_RIDER',
    'Delivery',
    delivery.id,
    { riderId, previousRiderId: delivery.riderId },
  );
  await event(tx, user.restaurantId, 'delivery.assigned', { orderId, riderId });
  return updated;
}
export async function transitionOrder(
  id: string,
  to: OrderStatus,
  user: Actor,
  proofNote?: string,
) {
  return transaction((tx) => transitionOrderInTransaction(tx, id, to, user, proofNote));
}
/** Completion and cancellation. Going out for delivery happens through assignRider. */
export async function transitionOrderInTransaction(
  tx: Tx,
  id: string,
  to: OrderStatus,
  user: Actor,
  proofNote?: string,
) {
  ensure(to === 'COMPLETED' || to === 'CANCELLED', 'Invalid order status transition', 409);
  const o = await tx.order.findUnique({
    where: { id },
    include: { items: true, delivery: true },
  });
  ensure(o && o.restaurantId === user.restaurantId, 'Order not found', 404);
  ensure(canTransition(o.status, to), 'Invalid order status transition', 409);
  if (user.role === 'RIDER')
    ensure(
      to === 'COMPLETED' && o.delivery?.riderId === user.id && o.status === 'OUT_FOR_DELIVERY',
      'Delivery transition denied',
      403,
    );
  if (to === 'CANCELLED')
    ensure(['OWNER', 'MANAGER'].includes(user.role), 'Maamulaha kaliya ayaa joojin kara', 403);
  if (to === 'COMPLETED')
    ensure(o.paymentStatus === 'PAID', 'Lacagta qaado ka hor intaadan dhammeyn', 409);
  if (to === 'CANCELLED' && o.stockDeducted) {
    const movements = await tx.inventoryMovement.findMany({
      where: { referenceId: id, referenceType: 'ORDER', type: 'CONSUMPTION' },
    });
    for (const m of movements) {
      await tx.inventoryItem.update({
        where: { id: m.inventoryItemId },
        data: { quantityOnHand: { increment: Math.abs(Number(m.quantityDelta)) } },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: m.inventoryItemId,
          type: 'RETURN',
          unitCost: m.unitCost,
          quantityDelta: Math.abs(Number(m.quantityDelta)),
          referenceType: 'ORDER',
          referenceId: id,
          actorId: user.id,
        },
      });
    }
  }
  const updated = await tx.order.update({
    where: { id },
    data: {
      status: to,
      ...(to === 'CANCELLED' ? { stockDeducted: false, cancelledAt: new Date() } : {}),
      ...(to === 'COMPLETED' ? { completedAt: new Date() } : {}),
      statusEvents: { create: { fromStatus: o.status, toStatus: to, actorId: user.id } },
    },
  });
  if (o.delivery && to === 'COMPLETED')
    await tx.delivery.update({
      where: { id: o.delivery.id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        proofNote: proofNote || 'Shaqaalaha ayaa xaqiijiyey gaarsiinta',
      },
    });
  if (o.delivery && to === 'CANCELLED')
    await tx.delivery.update({
      where: { id: o.delivery.id },
      data: { status: o.delivery.riderId ? 'RETURNED' : 'FAILED' },
    });
  await audit(tx, user, 'ORDER_STATUS', 'Order', id, { from: o.status, to });
  await event(tx, o.restaurantId, 'order.status', { orderId: id, status: to });
  return updated;
}
export const orderInclude = {
  items: { include: { modifiers: true } },
  payments: { include: { refunds: true } },
  delivery: { include: { rider: { select: { id: true, fullName: true, phone: true } } } },
  statusEvents: { orderBy: { createdAt: 'asc' as const } },
  handledBy: { select: { id: true, fullName: true } },
} as const;
