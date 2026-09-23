import type { TourAction } from './clock';

export interface KeyInput {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** The event target's tag name, upper case, if it is an element. */
  tag?: string;
  /** True when the target is a contenteditable region. */
  editable?: boolean;
}

/** What a key press means to the tour: a clock action, a request to leave, or nothing at all. */
export type KeyResult = { action: TourAction } | { exit: true } | null;

const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Anything where Space belongs to the element: it activates a button and types into a field. */
const OWNS_SPACE = new Set(['BUTTON', 'A', 'SUMMARY', ...TEXT_ENTRY]);

/**
 * The tour's keymap, pure so its edges can be tested without a DOM.
 *
 * - Space toggles play, once per press (a held key repeats and would flicker), and is left to a
 *   focused control, where it activates the control.
 * - The arrows, Home and End move between chapters. They are NOT left to a focused button or link:
 *   pressing → straight after clicking "Next chapter" has to keep working. They are left alone only
 *   where they edit text.
 * - Any browser or OS shortcut (a modifier held) is none of the tour's business.
 *
 * The caller `preventDefault`s every key this returns a result for: several chapters are taller than
 * a screen, so Home, End and Space would otherwise also scroll the page and carry the scene off it.
 */
export function keyResult(k: KeyInput, lastIndex: number): KeyResult {
  if (k.metaKey || k.ctrlKey || k.altKey) return null;
  const tag = k.tag ?? '';
  const typing = TEXT_ENTRY.has(tag) || !!k.editable;

  switch (k.key) {
    case ' ':
      return k.repeat || OWNS_SPACE.has(tag) || k.editable ? null : { action: { type: 'toggle' } };
    case 'ArrowRight': return typing ? null : { action: { type: 'next' } };
    case 'ArrowLeft': return typing ? null : { action: { type: 'prev' } };
    case 'Home': return typing ? null : { action: { type: 'goto', index: 0 } };
    case 'End': return typing ? null : { action: { type: 'goto', index: lastIndex } };
    case 'Escape': return { exit: true };
    default: return null;
  }
}
