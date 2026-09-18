import Link from 'next/link';
import { FREE_LIMIT } from '@/lib/quota';

export const metadata = { title: 'Privacy' };

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-3xl text-[16px] leading-relaxed text-muted">{children}</p>;
}

/*
 * Deliberately a factual inventory, not a policy. Everything below is observable in the
 * code — lib/db/, lib/auth and middleware — and is true today. A privacy POLICY is a legal
 * commitment and is not something to draft by inference; this page states what is stored so
 * a reader is not left guessing while that is written.
 */
export default function PrivacyPage() {
  return (
    <div className="max-w-4xl">
      <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Privacy</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">What this site stores about you</h1>

      <P>
        A formal privacy policy has not been published yet. Rather than leave you guessing until it
        is, here is a plain inventory of what the site actually holds. It is accurate as of today
        and will be replaced by the policy proper, not quietly dropped.
      </P>

      <h2 className="mt-9 mb-2.5 text-[19px] font-semibold tracking-tight text-text">If you never sign in</h2>
      <P>
        Nothing that identifies you. Reading is anonymous. A cookie holds a random device
        identifier so the free allowance of {FREE_LIMIT} analyses can be counted; it is not linked
        to a name, an email or an advertising profile, and there is no third-party analytics or
        tracking script anywhere on the site.
      </P>

      <h2 className="mt-9 mb-2.5 text-[19px] font-semibold tracking-tight text-text">If you create an account</h2>
      <P>
        Your email address, a bcrypt hash of your password — never the password itself — a session
        token while you are signed in, your plan, and any countries you add to a watchlist. That is
        the complete list.
      </P>

      <h2 className="mt-9 mb-2.5 text-[19px] font-semibold tracking-tight text-text">Where it lives</h2>
      <P>
        In a single database file on the server that runs this site. It is not shared with anyone,
        not sold, and not sent to a third party for analytics. If you subscribe, payment is handled
        by the payment processor and card details never reach this server at all.
      </P>

      <P>
        Questions, or want your account and its data deleted? See{' '}
        <Link href="/contact" className="underline decoration-dotted hover:text-[color:var(--color-accent)]">contact</Link>.
      </P>
    </div>
  );
}
