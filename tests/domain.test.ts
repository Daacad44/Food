import { describe, it, expect } from 'vitest';
import {
  calculateTotals,
  canTransition,
  checkoutSchema,
  decimal,
  money,
  restaurantOpen,
} from '../src/lib/domain';
describe('money and lifecycle rules', () => {
  it('calculates discount before tax using integer cents', () =>
    expect(calculateTotals(1000, 100, 5, 200)).toEqual({
      subtotal: 1000,
      discount: 100,
      tax: 45,
      deliveryFee: 200,
      total: 1145,
    }));
  it('rounds currency without trusting floating point line totals', () => {
    expect(money('12.50')).toBe(1250);
    expect(decimal(1250)).toBe('12.50');
  });
  it('rejects impossible discount totals', () =>
    expect(() => calculateTotals(100, 101, 0, 0)).toThrow());
  it('prevents skipped and repeated lifecycle transitions', () => {
    expect(canTransition('PENDING_APPROVAL', 'COMPLETED', 'DELIVERY')).toBe(false);
    expect(canTransition('COMPLETED', 'COMPLETED', 'PICKUP')).toBe(false);
    expect(canTransition('CONFIRMED', 'PREPARING', 'PICKUP')).toBe(true);
  });
  it('requires delivery orders to leave with a rider before completion', () => {
    expect(canTransition('READY', 'COMPLETED', 'DELIVERY')).toBe(false);
    expect(canTransition('READY', 'OUT_FOR_DELIVERY', 'PICKUP')).toBe(false);
  });
  it('validates restaurant-local opening hours', () => {
    const hours = [{ dayOfWeek: 3, opensAt: '07:00', closesAt: '23:30', isClosed: false }];
    expect(restaurantOpen(hours, 'Africa/Mogadishu', new Date('2026-10-21T06:00:00Z'))).toBe(true);
    expect(restaurantOpen(hours, 'Africa/Mogadishu', new Date('2026-10-21T21:00:00Z'))).toBe(false);
  });
  it('supports overnight hours on the following weekday', () =>
    expect(
      restaurantOpen(
        [{ dayOfWeek: 2, opensAt: '22:00', closesAt: '03:00', isClosed: false }],
        'Africa/Mogadishu',
        new Date('2026-10-20T23:00:00Z'),
      ),
    ).toBe(true));
  it('rejects client-supplied totals', () =>
    expect(checkoutSchema.safeParse({ items: [], total: 1 }).success).toBe(false));
});
