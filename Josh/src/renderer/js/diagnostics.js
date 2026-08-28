/**
 * Streaming diagnostic condensing: line assembly, safety guards, and the
 * state machine that decides whether a block of output is a diagnostic.
 *
 * The governing rule is that losing output is unacceptable while failing to
 * condense is merely disappointing. Every uncertainty in this file resolves
 * toward emitting the original bytes untouched.
 *
 * Written as a UMD module so the browser can load it as a plain script while
 * the test suite can require() the exact same file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Diagnostics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Split `pending + chunk` into complete lines plus a trailing partial.
   *
   * Each returned line keeps its own terminator, so the caller can always
   * reconstruct the input exactly: lines.join('') + rest === pending + chunk.
   * That identity is the feature's central invariant.
   *
   * Only LF terminates a line. A bare CR does not: progress bars rewrite one
   * line using CR with no LF, and treating CR as a terminator would shred a
   * single visual line into hundreds of logical ones.
   */
  function splitLines(pending, chunk) {
    const buffer = (pending || '') + (chunk || '');
    const lines = [];
    let start = 0;

    for (;;) {
      const nl = buffer.indexOf('\n', start);
      if (nl === -1) break;
      lines.push(buffer.slice(start, nl + 1));
      start = nl + 1;
    }

    return { lines: lines, rest: buffer.slice(start) };
  }

  /**
   * SGR is `ESC [ <params> m`. Params are digits and semicolons only; the
   * private-marker forms (`?`, `>`, `<`, `=`) are not SGR even when they end
   * in `m`, so they are excluded deliberately.
   */
  const SGR = /\x1b\[[0-9;]*m/g;

  /** Any escape introducer at all, to detect what SGR removal left behind. */
  const ANY_ESC = /\x1b/;

  /** `ESC[?1049h` and the two legacy spellings, capturing the final letter. */
  const SCREEN_MODE = /\x1b\[\?(1049|1047|47)(h|l)/g;

  /** Remove SGR colour sequences, leaving the text they decorated. */
  function stripSgr(line) {
    return line.replace(SGR, '');
  }

  /**
   * A line is safe to buffer only if every escape in it is SGR colour.
   *
   * Diagnostics colour their text; they never move the cursor, erase, or set
   * a title. Anything that does is a program drawing a UI, and holding its
   * output back for 16ms would corrupt what the user sees. Fails open.
   */
  function isSafeLine(line) {
    return !ANY_ESC.test(stripSgr(line));
  }

  /**
   * Track alternate-screen entry and exit across a raw chunk.
   *
   * Inside the alternate screen there is no line assembly at all - vim, htop
   * and less own the display, and this feature must be invisible to them.
   * The last transition in the chunk wins, since a program can enter and
   * leave within a single read.
   */
  function scanScreenMode(chunk, isAlternate) {
    let state = isAlternate;
    SCREEN_MODE.lastIndex = 0;
    let match = SCREEN_MODE.exec(chunk);
    while (match) {
      state = match[2] === 'h';
      match = SCREEN_MODE.exec(chunk);
    }
    return state;
  }

  return {
    splitLines,
    stripSgr,
    isSafeLine,
    scanScreenMode,
  };
});
