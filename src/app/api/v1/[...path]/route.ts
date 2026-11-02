import { createRider, completeDelivery } from '@/lib/delivery';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AppError, ensure } from '@/lib/errors';
import {
  actor,
  requireActor,
  createSession,
  verifyPassword,
  digest,
  cookieToken,
  sameOrigin,
  limit,
  MANAGERS,
  FINANCE,
  ORDER_TAKERS,
  ORDER_READERS,
  constantEqual,
} from '@/lib/security';
import { ORDER_VIEWS, staffOrderSchema, viewStatuses, type OrderView } from '@/lib/domain';
import {
  restaurant,
  quote,
  createOrder,
  transitionOrder,
  assignRider,
  orderInclude,
  transaction,
  audit,
} from '@/lib/orders';
import { isResource, listResource, saveResource, delegate } from '@/lib/resources';
import {
  capturePayment,
  captureSchema,
  refundPayment,
  stockMovement,
  purchase,
  receivePurchase,
  finance,
  processOutbox,
} from '@/lib/operations';
import { paymentModes, requireProvider } from '@/lib/payments';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Order filters shared by the list and its tab counts. Days are Africa/Mogadishu (UTC+3). */
function orderFilters(url: URL, restaurantId: string): Prisma.OrderWhereInput {
  const from = url.searchParams.get('from'),
    to = url.searchParams.get('to'),
    q = url.searchParams.get('q')?.trim().slice(0, 60);
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = new Date(z.string().regex(DAY).parse(from) + 'T00:00:00+03:00');
  if (to) {
    const end = new Date(z.string().regex(DAY).parse(to) + 'T00:00:00+03:00');
    end.setUTCDate(end.getUTCDate() + 1);
    createdAt.lt = end;
  }
  return {
    restaurantId,
    ...(from || to ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { guestName: { contains: q, mode: 'insensitive' } },
            { guestPhone: { contains: q } },
            { deliveryAddress: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}
async function handle(request: Request, context: Context) {
  try {
    const { path: p } = await context.params;
    const path = p.join('/'),
      method = request.method,
      url = new URL(request.url);
    // Provider callbacks are verified by signature instead of the same-origin rule.
    if (!(p[0] === 'webhooks' && method === 'POST')) sameOrigin(request);
    const json = (data: unknown, status = 200, headers?: Record<string, string>) =>
      NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
    const body = async () => {
      ensure(Number(request.headers.get('content-length') || 0) <= 65536, 'Request too large', 413);
      const text = await request.text();
      ensure(text.length <= 65536, 'Request too large', 413);
      try {
        return JSON.parse(text);
      } catch {
        throw new AppError(400, 'Invalid JSON');
      }
    };
    if (path === 'health' && method === 'GET') {
      await db.$queryRaw`SELECT 1`;
      return json({ status: 'ok', service: 'botan', database: 'connected' });
    }
    if (path === 'restaurant' && method === 'GET') {
      const r = await restaurant();
      return json({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        address: r.address,
        currency: r.currency,
        timezone: r.timezone,
        isAcceptingOrders: r.isAcceptingOrders,
        settings: r.settings,
        hours: r.hours,
        paymentModes: paymentModes(),
      });
    }
    if (path === 'auth/me' && method === 'GET') return json({ user: await actor(request) });
    if (path === 'auth/staff/login' && method === 'POST') {
      const data = z
        .object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(72) })
        .strict()
        .parse(await body());
      const identity = data.email.toLowerCase();
      await limit(`login:${digest(identity)}`, 8, 900);
      await limit(`login-ip:${digest(request.headers.get('x-forwarded-for') || 'local')}`, 40, 900);
      const user = await db.staffUser.findUnique({ where: { email: identity } });
      const valid = await verifyPassword(
        data.password,
        user?.passwordHash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.0WsVrH6QUnAm/uCixnH4DcZ1Kc7JrP2',
      );
      ensure(user && valid && user.status === 'ACTIVE', 'Email ama password khaldan', 401);
      return json({ ok: true, role: user.role }, 200, {
        'Set-Cookie': await createSession(user.id, 'staff'),
      });
    }
    if (path === 'auth/logout' && method === 'POST') {
      const token = cookieToken(request);
      if (token) await db.authSession.deleteMany({ where: { tokenHash: digest(token) } });
      return json({ ok: true }, 200, {
        'Set-Cookie': 'botan_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
      });
    }
    if (path === 'auth/refresh' && method === 'POST') {
      const u = await requireActor(request);
      const token = cookieToken(request);
      if (token) await db.authSession.deleteMany({ where: { tokenHash: digest(token) } });
      return json({ ok: true }, 200, { 'Set-Cookie': await createSession(u.id, u.kind) });
    }
    // ---- Menu for the order screen ----
    if (path === 'menu/categories' && method === 'GET') {
      const u = await requireActor(request, ORDER_TAKERS);
      return json(
        await db.menuCategory.findMany({
          where: { restaurantId: u.restaurantId, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
      );
    }
    if (path === 'menu/items' && method === 'GET') {
      const u = await requireActor(request, ORDER_TAKERS);
      return json(
        await db.menuItem.findMany({
          where: { restaurantId: u.restaurantId, category: { isActive: true } },
          include: {
            category: true,
            modifierGroups: {
              include: { group: { include: { options: { where: { isAvailable: true } } } } },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          take: 500,
        }),
      );
    }
    if (path === 'delivery/zones' && method === 'GET') {
      const u = await requireActor(request, ORDER_TAKERS);
      return json(
        await db.deliveryZone.findMany({
          where: { restaurantId: u.restaurantId, isActive: true },
          orderBy: { name: 'asc' },
        }),
      );
    }
    // ---- Taking orders ----
    if (path === 'orders/quote' && method === 'POST') {
      const u = await requireActor(request, ORDER_TAKERS);
      const q = await quote(db, staffOrderSchema.parse(await body()), u.restaurantId);
      return json({
        subtotal: q.subtotal / 100,
        discount: q.discount / 100,
        tax: q.tax / 100,
        deliveryFee: q.deliveryFee / 100,
        total: q.total / 100,
      });
    }
    if (path === 'orders' && method === 'POST') {
      const u = await requireActor(request, ORDER_TAKERS);
      await limit(`orders:${u.id}`, 40);
      return json(
        await createOrder(
          staffOrderSchema.parse(await body()),
          request.headers.get('idempotency-key') || '',
          u,
          request.headers.has('x-expected-total')
            ? Number(request.headers.get('x-expected-total'))
            : undefined,
        ),
        201,
      );
    }
    /** The last delivery to this phone, to fill in the name and address. */
    if (path === 'customers/lookup' && method === 'GET') {
      const u = await requireActor(request, ORDER_TAKERS);
      const phone = z
        .string()
        .trim()
        .regex(/^\+?[\d\s-]{7,20}$/)
        .parse(url.searchParams.get('phone') || '');
      const last = await db.order.findFirst({
        where: { restaurantId: u.restaurantId, guestPhone: phone },
        orderBy: { createdAt: 'desc' },
        select: { guestName: true, deliveryAddress: true, zoneId: true, createdAt: true },
      });
      const count = last
        ? await db.order.count({ where: { restaurantId: u.restaurantId, guestPhone: phone } })
        : 0;
      return json(last ? { ...last, orderCount: count } : null);
    }
    // ---- Orders list (pending / assigned / delivered / cancelled) ----
    if (path === 'admin/orders' && method === 'GET') {
      const u = await requireActor(request, ORDER_READERS);
      const view = url.searchParams.get('view'),
        take = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 300);
      const where = orderFilters(url, u.restaurantId);
      const [orders, grouped] = await Promise.all([
        db.order.findMany({
          where: {
            ...where,
            ...(view
              ? { status: { in: viewStatuses[z.enum(ORDER_VIEWS).parse(view)] as never[] } }
              : {}),
          },
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take,
        }),
        db.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      ]);
      const counts = Object.fromEntries(ORDER_VIEWS.map((v) => [v, 0])) as Record<
        OrderView,
        number
      >;
      for (const g of grouped)
        for (const v of ORDER_VIEWS)
          if (viewStatuses[v].includes(g.status)) counts[v] += g._count._all;
      return json({ orders, counts });
    }
    if (p[0] === 'admin' && p[1] === 'orders' && p[2] && p.length === 3 && method === 'GET') {
      const u = await requireActor(request, ORDER_READERS);
      const o = await db.order.findFirst({
        where: { id: z.uuid().parse(p[2]), restaurantId: u.restaurantId },
        include: orderInclude,
      });
      ensure(o, 'Order not found', 404);
      return json(o);
    }
    if (p[0] === 'admin' && p[1] === 'orders' && p[2] && p[3] === 'assign' && method === 'POST') {
      const u = await requireActor(request, ORDER_TAKERS);
      const d = z
        .object({ riderId: z.uuid() })
        .strict()
        .parse(await body());
      return json(await assignRider(z.uuid().parse(p[2]), d.riderId, u));
    }
    if (p[0] === 'admin' && p[1] === 'orders' && p[2] && p[3] === 'status' && method === 'PATCH') {
      const u = await requireActor(request, MANAGERS);
      const d = z
        .object({ status: z.literal('CANCELLED') })
        .strict()
        .parse(await body());
      return json(await transitionOrder(z.uuid().parse(p[2]), d.status, u));
    }
    if (
      ['admin', 'rider'].includes(p[0]) &&
      p[1] === 'orders' &&
      p[2] &&
      p[3] === 'complete-delivery' &&
      method === 'POST'
    ) {
      const user = await requireActor(
        request,
        p[0] === 'admin' ? ORDER_TAKERS : ['OWNER', 'MANAGER', 'RIDER'],
      );
      return json(await completeDelivery(z.uuid().parse(p[2]), await body(), user));
    }
    if (path === 'rider/orders' && method === 'GET') {
      const u = await requireActor(request, ['OWNER', 'MANAGER', 'RIDER']);
      return json(
        await db.order.findMany({
          where: {
            restaurantId: u.restaurantId,
            ...(u.role === 'RIDER'
              ? { delivery: { riderId: u.id } }
              : { delivery: { isNot: null } }),
            status: { in: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'] },
          },
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
    }
    // ---- Riders ----
    if (path === 'admin/delivery/riders' && method === 'GET') {
      const u = await requireActor(request, ORDER_TAKERS);
      const [riders, busy] = await Promise.all([
        db.staffUser.findMany({
          where: { restaurantId: u.restaurantId, role: 'RIDER', status: 'ACTIVE' },
          select: { id: true, fullName: true, phone: true, email: true },
          orderBy: { fullName: 'asc' },
        }),
        db.delivery.groupBy({
          by: ['riderId'],
          where: { order: { restaurantId: u.restaurantId, status: 'OUT_FOR_DELIVERY' } },
          _count: { _all: true },
        }),
      ]);
      return json(
        riders.map((r) => ({
          ...r,
          activeOrders: busy.find((b) => b.riderId === r.id)?._count._all || 0,
        })),
      );
    }
    if (path === 'admin/delivery/riders' && method === 'POST') {
      const user = await requireActor(request, MANAGERS);
      return json(await createRider(await body(), user), 201);
    }
    // ---- Payments ----
    if (path === 'admin/payments' && method === 'GET') {
      const u = await requireActor(request, [...FINANCE, 'OPERATOR']);
      return json(
        await db.payment.findMany({
          where: { order: { restaurantId: u.restaurantId } },
          include: {
            order: { select: { orderNumber: true, guestName: true, status: true } },
            refunds: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      );
    }
    if (p[0] === 'payments' && p[1] && p[2] === 'capture' && method === 'POST') {
      const u = await requireActor(request, [...ORDER_TAKERS, 'RIDER']);
      return json(await capturePayment(z.uuid().parse(p[1]), u, captureSchema.parse(await body())));
    }
    if (p[0] === 'payments' && p[1] && p[2] === 'refund' && method === 'POST') {
      const u = await requireActor(request, FINANCE);
      return json(
        await refundPayment(p[1], await body(), request.headers.get('idempotency-key') || '', u),
      );
    }
    if (p[0] === 'payments' && p[1] && p[2] === 'initialize' && method === 'POST') {
      const u = await requireActor(request, ORDER_TAKERS);
      const payment = await db.payment.findFirst({
        where: { id: z.uuid().parse(p[1]), order: { restaurantId: u.restaurantId } },
        include: { order: true },
      });
      ensure(payment, 'Payment not found', 404);
      ensure(['PENDING', 'UNPAID'].includes(payment.status), 'Payment is not open', 409);
      ensure(payment.providerReference, 'Geli telefoonka lacag bixiyaha');
      const result = await requireProvider(payment.method).initiate({
        paymentId: payment.id,
        orderNumber: payment.order.orderNumber,
        amountCents: Math.round(Number(payment.amount) * 100),
        payerPhone: payment.providerReference,
      });
      await transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            provider: payment.method,
            providerTransactionId: result.providerTransactionId,
            status: 'PENDING',
          },
        });
        await audit(tx, u, 'PAYMENT_INITIATE', 'Payment', payment.id, { method: payment.method });
      });
      return json({ ok: true, status: 'PENDING' });
    }
    if (p[0] === 'webhooks' && p[1] === 'payments' && p[2] && method === 'POST') {
      // Throws 501 until a provider is implemented and configured (see lib/payments.ts).
      const provider = requireProvider(p[2].toUpperCase());
      ensure(Number(request.headers.get('content-length') || 0) <= 65536, 'Request too large', 413);
      const verified = await provider.verifyCallback(await request.text(), request.headers);
      await transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { providerTransactionId: verified.providerTransactionId },
        });
        ensure(payment && payment.method === provider.method, 'Payment not found', 404);
        if (payment.status !== 'PENDING') return;
        if (verified.status === 'FAILED') {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
          return;
        }
        ensure(
          verified.amountCents === Math.round(Number(payment.amount) * 100),
          'Amount mismatch',
          409,
        );
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID', paidAt: new Date() },
        });
        const paid = await tx.payment.findMany({
          where: { orderId: payment.orderId, paidAt: { not: null } },
        });
        const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
        const captured = paid.reduce((s, x) => s + Math.round(Number(x.amount) * 100), 0);
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus:
              captured >= Math.round(Number(order.total) * 100)
                ? 'PAID'
                : captured
                  ? 'PENDING'
                  : 'UNPAID',
          },
        });
      });
      return json({ ok: true });
    }
    if (p[0] === 'webhooks') throw new AppError(404, 'Endpoint not found');
    // ---- Reports, menu admin, pantry, purchasing ----
    if (path === 'admin/summary' && method === 'GET') {
      const u = await requireActor(request, FINANCE);
      return json(await finance(u.restaurantId));
    }
    if (p[0] === 'admin' && p[1] === 'resources' && isResource(p[2])) {
      const name = p[2],
        u = await requireActor(
          request,
          name === 'expenses' || (method === 'GET' && ['suppliers', 'inventory'].includes(name))
            ? FINANCE
            : MANAGERS,
        );
      if (method === 'GET') return json(await listResource(name, u));
      if (method === 'POST' || method === 'PATCH')
        return json(await saveResource(name, await body(), u, p[3]), method === 'POST' ? 201 : 200);
      if (method === 'DELETE') {
        ensure(u.role === 'OWNER' || u.role === 'MANAGER', 'Permission denied', 403);
        ensure(name !== 'staff', 'Suspend staff instead of deleting', 400);
        ensure(p[3], 'ID required');
        return json(
          await transaction(async (tx) => {
            const model = delegate(tx, name);
            const row = await model.findFirst({
              where: { id: p[3], restaurantId: u.restaurantId },
            });
            ensure(row, 'Resource not found', 404);
            await model.delete({ where: { id: p[3] } });
            await audit(tx, u, 'DELETE', name, p[3]);
            return { ok: true };
          }),
        );
      }
    }
    if (path === 'admin/inventory/movements') {
      const u = await requireActor(request, MANAGERS);
      if (method === 'POST') return json(await stockMovement(await body(), u), 201);
      if (method === 'GET')
        return json(
          await db.inventoryMovement.findMany({
            where: { item: { restaurantId: u.restaurantId } },
            include: { item: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
          }),
        );
    }
    if (path === 'admin/purchases') {
      const u = await requireActor(request, [...FINANCE]);
      if (method === 'GET')
        return json(
          await db.purchase.findMany({
            where: { restaurantId: u.restaurantId },
            include: { supplier: true, lines: { include: { item: true } } },
            orderBy: { createdAt: 'desc' },
            take: 200,
          }),
        );
      if (method === 'POST') return json(await purchase(await body(), u), 201);
    }
    if (
      p[0] === 'admin' &&
      p[1] === 'purchases' &&
      p[2] &&
      p[3] === 'receive' &&
      method === 'POST'
    ) {
      const u = await requireActor(request, MANAGERS);
      return json(await receivePurchase(p[2], u));
    }
    if (path === 'admin/recipes' && method === 'POST') {
      const u = await requireActor(request, MANAGERS),
        d = z
          .object({
            menuItemId: z.uuid(),
            inventoryItemId: z.uuid(),
            quantity: z.number().positive().max(1000000),
          })
          .strict()
          .parse(await body());
      ensure(
        (await db.menuItem.findFirst({
          where: { id: d.menuItemId, restaurantId: u.restaurantId },
        })) &&
          (await db.inventoryItem.findFirst({
            where: { id: d.inventoryItemId, restaurantId: u.restaurantId },
          })),
        'Menu or inventory item not found',
      );
      return json(
        await db.recipeIngredient.upsert({
          where: {
            menuItemId_inventoryItemId: {
              menuItemId: d.menuItemId,
              inventoryItemId: d.inventoryItemId,
            },
          },
          create: d,
          update: { quantity: d.quantity },
        }),
      );
    }
    if (path === 'admin/modifier-options' && method === 'POST') {
      const u = await requireActor(request, MANAGERS),
        d = z
          .object({
            groupId: z.uuid(),
            name: z.string().min(1).max(100),
            priceDelta: z.number().nonnegative().max(10000),
            isAvailable: z.boolean().default(true),
          })
          .strict()
          .parse(await body());
      ensure(
        await db.modifierGroup.findFirst({
          where: { id: d.groupId, restaurantId: u.restaurantId },
        }),
        'Group not found',
      );
      return json(await db.modifierOption.create({ data: d }), 201);
    }
    if (path === 'admin/menu-modifiers' && method === 'POST') {
      const u = await requireActor(request, MANAGERS),
        d = z
          .object({ menuItemId: z.uuid(), groupId: z.uuid() })
          .strict()
          .parse(await body());
      ensure(
        (await db.menuItem.findFirst({
          where: { id: d.menuItemId, restaurantId: u.restaurantId },
        })) &&
          (await db.modifierGroup.findFirst({
            where: { id: d.groupId, restaurantId: u.restaurantId },
          })),
        'Group or item not found',
      );
      return json(
        await db.menuItemModifierGroup.upsert({
          where: { menuItemId_groupId: d },
          create: d,
          update: {},
        }),
      );
    }
    if (path === 'admin/audit-logs' && method === 'GET') {
      const u = await requireActor(request, MANAGERS);
      return json(
        await db.auditLog.findMany({
          where: { restaurantId: u.restaurantId },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      );
    }
    if (path === 'admin/notifications' && method === 'GET') {
      const u = await requireActor(request, MANAGERS);
      await processOutbox();
      return json(
        await db.notification.findMany({
          where: { restaurantId: u.restaurantId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      );
    }
    if (path === 'admin/restaurant/settings' && method === 'PATCH') {
      const u = await requireActor(request, MANAGERS);
      const d = z
        .object({
          name: z.string().trim().min(2).max(100).optional(),
          phone: z.string().max(30).optional(),
          address: z.string().max(300).optional(),
          isAcceptingOrders: z.boolean().optional(),
          taxRate: z.number().min(0).max(100).optional(),
          hours: z
            .array(
              z.object({
                dayOfWeek: z.number().int().min(0).max(6),
                opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                isClosed: z.boolean(),
              }),
            )
            .length(7)
            .optional(),
        })
        .strict()
        .parse(await body());
      return json(
        await transaction(async (tx) => {
          const { name, phone, address, isAcceptingOrders, hours, ...settings } = d;
          await tx.restaurant.update({
            where: { id: u.restaurantId },
            data: { name, phone, address, isAcceptingOrders },
          });
          if (hours) {
            ensure(
              new Set(hours.map((h) => h.dayOfWeek)).size === 7,
              'Each weekday must occur once',
            );
            for (const h of hours)
              await tx.openingHour.upsert({
                where: {
                  restaurantId_dayOfWeek: { restaurantId: u.restaurantId, dayOfWeek: h.dayOfWeek },
                },
                create: { ...h, restaurantId: u.restaurantId },
                update: h,
              });
          }
          await tx.restaurantSettings.update({
            where: { restaurantId: u.restaurantId },
            data: settings,
          });
          await audit(tx, u, 'SETTINGS_UPDATE', 'Restaurant', u.restaurantId);
          return { ok: true };
        }),
      );
    }
    if (path === 'internal/outbox' && method === 'GET') {
      const secret = process.env.CRON_SECRET;
      ensure(
        secret && constantEqual(request.headers.get('authorization') || '', `Bearer ${secret}`),
        'Unauthorized',
        401,
      );
      return json(await processOutbox());
    }
    throw new AppError(404, 'Endpoint not found');
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        return NextResponse.json({ error: 'This record already exists' }, { status: 409 });
      if (error.code === 'P2003')
        return NextResponse.json(
          { error: 'This record is still used by related records; disable it instead' },
          { status: 409 },
        );
      if (error.code === 'P2025')
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    console.error('API failure', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Adeegga lama heli karo hadda. Mar kale isku day.' },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
