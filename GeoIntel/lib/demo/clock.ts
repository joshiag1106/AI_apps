/**
 * The tour's clock, as a pure reducer so its rules can be tested without a browser.
 *
 * It knows nothing about scenes or timers — the shell feeds it `tick`s. Two rules are worth the
 * tests they have: a tick is capped at MAX_TICK_MS, so a tab the browser throttled cannot return
 * and fast-forward past chapters nobody watched; and `play` after the tour has finished starts it
 * over rather than doing nothing.
 *
 * A move (`next`, `prev`, `goto`) to the chapter already showing is a no-op that returns the SAME
 * state object. The shell keys the scene on the index, so zeroing the clock without changing the
 * index would restart the progress bar while the scene kept its animation, and on a finished tour it
 * would make `finished()` false so a later `play` re-ran the closing chapter instead of restarting
 * the tour. `replay` is the way to restart a chapter.
 */
export interface TourState { index: number; playing: boolean; elapsedMs: number }

export type TourAction =
  | { type: 'next' } | { type: 'prev' } | { type: 'goto'; index: number }
  | { type: 'play' } | { type: 'pause' } | { type: 'toggle' }
  | { type: 'tick'; dtMs: number } | { type: 'replay' };

export const MAX_TICK_MS = 250;

export function initialTourState(autoplay: boolean): TourState {
  return { index: 0, playing: autoplay, elapsedMs: 0 };
}

export function makeTourReducer(durationsMs: readonly number[]) {
  if (durationsMs.length === 0) return (state: TourState, _action: TourAction): TourState => state;

  const last = durationsMs.length - 1;
  const clamp = (i: number) => Math.max(0, Math.min(last, Math.trunc(i)));
  const moveTo = (state: TourState, target: number): TourState => {
    const index = clamp(target);
    return index === state.index ? state : { ...state, index, elapsedMs: 0 };
  };
  const finished = (s: TourState) => s.index === last && s.elapsedMs >= durationsMs[last];

  return function reduce(state: TourState, action: TourAction): TourState {
    switch (action.type) {
      case 'next': return moveTo(state, state.index + 1);
      case 'prev': return moveTo(state, state.index - 1);
      case 'goto': return Number.isFinite(action.index) ? moveTo(state, action.index) : state;
      case 'pause': return { ...state, playing: false };
      case 'play': return finished(state) ? { index: 0, playing: true, elapsedMs: 0 } : { ...state, playing: true };
      case 'toggle': return reduce(state, { type: state.playing ? 'pause' : 'play' });
      case 'replay': return { ...state, playing: true, elapsedMs: 0 };
      case 'tick': {
        if (!state.playing || !Number.isFinite(action.dtMs) || action.dtMs <= 0) return state;
        const elapsed = state.elapsedMs + Math.min(action.dtMs, MAX_TICK_MS);
        if (elapsed < durationsMs[state.index]) return { ...state, elapsedMs: elapsed };
        if (state.index < last) return { ...state, index: state.index + 1, elapsedMs: 0 };
        return { ...state, playing: false, elapsedMs: durationsMs[state.index] };
      }
    }
  };
}
