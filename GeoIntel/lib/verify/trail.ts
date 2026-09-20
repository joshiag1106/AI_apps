/**
 * The ladder evidence trail: when Beijing used a formula, and about whom.
 *
 * Pure. It takes Beijing-attributed rung articles and returns rows of dots — one dot per country
 * per UTC day, at that day's highest rung, with reprints folded. It draws nothing and asks the
 * database for nothing; see components/LadderTrail and lib/queries.
 *
 * A dot is not a level. There is no line between dots, and no dot means no formula was found in a
 * headline, not that things were calm.
 */
import type { Article } from '@/lib/types';
import { reprintFamilies } from '@/lib/verify/reprints';

/** The widest window the trail shows. */
export const TRAIL_DAYS = 90;
const DAY_MS = 86_400_000;

export interface TrailEvidence {
  title: string;
  outlet: string;
  url: string;
  publishedAt: string;
  rung: number;
  /** The event this report belongs to, when the page knows it. */
  eventId: string | null;
}

export interface TrailDot {
  key: string;
  /** ISO3, or null when the headline does not say whom the formula is about. */
  target: string | null;
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  rung: number;
  zh: string;
  en: string;
  /** Every report that day. */
  reports: number;
  /** Reports after reprints are folded into the one they repeat. */
  originals: number;
  /** A rung above every earlier dot in this row. Never the row's first dot. */
  newHigh: boolean;
  /** The event carrying the day's highest rung. */
  eventId: string | null;
  /** One report per original, highest rung first. */
  evidence: TrailEvidence[];
}

export interface TrailRow { target: string; dots: TrailDot[] }

export interface Trail {
  /** First and last day of the axis, YYYY-MM-DD. */
  since: string;
  until: string;
  /**
   * The window was cut to the last TRAIL_DAYS, so `since` is its edge and not when the corpus
   * began. The copy must not claim "collecting since" a date the corpus in fact predates.
   */
  capped: boolean;
  rows: TrailRow[];
  /** Beijing formulae whose headline does not name a target. */
  notStated: TrailDot[];
  /** Every dot, in rows and notStated. */
  dots: number;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * '2026-09-17' → '17 Sep'. A fixed table rather than Intl: en-GB abbreviates September as "Sept" or
 * "Sep" depending on the ICU data a Node build ships, and the server and a developer's machine need
 * not agree — the same chart would read differently in two places.
 */
export function dayLabel(day: string): string {
  const [, month, date] = day.split('-');
  return `${Number(date)} ${MONTHS[Number(month) - 1]}`;
}

function makeDot(target: string | null, day: string, group: Article[], eventOf?: ReadonlyMap<string, string>): TrailDot {
  const families = reprintFamilies(group);
  const top = group.reduce((best, a) => ((a.ladderRung ?? 0) > (best.ladderRung ?? 0) ? a : best), group[0]);
  const evidence: TrailEvidence[] = families
    .map((f) => ({
      title: f.representative.title,
      outlet: f.representative.outlet,
      url: f.representative.url,
      publishedAt: f.representative.publishedAt,
      rung: Math.max(...f.members.map((m) => m.ladderRung ?? 0)),
      eventId: eventOf?.get(f.representative.id) ?? null,
    }))
    .sort((a, b) => b.rung - a.rung || Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || (a.url < b.url ? -1 : 1));
  return {
    key: `${target ?? 'none'}|${day}`,
    target, day,
    rung: top.ladderRung ?? 0,
    zh: top.ladderZh ?? '',
    en: top.ladderEn ?? '',
    reports: group.length,
    originals: families.length,
    newHigh: false,
    eventId: evidence[0]?.eventId ?? null,
    evidence,
  };
}

export function ladderTrail(
  articles: Article[],
  opts: { since: string; until: string; eventOf?: ReadonlyMap<string, string> },
): Trail {
  const untilMs = Date.parse(opts.until);
  const edge = untilMs - TRAIL_DAYS * DAY_MS;
  const sinceMs = Math.max(Date.parse(opts.since), edge);
  const capped = Date.parse(opts.since) < edge;
  const since = utcDay(sinceMs);
  const until = utcDay(untilMs);

  const groups = new Map<string, { target: string | null; day: string; list: Article[] }>();
  for (const a of articles) {
    if (a.ladderRung == null || a.ladderSpeaker !== 'prc') continue;
    const t = Date.parse(a.publishedAt);
    if (Number.isNaN(t)) continue;
    const day = utcDay(t);
    if (day < since || day > until) continue;
    const target = a.ladderTarget ?? null;
    const key = `${target ?? ''}|${day}`;
    const g = groups.get(key) ?? { target, day, list: [] };
    g.list.push(a);
    groups.set(key, g);
  }

  const byTarget = new Map<string, TrailDot[]>();
  const notStated: TrailDot[] = [];
  for (const g of groups.values()) {
    const dot = makeDot(g.target, g.day, g.list, opts.eventOf);
    if (g.target === null) notStated.push(dot);
    else byTarget.set(g.target, [...(byTarget.get(g.target) ?? []), dot]);
  }

  const rows: TrailRow[] = [...byTarget.entries()].map(([target, dots]) => {
    dots.sort((a, b) => (a.day < b.day ? -1 : 1));
    let highest = 0;
    dots.forEach((d, i) => { d.newHigh = i > 0 && d.rung > highest; highest = Math.max(highest, d.rung); });
    return { target, dots };
  });
  const last = (r: TrailRow) => r.dots[r.dots.length - 1].day;
  const peak = (r: TrailRow) => Math.max(...r.dots.map((d) => d.rung));
  rows.sort((a, b) => (last(a) < last(b) ? 1 : last(a) > last(b) ? -1 : 0) || peak(b) - peak(a) || (a.target < b.target ? -1 : 1));
  notStated.sort((a, b) => (a.day < b.day ? -1 : 1));

  return { since, until, capped, rows, notStated, dots: rows.reduce((n, r) => n + r.dots.length, 0) + notStated.length };
}

/** How many days the axis spans, first and last both counted. */
export function windowDays(trail: Pick<Trail, 'since' | 'until'>): number {
  const t0 = Date.parse(`${trail.since}T00:00:00Z`);
  const t1 = Date.parse(`${trail.until}T00:00:00Z`);
  return Math.round((t1 - t0) / DAY_MS) + 1;
}

/** Where a day sits on the axis: 0 at the left edge, 1 at the right, the middle of the day. */
export function dotPosition(day: string, trail: Pick<Trail, 'since' | 'until'>): number {
  const t0 = Date.parse(`${trail.since}T00:00:00Z`);
  const t1 = Date.parse(`${trail.until}T00:00:00Z`) + DAY_MS;
  const t = Date.parse(`${day}T12:00:00Z`);
  return Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
}

/** Evenly spaced dates for the axis, the first day at 0 and the last at 1. */
export function axisTicks(trail: Pick<Trail, 'since' | 'until'>, count = 5): { at: number; label: string }[] {
  const t0 = Date.parse(`${trail.since}T00:00:00Z`);
  const t1 = Date.parse(`${trail.until}T00:00:00Z`) + DAY_MS - 1;
  return Array.from({ length: count }, (_, i) => {
    const at = count === 1 ? 0 : i / (count - 1);
    return { at, label: dayLabel(utcDay(t0 + at * (t1 - t0))) };
  });
}
