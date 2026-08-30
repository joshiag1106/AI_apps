import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { Article, GeoEvent } from '@/lib/types';

// node:sqlite is built into Node 24, so there is no native module to compile or ship.
// better-sqlite3's prebuilt binary aborts during GC teardown on this Node version.
let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const file = process.env.KAUTILYA_DB ?? path.join(process.cwd(), 'kautilya.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  _db = db;
  return db;
}

/** node:sqlite has no transaction() helper; wrap explicitly and roll back on error. */
function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, url TEXT UNIQUE, title TEXT, outlet TEXT,
      published_at TEXT, snippet TEXT, image_url TEXT, language TEXT,
      beat_id TEXT, locale_key TEXT, source_country TEXT, ownership TEXT,
      tier INTEGER, is_primary INTEGER, actors TEXT, hotspots TEXT, domain TEXT,
      escalation REAL, framing REAL, ladder_rung INTEGER, ladder_zh TEXT,
      ladder_en TEXT, glossed TEXT, title_en TEXT, relevant INTEGER, video_id TEXT, ingested_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_lang ON articles(language);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, title TEXT, summary TEXT, first_seen TEXT, last_seen TEXT,
      actors TEXT, hotspots TEXT, domain TEXT, escalation REAL, confidence REAL,
      signals TEXT, flags TEXT, article_ids TEXT, languages TEXT, countries TEXT,
      image_url TEXT, video_id TEXT, ladder_rung INTEGER, ladder_zh TEXT, ladder_en TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_last ON events(last_seen DESC);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
      plan TEXT DEFAULT 'free', created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, action TEXT,
      target TEXT, created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_usage_subject ON usage(subject);

    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

    -- Failed-login throttling. Kept in the database rather than in memory so it
    -- survives a restart, which is exactly when an attacker would retry.
    CREATE TABLE IF NOT EXISTS login_attempts (
      subject TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL
    );

    -- Optional LLM layer output, keyed by (model, event, article set) so a second
    -- viewer of the same event costs nothing and sees the same analysis.
    CREATE TABLE IF NOT EXISTS llm_cache (
      key TEXT PRIMARY KEY, event_id TEXT, model TEXT, output TEXT, created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_llm_event ON llm_cache(event_id);
  `);

  // Additive column migrations for databases created before a field existed.
  // node:sqlite has no "ADD COLUMN IF NOT EXISTS", so check the table first.
  const cols = new Set(
    (db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('relevant')) {
    db.exec('ALTER TABLE articles ADD COLUMN relevant INTEGER DEFAULT 1');
  }
  if (!cols.has('video_id')) {
    db.exec('ALTER TABLE articles ADD COLUMN video_id TEXT');
  }
  const eventCols = new Set(
    (db.prepare('PRAGMA table_info(events)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!eventCols.has('video_id')) {
    db.exec('ALTER TABLE events ADD COLUMN video_id TEXT');
  }
}

/** Remove stored articles by id. Used to prune rows that no longer pass the filters. */
export function deleteArticles(ids: string[]): number {
  if (!ids.length) return 0;
  const db = getDb();
  const stmt = db.prepare('DELETE FROM articles WHERE id = ?');
  tx(db, () => { for (const id of ids) stmt.run(id); });
  return ids.length;
}

const J = (v: unknown) => JSON.stringify(v ?? []);
/** node:sqlite binds only null/number/string/bigint/buffer. */
const S = (v: unknown): string | number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return String(v);
};
const P = <T,>(s: unknown, fb: T): T => {
  try { return typeof s === 'string' ? (JSON.parse(s) as T) : fb; } catch { return fb; }
};

export function upsertArticles(rows: Article[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO articles (id,url,title,outlet,published_at,snippet,image_url,language,
      beat_id,locale_key,source_country,ownership,tier,is_primary,actors,hotspots,domain,
      escalation,framing,ladder_rung,ladder_zh,ladder_en,glossed,title_en,relevant,video_id,ingested_at)
    VALUES (@id,@url,@title,@outlet,@published_at,@snippet,@image_url,@language,
      @beat_id,@locale_key,@source_country,@ownership,@tier,@is_primary,@actors,@hotspots,@domain,
      @escalation,@framing,@ladder_rung,@ladder_zh,@ladder_en,@glossed,@title_en,@relevant,@video_id,@ingested_at)
    ON CONFLICT(url) DO UPDATE SET
      title=excluded.title, snippet=excluded.snippet,
      image_url=COALESCE(excluded.image_url, articles.image_url),
      -- Provenance and analysis are recomputed from current rules on every ingest, so a
      -- corrected source registry or lexicon repairs rows that are already stored.
      outlet=excluded.outlet, source_country=excluded.source_country,
      ownership=excluded.ownership, tier=excluded.tier, is_primary=excluded.is_primary,
      actors=excluded.actors, hotspots=excluded.hotspots, domain=excluded.domain,
      escalation=excluded.escalation, framing=excluded.framing,
      ladder_rung=excluded.ladder_rung, ladder_zh=excluded.ladder_zh,
      ladder_en=excluded.ladder_en, glossed=excluded.glossed,
      title_en=excluded.title_en, relevant=excluded.relevant, video_id=excluded.video_id
  `);
  const now = new Date().toISOString();
  tx(db, () => {
    for (const a of rows) {
      stmt.run({
        id: S(a.id), url: S(a.url), title: S(a.title), outlet: S(a.outlet),
        published_at: S(a.publishedAt), snippet: S(a.snippet), image_url: S(a.imageUrl),
        language: S(a.language), beat_id: S(a.beatId), locale_key: S(a.localeKey),
        source_country: S(a.sourceCountry), ownership: S(a.ownership), tier: S(a.tier),
        is_primary: a.isPrimary ? 1 : 0, actors: J(a.actors), hotspots: J(a.hotspots),
        domain: S(a.domain), escalation: S(a.escalation), framing: S(a.framing),
        ladder_rung: S(a.ladderRung), ladder_zh: S(a.ladderZh), ladder_en: S(a.ladderEn),
        glossed: J(a.glossed), title_en: S(a.titleEn), relevant: a.relevant ? 1 : 0,
        video_id: S(a.videoId), ingested_at: now,
      });
    }
  });
  return rows.length;
}

function rowToArticle(r: any): Article {
  return {
    id: r.id, url: r.url, title: r.title, outlet: r.outlet, publishedAt: r.published_at,
    snippet: r.snippet ?? '', imageUrl: r.image_url, language: r.language,
    beatId: r.beat_id, localeKey: r.locale_key, sourceCountry: r.source_country,
    ownership: r.ownership, tier: r.tier, isPrimary: !!r.is_primary,
    actors: P(r.actors, []), hotspots: P(r.hotspots, []), domain: r.domain,
    escalation: r.escalation, framing: r.framing, ladderRung: r.ladder_rung,
    ladderZh: r.ladder_zh, ladderEn: r.ladder_en, glossed: P(r.glossed, []),
    titleEn: r.title_en, relevant: r.relevant !== 0, videoId: r.video_id ?? null,
  };
}

export function allArticles(limit = 5000): Article[] {
  return getDb().prepare('SELECT * FROM articles ORDER BY published_at DESC LIMIT ?')
    .all(limit).map(rowToArticle);
}

export function articlesByIds(ids: string[]): Article[] {
  if (!ids.length) return [];
  const q = ids.map(() => '?').join(',');
  return getDb().prepare(`SELECT * FROM articles WHERE id IN (${q})`).all(...ids).map(rowToArticle);
}

export function replaceEvents(events: GeoEvent[]) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO events (id,title,summary,first_seen,last_seen,actors,hotspots,
      domain,escalation,confidence,signals,flags,article_ids,languages,countries,image_url,
      video_id,ladder_rung,ladder_zh,ladder_en)
    VALUES (@id,@title,@summary,@first_seen,@last_seen,@actors,@hotspots,@domain,@escalation,
      @confidence,@signals,@flags,@article_ids,@languages,@countries,@image_url,
      @video_id,@ladder_rung,@ladder_zh,@ladder_en)
  `);
  tx(db, () => {
    db.exec('DELETE FROM events');
    for (const e of events) {
      stmt.run({
        id: S(e.id), title: S(e.title), summary: S(e.summary), first_seen: S(e.firstSeen),
        last_seen: S(e.lastSeen), actors: J(e.actors), hotspots: J(e.hotspots),
        domain: S(e.domain), escalation: S(e.escalation), confidence: S(e.confidence),
        signals: J(e.signals), flags: J(e.flags), article_ids: J(e.articleIds),
        languages: J(e.languages), countries: J(e.countries), image_url: S(e.imageUrl),
        video_id: S(e.videoId),
        ladder_rung: S(e.ladderRung), ladder_zh: S(e.ladderZh), ladder_en: S(e.ladderEn),
      });
    }
  });
}

function rowToEvent(r: any): GeoEvent {
  return {
    id: r.id, title: r.title, summary: r.summary ?? '', firstSeen: r.first_seen,
    lastSeen: r.last_seen, actors: P(r.actors, []), hotspots: P(r.hotspots, []),
    domain: r.domain, escalation: r.escalation, confidence: r.confidence,
    signals: P(r.signals, []), flags: P(r.flags, []), articleIds: P(r.article_ids, []),
    languages: P(r.languages, []), countries: P(r.countries, []), imageUrl: r.image_url,
    videoId: r.video_id ?? null,
    ladderRung: r.ladder_rung, ladderZh: r.ladder_zh, ladderEn: r.ladder_en,
  };
}

export function allEvents(limit = 3000): GeoEvent[] {
  return getDb().prepare('SELECT * FROM events ORDER BY last_seen DESC LIMIT ?')
    .all(limit).map(rowToEvent);
}

export function eventById(id: string): GeoEvent | null {
  const r = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id);
  return r ? rowToEvent(r) : null;
}

/** Count stored articles by language. Used for headline figures that must be exact. */
export function articleCountByLanguage(language: string): number {
  const r = getDb().prepare('SELECT COUNT(*) AS c FROM articles WHERE language = ?')
    .get(language) as { c: number } | undefined;
  return Number(r?.c ?? 0);
}

export function articlesByLanguage(language: string, limit = 2000): Article[] {
  return getDb()
    .prepare('SELECT * FROM articles WHERE language = ? ORDER BY published_at DESC LIMIT ?')
    .all(language, limit).map(rowToArticle);
}

export function setMeta(key: string, value: string) {
  getDb().prepare('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)').run(key, value);
}
export function getMeta(key: string): string | null {
  const r = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return r?.value ?? null;
}
