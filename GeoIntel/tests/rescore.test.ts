import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art } from './fixtures/demo-fixtures';

describe('rescoreDomainsIfStale', () => {
  let db: typeof import('@/lib/db');
  let rescore: typeof import('@/lib/analyze/rescore');
  const strike = art({ language: 'en', title: 'Israeli airstrikes hit southern Lebanon', domain: 'Diplomatic', ladderRung: null });
  const plain = art({ language: 'en', title: 'Leaders exchange greetings', domain: 'Diplomatic', ladderRung: null });

  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-rescore-')), 'test.db');
    db = await import('@/lib/db');
    rescore = await import('@/lib/analyze/rescore');
    db.upsertArticles([strike, plain]);
    db.setMeta(rescore.VOCAB_KEY, 'an older vocabulary');
  });

  it('re-scores stored domains when the vocabulary has changed, and records the new version', () => {
    expect(rescore.rescoreDomainsIfStale()).toEqual({ rescored: true, changed: 1 });
    const byId = new Map(db.allArticles(10).map((a) => [a.id, a.domain]));
    expect(byId.get(strike.id)).toBe('Military');
    expect(byId.get(plain.id)).toBe('Diplomatic');
    expect(db.getMeta(rescore.VOCAB_KEY)).toBe(rescore.vocabVersion());
  });

  it('does nothing while the vocabulary is unchanged', () => {
    expect(rescore.rescoreDomainsIfStale()).toEqual({ rescored: false, changed: 0 });
  });

  it('fingerprints the table and the matching rules', () => {
    expect(rescore.vocabVersion()).toMatch(/^[0-9a-f]{16}$/);
  });
});
