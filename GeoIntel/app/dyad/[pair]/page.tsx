import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle, Stat, Badge, Trend, Empty } from '@/components/ui';
import { EventCard } from '@/components/EventCard';
import { Columns, BarList, Ribbon } from '@/components/charts';
import { Paywall } from '@/components/Paywall';
import { WatchToggle } from '@/components/Watchlist';
import { corpus, countryName } from '@/lib/queries';
import { dyadTension } from '@/lib/risk';
import { consume } from '@/lib/quota';
import { BY_ISO, HOTSPOTS } from '@/data/countries';
import { LANGUAGE_LABEL } from '@/lib/lang/detect';
import { ESCALATION_LADDER } from '@/data/glossary.zh';

export const dynamic = 'force-dynamic';

const LANG_COLORS: Record<string, string> = {
  en: '#4c7fd4', zh: '#ff8f7a', hi: '#e8b339', ja: '#9d7ad4', ru: '#4fb477',
  ar: '#3fb6a8', ko: '#d47aa8', ur: '#c9a227',
};

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const [a, b] = pair.toUpperCase().split('-');
  const na = BY_ISO.get(a)?.name, nb = BY_ISO.get(b)?.name;
  return { title: na && nb ? `${na} — ${nb}` : 'Relationship' };
}

export default async function DyadPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  const [aIso, bIso] = pair.toUpperCase().split('-');
  const a = BY_ISO.get(aIso), b = BY_ISO.get(bIso);
  if (!a || !b || a.iso === b.iso) notFound();

  const events = corpus();
  const d = dyadTension(a.iso, b.iso, events);
  const gate = await consume('dyad_analysis', [a.iso, b.iso].sort().join('-'));

  const mine = events.filter((e) => e.actors.includes(a.iso) && e.actors.includes(b.iso));
  const domains = new Map<string, number>();
  const langs = new Map<string, number>();
  for (const e of mine) {
    domains.set(e.domain, (domains.get(e.domain) ?? 0) + 1);
    for (const l of e.languages) langs.set(l, (langs.get(l) ?? 0) + 1);
  }
  const sharedHotspots = HOTSPOTS.filter((h) => h.parties.includes(a.iso) && h.parties.includes(b.iso));
  const ladderHere = mine.filter((e) => e.ladderRung !== null)
    .sort((x, y) => (y.ladderRung ?? 0) - (x.ladderRung ?? 0));
  const escalatory = mine.filter((e) => e.escalation > 15).length;
  const deEscalatory = mine.filter((e) => e.escalation < -5).length;

  return (
    <div className="space-y-7">
      <section>
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">Relationship analysis</div>
        <h1 className="mt-1 flex flex-wrap items-baseline gap-2.5 text-2xl font-semibold tracking-tight">
          <Link href={`/country/${a.iso}`} className="hover:text-[color:var(--color-accent)]">{a.name}</Link>
          <span className="text-faint">—</span>
          <Link href={`/country/${b.iso}`} className="hover:text-[color:var(--color-accent)]">{b.name}</Link>
        </h1>
        <div className="mt-2">
          <WatchToggle item={{ kind: 'dyad', id: `${a.iso}-${b.iso}`, label: `${a.name} — ${b.name}` }} />
        </div>
        {sharedHotspots.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sharedHotspots.map((h) => <Badge key={h.id} tone="var(--color-accent)">{h.name}</Badge>)}
          </div>
        )}
      </section>

      {!gate.allowed ? (
        <Paywall what={`The ${a.name}–${b.name} relationship analysis`} kind={gate.kind} />
      ) : d.eventCount === 0 ? (
        <Empty>
          No events in the current corpus name both {a.name} and {b.name}. This pair is not on a
          configured beat — the engine tracks what it is pointed at.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Tension index" value={d.score} sub="0–100, recency-decayed"
              tone={d.score >= 55 ? 'var(--color-high)' : undefined} />
            <Stat label="90-day trend" value={<Trend value={d.trend} />} sub="second half vs first" />
            <Stat label="Shared events" value={d.eventCount} sub="naming both states" />
            <Stat label="Escalatory" value={escalatory} sub="events above threshold" tone="var(--color-high)" />
            <Stat label="De-escalatory" value={deEscalatory} sub="talks, agreements, pullbacks" tone="var(--color-low)" />
            <Stat label="PRC formulae" value={ladderHere.length} sub="official rungs detected"
              tone={ladderHere.length ? 'var(--color-zh)' : undefined} />
          </div>

          <Panel className="p-4">
            <SectionTitle kicker="Daily escalation × corroboration, 90 days">Tension over time</SectionTitle>
            <Columns data={d.series} height={110}
              color={d.score >= 55 ? 'var(--color-high)' : 'var(--color-accent)'} />
            <div className="mt-1.5 flex justify-between text-[10px] text-faint">
              <span>{d.series[0]?.date}</span>
              <span>{d.series[Math.floor(d.series.length / 2)]?.date}</span>
              <span>{d.series[d.series.length - 1]?.date}</span>
            </div>
          </Panel>

          <section className="grid gap-5 lg:grid-cols-3">
            <Panel className="p-4">
              <SectionTitle kicker="What this relationship is about">Domains</SectionTitle>
              <BarList items={[...domains.entries()].sort((x, y) => y[1] - x[1])
                .map(([label, value]) => ({ label, value }))} />
            </Panel>
            <Panel className="p-4">
              <SectionTitle kicker="Who is reporting it">Source languages</SectionTitle>
              <Ribbon parts={[...langs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([l, n]) => ({
                label: LANGUAGE_LABEL[l] ?? l, value: n, color: LANG_COLORS[l] ?? '#5b697d',
              }))} />
              <p className="mt-3 text-[11px] leading-relaxed text-faint">
                A relationship reported only from one side&apos;s media is a weaker read than one
                picked up across languages. Language spread feeds directly into every event&apos;s
                corroboration score.
              </p>
            </Panel>
            <Panel className="p-4">
              <SectionTitle kicker="Official PRC formulae on this file">Escalation ladder</SectionTitle>
              {ladderHere.length ? (
                <div className="space-y-2">
                  {ladderHere.slice(0, 6).map((e) => {
                    const rung = ESCALATION_LADDER.find((r) => r.rung === e.ladderRung);
                    return (
                      <Link key={e.id} href={`/events/${e.id}`} className="block rounded border border-[color:var(--color-line-soft)] p-2 hover:border-[color:var(--color-accent-dim)]">
                        <div className="flex items-center gap-2">
                          <Badge tone="var(--color-zh)">rung {e.ladderRung}</Badge>
                          <span className="zh-text text-[13px]">{e.ladderZh}</span>
                        </div>
                        <div className="mt-1 text-[11px] leading-snug text-muted line-clamp-2">{e.title}</div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] leading-relaxed text-muted">
                  No PRC official escalation formula detected on this pair in the current corpus.
                  {a.iso !== 'CHN' && b.iso !== 'CHN' && ' This detector applies only to relationships involving China.'}
                </p>
              )}
            </Panel>
          </section>

          <section>
            <SectionTitle kicker="Highest escalation × corroboration">Defining events</SectionTitle>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {d.topEvents.map((e) => <EventCard key={e.id} event={e} />)}
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
