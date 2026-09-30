import type { HistoryRow, QuestionKind, Signals } from '@/lib/forecast/types';

/** Pseudo-weeks of the pooled rate added to every question, so one lucky week cannot swing a quiet pair. */
export const SHRINK_WEEKS = 4;
export const MAX_WEEKS = 52;
const FALLBACK_RATE = 0.1;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** A question kind's share of "yes" weeks across every question of that kind. */
export function pooledRate(rows: HistoryRow[], kind: QuestionKind): number {
  const own = rows.filter((r) => r.kind === kind);
  return own.length ? mean(own.map((r) => r.outcome)) : FALLBACK_RATE;
}

/** usual-rate@1: the question's share of "yes" weeks over its newest 52, shrunk toward its kind's pooled rate. */
export function usualRate(rows: HistoryRow[], questionId: string, kind: QuestionKind): number {
  const pooled = pooledRate(rows, kind);
  const own = rows.filter((r) => r.questionId === questionId)
    .sort((a, b) => b.week.localeCompare(a.week)).slice(0, MAX_WEEKS);
  const yes = own.reduce((s, r) => s + r.outcome, 0);
  return (yes + SHRINK_WEEKS * pooled) / (own.length + SHRINK_WEEKS);
}

/**
 * Whether "last week" said yes, read from the signals at the week's start. Last week's own outcome is not
 * settled until 72 hours after it ends, so a Monday forecast cannot wait for it.
 */
export function lastWeekYes(kind: QuestionKind, s: Signals): boolean {
  return kind === 'incident' ? s.incidents7 > 0 : s.beijing7 > 0;
}

/** same-as-last-week@1: P(yes | last week yes) or P(yes | last week quiet), pooled over the kind, add-one smoothed. */
export function sameAsLastWeek(rows: HistoryRow[], kind: QuestionKind, s: Signals): number {
  const want = lastWeekYes(kind, s);
  const match = rows.filter((r) => r.kind === kind && lastWeekYes(kind, r.signals) === want);
  return (match.reduce((sum, r) => sum + r.outcome, 0) + 1) / (match.length + 2);
}
