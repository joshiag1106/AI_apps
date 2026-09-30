import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NewForecast, NewOutcome } from '@/lib/forecast/ledger';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-ledger-')), 'test.db');

const { getDb } = await import('@/lib/db');
const L = await import('@/lib/forecast/ledger');

const forecast = (p: Partial<NewForecast> = {}): NewForecast => ({
  forecaster: 'usual-rate@1', questionId: 'incident:CHN-IND', week: '2026-W41',
  question: 'Will a corroborated military incident between China and India begin in the next 7 days?',
  rule: { kind: 'incident', states: ['CHN', 'IND'], domain: 'Military', minEscalation: 10, minConfidence: 30,
    minOutlets: 2, graceHours: 72 },
  windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z',
  issuedAt: '2026-10-05T00:30:00.000Z', probability: 0.21, explanation: null, inputsHash: 'abc', ...p,
});
const outcome = (p: Partial<NewOutcome> = {}): NewOutcome => ({
  questionId: 'incident:CHN-IND', week: '2026-W41', outcome: 1, settledAt: '2026-10-15T00:30:00.000Z',
  evidence: [], engineVersion: 'dev', corrects: null, reason: null, ...p,
});

describe('the record', () => {
  it('hashes canonically, whatever the key order', () => {
    expect(L.canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it('chains each forecast to the one before and refuses a duplicate', () => {
    expect(L.appendForecast(forecast())).toBe(true);
    expect(L.appendForecast(forecast())).toBe(false);
    expect(L.appendForecast(forecast({ forecaster: 'signal-model@1', probability: 0.31 }))).toBe(true);
    const [a, b] = L.allForecasts();
    expect(a.prevHash).toBe(L.GENESIS);
    expect(b.prevHash).toBe(a.hash);
    expect(a.rule).toEqual(forecast().rule);
    expect(L.forecastsForWeek('2026-W41')).toHaveLength(2);
  });

  it('refuses every edit and deletion', () => {
    L.appendOutcome(outcome());
    for (const sql of ['UPDATE forecasts SET probability = 0.99', 'DELETE FROM forecasts',
      'UPDATE outcomes SET outcome = 0', 'DELETE FROM outcomes']) {
      expect(() => getDb().exec(sql)).toThrow(/append-only/);
    }
  });

  it('lets a correction replace an outcome without erasing it', () => {
    const first = [...L.currentOutcomes().values()][0];
    L.appendOutcome(outcome({ outcome: 0, corrects: first.seq, reason: 'duplicate event' }));
    const now = L.currentOutcomes().get('incident:CHN-IND|2026-W41')!;
    expect(now).toMatchObject({ outcome: 0, corrects: first.seq, reason: 'duplicate event' });
    expect(L.chainHeads().outcomes?.seq).toBe(now.seq);
  });

  it('verifies an intact chain, and finds an edit made behind the triggers', () => {
    expect(L.verifyLedger()).toMatchObject({ ok: true, brokenAt: null, forecasts: 2, outcomes: 2 });
    const db = getDb();
    db.exec('DROP TRIGGER forecasts_append_only_u');
    db.exec('UPDATE forecasts SET probability = 0.99 WHERE seq = 2');
    expect(L.verifyLedger()).toMatchObject({ ok: false, brokenAt: { table: 'forecasts', seq: 2 } });
  });
});
