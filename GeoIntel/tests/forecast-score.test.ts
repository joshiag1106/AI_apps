import { describe, it, expect } from 'vitest';
import { brier, calibration, goLiveStatus, skill, type Scored } from '@/lib/forecast/score';
import { walkForward } from '@/lib/forecast/backtest';
import { FORECASTERS, type HistoryRow, type Signals } from '@/lib/forecast/types';

describe('scores', () => {
  it('computes the Brier score and skill', () => {
    expect(brier([{ p: 0.2, y: 0 }, { p: 0.7, y: 1 }])).toBeCloseTo(0.065, 12);
    expect(brier([])).toBeNull();
    expect(skill(0.065, 0.1)).toBeCloseTo(0.35, 12);
  });

  it('bins forecasts into the five calibration bands', () => {
    const bands = calibration([{ p: 0.05, y: 0 }, { p: 0.1, y: 1 }, { p: 0.15, y: 0 }, { p: 1, y: 1 }]);
    expect(bands.map((b) => b.n)).toEqual([1, 2, 0, 0, 1]);
    expect(bands[1]).toMatchObject({ lo: 0.1, hi: 0.2, observed: 0.5 });
    expect(bands[1].meanP).toBeCloseTo(0.125, 12);
  });
});

describe('the go-live rule', () => {
  const week = (i: number) => `2026-W${String(41 + i).padStart(2, '0')}`;
  const record = (weeks: number, perWeek: number, model: (y: 0 | 1) => number): Scored[] =>
    Array.from({ length: weeks }).flatMap((_, w) => Array.from({ length: perWeek }).flatMap((__, q) => {
      const y: 0 | 1 = q % 5 === 0 ? 1 : 0;
      const base = { kind: 'incident' as const, questionId: `incident:Q${q}`, week: week(w), y };
      return [
        { ...base, forecaster: FORECASTERS.model, p: model(y) },
        { ...base, forecaster: FORECASTERS.usual, p: 0.2 },
        { ...base, forecaster: FORECASTERS.persistence, p: 0.3 },
      ];
    }));

  it('goes live after 6 weeks and 150 forecasts that beat both baselines and are calibrated', () => {
    const g = goLiveStatus(record(6, 30, (y) => (y ? 0.9 : 0.1)), 'incident');
    expect(g).toMatchObject({ live: true, weeks: 6, n: 180, needs: [] });
  });

  it('says what is still needed', () => {
    const g = goLiveStatus(record(5, 20, () => 0.5), 'incident');
    expect(g.live).toBe(false);
    expect(g.needs).toEqual(expect.arrayContaining(['1 more settled week', '50 more settled forecasts',
      'a lower Brier score than both baselines']));
  });

  it('refuses a miscalibrated band', () => {
    const g = goLiveStatus(record(6, 30, (y) => (y ? 0.9 : 0.4)), 'incident');
    expect(g.needs.some((n) => n.startsWith('calibration within ±15 points'))).toBe(true);
  });
});

describe('the walk-forward backtest', () => {
  const quiet: Signals = { incidents7: 0, incidents28: 0, tension: 0, tensionChange7: 0, surge: 1,
    escWeight7: 0, beijing7: 0, beijing28: 0, beijingMaxRung28: 0 };
  const history: HistoryRow[] = Array.from({ length: 6 }).flatMap((_, w) => Array.from({ length: 5 }, (__, q) => ({
    questionId: `incident:Q${q}`, kind: 'incident' as const, week: `2026-W${30 + w}`,
    signals: { ...quiet, incidents7: q % 2 }, outcome: (q + w) % 3 === 0 ? 1 as const : 0 as const,
  })));

  it('forecasts only weeks with 4 earlier weeks, with all three forecasters', () => {
    const scored = walkForward(history);
    expect([...new Set(scored.map((s) => s.week))]).toEqual(['2026-W34', '2026-W35']);
    expect(scored).toHaveLength(2 * 5 * 3);
  });

  it("never lets a week's own outcomes change its forecasts", () => {
    const flipped = history.map((r) => (r.week === '2026-W35' ? { ...r, outcome: (1 - r.outcome) as 0 | 1 } : r));
    const p = (xs: Scored[]) => xs.filter((s) => s.week === '2026-W35').map((s) => s.p);
    expect(p(walkForward(flipped))).toEqual(p(walkForward(history)));
  });
});
