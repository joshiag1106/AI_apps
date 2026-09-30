import { BY_ISO } from '@/data/countries';
import type { Article, GeoEvent } from '@/lib/types';
import { beijingRule, incidentRule } from '@/lib/forecast/geo/settle';
import { DAY } from '@/lib/forecast/time';
import type { Question } from '@/lib/forecast/types';

/** A pair is asked about once the corpus holds at least this many events naming both. */
export const MIN_PAIR_EVENTS = 100;

const name = (iso: string) => BY_ISO.get(iso)?.name ?? iso;

export function incidentQuestion(a: string, b: string): Question {
  const rule = incidentRule(a, b);
  const [x, y] = rule.states;
  return {
    id: `incident:${x}-${y}`, kind: 'incident', rule, label: `${name(x)}–${name(y)}`,
    text: `Will a corroborated military incident between ${name(x)} and ${name(y)} begin in the next 7 days?`,
  };
}

export function beijingQuestion(target: string): Question {
  const any = target === 'any';
  return {
    id: `beijing:${target}`, kind: 'beijing', rule: beijingRule(target),
    label: any ? 'Beijing' : `Beijing toward ${name(target)}`,
    text: any
      ? 'Will Beijing make an official escalation-ladder statement in the next 7 days?'
      : `Will Beijing make an official escalation-ladder statement aimed at ${name(target)} in the next 7 days?`,
  };
}

/** Every pair of states named together in at least `minEvents` stored events, in id order. */
export function incidentQuestions(events: GeoEvent[], minEvents = MIN_PAIR_EVENTS): Question[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const actors = [...new Set(e.actors)].sort();
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const key = `${actors[i]}-${actors[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts].filter(([, n]) => n >= minEvents).map(([k]) => k).sort()
    .map((k) => { const [a, b] = k.split('-'); return incidentQuestion(a, b); });
}

/** Every state Beijing aimed a ladder statement at in the `lookbackDays` before `now`, then 'any'. */
export function beijingQuestions(articles: Article[], now: number, lookbackDays = 90): Question[] {
  const from = now - lookbackDays * DAY;
  const targets = new Set<string>();
  for (const a of articles) {
    const t = Date.parse(a.publishedAt);
    if (t >= from && t < now && a.ladderSpeaker === 'prc' && a.ladderRung !== null && a.ladderTarget) {
      targets.add(a.ladderTarget);
    }
  }
  return [...[...targets].sort().map(beijingQuestion), beijingQuestion('any')];
}

export function questionFromId(id: string): Question {
  if (id.startsWith('incident:')) {
    const [a, b] = id.slice('incident:'.length).split('-');
    return incidentQuestion(a, b);
  }
  if (id.startsWith('beijing:')) return beijingQuestion(id.slice('beijing:'.length));
  throw new Error(`unknown question id: ${id}`);
}
