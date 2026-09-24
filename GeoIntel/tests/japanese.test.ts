import { describe, it, expect } from 'vitest';
import { hasKana, japaneseGloss } from '@/lib/lang/japanese';
import { JA_GLOSSARY } from '@/data/glossary.ja';
import { titleGloss } from '@/components/EventCard';
import { dictionaryGloss } from '@/lib/lang/dictionary';

/**
 * Japanese headlines used to be glossed by the CHINESE dictionary, because they are full of kanji:
 * 首脳会談 (summit) came out "head · can", 日米韓 (Japan–US–South Korea) "sun · surname Mi", 防衛省
 * (Ministry of Defense) "to protect · to save". Real headlines from the corpus, 2026-09.
 */
const H1 = '日米韓外相、台湾海峡の「一方的な現状変更」に反対';
const H2 = '米中首脳会談、中国が台湾への武器売却停止を要求か';
const H3 = '中国軍機が領空侵犯、防衛省が緊急発進';

describe('telling Japanese from Chinese', () => {
  it('reads kana as Japanese, and Chinese or Latin text as not', () => {
    expect(hasKana(H1)).toBe(true);
    expect(hasKana('美国再度制裁俄伊中方坚决反对')).toBe(false);
    expect(hasKana('Taiwan Strait')).toBe(false);
  });
});

describe('the Japanese gloss', () => {
  it('glosses the terms it knows, longest first, in reading order', () => {
    expect(japaneseGloss(H1)).toBe('Japan–US–South Korea · foreign minister · Taiwan Strait · unilateral · change to the status quo · opposes');
    expect(japaneseGloss(H2)).toBe('US–China · summit · China · Taiwan · arms sales · halt · demands');
    expect(japaneseGloss(H3)).toBe('Chinese military aircraft · airspace violation · Ministry of Defense · scramble');
  });

  it("glosses the headline, not the outlet tag an aggregator appends to it", () => {
    // Every Mezha headline ends "| ウクライナニュース" ("Ukraine News"), which read as "Ukraine" on
    // China–Taiwan stories. Found in the browser, 2026-09-23.
    expect(japaneseGloss('中国軍が台湾周辺で艦艇と航空機を展開、台湾が警戒態勢を強化 | ウクライナニュース - #Mezha'))
      .toBe('Chinese military · around Taiwan · Taiwan · strengthening');
    expect(japaneseGloss('台湾国防部、中国の軍事力「急速に発展」｜Infoseekニュース')).toBe("Taiwan's defence ministry · China · military power");
  });

  it('says a term once, and says nothing rather than something empty', () => {
    expect(japaneseGloss('中国、中国')).toBe('China');
    expect(japaneseGloss('ことです')).toBeNull();
  });

  it('keeps a clean glossary: every entry Japanese, glossed, and listed once', () => {
    const seen = new Set<string>();
    for (const { ja, en } of JA_GLOSSARY) {
      expect(ja, en).not.toMatch(/[A-Za-z]/);
      expect(en.trim(), ja).not.toBe('');
      expect(seen.has(ja), `duplicate: ${ja}`).toBe(false);
      seen.add(ja);
    }
  });
});

describe('which gloss a headline gets', () => {
  it('sends Japanese to the Japanese gloss, never the Chinese dictionary', () => {
    expect(titleGloss(H2)).toBe(japaneseGloss(H2));
    expect(titleGloss(H2)).not.toContain('head · can');
    expect(titleGloss(H1)).not.toContain('surname Mi');
  });

  it('trusts a stated language when the headline happens to have no kana', () => {
    expect(titleGloss('日米韓外相会談', 'ja')).toBe('Japan–US–South Korea · foreign minister · talks');
  });

  it('leaves Chinese headlines on the Chinese dictionary', () => {
    const zh = '美国再度制裁俄伊中方坚决反对';
    expect(titleGloss(zh)).toBe(dictionaryGloss(zh));
  });
});
