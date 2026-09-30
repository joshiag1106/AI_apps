import { sameAsLastWeek, usualRate } from '@/lib/forecast/baselines';
import { fitModel, logit, predict, type Model, type TrainingRow } from '@/lib/forecast/logistic';
import type { Scored } from '@/lib/forecast/score';
import { FORECASTERS, type HistoryRow, type QuestionKind } from '@/lib/forecast/types';

export const MIN_TRAIN_WEEKS = 4;
const KINDS: QuestionKind[] = ['incident', 'beijing'];

/** A kind's training rows. Each row's offset is its question's usual rate from the weeks BEFORE it only. */
export function trainingRows(history: HistoryRow[], kind: QuestionKind): TrainingRow[] {
  return history.filter((r) => r.kind === kind).map((r) => ({
    signals: r.signals,
    outcome: r.outcome,
    offset: logit(usualRate(history.filter((h) => h.week < r.week), r.questionId, kind)),
  }));
}

export function fitAll(history: HistoryRow[]): Map<QuestionKind, Model> {
  return new Map(KINDS.map((k) => [k, fitModel(k, trainingRows(history, k))]));
}

/** Forecast each week from the weeks before it only, once MIN_TRAIN_WEEKS earlier weeks exist. */
export function walkForward(history: HistoryRow[], minTrainWeeks = MIN_TRAIN_WEEKS): Scored[] {
  const weeks = [...new Set(history.map((r) => r.week))].sort();
  const out: Scored[] = [];
  weeks.forEach((week, i) => {
    if (i < minTrainWeeks) return;
    const train = history.filter((r) => r.week < week);
    const models = fitAll(train);
    for (const r of history.filter((h) => h.week === week)) {
      const usual = usualRate(train, r.questionId, r.kind);
      const ps: [string, number][] = [
        [FORECASTERS.usual, usual],
        [FORECASTERS.persistence, sameAsLastWeek(train, r.kind, r.signals)],
        [FORECASTERS.model, predict(models.get(r.kind)!, usual, r.signals)],
      ];
      for (const [forecaster, p] of ps) out.push({ forecaster, kind: r.kind, questionId: r.questionId, week, p, y: r.outcome });
    }
  });
  return out;
}
