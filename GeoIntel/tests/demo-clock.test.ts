import { describe, it, expect } from 'vitest';
import { makeTourReducer, initialTourState, MAX_TICK_MS, type TourState } from '@/lib/demo/clock';

const D = [1000, 2000, 3000];
const reduce = makeTourReducer(D);
const at = (index: number, elapsedMs = 0, playing = true): TourState => ({ index, playing, elapsedMs });

describe('the tour clock', () => {
  it('starts paused when asked not to autoplay, and playing when asked to', () => {
    expect(initialTourState(false)).toEqual({ index: 0, playing: false, elapsedMs: 0 });
    expect(initialTourState(true).playing).toBe(true);
  });

  it('moves between chapters and clamps at both ends', () => {
    expect(reduce(at(0), { type: 'next' }).index).toBe(1);
    expect(reduce(at(2), { type: 'next' }).index).toBe(2);
    expect(reduce(at(0), { type: 'prev' }).index).toBe(0);
    expect(reduce(at(2), { type: 'prev' }).index).toBe(1);
  });

  it('restarts the chapter clock on every move', () => {
    expect(reduce(at(0, 700), { type: 'next' }).elapsedMs).toBe(0);
    expect(reduce(at(2, 700), { type: 'goto', index: 0 })).toMatchObject({ index: 0, elapsedMs: 0 });
  });

  // A move to the chapter already showing must change nothing. The shell keys the scene on the index,
  // so zeroing the clock here would restart the progress bar while the scene kept its animation.
  // `replay` is the way to restart a chapter.
  it('treats next on the last chapter as a no-op, returning the very same state', () => {
    const playing = at(2, 700);
    expect(reduce(playing, { type: 'next' })).toBe(playing);
    const paused = at(2, 700, false);
    expect(reduce(paused, { type: 'next' })).toBe(paused);
  });

  it('treats prev on the first chapter as a no-op, returning the very same state', () => {
    const s = at(0, 700);
    expect(reduce(s, { type: 'prev' })).toBe(s);
  });

  it('treats goto the current chapter as a no-op, returning the very same state', () => {
    const middle = at(1, 400);
    expect(reduce(middle, { type: 'goto', index: 1 })).toBe(middle);
    // goto clamps first, so an out-of-range target that lands on the current chapter is a no-op too.
    const last = at(2, 700);
    expect(reduce(last, { type: 'goto', index: 99 })).toBe(last);
    const first = at(0, 700);
    expect(reduce(first, { type: 'goto', index: -4 })).toBe(first);
  });

  it('keeps a finished tour finished when next is pressed, so play still starts the whole tour over', () => {
    const finished: TourState = { index: 2, playing: false, elapsedMs: 3000 };
    const afterNext = reduce(finished, { type: 'next' });
    expect(afterNext).toEqual(finished);
    expect(reduce(afterNext, { type: 'play' })).toEqual({ index: 0, playing: true, elapsedMs: 0 });
  });

  it('clamps goto and ignores a non-number', () => {
    expect(reduce(at(0), { type: 'goto', index: 99 }).index).toBe(2);
    expect(reduce(at(1), { type: 'goto', index: -4 }).index).toBe(0);
    expect(reduce(at(1, 400), { type: 'goto', index: NaN })).toEqual(at(1, 400));
  });

  it('advances the chapter clock on a tick', () => {
    expect(reduce(at(0, 100), { type: 'tick', dtMs: 100 }).elapsedMs).toBe(200);
  });

  it('crosses into the next chapter when a chapter runs out, and restarts the clock', () => {
    expect(reduce(at(0, 900), { type: 'tick', dtMs: 100 })).toEqual(at(1, 0));
  });

  it('stops at the end of the last chapter and stays there', () => {
    expect(reduce(at(2, 2900), { type: 'tick', dtMs: 200 })).toEqual({ index: 2, playing: false, elapsedMs: 3000 });
  });

  it('does not advance while paused', () => {
    const paused = at(0, 100, false);
    expect(reduce(paused, { type: 'tick', dtMs: 100 })).toBe(paused);
  });

  it('never lets one long tick skip a chapter — a throttled tab returning must not fast-forward', () => {
    const s = reduce(at(1, 0), { type: 'tick', dtMs: 5000 });
    expect(s.index).toBe(1);
    expect(s.elapsedMs).toBe(MAX_TICK_MS);
  });

  it('ignores a zero, negative or non-finite tick', () => {
    for (const dtMs of [0, -50, NaN, Infinity]) {
      const s = at(0, 300);
      expect(reduce(s, { type: 'tick', dtMs })).toBe(s);
    }
  });

  it('plays, pauses and toggles', () => {
    expect(reduce(at(0, 0, false), { type: 'play' }).playing).toBe(true);
    expect(reduce(at(0), { type: 'pause' }).playing).toBe(false);
    expect(reduce(at(0), { type: 'toggle' }).playing).toBe(false);
    expect(reduce(at(0, 0, false), { type: 'toggle' }).playing).toBe(true);
  });

  it('starts the whole tour over when play is pressed after it has finished', () => {
    expect(reduce({ index: 2, playing: false, elapsedMs: 3000 }, { type: 'play' })).toEqual(at(0, 0));
  });

  it('replays the current chapter from its start and keeps playing', () => {
    expect(reduce(at(1, 1500, false), { type: 'replay' })).toEqual(at(1, 0));
  });

  it('is inert with no chapters', () => {
    const r = makeTourReducer([]);
    const s = at(0);
    expect(r(s, { type: 'next' })).toBe(s);
    expect(r(s, { type: 'tick', dtMs: 100 })).toBe(s);
  });
});
