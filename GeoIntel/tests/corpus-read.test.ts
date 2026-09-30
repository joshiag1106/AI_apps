import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GeoEvent } from '@/lib/types';

process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-corpus-')), 'test.db');

const DAY = 86_400_000;

function ev(i: number): GeoEvent {
  const seen = new Date(Date.now() - (i % 90) * DAY).toISOString();
  return {
    id: `c${i}`, title: `Event ${i}`, summary: '', firstSeen: seen, lastSeen: seen,
    actors: ['IND', 'CHN'], people: [], hotspots: [], domain: 'Military',
    escalation: 20, confidence: 60, signals: [], flags: [], articleIds: [`a${i}`],
    languages: ['en'], countries: ['IND'], imageUrl: null, videoId: null,
    ladderRung: null, ladderZh: null, ladderEn: null,
  };
}

/**
 * Every page reads events through corpus(), which read only the newest 4,000 by last seen. Past
 * that, nothing failed: the oldest events silently left every index, trend and list. The local
 * corpus clustered in full holds 5,773 events. The event table is bounded by article retention,
 * so the page read needs no cap of its own.
 */
describe('the page corpus', () => {
  it('reads every stored event, past 4,000', async () => {
    const { replaceEvents } = await import('@/lib/db');
    const { corpus } = await import('@/lib/queries');
    replaceEvents(Array.from({ length: 4100 }, (_, i) => ev(i)));

    expect(corpus()).toHaveLength(4100);
  });
});
