import { WorldMap } from '@/components/WorldMap';
import { corpus, corpusStats, countryRisks, hotspotActivity, countryName } from '@/lib/queries';
import { worldShapes, project } from '@/lib/map';
import { BASE_PATH } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * The one-time front door. Everything below the fold this used to hold — the stat tiles,
 * the escalating-now board, the live feed — lives at /board now, and this page's only job
 * is to say what the engine is in one screen and then get out of the way.
 *
 * The map is the REAL corpus, quieted (lower opacity, no hover state, no legend), not a
 * decorative globe — a live threat board as the first thing a visitor sees is a stronger
 * opener than a generic illustration, and it costs nothing extra: countryRisks/hotspotActivity
 * are the same functions /board itself reads.
 */
export default function Splash() {
  const events = corpus();
  const stats = corpusStats(events);
  const risks = countryRisks(events);
  const hotspots = hotspotActivity(events).slice(0, 10);
  // Matches WorldMap's width={1100} height={520} below — otherwise the map's content is
  // projected onto the default 960x400 canvas and dropped, un-rescaled, into the wider box,
  // leaving real empty space on the right. See tests/splash.test.ts.
  const shapes = worldShapes(1100, 520);

  const markers = hotspots
    .map((h) => {
      const p = project(h.lon, h.lat, 1100, 520);
      return p ? { id: h.id, name: h.name, x: p[0], y: p[1], heat: h.heat, count: h.count } : null;
    })
    .filter(Boolean) as { id: string; name: string; x: number; y: number; heat: number; count: number }[];

  const mapData = risks.map((r) => ({
    iso: r.iso, composite: r.composite, eventCount: r.eventCount, name: countryName(r.iso),
  }));

  return (
    <div className="relative flex min-h-[calc(100vh-1px)] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
      {/*
        * Josh: every visit must land here, not only the first. There is deliberately no
        * "already entered" check any more — this page shipped 2026-09-18 with one (a
        * pre-paint script reading the browser's own storage, redirecting a returning
        * visitor straight to /board), and it was removed the same day at Josh's explicit
        * instruction. The component that used to write that flag, MarkEntered, is gone
        * entirely — it had no purpose left once nothing read what it wrote. See
        * tests/splash.test.ts, which used to pin that mechanism and now pins its absence.
        */}

      <div className="splash-map-fade pointer-events-none absolute inset-0" style={{ animationDelay: '150ms' }}>
        <WorldMap shapes={shapes} data={mapData} markers={markers} width={1100} height={520} legend={false} />
      </div>

      <div className="relative flex flex-col items-center">
        {/* The mark's own four bars, drawn directly rather than through KautilyaMark — that
            component is one atomic icon for nav/favicon use, and cannot stagger its rects
            individually. Same geometry and colours, so it reads as the same mark rising in. */}
        <svg width="56" height="56" viewBox="0 0 72 72" className="mb-6" aria-hidden>
          <rect className="splash-bar" style={{ animationDelay: '0ms' }} x="14" y="52" width="8" height="10" rx="1.5" fill="#7a5f1d" />
          <rect className="splash-bar" style={{ animationDelay: '70ms' }} x="26" y="42" width="8" height="20" rx="1.5" fill="#a67f28" />
          <rect className="splash-bar" style={{ animationDelay: '140ms' }} x="38" y="30" width="8" height="32" rx="1.5" fill="#c99f31" />
          <rect className="splash-bar" style={{ animationDelay: '210ms' }} x="50" y="14" width="8" height="48" rx="1.5" fill="#e8b339" />
        </svg>

        <div className="splash-fade-up mb-2 text-[12px] uppercase tracking-[0.28em] text-faint" style={{ animationDelay: '260ms' }}>
          Kautilya
        </div>
        {/* The category line the splash otherwise has none of: Nav carries "Geopolitical
            Risk Intelligence" as its own subtitle everywhere else on the site, and the
            splash renders no Nav — see app/layout.tsx's `chromeless` branch. So this is the
            only place on the whole page that names what the product actually is. */}
        <div className="splash-fade-up mb-4 text-[13px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-accent)]"
          style={{ animationDelay: '300ms' }}>
          Geopolitical Intelligence · Threat &amp; Risk Analysis
        </div>
        <h1 className="splash-fade-up max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-text sm:text-[40px]"
          style={{ animationDelay: '340ms' }}>
          Reporting read in the language it was written in
        </h1>
        <p className="splash-fade-up mt-4 max-w-lg text-[16px] leading-relaxed text-muted" style={{ animationDelay: '440ms' }}>
          {stats.articles.toLocaleString()} reports from {stats.countries} countries in {stats.languages} languages,
          clustered into {stats.events.toLocaleString()} events and scored for corroboration — not asserted as truth.
        </p>

        {/* The reason to click, distinct from the stats paragraph above — grounded in what
            the engine actually does (the escalation-ladder detector reads an official
            posture shift the day it is published) rather than a generic hype line, matching
            the site's own anti-hype voice ("scored — not asserted as truth", two lines up). */}
        <p className="splash-fade-up mt-5 text-[15px] font-medium text-text" style={{ animationDelay: '500ms' }}>
          See the risk before the headlines catch up.
        </p>

        {/*
          * Plain <a> tags, DELIBERATELY not next/link's <Link> — both of these once broke
          * because they were. / is one of two routes with no Nav/footer (app/layout.tsx's
          * `chromeless`; /demo is the other), and Next's client-side router specifically REUSES a layout shared by
          * the from- and to-route rather than re-rendering it on a <Link> navigation — the
          * entire point of the App Router's shared-layout model. Since every route shares
          * this one root layout, clicking either link here carried /'s chrome-suppressed
          * state straight over to wherever it went, and only a manual reload fixed it for
          * that visit. A bare <a> gets no client-side interception, so the browser gives it
          * an ordinary full page load instead — a fresh server round-trip, fresh middleware,
          * a freshly evaluated root layout, the same as typing the URL. See
          * tests/splash.test.ts, which pins both links, not only Enter. /demo is chromeless too,
          * so the demo button needs the same full page load as Enter.
          *
          * No onClick either — the unrelated reason is that this page has no 'use client',
          * and a Server Component cannot hand a function to an element it renders. It used
          * to have one, writing to the browser's own storage so a returning visitor could
          * be sent straight to /board; that whole mechanism is gone, on purpose, as of
          * 2026-09-18 — see the note at this file's top.
          */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`${BASE_PATH}/board`}
            className="splash-fade-up rounded-md bg-[color:var(--color-accent)] px-8 py-3 text-[16px] font-semibold text-[#0a0d13] transition-opacity hover:opacity-90"
            style={{ animationDelay: '560ms' }}
          >
            Enter →
          </a>
          <a
            href={`${BASE_PATH}/demo`}
            className="splash-fade-up rounded-md border border-[color:var(--color-accent-dim)] px-6 py-3 text-[16px] font-medium text-[color:var(--color-accent)] transition-colors hover:border-[color:var(--color-accent)]"
            style={{ animationDelay: '600ms' }}
          >
            ▶ Watch the 2-minute demo
          </a>
        </div>

        <a href={`${BASE_PATH}/about`} className="splash-fade-up mt-6 text-[13px] text-faint underline decoration-dotted hover:text-muted"
          style={{ animationDelay: '620ms' }}>
          Why Kautilya
        </a>
      </div>
    </div>
  );
}
