'use strict';

/**
 * Prompt themes, as data.
 *
 * A theme is an ordered list of segments. Each segment names a semantic colour
 * slot rather than a concrete colour, so the same theme takes its palette from
 * whichever Josh colour theme is active. Nothing here renders anything; this
 * module defines the vocabulary and coerces untrusted input into it.
 *
 * User themes are read from ~/.config/josh/shell-kit/themes/*.json and pass
 * through exactly the same coercion as the built-ins, so a hand-mangled file
 * degrades to "ignored" rather than producing broken shell script.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitThemes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SEGMENT_TYPES = Object.freeze([
    'user', 'host', 'cwd', 'git', 'exit', 'duration', 'jobs', 'time', 'venv', 'char',
  ]);

  const SLOTS = Object.freeze(['accent', 'ok', 'warn', 'error', 'muted', 'fg']);

  const NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
  const MAX_SEGMENTS = 12;
  const MAX_GLYPH_LENGTH = 4;

  // Powerline separator, built from its code point. A literal private-use
  // character is invisible in review, and an escape sequence is liable to be
  // rewritten by tooling. This form is neither.
  const SEPARATOR_RIGHT = String.fromCodePoint(0xE0B0);

  /** Only these opts keys are honoured; anything else is dropped. */
  const OPT_KEYS = Object.freeze({
    truncate: 'number',        // cwd: keep this many trailing path components
    onlyOnFailure: 'boolean',  // exit: render only when the code is non-zero
    minMs: 'number',           // duration: render only above this threshold
  });

  const THEMES = Object.freeze({
    plain: {
      name: 'plain',
      multiline: false,
      segments: [
        { type: 'cwd', slot: 'fg', opts: { truncate: 2 } },
        { type: 'git', slot: 'muted', opts: {} },
        { type: 'char', slot: 'accent', text: '$', fallback: '$', opts: {} },
      ],
    },
    classic: {
      name: 'classic',
      multiline: false,
      segments: [
        { type: 'cwd', slot: 'accent', opts: { truncate: 3 } },
        { type: 'git', slot: 'muted', opts: {} },
        { type: 'exit', slot: 'error', opts: { onlyOnFailure: true } },
        { type: 'char', slot: 'accent', text: '>', fallback: '>', opts: {} },
      ],
    },
    rail: {
      name: 'rail',
      multiline: false,
      segments: [
        { type: 'cwd', slot: 'accent', opts: { truncate: 3 } },
        { type: 'git', slot: 'ok', opts: {} },
        { type: 'exit', slot: 'error', opts: { onlyOnFailure: true } },
        { type: 'char', slot: 'fg', text: SEPARATOR_RIGHT, fallback: '>', opts: {} },
      ],
    },
    stack: {
      name: 'stack',
      multiline: true,
      segments: [
        { type: 'cwd', slot: 'accent', opts: { truncate: 0 } },
        { type: 'git', slot: 'muted', opts: {} },
        { type: 'duration', slot: 'muted', opts: { minMs: 2000 } },
        { type: 'char', slot: 'accent', text: '>', fallback: '>', opts: {} },
      ],
    },
    context: {
      name: 'context',
      multiline: false,
      segments: [
        { type: 'user', slot: 'muted', opts: {} },
        { type: 'host', slot: 'warn', opts: {} },
        { type: 'cwd', slot: 'accent', opts: { truncate: 3 } },
        { type: 'git', slot: 'muted', opts: {} },
        { type: 'duration', slot: 'muted', opts: { minMs: 2000 } },
        { type: 'exit', slot: 'error', opts: { onlyOnFailure: true } },
        { type: 'char', slot: 'accent', text: '>', fallback: '>', opts: {} },
      ],
    },
  });

  function themeNames() {
    return Object.keys(THEMES);
  }

  /**
   * Remove C0 controls and DEL. Written as a code-point scan rather than a
   * regex so that no control character appears anywhere in this source file.
   */
  function stripControls(value) {
    let out = '';
    for (const character of String(value)) {
      const code = character.codePointAt(0);
      if (code < 0x20 || code === 0x7f) continue;
      out += character;
    }
    return out;
  }

  function coerceOpts(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const key of Object.keys(OPT_KEYS)) {
      const value = raw[key];
      if (typeof value !== OPT_KEYS[key]) continue;
      if (OPT_KEYS[key] === 'number') {
        if (!Number.isFinite(value)) continue;
        out[key] = Math.max(0, Math.min(100000, Math.round(value)));
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  /**
   * Glyphs lose their control characters and are capped hard. A segment's text
   * is baked into shell script, so a long or control-bearing value is a
   * script-injection surface as much as a display problem. Over-long values
   * fall back rather than being truncated, since half a glyph is nonsense.
   */
  function coerceGlyph(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const clean = stripControls(value);
    if (clean.length === 0 || clean.length > MAX_GLYPH_LENGTH) return fallback;
    return clean;
  }

  function coerceSegment(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!SEGMENT_TYPES.includes(raw.type)) return null;
    const segment = {
      type: raw.type,
      slot: SLOTS.includes(raw.slot) ? raw.slot : 'fg',
      opts: coerceOpts(raw.opts),
    };
    if (raw.type === 'char') {
      segment.text = coerceGlyph(raw.text, '>');
      segment.fallback = coerceGlyph(raw.fallback, '>');
    }
    return segment;
  }

  function coerceTheme(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.name !== 'string' || !NAME_PATTERN.test(raw.name)) return null;
    if (!Array.isArray(raw.segments)) return null;

    const segments = raw.segments
      .slice(0, MAX_SEGMENTS)
      .map(coerceSegment)
      .filter(Boolean);

    return { name: raw.name, multiline: raw.multiline === true, segments: segments };
  }

  return {
    SEGMENT_TYPES, SLOTS, THEMES, themeNames, coerceTheme,
    stripControls, SEPARATOR_RIGHT,
  };
});
