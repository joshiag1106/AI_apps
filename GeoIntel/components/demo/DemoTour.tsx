'use client';

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { initialTourState, makeTourReducer } from '@/lib/demo/clock';
import { keyResult } from '@/lib/demo/keys';
import { stageFlags } from '@/lib/demo/stage';
import { DemoAudio } from './DemoAudio';
import { StillContext } from './StageState';

export interface TourChapter {
  id: string;
  title: string;
  caption: string;
  seconds: number;
  /** "Live · updated 14m ago" / "Example captured 14 Sep". */
  badge: string;
  /** "Desk" / "Desk Pro" / null, derived from the billing state by lib/demo/claims. */
  chip: string | null;
  /** Only the closing chapter: everything else renders links that must not be reachable mid-animation. */
  interactive: boolean;
  scene: ReactNode;
}

const TICK_MS = 100;

const BTN = 'rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-[15px] text-text transition-colors hover:border-[color:var(--color-accent)]';

/**
 * The tour's shell: the clock, the controls, the keyboard, the transcript. Scenes arrive as rendered
 * children because they are Server Components (Mandala, NetworkGraph and EventCard import
 * server-only code); this file only decides WHICH one is showing and when to move on.
 *
 * The CLOCK is paused on server render and first paint (`useReducer(reducer, false, …)`). Autoplay
 * starts in an effect, and only when the reader has not asked for reduced motion, so a visitor without
 * JavaScript never moves on from chapter 1 and the Play button reads Play.
 *
 * The STAGE is a different matter, and has three states, chosen by `stageFlags` (lib/demo/stage) and
 * written as `data-paused` and `data-still` for app/globals.css:
 *
 *   running          neither flag: the beats animate.
 *   frozen in place  `data-paused`: the reader paused, or the tab is hidden, MID-chapter; the CSS motion
 *                    holds exactly where it was.
 *   still            `data-still`: the clock is stopped and the scene has not started (the reader moved
 *                    to another chapter while paused, or opened the page under reduced motion); every
 *                    beat shows its FINISHED state, the same as the reduced-motion rule. The motion
 *                    CSS cannot finish is handled beside it: the count-ups, the typed question, the
 *                    star and the palette swap read `StillContext` and stay at their end state, and
 *                    the map's looping pulses are paused in place by one targeted CSS rule.
 *
 * The split exists because a freeze at each beat's `from` keyframe is opacity 0, so a scene mounted
 * while frozen would be blank and nothing would play it forward. Both flags also wait for hydration
 * (`mounted`): frozen or forced before that, a visitor without JavaScript would see either an empty
 * stage that no script ever unfreezes or no motion at all. With both false, the beats simply run to their
 * final state, so they get chapter 1 as it is meant to look, the controls and the transcript.
 */
export function DemoTour({ chapters }: { chapters: TourChapter[] }) {
  const reducer = useMemo(() => makeTourReducer(chapters.map((c) => c.seconds * 1000)), [chapters]);
  const [state, dispatch] = useReducer(reducer, false, initialTourState);
  const [replays, setReplays] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduced(rm);
    if (!rm) dispatch({ type: 'play' });
  }, []);

  // A hidden tab stops the clock but does not change `playing`, so it resumes by itself.
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!state.playing || hidden) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', dtMs: now - last });
      last = now;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.playing, hidden]);

  const replay = useCallback(() => {
    setReplays((n) => n + 1);
    dispatch({ type: 'replay' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const r = keyResult({
        key: e.key, repeat: e.repeat, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey,
        tag: el?.tagName, editable: el?.isContentEditable,
      }, chapters.length - 1);
      if (!r) return;
      // A plain navigation, not the router: / is chromeless and so is /demo, but the splash still
      // needs a genuine server round-trip (see app/page.tsx).
      if ('exit' in r) { window.location.assign('/'); return; }
      // The tour's own keys never also scroll: several chapters are taller than a screen.
      e.preventDefault();
      dispatch(r.action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapters.length]);

  const chapter = chapters[state.index];
  const pct = Math.min(100, (state.elapsedMs / (chapter.seconds * 1000)) * 100);
  const flags = stageFlags({ mounted, playing: state.playing, hidden, elapsedMs: state.elapsedMs });

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-5">
      <header className="flex items-center justify-between">
        <span className="text-[12px] uppercase tracking-[0.28em] text-faint">Kautilya · Demo</span>
        <a href="/" className="text-[13px] text-muted underline decoration-dotted hover:text-text">Close demo</a>
      </header>

      <main className="flex flex-1 flex-col justify-center">
        {/* `inert` on every chapter but the last: the scenes render map markers, graph nodes and chart
            markers as links, and a soft navigation out of this chromeless route would carry the hidden
            chrome with it. The transcript below is the accessible equivalent of the animation. */}
        <div
          className={`demo-stage relative min-h-[420px] py-6${chapter.interactive ? '' : ' pointer-events-none'}`}
          data-paused={flags.paused} data-still={flags.still} inert={!chapter.interactive}
        >
          <StillContext.Provider value={flags.still}>
            <div key={`${state.index}:${replays}`} data-scene={chapter.id}>{chapter.scene}</div>
          </StillContext.Provider>
        </div>

        <div className="mt-2 text-center">
          <div className="flex items-center justify-center gap-2 text-[12px] text-faint">
            <span>{chapter.badge}</span>
            {chapter.chip && (
              <span className="rounded border border-[color:var(--color-accent-dim)] px-1.5 py-0.5 uppercase tracking-wider text-[color:var(--color-accent)]">
                {chapter.chip}
              </span>
            )}
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-text">{chapter.title}</h1>
          <p className="mx-auto mt-1 max-w-xl text-[15px] leading-relaxed text-muted">{chapter.caption}</p>
        </div>
      </main>

      <nav aria-label="Demo controls" className="mt-4">
        <div className="h-1 overflow-hidden rounded bg-[color:var(--color-line)]">
          <div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${pct}%`, transition: 'width 100ms linear' }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={BTN} aria-label="Previous chapter" onClick={() => dispatch({ type: 'prev' })}>‹</button>
          <button type="button" className={BTN} aria-label={state.playing ? 'Pause' : 'Play'} onClick={() => dispatch({ type: 'toggle' })}>
            {state.playing ? 'Ⅱ' : '▶'}
          </button>
          <button type="button" className={BTN} aria-label="Next chapter" onClick={() => dispatch({ type: 'next' })}>›</button>
          <button type="button" className={BTN} aria-label="Replay chapter" onClick={replay}>↻</button>
          <DemoAudio chapters={chapters} index={state.index} playing={state.playing} hidden={hidden} />
        </div>
        <ol className="mt-3 flex flex-wrap justify-center gap-1.5">
          {chapters.map((c, i) => (
            <li key={c.id}>
              {/* The button's hit area is 24x28 (WCAG 2.5.8's minimum), padded around a visually
                  smaller 10px pill — shrinking the target itself would fail once these wrap to a
                  second row on a phone (confirmed at 375px), while the padding costs nothing. */}
              <button type="button" aria-label={c.title} title={c.title}
                aria-current={i === state.index ? 'step' : undefined}
                onClick={() => dispatch({ type: 'goto', index: i })}
                className="group flex h-6 w-7 items-center justify-center">
                <span aria-hidden="true"
                  className={`h-2.5 w-7 rounded-full transition-colors ${i === state.index ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-line)] group-hover:bg-[color:var(--color-muted)]'}`} />
              </button>
            </li>
          ))}
        </ol>
        {reduced && (
          <p className="mt-3 text-center text-[13px] text-faint">Motion is off. Use ‹ and › to move between chapters.</p>
        )}
      </nav>

      <details className="mt-6 text-[14px] text-muted">
        <summary className="cursor-pointer">Read the whole tour as text</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          {chapters.map((c) => (
            <li key={c.id}>
              <strong className="text-text">{c.title}.</strong> {c.caption}{' '}
              <span className="text-faint">({c.badge})</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
