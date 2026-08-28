/**
 * The matcher registry: what turns "condense diagnostics" from one language's
 * problem into an incremental one.
 *
 * A matcher is a plain object with no I/O:
 *
 *   { id, starts: RegExp[], isEnd(lines), condense(lines, { cwd }) }
 *
 * Matchers are consulted in registration order and the first whose `starts`
 * matches an incoming line claims the block. `condense` returning null means
 * "I opened this block but cannot summarise it confidently", which fails open
 * like every other uncertainty in this feature.
 *
 * Adding a language means adding a grammar, a vendor-path rule and fixtures -
 * not touching the state machine.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./demangle.js'));
  } else {
    root.DiagnosticMatchers = factory(root.Demangle);
  }
})(typeof self !== 'undefined' ? self : this, function (Demangle) {
  'use strict';

  const SGR = /\x1b\[[0-9;]*m/g;

  /**
   * `path:line[:col]: severity: message`
   *
   * The path group is lazy but the trailing anchor forces it to extend past a
   * Windows drive colon, so `C:\src\a.cpp:42:15:` keeps its drive letter.
   */
  const LOCATION_WITH_SEVERITY =
    /^(.*?):(\d+)(?::(\d+))?:\s+(error|warning|note|fatal error):\s+(.*)$/;

  /**
   * The same shape with no severity word: `path:line:col:   required from here`.
   *
   * This is not an edge case, it is the whole feature. GCC writes the frame
   * that belongs to the user on exactly this line, with no `error:` or `note:`
   * before it. A parser that demands a severity finds every library frame and
   * misses the only one worth reporting, so `condense` gives up on precisely
   * the diagnostics it exists to summarise.
   */
  const LOCATION_PLAIN = /^(.*?):(\d+)(?::(\d+))?:\s+(\S.*)$/;

  const VENDOR_PATTERNS = [
    /\/usr\/include\//,
    /\/usr\/lib\//,
    /\/bits\//,
    /\/c\+\+\/v?\d/,
    /\/Library\/Developer\//,
    /\/Applications\/Xcode\.app\//,
    /[\\/]Program Files[^\\/]*[\\/]/i,
    /[\\/]MSVC[\\/]/i,
    /[\\/]Windows Kits[\\/]/i,
    /\/gcc\/[^/]+\/\d+/,
  ];

  function stripSgr(text) {
    return String(text).replace(SGR, '');
  }

  /**
   * Parse the compiler line shape shared by GCC and Clang.
   *
   * The severity form is tried first so a real `error:` is never mistaken for
   * message text; the plain form then catches continuation lines, whose
   * `severity` is null.
   */
  function parseLocation(line) {
    const text = stripSgr(line).replace(/\r?\n$/, '');

    const withSeverity = LOCATION_WITH_SEVERITY.exec(text);
    if (withSeverity) {
      return {
        path: withSeverity[1],
        line: Number(withSeverity[2]),
        column: withSeverity[3] === undefined ? null : Number(withSeverity[3]),
        severity: withSeverity[4],
        message: withSeverity[5].trim(),
      };
    }

    const plain = LOCATION_PLAIN.exec(text);
    if (!plain) return null;
    return {
      path: plain[1],
      line: Number(plain[2]),
      column: plain[3] === undefined ? null : Number(plain[3]),
      severity: null,
      message: plain[4].trim(),
    };
  }

  /** Does this path belong to a toolchain rather than to the user? */
  function isVendorPath(path) {
    if (typeof path !== 'string' || !path) return true;
    return VENDOR_PATTERNS.some((pattern) => pattern.test(path));
  }

  /**
   * The first frame that is the user's own code.
   *
   * Preferring paths under `cwd` sharpens the judgement considerably: two
   * frames can both be non-vendor while only one is in the project being
   * built. Returns null when every frame belongs to a library, which is the
   * signal for condense() to give up and show the original.
   */
  function pickUserFrame(paths, cwd) {
    const mine = paths.filter((path) => !isVendorPath(path));
    if (!mine.length) return null;
    if (cwd) {
      const inside = mine.find((path) => path.startsWith(cwd));
      if (inside) return inside;
    }
    return mine[0];
  }

  return {
    ALL: [],
    parseLocation,
    isVendorPath,
    pickUserFrame,
    stripSgr,
    demangle: Demangle.demangle,
  };
});
