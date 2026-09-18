import Link from 'next/link';

export const metadata = { title: 'Terms' };

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-3xl text-[16px] leading-relaxed text-muted">{children}</p>;
}

/*
 * A placeholder on purpose. Terms of use are a legal instrument and inventing them by
 * inference would be worse than not having them — so this page says plainly that they are
 * not published yet, and restates the one limit that already governs every page of the site.
 */
export default function TermsPage() {
  return (
    <div className="max-w-4xl">
      <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Terms</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Terms of use are not published yet</h1>

      <P>
        They are being written. Saying so is better than posting boilerplate that nobody drafted
        deliberately, so this page will stay as it is until there is something real to put here.
      </P>

      <P>
        One limit applies now and will not change: this site analyses how reporting is distributed
        and corroborated. It does not determine what is true, and nothing on it is advice — legal,
        financial, or otherwise. How you use what you read here is your own judgement. The{' '}
        <Link href="/methodology" className="underline decoration-dotted hover:text-[color:var(--color-accent)]">
          methodology page
        </Link>{' '}
        sets out what the scores mean and where the engine is known to fail; it is the honest
        version of a disclaimer.
      </P>
    </div>
  );
}
