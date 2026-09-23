// tests/demo-stage.test.ts
import { describe, it, expect } from 'vitest';
import { stageFlags } from '@/lib/demo/stage';

// The stage has three states, and these flags choose between them:
//   running         paused false, still false  (beats animate)
//   frozen in place paused true,  still false  (a chapter already under way; the beats hold where they are)
//   still           paused false, still true   (a scene that has not started: show its finished state)
describe('stageFlags', () => {
  const cases: { name: string; in: Parameters<typeof stageFlags>[0]; out: { paused: boolean; still: boolean } }[] = [
    {
      name: 'before mount (server render, or hydration not yet run): nothing frozen and nothing forced',
      in: { mounted: false, playing: false, hidden: false, elapsedMs: 0 },
      out: { paused: false, still: false },
    },
    {
      name: 'before mount, even if the clock somehow reads paused mid-chapter',
      in: { mounted: false, playing: false, hidden: true, elapsedMs: 4000 },
      out: { paused: false, still: false },
    },
    {
      name: 'autoplaying: the beats run',
      in: { mounted: true, playing: true, hidden: false, elapsedMs: 3000 },
      out: { paused: false, still: false },
    },
    {
      name: 'autoplaying at the very start of a chapter: the beats run',
      in: { mounted: true, playing: true, hidden: false, elapsedMs: 0 },
      out: { paused: false, still: false },
    },
    {
      name: 'paused mid-chapter: freeze in place',
      in: { mounted: true, playing: false, hidden: false, elapsedMs: 3000 },
      out: { paused: true, still: false },
    },
    {
      name: 'paused with no time elapsed (just navigated while paused): show the finished scene, do not freeze it',
      in: { mounted: true, playing: false, hidden: false, elapsedMs: 0 },
      out: { paused: false, still: true },
    },
    {
      name: 'hidden tab while playing mid-chapter: freeze in place',
      in: { mounted: true, playing: true, hidden: true, elapsedMs: 3000 },
      out: { paused: true, still: false },
    },
    {
      name: 'hidden tab while playing at elapsed 0: neither (the scene just started, and it resumes by itself)',
      in: { mounted: true, playing: true, hidden: true, elapsedMs: 0 },
      out: { paused: false, still: false },
    },
    {
      name: 'a finished tour (stopped, elapsed = the last chapter’s length): freeze in place',
      in: { mounted: true, playing: false, hidden: false, elapsedMs: 8000 },
      out: { paused: true, still: false },
    },
    {
      name: 'hidden and paused mid-chapter: freeze in place',
      in: { mounted: true, playing: false, hidden: true, elapsedMs: 1500 },
      out: { paused: true, still: false },
    },
    {
      name: 'hidden and paused at elapsed 0: still (the reader is not watching, and on return the scene is finished)',
      in: { mounted: true, playing: false, hidden: true, elapsedMs: 0 },
      out: { paused: false, still: true },
    },
  ];

  for (const c of cases) {
    it(c.name, () => expect(stageFlags(c.in)).toEqual(c.out));
  }

  it('never sets both flags at once, whatever the inputs', () => {
    for (const mounted of [false, true]) for (const playing of [false, true]) for (const hidden of [false, true]) {
      for (const elapsedMs of [0, 1, 100, 8000]) {
        const f = stageFlags({ mounted, playing, hidden, elapsedMs });
        expect(f.paused && f.still, JSON.stringify({ mounted, playing, hidden, elapsedMs })).toBe(false);
      }
    }
  });
});
