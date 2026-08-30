import { describe, it, expect } from 'vitest';
import { dictionaryGloss, segmentChinese } from '@/lib/lang/dictionary';

/**
 * The security lexicon glosses only the terms it curates, so half of all Chinese
 * headlines produced no English line at all — measured on the corpus: 234 of 473 events.
 * A general dictionary covers the ordinary news vocabulary the lexicon was never meant to
 * hold, which is what turns "no English" into "some English" for every headline.
 */
describe('segmentChinese', () => {
  it('prefers the longest real word over single characters', () => {
    // 中国 is one word, not 中 + 国.
    expect(segmentChinese('中国')).toEqual(['中国']);
  });

  it('splits a headline into dictionary words', () => {
    const words = segmentChinese('中国公布外国失踪人员国籍');
    expect(words).toContain('中国');
    expect(words).toContain('公布');
    expect(words).toContain('国籍');
  });

  it('keeps digit runs whole rather than splitting them', () => {
    expect(segmentChinese('261名')).toContain('261');
  });

  it('returns nothing for text with no Chinese', () => {
    expect(segmentChinese('Taiwan Strait')).toEqual([]);
  });
});

describe('dictionaryGloss', () => {
  it('glosses an ordinary news headline the security lexicon cannot touch', () => {
    const g = dictionaryGloss('中国公布261名外国失踪人员国籍包括两名法国人');
    expect(g).toBeTruthy();
    expect(g).toContain('China');
    // 法国人 matches ahead of 法国, so the gloss is "Frenchman" rather than "France" —
    // longest-match doing its job.
    expect(g).toContain('French');
  });

  it('skips "variant of" stub entries in favour of a real definition', () => {
    // 公布 has a variant stub listed before its real sense.
    const g = dictionaryGloss('公布');
    expect(g).not.toContain('variant of');
    expect(g).toContain('announce');
  });

  it('takes a single sense, not the whole list', () => {
    // 人员 is defined as staff/crew/personnel; one is enough under a headline.
    const g = dictionaryGloss('人员') ?? '';
    expect(g.split('·')).toHaveLength(1);
    expect(g).not.toContain(';');
  });

  it('strips the bracketed pinyin cross-references CC-CEDICT embeds', () => {
    const g = dictionaryGloss('中国公布') ?? '';
    expect(g).not.toMatch(/\[[a-z0-9 ]+\]/i);
  });

  it('strips CC-CEDICT parentheticals, which are lexicographer notes not meaning', () => {
    // Entries carry asides like "(bound form) sun" and "the Chinese side (in an
    // international venture)". Under a headline they are noise, not sense.
    const g = dictionaryGloss('中方日交涉') ?? '';
    expect(g).not.toContain('(');
    expect(g).not.toContain(')');
  });

  it('returns null rather than an empty string when nothing resolves', () => {
    expect(dictionaryGloss('Taiwan Strait patrol')).toBeNull();
    expect(dictionaryGloss('')).toBeNull();
  });

  it('caps the length so a long headline cannot swamp the card', () => {
    const long = '中国公布外国失踪人员国籍包括两名法国人'.repeat(6);
    expect((dictionaryGloss(long) ?? '').length).toBeLessThanOrEqual(160);
  });
});
