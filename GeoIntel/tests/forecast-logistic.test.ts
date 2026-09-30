import { describe, it, expect } from 'vitest';
import { explain, fitModel, predict, sigmoid, solve, type Model } from '@/lib/forecast/logistic';
import type { Signals } from '@/lib/forecast/types';

const zero: Signals = { incidents7: 0, incidents28: 0, tension: 0, tensionChange7: 0, surge: 0,
  escWeight7: 0, beijing7: 0, beijing28: 0, beijingMaxRung28: 0 };
const row = (s: Partial<Signals>, outcome: 0 | 1, offset = 0) => ({ signals: { ...zero, ...s }, outcome, offset });

describe('the linear solver', () => {
  it('solves a small symmetric system', () => {
    const x = solve([[2, 1], [1, 3]], [3, 5]);
    expect(x[0]).toBeCloseTo(0.8, 12);
    expect(x[1]).toBeCloseTo(1.4, 12);
  });
});

describe('fitModel', () => {
  it('stays exactly at the usual rate until it has 10 positives per signal (90)', () => {
    const m = fitModel('beijing', [...Array.from({ length: 89 }, () => row({ beijing7: 1 }, 1)),
      ...Array.from({ length: 300 }, () => row({}, 0))]);
    expect(m.fitted).toBe(false);
    expect(predict(m, 0.3, { ...zero, beijing7: 1 })).toBe(0.3);
    expect(predict(m, 0.001, zero)).toBe(0.01);   // clipped
  });

  it('reaches the optimum of the penalised likelihood (intercept-only check)', () => {
    // Identical signals, offset 0, 120 of 200 yes: the optimum solves 120 − 200·σ(w) − w = 0.
    const m = fitModel('incident', [...Array.from({ length: 120 }, () => row({}, 1)),
      ...Array.from({ length: 80 }, () => row({}, 0))]);
    expect(m.fitted).toBe(true);
    expect(Math.abs(120 - 200 * sigmoid(m.intercept) - m.intercept)).toBeLessThan(1e-9);
  });

  it('learns that recent incidents raise the chance', () => {
    const rows = [
      ...Array.from({ length: 96 }, () => row({ incidents7: 1 }, 1)), ...Array.from({ length: 24 }, () => row({ incidents7: 1 }, 0)),
      ...Array.from({ length: 24 }, () => row({}, 1)), ...Array.from({ length: 96 }, () => row({}, 0)),
    ];
    const m = fitModel('incident', rows);
    expect(m.weights[0]).toBeGreaterThan(0);
    expect(predict(m, 0.5, { ...zero, incidents7: 1 })).toBeGreaterThan(0.6);
    expect(predict(m, 0.5, zero)).toBeLessThan(0.4);
  });

  it('shrinks every weight to nothing under a huge penalty', () => {
    const rows = [...Array.from({ length: 100 }, () => row({ incidents7: 1 }, 1)), ...Array.from({ length: 100 }, () => row({}, 0))];
    const m = fitModel('incident', rows, 1e9);
    expect(Math.max(...m.weights.map(Math.abs), Math.abs(m.intercept))).toBeLessThan(1e-6);
  });
});

describe('explain', () => {
  it('states the chance, the usual rate and each reason worth a point', () => {
    const m: Model = { kind: 'incident', fitted: true, positives: 10, n: 20, intercept: 0,
      means: new Array(9).fill(0), sds: new Array(9).fill(1), weights: [1, 0, 0, 0, 0, 0, 0, 0, 0] };
    const e = explain(m, 0.2, { ...zero, incidents7: 1 }, 'China–India');
    expect(e.probability).toBeCloseTo(0.404608, 5);
    expect(e.text).toBe('40%. The usual rate for China–India is 20%; 1 incident in the last week (+20).');
  });

  it('before the model can be fitted, reports notable signals as observations, not effects', () => {
    const m = fitModel('incident', []);
    const e = explain(m, 0.21, { ...zero, incidents7: 2, surge: 1.8, tensionChange7: -6, beijing7: 1 }, 'China–India');
    expect(e.probability).toBe(0.21);
    expect(e.reasons).toEqual([]);
    expect(e.text).toBe('21%. The usual rate for China–India is 21%. Too little history yet to weigh this week\'s '
      + 'signals, which are: 2 incidents in the last week; reporting 1.8× normal; tension easing (-6 in a week); '
      + '1 Beijing statement in the last week.');
    expect(explain(m, 0.1, { ...zero, surge: 1 }, 'Japan–Korea').text).toBe('10%. The usual rate for Japan–Korea is 10%.');
  });

  it('says how much history stands behind the usual rate, while it is short', () => {
    const m = fitModel('incident', []);
    expect(explain(m, 0.51, zero, 'India–Pakistan', { weeks: 1, pooled: 0.39 }).text)
      .toBe('51%. The usual rate for India–Pakistan is 51% (from 1 week of history, drawn toward the 39% average).');
    expect(explain(m, 0.3, zero, 'China–India', { weeks: 12, pooled: 0.39 }).text)
      .toBe('30%. The usual rate for China–India is 30% (from 12 weeks of history, drawn toward the 39% average).');
    expect(explain(m, 0.3, zero, 'China–India', { weeks: 52, pooled: 0.39 }).text)
      .toBe('30%. The usual rate for China–India is 30%.');
  });
});
