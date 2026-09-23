/**
 * Which of the stage's three states the tour is in, as two flags the shell puts on `.demo-stage`.
 *
 *   running          paused false, still false   the beats animate
 *   frozen in place  paused true,  still false   a chapter already under way holds where it is
 *   still            paused false, still true    a scene that has not started shows its FINISHED state
 *
 * WHY there is a third state: app/globals.css freezes every beat with `animation-play-state: paused`
 * while `data-paused="true"`. A beat is declared `animation: … both`, so a scene MOUNTED while the stage
 * is frozen sits at its `from` keyframe, opacity 0, and nothing ever plays it forward. That is a blank
 * stage after "press Space, then Home", and a half-drawn one after "press Space, then →". Freezing is only
 * right for a chapter that has already started, and `elapsedMs` says which: a move (next, prev, goto,
 * replay) resets it to 0, and a mid-chapter pause does not.
 *
 * - `paused`: the reader paused, or the tab is hidden, MID-chapter (`elapsedMs > 0`). The beats hold
 *   exactly where they were. A finished tour is also this case, since its elapsed time is the last
 *   chapter's whole length.
 * - `still`: the clock is stopped and the scene has not started (`elapsedMs === 0`): the reader moved
 *   while paused, or the page opened under reduced motion. Every beat shows its final state, the same as
 *   the reduced-motion rule. A HIDDEN tab that is otherwise playing is not `still`: it resumes by itself,
 *   so its scene is left to run.
 *
 * Both are false before hydration (`mounted`), so a visitor without JavaScript neither gets a frozen
 * stage nor a forced one: the beats simply run to their end state.
 *
 * Pure, so the table of cases can be tested without a browser.
 */
export function stageFlags(
  { mounted, playing, hidden, elapsedMs }: { mounted: boolean; playing: boolean; hidden: boolean; elapsedMs: number },
): { paused: boolean; still: boolean } {
  return {
    paused: mounted && (!playing || hidden) && elapsedMs > 0,
    still: mounted && !playing && elapsedMs === 0,
  };
}
