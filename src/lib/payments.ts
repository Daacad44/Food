// Mobile-money providers (EVC Plus, ZAAD, SAHAL).
//
// Today every payment is recorded by hand: the order taker picks the method and the payer's number,
// and the money is marked received when it is seen on the phone or counted (operations.capturePayment).
//
// To automate a provider, implement PaymentProvider with the provider's official API documentation and
// merchant credentials, then register it in `providers` below. The order screen, payment records
// (method, providerReference = payer's number, providerTransactionId) and the API routes
// `POST /api/v1/payments/:id/initialize` and `POST /api/v1/webhooks/payments/:method` already use this
// module. Until a provider is registered and configured those routes fail closed: no payment is ever
// simulated and unsigned callbacks are never accepted.
import type { PaymentMethod } from '@prisma/client';
import { AppError } from './errors';

export type MobileMethod = Extract<PaymentMethod, 'EVC_PLUS' | 'ZAAD' | 'SAHAL'>;
export const MOBILE_METHODS: MobileMethod[] = ['EVC_PLUS', 'ZAAD', 'SAHAL'];

export interface PaymentRequest {
  paymentId: string;
  orderNumber: string;
  /** Amount in integer cents (USD). */
  amountCents: number;
  /** The customer's mobile-money number. */
  payerPhone: string;
}
export interface PaymentProvider {
  method: MobileMethod;
  /** True when the merchant credentials this provider needs are present in the environment. */
  configured(): boolean;
  /** Sends the payment prompt to the customer's phone. */
  initiate(request: PaymentRequest): Promise<{ providerTransactionId: string }>;
  /**
   * Verifies a callback's signature and returns what it confirms; must throw on a bad signature.
   * Only a verified, successful callback may mark a payment PAID.
   */
  verifyCallback(
    rawBody: string,
    headers: Headers,
  ): Promise<{ providerTransactionId: string; status: 'PAID' | 'FAILED'; amountCents: number }>;
}

/** Register implemented providers here, e.g. `EVC_PLUS: evcPlusProvider`. */
const providers: Partial<Record<MobileMethod, PaymentProvider>> = {};

export function provider(method: string): PaymentProvider | null {
  const p = providers[method as MobileMethod];
  return p && p.configured() ? p : null;
}
export function requireProvider(method: string): PaymentProvider {
  const p = provider(method);
  if (!p)
    throw new AppError(
      501,
      `${method} si toos ah weli looma xirin. Lacagta gacanta ku diiwaangeli (manual).`,
    );
  return p;
}
/** Shown on the order screen so staff know which methods are automatic. */
export function paymentModes() {
  return Object.fromEntries(
    MOBILE_METHODS.map((m) => [m, provider(m) ? 'automatic' : 'manual']),
  ) as Record<MobileMethod, 'automatic' | 'manual'>;
}
