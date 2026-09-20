import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
    id: `s${String(n).padStart(4, '0')}`, url: `https://x/speaker/${n}`,
    title: '中方已向日方提出严正交涉', outlet: 'Xinhua',
    publishedAt: '2026-09-19T10:00:00.000Z', snippet: '', imageUrl: null, language: 'zh',
    beatId: null, localeKey: null, sourceCountry: 'CHN', ownership: 'state', tier: 2,
    isPrimary: true, actors: ['CHN', 'JPN'], people: [], hotspots: [], domain: 'Diplomatic',
    escalation: 0, framing: 0, ladderRung: null, ladderZh: null, ladderEn: null,
    glossed: [], titleEn: null, relevant: true, videoId: null, ...p,
  };
}

/**
 * A rung says a formula is PRESENT; the speaker says whose it is. It has to be recorded when the
 * article is analysed, stored with it, and — because stored rows are only re-analysed when they
 * are re-fetched — back-filled onto rows already in the database.
 */
describe('analysis records whose formula it is', () => {
  it('says Beijing when Beijing speaks', () => {
    const s = scoreText('中方已向日方提出严正交涉');
    expect(s.ladderRung).toBe(4);
    expect(s.ladderSpeaker).toBe('prc');
  });

  it('says another party when another party does', () => {
    const s = scoreText('印方强烈不满，紧急召见巴方外交人员');
    expect(s.ladderRung).not.toBeNull();
    expect(s.ladderSpeaker).toBe('other');
  });

  it('records nothing when there is no formula', () => {
    const s = scoreText('今天天气很好');
    expect(s.ladderRung).toBeNull();
    expect(s.ladderSpeaker).toBeNull();
  });

  it('still adds the formula to the escalation score whoever says it', () => {
    // Escalation is about tension, not about Beijing: India and Pakistan protesting each other
    // still registers. Only the PRC-labelled surfaces change.
    const other = scoreText('印方强烈不满，紧急召见巴方外交人员');
    const none = scoreText('印方紧急召见巴方外交人员');
    expect(other.escalation).toBeGreaterThan(none.escalation);
  });
});

describe('the speaker is stored with the article', () => {
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-speaker-')), 'test.db');
    db = await import('@/lib/db');
  });

  it('round-trips through the database', () => {
    const a = art({ ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations', ladderSpeaker: 'prc' });
    const b = art({ title: '印方强烈不满', ladderRung: 5, ladderZh: '强烈不满', ladderEn: 'strong dissatisfaction', ladderSpeaker: 'other' });
    db.upsertArticles([a, b]);
    const back = db.allArticles(100);
    expect(back.find((x) => x.id === a.id)!.ladderSpeaker).toBe('prc');
    expect(back.find((x) => x.id === b.id)!.ladderSpeaker).toBe('other');
  });

  it('reads back null for an article stored without one', () => {
    const a = art({ title: '一则没有措辞的标题' });
    db.upsertArticles([a]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderSpeaker).toBeNull();
  });

  it('rewrites the speaker when the same article is stored again', () => {
    const a = art({ ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'x', ladderSpeaker: 'unclear' });
    db.upsertArticles([a]);
    db.upsertArticles([{ ...a, ladderSpeaker: 'prc' }]);
    expect(db.allArticles(100).find((x) => x.id === a.id)!.ladderSpeaker).toBe('prc');
  });
});

describe('a database created before the column existed', () => {
  it('gains it, and opening it again is harmless', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'kautilya-legacy-')), 'legacy.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE articles (
      id TEXT PRIMARY KEY, url TEXT UNIQUE, title TEXT, outlet TEXT,
      published_at TEXT, snippet TEXT, image_url TEXT, language TEXT,
      beat_id TEXT, locale_key TEXT, source_country TEXT, ownership TEXT,
      tier INTEGER, is_primary INTEGER, actors TEXT, hotspots TEXT, domain TEXT,
      escalation REAL, framing REAL, ladder_rung INTEGER, ladder_zh TEXT,
      ladder_en TEXT, glossed TEXT, title_en TEXT, relevant INTEGER, video_id TEXT, ingested_at TEXT)`);
    old.close();

    process.env.KAUTILYA_DB = path;
    vi.resetModules();
    const first = await import('@/lib/db');
    const cols = (first.getDb().prepare('PRAGMA table_info(articles)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('ladder_speaker');

    vi.resetModules();
    const again = await import('@/lib/db');
    expect(() => again.getDb()).not.toThrow();
  });
});

describe('back-filling rows that are already stored', () => {
  it('patches a row that has a formula but no speaker', () => {
    const stored = art({ title: '中方已向日方提出严正交涉', ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations' });
    const patches = ladderPatches([stored]);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ id: stored.id, ladderRung: 4, ladderSpeaker: 'prc' });
  });

  it('leaves a row that is already right alone', () => {
    const s = scoreText('中方已向日方提出严正交涉');
    const stored = art({ title: '中方已向日方提出严正交涉', ladderRung: s.ladderRung, ladderZh: s.ladderZh, ladderEn: s.ladderEn, ladderSpeaker: s.ladderSpeaker, ladderTarget: s.ladderTarget });
    expect(ladderPatches([stored])).toEqual([]);
  });

  it('leaves a row with no formula alone', () => {
    expect(ladderPatches([art({ title: '今天天气很好' })])).toEqual([]);
  });
});
