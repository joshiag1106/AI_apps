import { describe, it, expect } from 'vitest';
import { isJunkHeadline, rankedForExample } from '@/lib/demo/junk';
import { demoOrigin } from '@/lib/demo/alert';
import { pickBeijing, selectLanguage, selectLadder, selectTrail, selectAlert } from '@/lib/demo/select';
import { art, dot, trailOf, input, richInput } from './fixtures/demo-fixtures';

const CASINO = '众赢国际手机版_体育_8·15日本政要又“拜鬼”，中方严正交涉强烈抗议';
const REAL = '中方强烈谴责日方涉靖国神社消极动向，已向日方提出严正交涉、强烈抗议';

describe('the junk-headline rule', () => {
  it('refuses the casino-prefixed page that republished an August story as a September one', () => {
    expect(isJunkHeadline(CASINO)).toBe(true);
  });

  it('accepts an ordinary headline', () => {
    expect(isJunkHeadline(REAL)).toBe(false);
    expect(isJunkHeadline('Beijing lodges representations with Tokyo')).toBe(false);
  });

  it('refuses each marker on its own', () => {
    for (const w of ['手机版', '_体育_', '官方网站', '娱乐城', '投注', '彩票', '博彩']) {
      expect(isJunkHeadline(`前缀${w}后缀`), w).toBe(true);
    }
  });
});

describe('ranking articles for an example', () => {
  it('drops junk, then prefers primary, then the better tier, then the newest', () => {
    const a1 = art({ isPrimary: false, tier: 1, publishedAt: '2026-09-12T00:00:00.000Z' });
    const a2 = art({ isPrimary: true, tier: 3, publishedAt: '2026-09-01T00:00:00.000Z' });
    const a3 = art({ isPrimary: false, tier: 1, publishedAt: '2026-09-15T00:00:00.000Z' });
    const junk = art({ title: CASINO, isPrimary: true, tier: 1, publishedAt: '2026-09-17T00:00:00.000Z' });
    expect(rankedForExample([a1, junk, a2, a3]).map((a) => a.id)).toEqual([a2.id, a3.id, a1.id]);
  });
});

describe('demoOrigin', () => {
  it('uses the configured origin when there is one', () => {
    expect(demoOrigin({ KAUTILYA_ORIGIN: 'https://reader.example' })).toBe('https://reader.example');
  });

  it('falls back to the placeholder when nothing is configured', () => {
    expect(demoOrigin({})).toBe('https://kautilya.example');
  });

  it('falls back when the configured origin is loopback, which renderDigest refuses', () => {
    expect(demoOrigin({ KAUTILYA_ORIGIN: 'http://localhost:3111' })).toBe('https://kautilya.example');
  });

  it('falls back rather than throwing in production with no origin set', () => {
    expect(demoOrigin({ NODE_ENV: 'production' })).toBe('https://kautilya.example');
  });

  it('falls back on a malformed value', () => {
    expect(demoOrigin({ KAUTILYA_ORIGIN: 'not a url' })).toBe('https://kautilya.example');
  });
});

describe('chapter 2 — language', () => {
  it('picks a Chinese Beijing headline that contains its own formula', () => {
    const d = selectLanguage(richInput())!;
    expect(d).toMatchObject({ ladderZh: '严正交涉', rung: 6, date: '2026-09-10' });
    expect(d.headline).toContain(d.ladderZh);
  });

  it('skips a headline that does not contain the formula — it matched in the snippet, and the highlight would lie', () => {
    const a = art({ title: '外交部就日方涉靖国神社问题表态', ladderZh: '严正交涉' });
    expect(selectLanguage(input({ beijingArticles: [a] }))).toBeNull();
  });

  it('skips an article that is not in Chinese', () => {
    expect(selectLanguage(input({ beijingArticles: [art({ language: 'en' })] }))).toBeNull();
  });

  it('never picks the casino page, even when it is the newest and primary', () => {
    const junk = art({ title: CASINO, isPrimary: true, publishedAt: '2026-09-17T03:08:55.000Z' });
    const real = art({ title: REAL, isPrimary: false, publishedAt: '2026-09-09T10:00:00.000Z' });
    expect(selectLanguage(input({ beijingArticles: [junk, real] }))!.headline).toBe(REAL);
    expect(selectLanguage(input({ beijingArticles: [junk] }))).toBeNull();
  });

  it('returns null with no candidates', () => {
    expect(selectLanguage(input())).toBeNull();
  });
});

describe('chapter 4 — ladder', () => {
  it("uses the same Beijing article as chapter 2, and another party's article with its own rung", () => {
    const i = richInput();
    const d = selectLadder(i)!;
    expect(d.beijing.title).toBe(pickBeijing(i)!.title);
    expect(d.rung).toBe(6);
    expect(d.other).toMatchObject({ rung: 5, date: '2026-09-18' });
  });

  it("needs both a Beijing article and another party's", () => {
    expect(selectLadder(richInput({ otherArticles: [] }))).toBeNull();
    expect(selectLadder(richInput({ beijingArticles: [] }))).toBeNull();
  });

  it("never uses the casino page as the other party's example either", () => {
    const junkOther = art({ title: CASINO, ladderSpeaker: 'other', ladderRung: 5 });
    expect(selectLadder(richInput({ otherArticles: [junkOther] }))).toBeNull();
  });
});

describe('chapter 5 — trail', () => {
  it('passes the trail through when it has a dot', () => {
    const i = richInput();
    expect(selectTrail(i)!.trail).toBe(i.trail);
  });

  it('is null when there is no dot to draw', () => {
    expect(selectTrail(input({ trail: trailOf() }))).toBeNull();
  });
});

describe('chapter 10 — the alert email', () => {
  it("is the real digest for the country Beijing's formula was aimed at, with links on the given origin", () => {
    const a = selectAlert(richInput())!;
    expect(a.label).toBe('Japan');
    expect(a.subject).toBe('Kautilya — Japan moved to rung 6');
    expect(a.text).toContain('https://kautilya.example/events/ev-jp');
  });

  it("shows the earlier rung from the same country's earlier dots — and it is a real one", () => {
    expect(selectAlert(richInput())!.text).toContain('Japan: rung 4 → 6');
  });

  it('shows no earlier rung when there is none, rather than inventing one', () => {
    const a = selectAlert(richInput({ trail: trailOf([{ target: 'JPN', dots: [dot({ day: '2026-09-10', rung: 6 })] }]) }))!;
    expect(a.text).toContain('Japan: rung 6');
    expect(a.text).not.toContain('→');
  });

  it('shows no arrow when an earlier dot is as high or higher — that would read as a fall', () => {
    const a = selectAlert(richInput({ trail: trailOf([{ target: 'JPN', dots: [dot({ day: '2026-09-01', rung: 8 })] }]) }))!;
    expect(a.text).not.toContain('→');
  });

  it('takes the rung from the event, not from the article', () => {
    const base = richInput();
    const events = base.events.map((e) => (e.id === 'ev-jp' ? { ...e, ladderRung: 8 } : e));
    const a = selectAlert({ ...base, events })!;
    expect(a.subject).toBe('Kautilya — Japan moved to rung 8');
    expect(a.text).toContain('Japan: rung 4 → 8');
  });

  it('skips an event that carries no rung', () => {
    const base = richInput();
    const events = base.events.map((e) => (e.id === 'ev-jp' ? { ...e, ladderRung: null } : e));
    expect(selectAlert({ ...base, events })).toBeNull();
  });

  it('skips an article whose event is not in the corpus', () => {
    expect(selectAlert(richInput({ eventIdOf: {} }))).toBeNull();
    expect(selectAlert(richInput({ eventIdOf: { 'bj-1': 'no-such-event' } }))).toBeNull();
  });

  it('skips an article with no stated target', () => {
    const noTarget = art({ id: 'bj-2', ladderTarget: null });
    expect(selectAlert(richInput({ beijingArticles: [noTarget], eventIdOf: { 'bj-2': 'ev-jp' } }))).toBeNull();
  });

  it('never builds the email from the casino page', () => {
    const junk = art({ id: 'bj-3', title: CASINO, isPrimary: true });
    expect(selectAlert(richInput({ beijingArticles: [junk], eventIdOf: { 'bj-3': 'ev-jp' } }))).toBeNull();
  });
});
