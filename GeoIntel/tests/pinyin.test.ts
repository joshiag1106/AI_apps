import { describe, it, expect } from 'vitest';
import { toPinyin, hasChinese, pickEnglish } from '@/lib/lang/pinyin';

/**
 * pinyin-pro converts every character it is handed, not only Han ones: passed a whole
 * headline it renders "Hello world 2026" as "H e l l o   w o r l d   2 0 2 6" and turns
 * the count in 中国公布261名 into "2 6 1". Real headlines are mixed — Chinese around
 * Latin outlet names, digits, and punctuation — so the text has to be segmented and only
 * the Han runs converted.
 */
describe('pinyin', () => {
  it('renders Chinese with tone marks', () => {
    expect(toPinyin('中菲船只')).toBe('zhōng fēi chuán zhī');
  });

  it('keeps digits intact instead of spelling them out', () => {
    expect(toPinyin('中国公布261名')).toBe('zhōng guó gōng bù 261 míng');
  });

  it('passes Latin text through untouched', () => {
    expect(toPinyin('DW News 报道')).toBe('DW News bào dào');
  });

  it('preserves punctuation between Han runs', () => {
    expect(toPinyin('中方：强烈抗议')).toBe('zhōng fāng: qiáng liè kàng yì');
  });

  it('returns empty for text with no Chinese at all', () => {
    // Callers use this to skip rendering a pinyin line entirely.
    expect(toPinyin('Taiwan Strait patrol')).toBe('');
    expect(toPinyin('')).toBe('');
  });

  it('converts a PRC ladder formula correctly', () => {
    expect(toPinyin('严正交涉')).toBe('yán zhèng jiāo shè');
  });

  it('collapses runs of whitespace rather than emitting ragged gaps', () => {
    expect(toPinyin('中国  \n 公布')).toBe('zhōng guó gōng bù');
  });
});

describe('hasChinese', () => {
  it('detects Han characters', () => {
    expect(hasChinese('中文')).toBe(true);
    expect(hasChinese('DW News 报道')).toBe(true);
  });

  it('is false for Latin, digits and empty input', () => {
    expect(hasChinese('Taiwan Strait')).toBe(false);
    expect(hasChinese('2026')).toBe(false);
    expect(hasChinese('')).toBe(false);
  });
});

/**
 * English has three possible sources of decreasing quality: a real LLM sentence
 * translation, the deterministic keyword gloss, or nothing. The rule is simply
 * best-available, and it lives here so every call site cannot re-implement it slightly
 * differently.
 */
describe('pickEnglish', () => {
  it('prefers a real translation over the keyword gloss', () => {
    expect(pickEnglish('China announces nationalities of 261 missing', 'China · announce')).
      toBe('China announces nationalities of 261 missing');
  });

  it('falls back to the gloss when no translation exists', () => {
    expect(pickEnglish(null, 'China · announce')).toBe('China · announce');
  });

  it('returns null when nothing is available', () => {
    expect(pickEnglish(null, null)).toBeNull();
  });

  it('treats blank and whitespace-only candidates as absent', () => {
    expect(pickEnglish('', '   ')).toBeNull();
    expect(pickEnglish('  ', 'China · announce')).toBe('China · announce');
  });

  it('trims what it returns', () => {
    expect(pickEnglish('  China announces  ', null)).toBe('China announces');
  });
});
