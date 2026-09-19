import { describe, it, expect } from 'vitest';
import { scoreConfidence } from '@/lib/verify/confidence';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `c${String(n).padStart(4, '0')}`, url: `https://x/${n}`,
    title: 'North Korea fires multiple ballistic missiles', outlet: 'Reuters',
    publishedAt: `2026-09-19T10:${String(n % 60).padStart(2, '0')}:00.000Z`, snippet: '',
    imageUrl: null, language: 'en', beatId: null, localeKey: null, sourceCountry: 'GBR',
    ownership: 'independent', tier: 1, isPrimary: false, actors: ['PRK'], people: [],
    hotspots: [], domain: 'Military', escalation: 0, framing: 0, ladderRung: null,
    ladderZh: null, ladderEn: null, glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const points = (r: ReturnType<typeof scoreConfidence>, key: string) => r.signals.find((s) => s.key === key)!.points;

/**
 * A wire story printed by three outlets in three countries is one report. Every signal
 * that rewards diversity — outlets, ownership, countries — must see one, or the score
 * rewards syndication as though it were confirmation.
 */
describe('reprints count once', () => {
  const T = 'North Korea fires multiple ballistic missiles';
  const three = () => [
    art({ title: T, outlet: 'Reuters', sourceCountry: 'GBR' }),
    art({ title: T, outlet: 'Dawn', sourceCountry: 'PAK' }),
    art({ title: T, outlet: 'The Hindu', sourceCountry: 'IND' }),
  ];
  const separate = () => [
    art({ title: 'North Korea fires multiple ballistic missiles', outlet: 'Reuters', sourceCountry: 'GBR' }),
    art({ title: 'Pyongyang launches missiles toward the sea, Seoul says', outlet: 'Dawn', sourceCountry: 'PAK' }),
    art({ title: 'Missile launches by the North rattle the peninsula again', outlet: 'The Hindu', sourceCountry: 'IND' }),
  ];

  it('scores three reprints as one outlet', () => {
    const r = scoreConfidence(three());
    expect(points(r, 'outlets')).toBe(8); // one independent outlet
    expect(r.flags).toContain('single_source');
  });

  it('scores the same three as separate reports when the headlines differ', () => {
    const r = scoreConfidence(separate());
    expect(points(r, 'outlets')).toBe(20); // three independent outlets
    expect(r.flags).not.toContain('single_source');
  });

  it('does not let a reprint add country spread', () => {
    expect(points(scoreConfidence(three()), 'countries')).toBe(0);
    expect(points(scoreConfidence(separate()), 'countries')).toBe(15);
  });

  it('lowers the score, never raises it', () => {
    expect(scoreConfidence(three()).confidence).toBeLessThan(scoreConfidence(separate()).confidence);
  });

  it('says what was and was not counted', () => {
    const detail = scoreConfidence(three()).signals.find((s) => s.key === 'outlets')!.detail;
    expect(detail).toMatch(/2 outlets reprinted a report already counted/);
  });

  it('does not mention reprints when there are none', () => {
    const detail = scoreConfidence(separate()).signals.find((s) => s.key === 'outlets')!.detail;
    expect(detail).not.toMatch(/reprint/);
  });
});

describe('what reprints must not change', () => {
  it('still flags a denial that appears only in a reprint', () => {
    // The primary report is the representative; the denial is in the reprint's snippet. The
    // contradiction check reads the WHOLE cluster, so this change can never make it quieter.
    const T = 'China says border talks were held in Delhi today';
    const official = art({ title: T, outlet: 'MFA', ownership: 'state', tier: 2, isPrimary: true });
    const reprint = art({ title: T, outlet: 'Global Times', snippet: 'Beijing denies any incursion across the LAC' });
    expect(scoreConfidence([official, reprint]).flags).toContain('disputed');
  });

  it('keeps an official statement in a family visible to the primary-source signal', () => {
    const T = 'India and China agree border patrol arrangement at talks';
    const r = scoreConfidence([
      art({ title: T, outlet: 'Reuters' }),
      art({ title: T, outlet: 'PIB', ownership: 'state', tier: 2, isPrimary: true }),
    ]);
    expect(points(r, 'primary')).toBe(15);
    expect(r.flags).toContain('primary_sourced');
  });

  it('still flags one outlet publishing twice under different headlines as a single source', () => {
    const r = scoreConfidence([
      art({ title: 'Border talks resume between India and China today', outlet: 'Reuters' }),
      art({ title: 'Corps commanders meet in Arunachal after months of stalemate', outlet: 'Reuters' }),
    ]);
    expect(r.flags).toContain('single_source');
  });

  it('stays inside 0..100 with the same six signal maxima', () => {
    const r = scoreConfidence([art(), art({ outlet: 'Dawn', sourceCountry: 'PAK' })]);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
    expect(r.signals.filter((s) => s.max > 0).map((s) => s.max)).toEqual([25, 20, 20, 10, 15, 10]);
  });
});
