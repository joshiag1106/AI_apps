import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle, Stat, Badge, Trend, Empty } from '@/components/ui';
import { EventCard } from '@/components/EventCard';
import { Radar, BarList, Sparkline, Ribbon } from '@/components/charts';
import { Mandala } from '@/components/Mandala';
import { Paywall } from '@/components/Paywall';
import { WatchToggle } from '@/components/Watchlist';
import { corpus, eventsFor, countryName } from '@/lib/queries';
import { countryRisk, dyadTension, VECTORS, riskBand } from '@/lib/risk';
import { consume } from '@/lib/quota';
import { BY_ISO } from '@/data/countries';
import { LANGUAGE_LABEL } from '@/lib/lang/detect';

export const dynamic = 'force-dynamic';

const LANG_COLORS: Record<string, string> = {
  en: '#4c7fd4', zh: '#ff8f7a', hi: '#e8b339', ja: '#9d7ad4', ru: '#4fb477',
  ar: '#3fb6a8', ko: '#d47aa8', ur: '#c9a227',
};

export async function generateMetadata({ params }: { params: Promise<{ iso: string }> }) {
  const { iso } = await params;
  const c = BY_ISO.get(iso.toUpperCase());
  return { title: c ? `${c.name} — risk profile` : 'Country' };
}

export default async function CountryPage({ params }: { params: Promise<{ iso: string }> }) {
  const { iso: raw } = await params;
  const iso = raw.toUpperCase();
  const country = BY_ISO.get(iso);
  if (!country) notFound();

  const events = corpus();
  const mine = eventsFor({ actor: iso, limit: 300 }, events);
  const risk = countryRisk(iso, events);
  const band = riskBand(risk.composite);
  const gate = await consume('country_deepdive', iso);

  // Counterparties this state actually appears alongside, ranked by tension.
  const partners = [...new Set(mine.flatMap((e) => e.actors))].filter((a) => a !== iso);
  const dyads = partners.map((p) => dyadTension(iso, p, events))
    .filter((d) => d.eventCount > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const langs = new Map<string, number>();
  for (const e of mine) for (const l of e.languages) langs.set(l, (langs.get(l) ?? 0) + 1);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-faint">{country.region}</div>
          <span className="mono-num text-[10px] text-faint">{country.iso}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{country.name}</h1>
          <WatchToggle item={{ kind: 'country', id: country.iso, label: country.name }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {country.aliases.filter((a) => !/^[\x20-\x7F]+$/.test(a)).slice(0, 6).map((a) => (
            <span key={a} className="rounded border border-[color:var(--color-line)] px-1.5 py-0.5 text-[11px] text-muted">{a}</span>
          ))}
          <span className="self-center text-[10.5px] text-faint">— native-script forms matched during ingestion</span>
        </div>
      </section>

      {!gate.allowed ? (
        <Paywall what={`The ${country.name} risk profile`} kind={gate.kind} />
      ) : mine.length === 0 ? (
        <Empty>
          No events in the current corpus name {country.name}. The engine only tracks what its
          configured beats and feeds surface — absence here is not absence of activity.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Composite risk" value={risk.composite} sub={band.label} tone={`var(--color-${band.tone})`} />
            <Stat label="Events" value={risk.eventCount} sub="in current corpus" />
            <Stat label="30-day trend" value={<Trend value={risk.trend} />} sub="vs prior window" />
            <Stat label="Top domain" value={risk.topDomain ?? '—'} sub="most frequent" />
            <Stat label="Counterparties" value={dyads.length} sub="states co-occurring" />
            <Stat label="Languages" value={langs.size} sub="reporting on it" />
          </div>

          <section className="grid gap-6 lg:grid-cols-3">
            <Panel className="p-4">
              <SectionTitle kicker="Six-vector profile">Risk composition</SectionTitle>
              <div className="flex justify-center">
                <Radar axes={VECTORS.map((v) => ({ label: v.slice(0, 4), value: risk.vectors[v] }))} />
              </div>
              <div className="mt-3">
                <BarList items={VECTORS.map((v) => ({ label: v, value: risk.vectors[v] }))} max={100} />
              </div>
            </Panel>

            <Panel className="p-4">
              <SectionTitle kicker="Measured tension with counterparties">Relationships</SectionTitle>
              <Mandala focus={iso} size={330} nodes={dyads.map((d) => ({
                iso: d.a === iso ? d.b : d.a, score: d.score, eventCount: d.eventCount, trend: d.trend,
              }))} />
            </Panel>

            <div className="space-y-4">
              <Panel className="p-4">
                <SectionTitle kicker="Ranked by tension index">Bilateral scores</SectionTitle>
                <div className="divide-y divide-[color:var(--color-line-soft)]">
                  {dyads.slice(0, 8).map((d) => {
                    const other = d.a === iso ? d.b : d.a;
                    return (
                      <Link key={d.key} href={`/dyad/${iso}-${other}`}
                        className="flex items-center gap-2.5 py-2 transition-colors hover:bg-[color:var(--color-panel-2)]">
                        <span className="w-24 flex-none truncate text-[12px] text-text">{countryName(other)}</span>
                        <Sparkline data={d.series.map((s) => s.value)} width={70} height={20}
                          color={d.score >= 55 ? 'var(--color-high)' : 'var(--color-guarded)'} />
                        <span className="mono-num ml-auto text-[12.5px]"
                          style={{ color: d.score >= 55 ? 'var(--color-high)' : 'var(--color-text)' }}>{d.score}</span>
                        <Trend value={d.trend} />
                      </Link>
                    );
                  })}
                </div>
              </Panel>

              <Panel className="p-4">
                <SectionTitle kicker="Which languages report on it">Source languages</SectionTitle>
                <Ribbon parts={[...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => ({
                  label: LANGUAGE_LABEL[l] ?? l, value: n, color: LANG_COLORS[l] ?? '#5b697d',
                }))} />
              </Panel>
            </div>
          </section>

          <section>
            <SectionTitle kicker={`Events naming ${country.name}`} action={
              <Link href={`/events?actor=${iso}`} className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">Full feed →</Link>
            }>Recent activity</SectionTitle>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {mine.slice(0, 12).map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          </section>

          {!gate.unlimited && (
            <p className="text-center text-[11px] text-faint">
              {gate.remaining} of {gate.limit} free analyses remaining ·{' '}
              <Link href="/pricing" className="underline decoration-dotted hover:text-muted">See plans</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
