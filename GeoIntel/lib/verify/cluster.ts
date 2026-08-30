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
export function clusterArticles(articles: Article[]): GeoEvent[] {
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

  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    const counts = new Map<number, number>();
    for (const t of toks[i]) {
      const posting = index.get(t)!;
      if (posting.length > CAP) continue;
      for (const j of posting) {
        if (j <= i) continue;
        counts.set(j, (counts.get(j) ?? 0) + 1);
      }
    }
    for (const [j, shared] of counts) {
      if (shared < MIN_SHARED_TOKENS) continue;
      if (uf.find(i) === uf.find(j)) continue;
      if (related(articles[i], articles[j], toks[i], toks[j], idf, idfMin)) uf.union(i, j);
    }
  }

  const groups = new Map<number, Article[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    const g = groups.get(r);
    if (g) g.push(articles[i]); else groups.set(r, [articles[i]]);
  }

  return [...groups.values()]
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
