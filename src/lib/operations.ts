import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { ensure } from './errors';
import { money, decimal } from './domain';
import { transaction, audit } from './orders';
import { digest, type Actor } from './security';
async function syncPaymentStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } }),
    payments = await tx.payment.findMany({
      where: { orderId, paidAt: { not: null } },
      include: { refunds: true },
    });
  const captured = payments.reduce((sum, p) => sum + money(p.amount), 0),
    refunded = payments.reduce(
      (sum, p) => sum + p.refunds.reduce((s, r) => s + money(r.amount), 0),
      0,
    );
  const status =
    refunded > 0
      ? refunded === captured
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED'
      : captured >= money(order.total)
        ? 'PAID'
        : captured > 0
          ? 'PENDING'
          : 'UNPAID';
  await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
}
export async function capturePayment(id: string, user: Actor, amount?: number) {
  return transaction(async (tx) => {
    const p = await tx.payment.findUnique({
      where: { id },
      include: { order: { include: { delivery: true } } },
    });
    ensure(p && p.order.restaurantId === user.restaurantId, 'Payment not found', 404);
    if (user.role === 'RIDER')
      ensure(p.order.delivery?.riderId === user.id, 'Payment access denied', 403);
    if (p.status === 'PAID') return p;
    ensure(
      ['PENDING', 'UNPAID'].includes(p.status) &&
        !['CANCELLED', 'REJECTED'].includes(p.order.status),
      'Payment cannot be captured',
      409,
    );
    const shift = await tx.cashierShift.findFirst({
      where: { cashierId: user.id, status: 'OPEN' },
    });
    if (user.role === 'CASHIER') ensure(shift, 'Open your cashier shift first', 409);
    const cents = amount === undefined ? money(p.amount) : money(amount);
    ensure(Number.isFinite(cents) && cents > 0 && cents <= money(p.amount), 'Invalid cash amount');
    const result = await tx.payment.update({
      where: { id },
      data: { amount: decimal(cents), status: 'PAID', paidAt: new Date(), shiftId: shift?.id },
    });
    if (cents < money(p.amount))
      await tx.payment.create({
        data: {
          orderId: p.orderId,
          amount: decimal(money(p.amount) - cents),
          method: 'CASH',
          status: 'PENDING',
          idempotencyKey: `remainder:${p.id}`,
        },
      });
    await syncPaymentStatus(tx, p.orderId);
    await audit(tx, user, 'CASH_CAPTURE', 'Payment', id, { amount: String(p.amount) });
    return result;
  });
}
export async function refundPayment(id: string, body: unknown, key: string, user: Actor) {
  const data = z
    .object({ amount: z.number().positive(), reason: z.string().trim().min(3).max(300) })
    .strict()
    .parse(body);
  ensure(key.length >= 16, 'Idempotency-Key required');
  return transaction(async (tx) => {
    const p = await tx.payment.findUnique({
      where: { id },
      include: { order: true, refunds: true },
    });
    ensure(p && p.order.restaurantId === user.restaurantId, 'Payment not found', 404);
    const prior = await tx.refund.findUnique({ where: { providerRefundId: digest(key) } });
    if (prior) {
      ensure(
        prior.paymentId === id &&
          money(prior.amount) === money(data.amount) &&
          prior.reason === data.reason,
        'Idempotency conflict',
        409,
      );
      return prior;
    }
    ensure(['PAID', 'PARTIALLY_REFUNDED'].includes(p.status), 'No captured payment available', 409);
    const refunded = p.refunds.reduce((sum, r) => sum + money(r.amount), 0) + money(data.amount);
    ensure(refunded <= money(p.amount), 'Refund exceeds captured amount');
    const result = await tx.refund.create({
      data: {
        paymentId: id,
        amount: decimal(money(data.amount)),
        reason: data.reason,
        providerRefundId: digest(key),
      },
    });
    const status = refunded === money(p.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx.payment.update({ where: { id }, data: { status } });
    await syncPaymentStatus(tx, p.orderId);
    await audit(tx, user, 'REFUND', 'Payment', id, {
      amount: String(result.amount),
      reason: data.reason,
    });
    return result;
  });
}
export async function stockMovement(body: unknown, user: Actor) {
  const data = z
    .object({
      inventoryItemId: z.uuid(),
      type: z.enum(['PURCHASE', 'WASTE', 'ADJUSTMENT', 'RETURN']),
      quantityDelta: z
        .number()
        .finite()
        .refine((n) => n !== 0)
        .refine((n) => Math.abs(n) <= 1000000),
      notes: z.string().trim().min(3).max(300),
      unitCost: z.number().nonnegative().optional(),
    })
    .strict()
    .parse(body);
  ensure(data.type !== 'WASTE' || data.quantityDelta < 0, 'Waste must reduce stock');
  ensure(
    !['PURCHASE', 'RETURN'].includes(data.type) || data.quantityDelta > 0,
    'Purchase and return must increase stock',
  );
  return transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: data.inventoryItemId, restaurantId: user.restaurantId },
    });
    ensure(item, 'Inventory item not found', 404);
    ensure(Number(item.quantityOnHand) + data.quantityDelta >= 0, 'Stock cannot be negative');
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantityOnHand: { increment: data.quantityDelta } },
    });
    const m = await tx.inventoryMovement.create({ data: { ...data, actorId: user.id } });
    await audit(tx, user, 'STOCK_MOVEMENT', 'InventoryItem', item.id, {
      delta: data.quantityDelta,
    });
    return m;
  });
}
export async function purchase(body: unknown, user: Actor) {
  const data = z
    .object({
      supplierId: z.uuid(),
      reference: z.string().trim().min(3).max(80),
      lines: z
        .array(
          z.object({
            inventoryItemId: z.uuid(),
            quantity: z.number().positive().max(1000000),
            unitCost: z.number().nonnegative().max(1000000),
          }),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .parse(body);
  return transaction(async (tx) => {
    ensure(
      await tx.supplier.findFirst({
        where: { id: data.supplierId, restaurantId: user.restaurantId },
      }),
      'Supplier not found',
    );
    for (const line of data.lines)
      ensure(
        await tx.inventoryItem.findFirst({
          where: { id: line.inventoryItemId, restaurantId: user.restaurantId },
        }),
        'Stock item not found',
      );
    const total = data.lines.reduce(
      (sum, l) => sum + Math.round(l.quantity * money(l.unitCost)),
      0,
    );
    const p = await tx.purchase.create({
      data: {
        restaurantId: user.restaurantId,
        supplierId: data.supplierId,
        reference: data.reference,
        status: 'ORDERED',
        orderedAt: new Date(),
        total: decimal(total),
        lines: {
          create: data.lines.map((l) => ({
            ...l,
            lineTotal: decimal(Math.round(l.quantity * money(l.unitCost))),
          })),
        },
      },
    });
    await audit(tx, user, 'PURCHASE_CREATE', 'Purchase', p.id);
    return p;
  });
}
export async function receivePurchase(id: string, user: Actor) {
  return transaction(async (tx) => {
    const p = await tx.purchase.findUnique({ where: { id }, include: { lines: true } });
    ensure(p && p.restaurantId === user.restaurantId, 'Purchase not found', 404);
    if (p.status === 'RECEIVED') return p;
    ensure(p.status === 'ORDERED', 'Purchase cannot be received');
    for (const l of p.lines) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: l.inventoryItemId } });
      const old = Number(item.quantityOnHand),
        qty = Number(l.quantity),
        cost = (old * Number(item.averageUnitCost) + qty * Number(l.unitCost)) / (old + qty);
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: { increment: l.quantity }, averageUnitCost: cost },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          type: 'PURCHASE',
          quantityDelta: l.quantity,
          unitCost: l.unitCost,
          referenceType: 'PURCHASE',
          referenceId: id,
          actorId: user.id,
        },
      });
    }
    const result = await tx.purchase.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    });
    await audit(tx, user, 'PURCHASE_RECEIVE', 'Purchase', id);
    return result;
  });
}
export async function openShift(body: unknown, user: Actor) {
  const data = z
    .object({ openingCash: z.number().nonnegative().max(1000000) })
    .strict()
    .parse(body);
  return transaction(async (tx) => {
    ensure(
      !(await tx.cashierShift.findFirst({ where: { cashierId: user.id, status: 'OPEN' } })),
      'A shift is already open',
      409,
    );
    return tx.cashierShift.create({
      data: { restaurantId: user.restaurantId, cashierId: user.id, openingCash: data.openingCash },
    });
  });
}
export async function closeShift(id: string, body: unknown, user: Actor) {
  const data = z
    .object({ actualClosingCash: z.number().nonnegative().max(1000000) })
    .strict()
    .parse(body);
  return transaction(async (tx) => {
    const shift = await tx.cashierShift.findUnique({ where: { id } });
    ensure(
      shift &&
        shift.restaurantId === user.restaurantId &&
        (shift.cashierId === user.id || user.role === 'OWNER'),
      'Shift not found',
      404,
    );
    ensure(shift.status === 'OPEN', 'Shift already closed', 409);
    const payments = await tx.payment.findMany({
      where: { shiftId: id, paidAt: { not: null } },
      include: { refunds: true },
    });
    const cash = payments.reduce(
      (sum, p) => sum + money(p.amount) - p.refunds.reduce((s, r) => s + money(r.amount), 0),
      money(shift.openingCash),
    );
    const result = await tx.cashierShift.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedCash: decimal(cash),
        actualClosingCash: data.actualClosingCash,
      },
    });
    await audit(tx, user, 'SHIFT_CLOSE', 'CashierShift', id, {
      expectedCash: decimal(cash),
      actualClosingCash: data.actualClosingCash,
    });
    return result;
  });
}
export async function finance(restaurantId: string) {
  const [payments, expenses, purchases, orders, stock] = await Promise.all([
    db.payment.findMany({
      where: { order: { restaurantId }, paidAt: { not: null } },
      include: { refunds: true, order: { select: { createdAt: true, orderNumber: true } } },
      orderBy: { paidAt: 'desc' },
    }),
    db.expense.findMany({ where: { restaurantId } }),
    db.purchase.findMany({ where: { restaurantId, status: 'RECEIVED' } }),
    db.order.findMany({ where: { restaurantId }, include: { items: true } }),
    db.inventoryMovement.findMany({
      where: {
        item: { restaurantId },
        referenceType: 'ORDER',
        type: { in: ['CONSUMPTION', 'RETURN'] },
      },
      include: { item: true },
    }),
  ]);
  const captured = payments.reduce((s, p) => s + money(p.amount), 0),
    refunded = payments.reduce((s, p) => s + p.refunds.reduce((a, r) => a + money(r.amount), 0), 0),
    expenseTotal = expenses.reduce((s, e) => s + money(e.amount), 0),
    purchaseTotal = purchases.reduce((s, p) => s + money(p.total), 0);
  const days: Record<string, number> = {};
  for (const p of payments) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Mogadishu' }).format(
      p.paidAt!,
    );
    days[day] = (days[day] || 0) + money(p.amount);
  }
  for (const p of payments)
    for (const r of p.refunds) {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Mogadishu' }).format(
        r.createdAt,
      );
      days[day] = (days[day] || 0) - money(r.amount);
    }
  const top: Record<string, number> = {};
  for (const o of orders.filter((o) => !['CANCELLED', 'REJECTED'].includes(o.status)))
    for (const i of o.items) top[i.nameSnapshot] = (top[i.nameSnapshot] || 0) + i.quantity;
  return {
    captured: captured / 100,
    refunded: refunded / 100,
    netSales: (captured - refunded) / 100,
    expenses: expenseTotal / 100,
    purchases: purchaseTotal / 100,
    cashAfterExpenses: (captured - refunded - expenseTotal - purchaseTotal) / 100,
    orderCount: orders.length,
    activeOrders: orders.filter((o) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status))
      .length,
    averageOrder: orders.length
      ? orders.reduce((s, o) => s + money(o.total), 0) / orders.length / 100
      : 0,
    days: Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cents]) => ({ date, amount: cents / 100 })),
    topItems: Object.entries(top)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, quantity]) => ({ name, quantity })),
    payments: payments.slice(0, 100),
    inventoryCostEstimate: stock.reduce(
      (s, m) => s + -Number(m.quantityDelta) * Number(m.unitCost ?? m.item.averageUnitCost),
      0,
    ),
  };
}
export async function processOutbox() {
  return transaction(async (tx) => {
    const rows = await tx.outboxEvent.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      await tx.notification.create({
        data: {
          restaurantId: row.restaurantId,
          channel: 'IN_APP',
          recipient: 'staff',
          body: `${row.topic}: ${JSON.stringify(row.payload)}`,
          status: 'SENT',
          sentAt: new Date(),
        },
      });
      await tx.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'SENT', processedAt: new Date(), attempts: { increment: 1 } },
      });
    }
    await tx.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await tx.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { processed: rows.length };
  });
}
