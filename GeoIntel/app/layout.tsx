import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Nav } from '@/components/Nav';
import { lastIngest, corpusStats } from '@/lib/queries';
import { EmptyCorpus } from '@/components/EmptyCorpus';
import { timeAgo } from '@/lib/format';

export const metadata: Metadata = {
  title: { default: 'Kautilya — Geopolitical Risk Intelligence', template: '%s · Kautilya' },
  description:
    'Multilingual geopolitical event monitoring and security-risk analysis, with deep Chinese-language coverage and transparent source verification. India in focus.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ingested = lastIngest();
  const empty = corpusStats().events === 0;
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-[1400px] px-4 py-6">
          {empty && <div className="mb-6"><EmptyCorpus /></div>}
          {children}
        </main>

        <footer className="mt-16 border-t border-[color:var(--color-line)]">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-[11px] text-faint">
            <span className="text-muted">Kautilya</span>
            <span>Corroboration and provenance analysis — not a determination of truth.</span>
            <Link href="/methodology" className="hover:text-muted">Methodology &amp; limitations</Link>
            <Link href="/pricing" className="hover:text-muted">Plans</Link>
            {ingested && <span className="ml-auto mono-num">Corpus refreshed {timeAgo(ingested)}</span>}
          </div>
        </footer>
      </body>
    </html>
  );
}
