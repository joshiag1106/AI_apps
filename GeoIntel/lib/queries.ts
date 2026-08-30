import 'server-only';
import { cache } from 'react';
import { allEvents, articlesByIds, eventById, getMeta, articleCountByLanguage, articlesByLanguage } from '@/lib/db';
import { countryRisk, dyadTension, type CountryRisk } from '@/lib/risk';
import { COUNTRIES, BY_ISO, HOTSPOTS } from '@/data/countries';
import { dyadKey } from '@/lib/analyze/entities';
import type { GeoEvent } from '@/lib/types';

/** One corpus read per request; every aggregation below works off it. */
export const corpus = cache((): GeoEvent[] => allEvents(4000));

export function lastIngest(): string | null {
  return getMeta('last_ingest');
}

export function countryRisks(events = corpus()): CountryRisk[] {
  return COUNTRIES
    .map((c) => countryRisk(c.iso, events))
    .filter((r) => r.eventCount > 0)
    .sort((a, b) => b.composite - a.composite);
}

/** Dyads worth surfacing: those actually carrying events, most tense first. */
export function topDyads(events = corpus(), limit = 12) {
  const seen = new Map<string, [string, string]>();
  for (const e of events) {
    const a = [...e.actors].sort();
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) seen.set(dyadKey(a[i], a[j]), [a[i], a[j]]);
    }
  }
  return [...seen.values()]
    .map(([a, b]) => dyadTension(a, b, events))
    .filter((d) => d.eventCount >= 2)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

export const INDIA_WATCHBOARD = ['CHN', 'PAK', 'BGD', 'MMR', 'NPL', 'LKA', 'MDV', 'AFG', 'USA', 'RUS'];

export function indiaBoard(events = corpus()) {
  return INDIA_WATCHBOARD
    .map((iso) => dyadTension('IND', iso, events))
    .sort((a, b) => b.score - a.score);
}

export function eventsFor(opts: {
  actor?: string; dyad?: [string, string]; domain?: string; hotspot?: string;
  language?: string; minConfidence?: number; query?: string; limit?: number;
} = {}, events = corpus()): GeoEvent[] {
  let out = events;
  if (opts.actor) out = out.filter((e) => e.actors.includes(opts.actor!));
  if (opts.dyad) out = out.filter((e) => e.actors.includes(opts.dyad![0]) && e.actors.includes(opts.dyad![1]));
  if (opts.domain) out = out.filter((e) => e.domain === opts.domain);
  if (opts.hotspot) out = out.filter((e) => e.hotspots.includes(opts.hotspot!));
  if (opts.language) out = out.filter((e) => e.languages.includes(opts.language!));
  if (opts.minConfidence != null) out = out.filter((e) => e.confidence >= opts.minConfidence!);
  if (opts.query) {
    const q = opts.query.toLowerCase();
    out = out.filter((e) => e.title.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q));
  }
  return out.slice(0, opts.limit ?? 60);
}

/** Events where a PRC official escalation formula was detected, highest rung first. */
export function ladderAlerts(events = corpus(), limit = 20) {
  return events
    .filter((e) => e.ladderRung !== null)
    .sort((a, b) => (b.ladderRung ?? 0) - (a.ladderRung ?? 0) || Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, limit);
}

/**
 * Exact corpus totals for a language. The China page previously derived its headline
 * figures from the display sample, which understated them by an order of magnitude.
 */
export const languageStats = cache((language: string) => ({
  articles: articleCountByLanguage(language),
  events: corpus().filter((e) => e.languages.includes(language)).length,
}));

/** All stored articles in one language — for vocabulary tallies over the full corpus. */
export const articlesIn = cache((language: string, limit = 2000) => articlesByLanguage(language, limit));

/** Chinese-language reporting stream, for the China Watch page. */
export function chineseStream(events = corpus(), limit = 40) {
  return events
    .filter((e) => e.languages.includes('zh'))
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, limit);
}

/** Events backed by a broadcaster video, newest first. */
export function videoEvents(events = corpus(), limit = 6) {
  return events
    .filter((e) => e.videoId)
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, limit);
}

export function languageMix(events = corpus()): { language: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of events) for (const l of e.languages) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);
}

export function domainMix(events = corpus()): { domain: string; count: number }[] {
  const m = new Map<string, number>();
  for (const e of events) m.set(e.domain, (m.get(e.domain) ?? 0) + 1);
  return [...m.entries()].map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

/** Activity by flashpoint — what is actually hot on the map right now. */
export function hotspotActivity(events = corpus()) {
  return HOTSPOTS.map((h) => {
    const mine = events.filter((e) => e.hotspots.includes(h.id));
    const heat = mine.reduce((s, e) => s + Math.max(0, e.escalation) * (e.confidence / 100), 0);
    return { ...h, count: mine.length, heat: Math.round(heat), latest: mine[0] ?? null };
  }).filter((h) => h.count > 0).sort((a, b) => b.heat - a.heat);
}

export function eventDetail(id: string) {
  const event = eventById(id);
  if (!event) return null;
  const articles = articlesByIds(event.articleIds)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return { event, articles };
}

export function searchCountries(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(s) || c.iso.toLowerCase() === s ||
           c.aliases.some((a) => a.toLowerCase().startsWith(s) || a.includes(q.trim())),
  ).slice(0, 12);
}

export function countryName(iso: string): string {
  return BY_ISO.get(iso)?.name ?? iso;
}

export function corpusStats(events = corpus()) {
  const articles = events.reduce((s, e) => s + e.articleIds.length, 0);
  const corroborated = events.filter((e) => e.confidence >= 50).length;
  const zh = events.filter((e) => e.languages.includes('zh')).length;
  return {
    events: events.length,
    articles,
    corroborated,
    zh,
    languages: new Set(events.flatMap((e) => e.languages)).size,
    countries: new Set(events.flatMap((e) => e.countries)).size,
  };
}
