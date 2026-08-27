/**
 * Colour and glyph resolution, shared by the shell emitters and the preview.
 *
 * A theme names semantic slots, not colours. This module is where a slot
 * becomes a concrete colour, where a segment picks between its rich glyph and
 * its ASCII fallback, and where the three values that need formatting -- a
 * path, a duration and a git summary -- take their display form.
 *
 * The preview panel and the generated shell script both go through here, so a
 * theme cannot look one way in the preview and another in the terminal. What
 * is *not* shared is text assembly: renderPreview() builds concrete spans from
 * concrete state, while the emitter builds shell code in which the same
 * segments are references to variables computed at prompt time.
 *
 * Pure: no Node built-ins, no DOM. Loadable in the main process, the renderer
 * and the test suite alike.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KitRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Powerline branch mark, built from its code point for the same reason as
   *  the separator in kit-themes.js: a private-use literal is invisible in
   *  review, and a backslash-u escape gets rewritten by tooling. */
  const BRANCH_MARK = String.fromCodePoint(0xE0A0);

  const GLYPH_MODES = Object.freeze(['plain', 'rich']);

  /**
   * Fallback palette. Every slot must resolve to a colour even when handed an
   * empty or half-built theme, because a prompt segment with no colour emits
   * broken escape codes rather than merely looking wrong.
   */
  const FALLBACK = Object.freeze({
    accent: '#7aa2f7',
    ok: '#9ece6a',
    warn: '#e0af68',
    error: '#f7768e',
    muted: '#565f89',
    fg: '#c0caf5',
  });

  const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  /** Count markers. Rich uses symbols; plain stays inside ASCII, because the
   *  plain mode exists precisely for fonts that render anything fancier as an
   *  empty box. Every marker within a mode is distinct, so a count is always
   *  attributable to its kind. */
  const MARKERS = Object.freeze({
    rich: Object.freeze({
      ahead: '↑', behind: '↓', staged: '●',
      unstaged: '✚', untracked: '?', conflicts: '✖',
    }),
    plain: Object.freeze({
      ahead: '^', behind: 'v', staged: '+',
      unstaged: '*', untracked: '?', conflicts: 'x',
    }),
  });

  /** Fixed render order, so a prompt never reshuffles between invocations. */
  const COUNTS = Object.freeze([
    'ahead', 'behind', 'staged', 'unstaged', 'untracked', 'conflicts',
  ]);

  function isRich(glyphs) {
    return glyphs === 'rich';
  }

  function colour(value, fallback) {
    return typeof value === 'string' && HEX.test(value) ? value : fallback;
  }

  /**
   * Slot to colour. Accent and muted are UI tokens; ok, warn and error borrow
   * the terminal's own green, yellow and red so the prompt agrees with the
   * output beneath it; fg is the terminal foreground.
   */
  function resolveSlots(ui, xterm) {
    const tokens = ui && typeof ui === 'object' ? ui : {};
    const palette = xterm && typeof xterm === 'object' ? xterm : {};
    return {
      accent: colour(tokens.accent, FALLBACK.accent),
      ok: colour(palette.green, FALLBACK.ok),
      warn: colour(palette.yellow, FALLBACK.warn),
      error: colour(palette.red, FALLBACK.error),
      muted: colour(tokens.muted, FALLBACK.muted),
      fg: colour(palette.foreground, FALLBACK.fg),
    };
  }

  function pickGlyph(segment, glyphs) {
    if (!segment || typeof segment !== 'object') return '';
    const rich = typeof segment.text === 'string' ? segment.text : '';
    const plain = typeof segment.fallback === 'string' ? segment.fallback : '';
    if (isRich(glyphs)) return rich || plain;
    return plain || rich;
  }

  /**
   * Collapse the home directory and optionally keep only the trailing
   * components. The home test is an exact match or a home-plus-slash prefix,
   * never a bare prefix: /home/username must not become ~sername because the
   * user happens to be /home/u.
   */
  function formatCwd(cwd, home, truncate, glyphs) {
    let path = typeof cwd === 'string' ? cwd : '';
    if (path === '') return '';

    const base = typeof home === 'string' ? home : '';
    if (base !== '' && (path === base || path.startsWith(base + '/'))) {
      path = '~' + path.slice(base.length);
    }

    const keep = Number.isFinite(truncate) ? Math.max(0, Math.round(truncate)) : 0;
    if (keep === 0) return path;

    const parts = path.split('/').filter(Boolean);
    if (parts.length <= keep) return path;

    const elision = isRich(glyphs) ? '…' : '...';
    return elision + '/' + parts.slice(-keep).join('/');
  }

  /**
   * Human duration. Seconds carry one decimal, which is the resolution a
   * person actually reads off a prompt, and the sixty-second boundary rolls
   * into minutes rather than printing "60s".
   */
  function formatDuration(ms) {
    const value = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0;
    if (value < 1000) return value + 'ms';

    const tenths = Math.round(value / 100);
    if (tenths < 600) return (tenths / 10) + 's';

    const seconds = Math.round(value / 1000);
    const whole = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest > 0 ? whole + 'm ' + rest + 's' : whole + 'm';
  }

  function count(value) {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }

  /**
   * Branch plus non-zero counts. A clean tree shows the branch name alone,
   * which is the common case and the one worth keeping quiet.
   */
  function formatGit(git, glyphs) {
    if (!git || typeof git !== 'object') return '';
    const name = typeof git.branch === 'string' ? git.branch : '';
    if (name === '') return '';

    const markers = isRich(glyphs) ? MARKERS.rich : MARKERS.plain;
    const head = git.detached === true ? '(' + name + ')' : name;
    const parts = [isRich(glyphs) ? BRANCH_MARK + ' ' + head : head];

    for (const key of COUNTS) {
      const n = count(git[key]);
      if (n > 0) parts.push(markers[key] + n);
    }

    return parts.join(' ');
  }

  /** The concrete text a segment shows for a given state, or '' to omit it. */
  function segmentText(segment, state, glyphs) {
    const opts = segment.opts && typeof segment.opts === 'object' ? segment.opts : {};

    switch (segment.type) {
      case 'user':
        return typeof state.user === 'string' ? state.user : '';
      case 'host':
        return typeof state.host === 'string' ? state.host : '';
      case 'cwd':
        return formatCwd(state.cwd, state.home, opts.truncate, glyphs);
      case 'git':
        return formatGit(state.git, glyphs);
      case 'exit': {
        const code = count(state.exit);
        if (opts.onlyOnFailure === true && code === 0) return '';
        return Number.isFinite(state.exit) ? String(Math.round(state.exit)) : '';
      }
      case 'duration': {
        const ms = count(state.durationMs);
        if (ms === 0) return '';
        if (Number.isFinite(opts.minMs) && ms < opts.minMs) return '';
        return formatDuration(ms);
      }
      case 'jobs': {
        const jobs = count(state.jobs);
        return jobs > 0 ? String(jobs) : '';
      }
      case 'time':
        return typeof state.time === 'string' ? state.time : '';
      case 'venv':
        return typeof state.venv === 'string' ? state.venv : '';
      case 'char':
        return pickGlyph(segment, glyphs);
      default:
        return '';
    }
  }

  /**
   * Render a theme against concrete state, for the preview panel.
   *
   * `caps` carries the active colour theme's `ui` and `xterm` tables and the
   * glyph mode. Segments with nothing to say produce no span at all, so an
   * empty prompt is an empty line rather than a row of separators. A multiline
   * theme puts its prompt character on a line of its own, which is the whole
   * point of being multiline.
   */
  function renderPreview(theme, state, caps) {
    const options = caps && typeof caps === 'object' ? caps : {};
    const slots = resolveSlots(options.ui, options.xterm);
    const glyphs = options.glyphs;
    const values = state && typeof state === 'object' ? state : {};
    const segments = theme && Array.isArray(theme.segments) ? theme.segments : [];

    const spans = [];
    for (const segment of segments) {
      if (!segment || typeof segment !== 'object') continue;
      const text = segmentText(segment, values, glyphs);
      if (text === '') continue;
      spans.push({ text: text, colour: slots[segment.slot] || slots.fg });
    }

    const multiline = theme && theme.multiline === true && spans.length > 1;
    const lines = multiline ? [spans.slice(0, -1), spans.slice(-1)] : [spans];

    // A trailing space on every span but the last of its line, so that
    // concatenating a line yields the prompt as the shell would space it.
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i += 1) line[i].text += ' ';
    }

    return { lines: lines };
  }

  return {
    BRANCH_MARK, GLYPH_MODES, MARKERS, COUNTS,
    resolveSlots, pickGlyph, formatCwd, formatDuration, formatGit,
    segmentText, renderPreview,
  };
});
