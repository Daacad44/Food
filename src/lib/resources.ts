import { z } from 'zod';
import { db } from './db';
import { ensure } from './errors';
import { audit, transaction } from './orders';
import { passwordHash, type Actor } from './security';
const text = z.string().trim().min(1).max(200),
  id = z.uuid(),
  amount = z.coerce.number().finite().min(0).max(1000000),
  optionalText = z.string().trim().max(500).nullable().optional();
const image = z
  .union([
    z.literal(''),
    z.literal('/food-placeholder.svg'),
    z.string().regex(/^\/images\/[a-z0-9-]+\.(jpg|png|webp)$/),
    z
      .string()
      .url()
      .refine(
        (v) =>
          new URL(v).hostname === 'images.unsplash.com' ||
          new URL(v).hostname.endsWith('.supabase.co'),
        'Use Supabase Storage or Unsplash HTTPS images',
      )
      .refine((v) => v.startsWith('https://')),
  ])
  .nullable()
  .optional();
export const resourceSchemas = {
  categories: z.object({
    name: text,
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: optionalText,
    imageUrl: image,
    sortOrder: z.coerce.number().int().default(0),
    isActive: z.boolean().default(true),
  }),
  menu: z.object({
    name: text,
    slug: z.string().regex(/^[a-z0-9-]+$/),
    categoryId: id,
    description: optionalText,
    imageUrl: image,
    basePrice: amount,
    preparationMinutes: z.coerce.number().int().min(1).max(240).default(20),
    isAvailable: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    sortOrder: z.coerce.number().int().default(0),
  }),
  modifiers: z.object({
    name: text,
    minSelect: z.coerce.number().int().min(0).max(20),
    maxSelect: z.coerce.number().int().min(1).max(20),
    isRequired: z.boolean().default(false),
  }),
  zones: z.object({
    name: text,
    deliveryFee: amount,
    minimumOrder: amount.default(0),
    etaMinutes: z.coerce.number().int().min(1).max(240).default(30),
    isActive: z.boolean().default(true),
  }),
  tables: z.object({
    tableNumber: text,
    capacity: z.coerce.number().int().min(1).max(100),
    status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'DISABLED']).default('AVAILABLE'),
  }),
  inventory: z.object({
    name: text,
    sku: optionalText,
    unit: z.enum(['PIECE', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER']),
    reorderLevel: amount.default(0),
    averageUnitCost: amount.default(0),
    isActive: z.boolean().default(true),
  }),
  suppliers: z.object({
    name: text,
    phone: optionalText,
    email: z
      .union([z.email(), z.literal('')])
      .nullable()
      .optional(),
    address: optionalText,
  }),
  coupons: z.object({
    code: z.string().regex(/^[A-Z0-9-]{2,40}$/),
    type: z.enum(['FIXED', 'PERCENTAGE']),
    value: amount,
    maxDiscount: amount.nullable().optional(),
    minSpend: amount.default(0),
    usageLimit: z.coerce.number().int().min(1).nullable().optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    isActive: z.boolean().default(true),
  }),
  expenses: z.object({
    category: z.enum([
      'RENT',
      'UTILITIES',
      'SALARY',
      'MAINTENANCE',
      'MARKETING',
      'TRANSPORT',
      'OTHER',
    ]),
    description: text,
    amount: amount.refine((v) => v > 0),
    incurredAt: z.iso.datetime(),
    receiptUrl: image,
  }),
  staff: z.object({
    fullName: text,
    email: z.email().toLowerCase(),
    phone: optionalText,
    role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'RIDER', 'ACCOUNTANT']),
    status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
    password: z.string().min(12).max(72).optional(),
  }),
} as const;
export type Resource = keyof typeof resourceSchemas;
const models = {
  categories: 'menuCategory',
  menu: 'menuItem',
  modifiers: 'modifierGroup',
  zones: 'deliveryZone',
  tables: 'diningTable',
  inventory: 'inventoryItem',
  suppliers: 'supplier',
  coupons: 'coupon',
  expenses: 'expense',
  staff: 'staffUser',
} as const;
export function isResource(name: string): name is Resource {
  return name in models;
}
// Model delegates differ in generated types; each payload is validated by its resource-specific schema.
export function delegate(tx: unknown, name: Resource): any {
  return (tx as Record<string, unknown>)[models[name]];
}
export async function saveResource(
  name: Resource,
  payload: unknown,
  user: Actor,
  resourceId?: string,
) {
  const data: Record<string, any> = (
    resourceId ? resourceSchemas[name].partial() : resourceSchemas[name]
  )
    .strict()
    .parse(payload);
  // Defaults belong to create; PATCH must preserve all omitted fields.
  if (resourceId)
    for (const key of Object.keys(data))
      if (!(key in (payload as Record<string, unknown>))) delete data[key];
  if (name === 'staff') {
    ensure(user.role === 'OWNER', 'Only owner can manage staff', 403);
    if (resourceId === user.id)
      ensure(
        (!data.role || data.role === user.role) && (!data.status || data.status === 'ACTIVE'),
        'Cannot change your own role or status',
      );
    if (!resourceId) ensure(data.password, 'Password required');
    if (data.password) {
      data.passwordHash = await passwordHash(data.password);
      delete data.password;
    }
  }
  return transaction(async (tx) => {
    const model = delegate(tx, name);
    const previous = resourceId
      ? await model.findFirst({ where: { id: resourceId, restaurantId: user.restaurantId } })
      : null;
    if (resourceId) ensure(previous, 'Resource not found', 404);
    if (
      name === 'staff' &&
      previous?.role === 'OWNER' &&
      ((data.role && data.role !== 'OWNER') || data.status === 'SUSPENDED')
    )
      ensure(
        (await tx.staffUser.count({
          where: { restaurantId: user.restaurantId, role: 'OWNER', status: 'ACTIVE' },
        })) > 1,
        'Cannot remove the last active owner',
      );
    if (name === 'modifiers') {
      const merged = { ...previous, ...data };
      ensure(merged.minSelect <= merged.maxSelect, 'Minimum exceeds maximum');
    }
    if (name === 'coupons') {
      const merged = { ...previous, ...data };
      ensure(
        merged.type !== 'PERCENTAGE' || Number(merged.value) <= 100,
        'Percentage cannot exceed 100',
      );
      ensure(
        !merged.startsAt || !merged.endsAt || new Date(merged.startsAt) < new Date(merged.endsAt),
        'Invalid coupon dates',
      );
    }
    if (data.categoryId)
      ensure(
        await tx.menuCategory.findFirst({
          where: { id: data.categoryId, restaurantId: user.restaurantId },
        }),
        'Category not found',
      );
    if (!resourceId) data.restaurantId = user.restaurantId;
    if (name === 'expenses' && !resourceId) data.createdById = user.id;
    const result = resourceId
      ? await model.update({ where: { id: resourceId }, data })
      : await model.create({ data });
    if (name === 'staff' && resourceId && (data.passwordHash || data.role || data.status))
      await tx.authSession.deleteMany({ where: { subjectId: resourceId } });
    await audit(tx, user, resourceId ? 'UPDATE' : 'CREATE', name, result.id);
    const { passwordHash: _password, ...safe } = result;
    return safe;
  });
}
export async function listResource(name: Resource, user: Actor) {
  const include =
    name === 'menu'
      ? {
          category: true,
          modifierGroups: { include: { group: true } },
          recipes: { include: { inventoryItem: true } },
        }
      : name === 'modifiers'
        ? { options: true, items: true }
        : undefined;
  const rows = await delegate(db, name).findMany({
    where: { restaurantId: user.restaurantId },
    ...(include ? { include } : {}),
    take: 200,
    orderBy:
      name === 'expenses'
        ? { incurredAt: 'desc' }
        : name === 'staff'
          ? { fullName: 'asc' }
          : undefined,
  });
  return rows.map((row: Record<string, unknown>) => {
    const { passwordHash: _, ...safe } = row;
    return safe;
  });
}
