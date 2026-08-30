import Link from 'next/link';
import { Panel, SectionTitle, Stat, Badge, Empty, Trend } from '@/components/ui';
import { EventCard, EventRow, ConfidenceChip } from '@/components/EventCard';
import { ChineseText } from '@/components/ChineseText';
import { titleGloss } from '@/components/EventCard';
import { Radar, BarList, Ribbon, Sparkline } from '@/components/charts';
import { Mandala } from '@/components/Mandala';
import { corpus, ladderAlerts, chineseStream, eventsFor, countryName, languageStats, articlesIn } from '@/lib/queries';
import { countryRisk, dyadTension, VECTORS } from '@/lib/risk';
import { ESCALATION_LADDER, ZH_GLOSSARY } from '@/data/glossary.zh';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'China Watch' };

const CHN_DYADS = ['IND', 'TWN', 'USA', 'PHL', 'JPN', 'RUS', 'PAK', 'VNM', 'KOR', 'AUS'];

export default async function ChinaPage() {
  const events = corpus();
  const risk = countryRisk('CHN', events);
  const ladder = ladderAlerts(events, 14);
  const zhEvents = chineseStream(events, 30);
  const dyads = CHN_DYADS.map((iso) => dyadTension('CHN', iso, events)).sort((a, b) => b.score - a.score);

  // Vocabulary is tallied over the whole Chinese-language corpus, not the display
  // sample — these are headline figures and must be exact.
  const zhStats = languageStats('zh');
  const zhArticles = articlesIn('zh');
  const termTally = new Map<string, number>();
  for (const a of zhArticles) for (const g of a.glossed) termTally.set(g, (termTally.get(g) ?? 0) + 1);
  const topTerms = [...termTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([en, n]) => ({ en, n, zh: ZH_GLOSSARY.find((t) => t.en === en)?.zh ?? '', cat: ZH_GLOSSARY.find((t) => t.en === en)?.category }));

  const rungCounts = ESCALATION_LADDER.map((r) => ({
    ...r, count: events.filter((e) => e.ladderRung === r.rung).length,
  })).filter((r) => r.count > 0);

  const framingHeavy = [...zhEvents]
    .filter((e) => e.escalation > 15)
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <section>
        <div className="text-[10px] uppercase tracking-[0.22em] text-faint">China Watch</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          PRC posture, read in Chinese
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-muted">
          {zhStats.articles.toLocaleString()} Chinese-language reports parsed against a curated
          geopolitical glossary and the PRC official escalation ladder. What Beijing says in Chinese
          and what it says in English are not always the same statement — this page reads the former.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Composite risk" value={risk.composite} sub="China as an actor" />
          <Stat label="Chinese reports" value={zhStats.articles.toLocaleString()} sub="in the corpus" tone="var(--color-zh)" />
          <Stat label="Events with 中文" value={zhStats.events.toLocaleString()} sub="Chinese-sourced clusters" />
          <Stat label="Ladder detections" value={ladderAlerts(events, 999).length} sub="official formulae" tone="var(--color-accent)" />
          <Stat label="Highest rung" value={ladder[0]?.ladderRung ?? '—'} sub={ladder[0]?.ladderEn ?? 'none detected'} tone="var(--color-zh)" />
          <Stat label="30-day trend" value={<Trend value={risk.trend} />} sub="vs prior window" />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <SectionTitle kicker="Ordered official formulae, with detections">
            Escalation ladder — current readings
          </SectionTitle>
          <Panel className="p-4">
            <div className="space-y-1.5">
              {ESCALATION_LADDER.map((r) => {
                const hit = rungCounts.find((x) => x.rung === r.rung);
                return (
                  <div key={r.rung} className="flex items-center gap-2.5">
                    <span className="mono-num w-5 text-right text-[10px] text-faint">{r.rung}</span>
                    <span className="w-[10.5rem] flex-none text-[12.5px]"
                      style={{ opacity: hit ? 1 : 0.35 }}>
                      <ChineseText text={r.zh} size="small" accent clamp={false} />
                    </span>
                    <span className="hidden flex-1 truncate text-[11px] text-muted sm:block"
                      style={{ opacity: hit ? 1 : 0.4 }}>{r.en}</span>
                    <div className="relative h-3.5 w-24 flex-none overflow-hidden rounded-sm bg-[color:var(--color-line-soft)]">
                      <div className="absolute inset-y-0 left-0"
                        style={{ width: `${r.severity}%`, background: hit ? 'var(--color-zh)' : 'var(--color-line)' }} />
                    </div>
                    <span className="mono-num w-7 text-right text-[11px]"
                      style={{ color: hit ? 'var(--color-zh)' : 'var(--color-faint)' }}>
                      {hit ? hit.count : '·'}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 border-t border-[color:var(--color-line-soft)] pt-2.5 text-[10.5px] leading-relaxed text-faint">
              Bars show each rung&apos;s severity; the number is how many events in the current corpus
              carry that formula. Movement <em>up</em> the ladder on a given file matters more than
              raw volume anywhere on it.
            </p>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <SectionTitle kicker="Frequency across Chinese-language reporting">Vocabulary in use</SectionTitle>
            {topTerms.length ? (
              <div className="space-y-1.5">
                {topTerms.map((t) => (
                  <div key={t.en} className="flex items-center gap-2.5">
                    <span className="w-32 flex-none text-[13px]">
                      <ChineseText text={t.zh} size="small" accent clamp={false} />
                    </span>
                    <span className="flex-1 truncate text-[11.5px] text-muted">{t.en}</span>
                    {t.cat === 'framing' && <Badge tone="var(--color-elevated)">framing</Badge>}
                    <div className="relative h-3 w-20 flex-none overflow-hidden rounded-sm bg-[color:var(--color-line-soft)]">
                      <div className="absolute inset-y-0 left-0 bg-[color:var(--color-zh)] opacity-70"
                        style={{ width: `${(t.n / topTerms[0].n) * 100}%` }} />
                    </div>
                    <span className="mono-num w-7 text-right text-[10.5px] text-faint">{t.n}</span>
                  </div>
                ))}
              </div>
            ) : <Empty>No Chinese-language reporting in the current corpus.</Empty>}
          </Panel>

          <Panel className="p-4">
            <SectionTitle kicker="Measured tension, China as focus">Relationship mandala</SectionTitle>
            <Mandala focus="CHN" size={380} nodes={dyads.map((d) => ({
              iso: d.a === 'CHN' ? d.b : d.a, score: d.score, eventCount: d.eventCount, trend: d.trend,
            }))} />
          </Panel>
        </div>
      </section>

      <section>
        <SectionTitle kicker="Events carrying an official PRC formula, highest rung first">
          Official statement detections
        </SectionTitle>
        {ladder.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {ladder.map((e) => (
              <Link key={e.id} href={`/events/${e.id}`}
                className="panel block p-3.5 transition-colors hover:border-[color:var(--color-accent-dim)]">
                <div className="flex items-center gap-2">
                  <Badge tone="var(--color-zh)" solid>rung {e.ladderRung}</Badge>
                  <ChineseText text={e.ladderZh!} size="small" accent clamp={false}
                    className="text-[14px]" />
                  <span className="ml-auto text-[10px] text-faint">{timeAgo(e.lastSeen)}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted">{e.ladderEn}</div>
                <h3 className="mt-2 text-[12.5px] leading-snug text-text">
                  <ChineseText text={e.title} english={titleGloss(e.title)} englishIsGloss />
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <ConfidenceChip value={e.confidence} />
                  <span className="text-[10.5px] text-faint">{e.actors.slice(0, 3).map(countryName).join(' · ')}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : <Empty>No official escalation formulae detected in the current corpus.</Empty>}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionTitle kicker="Highest escalation among Chinese-sourced events">Notable</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {framingHeavy.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
        <div>
          <SectionTitle kicker="Newest Chinese-language clusters" action={
            <Link href="/events?lang=zh" className="text-[11px] text-muted hover:text-[color:var(--color-accent)]">Filter feed →</Link>
          }>中文 stream</SectionTitle>
          <Panel className="px-3 py-1.5">
            {zhEvents.slice(0, 16).map((e) => <EventRow key={e.id} event={e} />)}
          </Panel>
        </div>
      </section>
    </div>
  );
}
