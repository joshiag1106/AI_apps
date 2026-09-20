import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scoreText } from '@/lib/analyze/score';
import { ladderPatches } from '@/lib/ingest/pipeline';
import type { Article } from '@/lib/types';

let n = 0;
function art(p: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `t${String(n).padStart(4, '0')}`, url: `https://x/target/${n}`,
    title: '中方已向日方提出严正交涉', outlet: 'Xinhua',
    publishedAt: '2026-09-19T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: true, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}
const beijing = { ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations', ladderSpeaker: 'prc' as const };

/** The target is only meaningful when Beijing is the one speaking. */
describe('analysis records whom the formula is about', () => {
  it('says Japan for Beijing’s formula to Japan', () => {
    const s = scoreText('中方已向日方提出严正交涉');
    expect(s.ladderSpeaker).toBe('prc');
    expect(s.ladderTarget).toBe('JPN');
  });

  it('says nothing for a formula that is not Beijing’s, even when a state is plain', () => {
    const s = scoreText('印方强烈不满，紧急召见巴方外交人员');
    expect(s.ladderSpeaker).toBe('other');
    expect(s.ladderTarget).toBeNull();
  });

  it('says nothing when the headline does not name one', () => {
    const s = scoreText('中方严正交涉');
    expect(s.ladderSpeaker).toBe('prc');
    expect(s.ladderTarget).toBeNull();
  });

  it('says nothing when there is no formula', () => {
    expect(scoreText('今天天气很好').ladderTarget).toBeNull();
  });
});

describe('the target is stored with the article', () => {
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-target-')), 'test.db');
    db = await import('@/lib/db');
  });

  it('round-trips through the database', () => {
    const a = art({ ...beijing, ladderTarget: 'JPN' });
    db.upsertArticles([a]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBe('JPN');
  });

  it('reads back null for an article stored without one', () => {
    const a = art({ title: '一则没有措辞的标题' });
    db.upsertArticles([a]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBeNull();
  });

  it('rewrites the target when the same article is stored again', () => {
    const a = art({ ...beijing, ladderTarget: null });
    db.upsertArticles([a]);
    db.upsertArticles([{ ...a, ladderTarget: 'JPN' }]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBe('JPN');
  });

  it('is patched onto a stored row by updateLadders', () => {
    const a = art({ ...beijing });
    db.upsertArticles([a]);
    db.updateLadders([{ id: a.id, ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'x', ladderSpeaker: 'prc', ladderTarget: 'JPN' }]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderTarget).toBe('JPN');
  });
});

describe('the trail accessors', () => {
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    vi.resetModules();
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-trail-')), 'test.db');
    db = await import('@/lib/db');
  });

  it('report no start when the corpus is empty', () => {
    expect(db.corpusSince()).toBeNull();
    expect(db.ladderTrailArticles()).toEqual([]);
  });

  it('return only Beijing-attributed rung articles, oldest first', () => {
    const late = art({ ...beijing, publishedAt: '2026-09-10T08:00:00.000Z', ladderTarget: 'JPN' });
    const early = art({ ...beijing, publishedAt: '2026-09-01T08:00:00.000Z', ladderTarget: 'PHL' });
    const other = art({ ...beijing, ladderSpeaker: 'other', publishedAt: '2026-09-05T08:00:00.000Z' });
    const unclear = art({ ...beijing, ladderSpeaker: 'unclear', publishedAt: '2026-09-06T08:00:00.000Z' });
    const bare = art({ title: '没有措辞', publishedAt: '2026-08-30T08:00:00.000Z' });
    db.upsertArticles([late, early, other, unclear, bare]);
    expect(db.ladderTrailArticles().map((a) => a.id)).toEqual([early.id, late.id]);
  });

  it('start the corpus at its earliest real article, ignoring a placeholder date', () => {
    db.upsertArticles([art({ title: '没有日期的稿件', publishedAt: '1970-01-01T00:00:00.000Z' })]);
    // Collection began long before the earliest article, so the article decides.
    db.getDb().exec("UPDATE articles SET ingested_at = '2026-08-01T00:00:00.000Z'");
    expect(db.corpusSince()).toBe('2026-08-30T08:00:00.000Z');
  });

  it('do not start the corpus at a straggler that predates the collection', () => {
    // The live site began ingesting on 17 Sep, and the feeds reach back about seven days. It also
    // holds 98 articles dated July and August, one to three a day, that got in some other way.
    // "Collecting since 3 Jul" was false, and "no formula found since 3 Jul" worse: before roughly
    // 10 Sep nothing was collected systematically, so an absence there says nothing.
    db.upsertArticles([art({ title: '一篇更早发表的稿件', publishedAt: '2026-07-03T08:53:00.000Z' })]);
    db.getDb().exec("UPDATE articles SET ingested_at = '2026-09-17T15:21:18.128Z'");
    expect(db.corpusSince()).toBe('2026-09-10T15:21:18.128Z');
  });

  it('find the event each article belongs to, and nothing for one that belongs to none', () => {
    const ev = (id: string, articleIds: string[]) => ({
      id, title: id, summary: '', firstSeen: '2026-07-13T00:00:00.000Z', lastSeen: '2026-07-13T00:00:00.000Z',
      actors: [], people: [], hotspots: [], domain: 'Diplomatic' as const, escalation: 0, confidence: 50,
      signals: [], flags: [], articleIds, languages: ['zh'], countries: [], imageUrl: null, videoId: null,
      ladderRung: null, ladderZh: null, ladderEn: null,
    });
    db.replaceEvents([ev('ev-a', ['a1', 'a2']), ev('ev-b', ['b1'])]);
    const found = db.eventIdsByArticle(['a2', 'b1', 'orphan']);
    expect([...found.entries()].sort()).toEqual([['a2', 'ev-a'], ['b1', 'ev-b']]);
    expect(db.eventIdsByArticle([]).size).toBe(0);
  });
});

describe('the trail’s links to events', () => {
  it('are looked up directly, not through the newest-4,000 display corpus', () => {
    // corpus() keeps only the newest 4,000 events, so the oldest dots — the ones a reader most
    // wants to check — lost their links: 4 of 15 in the real build, on a database of 4,267 events.
    const src = readFileSync('lib/queries.ts', 'utf8');
    const body = src.slice(src.indexOf('export const ladderTrailData'));
    expect(body).toContain('eventIdsByArticle');
    expect(body.slice(0, body.indexOf('});'))).not.toContain('corpus()');
  });
});

describe('a database created before the column existed', () => {
  it('gains it, and opening it again is harmless', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'kautilya-legacy-target-')), 'legacy.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE articles (
      id TEXT PRIMARY KEY, url TEXT UNIQUE, title TEXT, outlet TEXT,
      published_at TEXT, snippet TEXT, image_url TEXT, language TEXT,
      beat_id TEXT, locale_key TEXT, source_country TEXT, ownership TEXT,
      tier INTEGER, is_primary INTEGER, actors TEXT, hotspots TEXT, domain TEXT,
      escalation REAL, framing REAL, ladder_rung INTEGER, ladder_zh TEXT,
      ladder_en TEXT, ladder_speaker TEXT, glossed TEXT, title_en TEXT, relevant INTEGER, video_id TEXT, ingested_at TEXT)`);
    old.close();

    process.env.KAUTILYA_DB = path;
    vi.resetModules();
    const first = await import('@/lib/db');
    const cols = (first.getDb().prepare('PRAGMA table_info(articles)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('ladder_target');

    vi.resetModules();
    const again = await import('@/lib/db');
    expect(() => again.getDb()).not.toThrow();
  });
});

describe('back-filling rows that are already stored', () => {
  it('patches a Beijing row that has no target yet', () => {
    const stored = art({ ...beijing });
    const patches = ladderPatches([stored]);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ id: stored.id, ladderSpeaker: 'prc', ladderTarget: 'JPN' });
  });

  it('leaves a row that is already right alone', () => {
    const s = scoreText('中方已向日方提出严正交涉');
    const stored = art({ ladderRung: s.ladderRung, ladderZh: s.ladderZh, ladderEn: s.ladderEn, ladderSpeaker: s.ladderSpeaker, ladderTarget: s.ladderTarget });
    expect(ladderPatches([stored])).toEqual([]);
  });

  it('leaves a row with no formula alone', () => {
    expect(ladderPatches([art({ title: '今天天气很好' })])).toEqual([]);
  });
});
