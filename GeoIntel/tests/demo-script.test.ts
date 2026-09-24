// tests/demo-script.test.ts
import { describe, it, expect } from 'vitest';
import { buildDemoScript, MIN_LIVE_EVENTS } from '@/lib/demo/script';
import { CHAPTER_IDS, type AnyChapter } from '@/lib/demo/types';
import { WALK_ONLY, meta } from '@/lib/demo/chapters';
import { BOARD, evt, fallbacks, lensTopic, richInput } from './fixtures/demo-fixtures';

const FB = fallbacks();
const byId = (s: { chapters: AnyChapter[] }, id: string) => s.chapters.find((c) => c.id === id)!;

describe('buildDemoScript', () => {
  it('yields all twelve chapters, live, in order, from a rich corpus', () => {
    const s = buildDemoScript(richInput(), FB);
    expect(s.chapters.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
    expect(s.chapters.every((c) => c.source.kind === 'live')).toBe(true);
    expect(s.thin).toBe(false);
  });

  it('carries the last ingest through, for the badge', () => {
    expect(buildDemoScript(richInput(), FB).updatedAt).toBe('2026-09-20T11:46:00.000Z');
  });

  it('substitutes a dated capture for a chapter whose selector finds nothing, and only that chapter', () => {
    const s = buildDemoScript(richInput({ otherArticles: [] }), FB);
    expect(byId(s, 'ladder').source).toEqual({ kind: 'captured', capturedOn: '2026-08-01' });
    expect((byId(s, 'ladder').data as { beijing: { title: string } }).beijing.title).toBe('captured beijing');
    expect(byId(s, 'language').source.kind).toBe('live');
    expect(byId(s, 'event').source.kind).toBe('live');
  });

  it('uses captures for the six chapters that have them when the corpus is thin, and live for the rest', () => {
    const thin = richInput({ events: Array.from({ length: MIN_LIVE_EVENTS - 1 }, () => evt()) });
    const s = buildDemoScript(thin, FB);
    expect(s.thin).toBe(true);
    for (const id of ['language', 'event', 'ladder', 'trail', 'dyad', 'yours']) {
      expect(byId(s, id).source.kind, id).toBe('captured');
    }
    // The Lens has no capture: its own two-proportion test, not the event count, is what keeps chance out.
    for (const id of ['board', 'lens', 'risk', 'ask', 'close']) {
      expect(byId(s, id).source.kind, id).toBe('live');
    }
  });

  it('is not thin at exactly MIN_LIVE_EVENTS', () => {
    const exact = richInput({ events: Array.from({ length: MIN_LIVE_EVENTS }, () => evt()) });
    expect(buildDemoScript(exact, FB).thin).toBe(false);
  });

  it('leaves out a chapter with nothing to show, rather than animating it empty', () => {
    const ids = buildDemoScript(richInput({ risks: [], dyads: [] }), FB).chapters.map((c) => c.id);
    expect(ids).not.toContain('risk');
    expect(ids).not.toContain('network');
    expect(ids).not.toContain('ask');
    expect(ids).toContain('board');
    expect(ids).toContain('close');
  });

  // An empty corpus has nothing to colour, so the board chapter would open the tour on an unlit map with
  // four zeroes under a caption that promises colour and pulsing. It is left out, as risk/network/ask are.
  it('leaves out the board chapter when no country has any data, so the tour opens on the language chapter', () => {
    const s = buildDemoScript(richInput({ board: { ...BOARD, data: [] } }), FB);
    expect(s.chapters.map((c) => c.id)).toEqual([...CHAPTER_IDS].filter((id) => id !== 'board'));
    expect(s.chapters[0].id).toBe('language');
  });

  it('leaves out the Lens chapter when no topic has a difference that passed the test', () => {
    const ids = buildDemoScript(richInput({ lens: [lensTopic({ sharpest: null })] }), FB).chapters.map((c) => c.id);
    expect(ids).toEqual([...CHAPTER_IDS].filter((id) => id !== 'lens'));
  });

  it('runs the network chapter at full length, with its own caption, when the walk reaches an official', () => {
    const base = richInput();
    const events = [...base.events, ...[0, 1, 2].map(() => evt({ actors: ['JPN'], people: ['takaichi-sanae'] }))];
    const net = byId(buildDemoScript(richInput({ events }), FB), 'network');
    expect(net.caption).toBe(meta('network').caption);
    expect(net.seconds).toBe(meta('network').seconds);
  });

  it('runs the network chapter as the shorter two-state walk when no official qualifies', () => {
    const net = byId(buildDemoScript(richInput(), FB), 'network');
    expect(net.caption).toBe(WALK_ONLY.caption);
    expect(net.seconds).toBe(WALK_ONLY.seconds);
  });

  it('keeps the approved order when chapters are omitted', () => {
    const ids = buildDemoScript(richInput({ risks: [] }), FB).chapters.map((c) => c.id);
    expect(ids).toEqual([...CHAPTER_IDS].filter((id) => id !== 'risk' && id !== 'network'));
  });

  it('gives the closing chapter the state-specific copy as its caption', () => {
    expect(byId(buildDemoScript(richInput(), FB), 'close').caption).toContain('open while Kautilya is in preview');
  });

  it('puts the Desk Pro chip on the alert chapter always, and no other chip while nothing is enforced', () => {
    const s = buildDemoScript(richInput(), FB);
    expect(byId(s, 'yours').chip).toBe('Desk Pro');
    expect(s.chapters.filter((c) => c.chip).map((c) => c.id)).toEqual(['yours']);
  });

  it('adds Desk chips once enforcement is on, and an export chip inside chapter 11', () => {
    const s = buildDemoScript(richInput({ claims: { enforced: true, mode: 'stripe', freeLimit: 5 } }), FB);
    expect(byId(s, 'event').chip).toBe('Desk');
    expect(byId(s, 'board').chip).toBeNull();
    expect((byId(s, 'yours').data as { exportChip: string | null }).exportChip).toBe('Desk');
  });

  it('never prints the free allowance while nothing is enforced', () => {
    const text = buildDemoScript(richInput(), FB).chapters.map((c) => c.caption).join(' ');
    expect(text).not.toMatch(/free analyses|₹|\$/);
  });

  it('uses the same Beijing article for the language and ladder chapters', () => {
    const s = buildDemoScript(richInput(), FB);
    const lang = byId(s, 'language').data as { headline: string };
    const ladder = byId(s, 'ladder').data as { beijing: { title: string } };
    expect(ladder.beijing.title).toBe(lang.headline);
  });
});
