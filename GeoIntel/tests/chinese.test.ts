import { describe, it, expect } from 'vitest';
import { detectScript, detectLanguage } from '@/lib/lang/detect';
import { glossArticle, detectLadder, highestRung } from '@/lib/lang/chinese';

describe('script and language detection', () => {
  it('identifies Han script', () => {
    expect(detectScript('中印边境局势')).toBe('Han');
    expect(detectLanguage('中印边境局势')).toBe('zh');
  });
  it('identifies Devanagari, Cyrillic, Arabic, Latin', () => {
    expect(detectLanguage('भारत चीन सीमा')).toBe('hi');
    expect(detectLanguage('Украина фронт')).toBe('ru');
    expect(detectLanguage('إسرائيل إيران')).toBe('ar');
    expect(detectLanguage('India China border')).toBe('en');
  });
  it('picks the dominant script in mixed text rather than the first character', () => {
    // Feed titles routinely append a Latin outlet name to a Chinese headline.
    expect(detectLanguage('中印边界问题特别代表第25次会晤达成8点成果共识 - thepaper.cn')).toBe('zh');
  });
});

describe('glossary translation', () => {
  it('maps territorial and military terms to English', () => {
    const g = glossArticle('解放军在实际控制线附近举行战备巡逻');
    const terms = g.terms.map((t) => t.en);
    expect(terms).toContain('Line of Actual Control (LAC)');
    expect(terms).toContain('combat readiness patrol');
    expect(terms).toContain("People's Liberation Army (PLA)");
  });

  it('flags PRC exonyms as framing signals, not neutral vocabulary', () => {
    const g = glossArticle('藏南地区自古以来是中国固有领土');
    const framing = g.terms.filter((t) => t.category === 'framing').map((t) => t.zh);
    expect(framing).toContain('藏南');
    expect(framing).toContain('自古以来');
    expect(g.framingScore).toBeGreaterThan(0);
  });

  it('lets de-escalatory vocabulary pull the score down', () => {
    const tense = glossArticle('中印边境对峙 增兵 挑衅');
    const calm = glossArticle('中印双方同意脱离接触 特别代表会晤');
    expect(calm.escalationScore).toBeLessThan(tense.escalationScore);
    expect(calm.escalationScore).toBeLessThan(0);
  });

  it('returns nothing for text with no Chinese', () => {
    expect(glossArticle('India and China held talks').terms).toHaveLength(0);
  });
});

describe('PRC escalation ladder', () => {
  it('prefers the longest matching formula so 严正交涉 beats 交涉', () => {
    const hits = detectLadder('中方已向印方提出严正交涉');
    expect(hits).toHaveLength(1);
    expect(hits[0].zh).toBe('严正交涉');
    expect(hits[0].rung).toBe(4);
  });

  it('distinguishes 强烈不满 from 表示不满', () => {
    expect(detectLadder('表示强烈不满')[0].zh).toBe('强烈不满');
  });

  it('detects the 1962/1979 pre-war formula at maximum severity', () => {
    const hits = detectLadder('是可忍孰不可忍，勿谓言之不预也');
    expect(hits[0].rung).toBe(13);
    expect(hits[0].severity).toBe(100);
  });

  it('reports the highest rung when several appear', () => {
    const top = highestRung('中方表示关切，并提出严正交涉，保留采取进一步措施的权利');
    expect(top?.rung).toBe(9);
  });

  it('returns null when no official formula is present', () => {
    expect(highestRung('两国领导人举行会晤')).toBeNull();
  });
});
