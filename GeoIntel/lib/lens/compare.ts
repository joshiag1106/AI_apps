import type { Article, Domain } from '@/lib/types';
import type { Beat } from '@/data/feeds';

/**
 * Language Lens: each topic search ("beat") that is run in several languages, compared within
 * itself. See docs/specs/2026-09-23-language-lens-design.md.
 *
 * Only topic-search reports count, and only within their own topic. Across the whole corpus the
 * share of reporting each language gives a state measures which searches Kautilya runs in which
 * language — Japanese is 100% the China–Taiwan search — not what any press pays attention to.
 * Within a topic the same question was put to every language, so the comparison is like for like,
 * except that the question is worded differently per language; that is why `asked` travels with
 * every column, and why the page says so.
 */

/** A language needs this many reports on a topic before it gets a column. */
export const MIN_ARTICLES = 25;
/** A framing difference is called out only when it is at least this wide... */
export const MIN_GAP = 0.1;
/** ...and at least this many standard errors from no difference (≈ p < 0.01, two-sided). */
export const Z_CRIT = 2.58;
/** Another state is listed only when this many of a column's reports name it. */
export const MIN_OTHER = 3;
const LATEST = 3;
const OTHERS = 3;

export type LensArticle = Pick<Article,
  'id' | 'language' | 'beatId' | 'actors' | 'outlet' | 'publishedAt' | 'title' | 'titleEn'> & {
  /**
   * The domain the report's own words show, or null when they show none — `evidencedDomain`, NOT the
   * stored `domain`, which falls back to 'Diplomatic' and would print the classifier's blind spots
   * (it reads 3–4% of Japanese and Arabic reports) as framing.
   */
  framed: Domain | null;
};

export interface Share<K> { key: K; count: number; share: number }

export interface LensHeadline {
  id: string; title: string; titleEn: string | null; outlet: string; publishedAt: string; eventId: string | null;
}

export interface LensColumn {
  language: string;
  articles: number;
  outlets: number;
  /** What this language's searches literally asked, with an English gloss where one is needed. */
  asked: { q: string; en: string | null }[];
  /** Reports whose own words show a framing; `framing` shares are of these. */
  classified: number;
  /** Empty when fewer than MIN_ARTICLES reports are readable — too few to say how it frames anything. */
  framing: Share<Domain>[];
  others: Share<string>[];
  latest: LensHeadline[];
}

export interface Difference {
  domain: Domain;
  high: { language: string; share: number };
  low: { language: string; share: number };
  z: number;
}

export interface BeatLens {
  id: string;
  label: string;
  dyad: [string, string] | null;
  since: string;
  until: string;
  columns: LensColumn[];
  sharpest: Difference | null;
}

export function queryLanguage(locale: string): string {
  return locale.split('-')[0];
}

/** Two-proportion z for x1/n1 against x2/n2. Zero when there is no sample or no variance to test. */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (x1 / n1 - x2 / n2) / se;
}

function shares<K extends string>(keys: K[], n: number): Share<K>[] {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()]
    .map(([key, count]) => ({ key, count, share: count / n }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function groupBy<T>(xs: T[], key: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (k === null) continue;
    const group = m.get(k);
    if (group) group.push(x); else m.set(k, [x]);
  }
  return m;
}

function column(language: string, arts: LensArticle[], beat: Beat, eventOf: Map<string, string>): LensColumn {
  const own = new Set(beat.dyad ?? []);
  const framed = arts.flatMap((a) => (a.framed ? [a.framed] : []));
  return {
    language,
    articles: arts.length,
    outlets: new Set(arts.map((a) => a.outlet)).size,
    asked: beat.queries
      .filter((q) => queryLanguage(q.locale) === language)
      .map((q) => ({ q: q.q, en: q.en ?? null })),
    classified: framed.length,
    framing: framed.length >= MIN_ARTICLES ? shares(framed, framed.length) : [],
    // A report naming a state twice still names it once.
    others: shares(arts.flatMap((a) => [...new Set(a.actors)].filter((iso) => !own.has(iso))), arts.length)
      .filter((s) => s.count >= MIN_OTHER)
      .slice(0, OTHERS),
    latest: [...arts]
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, LATEST)
      .map((a) => ({
        id: a.id, title: a.title, titleEn: a.titleEn, outlet: a.outlet, publishedAt: a.publishedAt,
        eventId: eventOf.get(a.id) ?? null,
      })),
  };
}

/**
 * The widest framing gap between any two columns that is both wide and unlikely to be chance. Only
 * columns whose framing can be read take part, and each is tested on its readable reports.
 */
function sharpest(all: LensColumn[]): Difference | null {
  const cols = all.filter((c) => c.framing.length > 0);
  let best: Difference | null = null;
  let bestGap = 0;
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const a = cols[i];
      const b = cols[j];
      for (const domain of new Set([...a.framing, ...b.framing].map((s) => s.key))) {
        const xa = a.framing.find((s) => s.key === domain)?.count ?? 0;
        const xb = b.framing.find((s) => s.key === domain)?.count ?? 0;
        const pa = xa / a.classified;
        const pb = xb / b.classified;
        const gap = Math.abs(pa - pb);
        const z = Math.abs(twoProportionZ(xa, a.classified, xb, b.classified));
        // The epsilon keeps a gap of exactly MIN_GAP from being lost to floating point.
        if (gap < MIN_GAP - 1e-9 || z < Z_CRIT) continue;
        if (best && (gap < bestGap || (gap === bestGap && z <= best.z))) continue;
        const [hi, lo] = pa >= pb ? [{ c: a, p: pa }, { c: b, p: pb }] : [{ c: b, p: pb }, { c: a, p: pa }];
        best = { domain, high: { language: hi.c.language, share: hi.p }, low: { language: lo.c.language, share: lo.p }, z };
        bestGap = gap;
      }
    }
  }
  return best;
}

export function lens(articles: LensArticle[], beats: Beat[], eventOf: Map<string, string> = new Map()): BeatLens[] {
  const byBeat = groupBy(articles, (a) => a.beatId);
  const out: BeatLens[] = [];
  for (const beat of beats) {
    const shown = [...groupBy(byBeat.get(beat.id) ?? [], (a) => a.language).entries()]
      .filter(([, arts]) => arts.length >= MIN_ARTICLES)
      .sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));
    if (shown.length < 2) continue;
    const columns = shown.map(([language, arts]) => column(language, arts, beat, eventOf));
    const used = shown.flatMap(([, arts]) => arts.map((a) => a.publishedAt)).sort();
    out.push({
      id: beat.id, label: beat.label, dyad: beat.dyad ?? null,
      since: used[0], until: used[used.length - 1],
      columns, sharpest: sharpest(columns),
    });
  }
  return out;
}
