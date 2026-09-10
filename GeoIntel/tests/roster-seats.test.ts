// tests/roster-seats.test.ts
//
// The seat-holder detector: does the corpus put the person this roster claims into the
// office it claims for them?
//
// This exists because three of the last five roster findings were invisible to every flag
// the audit had. FORMER and DISMISSED both look for a WORD marking a seat as ended, and a
// superseded seat prints no such word — an outlet just reports the new holder's name as
// though it always had. Min Aung Hlaing, Starmer/Burnham and Kushner were all found by
// reading, not flagging.
//
// Chinese headline copy makes that mechanisable in a way no other language here does,
// because it writes <country><office><name> as one adjacent run: 日本首相高市早苗. Resolve
// the country and office to the seat data/people.ts claims, and the name is either the
// holder's or it is news.
//
// Every fixture below is a REAL sentence from the corpus, not a constructed one. That is
// deliberate: the two exclusions this detector needs (a modifier between country and
// office, and a verb where a name should be) were both discovered by measuring the corpus
// after a first design that would have missed them.
//
// Mutation notes — each test pins a specific way the implementation could break:
// - "reads a name that follows the office": deleting the run capture.
// - "sees through a modifier": dropping MODIFIERS, which silently loses 英国新首相伯纳姆 —
//   the exact headline that motivated this detector.
// - "sees through 政府": same, for 越南政府总理黎明兴.
// - "ignores the presidential office building": dropping 府 from NOT_A_NAME_START.
// - "ignores a verb where a name would be": dropping the rest of NOT_A_NAME_START.
// - "confirms the listed holder": inverting the confirmed/mismatch branches.
// - "flags a seat whose holder the corpus does not name there": the same, other way up.
// - "flags a rendering the roster does not carry": deleting 安华 from Anwar's aliases,
//   which is the bug this detector found on 2026-09-10.
// - "reports a seat no roster entry holds": collapsing unclaimed into mismatch.
// - "every role named in SEATS still exists": renaming a role in data/people.ts.
// - "a vice president does not satisfy 总统": switching role matching to substring.
import { describe, it, expect } from 'vitest';
import { SEATS, MODIFIERS, findSeatMentions, classifySeat } from '../scripts/roster-seats';
import { PEOPLE } from '@/data/people';
import type { Person } from '@/data/people';

/** A minimal roster, so a test says what it depends on instead of inheriting 120 entries. */
const person = (over: Partial<Person> & Pick<Person, 'id' | 'role' | 'home'>): Person => ({
  name: over.id,
  aliases: [],
  ...over,
});

describe('finding a seat mention', () => {
  it('reads a name that follows the office', () => {
    const [m] = findSeatMentions('针对日本首相高市早苗在15日举行的“全国战殁者追悼仪式”');
    expect(m.iso).toBe('JPN');
    expect(m.office).toBe('首相');
    expect(m.run.startsWith('高市早苗')).toBe(true);
  });

  it('sees through a modifier between the country and the office', () => {
    // 会见英国新首相伯纳姆 — the headline the whole detector exists for. A design matching
    // only adjacent <country><office> would miss it on the 新.
    const [m] = findSeatMentions('挂毯》展览的开幕式，会见英国新首相伯纳姆 法国总统马克龙将于下周三');
    expect(m.iso).toBe('GBR');
    expect(m.office).toBe('首相');
    expect(m.run.startsWith('伯纳姆')).toBe(true);
  });

  it('sees through 政府 between the country and the office', () => {
    const [m] = findSeatMentions('越南政府总理黎明兴会见印度外交部国务部长');
    expect(m.iso).toBe('VNM');
    expect(m.office).toBe('总理');
    expect(m.run.startsWith('黎明兴')).toBe(true);
  });

  it('ignores the presidential office building, which is not a person', () => {
    // 总统府 is the office/residence. Without this the detector flags every seat whose
    // holder is not named beside their own government's press office.
    expect(findSeatMentions('韩国总统府周五表示，正考虑为保障霍尔木兹海峡航行安全')).toEqual([]);
  });

  it('ignores a verb where a name would be', () => {
    expect(findSeatMentions('德语媒体：德国总理的中国困境 对北京采取更强硬措施？')).toEqual([]);
    expect(findSeatMentions('习近平与英国首相通话：呼吁中英求同存异')).toEqual([]);
  });

  it('ignores an office with nothing after it', () => {
    expect(findSeatMentions('会谈中提到日本首相')).toEqual([]);
  });
});

describe('the noise the first live run turned up', () => {
  // Every string here is a real false positive from the detector's first run against the
  // corpus on 2026-09-10. They are kept as fixtures because the exclusion lists are the
  // fragile part of this design: each one is a character or compound that a first pass
  // reasoned its way past and the corpus produced anyway.

  it('ignores a verb where a name would be', () => {
    // 涨薪 (pay rise), 重申 (reiterate), 举行 (hold), 任期 (term of office).
    expect(findSeatMentions('新加坡总理涨薪64%，年收入超1900万人民币')).toEqual([]);
    expect(findSeatMentions('加拿大总理重申应对美国贸易战计划')).toEqual([]);
    expect(findSeatMentions('日本外相与伊朗外长举行电话会谈')).toEqual([]);
    expect(findSeatMentions('打破意大利政府总理任期最长记录')).toEqual([]);
  });

  it('ignores a compound office that merely starts with a seat word', () => {
    // 总统特使 is a presidential ENVOY, not a president. This one cannot be fixed by
    // excluding a leading character: 特 opens 特朗普, so banning it would silence Trump.
    expect(findSeatMentions('继莫斯科之后 两位美国总统特使首次到访乌克兰')).toEqual([]);
  });

  it('still reads the name it was built for', () => {
    // The guard against over-correcting: the exclusions above must not silence a real name.
    expect(findSeatMentions('美国总统特朗普表示')[0]?.run.startsWith('特朗普')).toBe(true);
  });
});

describe('classifying a seat against the roster', () => {
  const text = '针对日本首相高市早苗在15日举行的“全国战殁者追悼仪式”';

  it('confirms the listed holder when the corpus names them in their own seat', () => {
    const roster = [person({ id: 'takaichi', role: 'Prime Minister', home: 'JPN', aliases: ['高市早苗'] })];
    const [m] = findSeatMentions(text);
    const v = classifySeat(text, m, roster);
    expect(v.verdict).toBe('confirmed');
  });

  it('flags a seat whose holder the corpus does not name there', () => {
    // Starmer held this seat in the roster while 8 articles put Burnham in it.
    const line = '会见英国新首相伯纳姆 法国总统马克龙将于下周三';
    const roster = [person({ id: 'starmer', role: 'Prime Minister', home: 'GBR', aliases: ['斯塔默'] })];
    const [m] = findSeatMentions(line);
    const v = classifySeat(line, m, roster);
    expect(v.verdict).toBe('mismatch');
    expect(v.verdict === 'mismatch' && v.holder.id).toBe('starmer');
  });

  it('flags a rendering the roster does not carry', () => {
    // Anwar was invisible in 马来西亚首相安华 because his only Chinese alias was 安瓦尔.
    // Pins the 2026-09-10 fix: drop 安华 from the roster and this returns to a mismatch.
    const line = '马来西亚首相安华打破该国政治惯例，在最近一次接受半岛';
    const [m] = findSeatMentions(line);
    const stale = [person({ id: 'anwar', role: 'Prime Minister', home: 'MYS', aliases: ['安瓦尔'] })];
    expect(classifySeat(line, m, stale).verdict).toBe('mismatch');
    const fixed = [person({ id: 'anwar', role: 'Prime Minister', home: 'MYS', aliases: ['安瓦尔', '安华'] })];
    expect(classifySeat(line, m, fixed).verdict).toBe('confirmed');
  });

  it('reports a seat no roster entry holds as unclaimed, not as a mismatch', () => {
    // The two say different things to a reviewer: a mismatch means the wrong person is
    // listed, unclaimed means nobody is — which is how Min Aung Hlaing's presidency and
    // Vietnam's 黎明兴 both look from inside the corpus.
    const line = '越南政府总理黎明兴会见印度外交部国务部长';
    const [m] = findSeatMentions(line);
    const roster = [person({ id: 'to-lam', role: 'Communist Party General Secretary', home: 'VNM', aliases: ['苏林'] })];
    expect(classifySeat(line, m, roster).verdict).toBe('unclaimed');
  });

  it('does not let a vice president satisfy 总统', () => {
    // 'Vice President' contains 'President'. Substring role matching would confirm the
    // wrong seat and hide a vacant presidency.
    const line = '委内瑞拉总统罗德里格斯表示';
    const roster = [person({ id: 'delcy', role: 'Vice President', home: 'VEN', aliases: ['罗德里格斯'] })];
    const [m] = findSeatMentions(line);
    expect(m).toBeDefined();
    expect(classifySeat(line, m, roster).verdict).toBe('unclaimed');
  });
});

describe('the seat map itself', () => {
  it('every role it names still exists in the roster', () => {
    // SEATS hard-codes role strings. Rename one in data/people.ts and the detector goes
    // quiet rather than loud — it stops resolving that seat and reports nothing.
    const live = new Set(PEOPLE.map((p) => p.role));
    for (const seat of SEATS) {
      for (const role of seat.roles) {
        expect(live.has(role), `${seat.office} -> "${role}" is no longer a role in data/people.ts`).toBe(true);
      }
    }
  });

  it('maps 总理 to the three offices outlets use it for', () => {
    // Carney is a Prime Minister, Li Qiang a Premier and Merz a Chancellor, and Chinese
    // copy writes 总理 for all three. Miss one and that state's seat never resolves.
    const zongli = SEATS.find((s) => s.office === '总理');
    expect(zongli?.roles).toEqual(expect.arrayContaining(['Prime Minister', 'Premier', 'Chancellor']));
  });

  it('carries the modifiers the corpus actually prints', () => {
    expect(MODIFIERS).toEqual(expect.arrayContaining(['新', '政府']));
  });
});
