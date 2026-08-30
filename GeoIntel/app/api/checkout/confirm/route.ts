import { NextResponse } from 'next/server';
import { currentUser, setPlan } from '@/lib/auth';

/** Stripe success redirect. Verifies the session was actually paid before granting Pro. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const sessionId = url.searchParams.get('session_id');
  const user = await currentUser();
  const key = process.env.STRIPE_SECRET_KEY;

  if (!user || !sessionId || !key) return NextResponse.redirect(`${origin}/pricing`, 303);

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return NextResponse.redirect(`${origin}/pricing?error=verify_failed`, 303);

  const session = (await res.json()) as { payment_status?: string; metadata?: { user_id?: string } };
  // Only the account that started the session gets upgraded by it.
  if (session.payment_status === 'paid' && session.metadata?.user_id === user.id) {
    setPlan(user.id, 'pro');
    return NextResponse.redirect(`${origin}/account`, 303);
  }
  return NextResponse.redirect(`${origin}/pricing?error=not_paid`, 303);
}
