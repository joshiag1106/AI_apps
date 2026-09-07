import type { Metadata } from 'next';
import Link from 'next/link';
import { Noto_Sans_SC } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/Nav';
import { lastIngest, corpusStats } from '@/lib/queries';
import { EmptyCorpus } from '@/components/EmptyCorpus';
import { timeAgo } from '@/lib/format';
import { PaletteSelect } from '@/components/PaletteSelect';

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
    // suppressHydrationWarning is required, not cosmetic: the inline script below sets
    // data-palette on this element BEFORE React hydrates, so the client tree legitimately
    // differs from the server HTML by exactly that attribute. Without it React logs a
    // hydration mismatch on every page load for anyone who has chosen a palette. It is
    // scoped to this element only, so a genuine mismatch anywhere inside still reports.
    <html lang="en" className={notoSC.variable} suppressHydrationWarning>
      <head>
        {/*
          Applies the reader's palette BEFORE first paint. It has to be a blocking inline
          script rather than an effect: React would set the attribute after hydration, and
          a reader who chose the colour-blind-safe ramp would see a flash of the green-red
          one first — briefly showing exactly the palette they opted out of.
          Wrapped in try/catch because localStorage throws outright in some privacy modes.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=localStorage.getItem('kautilya-palette');if(p&&p!=='default')document.documentElement.dataset.palette=p}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen">
        {/*
          Bypass blocks (WCAG 2.4.1). Every page opens with the wordmark, nine navigation
          links and a search box, and a keyboard or screen-reader user had to walk all of
          them again on every single page before reaching anything they came for.

          Off-screen until focused, so it costs the sighted layout nothing and appears the
          moment it is tabbed to — the first tab stop on the page, deliberately. The
          positioning is a .skip-link rule in globals.css rather than `sr-only
          focus:not-sr-only`: that utility pairing left the clip applied while focused, so
          the link worked and stayed invisible. See the note there.

          `main` takes tabIndex={-1} because an href alone moves the browser's scroll
          position but not always its focus; without it the reader is looking at the content
          while the next Tab continues from the navigation they just skipped.
        */}
        <a
          href="#main"
          className="skip-link rounded border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-4 py-2 text-[13px] text-text"
        >
          Skip to main content
        </a>
        <Nav />
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6">
          {empty && <div className="mb-6"><EmptyCorpus /></div>}
          {children}
        </main>

        <footer className="mt-16 border-t border-[color:var(--color-line)]">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-[11px] text-faint">
            <span className="text-muted">Kautilya</span>
            <span>Corroboration and provenance analysis — not a determination of truth.</span>
            <Link href="/methodology" className="hover:text-muted">Methodology &amp; limitations</Link>
            <Link href="/pricing" className="hover:text-muted">Plans</Link>
            {ingested && <span className="mono-num">Corpus refreshed {timeAgo(ingested)}</span>}
            <PaletteSelect />
          </div>
        </footer>
      </body>
    </html>
  );
}
