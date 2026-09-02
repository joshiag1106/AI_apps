import { createHash } from 'node:crypto';
import { fetchFeed, parseFeed } from '@/lib/ingest/rss';
import { DIRECT_FEEDS, VIDEO_FEEDS, BEATS, googleNewsUrl, LOCALES, type LocaleKey } from '@/data/feeds';
import { resolveSource } from '@/data/sources';
import { resolveActors } from '@/lib/analyze/entities';
import { scoreText, glossHeadline } from '@/lib/analyze/score';
import { clusterArticles } from '@/lib/verify/cluster';
import { TREND_SERIES_DAYS } from '@/lib/risk';
import { upsertArticles, replaceEvents, allArticles, deleteArticles, setMeta } from '@/lib/db';
import type { Article, RawArticle } from '@/lib/types';

export const articleId = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 16);

/** Resolve provenance and run the analysis passes over one raw article. */
export function enrich(raw: RawArticle): Article {
  const src = resolveSource(raw.outlet, raw.url);
  const text = `${raw.title} ${raw.snippet}`;
  const { actors, hotspots } = resolveActors(text);
  const s = scoreText(raw.title, raw.snippet);
  const relevant = isRelevant(actors, hotspots, s);

  return {
    ...raw,
    id: articleId(raw.url),
    // Trust the feed's locale over script detection when the feed declares one:
    // a Chinese outlet's English-language wire copy is still a Chinese-source item.
    language: raw.language,
    sourceCountry: src.country,
    ownership: src.ownership,
    tier: src.tier,
    isPrimary: !!src.primary,
    outlet: src.name === 'Unknown source' ? raw.outlet : src.name,
    actors, hotspots,
    domain: s.domain,
    escalation: s.escalation,
    framing: s.framing,
    ladderRung: s.ladderRung,
    ladderZh: s.ladderZh,
    ladderEn: s.ladderEn,
    glossed: s.glossed,
    titleEn: glossHeadline(raw.title, raw.language),
    relevant,
  };
}

/**
 * Does this report carry a geopolitical security signal at all?
 *
 * General world feeds (BBC World, Al Jazeera) surface plenty of items that merely name
 * a country — wildfires, sport, a bread-dumping investigation. Naming one state and
 * nothing else is not a security event. Any of the following qualifies it: a named
 * flashpoint, two or more state actors, security vocabulary in any language, or
 * recognised Chinese geopolitical terminology.
 */
export function isRelevant(
  actors: string[], hotspots: string[], s: { matchedTerms: string[]; glossed: string[]; ladderRung: number | null },
): boolean {
  return hotspots.length > 0
    || actors.length >= 2
    || s.matchedTerms.length > 0
    || s.glossed.length > 0
    || s.ladderRung !== null;
}

function normaliseTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
}

/** Drop exact URL repeats and same-outlet near-identical headlines. */
export function dedupe(items: Article[]): Article[] {
  const byUrl = new Map<string, Article>();
  for (const a of items) if (!byUrl.has(a.url)) byUrl.set(a.url, a);

  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of byUrl.values()) {
    const key = `${a.outlet.toLowerCase()}|${normaliseTitle(a.title).slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * How long a fetched article stays in the corpus.
 *
 * Pinned to the deepest read any feature makes, not picked freely: the dyad trend chart
 * plots TREND_SERIES_DAYS of daily buckets, so pruning tighter than that would hollow
 * out the chart's early buckets and flatten the trend it reports.
 *
 * A bound is needed at all because clustering runs over the entire stored corpus. With
 * no upper bound the corpus only grows, and articles that can no longer corroborate
 * anything — nothing published within 60 hours of them is still arriving — go on
 * competing for cluster membership. The corpus had reached a 23-year span this way.
 */
export const CORPUS_RETENTION_DAYS = TREND_SERIES_DAYS;

/**
 * Articles past the retention horizon. An unparseable date is left alone deliberately:
 * that is a parser bug worth finding, and deleting the evidence would hide it.
 */
export function expiredArticleIds(articles: Article[], now = Date.now()): string[] {
  const cutoff = now - CORPUS_RETENTION_DAYS * 86_400_000;
  return articles
    .filter((a) => {
      const t = Date.parse(a.publishedAt);
      return Number.isFinite(t) && t < cutoff;
    })
    .map((a) => a.id);
}

export interface FetchTask { url: string; outlet?: string; beatId?: string | null; locale?: LocaleKey | null; language?: string }

export function buildTasks(): FetchTask[] {
  const tasks: FetchTask[] = [...DIRECT_FEEDS, ...VIDEO_FEEDS]
    .map((f) => ({ url: f.url, outlet: f.outlet, beatId: null, locale: null, language: f.language }));
  for (const beat of BEATS) {
    for (const q of beat.queries) {
      tasks.push({ url: googleNewsUrl(q.q, q.locale), beatId: beat.id, locale: q.locale });
    }
  }
  return tasks;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export interface IngestReport {
  pruned: number;
  /** Counted apart from `pruned`: dropped for age, not for failing the relevance gate. */
  expired: number;
  tasks: number;
  ok: number;
  failed: { url: string; error: string }[];
  rawArticles: number;
  stored: number;
  events: number;
  byLanguage: Record<string, number>;
  durationMs: number;
}

export async function runIngest(opts: { concurrency?: number; log?: (s: string) => void } = {}): Promise<IngestReport> {
  const log = opts.log ?? (() => {});
  const started = Date.now();
  const tasks = buildTasks();
  const failed: { url: string; error: string }[] = [];
  const collected: Article[] = [];

  log(`fetching ${tasks.length} feeds...`);
  await pool(tasks, opts.concurrency ?? 6, async (t) => {
    try {
      const xml = await fetchFeed(t.url);
      // A feed's declared language beats script detection: a Chinese outlet's
      // English wire copy and an English outlet's Chinese service both exist.
      const langHint = t.language ?? (t.locale ? LOCALES[t.locale].language : undefined);
      const raws = parseFeed(xml, {
        defaultOutlet: t.outlet,
        beatId: t.beatId ?? null,
        localeKey: t.locale ?? null,
        languageHint: langHint,
      });
      for (const r of raws) collected.push(enrich(r));
    } catch (err) {
      failed.push({ url: t.url, error: err instanceof Error ? err.message : String(err) });
    }
  });

  const deduped = dedupe(collected);
  // Articles that name no actor cannot be placed on any map or dyad, and those with no
  // security signal at all are general news that happens to mention a state.
  const usable = deduped.filter((a) => a.actors.length > 0 && a.relevant);
  log(`parsed ${collected.length} -> ${deduped.length} unique -> ${usable.length} relevant`);

  upsertArticles(usable);

  // Re-evaluate the whole stored corpus against the current rules, so a change to the
  // lexicon or the relevance gate takes effect on old rows instead of only new ones.
  const stored = allArticles(8000);
  const stale = stored.filter((a) => {
    const s2 = scoreText(a.title, a.snippet);
    return a.actors.length === 0 || !isRelevant(a.actors, a.hotspots, s2);
  });
  if (stale.length) {
    deleteArticles(stale.map((a) => a.id));
    log(`pruned ${stale.length} stored articles that no longer pass the relevance gate`);
  }

  // Age is the other reason to drop a row. Without this the corpus only ever grows, and
  // articles too old to corroborate anything keep competing for cluster membership.
  const expired = expiredArticleIds(allArticles(8000));
  if (expired.length) {
    deleteArticles(expired);
    log(`pruned ${expired.length} stored articles older than ${CORPUS_RETENTION_DAYS} days`);
  }

  // Cluster over the whole stored corpus so today's reports can join an older event.
  const events = clusterArticles(allArticles(8000));
  replaceEvents(events);
  setMeta('last_ingest', new Date().toISOString());
  log(`clustered into ${events.length} events`);

  // Ladder alerts run here because this is the moment new events exist. Failure is
  // contained: a mail provider being down must not fail the refresh that everything else
  // on the site depends on.
  try {
    const { runAlerts } = await import('@/lib/alerts/run');
    const r = await runAlerts(events, { log });
    if (r.jumps) log(`alerts: ${r.jumps} jump(s), ${r.mailed} mailed, ${r.skipped} unconfigured, ${r.failed} failed`);
  } catch (e) {
    log(`alerts skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const byLanguage: Record<string, number> = {};
  for (const a of usable) byLanguage[a.language] = (byLanguage[a.language] ?? 0) + 1;

  return {
    pruned: stale.length,
    expired: expired.length,
    tasks: tasks.length, ok: tasks.length - failed.length, failed,
    rawArticles: collected.length, stored: usable.length, events: events.length,
    byLanguage, durationMs: Date.now() - started,
  };
}
