import Link from 'next/link';
import { LANGUAGE_LABEL } from '@/lib/lang/detect';
import type { BeatLens, LensColumn } from '@/lib/lens/compare';

/** One Language Lens topic: its languages side by side. Presentational; see lib/lens/compare. */

const pct = (share: number) => `${Math.round(share * 100)}%`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const label = (language: string) => LANGUAGE_LABEL[language] ?? language;
const KICKER = 'mb-1 text-[12px] uppercase tracking-[0.16em] text-faint';

function Column({ c, names }: { c: LensColumn; names: Record<string, string> }) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-[color:var(--color-line)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold tracking-tight">{label(c.language)}</h3>
        <span className="mono-num text-[13px] text-faint">{c.articles} reports · {c.outlets} outlets</span>
      </div>

      <div>
        <div className={KICKER}>Asked</div>
        {c.asked.length ? (
          <ul className="space-y-0.5 text-[14px]">
            {c.asked.map((a) => (
              <li key={a.q}>
                <span lang={c.language} className="text-text">{a.q}</span>
                {a.en && <span className="text-faint"> — {a.en}</span>}
              </li>
            ))}
          </ul>
        ) : (
          // Detected language can differ from the search's: an English report returned by a
          // Chinese search is filed as English.
          <p className="text-[14px] text-faint">No search in this language — these reports came back from another language&apos;s search.</p>
        )}
      </div>

      <div>
        <div className={KICKER}>Framing</div>
        {c.framing.length === 0 ? (
          // Most often a language the lexicon barely reads, not one that frames nothing.
          <p className="text-[14px] text-faint">
            Framing cannot be read yet: only {c.classified} of {c.articles} {label(c.language)} reports use wording
            Kautilya recognises as military, diplomatic, economic and so on.
          </p>
        ) : (
        <>
        <p className="mb-1 text-[13px] text-faint">From the {c.classified} of {c.articles} reports whose wording shows one.</p>
        <ul className="space-y-1">
          {c.framing.slice(0, 4).map((f) => (
            <li key={f.key} className="flex items-center gap-2 text-[13px]">
              <span className="w-24 shrink-0 text-muted">{f.key}</span>
              <span className="h-1.5 min-w-0 flex-1 rounded bg-[color:var(--color-line)]">
                <span className="block h-full rounded bg-[color:var(--color-accent)]" style={{ width: pct(f.share) }} />
              </span>
              <span className="mono-num w-10 shrink-0 text-right text-text">{pct(f.share)}</span>
            </li>
          ))}
        </ul>
        </>
        )}
      </div>

      <div>
        <div className={KICKER}>Also named</div>
        <p className="text-[14px] text-muted">
          {c.others.length
            ? c.others.map((o) => `${names[o.key] ?? o.key} ${pct(o.share)}`).join(' · ')
            : 'No other state named in three or more reports.'}
        </p>
      </div>

      <div>
        <div className={KICKER}>Latest</div>
        <ul className="space-y-2">
          {c.latest.map((h) => (
            <li key={h.id} className="min-w-0 text-[14px] leading-snug">
              {h.eventId ? (
                <Link href={`/events/${encodeURIComponent(h.eventId)}`} lang={c.language}
                  className="text-text hover:text-[color:var(--color-accent)]">{h.title}</Link>
              ) : (
                <span lang={c.language} className="text-text">{h.title}</span>
              )}
              {h.titleEn && <span className="block text-faint">{h.titleEn}</span>}
              <span className="block text-[13px] text-faint">{h.outlet} · {day(h.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LensBeat({ beat, names }: { beat: BeatLens; names: Record<string, string> }) {
  const s = beat.sharpest;
  return (
    <section aria-labelledby={`lens-${beat.id}`} className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`lens-${beat.id}`} className="text-[19px] font-semibold tracking-tight">{beat.label}</h2>
        <span className="mono-num text-[13px] text-faint">{day(beat.since)} – {day(beat.until)}</span>
      </div>
      <p className="text-[15px] leading-relaxed text-text">
        {s
          ? `Sharpest difference: ${s.domain.toLowerCase()} framing — ${pct(s.high.share)} of ${label(s.high.language)} reports, ${pct(s.low.share)} of ${label(s.low.language)}.`
          : 'No framing difference large enough to call out — none is both 10 points wide and unlikely to be chance.'}
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {beat.columns.map((c) => <Column key={c.language} c={c} names={names} />)}
      </div>
    </section>
  );
}
