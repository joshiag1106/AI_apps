import type { Article, GeoEvent } from '@/lib/types';
import { scoreConfidence } from '@/lib/verify/confidence';

const WINDOW_HOURS = 60;
const MIN_SHARED_TOKENS = 2;
/**
 * How much summed rarity two headlines must share, as a fraction of log(corpus size).
 *
 * Plain Jaccard fails on headlines because it punishes length difference: "Scores dead,
 * hundreds missing in flash floods on Nepal-China border" and "Nepal floods: dozens
 * killed as rivers burst banks" share the two words that matter and still score 0.14.
 * Weighting shared words by rarity fixes both halves — it rewards "nepal"+"floods" and
 * all but ignores "china"+"talks", which appear everywhere.
 *
 * The threshold is expressed relative to log(n) rather than as an absolute, because the
 * maximum IDF any token can carry is log(n): a fixed constant would merge nothing in a
 * small corpus and everything in a large one.
 */
const IDF_FACTOR = 0.9;
/**
 * Corpus size floor for the rarity calculation.
 *
 * IDF measures rarity *within the corpus*, so in a tiny one every shared word sits in
 * 100% of documents and scores zero — two headlines about the same flood would look
 * unrelated. Below this size we have no basis to call any word common, so we compute
 * rarity as if against a corpus of this size rather than penalising the match.
 */
const IDF_CORPUS_FLOOR = 500;
/** Bigrams are weak evidence individually, so agreement on them must be near-total. */
const BIGRAM_MIN = 0.42;
/**
 * How much of a cluster a report must match before it can join it.
 *
 * This is what stops chaining. Matching a single member is not evidence of belonging to
 * the group that member is in — A-B and B-C put A and C in one event even when they share
 * nothing — and in a large corpus those links compound. At 3,336 articles the old rule
 * produced a 393-article "event" holding 11.8% of all reporting across 41 of 65 tracked
 * states, scored confidence 71, feeding every one of those countries' risk vectors.
 *
 * Expressed as a fraction rather than a count so joining gets harder as a cluster grows,
 * which is exactly where chaining does its damage: one loose link into a large cluster is
 * cheap, and matching half of it is not.
 */
const COHESION = 0.5;
/**
 * Members compared when testing cohesion against a large cluster.
 *
 * A sample, because testing every member of a 400-article cluster for every candidate is
 * quadratic in the thing we are trying to keep small. Drawn evenly across the cluster
 * rather than from its head, so an early-formed core cannot speak for the whole.
 */
const COHESION_SAMPLE = 24;
/**
 * How much of each other two clusters must match before they are merged.
 *
 * Assignment alone cannot reunite a story that seeded as two clusters, because an article
 * only ever joins one — so the Nepal-Tibet flood came apart into twenty events. Merging
 * fixes that without reopening chaining: a single related pair across two clusters is the
 * very link that welded the 393-article blob, so a merge has to be justified by a share of
 * all cross pairs rather than by the existence of one.
 */
const MERGE_COHESION = 0.5;
/** Cross-cohesion is a product of two samples, so these stay small deliberately. */
const MERGE_SAMPLE = 8;
/** Merging can unlock further merges; bounded so a pathological corpus cannot spin. */
const MERGE_ROUNDS = 4;

const STOP = new Set([
  'the','a','an','and','or','but','of','in','on','at','to','for','with','by','from','as',
  'is','are','was','were','be','been','has','have','had','it','its','that','this','these',
  'says','said','after','over','amid','new','two','report','reports','news','will','not',
  'more','than','out','into','who','what','why','how','can','may','one','first','last',
]);

/**
 * Tokens for similarity. Latin words carry same-language pairs; the glossed English
 * terms are what let a Chinese and an English report of one event match at all, since
 * they share no surface tokens. CJK bigrams stand in for words in a script with no
 * spaces.
 */
export function tokens(a: Article): Set<string> {
  const out = new Set<string>();
  for (const w of a.title.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    if (!STOP.has(w)) out.add(w);
  }
  for (const g of a.glossed) out.add(`gl:${g.toLowerCase()}`);
  for (const h of a.hotspots) out.add(`hs:${h}`);
  const han = a.title.match(/[一-鿿]/g) ?? [];
  for (let i = 0; i < han.length - 1; i++) out.add(`bi:${han[i]}${han[i + 1]}`);
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

class UnionFind {
  private p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(x: number): number {
    while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; }
    return x;
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p[rb] = ra;
  }
}

/**
 * Two reports describe one event when they share actors, fall inside the time window,
 * and are textually close. Actor overlap is required rather than merely scored: a
 * Ukraine story and an LAC story can share plenty of vocabulary.
 *
 * Chinese character bigrams are treated as weaker evidence than words. Two unrelated
 * Chinese headlines that both mention 美国 and 国防部 share four bigrams and clear a
 * word-tuned threshold easily — that is how a Taiwan arms sale once merged with a
 * chip-maker's lawsuit. Bigram-only agreement must therefore clear a much higher bar.
 */
function related(
  a: Article, b: Article, ta: Set<string>, tb: Set<string>,
  idf: (token: string) => number, idfMin: number,
): boolean {
  if (Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) > WINDOW_HOURS * 3600_000) return false;
  if (a.domain !== b.domain) return false;
  if (!a.actors.some((x) => b.actors.includes(x))) return false;

  const shared = [...ta].filter((t) => tb.has(t));

  if (a.hotspots.length && b.hotspots.some((h) => a.hotspots.includes(h))) {
    // Same named flashpoint plus any textual overlap is enough.
    return jaccard(ta, tb) >= 0.08;
  }

  // Two matching glossed terms is a strong cross-language signal — it is the only way
  // an English and a Chinese report of one event can agree at all.
  if (shared.filter((t) => t.startsWith('gl:')).length >= 2) return true;

  const words = shared.filter((t) => !t.startsWith('bi:') && !t.startsWith('gl:'));
  if (words.length >= 2) {
    const weight = words.reduce((sum, t) => sum + idf(t), 0);
    if (weight >= idfMin) return true;
  }

  // No distinctive shared words: the pair is CJK-only, and bigrams must carry it alone.
  const bigrams = (t: Set<string>) => new Set([...t].filter((x) => x.startsWith('bi:')));
  return jaccard(bigrams(ta), bigrams(tb)) >= BIGRAM_MIN;
}

/**
 * Candidate generation via an inverted index. Comparing all pairs is O(n^2) and the
 * corpus is thousands of articles per run; this keeps it near-linear by only comparing
 * articles that already share uncommon tokens.
 */
export function clusterArticles(
  articles: Article[],
  opts: { cohesion?: number } = {},
): GeoEvent[] {
  // Overridable so the threshold can be swept against the real corpus rather than guessed.
  const cohesionMin = opts.cohesion ?? COHESION;
  const n = articles.length;
  if (n === 0) return [];

  const toks = articles.map(tokens);
  const index = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const t of toks[i]) {
      const arr = index.get(t);
      if (arr) arr.push(i); else index.set(t, [i]);
    }
  }
  // Tokens shared by a large share of the corpus carry no discriminating power.
  const CAP = Math.max(40, Math.floor(n * 0.04));
  // Inverse document frequency: how surprising is it that two headlines share this word?
  const scale = Math.max(n, IDF_CORPUS_FLOOR);
  const idf = (token: string) => Math.log(scale / Math.max(1, index.get(token)?.length ?? 1));
  const idfMin = IDF_FACTOR * Math.log(scale);

  const isRelated = (a: number, b: number) =>
    related(articles[a], articles[b], toks[a], toks[b], idf, idfMin);

  /** Evenly spread sample, so a cluster's founding members do not answer for all of it. */
  function sampleOf(group: number[]): number[] {
    if (group.length <= COHESION_SAMPLE) return group;
    const step = group.length / COHESION_SAMPLE;
    return Array.from({ length: COHESION_SAMPLE }, (_, k) => group[Math.floor(k * step)]);
  }

  // Incremental assignment rather than union-find. Union-find merges whole clusters on one
  // related pair, which is the chaining this rule exists to stop; here a report is placed
  // in the cluster it best matches, and two clusters are never welded by a single article.
  const groups: number[][] = [];
  const clusterOf = new Int32Array(n).fill(-1);
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const nearMiss = new Set<string>();

  for (let i = 0; i < n; i++) {
    const counts = new Map<number, number>();
    for (const t of toks[i]) {
      const posting = index.get(t)!;
      if (posting.length > CAP) continue;
      for (const j of posting) {
        if (j >= i) continue;
        counts.set(j, (counts.get(j) ?? 0) + 1);
      }
    }

    // Clusters worth testing: those holding at least one report this one is related to.
    // Anything with no related member cannot clear a cohesion bar, so it is not tested.
    const known = new Map<number, boolean>();
    const candidates = new Set<number>();
    for (const [j, shared] of counts) {
      if (shared < MIN_SHARED_TOKENS) continue;
      const ok = isRelated(i, j);
      known.set(j, ok);
      if (ok) candidates.add(clusterOf[j]);
    }

    let bestCluster = -1;
    let bestScore = 0;
    for (const c of candidates) {
      const sample = sampleOf(groups[c]);
      let hits = 0;
      for (const m of sample) {
        const cached = known.get(m);
        if (cached !== undefined ? cached : isRelated(i, m)) hits += 1;
      }
      const score = hits / sample.length;
      if (score >= cohesionMin && score > bestScore) { bestScore = score; bestCluster = c; }
    }

    if (bestCluster >= 0) {
      groups[bestCluster].push(i);
      clusterOf[i] = bestCluster;
    } else {
      clusterOf[i] = groups.length;
      groups.push([i]);
    }

    // Clusters this report was related to but did not join. These are the only pairs worth
    // testing for a merge: two clusters with nothing relating them cannot clear the bar.
    for (const c of candidates) {
      if (c !== clusterOf[i]) nearMiss.add(pairKey(clusterOf[i], c));
    }
  }

  /** Share of cross pairs that are related — average linkage, sampled. */
  function crossCohesion(a: number[], b: number[]): number {
    const sa = sampleOf(a).slice(0, MERGE_SAMPLE);
    const sb = sampleOf(b).slice(0, MERGE_SAMPLE);
    let hits = 0;
    for (const x of sa) for (const y of sb) if (isRelated(x, y)) hits += 1;
    return hits / (sa.length * sb.length);
  }

  // Union-find over clusters, not articles. The chaining risk it used to carry is gone,
  // because what it now unions is a merge already justified across the whole of both.
  const cf = new UnionFind(groups.length);
  for (let round = 0; round < MERGE_ROUNDS; round++) {
    let mergedAny = false;
    for (const key of nearMiss) {
      const [x, y] = key.split(':').map(Number);
      const ra = cf.find(x), rb = cf.find(y);
      if (ra === rb) continue;
      if (crossCohesion(groups[ra], groups[rb]) < MERGE_COHESION) continue;
      groups[ra] = groups[ra].concat(groups[rb]);
      groups[rb] = [];
      cf.union(ra, rb);
      // union() may root the merged pair at either side; keep the members where they are.
      if (cf.find(ra) !== ra) { groups[cf.find(ra)] = groups[ra]; groups[ra] = []; }
      mergedAny = true;
    }
    if (!mergedAny) break;
  }

  return groups
    .filter((g) => g.length > 0)
    .map((g) => g.map((i) => articles[i]))
    .map(buildEvent)
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}

function pick<T>(xs: T[], f: (x: T) => number): T {
  return xs.reduce((best, x) => (f(x) > f(best) ? x : best), xs[0]);
}

function buildEvent(cluster: Article[]): GeoEvent {
  const times = cluster.map((a) => Date.parse(a.publishedAt)).sort((x, y) => x - y);
  // Prefer an English headline from the strongest outlet for the card.
  const english = cluster.filter((a) => a.language === 'en');
  const lead = pick(english.length ? english : cluster, (a) => (a.tier === 1 ? 3 : a.tier === 2 ? 2 : 1));
  const verdict = scoreConfidence(cluster);
  const withLadder = cluster.filter((a) => a.ladderRung !== null)
    .sort((a, b) => (b.ladderRung ?? 0) - (a.ladderRung ?? 0))[0];

  const escalations = cluster.map((a) => a.escalation).sort((x, y) => x - y);
  const median = escalations[Math.floor(escalations.length / 2)];

  return {
    id: cluster.map((a) => a.id).sort()[0] + (cluster.length > 1 ? `_${cluster.length}` : ''),
    title: lead.title,
    summary: cluster.find((a) => a.snippet)?.snippet ?? '',
    firstSeen: new Date(times[0]).toISOString(),
    lastSeen: new Date(times[times.length - 1]).toISOString(),
    actors: [...new Set(cluster.flatMap((a) => a.actors))],
    hotspots: [...new Set(cluster.flatMap((a) => a.hotspots))],
    domain: lead.domain,
    // Median, not max: one hyperbolic tabloid should not define an event's severity.
    escalation: median,
    confidence: verdict.confidence,
    signals: verdict.signals,
    flags: verdict.flags,
    articleIds: cluster.map((a) => a.id),
    languages: [...new Set(cluster.map((a) => a.language))],
    countries: [...new Set(cluster.map((a) => a.sourceCountry))],
    imageUrl: cluster.find((a) => a.imageUrl)?.imageUrl ?? null,
    videoId: cluster.find((a) => a.videoId)?.videoId ?? null,
    ladderRung: withLadder?.ladderRung ?? null,
    ladderZh: withLadder?.ladderZh ?? null,
    ladderEn: withLadder?.ladderEn ?? null,
  };
}
