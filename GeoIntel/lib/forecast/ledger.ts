import { createHash } from 'node:crypto';
import { getDb, tx } from '@/lib/db';
import type { Explanation } from '@/lib/forecast/logistic';
import type { Evidence, SettlementRule } from '@/lib/forecast/types';

/**
 * The forecast record. Append-only by trigger (lib/db); each entry's hash covers its stored columns and the
 * previous entry's hash, so any change to an old entry breaks every hash after it. Corrections are new
 * outcome entries that point at the one they correct.
 */
export const GENESIS = '0'.repeat(64);

/** JSON with object keys sorted at every depth, so an entry always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const entryHash = (fields: Record<string, unknown>, prev: string) => sha256(`${canonical(fields)}|${prev}`);

export interface NewForecast {
  forecaster: string; questionId: string; week: string; question: string; rule: SettlementRule;
  windowStart: string; windowEnd: string; issuedAt: string; probability: number;
  explanation: Explanation | null; inputsHash: string;
}
export interface StoredForecast extends NewForecast { seq: number; prevHash: string; hash: string }

export interface NewOutcome {
  questionId: string; week: string; outcome: 0 | 1; settledAt: string; evidence: Evidence[];
  engineVersion: string; corrects: number | null; reason: string | null;
}
export interface StoredOutcome extends NewOutcome { seq: number; prevHash: string; hash: string }

type Row = Record<string, string | number | null>;

// Exactly the stored columns (JSON columns as their stored text), so verification recomputes from disk.
const forecastFields = (r: Row) => ({
  forecaster: r.forecaster, question_id: r.question_id, week: r.week, question: r.question, rule: r.rule,
  window_start: r.window_start, window_end: r.window_end, issued_at: r.issued_at, probability: r.probability,
  explanation: r.explanation, inputs_hash: r.inputs_hash,
});
const outcomeFields = (r: Row) => ({
  question_id: r.question_id, week: r.week, outcome: r.outcome, settled_at: r.settled_at, evidence: r.evidence,
  engine_version: r.engine_version, corrects: r.corrects, reason: r.reason,
});

function head(table: 'forecasts' | 'outcomes'): string {
  const r = getDb().prepare(`SELECT hash FROM ${table} ORDER BY seq DESC LIMIT 1`).get() as { hash: string } | undefined;
  return r?.hash ?? GENESIS;
}

/** Record one forecast. False, and nothing written, if this forecaster already has one for the question-week. */
export function appendForecast(f: NewForecast): boolean {
  const db = getDb();
  return tx(db, () => {
    if (db.prepare('SELECT 1 FROM forecasts WHERE forecaster = ? AND question_id = ? AND week = ?')
      .get(f.forecaster, f.questionId, f.week)) return false;
    const row = {
      forecaster: f.forecaster, question_id: f.questionId, week: f.week, question: f.question,
      rule: canonical(f.rule), window_start: f.windowStart, window_end: f.windowEnd, issued_at: f.issuedAt,
      probability: f.probability, explanation: canonical(f.explanation), inputs_hash: f.inputsHash,
    };
    const prev = head('forecasts');
    db.prepare(`INSERT INTO forecasts (forecaster, question_id, week, question, rule, window_start, window_end,
      issued_at, probability, explanation, inputs_hash, prev_hash, hash) VALUES (@forecaster, @question_id, @week,
      @question, @rule, @window_start, @window_end, @issued_at, @probability, @explanation, @inputs_hash,
      @prev_hash, @hash)`).run({ ...row, prev_hash: prev, hash: entryHash(row, prev) });
    return true;
  });
}

/** Record one settlement (or a correction). Returns its seq. */
export function appendOutcome(o: NewOutcome): number {
  const db = getDb();
  return tx(db, () => {
    const row = {
      question_id: o.questionId, week: o.week, outcome: o.outcome, settled_at: o.settledAt,
      evidence: canonical(o.evidence), engine_version: o.engineVersion, corrects: o.corrects, reason: o.reason,
    };
    const prev = head('outcomes');
    const r = db.prepare(`INSERT INTO outcomes (question_id, week, outcome, settled_at, evidence, engine_version,
      corrects, reason, prev_hash, hash) VALUES (@question_id, @week, @outcome, @settled_at, @evidence,
      @engine_version, @corrects, @reason, @prev_hash, @hash)`).run({ ...row, prev_hash: prev, hash: entryHash(row, prev) });
    return Number(r.lastInsertRowid);
  });
}

const toForecast = (r: Row): StoredForecast => ({
  seq: Number(r.seq), forecaster: String(r.forecaster), questionId: String(r.question_id), week: String(r.week),
  question: String(r.question), rule: JSON.parse(String(r.rule)), windowStart: String(r.window_start),
  windowEnd: String(r.window_end), issuedAt: String(r.issued_at), probability: Number(r.probability),
  explanation: JSON.parse(String(r.explanation)), inputsHash: String(r.inputs_hash),
  prevHash: String(r.prev_hash), hash: String(r.hash),
});
const toOutcome = (r: Row): StoredOutcome => ({
  seq: Number(r.seq), questionId: String(r.question_id), week: String(r.week), outcome: Number(r.outcome) as 0 | 1,
  settledAt: String(r.settled_at), evidence: JSON.parse(String(r.evidence)), engineVersion: String(r.engine_version),
  corrects: r.corrects === null ? null : Number(r.corrects), reason: r.reason === null ? null : String(r.reason),
  prevHash: String(r.prev_hash), hash: String(r.hash),
});

export function allForecasts(): StoredForecast[] {
  return (getDb().prepare('SELECT * FROM forecasts ORDER BY seq').all() as Row[]).map(toForecast);
}

export function forecastsForWeek(week: string): StoredForecast[] {
  return (getDb().prepare('SELECT * FROM forecasts WHERE week = ? ORDER BY seq').all(week) as Row[]).map(toForecast);
}

/** The outcome in force for each question-week: the newest entry, so a correction wins. */
export function currentOutcomes(): Map<string, StoredOutcome> {
  const out = new Map<string, StoredOutcome>();
  for (const r of getDb().prepare('SELECT * FROM outcomes ORDER BY seq').all() as Row[]) {
    const o = toOutcome(r);
    out.set(`${o.questionId}|${o.week}`, o);
  }
  return out;
}

export interface LedgerCheck {
  ok: boolean; forecasts: number; outcomes: number;
  brokenAt: { table: 'forecasts' | 'outcomes'; seq: number } | null;
}

/** Recompute both chains from what is on disk. */
export function verifyLedger(): LedgerCheck {
  const count = { forecasts: 0, outcomes: 0 };
  for (const [table, fields] of [['forecasts', forecastFields], ['outcomes', outcomeFields]] as const) {
    let prev = GENESIS;
    for (const r of getDb().prepare(`SELECT * FROM ${table} ORDER BY seq`).all() as Row[]) {
      count[table] += 1;
      if (r.prev_hash !== prev || r.hash !== entryHash(fields(r), prev)) {
        return { ok: false, ...count, brokenAt: { table, seq: Number(r.seq) } };
      }
      prev = String(r.hash);
    }
  }
  return { ok: true, ...count, brokenAt: null };
}

export interface ChainHeads { forecasts: { seq: number; hash: string } | null; outcomes: { seq: number; hash: string } | null }

export function chainHeads(): ChainHeads {
  const one = (table: string) => {
    const r = getDb().prepare(`SELECT seq, hash FROM ${table} ORDER BY seq DESC LIMIT 1`).get() as
      { seq: number; hash: string } | undefined;
    return r ? { seq: Number(r.seq), hash: r.hash } : null;
  };
  return { forecasts: one('forecasts'), outcomes: one('outcomes') };
}
