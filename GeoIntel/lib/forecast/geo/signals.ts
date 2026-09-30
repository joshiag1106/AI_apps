import type { Article, GeoEvent } from '@/lib/types';
import { clusterArticles } from '@/lib/verify/cluster';
import { countryRisk, dyadTension, TREND_SERIES_DAYS } from '@/lib/risk';
import { beijingStatements, incidentRule, qualifyingIncidents } from '@/lib/forecast/geo/settle';
import { DAY, WEEK } from '@/lib/forecast/time';
import type { Corpus, IncidentRule, Question, Signals } from '@/lib/forecast/types';

export function liveCorpus(events: GeoEvent[], articles: Article[]): Corpus {
  return { events, articles, outlets: new Map(articles.map((a) => [a.id, a.outlet])) };
}

/**
 * The corpus as it stood at `asOf`: only reports published before it and within retention, clustered afresh.
 * This is what keeps a reconstructed snapshot from seeing its own future.
 */
export function corpusAsOf(articles: Article[], asOf: number, retentionDays = TREND_SERIES_DAYS): Corpus {
  const from = asOf - retentionDays * DAY;
  const kept = articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return t < asOf && t >= from;
  });
  return liveCorpus(clusterArticles(kept), kept);
}

/** Whose signals a question reads: a pair, or 'China with anyone' ('*'); and whom Beijing's statements target. */
interface Scope { a: string; b: string; target: string | null }

function scopeOf(q: Question): Scope {
  if (q.rule.kind === 'incident') {
    const [a, b] = q.rule.states;
    return { a, b, target: a === 'CHN' ? b : b === 'CHN' ? a : null };
  }
  return q.rule.target === 'any'
    ? { a: 'CHN', b: '*', target: 'any' }
    : { a: 'CHN', b: q.rule.target, target: q.rule.target };
}

function scopeRule(s: Scope): IncidentRule {
  return s.b === '*' ? { ...incidentRule(s.a, s.a), states: [s.a, '*'] } : incidentRule(s.a, s.b);
}

/** A question's tension at `asOf`: its pair's dyad tension, or China's composite for 'China with anyone'. */
export function tensionOf(q: Question, c: Corpus, asOf: number): number {
  const s = scopeOf(q);
  return s.b === '*' ? countryRisk(s.a, c.events, asOf).composite : dyadTension(s.a, s.b, c.events, asOf).score;
}

/**
 * One question's signals as of `asOf`. Nothing published after `asOf` is read: events first seen later and
 * articles published later are dropped here too, as a second guard behind corpusAsOf.
 * `tension7dAgo` is the tension in the snapshot a week earlier, or null when there is none.
 */
export function signalsFor(q: Question, c: Corpus, asOf: number, tension7dAgo: number | null): Signals {
  const s = scopeOf(q);
  const rule = scopeRule(s);
  const inScope = (actors: string[]) =>
    actors.includes(s.a) && (s.b === '*' ? actors.some((x) => x !== s.a) : actors.includes(s.b));
  const known = c.events.filter((e) => Date.parse(e.firstSeen) < asOf);
  const events = known.filter((e) => inScope(e.actors));
  const articles = c.articles.filter((a) => Date.parse(a.publishedAt) < asOf);
  const reports = (from: number, to: number) => articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return t >= from && t < to && inScope(a.actors);
  }).length;
  const tension = tensionOf(q, { ...c, events: known }, asOf);
  const said28 = s.target ? beijingStatements(s.target, articles, asOf - 4 * WEEK, asOf) : [];

  return {
    incidents7: qualifyingIncidents(rule, events, c.outlets, asOf - WEEK, asOf).length,
    incidents28: qualifyingIncidents(rule, events, c.outlets, asOf - 4 * WEEK, asOf).length,
    tension,
    tensionChange7: tension7dAgo === null ? 0 : tension - tension7dAgo,
    surge: (reports(asOf - WEEK, asOf) + 1) / (reports(asOf - 5 * WEEK, asOf - WEEK) / 4 + 1),
    escWeight7: events
      .filter((e) => { const t = Date.parse(e.lastSeen); return t >= asOf - WEEK && t < asOf; })
      .reduce((sum, e) => sum + Math.max(0, e.escalation) * (e.confidence / 100), 0),
    beijing7: said28.filter((a) => Date.parse(a.publishedAt) >= asOf - WEEK).length,
    beijing28: said28.length,
    beijingMaxRung28: said28.reduce((m, a) => Math.max(m, a.ladderRung ?? 0), 0),
  };
}
