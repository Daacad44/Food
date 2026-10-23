/** Extract a capability token without navigating to an untrusted pasted URL. */
export function parseTrackingToken(input: string): string | null {
  const value = input.trim();
  if (/^[a-f\d]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value, 'https://tracking.invalid');
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const token =
      /^\/track\/([a-f\d]{64})\/?$/i.exec(url.pathname)?.[1] ||
      (url.pathname === '/order/success' ? url.searchParams.get('token') : null);
    return token && /^[a-f\d]{64}$/i.test(token) ? token.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const deliverySteps = [
  { status: 'PENDING_APPROVAL', so: 'Dalabkii waa la helay', en: 'Order received' },
  { status: 'CONFIRMED', so: 'La xaqiijiyey', en: 'Confirmed' },
  { status: 'PREPARING', so: 'La diyaarinayo', en: 'Preparing your food' },
  { status: 'READY', so: 'Diyaar u ah rider-ka', en: 'Ready for pickup' },
  { status: 'OUT_FOR_DELIVERY', so: 'Waddada ku jira', en: 'Out for delivery' },
  { status: 'COMPLETED', so: 'Waa la geeyey', en: 'Delivered' },
];

export type SavedOrder = { token: string; orderNumber: string };
export function readSavedOrder(storage: Pick<Storage, 'getItem'>): SavedOrder | null {
  try {
    const value = JSON.parse(storage.getItem('botan-last-order') || 'null');
    if (!value || typeof value.orderNumber !== 'string' || typeof value.token !== 'string')
      return null;
    const token = parseTrackingToken(value.token);
    return token ? { token, orderNumber: value.orderNumber } : null;
  } catch {
    return null;
  }
}
