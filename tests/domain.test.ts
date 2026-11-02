import { describe, it, expect } from 'vitest';
import {
  calculateTotals,
  canTransition,
  decimal,
  money,
  orderView,
  percentDiscount,
  staffOrderSchema,
} from '../src/lib/domain';
const order = {
  items: [{ menuItemId: '6f1c4f39-6a2a-4d4c-9f3e-2b1d6c1a0b11', quantity: 1 }],
  customerPhone: '615442493',
  deliveryAddress: 'Bakaaro',
};
describe('money and lifecycle rules', () => {
  it('calculates discount before VAT using integer cents', () =>
    expect(calculateTotals(1000, 100, 5, 200)).toEqual({
      subtotal: 1000,
      discount: 100,
      tax: 45,
      deliveryFee: 200,
      total: 1145,
    }));
  it('matches the order screen example: $6 food, 5% VAT, no fee', () =>
    expect(calculateTotals(600, 0, 5, 0).total).toBe(630));
  it('applies percentage discounts in cents and never beyond the subtotal', () => {
    expect(percentDiscount(1999, 10)).toBe(200);
    expect(percentDiscount(500, 100)).toBe(500);
  });
  it('rounds currency without trusting floating point line totals', () => {
    expect(money('12.50')).toBe(1250);
    expect(decimal(1250)).toBe('12.50');
  });
  it('rejects impossible discount totals and fractional cents', () => {
    expect(() => calculateTotals(100, 101, 0, 0)).toThrow();
    expect(() => calculateTotals(100, 0, 0, 1.5)).toThrow();
  });
  it('follows pending → assigned → delivered and never skips back', () => {
    expect(canTransition('CONFIRMED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransition('OUT_FOR_DELIVERY', 'COMPLETED')).toBe(true);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'OUT_FOR_DELIVERY')).toBe(false);
    expect(canTransition('OUT_FOR_DELIVERY', 'CONFIRMED')).toBe(false);
  });
  it('treats orders from before the kitchen was removed as pending', () => {
    expect(orderView('PREPARING')).toBe('pending');
    expect(orderView('READY')).toBe('pending');
    expect(orderView('OUT_FOR_DELIVERY')).toBe('assigned');
    expect(orderView('COMPLETED')).toBe('delivered');
    expect(orderView('REJECTED')).toBe('cancelled');
  });
  it('requires a phone and address and rejects client-supplied totals', () => {
    expect(staffOrderSchema.safeParse(order).success).toBe(true);
    expect(staffOrderSchema.safeParse({ ...order, total: 1 }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ ...order, customerPhone: 'abc' }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ ...order, deliveryAddress: '' }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ ...order, discountPercent: 101 }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ ...order, paymentMethod: 'CARD' }).success).toBe(false);
  });
});
