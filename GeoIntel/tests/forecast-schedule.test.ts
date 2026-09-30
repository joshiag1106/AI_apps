import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art, incident, T } from './fixtures/forecast';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-fsched-')), 'test.db');

const db = await import('@/lib/db');
const { runForecastCycle, engineVersion } = await import('@/lib/forecast/schedule');
const { forecastsForWeek, currentOutcomes } = await import('@/lib/forecast/ledger');

const inc = incident('CHN', 'IND', '2026-10-07T09:00:00.000Z');
db.upsertArticles([...Array.from({ length: 4 }, () => art({ publishedAt: '2026-09-20T00:00:00.000Z' })), ...inc.articles]);
db.replaceEvents([inc.event]);
const run = (iso: string) => runForecastCycle(T(iso), { budgetMs: -1, minPairEvents: 1 });

describe('the weekly cycle', () => {
  it('skips a week whose first chance comes more than 24 hours late, once', () => {
    const r = run('2026-09-30T12:00:00Z');
    expect(r.snapshot).toBeGreaterThan(0);
    expect(r).toMatchObject({ issued: 0, skipped: '2026-W40' });
    expect(run('2026-09-30T13:00:00Z')).toMatchObject({ issued: 0, skipped: null });
  });

  it('issues all three forecasters once on Monday, windowed from issue to next Monday', () => {
    const r = run('2026-10-05T00:30:00Z');
    const qs = forecastsForWeek('2026-W41');
    expect(r.issued).toBe(qs.length);
    expect(qs.length).toBeGreaterThan(0);
    expect(new Set(qs.map((f) => f.forecaster))).toEqual(new Set(['usual-rate@1', 'same-as-last-week@1', 'signal-model@1']));
    expect(qs[0]).toMatchObject({ windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z' });
    expect(qs.find((f) => f.forecaster === 'signal-model@1')!.explanation!.text).toMatch(/^\d+%\. The usual rate for /);
    expect(run('2026-10-05T01:30:00Z').issued).toBe(0);
  });

  it('skips the next week when Monday is missed by more than a day', () => {
    expect(run('2026-10-13T00:10:00Z')).toMatchObject({ issued: 0, skipped: '2026-W42' });
  });

  it('settles 72 hours after the window, with evidence, exactly once', () => {
    expect(run('2026-10-14T23:00:00Z').settled).toBe(0);
    const r = run('2026-10-15T00:30:00Z');
    expect(r.settled).toBeGreaterThan(0);
    expect(currentOutcomes().get('incident:CHN-IND|2026-W41')).toMatchObject({ outcome: 1, engineVersion: engineVersion() });
    expect(run('2026-10-15T01:30:00Z').settled).toBe(0);
  });

  it('verifies the record once a day', () => {
    expect(run('2026-10-16T00:30:00Z').ledgerOk).toBe(true);
    expect(run('2026-10-16T01:30:00Z').ledgerOk).toBeNull();
  });

  it('is called by the ingest, where a failure cannot fail the refresh', () => {
    const src = readFileSync('lib/ingest/pipeline.ts', 'utf8');
    expect(src).toMatch(/try \{\s*const \{ runForecastCycle \} = await import\('@\/lib\/forecast\/schedule'\);/);
    expect(src).toMatch(/forecasts skipped: /);
  });
});
