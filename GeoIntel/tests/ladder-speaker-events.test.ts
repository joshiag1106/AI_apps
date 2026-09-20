import { describe, it, expect } from 'vitest';
import { clusterArticles } from '@/lib/verify/cluster';
import { detectJumps } from '@/lib/alerts/detect';
import type { Article } from '@/lib/types';
import type { WatchItem } from '@/lib/watchlist/store';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `e${String(n).padStart(4, '0')}`, url: `https://x/ev/${n}`,
    title: 'India and Pakistan warships collide in the Arabian Sea', outlet: `Outlet ${n}`,
    publishedAt: '2026-09-19T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'independent', tier: 1,
    isPrimary: false, actors: ['IND', 'PAK'], people: [], hotspots: [], domain: 'Military',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const rung = (r: number, speaker?: Article['ladderSpeaker']) =>
  ({ ladderRung: r, ladderZh: '强烈抗议', ladderEn: 'strong protest', ...(speaker !== undefined ? { ladderSpeaker: speaker } : {}) });
const country = (id: string): WatchItem => ({ kind: 'country', id, label: id });
const eventOf = (arts: Article[]) => {
  const events = clusterArticles(arts);
  expect(events, 'the articles should form one event').toHaveLength(1);
  return events[0];
};

/**
 * An event's ladder is BEIJING's. The detector matches formula text whatever the speaker, and
 * about two in five hits in the real corpus were other governments; every surface that reads an
 * event's ladder says "PRC" — the board's stat, China Watch, the alert emails. Taking the ladder
 * only from articles where Beijing is the speaker fixes all of them at the one place events are
 * built, without touching their own code.
 */
describe('an event’s ladder', () => {
  it('comes from Beijing’s own formulae', () => {
    const e = eventOf([art(rung(4, 'prc')), art(rung(8, 'other'))]);
    // The higher rung is another party's, so it does not count.
    expect(e.ladderRung).toBe(4);
  });

  it('is empty when every formula in the event is another party’s', () => {
    const e = eventOf([art(rung(8, 'other')), art(rung(5, 'other'))]);
    expect(e.ladderRung).toBeNull();
    expect(e.ladderZh).toBeNull();
    expect(e.ladderEn).toBeNull();
  });

  it('is empty when the speaker is unclear', () => {
    expect(eventOf([art(rung(8, 'unclear'))]).ladderRung).toBeNull();
  });

  it('is empty for a row stored before speakers existed, rather than over-claiming', () => {
    expect(eventOf([art(rung(8))]).ladderRung).toBeNull();
  });

  it('takes the highest of Beijing’s own', () => {
    const e = eventOf([art(rung(4, 'prc')), art(rung(8, 'prc')), art(rung(6, 'prc'))]);
    expect(e.ladderRung).toBe(8);
  });
});

describe('alerts follow', () => {
  // The first alert email ever sent was "IND — PAK moved to rung 8": an India-Pakistan collision
  // with nothing to do with Beijing. This is that case.
  it('do not fire for another government’s formula', () => {
    const e = eventOf([art(rung(8, 'other'))]);
    expect(detectJumps([country('IND')], [e], new Map())).toEqual([]);
  });

  it('still fire for Beijing’s', () => {
    const e = eventOf([art({ ...rung(8, 'prc'), actors: ['CHN', 'IND'], title: 'China lodges solemn representations with India over the border' })]);
    const jumps = detectJumps([country('IND')], [e], new Map());
    expect(jumps).toHaveLength(1);
    expect(jumps[0].rung).toBe(8);
  });
});
