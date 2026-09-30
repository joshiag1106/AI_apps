import type { Article, GeoEvent } from '@/lib/types';
import type { BeijingRule, Corpus, Evidence, IncidentRule, Settlement, SettlementRule, Window } from '@/lib/forecast/types';

/**
 * What "it happened" means, fixed when a forecast is made and written into its record entry.
 * One definition serves both settlement and the incident signals (lib/forecast/geo/signals).
 */
export const INCIDENT_THRESHOLDS = { minEscalation: 10, minConfidence: 30, minOutlets: 2, graceHours: 72 } as const;
export const BEIJING_GRACE_HOURS = 72;

export function incidentRule(a: string, b: string): IncidentRule {
  const [x, y] = [a, b].sort();
  return { kind: 'incident', states: [x, y], domain: 'Military', ...INCIDENT_THRESHOLDS };
}

export function beijingRule(target: string): BeijingRule {
  return { kind: 'beijing', target, graceHours: BEIJING_GRACE_HOURS };
}

function outletsOf(e: GeoEvent, outlets: Map<string, string>): string[] {
  return [...new Set(e.articleIds.map((id) => outlets.get(id)).filter((o): o is string => !!o))];
}

/** Events meeting an incident rule and FIRST seen in [from, to). A second state of '*' means any other state. */
export function qualifyingIncidents(
  rule: IncidentRule, events: GeoEvent[], outlets: Map<string, string>, from: number, to: number,
): GeoEvent[] {
  const [a, b] = rule.states;
  return events.filter((e) => {
    const t = Date.parse(e.firstSeen);
    return t >= from && t < to
      && e.domain === rule.domain
      && e.actors.includes(a)
      && (b === '*' ? e.actors.some((x) => x !== a) : e.actors.includes(b))
      && e.escalation >= rule.minEscalation
      && e.confidence >= rule.minConfidence
      && outletsOf(e, outlets).length >= rule.minOutlets;
  });
}

/** Beijing's ladder statements aimed at `target` ('any': at anyone, or at no one named), published in [from, to). */
export function beijingStatements(target: string, articles: Article[], from: number, to: number): Article[] {
  return articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return t >= from && t < to && a.ladderSpeaker === 'prc' && a.ladderRung !== null
      && (target === 'any' || a.ladderTarget === target);
  });
}

/** Settle one question-week by its recorded rule, keeping the evidence. */
export function settle(rule: SettlementRule, w: Window, c: Corpus): Settlement {
  if (rule.kind === 'incident') {
    const byId = new Map(c.articles.map((a) => [a.id, a]));
    const hits = qualifyingIncidents(rule, c.events, c.outlets, w.start, w.end);
    const evidence: Evidence[] = hits.map((e) => ({
      id: e.id, title: e.title, outlets: outletsOf(e, c.outlets),
      urls: e.articleIds.map((id) => byId.get(id)?.url).filter((u): u is string => !!u),
      date: e.firstSeen,
    }));
    return { outcome: hits.length ? 1 : 0, evidence };
  }
  const hits = beijingStatements(rule.target, c.articles, w.start, w.end);
  return {
    outcome: hits.length ? 1 : 0,
    evidence: hits.map((a) => ({ id: a.id, title: a.title, outlets: [a.outlet], urls: [a.url], date: a.publishedAt })),
  };
}
