import { NextResponse } from 'next/server';
import { currentUser, setPlan } from '@/lib/auth';
import { siteOrigin } from '@/lib/site';
import { billing } from '@/lib/billing';

/**
 * Checkout. With Stripe keys present this creates a real Checkout Session. Without them, a
 * development server activates Pro directly so the whole subscriber flow is exercisable,
 * and production refuses — see lib/billing.ts. The mode is stated on the pricing page
 * rather than hidden.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  // Not `new URL(req.url).origin`: behind a proxy that is the server's own address, and
  // every redirect below would send the reader to localhost. See lib/site.ts.
  const origin = siteOrigin(new URL(req.url).origin);
  if (!user) return NextResponse.redirect(`${origin}/login?next=/pricing`, 303);

  const setup = billing();
  if (setup.mode === 'closed') {
    return NextResponse.redirect(`${origin}/pricing?error=billing_closed`, 303);
  }
  if (setup.mode === 'mock') {
    setPlan(user.id, 'pro');
    return NextResponse.redirect(`${origin}/account`, 303);
  }
  const { key, price } = setup;

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
