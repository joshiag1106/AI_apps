/**
 * Which checkout this deployment runs.
 *
 * - `stripe` — both keys are set, so checkout creates a real Checkout Session.
 * - `mock` — no billing, on a development server. The button activates Pro without taking
 *   payment, so the whole subscriber flow can be exercised without a Stripe account.
 * - `closed` — no billing, in production. Test mode there would give Pro to anyone who
 *   pressed the button, so checkout refuses and the plan pages say subscriptions are not
 *   open yet.
 *
 * One function decides this for the checkout route and both plan pages. Before, the pricing
 * page read the secret key alone while the route needed the key and the price, so a key
 * without a price advertised live checkout and then quietly ran test mode.
 */
export type Billing =
  | { mode: 'stripe'; key: string; price: string }
  | { mode: 'mock' }
  | { mode: 'closed' };

export function billing(env: Record<string, string | undefined> = process.env): Billing {
  const key = env.STRIPE_SECRET_KEY;
  const price = env.STRIPE_PRICE_ID;
  if (key && price) return { mode: 'stripe', key, price };
  return { mode: env.NODE_ENV === 'production' ? 'closed' : 'mock' };
}
