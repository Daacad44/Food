import { z } from 'zod';
import { ensure } from './errors';
export const money = (value: unknown) => Math.round(Number(value) * 100);
export const decimal = (cents: number) => (cents / 100).toFixed(2);
export const formatMoney = (value: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
export const terminal = ['COMPLETED', 'CANCELLED', 'REJECTED'];
export const transitions: Record<string, string[]> = {
  CREATED: ['PENDING_APPROVAL', 'CANCELLED'],
  AWAITING_PAYMENT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};
export function canTransition(from: string, to: string, type: string) {
  return (
    !!transitions[from]?.includes(to) &&
    !(to === 'OUT_FOR_DELIVERY' && type !== 'DELIVERY') &&
    !(from === 'READY' && to === 'COMPLETED' && type === 'DELIVERY')
  );
}
export const checkoutSchema = z
  .object({
    items: z
      .array(
        z.object({
          menuItemId: z.uuid(),
          quantity: z.number().int().min(1).max(30),
          modifierOptionIds: z.array(z.uuid()).max(20).default([]),
          specialInstructions: z.string().max(300).default(''),
        }),
      )
      .min(1)
      .max(40),
    type: z.enum(['DELIVERY', 'PICKUP', 'DINE_IN']),
    guestName: z.string().trim().min(2).max(100),
    guestPhone: z.string().regex(/^\+?[\d\s-]{7,20}$/),
    deliveryAddress: z.string().trim().max(400).optional(),
    zoneId: z.uuid().optional(),
    tableId: z.uuid().optional(),
    tableToken: z.uuid().optional(),
    couponCode: z.string().trim().max(40).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export function calculateTotals(
  subtotal: number,
  discount: number,
  taxRate: number,
  deliveryFee: number,
) {
  ensure(
    Number.isSafeInteger(subtotal) && subtotal >= 0 && discount >= 0 && discount <= subtotal,
    'Invalid pricing',
  );
  const tax = Math.round(((subtotal - discount) * taxRate) / 100);
  return { subtotal, discount, tax, deliveryFee, total: subtotal - discount + tax + deliveryFee };
}
export function restaurantOpen(
  hours: { dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }[],
  timezone: string,
  date = new Date(),
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)?.value || '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    time = `${get('hour')}:${get('minute')}`;
  if (!hours.length) return false;
  return hours.some(
    (h) =>
      !h.isClosed &&
      (h.opensAt < h.closesAt
        ? h.dayOfWeek === day && time >= h.opensAt && time < h.closesAt
        : (h.dayOfWeek === day && time >= h.opensAt) ||
          ((h.dayOfWeek + 1) % 7 === day && time < h.closesAt)),
  );
}
