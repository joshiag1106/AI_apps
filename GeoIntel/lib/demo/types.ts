import type { Article, ConfidenceSignal, Domain, EventFlag, GeoEvent } from '@/lib/types';
import type { BeatLens } from '@/lib/lens/compare';
import type { Trail } from '@/lib/verify/trail';
import type { MapShape } from '@/lib/map';
import type { MapDatum, MapMarker } from '@/components/WorldMap';
import type { EgoView } from '@/lib/graph/ego';

export const CHAPTER_IDS = [
  'board', 'language', 'lens', 'event', 'ladder', 'trail', 'risk', 'dyad', 'network', 'ask', 'yours', 'close',
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** Where a chapter's example came from. A tour that hides this is the failure the product avoids. */
export type Source = { kind: 'live' } | { kind: 'captured'; capturedOn: string };

export interface Report { title: string; outlet: string }

export interface BoardData {
  shapes: MapShape[];
  data: MapDatum[];
  markers: MapMarker[];
  stats: { articles: number; countries: number; languages: number; events: number };
}
export interface LanguageData {
  headline: string; outlet: string; date: string; rung: number; ladderZh: string; ladderEn: string;
}
/** One language's side of the Lens chapter: a trimmed LensColumn. */
export interface LensSide {
  language: string; articles: number; classified: number;
  /** The first thing this language's search asked, or null when its reports came from another language's search. */
  asked: { q: string; en: string | null } | null;
  /** At most three framings, always including the one that differs. */
  framing: { key: Domain; share: number }[];
  /** `english` is the stored key terms or the curated Japanese glossary — never the Chinese dictionary join. */
  headline: { title: string; english: string | null; outlet: string } | null;
}
export interface LensData {
  topic: string; domain: Domain;
  /** Worded exactly as the Lens page words it — lib/lens/compare describeSharpest. */
  sentence: string;
  /** The language that frames the topic this way more often, then the one that does so less. */
  high: LensSide; low: LensSide;
}
export interface EventData {
  title: string; confidence: number; signals: ConfidenceSignal[]; flags: EventFlag[];
  /** Distinct reports; reports[0] is the lead that `reprints` repeat. */
  reports: Report[];
  reprints: Report[];
}
export interface LadderData {
  rung: number; ladderZh: string; ladderEn: string;
  beijing: { title: string; outlet: string; date: string };
  other: { title: string; outlet: string; date: string; rung: number };
}
export interface TrailData { trail: Trail }
export interface RiskData { iso: string; name: string; score: number; axes: { label: string; value: number }[] }
export interface DyadData {
  aName: string; bName: string; score: number;
  series: { date: string; value: number }[];
  markers: { date: string; label: string }[];
}
export interface NetworkData {
  from: string; to: string; view: EgoView;
  topEvents: Map<string, { title: string }[]>;
  trail: string[];
  /** The walk's third step, from `to` into the person graph; null when no official qualifies. */
  person: PersonStep | null;
}
export interface PersonStep {
  id: string; name: string; role: string; home: string;
  view: EgoView;
  topEvents: Map<string, { title: string }[]>;
  trail: string[];
}
export interface AskData {
  question: string;
  readAs: { label: string; value: string }[];
  headline: string;
  figures: { label: string; value: string; sub?: string }[];
}
export interface AlertData { label: string; subject: string; text: string }
export interface YoursData extends AlertData { exportChip: string | null }
export interface CloseData { copy: string; buttons: { label: string; href: string; primary: boolean }[] }

export interface ChapterData {
  board: BoardData; language: LanguageData; lens: LensData; event: EventData; ladder: LadderData; trail: TrailData;
  risk: RiskData; dyad: DyadData; network: NetworkData; ask: AskData; yours: YoursData; close: CloseData;
}

export interface Chapter<K extends ChapterId = ChapterId> {
  id: K; title: string; caption: string; seconds: number; source: Source;
  /** "Desk" / "Desk Pro", or null. See lib/demo/claims. */
  chip: string | null;
  data: ChapterData[K];
}
export type AnyChapter = { [K in ChapterId]: Chapter<K> }[ChapterId];

export interface DemoScript { chapters: AnyChapter[]; thin: boolean; updatedAt: string | null }

export interface ClaimsState { enforced: boolean; mode: 'stripe' | 'mock' | 'closed'; freeLimit: number }

/** Everything the builder needs, gathered by the page from existing queries. */
export interface DemoInput {
  events: GeoEvent[];
  now: number;
  lastIngest: string | null;
  /** The origin used inside the example alert email. Never loopback — see lib/demo/alert. */
  origin: string;
  claims: ClaimsState;
  names: Record<string, string>;
  board: BoardData;
  risks: { iso: string; composite: number; vectors: Record<string, number> }[];
  dyads: { a: string; b: string; score: number; series: { date: string; value: number }[]; topEvents: GeoEvent[] }[];
  /** Built from the Beijing articles that survive the junk rule. */
  trail: Trail;
  /** Beijing's rung-bearing articles, newest first. */
  beijingArticles: Article[];
  /** Another party's rung-bearing articles, newest first. */
  otherArticles: Article[];
  /** article id → event id. */
  eventIdOf: Record<string, string>;
  /** The best few events with their articles, for chapter 4. */
  eventCandidates: { event: GeoEvent; articles: Article[] }[];
  /** The Language Lens topics, exactly as /lens computes them. */
  lens: BeatLens[];
}

/** Real examples captured together on one day; see scripts/demo-capture.ts. */
export interface Fallbacks {
  capturedOn: string;
  language: LanguageData; event: EventData; ladder: LadderData;
  trail: TrailData; dyad: DyadData; alert: AlertData;
}
