import { describe, it, expect } from 'vitest';
import { CHAPTERS, meta } from '@/lib/demo/chapters';
import { CHAPTER_IDS } from '@/lib/demo/types';

describe('the chapter registry', () => {
  it('lists every chapter once, in the approved order', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
    expect(CHAPTERS).toHaveLength(11);
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
    for (const c of CHAPTERS) {
      expect(c.caption, c.id).not.toMatch(/₹|\$|per month|\/\s*month|\bfree analyses\b|\bPro\b|\bDesk\b/i);
    }
  });

  it('looks a chapter up by id, and refuses an unknown one', () => {
    expect(meta('ladder').title).toMatch(/ladder/i);
    expect(() => meta('nope' as never)).toThrow();
  });
});
