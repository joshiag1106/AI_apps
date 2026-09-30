import type { Article, GeoEvent } from '@/lib/types';

/**
 * Predictive intelligence — see docs/specs/2026-09-30-predictive-intelligence-design.md.
 * Everything under lib/forecast/ except lib/forecast/geo/ is subject-neutral.
 */
export type QuestionKind = 'incident' | 'beijing';

export interface IncidentRule {
  kind: 'incident';
  /** Sorted ISO3 pair. The signal scope 'China with anyone' uses ['CHN', '*']. */
  states: [string, string];
  domain: 'Military';
  minEscalation: number;
  minConfidence: number;
  minOutlets: number;
  graceHours: number;
}

export interface BeijingRule {
  kind: 'beijing';
  /** ISO3 of the state a statement is aimed at, or 'any'. */
  target: string;
  graceHours: number;
}

export type SettlementRule = IncidentRule | BeijingRule;

export interface Question {
  id: string;
  kind: QuestionKind;
  /** The question in words, as recorded. */
  text: string;
  /** Short subject for explanations: 'China–India', 'Beijing toward Japan', 'Beijing'. */
  label: string;
  rule: SettlementRule;
}

/** A forecast window, epoch ms: start inclusive, end exclusive. */
export interface Window { start: number; end: number }

export interface Signals {
  incidents7: number;
  incidents28: number;
  tension: number;
  tensionChange7: number;
  surge: number;
  escWeight7: number;
  beijing7: number;
  beijing28: number;
  beijingMaxRung28: number;
}

export const SIGNAL_NAMES = [
  'incidents7', 'incidents28', 'tension', 'tensionChange7', 'surge',
  'escWeight7', 'beijing7', 'beijing28', 'beijingMaxRung28',
] as const satisfies readonly (keyof Signals)[];

export interface Evidence { id: string; title: string; outlets: string[]; urls: string[]; date: string }

export interface Settlement { outcome: 0 | 1; evidence: Evidence[] }

/** One past question-week: the signals at its start and what happened. */
export interface HistoryRow {
  questionId: string;
  kind: QuestionKind;
  week: string;
  signals: Signals;
  outcome: 0 | 1;
}

/** Everything the rules read, as of one moment. */
export interface Corpus {
  events: GeoEvent[];
  articles: Article[];
  /** Article id -> outlet name. */
  outlets: Map<string, string>;
}

export const FORECASTERS = {
  usual: 'usual-rate@1',
  persistence: 'same-as-last-week@1',
  model: 'signal-model@1',
} as const;

export function kindOf(questionId: string): QuestionKind {
  return questionId.startsWith('beijing:') ? 'beijing' : 'incident';
}
