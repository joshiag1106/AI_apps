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

  return {
    splitLines,
  };
});
