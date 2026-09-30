import { readFileSync } from 'node:fs';
import path from 'node:path';
import { everyArticle, everyEvent, getMeta, setMeta } from '@/lib/db';
import { fitAll } from '@/lib/forecast/backtest';
import { MAX_WEEKS, pooledRate, sameAsLastWeek, usualRate } from '@/lib/forecast/baselines';
import { beijingQuestions, incidentQuestions } from '@/lib/forecast/geo/questions';
import { settle } from '@/lib/forecast/geo/settle';
import { liveCorpus, signalsFor } from '@/lib/forecast/geo/signals';
import { allForecasts, appendForecast, appendOutcome, canonical, currentOutcomes, forecastsForWeek, sha256,
  verifyLedger, type NewForecast, type StoredForecast } from '@/lib/forecast/ledger';
import { clip, explain, type Explanation, type Model } from '@/lib/forecast/logistic';
import { labelPending, reconstructStep, signalsOn, snapshotLive, trainingHistory } from '@/lib/forecast/store';
import { HOUR, WEEK, isoDay, mondayStart, weekId } from '@/lib/forecast/time';
import { FORECASTERS, type Corpus, type HistoryRow, type Question, type QuestionKind, type Signals } from '@/lib/forecast/types';

/** A week whose first chance to issue comes later than this after Monday 00:00 UTC is skipped. */
export const ISSUE_LATE_LIMIT_MS = 24 * HOUR;
/** Reconstruction is sliced so that no ingest approaches the cron route's 300-second limit. */
export const RECONSTRUCT_BUDGET_MS = 60_000;

/** The build that settled an outcome: the standalone server runs from its own folder, next to .next/BUILD_ID. */
export function engineVersion(): string {
  try {
    return readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim();
  } catch {
    return 'dev';
  }
}

/**
 * All three forecasters for one question and its signals. The weekly issue and the admin preview both use it,
 * so a preview can never differ from what Monday would record from the same inputs.
 */
export function forecastTrio(q: Question, s: Signals, history: HistoryRow[], models: Map<QuestionKind, Model>):
  { usual: number; persistence: number; model: number; explanation: Explanation } {
  const usual = usualRate(history, q.id, q.kind);
  const basis = { weeks: Math.min(MAX_WEEKS, history.filter((r) => r.questionId === q.id).length), pooled: pooledRate(history, q.kind) };
  const explanation = explain(models.get(q.kind)!, usual, s, q.label, basis);
  return { usual: clip(usual), persistence: clip(sameAsLastWeek(history, q.kind, s)), model: explanation.probability, explanation };
}

export interface PreviewRow { questionId: string; question: string; usual: number; persistence: number; model: number; why: string }
export interface Preview { asOf: string; rows: PreviewRow[] }

/**
 * What the forecasters would say for the next 7 days if asked at `now`. Never written to the record — the record
 * holds only forecasts issued at the start of their week. Same code path as the weekly issue (forecastTrio).
 */
export function previewFrom(live: Corpus, questions: Question[], now: number): Preview {
  const history = trainingHistory();
  const models = fitAll(history);
  const weekAgo = isoDay(now - WEEK);
  const rows = questions.map((q) => {
    const s = signalsFor(q, live, now, signalsOn(weekAgo, q.id)?.tension ?? null);
    const f = forecastTrio(q, s, history, models);
    return { questionId: q.id, question: q.text, usual: f.usual, persistence: f.persistence, model: f.model, why: f.explanation.text };
  });
  rows.sort((a, b) => b.model - a.model);
  return { asOf: new Date(now).toISOString(), rows };
}

/** Issue this week's forecasts from all three forecasters, if due. Idempotent. */
export function issueWeek(questions: Question[], now: number): { issued: number; skipped: string | null } {
  const week = weekId(now);
  const monday = mondayStart(now);
  if (now - monday > ISSUE_LATE_LIMIT_MS) {
    if (forecastsForWeek(week).length) return { issued: 0, skipped: null };
    const skipped = JSON.parse(getMeta('forecast_skipped_weeks') ?? '[]') as string[];
    if (skipped.includes(week)) return { issued: 0, skipped: null };
    setMeta('forecast_skipped_weeks', JSON.stringify([...skipped, week]));
    return { issued: 0, skipped: week };
  }
  const history = trainingHistory();
  const models = fitAll(history);
  const day = isoDay(now);
  const windowStart = new Date(now).toISOString();
  const windowEnd = new Date(monday + WEEK).toISOString();
  let issued = 0;
  for (const q of questions) {
    const s = signalsOn(day, q.id);
    if (!s) continue;
    const f = forecastTrio(q, s, history, models);
    const base = { questionId: q.id, week, question: q.text, rule: q.rule, windowStart, windowEnd,
      issuedAt: windowStart, inputsHash: sha256(canonical(s)) };
    const entries: NewForecast[] = [
      { ...base, forecaster: FORECASTERS.usual, probability: f.usual, explanation: null },
      { ...base, forecaster: FORECASTERS.persistence, probability: f.persistence, explanation: null },
      { ...base, forecaster: FORECASTERS.model, probability: f.model, explanation: f.explanation },
    ];
    for (const e of entries) if (appendForecast(e)) issued += 1;
  }
  return { issued, skipped: null };
}

/** Settle every question-week whose window ended at least its rule's grace period ago. */
export function settleDue(now: number, live: Corpus, version = engineVersion()): number {
  const outcomes = currentOutcomes();
  const first = new Map<string, StoredForecast>();
  for (const f of allForecasts()) {
    const key = `${f.questionId}|${f.week}`;
    if (!first.has(key)) first.set(key, f);
  }
  let settled = 0;
  for (const [key, f] of first) {
    const end = Date.parse(f.windowEnd);
    if (outcomes.has(key) || end + f.rule.graceHours * HOUR > now) continue;
    const s = settle(f.rule, { start: Date.parse(f.windowStart), end }, live);
    appendOutcome({ questionId: f.questionId, week: f.week, outcome: s.outcome, settledAt: new Date(now).toISOString(),
      evidence: s.evidence, engineVersion: version, corrects: null, reason: null });
    settled += 1;
  }
  return settled;
}

export interface CycleReport {
  week: string; snapshot: number; reconstructed: { done: boolean; wrote: number }; labelled: number;
  issued: number; skipped: string | null; settled: number; ledgerOk: boolean | null;
}

/** One pass of the forecast cycle; the ingest calls it after clustering. Every step is idempotent. */
export function runForecastCycle(now = Date.now(),
  opts: { budgetMs?: number; minPairEvents?: number } = {}): CycleReport {
  const live = liveCorpus(everyEvent(), everyArticle());
  const questions = [...incidentQuestions(live.events, opts.minPairEvents), ...beijingQuestions(live.articles, now)];
  const snapshot = snapshotLive(questions, live, now);
  const reconstructed = reconstructStep(now, opts.budgetMs ?? RECONSTRUCT_BUDGET_MS, live, { minPairEvents: opts.minPairEvents });
  const labelled = labelPending(now, live);
  const { issued, skipped } = issueWeek(questions, now);
  const settled = settleDue(now, live);
  // The admin preview is computed here, where the corpus is already loaded, so the admin page only reads it.
  setMeta('forecast_preview', JSON.stringify(previewFrom(live, questions, now)));
  let ledgerOk: boolean | null = null;
  const today = isoDay(now);
  if (getMeta('forecast_verified_day') !== today) {
    const check = verifyLedger();
    setMeta('forecast_verified_day', today);
    setMeta('forecast_ledger', JSON.stringify({ ...check, at: new Date(now).toISOString() }));
    ledgerOk = check.ok;
  }
  return { week: weekId(now), snapshot, reconstructed, labelled, issued, skipped, settled, ledgerOk };
}
