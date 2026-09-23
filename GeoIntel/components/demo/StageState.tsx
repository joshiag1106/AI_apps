'use client';

import { createContext, useContext } from 'react';

/**
 * True while the tour is stopped on a scene that has not started (lib/demo/stage's `still`: the reader
 * moved to another chapter while paused, or the page opened under reduced motion).
 *
 * The CSS rule for `data-still` finishes every `.demo-*` beat, but the scenes also hold JavaScript
 * motion that CSS cannot reach: the count-ups, the typed question, the star's pop and the palette swap.
 * Those read this and treat it like `prefers-reduced-motion`: show the finished state, run no timer.
 * When the reader presses Play it becomes false and they start, so the whole scene plays from its
 * first frame, the same as the CSS beats do.
 *
 * Defaults to false so a scene rendered outside the shell (the server, a test) animates as before.
 */
export const StillContext = createContext(false);
export const useStill = () => useContext(StillContext);
