/**
 * The typography values the keyboard can move, and the rules for moving them.
 *
 * Shared rather than local because three places need the same numbers: the
 * settings schema, which clamps them; the renderer, which steps them; and the
 * reset commands, which restore them. Before this module the renderer reset
 * font size to a literal 14 while settings.js separately declared 14, so a
 * change to one silently stopped matching the other.
 *
 * Rounding is not cosmetic. A line height stepped by 0.05 lands on
 * 1.2000000000000002 in binary floating point, and that value reaches the
 * settings file on disk and the status bar. Two decimal places is finer than
 * any of these settings can be perceived at, and it stays readable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Typography = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    fontSize: 14,
    lineHeight: 1.2,
    letterSpacing: 0,
  });

  /**
   * The ranges the settings schema enforces. Declared here so the renderer can
   * clamp as it steps and never offer a value the schema would refuse.
   */
  const RANGES = Object.freeze({
    fontSize: [6, 72],
    lineHeight: [0.8, 3],
    letterSpacing: [-5, 10],
  });

  /** How far one keystroke moves each setting. */
  const STEPS = Object.freeze({
    fontSize: 1,
    lineHeight: 0.05,
    letterSpacing: 0.5,
  });

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * One step, clamped to the range the settings schema will accept.
   *
   * `fallback` covers a settings file that has been hand-edited into something
   * non-numeric: the keystroke still does something sensible rather than
   * writing NaN back to disk.
   */
  function adjust(value, delta, range, fallback) {
    const base = typeof value === 'number' && Number.isFinite(value)
      ? value
      : (typeof fallback === 'number' ? fallback : range[0]);
    return round(Math.min(range[1], Math.max(range[0], base + delta)));
  }

  /**
   * The next theme along, wrapping at both ends.
   *
   * A current name that is not in the list -- 'auto', which is the default, or
   * a name dropped from a later version -- starts at the beginning rather than
   * returning nothing.
   */
  function cycleTheme(names, current, direction) {
    if (!Array.isArray(names) || names.length === 0) return null;
    const at = names.indexOf(current);
    if (at === -1) return names[0];
    const next = (at + (direction < 0 ? -1 : 1) + names.length) % names.length;
    return names[next];
  }

  return { DEFAULTS, RANGES, STEPS, adjust, cycleTheme, round };
});
