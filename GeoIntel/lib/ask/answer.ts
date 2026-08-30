import { parseQuestion, type AskIntent } from '@/lib/ask/parse';
import { countryName } from '@/lib/queries';
import { HOTSPOTS } from '@/data/countries';
import type { GeoEvent } from '@/lib/types';

/**
 * Answering a question from the corpus, deterministically.
 *
 * Everything here works with no API key, because the product's rule is that the
 * deterministic engine always answers and the language model is an enhancement over it.
 * What this returns is therefore a real answer — counts, matched events, the evidence
 * behind them — not a prompt waiting for a model.
 *
 * It also returns how it read the question. That matters more than it sounds: pattern
 * matching misreads things, and without `readAs` a misparsed question is indistinguishable
 * from an empty corpus. Showing the reading turns a wrong answer into a debuggable one.
 */

export interface AskFigure { label: string; value: string; sub?: string }

export interface AskAnswer {
  question: string;
  intent: AskIntent;
  /** What the parser understood, for display. */
  readAs: { label: string; value: string }[];
  headline: string;
  total: number;
  matched: GeoEvent[];
  figures: AskFigure[];
  empty: boolean;
}

const MAX_EVENTS = 24;
/** Recency-weighted significance, matching how the rest of the app ranks events. */
const impact = (e: GeoEvent) =>
  Math.max(0, e.escalation) * (e.confidence / 100)
  + Math.max(0, 30 - (Date.now() - Date.parse(e.lastSeen)) / 86_400_000);

function joinList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function hotspotName(id: string): string {
  return HOTSPOTS.find((h) => h.id === id)?.name ?? id;
}

function describe(intent: AskIntent): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (intent.actors.length) out.push({ label: 'States', value: intent.actors.map(countryName).join(' + ') });
  if (intent.hotspots.length) out.push({ label: 'Flashpoint', value: intent.hotspots.map(hotspotName).join(', ') });
  // Shown as context so it is clear these were not required of every event.
  if (intent.impliedActors.length) {
    out.push({ label: 'Parties there', value: joinList(intent.impliedActors.map(countryName)) });
  }
  if (intent.domains.length) out.push({ label: 'Domain', value: intent.domains.join(', ') });
  if (intent.minRung != null) out.push({ label: 'PRC ladder', value: `rung ${intent.minRung}+` });
  if (intent.windowDays != null) out.push({ label: 'Window', value: `last ${intent.windowDays} days` });
  if (intent.language) out.push({ label: 'Source language', value: intent.language });
  if (intent.minConfidence != null) out.push({ label: 'Corroboration', value: `score ${intent.minConfidence}+` });
  if (intent.keywords.length) out.push({ label: 'Terms', value: intent.keywords.join(', ') });
  return out;
}

/**
 * Keyword match with the lightest possible stemming.
 *
 * A question says "semiconductors" and the headline says "semiconductor". Nothing more
 * elaborate than trying the singular is needed to stop that one-letter difference from
 * looking like an empty corpus.
 */
function matchesKeywords(e: GeoEvent, keywords: string[]): boolean {
  const hay = `${e.title} ${e.summary}`.toLowerCase();
  return keywords.some((k) => hay.includes(k) || (k.endsWith('s') && hay.includes(k.slice(0, -1))));
}

/**
 * Apply a filter only if it leaves something behind.
 *
 * Used for the signals that are guesses rather than facts. `domain` is the clear case:
 * it is a keyword tally that silently falls back to 'Diplomatic', so 59% of the corpus
 * carries that one label — hard-filtering on it answers "no naval events" when what
 * happened is that the classifier called them something else. Narrowing when the label
 * agrees and standing down when it does not is the honest reading of a noisy signal.
 */
function narrowIfPossible<T>(list: T[], pred: (x: T) => boolean): { list: T[]; relaxed: boolean } {
  const next = list.filter(pred);
  return next.length ? { list: next, relaxed: false } : { list, relaxed: true };
}

export function answerQuestion(question: string, events: GeoEvent[]): AskAnswer {
  const intent = parseQuestion(question);

  let out = events;
  // Every named state must be present: "China and the Philippines" is a question about
  // the relationship, not about either of them separately.
  for (const iso of intent.actors) out = out.filter((e) => e.actors.includes(iso));
  for (const h of intent.hotspots) out = out.filter((e) => e.hotspots.includes(h));
  if (intent.minRung != null) out = out.filter((e) => (e.ladderRung ?? 0) >= intent.minRung!);
  if (intent.language) out = out.filter((e) => e.languages.includes(intent.language!));
  if (intent.minConfidence != null) out = out.filter((e) => e.confidence >= intent.minConfidence!);
  if (intent.windowDays != null) {
    const cutoff = Date.now() - intent.windowDays * 86_400_000;
    out = out.filter((e) => Date.parse(e.lastSeen) >= cutoff);
  }

  const relaxed: string[] = [];
  let domainApplied = false;
  if (intent.domains.length) {
    const r = narrowIfPossible(out, (e) => intent.domains.includes(e.domain));
    out = r.list;
    domainApplied = !r.relaxed;
    if (r.relaxed) relaxed.push('domain');
  }

  // Signals that actually narrowed the question. A domain counts only when it applied —
  // a relaxed one narrowed nothing, so it cannot stand in for the asker's own words.
  const structured = Boolean(
    intent.actors.length || intent.hotspots.length || intent.minRung != null
    || intent.language || intent.minConfidence != null || intent.windowDays != null
    || domainApplied,
  );
  // With something already narrowing, keywords reorder rather than exclude: dropping real
  // China events for lacking one word serves nobody.
  //
  // With nothing else narrowing, they filter outright and are allowed to return zero. That
  // matters — asked about a state the gazetteer does not track, relaxing would answer with
  // whatever else is in the corpus, which reads as though the question was understood. An
  // honest empty answer beats a confident irrelevant one.
  if (intent.keywords.length && !structured) {
    out = out.filter((e) => matchesKeywords(e, intent.keywords));
  }

  const ranked = [...out].sort((a, b) => {
    if (intent.keywords.length && structured) {
      const ka = matchesKeywords(a, intent.keywords) ? 1 : 0;
      const kb = matchesKeywords(b, intent.keywords) ? 1 : 0;
      if (ka !== kb) return kb - ka;
    }
    return impact(b) - impact(a);
  });

  const total = ranked.length;
  const matched = ranked.slice(0, MAX_EVENTS);
  const subject = intent.hotspots.length
    ? joinList(intent.hotspots.map(hotspotName))
    : intent.actors.length ? joinList(intent.actors.map(countryName))
      : 'the corpus';

  const figures: AskFigure[] = [];
  if (total) {
    const corroborated = ranked.filter((e) => e.confidence >= 50).length;
    const zh = ranked.filter((e) => e.languages.includes('zh')).length;
    const ladder = ranked.filter((e) => e.ladderRung != null).length;
    const topDomain = [...ranked.reduce((m, e) => m.set(e.domain, (m.get(e.domain) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])[0];
    figures.push({ label: 'Events', value: String(total) });
    figures.push({ label: 'Corroborated', value: String(corroborated), sub: 'score 50 or better' });
    if (zh) figures.push({ label: 'Chinese-sourced', value: String(zh) });
    if (ladder) figures.push({ label: 'PRC formulae', value: String(ladder) });
    if (topDomain) figures.push({ label: 'Mostly', value: topDomain[0], sub: `${topDomain[1]} of ${total}` });
  }

  const window = intent.windowDays != null ? ` in the last ${intent.windowDays} days` : '';
  const headline = total === 0
    ? `No events in the corpus match that${window ? window : ''}. Either nothing has been reported, or the question named something the corpus does not track — the reading below shows which.`
    : intent.shape === 'count'
      ? `${total} event${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''} for ${subject}${window}.`
      : intent.shape === 'why'
        ? `${total} event${total === 1 ? '' : 's'} bear on that${window}. This engine reports what is being said, not why — the strongest reporting is below, ranked by escalation and corroboration.`
        : `${total} event${total === 1 ? '' : 's'} for ${subject}${window}, strongest first.`;

  const readAs = describe(intent);
  // Saying which signal was ignored is the difference between an answer the reader can
  // trust and one they cannot check.
  for (const r of relaxed) {
    readAs.push({ label: 'Relaxed', value: `${r} — no event matched it, so it was not applied` });
  }

  return { question, intent, readAs, headline, total, matched, figures, empty: total === 0 };
}
