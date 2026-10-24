import { assignRider, createRider, completeDelivery } from '@/lib/delivery';
import { trackingView } from '@/lib/tracking-view';
import QRCode from 'qrcode';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma, type OrderStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AppError, ensure } from '@/lib/errors';
import {
  actor,
  requireActor,
  createSession,
  verifyPassword,
  passwordHash,
  digest,
  cookieToken,
  sameOrigin,
  limit,
  MANAGERS,
  FINANCE,
  CASHIERS,
  constantEqual,
} from '@/lib/security';
import { checkoutSchema } from '@/lib/domain';
import {
  restaurant,
  quote,
  createOrder,
  transitionOrder,
  orderInclude,
  transaction,
  audit,
} from '@/lib/orders';
import { isResource, listResource, saveResource, delegate } from '@/lib/resources';
import {
  capturePayment,
  refundPayment,
  stockMovement,
  purchase,
  receivePurchase,
  openShift,
  closeShift,
  finance,
  processOutbox,
} from '@/lib/operations';
import {
  drainDaljir,
  handleWebhook,
  integrationStatus,
  scheduleDrain,
  syncMenuNow,
} from '@/lib/daljirconnect';
import { queueMenuSync } from '@/lib/daljir-queue';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { path: p } = await context.params;
    const path = p.join('/'),
      method = request.method,
      url = new URL(request.url);
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
    // Changes may have queued pushes to DaljirConnect (WhatsApp); staff boards polling also retry failed ones.
    if (method !== 'GET' || ['admin/orders', 'kitchen/orders', 'pos/orders'].includes(path))
      await scheduleDrain();
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
      });
    }
    if (path === 'menu/categories' && method === 'GET') {
      const r = await restaurant();
      return json(
        await db.menuCategory.findMany({
          where: { restaurantId: r.id, isActive: true },
          orderBy: { sortOrder: 'asc' },
        }),
      );
    }
    if (p[0] === 'menu' && p[1] === 'items' && method === 'GET') {
      const r = await restaurant();
      const where = {
        restaurantId: r.id,
        category: { isActive: true },
        ...(p[2] ? { slug: p[2] } : {}),
        ...(url.searchParams.get('category')
          ? { category: { slug: url.searchParams.get('category')!, isActive: true } }
          : {}),
      };
      const items = await db.menuItem.findMany({
        where,
        include: {
          category: true,
          modifierGroups: {
            include: { group: { include: { options: { where: { isAvailable: true } } } } },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: 100,
      });
      if (p[2]) {
        ensure(items[0], 'Menu item not found', 404);
        return json(items[0]);
      }
      return json(items);
    }
    if (path === 'delivery/zones' && method === 'GET') {
      const r = await restaurant();
      return json(
        await db.deliveryZone.findMany({ where: { restaurantId: r.id, isActive: true } }),
      );
    }
    if (path === 'offers' && method === 'GET') {
      const r = await restaurant(),
        now = new Date();
      return json(
        await db.coupon.findMany({
          where: {
            restaurantId: r.id,
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          select: {
            code: true,
            type: true,
            value: true,
            minSpend: true,
            maxDiscount: true,
            endsAt: true,
          },
        }),
      );
    }
    if (path === 'auth/me' && method === 'GET') return json({ user: await actor(request) });
    if (['auth/staff/login', 'auth/customer/login'].includes(path) && method === 'POST') {
      const data = z
        .object({ email: z.string().trim().min(3).max(200), password: z.string().min(1).max(72) })
        .strict()
        .parse(await body());
      const identity = data.email.toLowerCase();
      await limit(`login:${digest(identity)}`, 8, 900);
      await limit(`login-ip:${digest(request.headers.get('x-forwarded-for') || 'local')}`, 40, 900);
      const kind = path.includes('staff') ? 'staff' : 'customer';
      const user =
        kind === 'staff'
          ? await db.staffUser.findUnique({ where: { email: identity } })
          : await db.customer.findFirst({
              where: { OR: [{ email: identity }, { phone: identity }] },
            });
      const valid = await verifyPassword(
        data.password,
        user?.passwordHash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.0WsVrH6QUnAm/uCixnH4DcZ1Kc7JrP2',
      );
      ensure(
        user && valid && (!('status' in user) || user.status === 'ACTIVE'),
        'Email/telefoon ama password khaldan',
        401,
      );
      return json({ ok: true }, 200, { 'Set-Cookie': await createSession(user.id, kind) });
    }
    if (path === 'auth/customer/register' && method === 'POST') {
      const d = z
        .object({
          fullName: z.string().trim().min(2).max(100),
          phone: z.string().regex(/^\+?[\d\s-]{7,20}$/),
          email: z.email().toLowerCase().optional(),
          password: z.string().min(12).max(72),
        })
        .strict()
        .parse(await body());
      await limit(`register:${digest(request.headers.get('x-forwarded-for') || 'local')}`, 5, 3600);
      const r = await restaurant();
      if (d.email)
        ensure(
          !(await db.customer.findFirst({ where: { email: d.email } })),
          'Email already registered',
          409,
        );
      const user = await db.customer.create({
        data: {
          restaurantId: r.id,
          fullName: d.fullName,
          phone: d.phone,
          email: d.email,
          passwordHash: await passwordHash(d.password),
        },
      });
      return json({ ok: true }, 201, { 'Set-Cookie': await createSession(user.id, 'customer') });
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
    if (path === 'checkout/quote' && method === 'POST') {
      const user = await actor(request);
      await limit(
        `quote:${user?.id || digest(request.headers.get('x-forwarded-for') || 'local')}`,
        90,
      );
      const q = await quote(db, checkoutSchema.parse(await body()), user?.kind === 'staff');
      return json({
        subtotal: q.subtotal / 100,
        discount: q.discount / 100,
        tax: q.tax / 100,
        deliveryFee: q.deliveryFee / 100,
        total: q.total / 100,
      });
    }
    if ((path === 'orders' || path === 'pos/orders') && method === 'POST') {
      const user =
        path === 'pos/orders' ? await requireActor(request, CASHIERS) : await actor(request);
      await limit(
        `orders:${user?.id || digest(request.headers.get('x-forwarded-for') || 'local')}`,
        15,
      );
      return json(
        await createOrder(
          checkoutSchema.parse(await body()),
          request.headers.get('idempotency-key') || '',
          user,
          request.headers.has('x-expected-total')
            ? Number(request.headers.get('x-expected-total'))
            : undefined,
        ),
        201,
      );
    }
    if (p[0] === 'orders' && p[1] === 'track' && p[2] && method === 'GET') {
      await limit(`track:${digest(request.headers.get('x-forwarded-for') || 'local')}`, 120);
      const o = await db.order.findUnique({
        where: { trackingTokenHash: digest(p[2]) },
        include: orderInclude,
      });
      ensure(o, 'Order not found', 404);
      return json(trackingView(o));
    }
    if (
      p[0] === 'customers' &&
      p[1] === 'me' &&
      p[2] === 'orders' &&
      p[3] &&
      p[4] === 'track' &&
      method === 'GET'
    ) {
      const user = await requireActor(request, ['CUSTOMER']);
      const id = z.uuid().parse(p[3]);
      const order = await db.order.findFirst({
        where: { id, customerId: user.id },
        include: orderInclude,
      });
      ensure(order, 'Order not found', 404);
      return json(trackingView(order));
    }
    if (path === 'customers/me/orders' && method === 'GET') {
      const u = await requireActor(request, ['CUSTOMER']);
      return json(
        await db.order.findMany({
          where: { customerId: u.id },
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      );
    }
    if (path === 'customers/me/addresses') {
      const u = await requireActor(request, ['CUSTOMER']);
      if (method === 'GET')
        return json(await db.customerAddress.findMany({ where: { customerId: u.id } }));
      if (method === 'POST') {
        const d = z
          .object({
            label: z.string().max(80).optional(),
            district: z.string().min(2).max(100),
            description: z.string().min(5).max(400),
            isDefault: z.boolean().default(false),
          })
          .strict()
          .parse(await body());
        return json(
          await transaction(async (tx) => {
            if (d.isDefault)
              await tx.customerAddress.updateMany({
                where: { customerId: u.id },
                data: { isDefault: false },
              });
            return tx.customerAddress.create({ data: { ...d, customerId: u.id } });
          }),
          201,
        );
      }
    }
    if (p.slice(0, 3).join('/') === 'customers/me/addresses' && p[3] && method === 'DELETE') {
      const u = await requireActor(request, ['CUSTOMER']);
      const deleted = await db.customerAddress.deleteMany({
        where: { id: p[3], customerId: u.id },
      });
      ensure(deleted.count, 'Address not found', 404);
      return json({ ok: true });
    }
    if (path === 'reviews' && method === 'GET') {
      return json(
        await db.review
          .findMany({
            where: { isPublished: true },
            select: {
              id: true,
              rating: true,
              comment: true,
              createdAt: true,
              customer: { select: { fullName: true } },
            },
            take: 12,
            orderBy: { createdAt: 'desc' },
          })
          .then((rows) =>
            rows.map(({ customer, ...review }) => ({
              ...review,
              name: customer?.fullName.split(' ')[0] || 'Customer',
            })),
          ),
      );
    }
    if (p[0] === 'admin' && p[1] === 'reviews') {
      const u = await requireActor(request, MANAGERS);
      if (method === 'GET')
        return json(
          await db.review.findMany({
            where: { order: { restaurantId: u.restaurantId } },
            include: {
              customer: { select: { fullName: true } },
              order: { select: { orderNumber: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
          }),
        );
      if (method === 'PATCH' && p[2]) {
        const d = z
          .object({ isPublished: z.boolean() })
          .strict()
          .parse(await body());
        const review = await db.review.findFirst({
          where: { id: p[2], order: { restaurantId: u.restaurantId } },
        });
        ensure(review, 'Review not found', 404);
        return json(
          await transaction(async (tx) => {
            const result = await tx.review.update({ where: { id: p[2] }, data: d });
            await audit(tx, u, 'MODERATE_REVIEW', 'Review', p[2]);
            return result;
          }),
        );
      }
    }
    if (path === 'reviews' && method === 'POST') {
      const u = await requireActor(request, ['CUSTOMER']);
      const d = z
        .object({
          orderId: z.uuid(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(1000).optional(),
        })
        .strict()
        .parse(await body());
      const order = await db.order.findFirst({
        where: { id: d.orderId, customerId: u.id, status: 'COMPLETED' },
      });
      ensure(order, 'Only your completed orders may be reviewed', 403);
      return json(await db.review.create({ data: { ...d, customerId: u.id } }), 201);
    }
    if (path === 'admin/summary' && method === 'GET') {
      const u = await requireActor(request, FINANCE);
      return json(await finance(u.restaurantId));
    }
    if (
      (path === 'admin/orders' ||
        path === 'kitchen/orders' ||
        path === 'rider/orders' ||
        path === 'pos/orders') &&
      method === 'GET'
    ) {
      const u = await requireActor(
        request,
        path === 'kitchen/orders'
          ? ['OWNER', 'MANAGER', 'CHEF']
          : path === 'rider/orders'
            ? ['OWNER', 'MANAGER', 'RIDER']
            : ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT'],
      );
      const status = url.searchParams.get('status'),
        take = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 200);
      const rows = await db.order.findMany({
        where: {
          restaurantId: u.restaurantId,
          ...(path === 'kitchen/orders'
            ? { status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'] as OrderStatus[] } }
            : {}),
          ...(u.role === 'RIDER' ? { delivery: { riderId: u.id } } : {}),
          ...(status
            ? {
                status: z
                  .enum([
                    'CREATED',
                    'AWAITING_PAYMENT',
                    'PENDING_APPROVAL',
                    'CONFIRMED',
                    'PREPARING',
                    'READY',
                    'OUT_FOR_DELIVERY',
                    'COMPLETED',
                    'CANCELLED',
                    'REJECTED',
                  ])
                  .parse(status),
              }
            : {}),
        },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        take,
      });
      return json(
        u.role === 'CHEF'
          ? rows.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              type: o.type,
              status: o.status,
              createdAt: o.createdAt,
              notes: o.notes,
              items: o.items,
              table: o.table,
            }))
          : rows,
      );
    }
    if (p[0] === 'admin' && p[1] === 'orders' && p[2] && p.length === 3 && method === 'GET') {
      const u = await requireActor(request, ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT']);
      const o = await db.order.findFirst({
        where: { id: p[2], restaurantId: u.restaurantId },
        include: orderInclude,
      });
      ensure(o, 'Order not found', 404);
      return json(o);
    }
    if (
      ['admin', 'kitchen', 'rider'].includes(p[0]) &&
      p[1] === 'orders' &&
      p[2] &&
      p[3] === 'status' &&
      method === 'PATCH'
    ) {
      const u = await requireActor(request, ['OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'RIDER']);
      const d = z
        .object({
          status: z.enum([
            'CONFIRMED',
            'PREPARING',
            'READY',
            'OUT_FOR_DELIVERY',
            'COMPLETED',
            'CANCELLED',
            'REJECTED',
          ]),
          proofNote: z.string().trim().min(3).max(500).optional(),
        })
        .strict()
        .parse(await body());
      return json(await transitionOrder(p[2], d.status, u, d.proofNote));
    }
    if (p[0] === 'admin' && p[1] === 'resources' && isResource(p[2])) {
      const name = p[2],
        u = await requireActor(
          request,
          name === 'expenses' || (method === 'GET' && ['suppliers', 'inventory'].includes(name))
            ? FINANCE
            : name === 'tables'
              ? ['OWNER', 'MANAGER', 'CASHIER']
              : MANAGERS,
        );
      if (method === 'GET') return json(await listResource(name, u));
      if (method === 'POST' || method === 'PATCH') {
        if (name === 'tables' && u.role === 'CASHIER') {
          const d = z
            .object({ status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED']) })
            .strict()
            .parse(await body());
          ensure(p[3], 'Table ID required');
          return json(await saveResource(name, d, u, p[3]));
        }
        return json(await saveResource(name, await body(), u, p[3]), method === 'POST' ? 201 : 200);
      }
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
            if (name === 'menu' || name === 'categories') await queueMenuSync(tx, u.restaurantId);
            return { ok: true };
          }),
        );
      }
    }
    if (path === 'admin/customers' && method === 'GET') {
      const u = await requireActor(request, MANAGERS);
      return json(
        await db.customer.findMany({
          where: { restaurantId: u.restaurantId },
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            createdAt: true,
            _count: { select: { orders: true } },
          },
          take: 200,
        }),
      );
    }
    if (path === 'admin/payments' && method === 'GET') {
      const u = await requireActor(request, [...FINANCE, 'CASHIER']);
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
      const u = await requireActor(request, [...CASHIERS, 'RIDER']);
      const d = z
        .object({ amount: z.number().positive().optional() })
        .strict()
        .parse(await body());
      return json(await capturePayment(p[1], u, d.amount));
    }
    if (p[0] === 'payments' && p[1] && p[2] === 'refund' && method === 'POST') {
      const u = await requireActor(request, FINANCE);
      return json(
        await refundPayment(p[1], await body(), request.headers.get('idempotency-key') || '', u),
      );
    }
    if (p[0] === 'payments' && p[1] && p[2] === 'initialize')
      throw new AppError(
        501,
        'Online payment provider is not configured. Cash payment is available.',
      );
    if (path === 'webhooks/daljirconnect' && method === 'POST') {
      ensure(
        Number(request.headers.get('content-length') || 0) <= 262144,
        'Request too large',
        413,
      );
      const raw = await request.text();
      ensure(raw.length <= 262144, 'Request too large', 413);
      return json(await handleWebhook(raw, request.headers.get('x-daljirconnect-signature')));
    }
    if (path === 'admin/integrations/daljirconnect' && method === 'GET') {
      const u = await requireActor(request, MANAGERS);
      return json(await integrationStatus(u.restaurantId, url.origin));
    }
    if (path === 'admin/integrations/daljirconnect/sync' && method === 'POST') {
      const u = await requireActor(request, MANAGERS);
      const result = await syncMenuNow(u.restaurantId);
      return json({ ...result, status: await integrationStatus(u.restaurantId, url.origin) });
    }
    if (p[0] === 'webhooks')
      throw new AppError(
        503,
        'Payment webhooks disabled until a verified provider adapter and signature configuration are installed',
      );
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
    if (path === 'admin/delivery/riders' && method === 'POST') {
      const user = await requireActor(request, MANAGERS);
      return json(await createRider(await body(), user), 201);
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
        p[0] === 'admin' ? MANAGERS : ['OWNER', 'MANAGER', 'RIDER'],
      );
      return json(await completeDelivery(z.uuid().parse(p[2]), await body(), user));
    }
    if (path === 'admin/delivery/riders' && method === 'GET') {
      const u = await requireActor(request, MANAGERS);
      return json(
        await db.staffUser.findMany({
          where: { restaurantId: u.restaurantId, role: 'RIDER', status: 'ACTIVE' },
          select: { id: true, fullName: true, phone: true, email: true },
        }),
      );
    }
    if (path === 'admin/deliveries' && method === 'GET') {
      const u = await requireActor(request, MANAGERS);
      return json(
        await db.delivery.findMany({
          where: { order: { restaurantId: u.restaurantId } },
          include: {
            order: {
              select: { orderNumber: true, guestName: true, deliveryAddress: true, status: true },
            },
            rider: { select: { fullName: true } },
          },
          take: 200,
        }),
      );
    }
    if (p[0] === 'admin' && p[1] === 'deliveries' && p[2] && method === 'PATCH') {
      const u = await requireActor(request, MANAGERS),
        d = z
          .object({ riderId: z.uuid() })
          .strict()
          .parse(await body());
      return json(await assignRider(z.uuid().parse(p[2]), d.riderId, u));
    }
    if (p[0] === 'tables' && p[1] && method === 'GET') {
      const table = await db.diningTable.findUnique({
        where: { qrToken: p[1] },
        select: { tableNumber: true, status: true },
      });
      ensure(table && table.status !== 'DISABLED', 'Table not found', 404);
      return json({ tableNumber: table.tableNumber });
    }
    if (p[0] === 'pos' && p[1] === 'tables' && p[2] && p[3] === 'qr' && method === 'GET') {
      const u = await requireActor(request, CASHIERS);
      const table = await db.diningTable.findFirst({
        where: { id: p[2], restaurantId: u.restaurantId },
      });
      ensure(table, 'Table not found', 404);
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const svg = await QRCode.toString(origin + '/menu?table=' + table.qrToken, {
        type: 'svg',
        margin: 2,
        color: { dark: '#153B30', light: '#FFF9EE' },
      });
      return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' },
      });
    }
    if (path === 'pos/tables' && method === 'GET') {
      const u = await requireActor(request, CASHIERS);
      return json(
        await db.diningTable.findMany({
          where: { restaurantId: u.restaurantId },
          include: {
            orders: {
              where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] } },
              select: { id: true, orderNumber: true, total: true },
            },
          },
        }),
      );
    }
    if (path === 'pos/shifts') {
      const u = await requireActor(request, CASHIERS);
      if (method === 'GET')
        return json(
          await db.cashierShift.findMany({
            where: {
              restaurantId: u.restaurantId,
              ...(u.role === 'CASHIER' ? { cashierId: u.id } : {}),
            },
            include: { cashier: { select: { fullName: true } } },
            orderBy: { openedAt: 'desc' },
            take: 100,
          }),
        );
      if (method === 'POST') return json(await openShift(await body(), u), 201);
    }
    if (p[0] === 'pos' && p[1] === 'shifts' && p[2] && p[3] === 'close' && method === 'POST') {
      const u = await requireActor(request, CASHIERS);
      return json(await closeShift(p[2], await body(), u));
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
          minimumOrder: z.number().min(0).max(10000).optional(),
          averagePrepMinutes: z.number().int().min(1).max(240).optional(),
          deliveryEnabled: z.boolean().optional(),
          pickupEnabled: z.boolean().optional(),
          dineInEnabled: z.boolean().optional(),
          guestCheckoutEnabled: z.boolean().optional(),
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
      return json({ ...(await processOutbox()), daljirconnect: await drainDaljir(100) });
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
