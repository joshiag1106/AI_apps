import type { Ownership } from '@/data/sources';
import type { Domain } from '@/data/lexicon';

export type { Ownership, Domain };

/** What a feed adapter emits, before any analysis. */
export interface RawArticle {
  url: string;
  title: string;
  outlet: string;
  publishedAt: string;   // ISO 8601
  snippet: string;
  imageUrl: string | null;
  language: string;
  beatId: string | null;
  localeKey: string | null;
  /** YouTube id when this item is a video rather than an article. */
  videoId: string | null;
}

/** A RawArticle after source resolution and analysis. */
export interface Article extends RawArticle {
  id: string;
  sourceCountry: string;
  ownership: Ownership;
  tier: number;
  isPrimary: boolean;
  actors: string[];       // ISO3
  hotspots: string[];     // hotspot ids
  domain: Domain;
  escalation: number;     // -100..100
  framing: number;
  ladderRung: number | null;
  ladderZh: string | null;
  ladderEn: string | null;
  glossed: string[];      // English renderings of recognised Chinese terms
  titleEn: string | null; // English gloss of a non-English headline
  /** Carries a geopolitical security signal — see isRelevant() in lib/ingest/pipeline. */
  relevant: boolean;
}

export interface ConfidenceSignal {
  key: string;
  label: string;
  detail: string;
  points: number;
  max: number;
}

export type EventFlag =
  | 'single_source' | 'state_media_only' | 'disputed' | 'uncorroborated' | 'primary_sourced';

export interface GeoEvent {
  id: string;
  title: string;
  summary: string;
  firstSeen: string;
  lastSeen: string;
  actors: string[];
  hotspots: string[];
  domain: Domain;
  escalation: number;
  confidence: number;             // 0-100
  signals: ConfidenceSignal[];
  flags: EventFlag[];
  articleIds: string[];
  languages: string[];
  countries: string[];
  imageUrl: string | null;
  videoId: string | null;
  ladderRung: number | null;
  ladderZh: string | null;
  ladderEn: string | null;
}
