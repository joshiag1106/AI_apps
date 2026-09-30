import { describe, it, expect } from 'vitest';
import { sameAsLastWeek, usualRate } from '@/lib/forecast/baselines';
import type { HistoryRow, Signals } from '@/lib/forecast/types';

const quiet: Signals = { incidents7: 0, incidents28: 0, tension: 0, tensionChange7: 0, surge: 1,
  escWeight7: 0, beijing7: 0, beijing28: 0, beijingMaxRung28: 0 };
const row = (questionId: string, week: number, outcome: 0 | 1, s: Partial<Signals> = {}): HistoryRow => ({
  questionId, kind: 'incident', week: `2026-W${String(week).padStart(2, '0')}`, outcome, signals: { ...quiet, ...s },
});

describe('usual-rate@1', () => {
  it("shrinks a question's rate toward its kind's pooled rate by 4 weeks", () => {
    const rows = [
      row('incident:A-B', 1, 1), row('incident:A-B', 2, 0), row('incident:A-B', 3, 0), row('incident:A-B', 4, 0),
      row('incident:C-D', 1, 1), row('incident:C-D', 2, 1), row('incident:C-D', 3, 1), row('incident:C-D', 4, 0),
    ];
    // pooled 4/8 = 0.5; A-B: (1 + 4 × 0.5) / (4 + 4)
    expect(usualRate(rows, 'incident:A-B', 'incident')).toBeCloseTo(3 / 8, 12);
  });

  it('reads only the newest 52 weeks of the question', () => {
    // 2025-W01…W52 then 2026-W01…W08: the oldest 8 weeks said yes, the newest 52 said no.
    const weeks = [...Array.from({ length: 52 }, (_, i) => `2025-W${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_, i) => `2026-W${String(i + 1).padStart(2, '0')}`)];
    const rows = weeks.map((week, i): HistoryRow => ({ questionId: 'incident:A-B', kind: 'incident', week,
      outcome: i < 8 ? 1 : 0, signals: quiet }));
    const pooled = 8 / 60;
    expect(usualRate(rows, 'incident:A-B', 'incident')).toBeCloseTo((0 + 4 * pooled) / (52 + 4), 12);
  });

  it('falls back to 10% with no history at all', () => {
    expect(usualRate([], 'incident:A-B', 'incident')).toBeCloseTo(0.1, 12);
  });
});

describe('same-as-last-week@1', () => {
  it('uses the chance after a week with an incident, or after a quiet week, add-one smoothed', () => {
    const rows = [
      row('incident:A-B', 1, 1, { incidents7: 2 }), row('incident:A-B', 2, 1, { incidents7: 1 }),
      row('incident:A-B', 3, 0, { incidents7: 1 }),
      row('incident:A-B', 4, 1), row('incident:A-B', 5, 0), row('incident:A-B', 6, 0),
      row('incident:A-B', 7, 0), row('incident:A-B', 8, 0),
    ];
    expect(sameAsLastWeek(rows, 'incident', { ...quiet, incidents7: 1 })).toBeCloseTo((2 + 1) / (3 + 2), 12);
    expect(sameAsLastWeek(rows, 'incident', quiet)).toBeCloseTo((1 + 1) / (5 + 2), 12);
  });
});
