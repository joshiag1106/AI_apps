import { describe, it, expect } from 'vitest';
import { CHAPTERS, WALK_ONLY, meta } from '@/lib/demo/chapters';
import { CHAPTER_IDS } from '@/lib/demo/types';

describe('the chapter registry', () => {
  it('lists every chapter once, in the approved order', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
    expect(CHAPTERS).toHaveLength(12);
  });

  // Both are about reading the news in the language it was written, so the Lens follows the headline.
  it('puts the Language Lens right after the language chapter', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(ids.indexOf('lens')).toBe(ids.indexOf('language') + 1);
  });

  // Without an official to walk on to, the network chapter is the two-state walk it was before the person
  // step, so its caption must not promise an official and it keeps its old, shorter length.
  it('has a shorter, person-free form of the network chapter for a walk with no official', () => {
    expect(meta('network').caption).toMatch(/official/i);
    expect(WALK_ONLY.caption).not.toMatch(/official/i);
    expect(WALK_ONLY.seconds).toBeLessThan(meta('network').seconds);
  });

  it('gives every chapter a title, a caption and a positive duration', () => {
    for (const c of CHAPTERS) {
      expect(c.title.trim(), c.id).not.toBe('');
      expect(c.caption.trim(), c.id).not.toBe('');
      expect(c.seconds, c.id).toBeGreaterThan(0);
    }
  });

  it('runs about two minutes', () => {
    const total = CHAPTERS.reduce((s, c) => s + c.seconds, 0);
    expect(total).toBeGreaterThanOrEqual(100);
    expect(total).toBeLessThanOrEqual(130);
  });

  it('never states a price, a limit or a plan in a caption', () => {
    for (const c of [...CHAPTERS, WALK_ONLY]) {
      expect(c.caption, c.caption).not.toMatch(/₹|\$|per month|\/\s*month|\bfree analyses\b|\bPro\b|\bDesk\b/i);
    }
  });

  it('looks a chapter up by id, and refuses an unknown one', () => {
    expect(meta('ladder').title).toMatch(/ladder/i);
    expect(() => meta('nope' as never)).toThrow();
  });
});
