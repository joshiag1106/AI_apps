import type { Article, Domain } from '@/lib/types';
import type { Jump } from '@/lib/alerts/detect';
import { renderDigest } from '@/lib/alerts/send';
import { reprintFamilies } from '@/lib/verify/reprints';
import { personGraph, stateGraph } from '@/lib/graph/build';
import { BY_PERSON } from '@/data/people';
import { egoView } from '@/lib/graph/ego';
import { answerQuestion } from '@/lib/ask/answer';
import { VECTORS } from '@/lib/risk';
import { isJunkHeadline, rankedForExample } from './junk';
import type {
  AlertData, AskData, DemoInput, DyadData, EventData, LadderData, LanguageData, LensData, LensSide, NetworkData,
  PersonStep, Report, RiskData, TrailData,
} from './types';
import { describeSharpest, type BeatLens, type LensColumn } from '@/lib/lens/compare';
import { japaneseGloss } from '@/lib/lang/japanese';

const day = (a: Article) => a.publishedAt.slice(0, 10);

/**
 * The Beijing article chapters 2, 5 and 6 share, so one story is seen through three lenses. It must
 * be in Chinese and its headline must CONTAIN its own formula: the language chapter highlights that
 * formula inside the headline, and a formula that matched only in the snippet would make it lie.
 */
export function pickBeijing(input: DemoInput): Article | null {
  return rankedForExample(input.beijingArticles).find(
    (a) => a.language === 'zh' && a.ladderRung != null && !!a.ladderZh && a.title.includes(a.ladderZh),
  ) ?? null;
}

export function selectLanguage(input: DemoInput): LanguageData | null {
  const a = pickBeijing(input);
  if (!a) return null;
  return {
    headline: a.title, outlet: a.outlet, date: day(a),
    rung: a.ladderRung as number, ladderZh: a.ladderZh as string, ladderEn: a.ladderEn ?? '',
  };
}

export function selectLadder(input: DemoInput): LadderData | null {
  const a = pickBeijing(input);
  const other = rankedForExample(input.otherArticles).find((o) => o.ladderRung != null);
  if (!a || !other) return null;
  return {
    rung: a.ladderRung as number, ladderZh: a.ladderZh as string, ladderEn: a.ladderEn ?? '',
    beijing: { title: a.title, outlet: a.outlet, date: day(a) },
    other: { title: other.title, outlet: other.outlet, date: day(other), rung: other.ladderRung as number },
  };
}

export function selectTrail(input: DemoInput): TrailData | null {
  return input.trail.dots > 0 ? { trail: input.trail } : null;
}

/**
 * The example alert: the REAL digest, built from a real Beijing formula whose event is in the corpus.
 * The country is the one the formula was aimed at, and `rung` is the EVENT's rung — as in the real
 * detectJumps, where the event carries the highest PRC rung among its articles and the digest prints
 * that event's formula beneath it. An event with no rung is skipped: the real system never alerts on one.
 * `previous` is the highest rung in that country's EARLIER trail dots, and only when it is below the
 * rung now — never an invented earlier rung, and never one that would read as a fall.
 */
export function selectAlert(input: DemoInput): AlertData | null {
  const events = new Map(input.events.map((e) => [e.id, e]));
  for (const a of rankedForExample(input.beijingArticles)) {
    if (a.ladderRung == null || !a.ladderTarget) continue;
    const eventId = input.eventIdOf[a.id];
    const event = eventId ? events.get(eventId) : undefined;
    if (!event || event.ladderRung == null) continue;

    const row = input.trail.rows.find((r) => r.target === a.ladderTarget);
    const earlier = (row?.dots ?? []).filter((d) => d.day < day(a)).reduce((m, d) => Math.max(m, d.rung), 0);
    const label = input.names[a.ladderTarget] ?? a.ladderTarget;
    const jump: Jump = {
      item: { kind: 'country', id: a.ladderTarget, label },
      rung: event.ladderRung,
      previous: earlier > 0 && earlier < event.ladderRung ? earlier : 0,
      event,
    };
    const digest = renderDigest([jump], input.origin);
    return { label, subject: digest.subject, text: digest.text };
  }
  return null;
}

const brief = (a: Article): Report => ({ title: a.title, outlet: a.outlet });

/**
 * Chapter 4: an event with at least three usable reports that make at least two distinct stories.
 * The reprint is the beat the chapter exists for, so an event that has one wins wherever it sits in
 * the list; a multi-report event without one is kept as the second choice, and the scene simply
 * omits the fold.
 */
export function selectEvent(input: DemoInput): EventData | null {
  let second: EventData | null = null;
  for (const { event, articles } of input.eventCandidates) {
    const clean = articles.filter((a) => !isJunkHeadline(a.title));
    if (clean.length < 3) continue;
    const families = reprintFamilies(clean);
    if (families.length < 2) continue;

    const biggest = families.reduce((b, f) => (f.members.length > b.members.length ? f : b), families[0]);
    const lead = biggest.representative;
    const data: EventData = {
      title: event.title, confidence: event.confidence, signals: event.signals, flags: event.flags,
      reports: [lead, ...families.filter((f) => f !== biggest).map((f) => f.representative)].slice(0, 4).map(brief),
      reprints: biggest.members.filter((m) => m.id !== lead.id).slice(0, 3).map(brief),
    };
    if (data.reprints.length > 0) return data;
    second ??= data;
  }
  return second;
}

const byComposite = (input: DemoInput) => [...input.risks].sort((a, b) => b.composite - a.composite);

export function selectRisk(input: DemoInput): RiskData | null {
  const top = byComposite(input)[0];
  if (!top) return null;
  return {
    iso: top.iso, name: input.names[top.iso] ?? top.iso, score: top.composite,
    axes: VECTORS.map((v) => ({ label: v, value: top.vectors[v] ?? 0 })),
  };
}

/** Chapter 8: the first dyad with three defining events that actually land on the series' days. */
export function selectDyad(input: DemoInput): DyadData | null {
  for (const d of input.dyads) {
    const onSeries = new Set(d.series.map((s) => s.date));
    const markers = d.topEvents
      .map((e) => ({ date: e.lastSeen.slice(0, 10), label: e.title }))
      .filter((m) => onSeries.has(m.date));
    if (markers.length < 3) continue;
    return {
      aName: input.names[d.a] ?? d.a, bName: input.names[d.b] ?? d.b,
      score: d.score, series: d.series, markers,
    };
  }
  return null;
}

/**
 * Chapter 3: the Lens topic whose two languages differ most in how they frame it. Only a difference
 * lib/lens/compare already called out counts — it is ten points wide and passed the two-proportion test
 * — so the tour never shows a gap the Lens page itself would not state. With none, the chapter is left
 * out rather than illustrated with a gap that could be chance.
 */
export function selectLens(input: DemoInput): LensData | null {
  const gap = (t: BeatLens) => t.sharpest!.high.share - t.sharpest!.low.share;
  let best: BeatLens | null = null;
  for (const t of input.lens) {
    if (!t.sharpest) continue;
    if (!best || gap(t) > gap(best) || (gap(t) === gap(best) && t.sharpest.z > best.sharpest!.z)) best = t;
  }
  const s = best?.sharpest;
  if (!best || !s) return null;
  const high = best.columns.find((c) => c.language === s.high.language);
  const low = best.columns.find((c) => c.language === s.low.language);
  if (!high || !low) return null;
  return {
    topic: best.label, domain: s.domain, sentence: describeSharpest(s),
    high: lensSide(high, s.domain), low: lensSide(low, s.domain),
  };
}

function lensSide(c: LensColumn, domain: Domain): LensSide {
  const top = c.framing.slice(0, 3);
  // The framing that differs is the point of the chapter, so it is shown even when it ranks lower — or is
  // absent, which Lens counts as none of the readable reports.
  const framing = top.some((f) => f.key === domain)
    ? top
    : [...top.slice(0, 2), c.framing.find((f) => f.key === domain) ?? { key: domain, share: 0 }];
  const headline = c.latest.find((h) => !isJunkHeadline(h.title));
  return {
    language: c.language, articles: c.articles, classified: c.classified,
    asked: c.asked[0] ?? null,
    framing: framing.map((f) => ({ key: f.key, share: f.share })),
    // Chapter 2's rule: the word-by-word Chinese dictionary join is not animated as if it were a translation.
    // Stored key terms are clean, and so is the curated Japanese glossary; anything else gets no English line.
    headline: headline ? {
      title: headline.title,
      english: headline.titleEn ?? (c.language === 'ja' ? japaneseGloss(headline.title) : null),
      outlet: headline.outlet,
    } : null,
  };
}

/**
 * Chapter 9: arrive at a state by walking from the highest-risk one, so the graph draws the edge
 * just crossed (NetworkGraph lights the edge back to `trail[length - 2]`).
 *
 * The strongest neighbour of the origin need not have the origin among ITS strongest: egoView keeps
 * only the top ten by friction, so a hub with a dozen heavier edges hides the state we walked from,
 * and the graph would then draw no origin node and light no edge. Such a walk is skipped in favour of
 * the next-highest risk state, and if none of the candidates qualifies the chapter falls back.
 */
export function selectNetwork(input: DemoInput): NetworkData | null {
  const graph = stateGraph(input.events, input.now);
  for (const r of byComposite(input).slice(0, 10)) {
    const to = egoView(graph, r.iso).neighbours[0];
    if (!to) continue;
    const view = egoView(graph, to);
    if (!view.neighbours.includes(r.iso)) continue;
    const trail = [r.iso, to];
    return { from: r.iso, to, view, topEvents: graph.topEvents, trail, person: personStep(input, trail) };
  }
  return null;
}

/**
 * The walk's third step: from the state just reached into the person graph, to the official most often
 * named with it. The person graph has no state↔state edges, so every neighbour of a state there is a
 * person. The same hidden-origin rule as the state walk applies: an official whose own top ten hides
 * the state would be drawn with no edge to light, so the next one is tried. The step is optional —
 * with no qualifying official the chapter is the two-state walk it always was.
 */
function personStep(input: DemoInput, trail: string[]): PersonStep | null {
  const graph = personGraph(input.events, input.now);
  const state = trail[trail.length - 1];
  for (const id of egoView(graph, state).neighbours) {
    const person = BY_PERSON.get(id);
    if (!person) continue;
    const view = egoView(graph, id);
    if (!view.neighbours.includes(state)) continue;
    return {
      id, name: person.name, role: person.role, home: person.home,
      view, topEvents: graph.topEvents, trail: [...trail, id],
    };
  }
  return null;
}

/**
 * Chapter 10. The question is built from the data in the one form tests/ask.test.ts proves the parser
 * reads, and the pair came from the events themselves, so the answer cannot be empty.
 */
export function selectAsk(input: DemoInput): AskData | null {
  const d = input.dyads[0];
  if (!d) return null;
  const question = `what is happening between ${input.names[d.a] ?? d.a} and ${input.names[d.b] ?? d.b}?`;
  const answer = answerQuestion(question, input.events);
  if (answer.empty) return null;
  return { question, readAs: answer.readAs, headline: answer.headline, figures: answer.figures };
}
