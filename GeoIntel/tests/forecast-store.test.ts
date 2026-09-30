import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art, corpusOf, incident, T } from './fixtures/forecast';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-fstore-')), 'test.db');

const { getDb } = await import('@/lib/db');
const S = await import('@/lib/forecast/store');
const { incidentQuestion } = await import('@/lib/forecast/geo/questions');
const { appendForecast, appendOutcome } = await import('@/lib/forecast/ledger');

// Ten weeks of China–India reporting from Monday 6 July, two reports a day, every title unique.
let k = 0;
const tag = () => `zq${(k++).toString(36)}x zp${k.toString(36)}w`;
const reports = Array.from({ length: 70 }).flatMap((_, d) => [0, 1].map((h) => art({
  title: `${tag()} border patrol`, outlet: `Outlet ${h}`,
  publishedAt: new Date(T('2026-07-06T06:00:00Z') + d * 86_400_000 + h * 3_600_000).toISOString(),
})));
// The hindsight label: one qualifying incident in the week of Monday 10 August.
const aug = incident('CHN', 'IND', '2026-08-12T06:00:00.000Z');
const live = corpusOf([aug.event], [...reports, ...aug.articles]);
const now = T('2026-09-30T12:00:00Z');

describe('reconstruction', () => {
  it('does nothing without budget, then rebuilds every Monday from four weeks after the first report', () => {
    expect(S.reconstructStep(now, -1, live, { minPairEvents: 5 })).toEqual({ done: false, wrote: 0 });
    const r = S.reconstructStep(now, 600_000, live, { minPairEvents: 5 });
    expect(r.done).toBe(true);
    const days = (getDb().prepare("SELECT DISTINCT day FROM forecast_signals WHERE source = 'reconstructed' ORDER BY day")
      .all() as { day: string }[]).map((d) => d.day);
    // The first report is 6 July 06:00, so Monday 3 August 00:00 has 27¾ days behind it: 10 August is first.
    expect(days).toEqual(['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(S.reconstructStep(now, 600_000, live)).toEqual({ done: true, wrote: 0 });
  });

  it('labels settled weeks with hindsight and leaves the rest for later', () => {
    const label = (day: string) => (getDb().prepare(
      "SELECT outcome FROM forecast_signals WHERE day = ? AND question_id = 'incident:CHN-IND'").get(day) as { outcome: number | null }).outcome;
    expect(label('2026-08-10')).toBe(1);
    expect(label('2026-08-17')).toBe(0);
    expect(label('2026-09-21')).toBeNull();
    expect(S.labelPending(T('2026-10-10T00:00:00Z'), live)).toBeGreaterThan(0);
    expect(label('2026-09-21')).toBe(0);
  });
});

describe('live snapshots and the training history', () => {
  const q = incidentQuestion('CHN', 'IND');

  it('writes one live row per question per day', () => {
    const monday = T('2026-10-05T00:30:00Z');
    expect(S.snapshotLive([q], live, monday)).toBe(1);
    expect(S.snapshotLive([q], live, monday + 3_600_000)).toBe(0);
    expect(S.signalsOn('2026-10-05', q.id)).not.toBeNull();
  });

  it('trains on labelled reconstructed weeks plus settled live weeks', () => {
    const before = S.trainingHistory().length;
    appendForecast({ forecaster: 'usual-rate@1', questionId: q.id, week: '2026-W41', question: q.text, rule: q.rule,
      windowStart: '2026-10-05T00:30:00.000Z', windowEnd: '2026-10-12T00:00:00.000Z',
      issuedAt: '2026-10-05T00:30:00.000Z', probability: 0.2, explanation: null, inputsHash: 'x' });
    expect(S.trainingHistory()).toHaveLength(before);   // not settled yet
    appendOutcome({ questionId: q.id, week: '2026-W41', outcome: 1, settledAt: '2026-10-15T00:30:00.000Z',
      evidence: [], engineVersion: 'dev', corrects: null, reason: null });
    const history = S.trainingHistory();
    expect(history).toHaveLength(before + 1);
    expect(history.at(-1)).toMatchObject({ questionId: q.id, week: '2026-W41', outcome: 1 });
    expect(S.liveScored()).toEqual([{ forecaster: 'usual-rate@1', kind: 'incident', questionId: q.id,
      week: '2026-W41', p: 0.2, y: 1 }]);
  });
});

describe('the pair threshold when rebuilding the past', () => {
  // The live rule is 100 events in a 90-day corpus. A past Monday with less reporting behind it holds the same
  // RATE — otherwise early Mondays ask about almost no pairs (42 question-weeks instead of ~300 locally).
  it('scales 100 events per 90 days to the reporting that existed at the time', () => {
    expect(S.pairThresholdFor(45)).toBe(50);
    expect(S.pairThresholdFor(28)).toBe(31);
    expect(S.pairThresholdFor(90)).toBe(100);
    expect(S.pairThresholdFor(120)).toBe(100);
  });
});
