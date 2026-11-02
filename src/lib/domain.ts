import { z } from 'zod';
import { ensure } from './errors';
export const money = (value: unknown) => Math.round(Number(value) * 100);
export const decimal = (cents: number) => (cents / 100).toFixed(2);
export const formatMoney = (value: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

// Delivery-only flow. Staff take the order (it is confirmed immediately and stock is deducted),
// a rider is assigned (OUT_FOR_DELIVERY), the rider or staff confirm delivery (COMPLETED).
// CREATED / AWAITING_PAYMENT / PENDING_APPROVAL / PREPARING / READY only exist on orders made
// before the kitchen was removed; they behave like CONFIRMED.
export const terminal = ['COMPLETED', 'CANCELLED', 'REJECTED'];
const open = ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'];
export const transitions: Record<string, string[]> = {
  CREATED: open,
  AWAITING_PAYMENT: open,
  PENDING_APPROVAL: open,
  CONFIRMED: open,
  PREPARING: open,
  READY: open,
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};
export function canTransition(from: string, to: string) {
  return !!transitions[from]?.includes(to);
}

/** The four lists staff work from. */
export const ORDER_VIEWS = ['pending', 'assigned', 'delivered', 'cancelled'] as const;
export type OrderView = (typeof ORDER_VIEWS)[number];
export const viewStatuses: Record<OrderView, string[]> = {
  pending: ['CREATED', 'AWAITING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'PREPARING', 'READY'],
  assigned: ['OUT_FOR_DELIVERY'],
  delivered: ['COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED'],
};
export function orderView(status: string): OrderView {
  return (ORDER_VIEWS.find((v) => viewStatuses[v].includes(status)) || 'pending') as OrderView;
}

/** Mobile money is recorded by hand until a provider API is connected (see lib/payments.ts). */
export const PAYMENT_METHODS = ['CASH', 'EVC_PLUS', 'ZAAD', 'SAHAL'] as const;
export const paymentMethodLabel: Record<string, string> = {
  CASH: 'Cash',
  EVC_PLUS: 'EVC Plus',
  ZAAD: 'ZAAD',
  SAHAL: 'SAHAL',
  CARD: 'Card',
  OTHER: 'Other',
};

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, 'Telefoon sax ah geli');
export const staffOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          menuItemId: z.uuid(),
          quantity: z.number().int().min(1).max(100),
          modifierOptionIds: z.array(z.uuid()).max(20).default([]),
          specialInstructions: z.string().trim().max(300).default(''),
        }),
      )
      .min(1)
      .max(60),
    customerName: z.string().trim().max(100).default(''),
    customerPhone: phone,
    deliveryAddress: z.string().trim().min(2, 'Cinwaanka geli').max(400),
    zoneId: z.uuid().optional(),
    /** Set by the order taker; when omitted the zone's fee is used. */
    deliveryFee: z.number().min(0).max(1000).optional(),
    discountPercent: z.number().min(0).max(100).default(0),
    withVat: z.boolean().default(true),
    paymentMethod: z.enum(PAYMENT_METHODS).default('CASH'),
    /** The number the customer pays from (EVC Plus / ZAAD / SAHAL). */
    paymentPhone: phone.optional(),
    /** Money already received when the order is saved. */
    paid: z.boolean().default(false),
    riderId: z.uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type StaffOrderInput = z.infer<typeof staffOrderSchema>;

export function calculateTotals(
  subtotal: number,
  discount: number,
  taxRate: number,
  deliveryFee: number,
) {
  ensure(
    Number.isSafeInteger(subtotal) &&
      Number.isSafeInteger(discount) &&
      Number.isSafeInteger(deliveryFee) &&
      subtotal >= 0 &&
      discount >= 0 &&
      discount <= subtotal &&
      deliveryFee >= 0,
    'Invalid pricing',
  );
  const tax = Math.round(((subtotal - discount) * taxRate) / 100);
  return { subtotal, discount, tax, deliveryFee, total: subtotal - discount + tax + deliveryFee };
}
/** Discount as a percentage of the food subtotal, in cents. */
export const percentDiscount = (subtotal: number, percent: number) =>
  Math.min(subtotal, Math.round((subtotal * percent) / 100));
