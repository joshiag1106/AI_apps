import { describe, it, expect } from 'vitest';
import { ladderTrail, dotPosition, axisTicks, dayLabel, windowDays, TRAIL_DAYS } from '@/lib/verify/trail';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `r${String(n).padStart(4, '0')}`, url: `https://x/trail/${n}`,
    title: `中方就第${n}号事件向日方提出严正交涉并强烈抗议`, outlet: `Outlet ${n}`,
    publishedAt: '2026-08-15T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: false, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: 8, ladderZh: '强烈抗议', ladderEn: 'strong protest',
    ladderSpeaker: 'prc', ladderTarget: 'JPN',
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const OPTS = { since: '2026-06-20T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' };
const day = (d: string, h = 10) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('what counts as a dot', () => {
  it('draws only Beijing’s own formulae', () => {
    const t = ladderTrail([
      art(),
      art({ ladderSpeaker: 'other' }),
      art({ ladderSpeaker: 'unclear' }),
      art({ ladderSpeaker: null }),
      art({ ladderRung: null, ladderZh: null, ladderEn: null }),
    ], OPTS);
    expect(t.dots).toBe(1);
    expect(t.rows[0].dots[0].reports).toBe(1);
  });

  it('is one dot per country per day, at that day’s highest rung', () => {
    const t = ladderTrail([
      art({ ladderRung: 7, ladderZh: '强烈谴责', ladderEn: 'strong condemnation' }),
      art({ ladderRung: 8 }),
      art({ ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'solemn representations' }),
    ], OPTS);
    expect(t.rows).toHaveLength(1);
    const [dot] = t.rows[0].dots;
    expect(t.rows[0].dots).toHaveLength(1);
    expect(dot).toMatchObject({ target: 'JPN', day: '2026-08-15', rung: 8, zh: '强烈抗议', en: 'strong protest', reports: 3 });
  });

  it('is a separate dot for another day, and another row for another country', () => {
    const t = ladderTrail([
      art({ publishedAt: day('2026-08-15') }),
      art({ publishedAt: day('2026-08-16') }),
      art({ publishedAt: day('2026-08-15'), ladderTarget: 'PHL' }),
    ], OPTS);
    expect(t.rows.map((r) => r.target).sort()).toEqual(['JPN', 'PHL']);
    expect(t.rows.find((r) => r.target === 'JPN')!.dots.map((d) => d.day)).toEqual(['2026-08-15', '2026-08-16']);
  });

  it('counts days in UTC', () => {
    const t = ladderTrail([
      art({ publishedAt: '2026-09-10T23:30:00.000Z' }),
      art({ publishedAt: '2026-09-11T00:30:00.000Z' }),
      art({ publishedAt: '2026-09-10T23:30:00-05:00' }), // 04:30 UTC on the 11th
    ], OPTS);
    expect(t.rows[0].dots.map((d) => [d.day, d.reports])).toEqual([['2026-09-10', 1], ['2026-09-11', 2]]);
  });

  it('skips an article whose date cannot be read', () => {
    expect(ladderTrail([art({ publishedAt: 'not a date' })], OPTS).dots).toBe(0);
  });
});

describe('reprints', () => {
  const same = '中方强烈谴责日方涉靖国神社消极动向，已向日方提出严正交涉';

  it('count once as originals but every time as reports', () => {
    const t = ladderTrail([art({ title: same }), art({ title: same }), art({ title: '外交部：强烈抗议日方涉靖国神社的一系列消极动向' })], OPTS);
    const [dot] = t.rows[0].dots;
    expect(dot.reports).toBe(3);
    expect(dot.originals).toBe(2);
    expect(dot.evidence).toHaveLength(2);
  });

  it('carry one headline per original as evidence, highest rung first', () => {
    const t = ladderTrail([
      art({ title: '外交部：强烈谴责日方涉靖国神社消极动向', ladderRung: 7 }),
      art({ title: '我使馆发言人：中方已向日方提出严正交涉、强烈抗议', ladderRung: 8 }),
    ], OPTS);
    expect(t.rows[0].dots[0].evidence.map((e) => e.rung)).toEqual([8, 7]);
  });
});

describe('the new-high marker', () => {
  const rungs = (rs: number[]) => rs.map((r, i) => art({ ladderRung: r, publishedAt: day(`2026-08-${String(10 + i).padStart(2, '0')}`) }));

  it('marks a rung above every earlier dot in the row, and never the first dot', () => {
    const t = ladderTrail(rungs([4, 8, 6, 8, 9]), OPTS);
    expect(t.rows[0].dots.map((d) => d.newHigh)).toEqual([false, true, false, false, true]);
  });

  it('does not mark a repeat of the same rung', () => {
    expect(ladderTrail(rungs([6, 6]), OPTS).rows[0].dots.map((d) => d.newHigh)).toEqual([false, false]);
  });

  it('is judged within each row, not across rows', () => {
    const t = ladderTrail([...rungs([8, 4]), art({ ladderTarget: 'PHL', ladderRung: 4, publishedAt: day('2026-08-20') })], OPTS);
    expect(t.rows.find((r) => r.target === 'PHL')!.dots[0].newHigh).toBe(false);
  });
});

describe('a formula whose target the headline does not state', () => {
  it('goes in its own list, never in a row, and is never a new high', () => {
    const t = ladderTrail([art({ ladderTarget: null, ladderRung: 4 }), art({ ladderTarget: null, ladderRung: 9, publishedAt: day('2026-08-20') })], OPTS);
    expect(t.rows).toEqual([]);
    expect(t.notStated.map((d) => [d.target, d.newHigh])).toEqual([[null, false], [null, false]]);
    expect(t.dots).toBe(2);
  });
});

describe('the order of the rows', () => {
  it('puts the country with the most recent dot first, then the higher rung, then the code', () => {
    const t = ladderTrail([
      art({ ladderTarget: 'KOR', publishedAt: day('2026-09-03'), ladderRung: 8 }),
      art({ ladderTarget: 'JPN', publishedAt: day('2026-09-09'), ladderRung: 8 }),
      art({ ladderTarget: 'USA', publishedAt: day('2026-09-09'), ladderRung: 6 }),
      art({ ladderTarget: 'PHL', publishedAt: day('2026-09-09'), ladderRung: 6 }),
    ], OPTS);
    expect(t.rows.map((r) => r.target)).toEqual(['JPN', 'PHL', 'USA', 'KOR']);
  });

  it('is the same whatever order the articles arrive in', () => {
    const list = [art({ publishedAt: day('2026-08-15') }), art({ ladderTarget: 'PHL', publishedAt: day('2026-07-21'), ladderRung: 4 }), art({ publishedAt: day('2026-08-16') })];
    expect(JSON.stringify(ladderTrail([...list].reverse(), OPTS))).toBe(JSON.stringify(ladderTrail(list, OPTS)));
  });
});

describe('the window', () => {
  it('starts at the corpus’s first day and ends today', () => {
    const t = ladderTrail([art()], OPTS);
    expect(t.since).toBe('2026-06-20');
    expect(t.until).toBe('2026-09-17');
    expect(t.capped).toBe(false);
  });

  it('is capped at 90 days, says so, and leaves out anything older', () => {
    const t = ladderTrail([art({ publishedAt: day('2026-05-01') }), art({ publishedAt: day('2026-08-01') })], { since: '2026-04-01T00:00:00.000Z', until: '2026-09-17T12:00:00.000Z' });
    expect(TRAIL_DAYS).toBe(90);
    expect(t.since).toBe('2026-06-19');
    // `since` is then the edge of the window, not when the corpus began — the copy must not
    // claim "collecting since" a date the corpus in fact predates.
    expect(t.capped).toBe(true);
    expect(t.dots).toBe(1);
  });

  it('leaves out anything before the corpus began or after today', () => {
    expect(ladderTrail([art({ publishedAt: day('2026-06-01') }), art({ publishedAt: day('2026-09-30') })], OPTS).dots).toBe(0);
  });

  it('is empty, not broken, with no articles', () => {
    expect(ladderTrail([], OPTS)).toMatchObject({ rows: [], notStated: [], dots: 0, since: '2026-06-20' });
  });
});

describe('linking a dot to its event', () => {
  it('uses the event carrying the day’s highest rung', () => {
    const low = art({ ladderRung: 4 });
    const high = art({ ladderRung: 8 });
    const eventOf = new Map([[low.id, 'ev-low'], [high.id, 'ev-high']]);
    expect(ladderTrail([low, high], { ...OPTS, eventOf }).rows[0].dots[0].eventId).toBe('ev-high');
  });

  it('is null when the article belongs to no event the page knows', () => {
    expect(ladderTrail([art()], OPTS).rows[0].dots[0].eventId).toBeNull();
  });
});

describe('placing a dot on the axis', () => {
  const trail = { since: '2026-06-20', until: '2026-09-17' };

  it('puts the first day near the left and the last near the right', () => {
    expect(dotPosition('2026-06-20', trail)).toBeGreaterThan(0);
    expect(dotPosition('2026-06-20', trail)).toBeLessThan(0.02);
    expect(dotPosition('2026-09-17', trail)).toBeGreaterThan(0.98);
    expect(dotPosition('2026-09-17', trail)).toBeLessThan(1);
  });

  it('is monotonic and clamped', () => {
    expect(dotPosition('2026-08-01', trail)).toBeLessThan(dotPosition('2026-08-02', trail));
    expect(dotPosition('2020-01-01', trail)).toBe(0);
    expect(dotPosition('2030-01-01', trail)).toBe(1);
  });

  it('counts the days the axis spans, both ends included', () => {
    expect(windowDays({ since: '2026-06-20', until: '2026-09-17' })).toBe(90);
    expect(windowDays({ since: '2026-09-17', until: '2026-09-17' })).toBe(1);
    expect(windowDays({ since: '2026-09-17', until: '2026-09-20' })).toBe(4);
  });

  it('writes a day the same way on every machine, with September as "Sep"', () => {
    // Not Intl: en-GB says "Sept" or "Sep" depending on the ICU build, and a chart must not
    // read differently on the server than on the machine it was checked on.
    expect(dayLabel('2026-09-05')).toBe('5 Sep');
    expect(dayLabel('2026-01-31')).toBe('31 Jan');
    expect(dayLabel('2026-12-01')).toBe('1 Dec');
  });

  it('labels the axis from the first day to the last', () => {
    const ticks = axisTicks(trail, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]).toEqual({ at: 0, label: '20 Jun' });
    expect(ticks[4]).toEqual({ at: 1, label: '17 Sep' });
  });
});
