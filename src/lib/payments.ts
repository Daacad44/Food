// Mobile money.
//
// With WaafiPay credentials set (WAAFI_* environment variables, see lib/waafi.ts and .env.example),
// "Send" on the order screen asks the customer's phone to pay and records the money when they approve.
// WaafiPay serves every Somali wallet behind the number: 61/77 EVC Plus, 68 Jeeb (Somnet), 63 ZAAD,
// 90 SAHAL, 62/65 eDahab …
//
// Without credentials everything is recorded by hand: staff pick the wallet and mark the money received
// when it is seen on the phone or counted (operations.capturePayment). No payment is ever simulated.
import { waafiStatus } from './waafi';

/** Shown on the order screen so staff know whether "Send" is available. */
export function paymentModes() {
  const waafi = waafiStatus();
  return { mobile: waafi.configured ? ('waafi' as const) : ('manual' as const), waafi };
}
