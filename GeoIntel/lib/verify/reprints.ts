import type { Article } from '@/lib/types';

/**
 * Reprints: one report, printed by several outlets.
 *
 * Corroboration is the product's central claim and it counts outlets — but a wire story
 * printed by five of them is one report, not five. Measured on the corpus of 2026-09-19,
 * 147 of 670 events scored as having two or more independent outlets carried near-identical
 * headlines from different outlets, so the distinct originals were fewer than the outlets
 * counted. Two Chinese outlets running an identical headline turned "two independent
 * outlets" into one.
 *
 * WHAT COUNTS. Near-identical headlines after normalisation, nothing else: not the body, not
 * the outlet's reputation. The line is 0.8 Jaccard overlap. The 0.5–0.8 bands (about 630
 * pairs) are mostly headlines two editors wrote separately about one event — "4 sailors
 * killed in Houthi missile attack" beside "Four killed in Houthi attack…, sources say" —
 * which are independent editorial decisions and stay independent. Rewritten wire copy and
 * translated copy therefore escape, so the measured inflation is a FLOOR.
 *
 * FIGURES MUST MATCH. Two headlines whose numbers differ are different reports. "4 sailors
 * killed" and "5 sailors killed" are different claims, and a daily broadcast titled by its
 * date is a different report each day — yet set overlap alone scores both at 0.86 or higher.
 * Found by reading a sample of the real corpus's collapsed families, not by reasoning.
 *
 * THE SAFE DIRECTION. Under-collapsing is the status quo; over-collapsing silently penalises
 * real corroboration. Every threshold here errs toward not collapsing — the opposite of the
 * roster detector's, where a missed exclusion costs a false flag.
 *
 * WHY NOT cluster.ts's jaccard/tokens. Those add glossed terms and hotspot ids so that a
 * Chinese and an English report of one event can match. That is exactly what makes
 * paraphrases look identical here, so this module reads the headline alone.
 */
export const REPRINT_SIMILARITY = 0.8;
/** A headline shorter than this could be written independently by two editors. */
const MIN_WORDS = 4;
const MIN_HAN = 6;

const LEADING_LABEL = /^\s*(?:video|watch|live|urgent|breaking)\s*[|:：–—-]\s*/;
// A pipe is a separator whatever surrounds it — Chinese feeds append "| outlet" with no
// space before the bar. A dash is one only with spaces on both sides, so "live-fire" and
// "India-China" keep their hyphens.
const TRAILING_PIPE = /\s*[|｜]\s*[^|｜]{2,40}$/;
const TRAILING_DASH = /\s+[-–—]\s+[^-–—]{2,40}$/;

/** The headline with its outlet suffix, section label, case and punctuation removed. */
function normalise(title: string): string {
  const t = title.normalize('NFKC').toLowerCase()
    .replace(LEADING_LABEL, '').replace(TRAILING_PIPE, '').replace(TRAILING_DASH, '');
  return t.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
}

/** The numbers in a headline as one comparable string, so two headlines can be asked to agree on them. */
function figuresOf(title: string): string {
  return (normalise(title).match(/\p{N}+/gu) ?? []).sort().join(',');
}

/**
 * What a headline reduces to for comparison, or null when it is too short to trust.
 * Han text becomes character bigrams; every other script becomes a set of words.
 */
export function headlineKey(title: string): Set<string> | null {
  const t = normalise(title);

  const han = t.match(/\p{Script=Han}/gu) ?? [];
  if (han.length >= 4) {
    if (han.length < MIN_HAN) return null;
    const out = new Set<string>();
    for (let i = 0; i < han.length - 1; i++) out.add(han[i] + han[i + 1]);
    return out;
  }
  const words = t.split(/\s+/).filter((w) => w.length >= 2);
  return words.length >= MIN_WORDS ? new Set(words) : null;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export interface ReprintFamily {
  /** The report the score reads for this family. */
  representative: Article;
  /** Every report in the family, in publication order, the representative included. */
  members: Article[];
}

/** An official statement first, then the stronger track record. Ties keep the earlier one. */
function beats(a: Article, b: Article): boolean {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary;
  return a.tier < b.tier;
}

/**
 * Group articles into families of reprints.
 *
 * Articles are taken in publication order (ties by id) and each joins the first family whose
 * ANCHOR — its earliest article — it matches, else starts one. Matching the anchor rather
 * than any member prevents chaining: A~B and B~C at 0.8 must not merge A and C at 0.5.
 * Deterministic whatever order the input arrives in.
 *
 * The representative is the member the score reads: an official statement, then the best
 * outlet tier, then the earliest. The interface says "also printed by", never "copied from",
 * because which outlet copied which cannot be known from a headline.
 */
export function reprintFamilies(articles: Article[]): ReprintFamily[] {
  const ordered = [...articles].sort(
    (a, b) => (Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const groups: { anchor: Set<string> | null; figures: string; members: Article[] }[] = [];
  for (const a of ordered) {
    const key = headlineKey(a.title);
    const figures = figuresOf(a.title);
    const home = key
      ? groups.find((g) => g.anchor && g.figures === figures && overlap(key, g.anchor) >= REPRINT_SIMILARITY)
      : undefined;
    if (home) home.members.push(a);
    else groups.push({ anchor: key, figures, members: [a] });
  }
  return groups.map((g) => ({
    members: g.members,
    representative: g.members.reduce((best, m) => (beats(m, best) ? m : best), g.members[0]),
  }));
}
