import { describe, it, expect } from 'vitest';
import { decay, impact, squash, countryRisk, dyadTension, riskBand, TREND_SERIES_DAYS } from '@/lib/risk';
import type { GeoEvent } from '@/lib/types';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

let n = 0;
function ev(p: Partial<GeoEvent> = {}): GeoEvent {
  n += 1;
  return {
    id: `e${n}`, title: `Event ${n}`, summary: '', firstSeen: daysAgo(0), lastSeen: daysAgo(0),
    actors: ['IND', 'CHN'], people: [], hotspots: [], domain: 'Military',
    escalation: 30, confidence: 100, signals: [], flags: [], articleIds: [`a${n}`],
    languages: ['en'], countries: ['IND'], imageUrl: null, videoId: null,
    ladderRung: null, ladderZh: null, ladderEn: null, ...p,
  };
}

/**
 * The numbers readers see most — every country's index, its trend and band, every dyad's
 * tension — had no direct tests (risk R12). These pin them, so a change to any constant has to
 * change a test too.
 */
describe('the building blocks', () => {
  it('halves an event\'s weight every 14 days', () => {
    expect(decay(daysAgo(0), NOW)).toBe(1);
    expect(decay(daysAgo(14), NOW)).toBeCloseTo(0.5, 10);
    expect(decay(daysAgo(28), NOW)).toBeCloseTo(0.25, 10);
  });

  it('never weighs a future-dated or unparseable event above 1', () => {
    expect(decay(daysAgo(-3), NOW)).toBe(1);
    expect(decay('not a date', NOW)).toBe(1);
  });

  it('gates impact on confidence and ignores de-escalation', () => {
    expect(impact(ev({ escalation: 50, confidence: 80 }), NOW)).toBe(40);
    expect(impact(ev({ escalation: -40 }), NOW)).toBe(0);
  });

  it('squashes onto 0-100 with diminishing returns', () => {
    expect(squash(0)).toBe(0);
    expect(squash(120)).toBe(63);
    expect(squash(10_000)).toBe(100);
  });

  it.each([[0, 'Low'], [19, 'Low'], [20, 'Guarded'], [40, 'Elevated'], [60, 'High'], [80, 'Severe'], [100, 'Severe']])(
    'bands %i as %s', (score, label) => {
      expect(riskBand(score).label).toBe(label);
    });
});

describe('a country\'s index', () => {
  it('reads one fresh, fully confident military event as expected', () => {
    const r = countryRisk('IND', [ev({ escalation: 60 })], NOW);
    expect(r.composite).toBe(39);          // squash(60)
    expect(r.vectors.Military).toBe(71);   // squash(60 × 2.5)
    expect(r.vectors.Economic).toBe(0);
    expect(r.eventCount).toBe(1);
    expect(r.topDomain).toBe('Military');
  });

  it('counts only events that name the country', () => {
    expect(countryRisk('PAK', [ev()], NOW).eventCount).toBe(0);
  });
});

/**
 * The trend compared the last 30 days with EVERYTHING older, up to 60 days more, while the type
 * called it "the previous equivalent window". A steady rate of reporting therefore read as a
 * falling trend, drifting further negative as the corpus filled its 90 days.
 */
describe('a country\'s trend compares equal windows', () => {
  it('reads a steady rate of reporting as no trend', () => {
    const steady = [5, 10, 15, 20, 25, 35, 40, 45, 50, 55, 65, 70, 75, 80, 85].map((d) => ev({ lastSeen: daysAgo(d) }));
    expect(countryRisk('IND', steady, NOW).trend).toBe(0);
  });

  it('ignores events older than the previous 30 days', () => {
    const r = countryRisk('IND', [ev({ lastSeen: daysAgo(5) }), ev({ lastSeen: daysAgo(75) })], NOW);
    expect(r.trend).toBe(22); // squash(30) − squash(0): the 75-day-old event is outside both windows
  });

  it('reads a rise as positive', () => {
    const rising = [5, 10, 15, 20, 25].map((d) => ev({ lastSeen: daysAgo(d) }));
    expect(countryRisk('IND', rising, NOW).trend).toBe(71); // squash(150) − squash(0)
  });
});

describe('a dyad\'s tension', () => {
  it('scores the pair and plots the full trend window', () => {
    const t = dyadTension('IND', 'CHN', [ev({ escalation: 60 })], NOW);
    expect(t.score).toBe(63);                          // squash(60 × 2)
    expect(t.series).toHaveLength(TREND_SERIES_DAYS);
    expect(t.eventCount).toBe(1);
  });
});
