import type { Article, GeoEvent } from '@/lib/types';
import type { BoardData, DemoInput, Fallbacks } from '@/lib/demo/types';
import type { Trail, TrailDot } from '@/lib/verify/trail';
import type { BeatLens, LensColumn } from '@/lib/lens/compare';

let n = 0;

export function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `d${String(n).padStart(4, '0')}`, url: `https://x/demo/${n}`,
    title: `中方就日方涉靖国神社消极动向提出严正交涉 第${n}号`, outlet: `Outlet ${n}`,
    publishedAt: '2026-09-10T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: false, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations',
    ladderSpeaker: 'prc', ladderTarget: 'JPN',
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

export function evt(p: Partial<GeoEvent> = {}): GeoEvent {
  n += 1;
  return {
    id: `e${String(n).padStart(4, '0')}`, title: `Event ${n}`, summary: '',
    firstSeen: '2026-09-10T00:00:00.000Z', lastSeen: '2026-09-15T00:00:00.000Z',
    actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 30, confidence: 70, signals: [], flags: [], articleIds: [],
    languages: ['zh'], countries: ['CHN'], imageUrl: null, videoId: null,
    ladderRung: null, ladderZh: null, ladderEn: null, ...p,
  };
}

export function dot(p: Partial<TrailDot> = {}): TrailDot {
  return {
    key: 'JPN:2026-09-10', target: 'JPN', day: '2026-09-10', rung: 4, zh: '严正交涉',
    en: 'makes solemn representations', reports: 1, originals: 1, newHigh: false,
    eventId: null, evidence: [], ...p,
  };
}

export function trailOf(rows: { target: string; dots: TrailDot[] }[] = []): Trail {
  return {
    since: '2026-06-22', until: '2026-09-20', capped: false, rows, notStated: [],
    dots: rows.reduce((s, r) => s + r.dots.length, 0),
  };
}

export const NAMES = { CHN: 'China', JPN: 'Japan', PHL: 'Philippines', IND: 'India', USA: 'United States' };

export const BOARD: BoardData = {
  shapes: [],
  data: [{ iso: 'CHN', composite: 60, eventCount: 12, name: 'China' }],
  markers: [],
  stats: { articles: 1000, countries: 40, languages: 6, events: 300 },
};

/** A minimal input: 25 events (not thin) and nothing else. Selectors under test get what they need added. */
export function input(p: Partial<DemoInput> = {}): DemoInput {
  return {
    events: Array.from({ length: 25 }, () => evt()),
    now: Date.parse('2026-09-20T12:00:00.000Z'),
    lastIngest: '2026-09-20T11:46:00.000Z',
    origin: 'https://kautilya.example',
    claims: { enforced: false, mode: 'closed', freeLimit: 5 },
    names: NAMES, board: BOARD, risks: [], dyads: [], trail: trailOf(),
    beijingArticles: [], otherArticles: [], eventIdOf: {}, eventCandidates: [], lens: [], ...p,
  };
}

const lensColumn = (language: string, military: number): LensColumn => ({
  language, articles: 200, outlets: 40, classified: 100,
  asked: [{ q: language === 'zh' ? '印巴冲突' : 'भारत पाकिस्तान', en: 'India Pakistan conflict' }],
  framing: [{ key: 'Military', count: military, share: military / 100 }, { key: 'Diplomatic', count: 100 - military, share: (100 - military) / 100 }],
  others: [],
  latest: [{ id: `lens-${language}`, title: language === 'zh' ? '印巴边境局势紧张' : 'सीमा पर तनाव', titleEn: null, outlet: `${language} outlet`, publishedAt: '2026-09-18T00:00:00.000Z', eventId: null }],
});

/** A Language Lens topic whose two languages differ sharply, as lib/lens/compare would report it. */
export function lensTopic(p: Partial<BeatLens> = {}): BeatLens {
  return {
    id: 'ind-pak', label: 'India–Pakistan', dyad: ['IND', 'PAK'],
    since: '2026-06-20T00:00:00.000Z', until: '2026-09-20T00:00:00.000Z',
    columns: [lensColumn('zh', 95), lensColumn('hi', 25)],
    sharpest: { domain: 'Military', high: { language: 'zh', share: 0.95 }, low: { language: 'hi', share: 0.25 }, z: 10 },
    ...p,
  };
}

const day = (i: number) => new Date(Date.parse('2026-06-23T00:00:00.000Z') + i * 86_400_000).toISOString().slice(0, 10);

/** An input every selector can succeed on. */
export function richInput(p: Partial<DemoInput> = {}): DemoInput {
  const jpEvent = evt({ id: 'ev-jp', title: 'Beijing lodges representations with Tokyo', ladderRung: 6, ladderZh: '坚决反对', ladderEn: 'resolute opposition' });
  const beijing = art({ id: 'bj-1', ladderRung: 6, ladderZh: '严正交涉', isPrimary: true, publishedAt: '2026-09-10T10:00:00.000Z' });
  const other = art({
    id: 'ot-1', title: '印巴军舰相撞，印方强烈不满，紧急召见巴方外交人员', ladderRung: 5, ladderZh: '强烈不满',
    ladderEn: 'strong dissatisfaction', ladderSpeaker: 'other', ladderTarget: null,
    publishedAt: '2026-09-18T10:00:00.000Z',
  });
  const same = 'Beijing lodges solemn representations with Tokyo over shrine visits';
  const dyadEvents = ['2026-09-15', '2026-09-12', '2026-09-08'].map((d) => evt({ lastSeen: `${d}T00:00:00.000Z` }));
  return input({
    events: [jpEvent, ...Array.from({ length: 24 }, () => evt())],
    risks: [{ iso: 'CHN', composite: 60, vectors: { Military: 50, Economic: 40, Cyber: 30, Internal: 20, Diplomatic: 60, Energy: 10 } }],
    dyads: [{ a: 'CHN', b: 'JPN', score: 55, series: Array.from({ length: 90 }, (_, i) => ({ date: day(i), value: i % 7 })), topEvents: dyadEvents }],
    trail: trailOf([{ target: 'JPN', dots: [dot({ day: '2026-09-01', rung: 4 }), dot({ day: '2026-09-10', rung: 6 })] }]),
    beijingArticles: [beijing], otherArticles: [other],
    eventIdOf: { 'bj-1': 'ev-jp' },
    lens: [lensTopic()],
    eventCandidates: [{
      event: evt({ title: 'Tokyo shrine dispute', confidence: 82 }),
      articles: [
        art({ language: 'en', title: same, outlet: 'Outlet A', ladderRung: null }),
        art({ language: 'en', title: same, outlet: 'Outlet B', ladderRung: null }),
        art({ language: 'en', title: 'Japan says shrine visit was private, urges calm', outlet: 'Outlet C', ladderRung: null }),
      ],
    }],
    ...p,
  });
}

/** Distinct, recognisable captured examples, so a test can tell which source a chapter used. */
export function fallbacks(): Fallbacks {
  return {
    capturedOn: '2026-08-01',
    language: { headline: 'CAPTURED 严正交涉', outlet: 'Captured Outlet', date: '2026-08-01', rung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations' },
    event: {
      title: 'CAPTURED event', confidence: 60, signals: [], flags: [],
      reports: [{ title: 'captured lead', outlet: 'A' }, { title: 'captured other', outlet: 'B' }],
      reprints: [{ title: 'captured lead', outlet: 'C' }],
    },
    ladder: {
      rung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations',
      beijing: { title: 'captured beijing', outlet: 'A', date: '2026-08-01' },
      other: { title: 'captured other', outlet: 'B', date: '2026-08-01', rung: 5 },
    },
    trail: { trail: trailOf([{ target: 'JPN', dots: [dot({ day: '2026-07-20' })] }]) },
    dyad: {
      aName: 'China', bName: 'Japan', score: 40,
      series: Array.from({ length: 5 }, (_, i) => ({ date: `2026-07-0${i + 1}`, value: i })),
      markers: [{ date: '2026-07-01', label: 'a' }, { date: '2026-07-02', label: 'b' }, { date: '2026-07-03', label: 'c' }],
    },
    alert: { label: 'Japan', subject: 'CAPTURED Japan moved to rung 4', text: 'CAPTURED body' },
  };
}
