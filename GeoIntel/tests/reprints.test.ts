import { describe, it, expect } from 'vitest';
import { headlineKey, reprintFamilies, REPRINT_SIMILARITY } from '@/lib/verify/reprints';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `r${String(n).padStart(4, '0')}`, url: `https://x/${n}`,
    title: 'North Korea fires multiple ballistic missiles', outlet: 'Reuters',
    publishedAt: `2026-09-19T10:${String(n % 60).padStart(2, '0')}:00.000Z`, snippet: '',
    imageUrl: null, language: 'en', beatId: null, localeKey: null, sourceCountry: 'GBR',
    ownership: 'independent', tier: 1, isPrimary: false, actors: ['PRK'], people: [],
    hotspots: [], domain: 'Military', escalation: 0, framing: 0, ladderRung: null,
    ladderZh: null, ladderEn: null, glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const ids = (fams: ReturnType<typeof reprintFamilies>) => fams.map((f) => f.members.map((m) => m.id));

/**
 * A wire story printed by five outlets is one report, not five. These tests pin what counts
 * as a reprint — and, as importantly, what does not: a headline two editors wrote
 * separately about the same event is independent evidence, and collapsing it would
 * silently penalise genuine corroboration.
 */
describe('what a headline reduces to', () => {
  it('returns null for a headline too short to trust', () => {
    // "Iran attacks Israel" could be written independently by two editors.
    expect(headlineKey('Iran attacks Israel')).toBeNull();
    expect(headlineKey('伊朗袭击以色列')).not.toBeNull(); // 7 Han characters
    expect(headlineKey('伊朗袭击')).toBeNull();
  });

  it('accepts four words', () => {
    expect(headlineKey('Iran attacks Israel again')).not.toBeNull();
  });

  it('ignores a trailing outlet suffix, with or without spaces around the pipe', () => {
    const bare = headlineKey('North Korea fires multiple ballistic missiles');
    expect(headlineKey('North Korea fires multiple ballistic missiles - Reuters')).toEqual(bare);
    expect(headlineKey('North Korea fires multiple ballistic missiles | ABC News')).toEqual(bare);
    expect(headlineKey('North Korea fires multiple ballistic missiles| ABC News')).toEqual(bare);
  });

  it('ignores a leading section label', () => {
    const bare = headlineKey('North Korea fires multiple ballistic missiles');
    expect(headlineKey('Video | North Korea fires multiple ballistic missiles')).toEqual(bare);
    expect(headlineKey('WATCH: North Korea fires multiple ballistic missiles')).toEqual(bare);
  });

  it('ignores case, punctuation and curly quotes', () => {
    expect(headlineKey('Saudi prince seeks Egypt’s backing, as Houthi attacks rattle Red Sea'))
      .toEqual(headlineKey("saudi prince seeks egypt's backing as houthi attacks rattle red sea"));
  });

  it('keeps a hyphen inside a word, so it is not mistaken for an outlet suffix', () => {
    expect(headlineKey('North Korea live-fire drills show huge power')?.has('live')).toBe(true);
  });
});

describe('families of reprints', () => {
  it('puts an identical headline from two outlets in one family', () => {
    const a = art({ outlet: 'Dawn', sourceCountry: 'PAK' });
    const b = art({ outlet: 'Vanguard News', sourceCountry: 'NGA' });
    const fams = reprintFamilies([a, b]);
    expect(fams).toHaveLength(1);
    expect(fams[0].members.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it('matches a Chinese headline that differs only by an appended outlet name', () => {
    // Measured in the real corpus: scored 0.78 before the suffix was stripped, though it is
    // the same headline.
    const a = art({ title: '忧遭北京处罚 部分中国稀土企业据报拒向美国供货', outlet: 'Sohu', language: 'zh' });
    const b = art({ title: '忧遭北京处罚部分中国稀土企业据报拒向美国供货| 加拿大新闻网', outlet: 'CNews', language: 'zh' });
    expect(reprintFamilies([a, b])).toHaveLength(1);
  });

  it('does NOT collapse two headlines written separately about one event', () => {
    // 0.5-0.8 similarity: independent editorial decisions, kept independent on purpose.
    const a = art({ title: '4 sailors killed in Houthi missile attack on Red Sea cargo ship', outlet: 'Reuters' });
    const b = art({ title: 'Four killed in Houthi attack on Red Sea cargo ship, sources say', outlet: 'ABC' });
    expect(reprintFamilies([a, b])).toHaveLength(2);
  });

  it('does NOT collapse headlines whose figures differ', () => {
    // Found by reading a sample of the real corpus's collapsed families: a daily radio
    // broadcast titled by its date ("… (2026年9月3日)", "… (9月4日)") is a different report
    // each day, and "4 missiles" against "5 missiles" is a different claim — yet set overlap
    // alone scores both at 0.86 or higher. Reprints carry identical numbers.
    const four = art({ title: 'North Korea fires 4 ballistic missiles toward the sea', outlet: 'Reuters' });
    const five = art({ title: 'North Korea fires 5 ballistic missiles toward the sea', outlet: 'Dawn' });
    expect(reprintFamilies([four, five])).toHaveLength(2);

    const day3 = art({ title: '美国之音中文广播 (2026年9月3日)', outlet: 'VOA Chinese', language: 'zh' });
    const day4 = art({ title: '美国之音中文广播 (2026年9月4日)', outlet: 'VOA Chinese', language: 'zh' });
    expect(reprintFamilies([day3, day4])).toHaveLength(2);
  });

  it('still collapses when the figures match and only the outlet suffix differs', () => {
    const a = art({ title: 'North Korea fires 4 ballistic missiles toward the sea', outlet: 'Reuters' });
    const b = art({ title: 'North Korea fires 4 ballistic missiles toward the sea - Dawn', outlet: 'Dawn' });
    expect(reprintFamilies([a, b])).toHaveLength(1);
  });

  it('never collapses a headline below the minimum length', () => {
    const a = art({ title: 'Iran attacks Israel', outlet: 'Reuters' });
    const b = art({ title: 'Iran attacks Israel', outlet: 'Dawn' });
    expect(reprintFamilies([a, b])).toHaveLength(2);
  });

  it('does not chain: A~B and B~C must not merge A with C', () => {
    // Words w1..w12. A = w1..w10, B = w2..w11, C = w3..w12. A~B and B~C are 9/11 = 0.82, but
    // A~C is 8/12 = 0.67. Matching against a family's ANCHOR (its earliest article), not any
    // member, keeps C out; single-link grouping would merge all three.
    const w = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima'.split(' ');
    const title = (from: number, to: number) => w.slice(from - 1, to).join(' ');
    const a = art({ title: title(1, 10), outlet: 'One', publishedAt: '2026-09-19T10:00:00.000Z' });
    const b = art({ title: title(2, 11), outlet: 'Two', publishedAt: '2026-09-19T10:01:00.000Z' });
    const c = art({ title: title(3, 12), outlet: 'Three', publishedAt: '2026-09-19T10:02:00.000Z' });
    const fams = reprintFamilies([a, b, c]);
    expect(ids(fams)).toEqual([[a.id, b.id], [c.id]]);
  });

  it('is deterministic whatever order the articles arrive in', () => {
    const list = [
      art({ outlet: 'Dawn', publishedAt: '2026-09-19T10:02:00.000Z' }),
      art({ outlet: 'ABC', publishedAt: '2026-09-19T10:00:00.000Z' }),
      art({ title: 'Saudi prince seeks backing as Houthi attacks rattle Red Sea', outlet: 'FT', publishedAt: '2026-09-19T10:01:00.000Z' }),
      art({ outlet: 'BBC', publishedAt: '2026-09-19T10:03:00.000Z' }),
    ];
    const forward = ids(reprintFamilies(list));
    expect(ids(reprintFamilies([...list].reverse()))).toEqual(forward);
    expect(ids(reprintFamilies([list[2], list[0], list[3], list[1]]))).toEqual(forward);
  });

  it('exposes the threshold it uses', () => {
    expect(REPRINT_SIMILARITY).toBe(0.8);
  });
});

describe('which report stands for the family', () => {
  it('prefers an official statement over an earlier report', () => {
    const early = art({ outlet: 'Reuters', publishedAt: '2026-09-19T10:00:00.000Z' });
    const official = art({ outlet: 'PIB', ownership: 'state', tier: 2, isPrimary: true, publishedAt: '2026-09-19T10:05:00.000Z' });
    expect(reprintFamilies([early, official])[0].representative.id).toBe(official.id);
  });

  it('then prefers the stronger outlet track record', () => {
    const weak = art({ outlet: 'Blog', tier: 3, publishedAt: '2026-09-19T10:00:00.000Z' });
    const strong = art({ outlet: 'Reuters', tier: 1, publishedAt: '2026-09-19T10:05:00.000Z' });
    expect(reprintFamilies([weak, strong])[0].representative.id).toBe(strong.id);
  });

  it('then the earliest', () => {
    const first = art({ outlet: 'ABC', publishedAt: '2026-09-19T10:00:00.000Z' });
    const second = art({ outlet: 'BBC', publishedAt: '2026-09-19T10:05:00.000Z' });
    expect(reprintFamilies([second, first])[0].representative.id).toBe(first.id);
  });
});
