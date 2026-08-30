import Link from 'next/link';
import { Panel, SectionTitle, Stat, Badge, Trend, Empty } from '@/components/ui';
import { EventRow } from '@/components/EventCard';
import { WatchlistPanel } from '@/components/Watchlist';
import { Sparkline, BarList, Ribbon, Radar } from '@/components/charts';
import {
  corpus, countryRisks, topDyads, hotspotActivity, languageMix, domainMix,
  corpusStats, countryName, ladderAlerts,
} from '@/lib/queries';
import { VECTORS, riskBand } from '@/lib/risk';
import { LANGUAGE_LABEL } from '@/lib/lang/detect';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

const LANG_COLORS: Record<string, string> = {
  en: '#4c7fd4', zh: '#ff8f7a', hi: '#e8b339', ja: '#9d7ad4', ru: '#4fb477',
  ar: '#3fb6a8', ko: '#d47aa8', ur: '#c9a227',
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const events = corpus();
  const stats = corpusStats(events);
  const risks = countryRisks(events);
  const dyads = topDyads(events, 16);
  const hotspots = hotspotActivity(events);
  const sort = sp.sort ?? 'risk';

  const sorted = [...risks].sort((a, b) =>
    sort === 'events' ? b.eventCount - a.eventCount
      : sort === 'trend' ? b.trend - a.trend
        : b.composite - a.composite);

  const flagged = events.filter((e) => e.flags.includes('state_media_only') || e.flags.includes('disputed'));

  return (
    <div className="space-y-7">
      <section>
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">Analyst dashboard</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Comparative view</h1>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
            The whole corpus, sortable. Everything here derives from the same scored events —
            use it to find where to look, then open an event for its source-by-source evidence.
          </p>
          <span className="flex items-center gap-2 text-[11px] text-faint">
            Export corpus
            <a href="/api/export?format=csv"
              className="rounded border border-[color:var(--color-line)] px-2 py-0.5 hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">CSV</a>
            <a href="/api/export?format=json"
              className="rounded border border-[color:var(--color-line)] px-2 py-0.5 hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">JSON</a>
          </span>
        </div>
      </section>

      <WatchlistPanel />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Events" value={stats.events.toLocaleString()} />
        <Stat label="Reports" value={stats.articles.toLocaleString()} />
        <Stat label="Corroborated" value={stats.corroborated.toLocaleString()} tone="var(--color-verified)" sub="score ≥ 50" />
        <Stat label="States tracked" value={risks.length} />
        <Stat label="Flashpoints" value={hotspots.length} />
        <Stat label="Needs scrutiny" value={flagged.length} tone="var(--color-elevated)" sub="state-only or disputed" />
      </div>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="p-4">
          <SectionTitle kicker="Click a column to re-sort" action={
            <div className="flex gap-1.5">
              {[['risk', 'Risk'], ['events', 'Events'], ['trend', 'Trend']].map(([k, label]) => (
                <Link key={k} href={`/dashboard?sort=${k}`}
                  className={`rounded-full border px-2 py-0.5 text-[10.5px] ${
                    sort === k ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
                      : 'border-[color:var(--color-line)] text-muted hover:border-[color:var(--color-accent-dim)]'}`}>
                  {label}
                </Link>
              ))}
            </div>
          }>Country risk table</SectionTitle>

          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[color:var(--color-panel)] text-[10px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="py-1.5 text-left font-normal">State</th>
                  <th className="py-1.5 text-right font-normal">Risk</th>
                  <th className="py-1.5 text-right font-normal">Band</th>
                  <th className="hidden py-1.5 text-right font-normal sm:table-cell">Top domain</th>
                  <th className="py-1.5 text-right font-normal">Events</th>
                  <th className="py-1.5 text-right font-normal">30d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line-soft)]">
                {sorted.map((r) => {
                  const band = riskBand(r.composite);
                  return (
                    <tr key={r.iso} className="hover:bg-[color:var(--color-panel-2)]">
                      <td className="py-1.5">
                        <Link href={`/country/${r.iso}`} className="text-text hover:text-[color:var(--color-accent)]">
                          {countryName(r.iso)}
                        </Link>
                      </td>
                      <td className="mono-num py-1.5 text-right" style={{ color: `var(--color-${band.tone})` }}>{r.composite}</td>
                      <td className="py-1.5 text-right text-[10.5px]" style={{ color: `var(--color-${band.tone})` }}>{band.label}</td>
                      <td className="hidden py-1.5 text-right text-[10.5px] text-muted sm:table-cell">{r.topDomain ?? '—'}</td>
                      <td className="mono-num py-1.5 text-right text-muted">{r.eventCount}</td>
                      <td className="py-1.5 text-right"><Trend value={r.trend} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-4">
            <SectionTitle kicker="Highest measured tension">Relationship leaderboard</SectionTitle>
            <div className="max-h-[240px] divide-y divide-[color:var(--color-line-soft)] overflow-y-auto">
              {dyads.map((d) => (
                <Link key={d.key} href={`/dyad/${d.a}-${d.b}`}
                  className="flex items-center gap-2.5 py-1.5 transition-colors hover:bg-[color:var(--color-panel-2)]">
                  <span className="flex-1 truncate text-[11.5px] text-text">
                    {countryName(d.a)} — {countryName(d.b)}
                  </span>
                  <Sparkline data={d.series.map((s) => s.value)} width={56} height={18}
                    color={d.score >= 55 ? 'var(--color-high)' : 'var(--color-guarded)'} />
                  <span className="mono-num w-7 text-right text-[12px]"
                    style={{ color: d.score >= 55 ? 'var(--color-high)' : 'var(--color-text)' }}>{d.score}</span>
                  <Trend value={d.trend} />
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle kicker="Heat = escalation × corroboration">Flashpoint activity</SectionTitle>
            <BarList items={hotspots.slice(0, 10).map((h) => ({ label: h.name, value: h.heat }))} />
          </Panel>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Panel className="p-4">
          <SectionTitle kicker="Corpus composition">Languages</SectionTitle>
          <Ribbon parts={languageMix(events).slice(0, 7).map((l) => ({
            label: LANGUAGE_LABEL[l.language] ?? l.language, value: l.count,
            color: LANG_COLORS[l.language] ?? '#5b697d',
          }))} />
        </Panel>
        <Panel className="p-4">
          <SectionTitle kicker="Event classification">Domains</SectionTitle>
          <BarList items={domainMix(events).map((d) => ({ label: d.domain, value: d.count }))} />
        </Panel>
        <Panel className="p-4">
          <SectionTitle kicker="Events flagged for a reader’s attention" action={
            <Link href="/methodology" className="text-[10.5px] text-faint hover:text-muted">Why? →</Link>
          }>Needs scrutiny</SectionTitle>
          {flagged.length ? (
            <div className="max-h-[220px] overflow-y-auto">
              {flagged.slice(0, 20).map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          ) : <Empty>Nothing flagged in the current corpus.</Empty>}
        </Panel>
      </section>

      <section>
        <SectionTitle kicker="Every PRC official formula currently detected" action={
          <Link href="/china" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">China Watch →</Link>
        }>Escalation ladder log</SectionTitle>
        <Panel className="p-3.5">
          {ladderAlerts(events, 24).map((e) => (
            <Link key={e.id} href={`/events/${e.id}`}
              className="hairline flex items-center gap-3 py-1.5 transition-colors hover:bg-[color:var(--color-panel-2)]">
              <Badge tone="var(--color-zh)">{e.ladderRung}</Badge>
              <span className="zh-text w-32 flex-none text-[12px]">{e.ladderZh}</span>
              <span className="hidden w-44 flex-none truncate text-[11px] text-muted sm:block">{e.ladderEn}</span>
              <span className="flex-1 truncate text-[11.5px] text-text">{e.title}</span>
              <span className="mono-num w-14 flex-none text-right text-[10px] text-faint">{timeAgo(e.lastSeen)}</span>
            </Link>
          ))}
        </Panel>
      </section>
    </div>
  );
}
