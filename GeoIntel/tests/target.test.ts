import { describe, it, expect } from 'vitest';
import { formulaTarget, NAME_ISO, ABBR_ISO } from '@/lib/lang/target';
import { formulaAnchor, ABBR, NAMES } from '@/lib/lang/speaker';
import { BY_ISO } from '@/data/countries';
import { TARGET_FIXTURE } from './fixtures/ladder-targets';

/**
 * A Beijing formula says how hard; the target says at whom. The headline usually says — 向日方,
 * 召菲驻华大使, 美方声称…中方驳斥 — but it can also name a bystander, two states, or nobody. So the
 * rule is judged on one thing above all: it must never name the wrong state. Unresolved is fine.
 */
describe('whom a Beijing formula is about', () => {
  it.each([
    ['a state after 向', '中方已向印度提出严正交涉', '严正交涉', 'IND'],
    ['a side after 向 and 就', '中方已就此向美方提出严正交涉', '严正交涉', 'USA'],
    ['a side after 对', '外交部发言人：中方对印方的做法表示强烈抗议', '强烈抗议', 'IND'],
    ['the state an embassy sits in', '中国驻美使馆：坚决反对美方的做法', '坚决反对', 'USA'],
    ['the party whose act is being answered', '俄方指责中方，中方驳斥：坚决反对', '坚决反对', 'RUS'],
    ['an abbreviation after 召', '外交部召见英驻华大使 提出严正交涉', '严正交涉', 'GBR'],
    ['the other state of a mutual exchange', '中国菲律宾互相传召对方大使“严正交涉”', '严正交涉', 'PHL'],
    ['a state named after the formula', '外交部：严正交涉、强烈抗议日方消极动向', '强烈抗议', 'JPN'],
    ['the home state of a named official, when no state is named', '高市早苗供奉靖国神社，中方：严正交涉', '严正交涉', 'JPN'],
  ])('reads %s', (_why, text, formula, want) => {
    expect(formulaTarget(text, formula)).toBe(want);
  });

  it.each([
    ['no state at all', '中方严正交涉', '严正交涉'],
    ['a bare 北京：', '北京：坚决反对', '坚决反对'],
    ['two states in Beijing’s clause', '中方向美方和日方提出严正交涉', '严正交涉'],
    ['a state and the subject matter', '中方就台湾问题向美方提出严正交涉', '严正交涉'],
    ['the EU, which is not a state the site tracks', '中方向欧盟提出严正交涉', '严正交涉'],
    ['a company', 'Anthropic发布报告 北京：坚决反对攻击抹黑', '坚决反对'],
    ['a named official when a state is named too', '萧美琴闪电访意欧盟退出论坛 中方严正交涉', '严正交涉'],
    ['a formula that is not in the text', '中方向印度提出交涉', '严正交涉'],
  ])('leaves %s unstated', (_why, text, formula) => {
    expect(formulaTarget(text, formula)).toBeNull();
  });

  it('is deterministic', () => {
    const t = '中方已向日方提出严正交涉';
    expect(formulaTarget(t, '严正交涉')).toBe(formulaTarget(t, '严正交涉'));
  });
});

describe('the state tables', () => {
  it('cover exactly the names and abbreviations the speaker rule knows', () => {
    expect(Object.keys(NAME_ISO).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(ABBR_ISO).sort().join('')).toBe([...ABBR].sort().join(''));
  });

  it('name only states the site has a record of', () => {
    for (const iso of [...Object.values(NAME_ISO), ...Object.values(ABBR_ISO)]) {
      if (iso === 'EU') continue;
      expect(BY_ISO.has(iso), iso).toBe(true);
    }
  });

  it('never map to China', () => {
    expect(Object.values(NAME_ISO)).not.toContain('CHN');
    expect(Object.values(ABBR_ISO)).not.toContain('CHN');
  });
});

describe('where Beijing’s own voice sits', () => {
  it('is the nearest subject before the formula, when it is Beijing’s', () => {
    expect(formulaAnchor('中方已向日方提出严正交涉', '严正交涉')).toEqual({ start: 0, end: 2 });
  });

  it('is a bare ministry’s name', () => {
    expect(formulaAnchor('外交部：严正交涉', '严正交涉')).toEqual({ start: 0, end: 3 });
  });

  it('is nothing when the nearest subject is another party', () => {
    expect(formulaAnchor('印方强烈抗议', '强烈抗议')).toBeNull();
  });

  it('is nothing when the formula is absent or nobody speaks before it', () => {
    expect(formulaAnchor('中方向印度提出交涉', '严正交涉')).toBeNull();
    expect(formulaAnchor('严正交涉', '严正交涉')).toBeNull();
  });
});

describe('against the hand-labelled fixture', () => {
  const rows = TARGET_FIXTURE.map((r) => ({ ...r, got: formulaTarget(`${r.title} ${r.snippet}`, r.formula) }));

  it('never names the wrong state', () => {
    const bad = rows.filter((r) => r.got !== null && r.got !== r.expected).map((r) => `${r.got} (want ${r.expected}): ${r.title}`);
    expect(bad, `wrong target:\n${bad.join('\n')}`).toEqual([]);
  });

  it('never names China', () => {
    expect(rows.filter((r) => r.got === 'CHN')).toEqual([]);
  });

  it('still resolves most of them — a canary, not the bar', () => {
    // The aim is about 22 of 27. A rule that resolves far fewer has stopped working, which
    // would pass "never wrong" trivially by returning null for everything.
    expect(rows.filter((r) => r.got !== null).length).toBeGreaterThanOrEqual(20);
  });

  it('has a hand label for every row', () => {
    expect(rows.length).toBe(27);
  });
});
