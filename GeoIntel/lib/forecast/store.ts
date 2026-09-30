import { getDb, getMeta, setMeta } from '@/lib/db';
import { MIN_PAIR_EVENTS, beijingQuestions, incidentQuestions, questionFromId } from '@/lib/forecast/geo/questions';
import { settle } from '@/lib/forecast/geo/settle';
import { corpusAsOf, signalsFor, tensionOf } from '@/lib/forecast/geo/signals';
import { allForecasts, currentOutcomes } from '@/lib/forecast/ledger';
import type { Scored } from '@/lib/forecast/score';
import { DAY, GRACE_MS, WEEK, isoDay, mondayStart, weekId } from '@/lib/forecast/time';
import { kindOf, type Corpus, type HistoryRow, type Question, type Signals } from '@/lib/forecast/types';

export function writeSignals(day: string, questionId: string, s: Signals, source: 'live' | 'reconstructed',
  now: number, outcome: 0 | 1 | null = null): boolean {
  const r = getDb().prepare(`INSERT OR IGNORE INTO forecast_signals (day, question_id, signals, source, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(day, questionId, JSON.stringify(s), source, outcome, new Date(now).toISOString());
  return Number(r.changes) > 0;
}

export function signalsOn(day: string, questionId: string): Signals | null {
  const r = getDb().prepare('SELECT signals FROM forecast_signals WHERE day = ? AND question_id = ?').get(day, questionId) as
    { signals: string } | undefined;
  return r ? JSON.parse(r.signals) : null;
}

/** Today's live row for every question that has none yet. Returns how many were written. */
export function snapshotLive(questions: Question[], c: Corpus, now: number): number {
  const day = isoDay(now);
  const weekAgo = isoDay(now - WEEK);
  let written = 0;
  for (const q of questions) {
    if (signalsOn(day, q.id)) continue;
    const s = signalsFor(q, c, now, signalsOn(weekAgo, q.id)?.tension ?? null);
    if (writeSignals(day, q.id, s, 'live', now)) written += 1;
  }
  return written;
}

const RECON_NEXT = 'forecast_reconstruct_next';
const RECON_UNTIL = 'forecast_reconstruct_until';
/** A reconstructed Monday needs this much reporting behind it for its 28-day signals to mean anything. */
export const RECON_WARMUP_DAYS = 28;

export interface ReconStatus { done: boolean; next: string | null; until: string | null }

export function reconstructionStatus(): ReconStatus {
  const next = getMeta(RECON_NEXT);
  const until = getMeta(RECON_UNTIL);
  const day = (v: string | null) => (v && v !== 'done' ? isoDay(Number(v)) : null);
  return { done: next === 'done', next: day(next), until: day(until) };
}

/**
 * The pair threshold for a past Monday: the live rule (MIN_PAIR_EVENTS in a 90-day corpus) as a rate, applied to
 * the days of reporting that existed then. Early Mondays otherwise ask about almost no pairs.
 */
export function pairThresholdFor(spanDays: number): number {
  return Math.round(MIN_PAIR_EVENTS * Math.min(90, spanDays) / 90);
}

function reconstructMonday(m: number, live: Corpus, now: number, minPairEvents?: number): number {
  const at = corpusAsOf(live.articles, m);
  const weekBefore = corpusAsOf(live.articles, m - WEEK);
  const earliest = at.articles.reduce((e, a) => Math.min(e, Date.parse(a.publishedAt)), m);
  const threshold = minPairEvents ?? pairThresholdFor((m - earliest) / DAY);
  const questions = [...incidentQuestions(at.events, threshold), ...beijingQuestions(at.articles, m)];
  const settled = m + WEEK + GRACE_MS <= now;
  let written = 0;
  for (const q of questions) {
    const s = signalsFor(q, at, m, tensionOf(q, weekBefore, m - WEEK));
    const outcome = settled ? settle(q.rule, { start: m, end: m + WEEK }, live).outcome : null;
    if (writeSignals(isoDay(m), q.id, s, 'reconstructed', now, outcome)) written += 1;
  }
  return written;
}

/**
 * Rebuild past Mondays, oldest first, until `budgetMs` of wall-clock time has passed. The range is fixed on the
 * first call: from the first Monday with RECON_WARMUP_DAYS of reporting behind it, to this week's Monday.
 */
export function reconstructStep(now: number, budgetMs: number, live: Corpus,
  opts: { minPairEvents?: number } = {}): { done: boolean; wrote: number } {
  if (getMeta(RECON_NEXT) === 'done') return { done: true, wrote: 0 };
  if (!live.articles.length || budgetMs < 0) return { done: false, wrote: 0 };
  if (!getMeta(RECON_UNTIL)) {
    const earliest = live.articles.reduce((m, a) => Math.min(m, Date.parse(a.publishedAt)), Infinity);
    let first = mondayStart(earliest + RECON_WARMUP_DAYS * DAY);
    if (first < earliest + RECON_WARMUP_DAYS * DAY) first += WEEK;
    setMeta(RECON_NEXT, String(first));
    setMeta(RECON_UNTIL, String(mondayStart(now)));
  }
  const started = Date.now();
  const until = Number(getMeta(RECON_UNTIL));
  let next = Number(getMeta(RECON_NEXT));
  let wrote = 0;
  while (next <= until && Date.now() - started <= budgetMs) {
    wrote += reconstructMonday(next, live, now, opts.minPairEvents);
    next += WEEK;
    setMeta(RECON_NEXT, String(next));
  }
  if (next > until) {
    setMeta(RECON_NEXT, 'done');
    return { done: true, wrote };
  }
  return { done: false, wrote };
}

/** Label reconstructed Monday rows whose week has now been settled. Returns how many were labelled. */
export function labelPending(now: number, live: Corpus): number {
  const rows = getDb().prepare(
    "SELECT day, question_id FROM forecast_signals WHERE source = 'reconstructed' AND outcome IS NULL",
  ).all() as { day: string; question_id: string }[];
  const update = getDb().prepare('UPDATE forecast_signals SET outcome = ? WHERE day = ? AND question_id = ?');
  let labelled = 0;
  for (const r of rows) {
    const m = Date.parse(`${r.day}T00:00:00.000Z`);
    if (m + WEEK + GRACE_MS > now) continue;
    update.run(settle(questionFromId(r.question_id).rule, { start: m, end: m + WEEK }, live).outcome, r.day, r.question_id);
    labelled += 1;
  }
  return labelled;
}

/** Every labelled past question-week: reconstructed (hindsight) and live (settled on the record). */
export function trainingHistory(): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const r of getDb().prepare(
    "SELECT day, question_id, signals, outcome FROM forecast_signals WHERE source = 'reconstructed' AND outcome IS NOT NULL",
  ).all() as { day: string; question_id: string; signals: string; outcome: number }[]) {
    rows.push({ questionId: r.question_id, kind: kindOf(r.question_id), week: weekId(Date.parse(`${r.day}T00:00:00.000Z`)),
      signals: JSON.parse(r.signals), outcome: r.outcome as 0 | 1 });
  }
  const outcomes = currentOutcomes();
  const seen = new Set<string>();
  for (const f of allForecasts()) {
    const key = `${f.questionId}|${f.week}`;
    const o = outcomes.get(key);
    const s = signalsOn(isoDay(Date.parse(f.windowStart)), f.questionId);
    if (seen.has(key) || !o || !s) continue;
    seen.add(key);
    rows.push({ questionId: f.questionId, kind: kindOf(f.questionId), week: f.week, signals: s, outcome: o.outcome });
  }
  return rows;
}

/** Every live forecast that has an outcome, for scoring and the go-live rule. */
export function liveScored(): Scored[] {
  const outcomes = currentOutcomes();
  return allForecasts().flatMap((f) => {
    const o = outcomes.get(`${f.questionId}|${f.week}`);
    return o ? [{ forecaster: f.forecaster, kind: kindOf(f.questionId), questionId: f.questionId, week: f.week,
      p: f.probability, y: o.outcome }] : [];
  });
}

/** The record's state for the demo tour: question-weeks forecast and settled, chain check, first recorded week. */
export function recordStatus(now: number): { recorded: number; settled: number; intact: boolean | null; firstWeekStart: string } {
  const forecasts = allForecasts();
  const first = forecasts.reduce((m, f) => Math.min(m, Date.parse(f.windowStart)), Infinity);
  const check = getMeta('forecast_ledger');
  return {
    recorded: new Set(forecasts.map((f) => `${f.questionId}|${f.week}`)).size,
    settled: currentOutcomes().size,
    intact: check ? (JSON.parse(check) as { ok: boolean }).ok : null,
    firstWeekStart: new Date(Number.isFinite(first) ? mondayStart(first) : mondayStart(now) + WEEK).toISOString(),
  };
}
