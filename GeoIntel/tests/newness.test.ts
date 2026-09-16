import { describe, it, expect } from 'vitest';
import { markSeen } from '@/lib/newness';

describe('markSeen reports what is new since the last call', () => {
  it('treats everything as new against an empty seen set', () => {
    const seen = new Set<string>();
    expect(markSeen(seen, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('reports nothing new when the exact same ids are passed again', () => {
    // The mutant this catches: forgetting to update `seen`, so every call reports
    // everything as fresh forever.
    const seen = new Set<string>();
    markSeen(seen, ['a', 'b']);
    expect(markSeen(seen, ['a', 'b'])).toEqual([]);
  });

  it('reports only the id that was not seen before, preserving its position', () => {
    const seen = new Set(['a', 'b']);
    expect(markSeen(seen, ['a', 'b', 'c'])).toEqual(['c']);
  });

  it('does not forget an id that drops off the list and never reappears as new', () => {
    // A live feed reshuffles: an event that scrolled out of the top-14 and later
    // scrolls back in should not flash a second time as though it just arrived.
    const seen = new Set<string>();
    markSeen(seen, ['a', 'b', 'c']);
    markSeen(seen, ['b', 'c']); // 'a' drops off
    expect(markSeen(seen, ['a', 'b', 'c'])).toEqual([]); // 'a' is back, not new
  });
});
