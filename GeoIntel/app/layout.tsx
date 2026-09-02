import type { Metadata } from 'next';
import Link from 'next/link';
import { Noto_Sans_SC } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/Nav';
import { lastIngest, corpusStats } from '@/lib/queries';
import { EmptyCorpus } from '@/components/EmptyCorpus';
import { timeAgo } from '@/lib/format';

/**
 * Chinese face, self-hosted.
 *
 * The site printed Chinese in whatever the reader's operating system happened to supply:
 * PingFang SC on macOS, Microsoft YaHei on Windows, and on Linux frequently a fallback
 * with the wrong regional glyph forms or no Han coverage at all. For a product whose
 * argument is that you should read the source in its own language, leaving the source
 * unreadable on two of three platforms was not defensible.
 *
 * next/font downloads the face at build time and serves it from this origin, so there is
 * no runtime dependency on Google and no request from the reader's browser to a third
 * party. Google splits Noto Sans SC into ~200 unicode-range subsets and that splitting is
 * preserved, so a page of Chinese headlines fetches the handful of ranges it actually
 * uses rather than the whole face.
 *
 * `preload` is off deliberately: preloading is for a small known set of files, and
 * preloading two hundred would flood the connection to save nothing. `display: swap` lets
 * the text render in the fallback immediately and reflow when the face arrives.
 */
const notoSC = Noto_Sans_SC({
  weight: ['400', '600'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-zh',
  fallback: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: 'Kautilya — Geopolitical Risk Intelligence', template: '%s · Kautilya' },
  description:
    'Multilingual geopolitical event monitoring and security-risk analysis, with deep Chinese-language coverage and transparent source verification. India in focus.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ingested = lastIngest();
  const empty = corpusStats().events === 0;
  return (
    <html lang="en" className={notoSC.variable}>
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
