import type { Article, GeoEvent } from '@/lib/types';
import type { Corpus } from '@/lib/forecast/types';

let n = 0;

export const T = (iso: string) => Date.parse(iso);

export function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `fa${n}`, url: `https://example.test/a/${n}`, title: `Report ${n}`, outlet: `Outlet ${n}`,
    publishedAt: '2026-09-28T06:00:00.000Z', snippet: '', imageUrl: null, language: 'en',
    beatId: null, localeKey: null, sourceCountry: 'IND', ownership: 'independent', tier: 2,
    isPrimary: false, actors: ['CHN', 'IND'], people: [], hotspots: [], domain: 'Military',
    escalation: 20, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    ladderSpeaker: null, ladderTarget: null, glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

export function ev(p: Partial<GeoEvent> = {}): GeoEvent {
  n += 1;
  return {
    id: `fe${n}`, title: `Event ${n}`, summary: '',
    firstSeen: '2026-09-28T06:00:00.000Z', lastSeen: '2026-09-28T06:00:00.000Z',
    actors: ['CHN', 'IND'], people: [], hotspots: [], domain: 'Military', escalation: 20, confidence: 40,
    signals: [], flags: [], articleIds: [], languages: ['en'], countries: ['IND'], imageUrl: null, videoId: null,
    ladderRung: null, ladderZh: null, ladderEn: null, ...p,
  };
}

/** A qualifying incident for `a`–`b` first seen at `iso`, with its two reports from two outlets. */
export function incident(a: string, b: string, iso: string, p: Partial<GeoEvent> = {}): { event: GeoEvent; articles: Article[] } {
  const r1 = art({ actors: [a, b], publishedAt: iso, outlet: 'Wire A' });
  const r2 = art({ actors: [a, b], publishedAt: iso, outlet: 'Wire B' });
  return { event: ev({ actors: [a, b], firstSeen: iso, lastSeen: iso, articleIds: [r1.id, r2.id], ...p }), articles: [r1, r2] };
}

export function corpusOf(events: GeoEvent[], articles: Article[]): Corpus {
  return { events, articles, outlets: new Map(articles.map((a) => [a.id, a.outlet])) };
}
