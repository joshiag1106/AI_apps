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

  /**
   * C++ template instantiation.
   *
   * Keys off both compilers' vocabulary: GCC's "In instantiation of",
   * "required from" and "required from here"; Clang's "in instantiation of ...
   * requested here"; and the shared location line shape.
   */
  const cxxTemplate = {
    id: 'cxx-template',

    starts: [
      /\bin instantiation of\b/i,
      /\brequired from here\b/,
      /\brequired from\b/,
      /\bin file included from\b/i,
      // The error line itself, because it arrives *before* the instantiation
      // vocabulary does. Opening only on that vocabulary loses the headline:
      // by the time "required from here" appears, the `error:` line has
      // already been flushed and the summary has nothing to report. Notes are
      // deliberately not openers - they never start a diagnostic.
      /^(.+):(\d+):(\d+):\s+(error|fatal error):/,
    ],

    /** What distinguishes this family from an ordinary compiler error. */
    isTemplateFamily(lines) {
      return lines.some((line) =>
        /\bin instantiation of\b|\brequired from\b|\bin file included from\b/i.test(
          stripSgr(line)
        )
      );
    },

    /**
     * The block ends at the first line that is neither a compiler location
     * nor an indented continuation. `make`'s own output is the usual
     * terminator.
     */
    isEnd(lines) {
      const line = stripSgr(lines[lines.length - 1] || '');
      if (/^\s*$/.test(line)) return false;
      if (/^\s/.test(line)) return false;
      return parseLocation(line) === null;
    },

    condense(lines, context) {
      // Opening on a bare error line means ordinary short errors open blocks
      // too. They are filtered here rather than at the opener, because a
      // block cannot be classified until it has finished arriving.
      if (!cxxTemplate.isTemplateFamily(lines)) return null;

      const locations = lines.map(parseLocation).filter(Boolean);
      if (!locations.length) return null;

      const error = locations.find(
        (l) => l.severity === 'error' || l.severity === 'fatal error'
      );
      if (!error) return null;

      const frame = pickUserFrame(locations.map((l) => l.path), context && context.cwd);
      if (!frame) return null;

      const at = locations.find((l) => l.path === frame);
      const position = at.column === null
        ? frame + ':' + at.line
        : frame + ':' + at.line + ':' + at.column;

      return {
        headline: error.severity + ': ' + error.message,
        location: position,
        hiddenCount: lines.length,
      };
    },
  };

  /** Both quoting conventions ld uses, straight and typographic. */
  const SYMBOL = /[`'\u2018"]([^'\u2019"`]+)['\u2019"`]/;

  /**
   * C++ linking.
   *
   * Shorter blocks than template errors, but the symbol is mangled, which is
   * exactly the part a human cannot read. Demangling it is most of the value
   * here; the line count saved is incidental.
   */
  const cxxLinker = {
    id: 'cxx-linker',

    starts: [
      /\bundefined reference to\b/,
      /\bduplicate symbol\b/,
      /\bundefined symbols? for architecture\b/i,
      /^\/?[^\s:]*\bld\b:/,
      /^collect2: error:/,
    ],

    /**
     * Linker output ends at collect2's summary, or at a line that is plainly
     * something else.
     *
     * A line that still speaks the linker's vocabulary is never an end: the
     * `undefined reference` line itself is neither indented nor a parseable
     * location, and closing the block there would drop the collect2 summary
     * and undercount what was hidden.
     */
    isEnd(lines) {
      const line = stripSgr(lines[lines.length - 1] || '');
      if (/^collect2: error:/.test(line)) return true;
      if (/^\s*$/.test(line)) return false;
      if (cxxLinker.starts.some((pattern) => pattern.test(line))) return false;
      return !/^\s/.test(line) && parseLocation(line) === null;
    },

    condense(lines, context) {
      const text = lines.map(stripSgr).join('');

      // Three vocabularies for the same event. GNU ld says "undefined
      // reference to" with the symbol mangled inline; Apple ld heads a block
      // with "Undefined symbols for architecture" and puts the symbol, already
      // demangled, on the following line. Keying only off GNU's phrasing meant
      // every link error on macOS opened a block and then failed to summarise
      // it -- found by running this matcher over a real Apple ld capture.
      const undefinedRef = /\bundefined reference to\s*/.exec(text);
      const appleUndef = /\bundefined symbols? for architecture\b[^\n]*\n/i.exec(text);
      const duplicate = /\bduplicate symbol\s*/.exec(text);
      const anchor = undefinedRef || appleUndef || duplicate;
      if (!anchor) return null;

      const rest = text.slice(anchor.index + anchor[0].length);
      const quoted = SYMBOL.exec(rest);
      if (!quoted) return null;

      const kind = (undefinedRef || appleUndef) ? 'undefined reference to' : 'duplicate symbol';
      const headline = 'link error: ' + kind + ' ' + Demangle.demangle(quoted[1]);

      // "in function" is the linker's own phrasing; failing that, the first
      // object or source file that is not a toolchain path.
      const referenced = /\bin function\s*[`'\u2018"]([^'\u2019"`]+)/.exec(text);
      const paths = text.match(/[\w./\\-]+\.(?:o|obj|cpp|cc|cxx|c)\b/g) || [];
      const frame = pickUserFrame(paths, context && context.cwd);

      let location;
      if (referenced && frame) location = referenced[1] + ' in ' + frame;
      else if (referenced) location = referenced[1];
      else if (frame) location = frame;
      else return null;

      return {
        headline,
        location,
        hiddenCount: lines.length,
      };
    },
  };

  return {
    ALL: [cxxTemplate, cxxLinker],
    cxxTemplate,
    cxxLinker,
    parseLocation,
    isVendorPath,
    pickUserFrame,
    stripSgr,
    demangle: Demangle.demangle,
  };
});
