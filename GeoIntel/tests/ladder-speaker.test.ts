import { describe, it, expect } from 'vitest';
import { formulaSpeaker } from '@/lib/lang/speaker';
import { LADDER_FIXTURE, LIVE_FIXTURE, type Fixture } from './fixtures/ladder-speakers';

/**
 * The ladder detector matches formula text wherever it appears, so a hit says a formula is
 * PRESENT, not that Beijing spoke it. About two in five hits in the real corpus were other
 * governments. These tests pin how the speaker is told from the grammar of the headline — the
 * nearest subject before the formula, ignoring who is being addressed — and, above all, the two
 * mistakes that matter: calling another party Beijing, and hiding a real Beijing formula.
 */
describe('Beijing speaking', () => {
  it('reads 中方 as the subject', () => {
    expect(formulaSpeaker('中方已向日方提出严正交涉', '严正交涉')).toBe('prc');
  });

  it('reads an embassy as Beijing’s when it is China’s', () => {
    expect(formulaSpeaker('中国驻日本大使馆就日方涉南海问题的言行提出严正交涉', '严正交涉')).toBe('prc');
    expect(formulaSpeaker('我使馆发言人：已提出严正交涉', '严正交涉')).toBe('prc');
  });

  it('reads a bare ministry before a colon as Beijing’s', () => {
    expect(formulaSpeaker('外交部：坚决反对美方的做法', '坚决反对')).toBe('prc');
  });

  it('reads a response as Beijing’s, not the party it answers', () => {
    // 美方 comes first, but the nearest subject before the formula is 中方.
    expect(formulaSpeaker('美方声称遭到攻击，中方驳斥：坚决反对', '坚决反对')).toBe('prc');
  });

  it('counts a mutual exchange as Beijing speaking, since it is one of the parties', () => {
    expect(formulaSpeaker('中国菲律宾互相传召对方大使“严正交涉”', '严正交涉')).toBe('prc');
  });

  it('reads 北京： as Beijing', () => {
    expect(formulaSpeaker('美国发布报告 北京：坚决反对抹黑', '坚决反对')).toBe('prc');
  });

  it('reads a possessive as the speaker: "遭到中国的坚决反对" is China’s opposition', () => {
    // Found by reading the audit report: a VOA piece on Taiwan's vice president opens with her,
    // but the formula in its snippet is China's — "her trip drew China's firm opposition".
    expect(formulaSpeaker('萧美琴闪电出访意大利，遭到中国的坚决反对', '坚决反对')).toBe('prc');
  });
});

describe('another party speaking', () => {
  it('reads a named state as the subject', () => {
    expect(formulaSpeaker('越南坚决反对在黄沙群岛开展非法活动', '坚决反对')).toBe('other');
    expect(formulaSpeaker('法国向伊朗提出严正交涉', '严正交涉')).toBe('other');
  });

  it('reads 印方 / 俄方 as the subject', () => {
    expect(formulaSpeaker('印方强烈不满，紧急召见巴方外交人员', '强烈不满')).toBe('other');
    expect(formulaSpeaker('俄方就部署问题向日方提出交涉', '交涉')).toBe('other');
  });

  it('reads a country-plus-ministry as that country’s, not Beijing’s', () => {
    expect(formulaSpeaker('伊朗外交部：若通过决议，伊将回应', '回应')).not.toBe('prc');
    expect(formulaSpeaker('俄外交部：将作出回应并严正交涉', '严正交涉')).toBe('other');
  });

  it('ignores who is being ADDRESSED — a target after 向 / 就 / 准 is not the speaker', () => {
    expect(formulaSpeaker('巴基斯坦向美方提出严正交涉', '严正交涉')).toBe('other');
  });

  it('does not take a marker AFTER the formula as its speaker', () => {
    // India lodged representations WITH China: 中方 is the object, and it comes after.
    expect(formulaSpeaker('印方交涉中方，对等才是解决前提', '交涉')).toBe('other');
  });

  it('reads a paired abbreviation as the parties', () => {
    expect(formulaSpeaker('印巴军舰相撞互招外交官强烈抗议', '强烈抗议')).toBe('other');
  });

  it('reads a possessive the same way for another party', () => {
    expect(formulaSpeaker('访问遭到越南的强烈抗议', '强烈抗议')).toBe('other');
  });

  it('does not treat a possessive that is NOT beside the formula as its speaker', () => {
    // "中国的芯片" modifies a noun; it is not the one protesting. Only a possessive standing
    // directly before the formula — "…的坚决反对" — is the formula's owner.
    expect(formulaSpeaker('中国的芯片遭到越南强烈抗议', '强烈抗议')).toBe('other');
  });
});

describe('what is not claimed', () => {
  it('is unclear when nothing before the formula names a speaker', () => {
    expect(formulaSpeaker('严正交涉、强烈抗议！日本政要参拜', '强烈抗议')).toBe('unclear');
  });

  it('is unclear when the formula is not in the text', () => {
    expect(formulaSpeaker('一则没有任何措辞的标题', '严正交涉')).toBe('unclear');
  });

  it('is unclear for a bare ministry that follows another state’s name', () => {
    // 国防部 after 菲律宾军方 is the Philippines' ministry; after 美国 it may be China's answer.
    // Surface grammar cannot tell which, so it does not guess.
    expect(formulaSpeaker('菲律宾军方直接摊牌！国防部警告：不拖走，后果自负', '后果自负')).toBe('unclear');
  });

  it('does not take a country inside a longer noun as the subject', () => {
    // 韩国光州双年展 is "the Korean Gwangju Biennale", not Korea speaking.
    expect(formulaSpeaker('中方策展团队因韩国光州双年展涉台错误做法宣布撤展表达强烈抗议', '强烈抗议')).toBe('prc');
  });
});

describe('deterministic', () => {
  it('gives the same answer every time', () => {
    const t = '美方声称遭到攻击，中方驳斥：坚决反对';
    expect(formulaSpeaker(t, '坚决反对')).toBe(formulaSpeaker(t, '坚决反对'));
  });
});

const run = (rows: Fixture[]) => rows.map((r) => ({ ...r, got: formulaSpeaker(`${r.title} ${r.snippet}`, r.formula) }));

/**
 * The two lines that matter. A false Beijing is the defect this change exists to remove; a false
 * "other" would silently hide a real Beijing formula. "Unclear" is allowed either way — it costs
 * recall, which is measured below, not correctness.
 *
 * The first fixture is the ENTIRE hit set the rules were written against, so passing it proves
 * less than it seems. The second is the only sample they have not seen.
 */
describe('against the hand-labelled corpus', () => {
  const rows = run(LADDER_FIXTURE);

  it('has all 47 hits and the labels it was built with', () => {
    expect(rows).toHaveLength(47);
    // 29, not the 28 first counted: the VOA report on Xiao Meiqin's Italy trip was labelled from its
    // headline alone, and its snippet says China opposed it and lodged representations — Beijing.
    // The audit report found it; the label was the error, and so the fixture gate had passed.
    expect(rows.filter((r) => r.expected === 'prc')).toHaveLength(29);
  });

  it('never calls another party Beijing', () => {
    const bad = rows.filter((r) => r.expected !== 'prc' && r.got === 'prc').map((r) => `${r.expected} -> prc: ${r.title}`);
    expect(bad, `false Beijing:\n${bad.join('\n')}`).toEqual([]);
  });

  it('never calls Beijing another party', () => {
    const bad = rows.filter((r) => r.expected === 'prc' && r.got === 'other').map((r) => `prc -> other: ${r.title}`);
    expect(bad, `real Beijing hidden:\n${bad.join('\n')}`).toEqual([]);
  });

  it('recognises most of Beijing’s own formulae rather than giving up', () => {
    const prc = rows.filter((r) => r.expected === 'prc');
    const got = prc.filter((r) => r.got === 'prc').length;
    expect(got / prc.length, `${got} of ${prc.length} Beijing formulae recognised`).toBeGreaterThanOrEqual(0.7);
  });
});

describe('against headlines the rules were not written against', () => {
  const rows = run(LIVE_FIXTURE);

  it('is a small sample, and says so', () => {
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('never calls another party Beijing, or Beijing another party', () => {
    expect(rows.filter((r) => r.expected !== 'prc' && r.got === 'prc').map((r) => r.title)).toEqual([]);
    expect(rows.filter((r) => r.expected === 'prc' && r.got === 'other').map((r) => r.title)).toEqual([]);
  });
});
