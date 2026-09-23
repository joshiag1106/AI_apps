import { describe, it, expect } from 'vitest';
import { lens, twoProportionZ, queryLanguage, MIN_ARTICLES, type LensArticle } from '@/lib/lens/compare';
import { BEATS, type Beat } from '@/data/feeds';
import { DOMAIN_HINTS } from '@/data/lexicon';
import { evidencedDomain, scoreText } from '@/lib/analyze/score';
import type { Domain } from '@/lib/types';

/**
 * Language Lens compares one topic search across the languages it was run in. Every rule here is
 * in docs/specs/2026-09-23-language-lens-design.md, including why the comparison is made WITHIN a
 * topic and never across the whole corpus (that measured the feed design, not anyone's press).
 */

let n = 0;
function la(p: Partial<LensArticle> = {}): LensArticle {
  n += 1;
  return {
    id: `a${n}`, language: 'en', beatId: 'ind-chn', framed: 'Diplomatic', actors: ['IND', 'CHN'],
    outlet: `Outlet ${n % 7}`, publishedAt: '2026-09-01T00:00:00.000Z', title: `Headline ${n}`,
    titleEn: null, ...p,
  };
}
const many = (count: number, p: Partial<LensArticle> = {}) => Array.from({ length: count }, () => la(p));

const BEAT: Beat = {
  id: 'ind-chn', label: 'India–China', dyad: ['IND', 'CHN'], priority: 1,
  queries: [
    { locale: 'en-IN', q: 'India China border LAC' },
    { locale: 'zh-CN', q: '中印关系', en: 'China–India relations' },
    { locale: 'hi-IN', q: 'भारत चीन सीमा', en: 'India China border' },
  ],
};

describe('the two-proportion test', () => {
  it('gives the India–China military-framing gap (32.7% of 895 vs 17.7% of 350) a z near 5.3', () => {
    const z = twoProportionZ(293, 895, 62, 350);
    expect(z).toBeGreaterThan(5);
    expect(z).toBeLessThan(5.5);
  });

  it('is antisymmetric', () => {
    expect(twoProportionZ(62, 350, 293, 895)).toBeCloseTo(-twoProportionZ(293, 895, 62, 350), 10);
  });

  it('is zero where there is no variance or no sample to test', () => {
    expect(twoProportionZ(0, 10, 0, 20)).toBe(0);
    expect(twoProportionZ(10, 10, 20, 20)).toBe(0);
    expect(twoProportionZ(3, 0, 1, 5)).toBe(0);
  });
});

describe('which languages get a column', () => {
  it('reads a query locale as its language prefix', () => {
    expect(queryLanguage('zh-TW')).toBe('zh');
    expect(queryLanguage('ur-PK')).toBe('ur');
  });

  it(`needs ${MIN_ARTICLES} reports for a column, and two columns for a topic`, () => {
    const shown = lens([...many(30), ...many(30, { language: 'zh' }), ...many(10, { language: 'hi' })], [BEAT]);
    expect(shown[0].columns.map((c) => c.language)).toEqual(['en', 'zh']);
    expect(lens([...many(30), ...many(MIN_ARTICLES - 1, { language: 'zh' })], [BEAT])).toEqual([]);
  });

  it('orders columns by sample size', () => {
    const shown = lens([...many(30), ...many(40, { language: 'zh' })], [BEAT]);
    expect(shown[0].columns.map((c) => c.language)).toEqual(['zh', 'en']);
  });

  it('ignores reports with no topic, or with a topic it does not know', () => {
    expect(lens([...many(30, { beatId: null }), ...many(30, { language: 'zh', beatId: 'nope' })], [BEAT])).toEqual([]);
  });
});

describe('a column', () => {
  const [beat] = lens([
    ...many(20, { framed: 'Military' }),
    ...many(10, { framed: 'Diplomatic', actors: ['IND', 'CHN', 'PAK', 'PAK'] }),
    ...many(26, { language: 'zh', actors: ['CHN', 'USA'] }),
    la({ language: 'zh', publishedAt: '2026-09-20T00:00:00.000Z', title: '中印边境', titleEn: 'China–India border', id: 'newest' }),
    la({ language: 'hi', publishedAt: '2020-01-01T00:00:00.000Z' }),
  ], [BEAT], new Map([['newest', 'evt-1']]));
  const en = beat.columns.find((c) => c.language === 'en')!;
  const zh = beat.columns.find((c) => c.language === 'zh')!;

  it('shows what that language was asked, with its English gloss', () => {
    expect(zh.asked).toEqual([{ q: '中印关系', en: 'China–India relations' }]);
    expect(en.asked).toEqual([{ q: 'India China border LAC', en: null }]);
  });

  it('counts reports and distinct outlets', () => {
    expect(en.articles).toBe(30);
    expect(en.outlets).toBe(7);
  });

  it('gives framing shares, largest first', () => {
    expect(en.framing.map((f) => [f.key, f.count])).toEqual([['Military', 20], ['Diplomatic', 10]]);
    expect(en.framing[0].share).toBeCloseTo(2 / 3, 10);
  });

  it("names other states — not the topic's own pair — counting a state once per report", () => {
    expect(en.others).toEqual([{ key: 'PAK', count: 10, share: 10 / 30 }]);
    expect(zh.others.map((o) => o.key)).toEqual(['USA']);
  });

  it('lists the three newest headlines, glossed, linked to their event when there is one', () => {
    expect(zh.latest).toHaveLength(3);
    expect(zh.latest[0]).toMatchObject({ id: 'newest', titleEn: 'China–India border', eventId: 'evt-1' });
    expect(zh.latest[1].eventId).toBeNull();
  });

  it('dates the section by the reporting it actually used', () => {
    expect(beat.until).toBe('2026-09-20T00:00:00.000Z');
    // The one Hindi report, from 2020, has no column, so it does not stretch the range.
    expect(beat.since).toBe('2026-09-01T00:00:00.000Z');
  });

  it('lists at most three other states, each named in at least three reports', () => {
    const [b] = lens([
      ...['PAK', 'NPL', 'BTN', 'LKA'].flatMap((iso, i) => many(5 + i, { actors: ['IND', iso] })),
      ...many(2, { actors: ['IND', 'MDV'] }),
      ...many(30, { language: 'zh' }),
    ], [BEAT]);
    expect(b.columns.find((c) => c.language === 'en')!.others.map((o) => o.key)).toEqual(['LKA', 'BTN', 'NPL']);
  });

  it('excludes nothing for a topic that is not about a pair of states', () => {
    const [b] = lens([...many(30, { beatId: 'x' }), ...many(30, { beatId: 'x', language: 'zh' })],
      [{ ...BEAT, id: 'x', dyad: undefined }]);
    expect(b.columns[0].others.map((o) => o.key).sort()).toEqual(['CHN', 'IND']);
  });
});

describe('the sharpest difference', () => {
  const mix = (language: string, counts: Partial<Record<Domain, number>>) =>
    Object.entries(counts).flatMap(([domain, count]) => many(count!, { language, framed: domain as Domain }));

  it('is called out when it is wide and unlikely to be chance', () => {
    const [b] = lens([
      ...mix('en', { Military: 100, Diplomatic: 180, Economic: 20 }),
      ...mix('zh', { Military: 54, Diplomatic: 216, Economic: 30 }),
    ], [BEAT]);
    expect(b.sharpest).toMatchObject({ domain: 'Military', high: { language: 'en' }, low: { language: 'zh' } });
    expect(b.sharpest!.high.share).toBeCloseTo(1 / 3, 10);
    expect(b.sharpest!.low.share).toBeCloseTo(0.18, 10);
    expect(b.sharpest!.z).toBeGreaterThan(2.58);
  });

  it('is not called out on small samples, however wide (40% vs 20% on 25 each, z ≈ 1.5)', () => {
    const [b] = lens([...mix('en', { Military: 10, Diplomatic: 15 }), ...mix('zh', { Military: 5, Diplomatic: 20 })], [BEAT]);
    expect(b.sharpest).toBeNull();
  });

  it('is not called out when narrow, however certain (3 points on 4,000 each, z ≈ 2.9)', () => {
    const [b] = lens([
      ...mix('en', { Military: 1333, Diplomatic: 2667 }),
      ...mix('zh', { Military: 1213, Diplomatic: 2787 }),
    ], [BEAT]);
    expect(b.sharpest).toBeNull();
  });
});

/**
 * Found by running the page on the real corpus: the stored `domain` falls back to 'Diplomatic' when
 * a report's words show no framing, and only 4% of Arabic and 3% of Japanese topic-search reports
 * show any. The first build said "100% of Japanese reports" framed China–Taiwan diplomatically —
 * the classifier's blind spot, printed as a finding. Framing is counted only where it is evidenced.
 */
describe('framing, counted only where a report shows it', () => {
  it('reads shares from the reports whose words show a framing, and says how many that is', () => {
    const [b] = lens([...many(30, { framed: 'Military' }), ...many(30, { framed: null }), ...many(30, { language: 'zh' })], [BEAT]);
    const en = b.columns.find((c) => c.language === 'en')!;
    expect(en.articles).toBe(60);
    expect(en.classified).toBe(30);
    expect(en.framing).toEqual([{ key: 'Military', count: 30, share: 1 }]);
  });

  it(`reads no framing for a language with fewer than ${MIN_ARTICLES} readable reports, and leaves it out of the test`, () => {
    const [b] = lens([
      ...many(100, { framed: 'Military' }),
      ...many(40, { language: 'ja', framed: null }), ...many(2, { language: 'ja', framed: 'Diplomatic' }),
    ], [BEAT]);
    const ja = b.columns.find((c) => c.language === 'ja')!;
    expect(ja.articles).toBe(42);
    expect(ja.classified).toBe(2);
    expect(ja.framing).toEqual([]);
    expect(b.sharpest).toBeNull();
  });

  it('tests a difference on the readable reports, so unreadable ones cannot dilute or inflate it', () => {
    const [b] = lens([
      // Three domains, so the Military gap is the widest rather than tied with its complement.
      ...many(100, { framed: 'Military' }), ...many(180, { framed: 'Diplomatic' }), ...many(20, { framed: 'Economic' }),
      ...many(1000, { framed: null }),
      ...many(54, { language: 'zh', framed: 'Military' }), ...many(216, { language: 'zh', framed: 'Diplomatic' }),
      ...many(30, { language: 'zh', framed: 'Economic' }),
    ], [BEAT]);
    expect(b.sharpest).toMatchObject({ domain: 'Military', high: { language: 'en' } });
    expect(b.sharpest!.high.share).toBeCloseTo(1 / 3, 10);
    expect(b.sharpest!.low.share).toBeCloseTo(0.18, 10);
  });

  it('finds no framing in words that show none, where the stored fallback says Diplomatic', () => {
    expect(evidencedDomain('zzqx vvbn plok')).toBeNull();
    expect(scoreText('zzqx vvbn plok').domain).toBe('Diplomatic');
  });

  it('agrees with the stored domain wherever there is evidence', () => {
    for (const [domain, hints] of Object.entries(DOMAIN_HINTS)) {
      const text = `report mentions ${hints[0]}`;
      expect(evidencedDomain(text), `${domain}: ${hints[0]}`).toBe(scoreText(text).domain);
    }
  });
});

describe('the searches themselves', () => {
  it('gloss every non-English query in English, so a reader can see what each language was asked', () => {
    const missing = BEATS.flatMap((b) =>
      b.queries.filter((q) => !q.locale.startsWith('en-') && !q.en).map((q) => `${b.id}: ${q.q}`));
    expect(missing).toEqual([]);
  });
});
