import { describe, it, expect } from 'vitest';
import { parseTrackingToken, readSavedOrder } from '../src/lib/tracking';
const token = 'a'.repeat(64);
describe('private tracking link handling', () => {
  it('accepts a code, a tracking path, and checkout confirmation links', () => {
    expect(parseTrackingToken(token.toUpperCase())).toBe(token);
    expect(parseTrackingToken('/track/' + token)).toBe(token);
    expect(parseTrackingToken('https://food.daljir.tech/track/' + token)).toBe(token);
    expect(parseTrackingToken('https://previous.vercel.app/order/success?token=' + token)).toBe(
      token,
    );
  });
  it('rejects order-number guessing, scripts, and unrelated links', () => {
    for (const input of [
      'BTN-ABC123',
      'javascript:alert(1)',
      'https://example.com/?token=' + token,
      'x'.repeat(64),
      '/track/' + token + '/extra',
    ])
      expect(parseTrackingToken(input)).toBeNull();
  });
  it('handles invalid or blocked browser storage without breaking tracking', () => {
    expect(readSavedOrder({ getItem: () => '{invalid' })).toBeNull();
    expect(
      readSavedOrder({
        getItem: () => {
          throw new Error('storage blocked');
        },
      }),
    ).toBeNull();
    expect(
      readSavedOrder({ getItem: () => JSON.stringify({ token: 'wrong', orderNumber: 'BTN-1' }) }),
    ).toBeNull();
  });
  it('loads only the capability token and order number from a saved checkout', () => {
    expect(
      readSavedOrder({ getItem: () => JSON.stringify({ token, orderNumber: 'BTN-1', total: 10 }) }),
    ).toEqual({ token, orderNumber: 'BTN-1' });
  });
});
