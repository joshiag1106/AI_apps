import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art } from './fixtures/forecast';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-junk-')), 'test.db');

const { isSeoWrapper } = await import('@/lib/ingest/junk');
const { storable, maintainCorpus } = await import('@/lib/ingest/pipeline');
const db = await import('@/lib/db');

// Both real, both from a Google News source labelled 体坛: casino-style SEO pages republishing old stories
// under new dates (2026-09-20 and 2026-09-30). The first was the only basis of the Japan row of the
// evidence trail, and the top "official statement" on China Watch the night before a presentation.
const CASINO = ['众赢国际手机版_体育_8·15日本政要又“拜鬼”，中方严正交涉强烈抗议',
  '火狐体育官方登录_体育_不当国务卿后，布林肯终于敢说了，和中国一对一，美方不是对手'];

describe('SEO-wrapped republications are not reporting', () => {
  it('recognises the casino wrappers', () => {
    for (const t of CASINO) expect(isSeoWrapper(t), t).toBe(true);
  });

  it('keeps a real report that mentions an official website', () => {
    expect(isSeoWrapper('据外交部官方网站消息，王毅将访问印度')).toBe(false);
    expect(isSeoWrapper('外交部：坚决反对菲律宾损害中国主权和权益的行径')).toBe(false);
  });

  it('is never stored', () => {
    expect(storable(art({ title: CASINO[0], actors: ['CHN', 'JPN'] }))).toBe(false);
    expect(storable(art({ title: '中方就日本政要参拜靖国神社提出严正交涉', actors: ['CHN', 'JPN'] }))).toBe(true);
    expect(storable(art({ actors: [] }))).toBe(false);
  });

  it('is pruned from the stored corpus on the next upkeep', () => {
    const junk = art({ title: CASINO[0], actors: ['CHN', 'JPN'], publishedAt: new Date().toISOString() });
    const real = art({ title: '中方就日本政要参拜靖国神社提出严正交涉', actors: ['CHN', 'JPN'], publishedAt: new Date().toISOString() });
    db.upsertArticles([junk, real]);
    const { pruned } = maintainCorpus();
    expect(pruned).toBe(1);
    expect(db.articlesByIds([junk.id, real.id]).map((a) => a.id)).toEqual([real.id]);
  });
});
