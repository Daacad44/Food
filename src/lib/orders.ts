import { Prisma, type OrderStatus } from '@prisma/client';
import { db } from './db';
import { ensure } from './errors';
import {
  calculateTotals,
  canTransition,
  decimal,
  money,
  restaurantOpen,
  type CheckoutInput,
} from './domain';
import { digest, trackingToken, type Actor } from './security';
import { queueOrderSync } from './daljir-queue';
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
export interface QuoteOptions {
  /** Orders from chat (DaljirConnect) can't pick modifier options: required choices are left to the staff. */
  skipRequiredModifiers?: boolean;
}
export async function quote(tx: Tx, input: CheckoutInput, staff = false, opts: QuoteOptions = {}) {
  const r = await restaurant(tx),
    settings = r.settings;
  ensure(settings && r.isAcceptingOrders, 'Maqaayaddu hadda dalab ma qaadanayso', 409);
  ensure(staff || restaurantOpen(r.hours, r.timezone), 'Maqaayaddu hadda way xiran tahay', 409);
  ensure(
    input.type !== 'DINE_IN' || staff || input.tableToken,
    'Scan the table QR code for dine-in ordering',
    403,
  );
  ensure(staff || !input.tableId, 'A valid table QR code is required', 403);
  let table = null;
  if (input.type === 'DINE_IN' && (input.tableId || input.tableToken)) {
    table = await tx.diningTable.findFirst({
      where: {
        restaurantId: r.id,
        ...(input.tableToken ? { qrToken: input.tableToken } : { id: input.tableId }),
        status: { not: 'DISABLED' },
      },
    });
    ensure(table, 'Table unavailable', 409);
  }
  ensure(
    (input.type === 'DELIVERY' && settings.deliveryEnabled) ||
      (input.type === 'PICKUP' && settings.pickupEnabled) ||
      (input.type === 'DINE_IN' && settings.dineInEnabled),
    'Order type unavailable',
  );
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
      const min = opts.skipRequiredModifiers
        ? 0
        : Math.max(group.minSelect, group.isRequired ? 1 : 0);
      ensure(
        n >= min && n <= group.maxSelect,
        `Doorashada ${group.name}: ${group.minSelect}–${group.maxSelect}`,
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
        'Stock kuma filna dalabkan',
        409,
      );
    }
  let fee = 0,
    zone = null;
  if (input.type === 'DELIVERY') {
    ensure(
      input.zoneId && input.deliveryAddress && input.deliveryAddress.length >= 5,
      'Dooro delivery zone iyo cinwaan',
    );
    zone = await tx.deliveryZone.findUnique({ where: { id: input.zoneId } });
    ensure(zone?.isActive && zone.restaurantId === r.id, 'Delivery zone unavailable');
    fee = money(zone.deliveryFee);
  }
  if (input.tableId) {
    const table = await tx.diningTable.findUnique({ where: { id: input.tableId } });
    ensure(table && table.restaurantId === r.id && table.status !== 'DISABLED', 'Invalid table');
  }
  const subtotal = rows.reduce((sum, row) => sum + row.lineTotal, 0);
  ensure(
    subtotal >= money(settings.minimumOrder) && (!zone || subtotal >= money(zone.minimumOrder)),
    'Dalabku kama gaarin qiimaha ugu yar',
  );
  let discount = 0,
    coupon = null;
  if (input.couponCode) {
    coupon = await tx.coupon.findUnique({
      where: { restaurantId_code: { restaurantId: r.id, code: input.couponCode.toUpperCase() } },
    });
    const now = new Date();
    ensure(
      coupon?.isActive &&
        (!coupon.startsAt || coupon.startsAt <= now) &&
        (!coupon.endsAt || coupon.endsAt > now) &&
        (coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit) &&
        subtotal >= money(coupon.minSpend),
      'Coupon aan shaqaynayn',
    );
    discount =
      coupon.type === 'FIXED'
        ? money(coupon.value)
        : Math.round((subtotal * Number(coupon.value)) / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, money(coupon.maxDiscount));
    discount = Math.min(discount, subtotal);
  }
  return {
    restaurant: r,
    rows,
    coupon,
    zone,
    table,
    ...calculateTotals(subtotal, discount, Number(settings.taxRate), fee),
  };
}
export interface OrderSource {
  /** e.g. WHATSAPP */
  channel: string;
  /** the order's id in the source system (DaljirConnect) */
  externalRef: string;
}
export async function createOrder(
  input: CheckoutInput,
  key: string,
  user: Actor | null,
  expectedTotal?: number,
  source?: OrderSource,
) {
  if (user?.kind === 'staff')
    ensure(
      ['OWNER', 'MANAGER', 'CASHIER'].includes(user.role),
      'Only cashiers and managers can place staff orders',
      403,
    );
  ensure(key.length >= 16 && key.length <= 120, 'Idempotency-Key required');
  const keyHash = digest(key),
    requestHash = digest(JSON.stringify(input) + (user?.id || 'guest')),
    token = trackingToken(key);
  return transaction(async (tx) => {
    const old = await tx.order.findUnique({ where: { idempotencyKey: keyHash } });
    if (old) {
      ensure(
        old.requestHash === requestHash,
        'Idempotency key already used for another request',
        409,
      );
      return { id: old.id, orderNumber: old.orderNumber, token, total: old.total };
    }
    // Chat orders were taken by the restaurant's own assistant: opening hours were checked there and the staff
    // approve every order, so they are quoted like a staff order.
    const q = await quote(tx, input, user?.kind === 'staff' || Boolean(source), {
      skipRequiredModifiers: Boolean(source),
    });
    if (expectedTotal !== undefined)
      ensure(
        Number.isFinite(expectedTotal) && money(expectedTotal) === q.total,
        'Menu pricing changed. Review your total again.',
        409,
      );
    ensure(
      user || source || q.restaurant.settings?.guestCheckoutEnabled,
      'Guest checkout unavailable',
      403,
    );
    const order = await tx.order.create({
      data: {
        restaurantId: q.restaurant.id,
        orderNumber: `BTN-${Date.now().toString(36).toUpperCase()}-${keyHash.slice(0, 4).toUpperCase()}`,
        idempotencyKey: keyHash,
        requestHash,
        trackingTokenHash: digest(token),
        customerId: user?.kind === 'customer' ? user.id : null,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        type: input.type,
        status: 'PENDING_APPROVAL',
        paymentStatus: q.total === 0 ? 'PAID' : 'UNPAID',
        subtotal: decimal(q.subtotal),
        discountAmount: decimal(q.discount),
        taxAmount: decimal(q.tax),
        deliveryFee: decimal(q.deliveryFee),
        total: decimal(q.total),
        deliveryAddress: input.type === 'DELIVERY' ? input.deliveryAddress : null,
        zoneId: q.zone?.id,
        tableId: q.table?.id,
        couponId: q.coupon?.id,
        notes: input.notes,
        channel: source?.channel,
        externalRef: source?.externalRef,
        handledById: user?.kind === 'staff' ? user.id : null,
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
        statusEvents: { create: { toStatus: 'PENDING_APPROVAL', actorId: user?.id } },
        payments: {
          create: {
            method: 'CASH',
            status: q.total === 0 ? 'PAID' : 'PENDING',
            ...(q.total === 0 ? { paidAt: new Date() } : {}),
            amount: decimal(q.total),
            idempotencyKey: `order:${keyHash}`,
          },
        },
        ...(input.type === 'DELIVERY' ? { delivery: { create: { status: 'PENDING' } } } : {}),
      },
    });
    if (q.coupon)
      await tx.coupon.update({ where: { id: q.coupon.id }, data: { usedCount: { increment: 1 } } });
    if (q.table)
      await tx.diningTable.update({ where: { id: q.table.id }, data: { status: 'OCCUPIED' } });
    await event(tx, q.restaurant.id, 'order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
    // Tell DaljirConnect the order's number here.
    if (source) await queueOrderSync(tx, q.restaurant.id, source.externalRef);
    return { id: order.id, orderNumber: order.orderNumber, token, total: order.total };
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
export async function transitionOrder(
  id: string,
  to: OrderStatus,
  user: Actor,
  proofNote?: string,
) {
  return transaction(async (tx) => {
    const o = await tx.order.findUnique({
      where: { id },
      include: { items: true, delivery: true },
    });
    ensure(o && o.restaurantId === user.restaurantId, 'Order not found', 404);
    ensure(canTransition(o.status, to, o.type), 'Invalid order status transition', 409);
    if (user.role === 'CHEF')
      ensure(
        (o.status === 'CONFIRMED' && to === 'PREPARING') ||
          (o.status === 'PREPARING' && to === 'READY'),
        'Kitchen transition denied',
        403,
      );
    if (user.role === 'RIDER')
      ensure(
        o.delivery?.riderId === user.id &&
          ((o.status === 'READY' && to === 'OUT_FOR_DELIVERY') ||
            (o.status === 'OUT_FOR_DELIVERY' && to === 'COMPLETED')),
        'Delivery transition denied',
        403,
      );
    if (to === 'OUT_FOR_DELIVERY') ensure(o.delivery?.riderId, 'Assign a rider first');
    if (to === 'COMPLETED') {
      ensure(o.paymentStatus === 'PAID', 'Collect payment before completing the order', 409);
      if (user.role === 'RIDER')
        ensure(proofNote && proofNote.trim().length >= 3, 'Delivery confirmation note required');
    }
    if (to === 'CONFIRMED' && !o.stockDeducted) {
      for (const item of o.items) {
        if (!item.menuItemId) continue;
        const recipes = await tx.recipeIngredient.findMany({
          where: { menuItemId: item.menuItemId },
          include: { inventoryItem: true },
        });
        for (const recipe of recipes) {
          const quantity = Number(recipe.quantity) * item.quantity;
          const updated = await tx.inventoryItem.updateMany({
            where: {
              id: recipe.inventoryItemId,
              isActive: true,
              quantityOnHand: { gte: quantity },
            },
            data: { quantityOnHand: { decrement: quantity } },
          });
          ensure(updated.count === 1, 'Insufficient inventory', 409);
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: recipe.inventoryItemId,
              type: 'CONSUMPTION',
              unitCost: recipe.inventoryItem.averageUnitCost,
              quantityDelta: -quantity,
              referenceType: 'ORDER',
              referenceId: id,
              actorId: user.id,
            },
          });
        }
      }
    }
    if ((to === 'CANCELLED' || to === 'REJECTED') && o.stockDeducted) {
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
    if ((to === 'CANCELLED' || to === 'REJECTED') && o.couponId)
      await tx.coupon.update({ where: { id: o.couponId }, data: { usedCount: { decrement: 1 } } });
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: to,
        ...(to === 'CONFIRMED' ? { stockDeducted: true, confirmedAt: new Date() } : {}),
        ...(['CANCELLED', 'REJECTED'].includes(to)
          ? { stockDeducted: false, cancelledAt: new Date() }
          : {}),
        ...(to === 'COMPLETED' ? { completedAt: new Date() } : {}),
        statusEvents: { create: { fromStatus: o.status, toStatus: to, actorId: user.id } },
      },
    });
    if (o.tableId && ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(to)) {
      const active = await tx.order.count({
        where: { tableId: o.tableId, status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] } },
      });
      if (!active)
        await tx.diningTable.update({ where: { id: o.tableId }, data: { status: 'AVAILABLE' } });
    }
    if (o.delivery && to === 'OUT_FOR_DELIVERY')
      await tx.delivery.update({
        where: { id: o.delivery.id },
        data: { status: 'IN_TRANSIT', pickedUpAt: new Date() },
      });
    if (o.delivery && to === 'COMPLETED')
      await tx.delivery.update({
        where: { id: o.delivery.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          proofNote: proofNote || 'Staff confirmed delivery',
        },
      });
    if (o.delivery && to === 'CANCELLED')
      await tx.delivery.update({ where: { id: o.delivery.id }, data: { status: 'RETURNED' } });
    await audit(tx, user, 'ORDER_STATUS', 'Order', id, { from: o.status, to });
    await event(tx, o.restaurantId, 'order.status', { orderId: id, status: to });
    // WhatsApp orders: the customer hears about every step from DaljirConnect.
    if (o.externalRef) await queueOrderSync(tx, o.restaurantId, o.externalRef);
    return updated;
  });
}
export const orderInclude = {
  items: { include: { modifiers: true } },
  payments: { include: { refunds: true } },
  delivery: { include: { rider: { select: { id: true, fullName: true, phone: true } } } },
  statusEvents: { orderBy: { createdAt: 'asc' as const } },
  table: true,
} as const;
