import Link from 'next/link';
import { Panel, SectionTitle, Stat, Badge, Trend, Empty } from '@/components/ui';
import { EventCard, EventRow } from '@/components/EventCard';
import { Sparkline, Radar, BarList, Columns } from '@/components/charts';
import { Mandala } from '@/components/Mandala';
import { corpus, indiaBoard, eventsFor, hotspotActivity, countryName } from '@/lib/queries';
import { countryRisk, VECTORS, riskBand } from '@/lib/risk';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'India Focus' };

export default async function IndiaPage() {
  const events = corpus();
  const board = indiaBoard(events);
  const risk = countryRisk('IND', events);
  const band = riskBand(risk.composite);
  const indiaEvents = eventsFor({ actor: 'IND', limit: 40 }, events);
  const china = board.find((d) => d.a === 'CHN' || d.b === 'CHN');
  const hotspots = hotspotActivity(events).filter((h) => h.parties.includes('IND'));

  return (
    <div className="space-y-8">
      <section>
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">India Focus</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">India — security environment</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
          The neighbourhood as measured, not as declared. Ring position and tension scores come
          from observed reporting volume, escalation vocabulary and corroboration — including
          Chinese-, Urdu- and Hindi-language sources that English-only monitoring misses.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Composite risk" value={risk.composite} sub={band.label} tone={`var(--color-${band.tone})`} />
          <Stat label="Events" value={risk.eventCount} sub="involving India" />
          <Stat label="30-day trend" value={<Trend value={risk.trend} />} sub="vs prior window" />
          <Stat label="China tension" value={china?.score ?? '—'} sub={`${china?.eventCount ?? 0} events`} tone="var(--color-high)" />
          <Stat label="Top domain" value={risk.topDomain ?? '—'} sub="most frequent classification" />
          <Stat label="Flashpoints" value={hotspots.length} sub="active geographies" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel className="p-4">
          <SectionTitle kicker="Concentric rings by measured tension">Neighbourhood mandala</SectionTitle>
          <Mandala focus="IND" nodes={board.map((d) => ({
            iso: d.a === 'IND' ? d.b : d.a, score: d.score, eventCount: d.eventCount, trend: d.trend,
          }))} />
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Kautilya&apos;s mandala placed neighbours in circles of friend and rival. Here the rings
            are computed rather than assumed: inner ring means highest current friction, whatever
            the formal relationship says.
          </p>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <SectionTitle kicker="Six-vector profile">Risk composition</SectionTitle>
            <div className="flex flex-wrap items-center gap-6">
              <Radar axes={VECTORS.map((v) => ({ label: v.slice(0, 4), value: risk.vectors[v] }))} />
              <div className="min-w-[180px] flex-1">
                <BarList items={VECTORS.map((v) => ({ label: v, value: risk.vectors[v] }))} max={100} />
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionTitle kicker="Ranked by tension score">Bilateral board</SectionTitle>
            <div className="divide-y divide-[color:var(--color-line-soft)]">
              {board.map((d) => {
                const other = d.a === 'IND' ? d.b : d.a;
                return (
                  <Link key={d.key} href={`/dyad/IND-${other}`}
                    className="flex items-center gap-3 py-2 transition-colors hover:bg-[color:var(--color-panel-2)]">
                    <span className="w-28 flex-none truncate text-[12.5px] text-text">{countryName(other)}</span>
                    <Sparkline data={d.series.map((s) => s.value)} width={100} height={22}
                      color={d.score >= 55 ? 'var(--color-high)' : 'var(--color-guarded)'} />
                    <span className="mono-num ml-auto w-8 text-right text-[13px]"
                      style={{ color: d.score >= 55 ? 'var(--color-high)' : 'var(--color-text)' }}>{d.score}</span>
                    <span className="mono-num w-10 text-right text-[10px] text-faint">{d.eventCount}ev</span>
                    <Trend value={d.trend} />
                  </Link>
                );
              })}
            </div>
          </Panel>
        </div>
      </section>

      {china && (
        <section>
          <SectionTitle kicker="The primary strategic relationship" action={
            <Link href="/dyad/IND-CHN" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">Full dyad analysis →</Link>
          }>India — China, 90 days</SectionTitle>
          <Panel className="p-4">
            <div className="mb-3 flex items-end gap-4">
              <div>
                <div className="mono-num text-3xl leading-none" style={{ color: 'var(--color-high)' }}>{china.score}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-faint">tension index</div>
              </div>
              <div className="mb-1"><Trend value={china.trend} /></div>
              <div className="mb-1 text-[11px] text-muted">{china.eventCount} events tracked</div>
            </div>
            <Columns data={china.series} height={80} />
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {china.topEvents.slice(0, 4).map((e) => <EventCard key={e.id} event={e} compact />)}
            </div>
          </Panel>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <SectionTitle kicker="All India-linked reporting">Recent events</SectionTitle>
          {indiaEvents.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {indiaEvents.slice(0, 10).map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          ) : <Empty>No India-linked events in the corpus.</Empty>}
        </div>
        <div>
          <SectionTitle kicker="Geographies with current activity">Flashpoints</SectionTitle>
          <Panel className="divide-y divide-[color:var(--color-line-soft)]">
            {hotspots.map((h) => (
              <Link key={h.id} href={`/events?q=${encodeURIComponent(h.name.split(' ')[0])}`}
                className="block px-3.5 py-2.5 transition-colors hover:bg-[color:var(--color-panel-2)]">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-text">{h.name}</span>
                  <Badge tone="var(--color-muted)">{h.domain}</Badge>
                  <span className="mono-num ml-auto text-[12px] text-[color:var(--color-accent)]">{h.heat}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-faint">
                  {h.parties.map(countryName).join(' · ')} — {h.count} events
                  {h.latest && <> · latest {timeAgo(h.latest.lastSeen)}</>}
                </div>
              </Link>
            ))}
          </Panel>
        </div>
      </section>
    </div>
  );
}
