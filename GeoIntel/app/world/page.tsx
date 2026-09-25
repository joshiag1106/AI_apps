import Link from 'next/link';
import { Panel, SectionTitle, Stat, Badge, Trend, Empty } from '@/components/ui';
import { BarList } from '@/components/charts';
import { CountUp } from '@/components/CountUp';
import { corpus, countryRisks, corpusStats } from '@/lib/queries';
import { riskBand } from '@/lib/risk';
import { BY_ISO } from '@/data/countries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'World Focus' };

/**
 * India Focus and China Watch are hand-built deep dives on the two relationships Kautilya
 * cares most about. This is the page above them: every state the corpus has anything on,
 * ranked by the same composite risk score, so a reader can see where India and China sit
 * against the other ~40-odd states rather than only against each other.
 *
 * It deliberately does not repeat the Threat Board's world map or live feed — this is the
 * ranked list the board only ever shows a slice of, not a second map.
 */
export default async function WorldPage() {
  const events = corpus();
  const stats = corpusStats(events);
  const risks = countryRisks(events);
  const elevatedPlus = risks.filter((r) => r.composite >= 40).length;
  const top = risks[0];

  // Average composite by region — a lens neither the Threat Board nor any single
  // country page offers: which parts of the world are hottest right now, not just which
  // single state is.
  const byRegion = new Map<string, { sum: number; n: number }>();
  for (const r of risks) {
    const region = BY_ISO.get(r.iso)?.region ?? 'Other';
    const cell = byRegion.get(region) ?? { sum: 0, n: 0 };
    cell.sum += r.composite;
    cell.n += 1;
    byRegion.set(region, cell);
  }
  const regions = [...byRegion.entries()]
    .map(([region, { sum, n }]) => ({ region, avg: Math.round(sum / n), n }))
    .sort((a, b) => b.avg - a.avg);

  // India and China each have a hand-built page richer than the generic /country/[iso]
  // profile; send their rows there instead of into the paywalled generic page.
  const focusHref = (iso: string) =>
    iso === 'IND' ? '/india' : iso === 'CHN' ? '/china' : `/country/${iso}`;

  return (
    <div className="space-y-8">
      <section>
        <div className="text-[12px] uppercase tracking-[0.22em] text-faint">World Focus</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Every state in the corpus, ranked by measured risk
        </h1>
        <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted">
          The same composite score behind India Focus and China Watch, computed for every state
          with reporting in the corpus — not just the two Kautilya covers in depth. Ranked by
          risk, not by size or headline volume.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="States tracked" value={<CountUp value={risks.length} />} sub="with events in the corpus" />
          <Stat label="Highest risk" value={top ? top.iso : '—'}
            sub={top ? `${BY_ISO.get(top.iso)?.name ?? top.iso}, ${top.composite}` : 'no data'}
            tone="var(--color-high)" />
          <Stat label="Elevated or above" value={<CountUp value={elevatedPlus} />} sub="composite ≥ 40" />
          <Stat label="Events tracked" value={<CountUp value={stats.events} />} sub="across every state" />
        </div>
      </section>

      {risks.length === 0 ? (
        <Empty>No state has any events in the current corpus.</Empty>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <SectionTitle kicker="Click through to any state's own profile">Ranked by composite risk</SectionTitle>
            <Panel className="divide-y divide-[color:var(--color-line-soft)]">
              {risks.map((r, i) => {
                const country = BY_ISO.get(r.iso);
                const band = riskBand(r.composite);
                return (
                  <Link key={r.iso} href={focusHref(r.iso)}
                    className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-[color:var(--color-panel-2)]">
                    <span className="mono-num w-6 flex-none text-right text-[13px] text-faint">{i + 1}</span>
                    <span className="w-36 flex-none truncate text-[15px] text-text">
                      {country?.name ?? r.iso}
                    </span>
                    <span className="hidden w-28 flex-none truncate text-[13px] text-faint sm:inline">
                      {country?.region ?? ''}
                    </span>
                    <Badge tone={`var(--color-${band.tone})`}>{band.label}</Badge>
                    <span className="hidden flex-1 truncate text-[13px] text-faint md:inline">
                      {r.topDomain ?? ''}
                    </span>
                    <span className="mono-num w-8 text-right text-[15px]"
                      style={{ color: r.composite >= 55 ? 'var(--color-high)' : 'var(--color-text)' }}>
                      {r.composite}
                    </span>
                    <span className="mono-num w-14 flex-none text-right text-[12px] text-faint">
                      {r.eventCount}ev
                    </span>
                    <Trend value={r.trend} />
                  </Link>
                );
              })}
            </Panel>
          </div>

          <div>
            <SectionTitle kicker="Mean composite score, states with events only">By region</SectionTitle>
            <Panel className="p-3.5">
              <BarList items={regions.map((r) => ({ label: `${r.region} (${r.n})`, value: r.avg }))} max={100} />
            </Panel>
          </div>
        </section>
      )}
    </div>
  );
}
