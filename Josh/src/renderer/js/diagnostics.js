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

  const FLUSH_MS = 16;
  const FLUSH_LINES = 64;
  const BLOCK_LINE_CAP = 500;
  const BLOCK_MS_CAP = 200;

  /**
   * The streaming state machine.
   *
   * PASSTHROUGH
   *   partial line  -> emit immediately
   *   complete line -> queue; flush on a 16ms timer or 64 lines
   *                    matches a matcher's `starts` -> BUFFERING
   *
   * BUFFERING
   *   suspend the flush timer and accumulate, capped at 500 lines or 200ms
   *   block end -> shorter than minLines, flush verbatim; else condense
   *   cap or anomaly -> flush verbatim
   *
   * Buffering rather than retracting is forced by the terminal: written lines
   * can be erased with cursor-up only while they are still on screen, and a
   * 200-line error has already scrolled into scrollback, which ANSI cannot
   * reach. Deciding before writing is the only correct option.
   */
  class Condenser {
    constructor(options) {
      const o = options || {};
      this.emit = o.emit;
      this.onCondensed = o.onCondensed || function () {};
      this.matchers = o.matchers || [];
      this.cwd = o.cwd || function () { return null; };
      this.enabled = o.enabled || function () { return true; };
      this.minLines = o.minLines || function () { return 20; };
      this.schedule = o.schedule || function (fn, ms) { return setTimeout(fn, ms); };
      this.cancel = o.cancel || function (handle) { clearTimeout(handle); };

      this.pending = '';      // partial line carried between chunks
      this.committed = 0;     // chars of `pending` already written to screen
      this.queue = [];        // complete lines awaiting the flush timer
      this.timer = null;
      this.isAlternate = false;

      this.block = null;      // { matcher, lines, startedAt }
      this.nextId = 1;
    }

    write(chunk) {
      if (typeof chunk !== 'string' || chunk === '') return;

      const wasAlternate = this.isAlternate;
      this.isAlternate = scanScreenMode(chunk, this.isAlternate);

      // Inside the alternate screen there is no line assembly at all. Entering
      // it mid-block abandons the block, original bytes first.
      if (wasAlternate || this.isAlternate) {
        this._abandonBlock();
        this._drainQueue();
        this._commitPending();
        this.pending = '';
        this.committed = 0;
        this.emit(chunk);
        return;
      }

      const split = splitLines(this.pending, chunk);
      const carried = this.committed;
      this.pending = split.rest;
      this.committed = split.lines.length ? 0 : carried;

      // Only the first completed line can carry already-written characters,
      // because `pending` is at most one partial line.
      let first = true;
      for (const line of split.lines) {
        this._line(line, first ? carried : 0);
        first = false;
      }

      // A partial tail is held, not written, so that a diagnostic split across
      // chunk boundaries still assembles into lines. The flush timer releases
      // it 16ms later, which is what keeps `Enter your name: ` from hanging.
      if (this.pending && !this.block) this._startTimer();
    }

    /** Emit everything held, in order, and return to PASSTHROUGH. */
    flushNow() {
      if (this.block) this._closeBlock();
      this._drainQueue();
      this._commitPending();
    }

    /**
     * Write the not-yet-written part of the partial tail.
     *
     * `committed` then records how much of that line is already on screen, so
     * when the rest of it arrives only the remainder is written and no byte is
     * ever duplicated. A line with characters already on screen can no longer
     * open a block, because what is displayed cannot be retracted.
     */
    _commitPending() {
      if (this.pending.length <= this.committed) return;
      this.emit(this.pending.slice(this.committed));
      this.committed = this.pending.length;
    }

    dispose() {
      this._stopTimer();
      this.flushNow();
    }

    // ---- internals --------------------------------------------------------

    _line(line, alreadyOnScreen) {
      // The head of this line was already written by a flush timer, so it can
      // neither be buffered nor claimed by a matcher. Emit only the remainder.
      if (alreadyOnScreen) {
        this._drainQueue();
        this.emit(line.slice(alreadyOnScreen));
        return undefined;
      }

      if (this.block) {
        // Anything that is not plain coloured text abandons the block, and is
        // then emitted itself - it was never part of the diagnostic.
        if (!isSafeLine(line)) {
          this._abandonBlock();
          this.emit(line);
          return undefined;
        }

        // The line that ends a block is not part of it. `make: *** [all]
        // Error 1` belongs after the summary, not inside it, and counting it
        // would overstate what was hidden. Closing first and then falling
        // through handles it as ordinary output.
        if (this.block.matcher.isEnd([line])) {
          this._closeBlock();
        } else {
          this.block.lines.push(line);
          if (this.block.lines.length > BLOCK_LINE_CAP) return this._abandonBlock();
          if (Date.now() - this.block.startedAt > BLOCK_MS_CAP) return this._abandonBlock();
          return undefined;
        }
      }

      if (!isSafeLine(line)) {
        this._drainQueue();
        this.emit(line);
        return undefined;
      }

      const matcher = this._matcherFor(line);
      if (matcher) {
        this._drainQueue();
        this._stopTimer();
        this.block = { matcher: matcher, lines: [line], startedAt: Date.now() };
        return undefined;
      }

      this.queue.push(line);
      if (this.queue.length >= FLUSH_LINES) this._drainQueue();
      else this._startTimer();
      return undefined;
    }

    _matcherFor(line) {
      if (!this.enabled()) return null;
      const text = stripSgr(line);
      for (const matcher of this.matchers) {
        if (matcher.starts.some((pattern) => pattern.test(text))) return matcher;
      }
      return null;
    }

    /** Give up on the current block and emit its bytes untouched. */
    _abandonBlock() {
      if (!this.block) return undefined;
      const lines = this.block.lines;
      this.block = null;
      for (const line of lines) this.emit(line);
      return undefined;
    }

    _closeBlock() {
      if (!this.block) return undefined;
      const block = this.block;
      this.block = null;
      const original = block.lines.join('');

      if (block.lines.length < this.minLines()) {
        this.emit(original);
        return undefined;
      }

      let summary = null;
      try {
        summary = block.matcher.condense(block.lines, { cwd: this.cwd() });
      } catch (error) {
        summary = null;
      }
      if (!summary) {
        this.emit(original);
        return undefined;
      }

      const id = this.nextId++;
      this.emit(render(summary));
      this.onCondensed({ id: id, original: original, summary: summary });
      return undefined;
    }

    _drainQueue() {
      if (!this.queue.length) return;
      const held = this.queue;
      this.queue = [];
      for (const line of held) this.emit(line);
    }

    _startTimer() {
      if (this.timer !== null) return;
      this.timer = this.schedule(() => {
        this.timer = null;
        this._drainQueue();
        this._commitPending();
      }, FLUSH_MS);
    }

    _stopTimer() {
      if (this.timer === null) return;
      this.cancel(this.timer);
      this.timer = null;
    }
  }

  /** The three-line replacement a condensed block leaves behind. */
  function render(summary) {
    return (
      '\x1b[1;31m' + summary.headline + '\x1b[0m\r\n' +
      '  \x1b[1myour code:\x1b[0m ' + summary.location + '\r\n' +
      '  \x1b[2m\u21b3 ' + summary.hiddenCount +
      ' lines hidden \u2014 \u2325\u21b5 to expand\x1b[0m\r\n'
    );
  }

  return {
    splitLines,
    stripSgr,
    isSafeLine,
    scanScreenMode,
    Condenser,
    render,
    FLUSH_MS,
    FLUSH_LINES,
    BLOCK_LINE_CAP,
    BLOCK_MS_CAP,
  };
});
