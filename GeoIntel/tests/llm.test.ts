import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the storage layer at a scratch database before anything imports it.
process.env.KAUTILYA_DB = join(mkdtempSync(join(tmpdir(), 'kautilya-')), 'test.db');

import { EventAnalysisSchema, cachedAnalysis } from '@/lib/llm/analyse';
import { llmEnabled } from '@/lib/llm/client';
import { getDb } from '@/lib/db';
import type { Article, GeoEvent } from '@/lib/types';

const analysis = {
  headline_translations: [{ outlet: 'Xinhua', original: '中方提出严正交涉', english: 'China lodges solemn representations' }],
  framing_by_bloc: [{ bloc: 'PRC state media', frames_it_as: 'A response to provocation', notable_language: '严正交涉' }],
  points_of_agreement: ['A démarche was delivered'],
  points_of_divergence: ['Who initiated the incident'],
  india_relevance: 'Signals the register Beijing is using on this file.',
  what_would_confirm: ['A readout from the other foreign ministry'],
  caveat: 'Based only on headlines supplied.',
};

const event = {
  id: 'ev1', title: 'T', summary: '', firstSeen: '2026-08-29T00:00:00.000Z',
  lastSeen: '2026-08-29T00:00:00.000Z', actors: ['CHN'], hotspots: [], domain: 'Diplomatic',
  escalation: 10, confidence: 40, signals: [], flags: [], articleIds: ['a1'],
  languages: ['zh'], countries: ['CHN'], imageUrl: null, videoId: null,
  ladderRung: 4, ladderZh: '严正交涉', ladderEn: 'makes solemn representations',
} as GeoEvent;

const articles = [{ id: 'a1' }] as Article[];

describe('LLM layer', () => {
  it('is off unless a credential is present', () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    expect(llmEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(llmEnabled()).toBe(true);
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
    if (savedToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
  });

  it('accepts a well-formed analysis and rejects a malformed one', () => {
    expect(EventAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(EventAnalysisSchema.safeParse({ ...analysis, points_of_agreement: 'not an array' }).success).toBe(false);
    expect(EventAnalysisSchema.safeParse({ ...analysis, caveat: undefined }).success).toBe(false);
  });

  it('round-trips through the cache so a second viewer costs nothing', () => {
    expect(cachedAnalysis(event, articles)).toBeNull();

    // Mirror what analyseEvent() writes, using the same key derivation.
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const key = createHash('sha256')
      .update(`${process.env.KAUTILYA_LLM_MODEL ?? 'claude-opus-5'}|ev1|a1`)
      .digest('hex').slice(0, 32);
    getDb().prepare('INSERT OR REPLACE INTO llm_cache (key,event_id,model,output,created_at) VALUES (?,?,?,?,?)')
      .run(key, 'ev1', 'claude-opus-5', JSON.stringify(analysis), new Date().toISOString());

    const hit = cachedAnalysis(event, articles);
    expect(hit).not.toBeNull();
    expect(hit!.framing_by_bloc[0].bloc).toBe('PRC state media');
  });

  it('treats a corrupted cache row as a miss rather than throwing', () => {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO llm_cache (key,event_id,model,output,created_at) VALUES (?,?,?,?,?)')
      .run('bad', 'ev2', 'm', '{"headline_translations": "wrong shape"}', 'now');
    const bogus = { ...event, id: 'ev2' } as GeoEvent;
    expect(() => cachedAnalysis(bogus, articles)).not.toThrow();
    expect(cachedAnalysis(bogus, articles)).toBeNull();
  });
});
