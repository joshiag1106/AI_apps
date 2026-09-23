import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { art } from './fixtures/demo-fixtures';

describe('otherPartyLadderArticles', () => {
  let db: typeof import('@/lib/db');
  beforeAll(async () => {
    process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-demo-')), 'test.db');
    db = await import('@/lib/db');
  });

  it("returns another party's rung-bearing articles, newest first, and nothing else", () => {
    const old = art({ ladderSpeaker: 'other', ladderRung: 5, publishedAt: '2026-09-01T00:00:00.000Z' });
    const recent = art({ ladderSpeaker: 'other', ladderRung: 8, publishedAt: '2026-09-18T00:00:00.000Z' });
    const beijing = art({ ladderSpeaker: 'prc', ladderRung: 4, publishedAt: '2026-09-19T00:00:00.000Z' });
    const unclear = art({ ladderSpeaker: 'unclear', ladderRung: 4, publishedAt: '2026-09-19T00:00:00.000Z' });
    const noRung = art({ ladderSpeaker: 'other', ladderRung: null, ladderZh: null, ladderEn: null, publishedAt: '2026-09-19T00:00:00.000Z' });
    db.upsertArticles([old, recent, beijing, unclear, noRung]);

    expect(db.otherPartyLadderArticles().map((a) => a.id)).toEqual([recent.id, old.id]);
  });

  it('honours the limit', () => {
    expect(db.otherPartyLadderArticles(1)).toHaveLength(1);
  });
});
