import Link from 'next/link';
import { COUNTRIES } from '@/data/countries';
import { CountrySearch } from '@/components/CountrySearch';
import { quotaState } from '@/lib/quota';
import { currentUser } from '@/lib/auth';
import { LivePulse } from '@/components/LivePulse';
import { getMeta } from '@/lib/db';

const LINKS = [
  { href: '/', label: 'Threat Board' },
  { href: '/ask', label: 'Ask' },
  { href: '/india', label: 'India Focus' },
  { href: '/china', label: 'China Watch' },
  { href: '/events', label: 'Events' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/methodology', label: 'Methodology' },
];

export async function Nav() {
  const [quota, user] = await Promise.all([quotaState(), currentUser()]);
  const searchList = COUNTRIES.map((c) => ({ iso: c.iso, name: c.name, region: c.region, aliases: c.aliases }));

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-line)] bg-[color:var(--color-ink)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-text">Kautilya</span>
          <span className="hidden text-[9.5px] uppercase tracking-[0.2em] text-faint sm:inline">Geopolitical Risk Intelligence</span>
        </Link>

        <nav className="order-3 flex flex-wrap items-center gap-x-4 gap-y-1 md:order-none">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}
              className="text-[12px] text-muted transition-colors hover:text-[color:var(--color-accent)]">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <LivePulse initialVersion={getMeta('last_ingest') ?? 'never'} />
          <CountrySearch countries={searchList} className="w-44 sm:w-60" />
          {quota.unlimited ? (
            <span className="hidden rounded border border-[color:var(--color-accent-dim)] px-2 py-1 text-[10px] uppercase tracking-wider text-[color:var(--color-accent)] sm:inline">Pro</span>
          ) : (
            <Link href="/pricing" className="hidden whitespace-nowrap text-[11px] text-muted hover:text-[color:var(--color-accent)] sm:inline">
              <span className="mono-num text-[color:var(--color-accent)]">{quota.remaining}</span>/{quota.limit} free
            </Link>
          )}
          {user ? (
            <Link href="/account" className="text-[11.5px] text-muted hover:text-text">Account</Link>
          ) : (
            <Link href="/login" className="text-[11.5px] text-muted hover:text-text">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
