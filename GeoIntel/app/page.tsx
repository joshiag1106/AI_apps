import Link from 'next/link';
import { Panel, SectionTitle, Stat, Badge, Trend, Empty } from '@/components/ui';
import { WorldMap } from '@/components/WorldMap';
import { EventCard, EventRow } from '@/components/EventCard';
import { Sparkline, Ribbon, BarList } from '@/components/charts';
import { worldShapes, project } from '@/lib/map';
import {
  corpus, countryRisks, topDyads, indiaBoard, ladderAlerts, languageMix,
  domainMix, hotspotActivity, corpusStats, countryName, videoEvents,
} from '@/lib/queries';
import { VideoWall } from '@/components/VideoWall';
import { LANGUAGE_LABEL } from '@/lib/lang/detect';
import { timeAgo } from '@/lib/format';
import { impact } from '@/lib/risk';

export const dynamic = 'force-dynamic';

const LANG_COLORS: Record<string, string> = {
  en: '#4c7fd4', zh: '#ff8f7a', hi: '#e8b339', ja: '#9d7ad4', ru: '#4fb477',
  ar: '#3fb6a8', ko: '#d47aa8', ur: '#c9a227', unknown: '#5b697d',
};

export default async function Home() {
  const events = corpus();
  const stats = corpusStats(events);
  const risks = countryRisks(events);
  const dyads = topDyads(events, 8);
  const india = indiaBoard(events).slice(0, 6);
  const ladder = ladderAlerts(events, 5);
  const hotspots = hotspotActivity(events).slice(0, 12);
  const shapes = worldShapes();

  const markers = hotspots.map((h) => {
    const p = project(h.lon, h.lat);
    return p ? { id: h.id, name: h.name, x: p[0], y: p[1], heat: h.heat, count: h.count } : null;
  }).filter(Boolean) as { id: string; name: string; x: number; y: number; heat: number; count: number }[];

  const mapData = risks.map((r) => ({
    iso: r.iso, composite: r.composite, eventCount: r.eventCount, name: countryName(r.iso),
  }));

  // A panel headed "Escalating now" must not show something from five months ago, so
  // the window is hard rather than merely decayed. Ranking inside it uses impact(),
  // which gates escalation on corroboration and decays with a 14-day half-life.
  const WINDOW_DAYS = 21;
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  const escalating = [...events]
    .filter((e) => Date.parse(e.lastSeen) >= cutoff && e.escalation > 15)
    .sort((a, b) => impact(b) - impact(a))
    .slice(0, 6);

  const live = [...events].sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)).slice(0, 14);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-faint">Global Threat Board</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              What the world is reporting, in the languages it reports in
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
              {stats.articles.toLocaleString()} reports from {stats.countries} countries in {stats.languages} languages,
              clustered into {stats.events.toLocaleString()} events and scored for corroboration and provenance.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Events tracked" value={stats.events.toLocaleString()} sub={`from ${stats.articles.toLocaleString()} reports`} />
          <Stat label="Corroborated" value={stats.corroborated.toLocaleString()} sub="score ≥ 50 across independent outlets" tone="var(--color-verified)" />
          <Stat label="Chinese-language" value={stats.zh.toLocaleString()} sub="events with PRC/Chinese sourcing" tone="var(--color-zh)" />
          <Stat label="PRC ladder hits" value={ladderAlerts(events, 999).length} sub="official escalation formulae detected" tone="var(--color-accent)" />
          <Stat label="Active flashpoints" value={hotspots.length} sub="geographies with current activity" />
        </div>
      </section>

      <section>
        <Panel className="p-4">
          <SectionTitle kicker="Composite risk by state" action={
            <Link href="/dashboard" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">Open dashboard →</Link>
          }>
            Global risk surface
          </SectionTitle>
          <WorldMap shapes={shapes} data={mapData} markers={markers} />
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <SectionTitle kicker={`Last ${WINDOW_DAYS} days, ranked by escalation × corroboration`}>
            Escalating now
          </SectionTitle>
          {escalating.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {escalating.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          ) : (
            <Empty>
              No events above the escalation threshold in the last {WINDOW_DAYS} days.
              The <Link href="/events" className="underline decoration-dotted">full feed</Link> covers the whole corpus.
            </Empty>
          )}
        </div>

        <div>
          <SectionTitle kicker="Newest first" action={
            <Link href="/events" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">All events →</Link>
          }>Live feed</SectionTitle>
          <Panel className="px-3 py-1.5">
            {live.map((e) => <EventRow key={e.id} event={e} />)}
          </Panel>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div>
          <SectionTitle kicker="India in focus" action={
            <Link href="/india" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">India board →</Link>
          }>Bilateral tension</SectionTitle>
          <Panel className="divide-y divide-[color:var(--color-line-soft)]">
            {india.map((d) => (
              <Link key={d.key} href={`/dyad/IND-${d.b === 'IND' ? d.a : d.b}`}
                className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-[color:var(--color-panel-2)]">
                <span className="w-24 flex-none truncate text-[12.5px] text-text">
                  {countryName(d.a === 'IND' ? d.b : d.a)}
                </span>
                <Sparkline data={d.series.map((s) => s.value)} width={90} height={22}
                  color={d.score >= 55 ? 'var(--color-high)' : 'var(--color-guarded)'} />
                <span className="mono-num ml-auto text-[13px]"
                  style={{ color: d.score >= 55 ? 'var(--color-high)' : 'var(--color-text)' }}>{d.score}</span>
                <Trend value={d.trend} />
              </Link>
            ))}
          </Panel>
        </div>

        <div>
          <SectionTitle kicker="Detected in Chinese-language sources" action={
            <Link href="/china" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">China Watch →</Link>
          }>PRC official rhetoric</SectionTitle>
          {ladder.length ? (
            <Panel className="divide-y divide-[color:var(--color-line-soft)]">
              {ladder.map((e) => (
                <Link key={e.id} href={`/events/${e.id}`} className="block px-3.5 py-2.5 transition-colors hover:bg-[color:var(--color-panel-2)]">
                  <div className="flex items-center gap-2">
                    <Badge tone="var(--color-zh)">rung {e.ladderRung}</Badge>
                    <span className="zh-text text-[13px]">{e.ladderZh}</span>
                    <span className="ml-auto text-[10px] text-faint">{timeAgo(e.lastSeen)}</span>
                  </div>
                  <div className="mt-1 text-[11.5px] leading-snug text-muted line-clamp-2">{e.ladderEn} — {e.title}</div>
                </Link>
              ))}
            </Panel>
          ) : <Empty>No official escalation formulae in the current corpus.</Empty>}
        </div>

        <div className="space-y-5">
          <div>
            <SectionTitle kicker="Source corpus">Language mix</SectionTitle>
            <Panel className="p-3.5">
              <Ribbon parts={languageMix(events).slice(0, 7).map((l) => ({
                label: LANGUAGE_LABEL[l.language] ?? l.language, value: l.count,
                color: LANG_COLORS[l.language] ?? '#5b697d',
              }))} />
            </Panel>
          </div>
          <div>
            <SectionTitle kicker="Event classification">Domains</SectionTitle>
            <Panel className="p-3.5">
              <BarList items={domainMix(events).slice(0, 7).map((d) => ({ label: d.domain, value: d.count }))} />
            </Panel>
          </div>
        </div>
      </section>

      {videoEvents(events, 6).length > 0 && (
        <section>
          <SectionTitle kicker="From official broadcaster channels — nothing loads until you press play">
            On camera
          </SectionTitle>
          <VideoWall events={videoEvents(events, 6)} />
        </section>
      )}

      <section>
        <SectionTitle kicker="Ranked by escalation × corroboration, decayed by recency">Most tense relationships</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {dyads.map((d) => (
            <Link key={d.key} href={`/dyad/${d.a}-${d.b}`}
              className="panel block p-3.5 transition-colors hover:border-[color:var(--color-accent-dim)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-text">{countryName(d.a)} — {countryName(d.b)}</span>
                <Trend value={d.trend} />
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="mono-num text-2xl leading-none"
                  style={{ color: d.score >= 55 ? 'var(--color-high)' : 'var(--color-text)' }}>{d.score}</span>
                <span className="mb-0.5 text-[10px] text-faint">{d.eventCount} events</span>
              </div>
              <div className="mt-2">
                <Sparkline data={d.series.map((s) => s.value)} width={200} height={26}
                  color={d.score >= 55 ? 'var(--color-high)' : 'var(--color-accent)'} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
