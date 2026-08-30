import type { GeoEvent, Domain } from '@/lib/types';
import { dyadKey } from '@/lib/analyze/entities';

export const VECTORS = ['Military', 'Economic', 'Cyber', 'Internal', 'Diplomatic', 'Energy'] as const;
export type Vector = (typeof VECTORS)[number];

const DOMAIN_TO_VECTOR: Record<Domain, Vector> = {
  Military: 'Military', Maritime: 'Military', Nuclear: 'Military', Space: 'Military',
  Economic: 'Economic', Technology: 'Economic',
  Cyber: 'Cyber', Internal: 'Internal', Diplomatic: 'Diplomatic', Energy: 'Energy',
};

const HALF_LIFE_DAYS = 14;
/**
 * How many days of daily buckets the dyad trend chart plots.
 *
 * This is the furthest back any feature reads, so it sets the floor for how long the
 * ingest pipeline must retain articles. Beyond it the 14-day half-life has decayed an
 * event's impact to roughly 1%, so deeper history buys nothing and only gives the
 * clustering pass more archive to trip over.
 */
export const TREND_SERIES_DAYS = 90;

/** Recency decay. A three-week-old incident should not read as today's risk. */
export function decay(iso: string, now = Date.now()): number {
  const days = (now - Date.parse(iso)) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return 1;
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * An event's contribution to risk. Confidence gates it deliberately: a dramatic
 * single-source claim should move the index far less than a corroborated one.
 */
export function impact(e: GeoEvent, now = Date.now()): number {
  return Math.max(0, e.escalation) * (e.confidence / 100) * decay(e.lastSeen, now);
}

function squash(raw: number): number {
  // Diminishing returns: the difference between 20 and 30 incidents matters less
  // than between 0 and 5. Keeps the index readable on a 0-100 scale.
  return Math.round(100 * (1 - Math.exp(-raw / 120)));
}

export interface CountryRisk {
  iso: string;
  composite: number;
  vectors: Record<Vector, number>;
  eventCount: number;
  trend: number;       // change vs the previous equivalent window, in points
  topDomain: Domain | null;
}

export function countryRisk(iso: string, events: GeoEvent[], now = Date.now()): CountryRisk {
  const mine = events.filter((e) => e.actors.includes(iso));
  const vectors = Object.fromEntries(VECTORS.map((v) => [v, 0])) as Record<Vector, number>;
  const domainTally = new Map<Domain, number>();

  for (const e of mine) {
    const v = DOMAIN_TO_VECTOR[e.domain];
    vectors[v] += impact(e, now);
    domainTally.set(e.domain, (domainTally.get(e.domain) ?? 0) + 1);
  }

  const raw = Object.values(vectors).reduce((s, x) => s + x, 0);
  const HALF = now - 30 * 86_400_000;
  const recent = mine.filter((e) => Date.parse(e.lastSeen) >= HALF)
    .reduce((s, e) => s + Math.max(0, e.escalation) * (e.confidence / 100), 0);
  const prior = mine.filter((e) => Date.parse(e.lastSeen) < HALF)
    .reduce((s, e) => s + Math.max(0, e.escalation) * (e.confidence / 100), 0);

  let topDomain: Domain | null = null;
  let topN = 0;
  for (const [d, n] of domainTally) if (n > topN) { topDomain = d; topN = n; }

  return {
    iso,
    composite: squash(raw),
    vectors: Object.fromEntries(
      VECTORS.map((v) => [v, squash(vectors[v] * 2.5)]),
    ) as Record<Vector, number>,
    eventCount: mine.length,
    trend: squash(recent) - squash(prior),
    topDomain,
  };
}

export interface DyadTension {
  key: string;
  a: string;
  b: string;
  score: number;
  eventCount: number;
  trend: number;
  series: { date: string; value: number }[];
  topEvents: GeoEvent[];
}

export function dyadTension(a: string, b: string, events: GeoEvent[], now = Date.now()): DyadTension {
  const key = dyadKey(a, b);
  const mine = events.filter((e) => e.actors.includes(a) && e.actors.includes(b));
  const raw = mine.reduce((s, e) => s + impact(e, now), 0);

  // Daily series for the trend chart. Its length is the deepest read anything makes of
  // the corpus, which is why ingest retention is pinned to it rather than chosen freely.
  const buckets = new Map<string, number>();
  for (let d = TREND_SERIES_DAYS - 1; d >= 0; d--) {
    buckets.set(new Date(now - d * 86_400_000).toISOString().slice(0, 10), 0);
  }
  for (const e of mine) {
    const day = e.lastSeen.slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, buckets.get(day)! + Math.max(0, e.escalation) * (e.confidence / 100));
    }
  }
  const series = [...buckets.entries()].map(([date, v]) => ({ date, value: squash(v * 6) }));

  const half = Math.floor(series.length / 2);
  const avg = (xs: { value: number }[]) => (xs.length ? xs.reduce((s, x) => s + x.value, 0) / xs.length : 0);

  return {
    key, a, b,
    score: squash(raw * 2),
    eventCount: mine.length,
    trend: Math.round(avg(series.slice(half)) - avg(series.slice(0, half))),
    series,
    topEvents: [...mine].sort((x, y) => impact(y, now) - impact(x, now)).slice(0, 8),
  };
}

export function riskBand(score: number): { label: string; tone: 'low' | 'guarded' | 'elevated' | 'high' | 'severe' } {
  if (score >= 80) return { label: 'Severe', tone: 'severe' };
  if (score >= 60) return { label: 'High', tone: 'high' };
  if (score >= 40) return { label: 'Elevated', tone: 'elevated' };
  if (score >= 20) return { label: 'Guarded', tone: 'guarded' };
  return { label: 'Low', tone: 'low' };
}
