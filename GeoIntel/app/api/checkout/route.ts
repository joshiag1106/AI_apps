import { NextResponse } from 'next/server';
import { currentUser, setPlan } from '@/lib/auth';

/**
 * Checkout. With Stripe keys present this creates a real Checkout Session; without
 * them it activates Pro directly so the whole subscriber flow is exercisable in
 * development. The mode is stated on the pricing page rather than hidden.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  const origin = new URL(req.url).origin;
  if (!user) return NextResponse.redirect(`${origin}/login?next=/pricing`, 303);

  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;

  if (!key || !price) {
    setPlan(user.id, 'pro');
    return NextResponse.redirect(`${origin}/account`, 303);
  }

  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    customer_email: user.email,
    success_url: `${origin}/api/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing`,
    'metadata[user_id]': user.id,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('stripe checkout failed', res.status, detail);
    return NextResponse.redirect(`${origin}/pricing?error=checkout_failed`, 303);
  }
  const session = (await res.json()) as { url?: string };
  if (!session.url) return NextResponse.redirect(`${origin}/pricing?error=checkout_failed`, 303);
  return NextResponse.redirect(session.url, 303);
}
