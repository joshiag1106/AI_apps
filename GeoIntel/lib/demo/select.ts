import type { Article } from '@/lib/types';
import type { Jump } from '@/lib/alerts/detect';
import { renderDigest } from '@/lib/alerts/send';
import { reprintFamilies } from '@/lib/verify/reprints';
import { stateGraph } from '@/lib/graph/build';
import { egoView } from '@/lib/graph/ego';
import { answerQuestion } from '@/lib/ask/answer';
import { VECTORS } from '@/lib/risk';
import { isJunkHeadline, rankedForExample } from './junk';
import type {
  AlertData, AskData, DemoInput, DyadData, EventData, LadderData, LanguageData, NetworkData, Report, RiskData, TrailData,
} from './types';

const day = (a: Article) => a.publishedAt.slice(0, 10);

/**
 * The Beijing article chapters 2, 4 and 5 share, so one story is seen through three lenses. It must
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
 * Chapter 3: an event with at least three usable reports that make at least two distinct stories.
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

/** Chapter 7: the first dyad with three defining events that actually land on the series' days. */
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
 * Chapter 8: arrive at a state by walking from the highest-risk one, so the graph draws the edge
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
    return { from: r.iso, to, view, topEvents: graph.topEvents, trail: [r.iso, to] };
  }
  return null;
}

/**
 * Chapter 9. The question is built from the data in the one form tests/ask.test.ts proves the parser
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
