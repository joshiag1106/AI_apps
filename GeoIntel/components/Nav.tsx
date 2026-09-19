import Link from 'next/link';
import { KautilyaMark } from '@/components/KautilyaMark';
import { COUNTRIES } from '@/data/countries';
import { CountrySearch } from '@/components/CountrySearch';
import { quotaState } from '@/lib/quota';
import { currentUser } from '@/lib/auth';
import { LivePulse } from '@/components/LivePulse';
import { getMeta } from '@/lib/db';

const LINKS = [
  { href: '/board', label: 'Threat Board' },
  { href: '/ask', label: 'Ask' },
  { href: '/india', label: 'India Focus' },
  { href: '/china', label: 'China Watch' },
  { href: '/events', label: 'Events' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/network/CHN', label: 'Network' },
  { href: '/person', label: 'People' },
  { href: '/about', label: 'Why Kautilya' },
  { href: '/glossary', label: 'Glossary' },
  { href: '/methodology', label: 'Methodology' },
];

export async function Nav() {
  const [quota, user] = await Promise.all([quotaState(), currentUser()]);
  const searchList = COUNTRIES.map((c) => ({ iso: c.iso, name: c.name, region: c.region, aliases: c.aliases }));

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-line)] bg-[color:var(--color-ink)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1760px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        {/* Once inside the app, the wordmark returns to the dashboard, not back through
            the splash gate — the splash is a one-time front door, not a nav destination. */}
        <Link href="/board" className="flex items-center gap-2.5">
          <KautilyaMark size={26} />
          <span className="flex items-baseline gap-2">
            <span className="text-[17px] font-semibold tracking-tight text-text">Kautilya</span>
            <span className="hidden text-[12px] uppercase tracking-[0.2em] text-faint sm:inline">Geopolitical Risk Intelligence</span>
          </span>
        </Link>

        <nav className="order-3 flex flex-wrap items-center gap-x-4 gap-y-1 md:order-none">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className="text-[14px] text-muted transition-colors hover:text-[color:var(--color-accent)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <LivePulse initialVersion={getMeta('last_ingest') ?? 'never'} />
          <CountrySearch countries={searchList} className="w-44 sm:w-60" />
          {quota.unlimited ? (
            <span className="hidden rounded border border-[color:var(--color-accent-dim)] px-2 py-1 text-[12px] uppercase tracking-wider text-[color:var(--color-accent)] sm:inline">Pro</span>
          ) : quota.previewUnlimited ? (
            // Free-preview period: nothing is capped, but this visitor has not paid for
            // anything, so this must not say "Pro" — see lib/quota's QUOTA_ENFORCED.
            <Link href="/pricing" className="hidden whitespace-nowrap text-[12px] uppercase tracking-wider text-faint hover:text-muted sm:inline">Free preview</Link>
          ) : (
            <Link href="/pricing" className="hidden whitespace-nowrap text-[13px] text-muted hover:text-[color:var(--color-accent)] sm:inline">
              <span className="mono-num text-[color:var(--color-accent)]">{quota.remaining}</span>/{quota.limit} free
            </Link>
          )}
          {user ? (
            <Link href="/account" className="text-[14px] text-muted hover:text-text">Account</Link>
          ) : (
            <Link href="/login" className="text-[14px] text-muted hover:text-text">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
