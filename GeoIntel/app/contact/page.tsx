import Link from 'next/link';

export const metadata = { title: 'Contact' };

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 max-w-3xl text-[16px] leading-relaxed text-muted">{children}</p>;
}

/*
 * No address is published here yet, deliberately. The only mailbox on this domain is the one
 * the alert pipeline sends FROM, and publishing it would invite spam onto the account the
 * product depends on. A separate alias goes here once it exists.
 */
export default function ContactPage() {
  return (
    <div className="max-w-4xl">
      <div className="text-[12px] uppercase tracking-[0.22em] text-faint">Contact</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Getting in touch</h1>

      <P>
        A contact address is not published here yet. It will be, and this page is where it will
        appear — an empty page is a more honest placeholder than an address that goes nowhere.
      </P>

      <P>
        If you have found something the engine gets wrong, that is the most useful thing you could
        report, and the{' '}
        <Link href="/methodology" className="underline decoration-dotted hover:text-[color:var(--color-accent)]">
          methodology page
        </Link>{' '}
        describes the kinds of failure already known — worth checking whether what you have seen is
        one of them, or something new.
      </P>
    </div>
  );
}
