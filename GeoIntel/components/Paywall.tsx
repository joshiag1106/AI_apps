import Link from 'next/link';
import { FREE_LIMIT } from '@/lib/quota';

export function Paywall({ what, kind }: { what: string; kind: 'user' | 'device' }) {
  return (
    <div className="panel relative overflow-hidden p-8 text-center">
      <div className="sweep pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.2em] text-faint">Free allowance used</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-text">
          You&apos;ve used all {FREE_LIMIT} free analyses
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
          {what} is a full analytical view — source-by-source verification evidence, the
          Chinese-language breakdown, and the risk model behind the score.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <Link href="/pricing"
            className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#0a0d13] transition-opacity hover:opacity-90">
            See plans
          </Link>
          {kind === 'device' && (
            <Link href="/login"
              className="rounded-md border border-[color:var(--color-line)] px-4 py-2 text-[13px] text-text hover:border-[color:var(--color-accent-dim)]">
              Sign in
            </Link>
          )}
        </div>

        <p className="mx-auto mt-5 max-w-md text-[11px] leading-relaxed text-faint">
          Headlines, search, the live event feed and the full methodology stay free and
          unmetered. Only the deep analytical views count against the allowance, and
          re-opening something you have already viewed never costs another credit.
        </p>
      </div>
    </div>
  );
}
