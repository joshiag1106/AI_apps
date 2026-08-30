import Link from 'next/link';
import { Panel, Badge } from '@/components/ui';
import { FREE_LIMIT, METERED, quotaState } from '@/lib/quota';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plans' };

const FREE = [
  'Global threat board and world risk map',
  'Full live event feed with filters',
  'Country and language search',
  'Complete methodology and limitations',
  `${FREE_LIMIT} deep analyses`,
];

const PRO = [
  'Unlimited event verification breakdowns',
  'Unlimited country risk profiles',
  'Unlimited relationship analyses',
  'Full Chinese-language source analysis',
  'PRC escalation-ladder detections',
  'Data export',
];

export default async function PricingPage() {
  const [quota, user] = await Promise.all([quotaState(), currentUser()]);
  const stripeLive = !!process.env.STRIPE_SECRET_KEY;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">Plans</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Free to read. Paid to analyse.</h1>
        <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-muted">
          Headlines, filters and the methodology stay open. The allowance covers the views where the
          engine does real work — verification evidence, risk models and the Chinese-language layer.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-text">Analyst — Free</h2>
            {!quota.unlimited && <Badge tone="var(--color-accent)">current</Badge>}
          </div>
          <div className="mono-num mt-2 text-3xl">₹0</div>
          <p className="mt-1 text-[11.5px] text-muted">
            {quota.unlimited ? 'Included in Pro' : `${quota.remaining} of ${quota.limit} analyses remaining`}
          </p>
          <ul className="mt-4 space-y-2">
            {FREE.map((f) => (
              <li key={f} className="flex gap-2 text-[12.5px] text-muted">
                <span className="text-[color:var(--color-low)]">✓</span>{f}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="relative overflow-hidden border-[color:var(--color-accent-dim)] p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold text-text">Desk — Pro</h2>
            {quota.unlimited && <Badge tone="var(--color-accent)" solid>active</Badge>}
          </div>
          <div className="mono-num mt-2 text-3xl">₹2,400<span className="text-[13px] text-faint"> /month</span></div>
          <p className="mt-1 text-[11.5px] text-muted">Unlimited analysis across every view.</p>
          <ul className="mt-4 space-y-2">
            {PRO.map((f) => (
              <li key={f} className="flex gap-2 text-[12.5px] text-muted">
                <span className="text-[color:var(--color-accent)]">✓</span>{f}
              </li>
            ))}
          </ul>

          {quota.unlimited ? (
            <div className="mt-5 rounded-md border border-[color:var(--color-line)] px-4 py-2 text-center text-[12.5px] text-muted">
              You&apos;re on Pro
            </div>
          ) : user ? (
            <form action="/api/checkout" method="post" className="mt-5">
              <button className="w-full rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0a0d13] hover:opacity-90">
                {stripeLive ? 'Continue to checkout' : 'Activate Pro (test mode)'}
              </button>
            </form>
          ) : (
            <Link href="/login?next=/pricing"
              className="mt-5 block rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-center text-[13px] font-medium text-[#0a0d13] hover:opacity-90">
              Create an account to subscribe
            </Link>
          )}

          {!stripeLive && (
            <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
              Stripe keys are not configured, so checkout runs in test mode: the button activates Pro
              on your account immediately without taking payment. Set <code className="mono-num">STRIPE_SECRET_KEY</code> and{' '}
              <code className="mono-num">STRIPE_PRICE_ID</code> to switch to live billing.
            </p>
          )}
        </Panel>
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-[11px] leading-relaxed text-faint">
        Publisher and aggregator terms of service govern commercial redistribution of source material.
        Review them before charging subscribers — see{' '}
        <Link href="/methodology" className="underline decoration-dotted hover:text-muted">methodology</Link>.
      </p>
    </div>
  );
}
