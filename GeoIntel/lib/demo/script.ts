import { FALLBACKS } from '@/data/demo-fallbacks';
import { CHAPTERS, meta } from './chapters';
import { chipFor, closingFor, exportChipFor } from './claims';
import {
  selectAlert, selectAsk, selectDyad, selectEvent, selectLadder, selectLanguage,
  selectNetwork, selectRisk, selectTrail,
} from './select';
import type {
  AnyChapter, Chapter, ChapterData, ChapterId, DemoInput, DemoScript, Fallbacks, Source,
} from './types';

/**
 * Below this many events the map and the graph are mostly empty, so the chapters that need a
 * SPECIFIC kind of case use their captured example rather than a live one that a near-empty corpus
 * happened to produce.
 */
export const MIN_LIVE_EVENTS = 20;

/**
 * Decide, per chapter, what to show and where it came from. Pure: the page gathers the input.
 *
 * Six chapters need a specific case (2, 3, 4, 5, 7 and the alert scene of 10), so they can fall back
 * to a dated capture. The other four — a map, a radar, a network, an answer — are the corpus itself:
 * they render from whatever it holds, and a chapter with nothing to show is left out of the tour
 * instead of being animated empty (for the map, that is a board with no country data).
 */
export function buildDemoScript(input: DemoInput, fallbacks: Fallbacks = FALLBACKS): DemoScript {
  const thin = input.events.length < MIN_LIVE_EVENTS;
  const live: Source = { kind: 'live' };
  const captured: Source = { kind: 'captured', capturedOn: fallbacks.capturedOn };

  const chapters: AnyChapter[] = [];
  const add = <K extends ChapterId>(id: K, data: ChapterData[K] | null, source: Source, caption?: string) => {
    if (!data) return;
    const m = meta(id);
    const chapter: Chapter<K> = {
      id, title: m.title, caption: caption ?? m.caption, seconds: m.seconds, source,
      chip: chipFor(id, input.claims.enforced), data,
    };
    // TypeScript cannot prove that Chapter<K> for a generic K is one member of the AnyChapter union.
    chapters.push(chapter as unknown as AnyChapter);
  };
  const withFallback = <T>(chosen: T | null, fallback: T): { data: T; source: Source } =>
    !thin && chosen ? { data: chosen, source: live } : { data: fallback, source: captured };

  for (const { id } of CHAPTERS) {
    switch (id) {
      case 'board': add('board', input.board.data.length > 0 ? input.board : null, live); break;
      case 'language': { const r = withFallback(selectLanguage(input), fallbacks.language); add('language', r.data, r.source); break; }
      case 'event': { const r = withFallback(selectEvent(input), fallbacks.event); add('event', r.data, r.source); break; }
      case 'ladder': { const r = withFallback(selectLadder(input), fallbacks.ladder); add('ladder', r.data, r.source); break; }
      case 'trail': { const r = withFallback(selectTrail(input), fallbacks.trail); add('trail', r.data, r.source); break; }
      case 'risk': add('risk', selectRisk(input), live); break;
      case 'dyad': { const r = withFallback(selectDyad(input), fallbacks.dyad); add('dyad', r.data, r.source); break; }
      case 'network': add('network', selectNetwork(input), live); break;
      case 'ask': add('ask', selectAsk(input), live); break;
      case 'yours': {
        const r = withFallback(selectAlert(input), fallbacks.alert);
        add('yours', { ...r.data, exportChip: exportChipFor(input.claims.enforced) }, r.source);
        break;
      }
      case 'close': { const c = closingFor(input.claims); add('close', c, live, c.copy); break; }
    }
  }

  return { chapters, thin, updatedAt: input.lastIngest };
}
