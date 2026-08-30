import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Panel, SectionTitle, Stat, Badge } from '@/components/ui';
import { currentUser, endSession, setPlan } from '@/lib/auth';
import { quotaState, usageLog, METERED, FREE_LIMIT } from '@/lib/quota';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const [quota, log] = await Promise.all([quotaState(), usageLog(25)]);

  async function signOut() {
    'use server';
    await endSession();
    redirect('/');
  }
  async function downgrade() {
    'use server';
    const u = await currentUser();
    if (u) setPlan(u.id, 'free');
    redirect('/account');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">Account</div>
        <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          {user.email}
          <Badge tone={user.plan === 'pro' ? 'var(--color-accent)' : 'var(--color-muted)'} solid={user.plan === 'pro'}>
            {user.plan}
          </Badge>
        </h1>
        <p className="mt-1 text-[12px] text-faint">Member since {fmtDate(user.createdAt)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Plan" value={user.plan === 'pro' ? 'Desk Pro' : 'Analyst Free'} />
        <Stat label="Analyses used" value={quota.unlimited ? '∞' : quota.used} sub={quota.unlimited ? 'unlimited' : `of ${FREE_LIMIT}`} />
        <Stat label="Remaining" value={quota.unlimited ? '∞' : quota.remaining}
          tone={!quota.unlimited && quota.remaining === 0 ? 'var(--color-high)' : undefined} />
        <Stat label="Metering" value="Account" sub="bound to this login" />
      </div>

      {!quota.unlimited && (
        <Panel className="p-4">
          <SectionTitle kicker="Unlimited analysis across every view">Upgrade to Pro</SectionTitle>
          <form action="/api/checkout" method="post">
            <button className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0a0d13] hover:opacity-90">
              {process.env.STRIPE_SECRET_KEY ? 'Continue to checkout' : 'Activate Pro (test mode)'}
            </button>
          </form>
        </Panel>
      )}

      <Panel className="p-4">
        <SectionTitle kicker="Each unique view counts once, however often you reopen it">
          Analysis history
        </SectionTitle>
        {log.length ? (
          <div className="divide-y divide-[color:var(--color-line-soft)]">
            {log.map((u, i) => (
              <div key={i} className="flex items-center gap-3 py-2 text-[12px]">
                <span className="text-text">{METERED[u.action] ?? u.action}</span>
                <span className="mono-num truncate text-[10.5px] text-faint">{u.target}</span>
                <span className="mono-num ml-auto flex-none text-[10.5px] text-faint">{fmtDate(u.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted">No analyses yet. Open an event or a country profile.</p>
        )}
      </Panel>

      <div className="flex gap-3">
        <form action={signOut}>
          <button className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-[12px] text-muted hover:border-[color:var(--color-high)] hover:text-[color:var(--color-high)]">
            Sign out
          </button>
        </form>
        {quota.unlimited && (
          <form action={downgrade}>
            <button className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-[12px] text-faint hover:text-muted">
              Cancel Pro (test mode)
            </button>
          </form>
        )}
        <Link href="/methodology" className="self-center text-[12px] text-muted hover:text-[color:var(--color-accent)]">Methodology →</Link>
      </div>
    </div>
  );
}
