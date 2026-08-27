/**
 * Does this font actually have powerline glyphs?
 *
 * This is the question a shell framework structurally cannot answer. It runs
 * inside a terminal and can only guess from environment variables; Josh owns
 * the window, so it can measure.
 *
 * The measurement: compare the advance width of the powerline separator
 * against a plane-16 private-use code point that no font in existence defines.
 * If the two are the same width, both fell back to the same missing-glyph box,
 * and the font has no powerline coverage.
 *
 * Anything that goes wrong yields plain. A missing glyph renders as an empty
 * box on every single prompt, which is a worse outcome than a plain one.
 *
 * detectGlyphs takes its measuring function as an argument so the decision can
 * be tested without a canvas; measureWithCanvas is the thin renderer half.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitGlyphs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Built from code points for the same reason as everywhere else in the kit:
  // a private-use literal is invisible in review, and an escape gets rewritten.
  const POWERLINE = String.fromCodePoint(0xE0B0);

  // Supplementary Private Use Area-B. Nothing defines this, so whatever it
  // measures is this font stack's missing-glyph box.
  const UNDEFINED_GLYPH = String.fromCodePoint(0x10FFFD);

  // Advance widths are floats. Two glyphs that are really the same box come
  // back identical; this only guards against representation noise.
  const EPSILON = 0.01;

  function detectGlyphs(measure) {
    if (typeof measure !== 'function') return 'plain';

    let powerline;
    let missing;
    try {
      powerline = measure(POWERLINE);
      missing = measure(UNDEFINED_GLYPH);
    } catch {
      return 'plain';
    }

    if (!Number.isFinite(powerline) || !Number.isFinite(missing)) return 'plain';
    if (powerline <= 0 || missing <= 0) return 'plain';
    if (Math.abs(powerline - missing) < EPSILON) return 'plain';
    return 'rich';
  }

  /**
   * The mode to send with pty:create.
   *
   * An explicit rich or plain overrides detection entirely -- the font is never
   * measured, because a user who has said which they want has better
   * information than a measurement. Only auto measures.
   */
  function resolveGlyphs(settings, measure) {
    const wanted = settings && typeof settings.shellKitGlyphs === 'string'
      ? settings.shellKitGlyphs
      : 'auto';
    if (wanted === 'rich' || wanted === 'plain') return wanted;
    return detectGlyphs(measure);
  }

  /**
   * A measuring function bound to a real font stack, for the renderer.
   *
   * Returns null where there is no canvas to measure with, which detectGlyphs
   * reads as "cannot tell" and answers plain.
   */
  function measureWithCanvas(fontFamily, fontSize, documentRef) {
    const doc = documentRef || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') return null;

    let context;
    try {
      context = doc.createElement('canvas').getContext('2d');
    } catch {
      return null;
    }
    if (!context) return null;

    const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14;
    context.font = size + 'px ' + (fontFamily || 'monospace');

    return function measure(text) {
      const metrics = context.measureText(text);
      return metrics ? metrics.width : NaN;
    };
  }

  return { POWERLINE, UNDEFINED_GLYPH, detectGlyphs, resolveGlyphs, measureWithCanvas };
});
