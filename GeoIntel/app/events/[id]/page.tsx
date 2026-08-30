import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Panel, SectionTitle, Badge, Stat } from '@/components/ui';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';
import { LadderGauge } from '@/components/LadderGauge';
import { Paywall } from '@/components/Paywall';
import { eventDetail, countryName } from '@/lib/queries';
import { consume } from '@/lib/quota';
import { fmtDate, timeAgo, escalationLabel } from '@/lib/format';
import { LANGUAGE_LABEL } from '@/lib/lang/detect';
import { ZH_GLOSSARY } from '@/data/glossary.zh';
import { FramingAnalysis } from '@/components/FramingAnalysis';
import { VideoWall } from '@/components/VideoWall';
import { cachedAnalysis } from '@/lib/llm/analyse';
import { llmEnabled } from '@/lib/llm/client';

export const dynamic = 'force-dynamic';

const OWNERSHIP_LABEL: Record<string, string> = {
  state: 'State-owned', state_affiliated: 'State-affiliated', public: 'Public broadcaster',
  independent: 'Independent', tabloid: 'Tabloid / partisan',
};
const OWNERSHIP_TONE: Record<string, string> = {
  state: 'var(--color-high)', state_affiliated: 'var(--color-elevated)',
  public: 'var(--color-verified)', independent: 'var(--color-low)', tabloid: 'var(--color-severe)',
};

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = eventDetail(id);
  if (!detail) notFound();
  const { event, articles } = detail;

  const gate = await consume('event_detail', id);
  const esc = escalationLabel(event.escalation);
  // Render an already-computed analysis without an API call; otherwise offer the button.
  const priorAnalysis = llmEnabled() ? cachedAnalysis(event, articles) : null;

  // Glossary terms actually present across this event's Chinese-language reporting.
  const glossHits = [...new Set(articles.flatMap((a) => a.glossed))]
    .map((en) => ZH_GLOSSARY.find((t) => t.en === en))
    .filter(Boolean)
    .slice(0, 24) as typeof ZH_GLOSSARY;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/events" className="text-[11px] text-faint hover:text-muted">← All events</Link>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={esc.color}>{esc.label}</Badge>
          <Badge tone="var(--color-muted)">{event.domain}</Badge>
          {event.hotspots.map((h) => <Badge key={h} tone="var(--color-accent)">{h.toUpperCase()}</Badge>)}
          <span className="ml-1 text-[11px] text-faint">{timeAgo(event.lastSeen)}</span>
        </div>
        <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-snug tracking-tight">{event.title}</h1>
        {event.summary && <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-muted">{event.summary}</p>}

        {event.videoId ? (
          <div className="mt-4 max-w-2xl">
            <VideoWall events={[event]} />
          </div>
        ) : event.imageUrl ? (
          <figure className="mt-4 max-w-2xl">
            {/* Publisher's own feed image. Nothing is fabricated or generated. */}
            <img src={event.imageUrl} alt="" loading="lazy"
              className="w-full rounded-lg object-cover ring-1 ring-[color:var(--color-line)]" />
            <figcaption className="mt-1.5 text-[10.5px] text-faint">
              Image supplied by the publisher&apos;s feed.
            </figcaption>
          </figure>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {event.actors.map((a) => (
            <Link key={a} href={`/country/${a}`}
              className="rounded border border-[color:var(--color-line)] px-2 py-0.5 text-[11px] text-muted hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">
              {countryName(a)}
            </Link>
          ))}
        </div>
      </div>

      {!gate.allowed ? (
        <Paywall what="Full event analysis" kind={gate.kind} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <ConfidenceMeter value={event.confidence} signals={event.signals} flags={event.flags} />
              {event.ladderRung && <LadderGauge rung={event.ladderRung} />}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Reports" value={articles.length} />
                <Stat label="Countries" value={event.countries.length} />
                <Stat label="Languages" value={event.languages.length} />
                <Stat label="Escalation" value={event.escalation} tone={esc.color} />
              </div>

              <Panel className="p-4">
                <SectionTitle
                  kicker="Every report in this cluster, in order of publication"
                  action={
                    <span className="flex items-center gap-2 text-[10.5px] text-faint">
                      Export
                      <a href={`/api/export?event=${encodeURIComponent(id)}&format=csv`}
                        className="rounded border border-[color:var(--color-line)] px-1.5 py-0.5 hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">CSV</a>
                      <a href={`/api/export?event=${encodeURIComponent(id)}&format=json`}
                        className="rounded border border-[color:var(--color-line)] px-1.5 py-0.5 hover:border-[color:var(--color-accent-dim)] hover:text-[color:var(--color-accent)]">JSON</a>
                    </span>
                  }
                >
                  Source-by-source evidence
                </SectionTitle>
                <div className="divide-y divide-[color:var(--color-line-soft)]">
                  {articles.map((a) => (
                    <article key={a.id} className="py-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={OWNERSHIP_TONE[a.ownership]} title={`Ownership class: ${OWNERSHIP_LABEL[a.ownership]}`}>
                          {OWNERSHIP_LABEL[a.ownership] ?? a.ownership}
                        </Badge>
                        <span className="text-[11.5px] font-medium text-text">{a.outlet}</span>
                        <span className="text-[10.5px] text-faint">{a.sourceCountry}</span>
                        <span className="text-[10.5px] text-faint">{LANGUAGE_LABEL[a.language] ?? a.language}</span>
                        {a.isPrimary && <Badge tone="var(--color-verified)">Primary</Badge>}
                        {a.ladderRung && <Badge tone="var(--color-zh)">rung {a.ladderRung}</Badge>}
                        <span className="mono-num ml-auto text-[10.5px] text-faint">{fmtDate(a.publishedAt)}</span>
                      </div>
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        className={`block text-[13px] leading-snug hover:underline ${a.language === 'zh' ? 'zh-text' : 'text-text'}`}>
                        {a.title}
                      </a>
                      {a.titleEn && (
                        <div className="mt-1 text-[11.5px] italic leading-snug text-muted">
                          Glossed: {a.titleEn}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <FramingAnalysis eventId={id} initial={priorAnalysis} enabled={llmEnabled()} />

          {glossHits.length > 0 && (
            <Panel className="p-4">
              <SectionTitle kicker="Recognised in the Chinese-language reporting on this event">
                Terminology and framing
              </SectionTitle>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {glossHits.map((t) => (
                  <div key={t.zh} className="rounded-md border border-[color:var(--color-line-soft)] p-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="zh-text text-[15px]">{t.zh}</span>
                      <span className="text-[12px] text-text">{t.en}</span>
                      <Badge tone={t.category === 'framing' ? 'var(--color-elevated)' : 'var(--color-faint)'}>{t.category}</Badge>
                    </div>
                    {t.note && <p className="mt-1.5 text-[11px] leading-snug text-muted">{t.note}</p>}
                  </div>
                ))}
              </div>
              <p className="mt-3 border-t border-[color:var(--color-line-soft)] pt-2.5 text-[10.5px] leading-relaxed text-faint">
                Terms flagged <em>framing</em> are not neutral vocabulary — their use is itself a
                position. An outlet writing 藏南 rather than a neutral name for Arunachal Pradesh
                has taken a sovereignty stance in the act of naming.
              </p>
            </Panel>
          )}

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
