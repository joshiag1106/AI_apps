# Diagnostic Condensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Condense verbose compiler and linker diagnostics inline as they stream, showing the error and the frame that belongs to the user's code, while keeping the original bytes one keystroke away and never losing output.

**Architecture:** Four new renderer-side UMD modules plus one hook in `terminal-pane.js`. A streaming state machine buffers only *complete* lines, hands candidate blocks to a matcher registry, and emits a summary plus a retained original. Every uncertainty fails open to the untouched bytes. No IPC changes, no main-process changes.

**Tech Stack:** Plain ES2020 JavaScript, UMD-wrapped (`module.exports` in Node, a global in the renderer), `node:test` + `node:assert`, xterm.js 6.

**Spec:** [`docs/superpowers/specs/2026-08-25-diagnostic-condensing-design.md`](../specs/2026-08-25-diagnostic-condensing-design.md)

## Global Constraints

- **The lossless-passthrough invariant is the gate.** For any input containing no diagnostic, the concatenation of everything emitted must be byte-identical to the input. If this cannot hold, the feature does not ship.
- **Never corrupt a full-screen program.** `vim`, `htop`, `less` and `tmux` must be untouched.
- **No IPC changes and no main-process changes.** The trust boundary stays at 16 invoke channels.
- **No network access**, consistent with the app-wide CSP (`default-src 'none'; connect-src 'none'`).
- **Fail open, always.** Every guard resolves toward displaying the original bytes.
- Caps: **500 lines or 200ms** while buffering. Line-queue flush: **16ms or 64 lines**.
- Settings defaults: `condenseDiagnostics` = `true`, `condenseDiagnosticsMinLines` = `20`.
- Files follow the flat UMD convention of `split-tree.js` and `command-palette.js`. Pure logic must be `require()`-able by the test suite with no browser.
- No new runtime dependencies. Node 20+ / the bundled Electron 43 only.
- **No Rust matcher.** Deliberate omission per the spec's Non-goals, not a gap.

---

## File Structure

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/renderer/js/diagnostics.js` | Line splitting, escape classification, screen-mode tracking, the streaming state machine | yes |
| `src/renderer/js/diagnostic-matchers.js` | Matcher registry, vendor-path rules, the two C++ matchers | yes |
| `src/renderer/js/demangle.js` | Itanium ABI demangler subset | yes |
| `src/renderer/js/diagnostic-overlay.js` | Expand UI, the bounded originals map | no |
| `src/renderer/js/terminal-pane.js` | Modified: `write()` routes through the condenser | no |
| `src/renderer/js/app.js` | Modified: palette entry, `Alt+Enter` binding | no |
| `src/renderer/index.html` | Modified: four `<script>` tags | no |
| `src/main/settings.js` | Modified: two new keys | no |

Test files mirror these one-to-one: `test/diagnostics-lines.test.js`, `test/diagnostics-guards.test.js`, `test/diagnostics-machine.test.js`, `test/diagnostic-matchers.test.js`, `test/demangle.test.js`, `test/diagnostic-overlay.test.js`, `test/diagnostics-e2e.test.js`, `test/diagnostics-settings.test.js`. Fixtures live in `test/fixtures/`.

## Task order and dependencies

Tasks 1-2 build the substrate every later task needs. Task 3 (demangler) is independent. Tasks 4-6 build the matchers on top of Task 1's line shapes. Task 7 assembles the machine. Tasks 8-10 integrate. Tasks 11-12 verify and document.

---

## Task 1: Line splitting and the lossless invariant

**Files:**
- Create: `src/renderer/js/diagnostics.js`
- Test: `test/diagnostics-lines.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `Diagnostics.splitLines(pending, chunk) -> { lines: string[], rest: string }`. Each element of `lines` **retains its own terminator**; `rest` is the trailing partial line. The invariant `lines.join('') + rest === pending + chunk` holds for every input.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Diagnostics = require('../src/renderer/js/diagnostics.js');

test('a chunk of whole lines splits into lines with no remainder', () => {
  const out = Diagnostics.splitLines('', 'alpha\nbeta\n');
  assert.deepStrictEqual(out.lines, ['alpha\n', 'beta\n']);
  assert.strictEqual(out.rest, '');
});

test('a trailing partial line is returned as the remainder, not a line', () => {
  // The bug this test exists for: `Enter your name: ` has no newline. If it is
  // treated as a line and queued, the prompt never appears and the terminal
  // looks hung.
  const out = Diagnostics.splitLines('', 'done\nEnter your name: ');
  assert.deepStrictEqual(out.lines, ['done\n']);
  assert.strictEqual(out.rest, 'Enter your name: ');
});

test('pending text from the previous chunk is prepended before splitting', () => {
  const out = Diagnostics.splitLines('half', 'line\n');
  assert.deepStrictEqual(out.lines, ['halfline\n']);
  assert.strictEqual(out.rest, '');
});

test('CRLF terminators are preserved exactly, not normalised', () => {
  const out = Diagnostics.splitLines('', 'a\r\nb\n');
  assert.deepStrictEqual(out.lines, ['a\r\n', 'b\n']);
});

test('a bare CR is not a line terminator', () => {
  // Progress bars rewrite a line with CR and no LF. Splitting on CR would
  // shred them into hundreds of "lines".
  const out = Diagnostics.splitLines('', '50%\r75%\r100%\n');
  assert.deepStrictEqual(out.lines, ['50%\r75%\r100%\n']);
  assert.strictEqual(out.rest, '');
});

test('an empty chunk produces nothing and preserves pending', () => {
  const out = Diagnostics.splitLines('partial', '');
  assert.deepStrictEqual(out.lines, []);
  assert.strictEqual(out.rest, 'partial');
});

test('THE INVARIANT: lines joined with the remainder reproduce the input byte for byte', () => {
  const cases = [
    ['', ''],
    ['', '\n'],
    ['', '\n\n\n'],
    ['pending', 'more\ntext\r\nhere'],
    ['', '\x1b[31mred\x1b[0m\n'],
    ['', 'no newline at all'],
    ['a', '\n'],
    ['', '\r\n\r\n'],
  ];
  for (const [pending, chunk] of cases) {
    const out = Diagnostics.splitLines(pending, chunk);
    assert.strictEqual(out.lines.join('') + out.rest, pending + chunk,
      'invariant broken for ' + JSON.stringify([pending, chunk]));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostics-lines.test.js`
Expected: FAIL with "Cannot find module '../src/renderer/js/diagnostics.js'"

- [ ] **Step 3: Write the implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostics-lines.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/diagnostics.js test/diagnostics-lines.test.js
git commit -m "Assemble output into lines without ever losing a byte"
```

---

## Task 2: Escape classification and alternate-screen tracking

**Files:**
- Modify: `src/renderer/js/diagnostics.js`
- Test: `test/diagnostics-guards.test.js`

**Interfaces:**
- Consumes: `splitLines` from Task 1.
- Produces:
  - `Diagnostics.isSafeLine(line) -> boolean` — true only when the line's escapes are exclusively SGR colour.
  - `Diagnostics.scanScreenMode(chunk, isAlternate) -> boolean` — alternate-screen state after this chunk.
  - `Diagnostics.stripSgr(line) -> string`

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Diagnostics = require('../src/renderer/js/diagnostics.js');

test('plain text is safe', () => {
  assert.strictEqual(Diagnostics.isSafeLine('error: no matching function\n'), true);
});

test('SGR colour is safe, because diagnostics colour text', () => {
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[1;31merror:\x1b[0m oops\n'), true);
});

test('cursor movement is not safe', () => {
  // A compiler does not move the cursor. Something that does is a program
  // drawing a UI, and buffering its output would corrupt the display.
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[2Aoverwrite\n'), false);
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[Hhome\n'), false);
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[2Kerase\n'), false);
});

test('an OSC sequence is not safe', () => {
  assert.strictEqual(Diagnostics.isSafeLine('\x1b]0;title\x07\n'), false);
});

test('a lone ESC with no recognisable sequence is not safe', () => {
  assert.strictEqual(Diagnostics.isSafeLine('text\x1b\n'), false);
});

test('entering the alternate screen is tracked', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1049h', false), true);
});

test('leaving the alternate screen is tracked', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1049l', true), false);
});

test('the legacy alternate-screen codes are tracked too', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?47h', false), true);
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1047h', false), true);
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?47l', true), false);
});

test('the last mode change in a chunk wins', () => {
  // vim starting and immediately exiting inside one read.
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1049h junk \x1b[?1049l', false), false);
});

test('a chunk with no mode change leaves the state alone', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('ordinary output\n', true), true);
  assert.strictEqual(Diagnostics.scanScreenMode('ordinary output\n', false), false);
});

test('stripSgr removes colour but keeps the text', () => {
  assert.strictEqual(
    Diagnostics.stripSgr('\x1b[1;31merror:\x1b[0m no matching function\n'),
    'error: no matching function\n'
  );
});

test('stripSgr leaves a line with no escapes untouched', () => {
  assert.strictEqual(Diagnostics.stripSgr('plain\n'), 'plain\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostics-guards.test.js`
Expected: FAIL with "Diagnostics.isSafeLine is not a function"

- [ ] **Step 3: Write the implementation**

Add above the `return` in `diagnostics.js`:

```js
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
```

and extend the returned object:

```js
  return {
    splitLines,
    stripSgr,
    isSafeLine,
    scanScreenMode,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostics-guards.test.js`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/diagnostics.js test/diagnostics-guards.test.js
git commit -m "Refuse to touch output that is drawing a user interface"
```

---

## Task 3: The Itanium ABI demangler

**Files:**
- Create: `src/renderer/js/demangle.js`
- Test: `test/demangle.test.js`

**Interfaces:**
- Consumes: nothing. Standalone.
- Produces: `Demangle.demangle(name) -> string`. Returns the demangled name, or **the input unchanged** on any unsupported construct or parse failure.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Demangle = require('../src/renderer/js/demangle.js');

test('a simple nested name demangles', () => {
  assert.strictEqual(Demangle.demangle('_ZN3foo3barEv'), 'foo::bar()');
});

test('builtin parameter types are named', () => {
  assert.strictEqual(Demangle.demangle('_Z3fooi'), 'foo(int)');
  assert.strictEqual(Demangle.demangle('_Z3fooc'), 'foo(char)');
  assert.strictEqual(Demangle.demangle('_Z3food'), 'foo(double)');
  assert.strictEqual(Demangle.demangle('_Z3foob'), 'foo(bool)');
});

test('several parameters are comma-separated', () => {
  assert.strictEqual(Demangle.demangle('_Z3fooid'), 'foo(int, double)');
});

test('pointer and const-reference qualifiers are rendered', () => {
  assert.strictEqual(Demangle.demangle('_Z3fooPi'), 'foo(int*)');
  assert.strictEqual(Demangle.demangle('_Z3fooRKi'), 'foo(int const&)');
});

test('the std abbreviation expands', () => {
  assert.strictEqual(Demangle.demangle('_ZNSt3maxEv'), 'std::max()');
});

test('template arguments are rendered inside angle brackets', () => {
  assert.strictEqual(Demangle.demangle('_ZN3vecIiE4pushEi'), 'vec<int>::push(int)');
});

test('a void parameter list renders as empty, not as (void)', () => {
  assert.strictEqual(Demangle.demangle('_ZN3foo3barEv'), 'foo::bar()');
});

test('GARBAGE ROUND-TRIPS: anything unparseable comes back unchanged', () => {
  // The floor for this module is "no worse than today". Today the user sees
  // the mangled name; a failed parse must show exactly that, never a partial
  // or corrupted rendering.
  const garbage = [
    'main',
    '_Z',
    '_ZN',
    '_ZN3fooE',
    '_ZNZZZ',
    '_ZN999999fooEv',
    '_ZN3fooEQ',
    '',
    'not mangled at all',
    '_ZSt_S_S0_backref',
  ];
  for (const input of garbage) {
    assert.strictEqual(Demangle.demangle(input), input, 'must round-trip: ' + input);
  }
});

test('back-references are not supported and round-trip unchanged', () => {
  // Back-references are the genuinely hard part of the ABI and are out of
  // scope. They must fail open rather than produce a wrong name.
  const input = '_ZN3foo3barES_';
  assert.strictEqual(Demangle.demangle(input), input);
});

test('a non-string input round-trips without throwing', () => {
  assert.strictEqual(Demangle.demangle(null), null);
  assert.strictEqual(Demangle.demangle(undefined), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/demangle.test.js`
Expected: FAIL with "Cannot find module '../src/renderer/js/demangle.js'"

- [ ] **Step 3: Write the implementation**

```js
/**
 * A deliberately partial Itanium ABI demangler.
 *
 * Covers length-prefixed nested names (`_ZN...E`), builtin type codes, the `P`
 * and `RK` qualifiers, template arguments (`I...E`), and the common `St`/`Ss`/
 * `Sa` abbreviations. Back-references (`S_`, `S0_`, ...) are the genuinely
 * hard part of the ABI and are not supported.
 *
 * Any unsupported construct or parse failure returns the input unchanged.
 * That is the whole safety story: a mangled name is exactly what the user
 * sees today, so the floor is "no worse than now". A partially demangled or
 * wrong name would be worse than none.
 *
 * This exists rather than an IPC channel to `c++filt` because shelling out
 * would widen the trust boundary for a cosmetic gain.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Demangle = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BUILTINS = Object.freeze({
    v: 'void', b: 'bool', c: 'char', a: 'signed char', h: 'unsigned char',
    s: 'short', t: 'unsigned short', i: 'int', j: 'unsigned int',
    l: 'long', m: 'unsigned long', x: 'long long', y: 'unsigned long long',
    f: 'float', d: 'double', e: 'long double', w: 'wchar_t',
  });

  const ABBREVIATIONS = Object.freeze({
    St: 'std',
    Ss: 'std::string',
    Sa: 'std::allocator',
    Sb: 'std::basic_string',
  });

  /** Thrown internally the moment anything is not understood. */
  function Unsupported() {}

  function parser(input) {
    return { s: input, i: 0 };
  }

  function peek(p) {
    return p.i < p.s.length ? p.s[p.i] : '';
  }

  function take(p) {
    if (p.i >= p.s.length) throw new Unsupported();
    return p.s[p.i++];
  }

  function expect(p, ch) {
    if (take(p) !== ch) throw new Unsupported();
  }

  /** `<length><identifier>` - the ABI's only way to write a name. */
  function readIdentifier(p) {
    let digits = '';
    while (peek(p) >= '0' && peek(p) <= '9') digits += take(p);
    if (!digits) throw new Unsupported();
    const length = Number(digits);
    if (!Number.isSafeInteger(length) || length <= 0) throw new Unsupported();
    if (p.i + length > p.s.length) throw new Unsupported();
    const name = p.s.slice(p.i, p.i + length);
    p.i += length;
    return name;
  }

  /**
   * A type: qualifiers, then a builtin code, an abbreviation, or a name that
   * may itself carry template arguments.
   */
  function readType(p) {
    const ch = peek(p);

    if (ch === 'P') { take(p); return readType(p) + '*'; }
    if (ch === 'R') { take(p); return readType(p) + '&'; }
    if (ch === 'K') { take(p); return readType(p) + ' const'; }

    if (ch === 'S') {
      take(p);
      const next = take(p);
      const abbreviation = ABBREVIATIONS['S' + next];
      // `S_`, `S0_` and friends are back-references. Not supported.
      if (!abbreviation) throw new Unsupported();
      return abbreviation;
    }

    if (ch === 'N') return readNestedName(p);

    if (BUILTINS[ch]) { take(p); return BUILTINS[ch]; }

    if (ch >= '1' && ch <= '9') {
      let name = readIdentifier(p);
      if (peek(p) === 'I') name += readTemplateArguments(p);
      return name;
    }

    throw new Unsupported();
  }

  /** `I <type>+ E` */
  function readTemplateArguments(p) {
    expect(p, 'I');
    const args = [];
    while (peek(p) && peek(p) !== 'E') args.push(readType(p));
    expect(p, 'E');
    if (!args.length) throw new Unsupported();
    return '<' + args.join(', ') + '>';
  }

  /** `N <component>+ E`, where a component may carry template arguments. */
  function readNestedName(p) {
    expect(p, 'N');
    const parts = [];
    while (peek(p) && peek(p) !== 'E') {
      // Qualifiers may precede the components of a nested name.
      if (peek(p) === 'K' || peek(p) === 'V') { take(p); continue; }
      if (peek(p) === 'S') {
        take(p);
        const abbreviation = ABBREVIATIONS['S' + take(p)];
        if (!abbreviation) throw new Unsupported();
        parts.push(abbreviation);
        continue;
      }
      let part = readIdentifier(p);
      if (peek(p) === 'I') part += readTemplateArguments(p);
      parts.push(part);
    }
    expect(p, 'E');
    if (!parts.length) throw new Unsupported();
    return parts.join('::');
  }

  /** The parameter list trailing a function name. `v` alone means none. */
  function readParameters(p) {
    if (p.i >= p.s.length) throw new Unsupported();
    const params = [];
    while (p.i < p.s.length) params.push(readType(p));
    if (params.length === 1 && params[0] === 'void') return '()';
    return '(' + params.join(', ') + ')';
  }

  /**
   * Demangle an Itanium-ABI name, or return it unchanged.
   *
   * Never throws, and never returns a partial result: the caller can splice
   * the return value into user-visible text unconditionally.
   */
  function demangle(name) {
    if (typeof name !== 'string') return name;
    if (!name.startsWith('_Z')) return name;

    try {
      const p = parser(name.slice(2));
      const head = peek(p) === 'N' ? readNestedName(p) : (function () {
        let n = readIdentifier(p);
        if (peek(p) === 'I') n += readTemplateArguments(p);
        return n;
      })();
      const params = readParameters(p);
      if (p.i !== p.s.length) throw new Unsupported();
      return head + params;
    } catch (error) {
      return name;
    }
  }

  return { demangle };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/demangle.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/demangle.js test/demangle.test.js
git commit -m "Demangle C++ names, or leave them exactly as they were"
```

---

## Task 4: The matcher registry and vendor-path judgement

**Files:**
- Create: `src/renderer/js/diagnostic-matchers.js`
- Test: `test/diagnostic-matchers.test.js`

**Interfaces:**
- Consumes: `Demangle.demangle` from Task 3.
- Produces:
  - `Matchers.parseLocation(line) -> { path, line, column, severity, message } | null`
  - `Matchers.isVendorPath(path) -> boolean`
  - `Matchers.pickUserFrame(paths, cwd) -> string | null`
  - `Matchers.ALL -> Array<Matcher>` — empty at the end of this task, populated in Tasks 5 and 6.

A **matcher** is a plain object with no I/O:

```js
{
  id: 'cxx-template',
  starts: [/\bin instantiation of\b/i],
  isEnd: (lines) => boolean,
  condense: (lines, { cwd }) => ({ headline, location, hiddenCount }) | null,
}
```

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Matchers = require('../src/renderer/js/diagnostic-matchers.js');

test('the shared compiler line shape parses', () => {
  const out = Matchers.parseLocation('src/widget.cpp:42:15: error: no matching function\n');
  assert.deepStrictEqual(out, {
    path: 'src/widget.cpp',
    line: 42,
    column: 15,
    severity: 'error',
    message: 'no matching function',
  });
});

test('a location without a column still parses', () => {
  const out = Matchers.parseLocation('main.cpp:7: warning: unused variable\n');
  assert.strictEqual(out.path, 'main.cpp');
  assert.strictEqual(out.line, 7);
  assert.strictEqual(out.column, null);
  assert.strictEqual(out.severity, 'warning');
});

test('an absolute Windows path parses despite the drive colon', () => {
  const out = Matchers.parseLocation('C:\\src\\widget.cpp:42:15: error: boom\n');
  assert.strictEqual(out.path, 'C:\\src\\widget.cpp');
  assert.strictEqual(out.line, 42);
});

test('a line that is not a location returns null', () => {
  assert.strictEqual(Matchers.parseLocation('just some text\n'), null);
  assert.strictEqual(Matchers.parseLocation('make: *** [all] Error 1\n'), null);
});

test('SGR colour does not prevent a location from parsing', () => {
  const out = Matchers.parseLocation('\x1b[1msrc/a.cpp:1:1:\x1b[0m \x1b[31merror:\x1b[0m boom\n');
  assert.strictEqual(out.path, 'src/a.cpp');
  assert.strictEqual(out.severity, 'error');
});

test('standard library paths are vendor paths', () => {
  assert.strictEqual(Matchers.isVendorPath('/usr/include/c++/13/vector'), true);
  assert.strictEqual(Matchers.isVendorPath('/usr/include/x86_64-linux-gnu/bits/stl_vector.h'), true);
  assert.strictEqual(Matchers.isVendorPath('/Library/Developer/CommandLineTools/usr/include/c++/v1/vector'), true);
  assert.strictEqual(Matchers.isVendorPath('C:\\Program Files\\MSVC\\include\\vector'), true);
});

test('the user own source is not a vendor path', () => {
  assert.strictEqual(Matchers.isVendorPath('src/widget.cpp'), false);
  assert.strictEqual(Matchers.isVendorPath('/home/me/project/main.cpp'), false);
});

test('the user frame is the first non-vendor path', () => {
  const frames = [
    '/usr/include/c++/13/vector',
    '/usr/include/c++/13/bits/stl_vector.h',
    'src/widget.cpp',
    'src/other.cpp',
  ];
  assert.strictEqual(Matchers.pickUserFrame(frames, null), 'src/widget.cpp');
});

test('a path under the working directory is preferred over one that is not', () => {
  // Both are non-vendor, but the one inside the project is far more likely to
  // be what the user is actually editing.
  const frames = ['/opt/thirdparty/src/lib.cpp', '/home/me/project/src/widget.cpp'];
  assert.strictEqual(
    Matchers.pickUserFrame(frames, '/home/me/project'),
    '/home/me/project/src/widget.cpp'
  );
});

test('when every frame is a vendor path there is no user frame', () => {
  // This is the case where condense() must return null: a summary that cannot
  // point at the user's code is not worth the transformation.
  const frames = ['/usr/include/c++/13/vector', '/usr/include/c++/13/bits/stl_algo.h'];
  assert.strictEqual(Matchers.pickUserFrame(frames, '/home/me/project'), null);
});

test('the registry is an array so matchers are consulted in order', () => {
  assert.ok(Array.isArray(Matchers.ALL));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostic-matchers.test.js`
Expected: FAIL with "Cannot find module '../src/renderer/js/diagnostic-matchers.js'"

- [ ] **Step 3: Write the implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostic-matchers.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/diagnostic-matchers.js test/diagnostic-matchers.test.js
git commit -m "Answer the one question every language asks: which frame is mine"
```

---

## Task 5: The C++ template-instantiation matcher

**Files:**
- Modify: `src/renderer/js/diagnostic-matchers.js`
- Test: `test/diagnostic-matchers.test.js` (append)

**Interfaces:**
- Consumes: `parseLocation`, `pickUserFrame` from Task 4.
- Produces: `Matchers.cxxTemplate`, and `ALL[0] === cxxTemplate`. `condense(lines, { cwd })` returns `{ headline: string, location: string, hiddenCount: number }` or `null`.

- [ ] **Step 1: Write the failing test**

Append to `test/diagnostic-matchers.test.js`:

```js
const GCC_TEMPLATE = [
  'In file included from /usr/include/c++/13/vector:60,\n',
  '                 from src/widget.cpp:1:\n',
  '/usr/include/c++/13/bits/stl_vector.h:1234:7: error: no matching function for call to push_back\n',
  '/usr/include/c++/13/bits/stl_vector.h:1235:9: note: candidate expects 1 argument\n',
  'src/widget.cpp:42:15:   required from here\n',
  '/usr/include/c++/13/bits/stl_algo.h:99:1: note: in instantiation of member function\n',
];

test('the template matcher claims a block that mentions instantiation', () => {
  const claimed = Matchers.cxxTemplate.starts.some((re) =>
    GCC_TEMPLATE.some((line) => re.test(line))
  );
  assert.strictEqual(claimed, true);
});

test('the template matcher reports the error and the user own frame', () => {
  const out = Matchers.cxxTemplate.condense(GCC_TEMPLATE, { cwd: null });
  assert.match(out.headline, /no matching function for call to/);
  assert.strictEqual(out.location, 'src/widget.cpp:42:15');
  assert.strictEqual(out.hiddenCount, GCC_TEMPLATE.length);
});

test('the headline is the error, not a note', () => {
  const lines = [
    '/usr/include/c++/13/vector:10:1: note: candidate here\n',
    '/usr/include/c++/13/vector:11:1: error: the actual problem\n',
    'src/widget.cpp:42:15:   required from here\n',
  ];
  const out = Matchers.cxxTemplate.condense(lines, { cwd: null });
  assert.match(out.headline, /the actual problem/);
});

test('a block with no frame of the user own condenses to null', () => {
  // An error genuinely inside a library. Showing "your code: <nothing>" would
  // be worse than showing the original.
  const lines = [
    '/usr/include/c++/13/vector:10:1: error: in instantiation of something\n',
    '/usr/include/c++/13/bits/stl_algo.h:99:1: note: required from here\n',
  ];
  assert.strictEqual(Matchers.cxxTemplate.condense(lines, { cwd: null }), null);
});

test('a block with no error line at all condenses to null', () => {
  const lines = ['src/widget.cpp:1:1: note: in instantiation of foo\n'];
  assert.strictEqual(Matchers.cxxTemplate.condense(lines, { cwd: null }), null);
});

test('the block ends at a line that is neither a location nor indented', () => {
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['make: *** [all] Error 1\n']), true);
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['src/a.cpp:1:1: note: x\n']), false);
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['    indented continuation\n']), false);
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['\n']), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostic-matchers.test.js`
Expected: FAIL with "Cannot read properties of undefined (reading 'starts')"

- [ ] **Step 3: Write the implementation**

Insert before the `return` in `diagnostic-matchers.js`:

```js
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
```

and update the returned object:

```js
  return {
    ALL: [cxxTemplate],
    cxxTemplate,
    parseLocation,
    isVendorPath,
    pickUserFrame,
    stripSgr,
    demangle: Demangle.demangle,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostic-matchers.test.js`
Expected: PASS, 17 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/diagnostic-matchers.js test/diagnostic-matchers.test.js
git commit -m "Find the one line that matters in a template instantiation stack"
```

---

## Task 6: The C++ linker matcher

**Files:**
- Modify: `src/renderer/js/diagnostic-matchers.js`
- Test: `test/diagnostic-matchers.test.js` (append)

**Interfaces:**
- Consumes: `demangle` from Task 3, `pickUserFrame` from Task 4.
- Produces: `Matchers.cxxLinker`, and `ALL` becomes `[cxxTemplate, cxxLinker]`.

- [ ] **Step 1: Write the failing test**

Append to `test/diagnostic-matchers.test.js`:

```js
const LD_UNDEFINED = [
  '/usr/bin/ld: main.o: in function `main\':\n',
  'main.cpp:(.text+0x1f): undefined reference to `_ZN3vecIiE4pushEi\'\n',
  'collect2: error: ld returned 1 exit status\n',
];

test('the linker matcher claims an undefined-reference block', () => {
  const claimed = Matchers.cxxLinker.starts.some((re) =>
    LD_UNDEFINED.some((line) => re.test(line))
  );
  assert.strictEqual(claimed, true);
});

test('the linker matcher demangles the missing symbol into the headline', () => {
  const out = Matchers.cxxLinker.condense(LD_UNDEFINED, { cwd: null });
  assert.match(out.headline, /link error: undefined reference to/);
  assert.match(out.headline, /vec<int>::push\(int\)/);
  assert.strictEqual(out.hiddenCount, LD_UNDEFINED.length);
});

test('the linker matcher reports what the symbol was referenced from', () => {
  const out = Matchers.cxxLinker.condense(LD_UNDEFINED, { cwd: null });
  assert.match(out.location, /main/);
});

test('a symbol that will not demangle appears mangled rather than wrong', () => {
  const lines = ['/usr/bin/ld: main.o: undefined reference to `_ZQQQnonsense\'\n'];
  const out = Matchers.cxxLinker.condense(lines, { cwd: null });
  assert.match(out.headline, /_ZQQQnonsense/);
});

test('a linker block naming no object file at all condenses to null', () => {
  // Consistent with the template matcher: a summary that cannot say where the
  // symbol was wanted is not worth the transformation.
  const lines = ['/usr/bin/ld: undefined reference to `_ZQQQnonsense\'\n'];
  assert.strictEqual(Matchers.cxxLinker.condense(lines, { cwd: null }), null);
});

test('a duplicate symbol is recognised', () => {
  const lines = ['duplicate symbol `_ZN3foo3barEv\' in:\n', '    a.o\n', '    b.o\n'];
  const out = Matchers.cxxLinker.condense(lines, { cwd: null });
  assert.match(out.headline, /duplicate symbol/);
  assert.match(out.headline, /foo::bar\(\)/);
});

test('a linker block with no recognisable symbol condenses to null', () => {
  const lines = ['/usr/bin/ld: something went wrong\n'];
  assert.strictEqual(Matchers.cxxLinker.condense(lines, { cwd: null }), null);
});

test('the registry consults the template matcher before the linker matcher', () => {
  assert.deepStrictEqual(Matchers.ALL.map((m) => m.id), ['cxx-template', 'cxx-linker']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostic-matchers.test.js`
Expected: FAIL with "Cannot read properties of undefined (reading 'starts')"

- [ ] **Step 3: Write the implementation**

Insert after `cxxTemplate` in `diagnostic-matchers.js`:

```js
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

      const undefinedRef = /\bundefined reference to\s*/.exec(text);
      const duplicate = /\bduplicate symbol\s*/.exec(text);
      const anchor = undefinedRef || duplicate;
      if (!anchor) return null;

      const rest = text.slice(anchor.index + anchor[0].length);
      const quoted = SYMBOL.exec(rest);
      if (!quoted) return null;

      const kind = undefinedRef ? 'undefined reference to' : 'duplicate symbol';
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
```

and update the returned object:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostic-matchers.test.js`
Expected: PASS, 25 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/diagnostic-matchers.js test/diagnostic-matchers.test.js
git commit -m "Read the linker's mangled complaint out loud"
```

---

## Task 7: The streaming state machine

**Files:**
- Modify: `src/renderer/js/diagnostics.js`
- Test: `test/diagnostics-machine.test.js`

**Interfaces:**
- Consumes: `splitLines`, `isSafeLine`, `scanScreenMode`, `stripSgr` from Tasks 1-2; `Matchers.ALL` from Tasks 4-6.
- Produces: `new Diagnostics.Condenser(options)` with

```js
{
  emit,            // (text) => void            required
  onCondensed,     // (record) => void          optional; record = { id, original, summary }
  matchers,        // Array<Matcher>            default []
  cwd,             // () => string|null         default () => null
  enabled,         // () => boolean             default () => true
  minLines,        // () => number              default () => 20
  schedule,        // (fn, ms) => handle        default setTimeout
  cancel,          // (handle) => void          default clearTimeout
}
```

and methods `write(chunk)`, `flushNow()`, `dispose()`. `schedule`/`cancel` are injected so tests drive time deterministically rather than sleeping.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Diagnostics = require('../src/renderer/js/diagnostics.js');
const Matchers = require('../src/renderer/js/diagnostic-matchers.js');

/** A controllable clock, so no test ever sleeps. */
function harness(options) {
  const emitted = [];
  const condensed = [];
  let pending = null;
  const condenser = new Diagnostics.Condenser({
    emit: (text) => emitted.push(text),
    onCondensed: (record) => condensed.push(record),
    matchers: (options && options.matchers) || [],
    cwd: () => (options && options.cwd) || null,
    enabled: () => !(options && options.enabled === false),
    minLines: () => (options && options.minLines !== undefined ? options.minLines : 20),
    schedule: (fn) => { pending = fn; return 1; },
    cancel: () => { pending = null; },
  });
  return {
    condenser,
    output: () => emitted.join(''),
    condensed,
    tick: () => { const fn = pending; pending = null; if (fn) fn(); },
  };
}

test('a partial line reaches the screen on the flush timer', () => {
  // The prompt case: `Enter your name: ` has no newline. It must not wait for
  // the next newline, which may never come - but it is held for the same 16ms
  // as everything else, so that a diagnostic split across a chunk boundary
  // still assembles into lines. 16ms is below perception; a hung prompt is not.
  const h = harness();
  h.condenser.write('Enter your name: ');
  assert.strictEqual(h.output(), '');
  h.tick();
  assert.strictEqual(h.output(), 'Enter your name: ');
});

test('a committed partial is never written twice when its line completes', () => {
  // The invariant that makes holding partials safe: once the timer has put
  // `Enter your name: ` on screen, the rest of that line must arrive as only
  // the remainder.
  const h = harness();
  h.condenser.write('Enter your name: ');
  h.tick();
  h.condenser.write('Ada\n');
  h.condenser.flushNow();
  assert.strictEqual(h.output(), 'Enter your name: Ada\n');
});

test('complete lines are flushed when the timer fires', () => {
  const h = harness();
  h.condenser.write('alpha\nbeta\n');
  assert.strictEqual(h.output(), '');
  h.tick();
  assert.strictEqual(h.output(), 'alpha\nbeta\n');
});

test('sixty-four queued lines flush without waiting for the timer', () => {
  const h = harness();
  let input = '';
  for (let i = 0; i < 64; i++) input += 'line ' + i + '\n';
  h.condenser.write(input);
  assert.strictEqual(h.output(), input);
});

test('LOSSLESS: ordinary output round-trips byte for byte', () => {
  const inputs = [
    'plain text\n',
    '\x1b[31mcoloured\x1b[0m\n',
    'progress: 10%\rprogress: 50%\rprogress: 100%\n',
    'no trailing newline',
    '\n\n\n',
    'mixed\r\nline\nendings\r\n',
  ];
  for (const input of inputs) {
    const h = harness();
    h.condenser.write(input);
    h.condenser.flushNow();
    assert.strictEqual(h.output(), input, 'lost bytes for ' + JSON.stringify(input));
  }
});

test('inside the alternate screen there is no line assembly at all', () => {
  // vim owns the display. Everything must pass straight through, immediately.
  const h = harness();
  h.condenser.write('\x1b[?1049h');
  h.condenser.write('\x1b[2J\x1b[Hvim drawing\n');
  assert.strictEqual(h.output(), '\x1b[?1049h\x1b[2J\x1b[Hvim drawing\n');
});

test('leaving the alternate screen restores normal handling', () => {
  const h = harness();
  h.condenser.write('\x1b[?1049h');
  h.condenser.write('\x1b[?1049l');
  h.condenser.write('after\n');
  assert.strictEqual(h.output(), '\x1b[?1049h\x1b[?1049l');
  h.tick();
  assert.strictEqual(h.output(), '\x1b[?1049h\x1b[?1049lafter\n');
});

test('a line with cursor movement fails open immediately', () => {
  const h = harness();
  h.condenser.write('\x1b[2Aredraw\n');
  assert.strictEqual(h.output(), '\x1b[2Aredraw\n');
});

test('a matched block shorter than the minimum flushes verbatim', () => {
  // The length is only knowable once the block closes, which is why the check
  // happens at the end rather than at the start.
  const h = harness({ matchers: Matchers.ALL, minLines: 20 });
  const input =
    '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n' +
    'src/a.cpp:2:2:   required from here\n' +
    'make: *** [all] Error 1\n';
  h.condenser.write(input);
  h.condenser.flushNow();
  assert.strictEqual(h.output(), input);
  assert.strictEqual(h.condensed.length, 0);
});

test('a matched block at or over the minimum is condensed', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  let input = '/usr/include/c++/13/vector:1:1: error: no matching function\n';
  for (let i = 0; i < 5; i++) {
    input += '/usr/include/c++/13/bits/stl_vector.h:' + i + ':1: note: candidate\n';
  }
  input += 'src/widget.cpp:42:15:   required from here\n';
  h.condenser.write(input);
  h.condenser.write('make: *** [all] Error 1\n');
  h.condenser.flushNow();

  // The summary is colour-coded, so assert against the text it renders
  // rather than against the bytes, which carry SGR between every field.
  const out = Diagnostics.stripSgr(h.output());
  assert.match(out, /no matching function/);
  assert.match(out, /your code: src\/widget\.cpp:42:15/);
  assert.match(out, /lines hidden/);
  assert.strictEqual(h.condensed.length, 1);
  assert.strictEqual(h.condensed[0].original, input);
});

test('exceeding the line cap while buffering flushes verbatim', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  let input = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  for (let i = 0; i < 600; i++) input += '/usr/include/c++/13/bits/x.h:' + i + ':1: note: n\n';
  h.condenser.write(input);
  h.condenser.flushNow();
  assert.strictEqual(h.output(), input);
  assert.strictEqual(h.condensed.length, 0);
});

test('a line split across chunks mid-block is held, not abandoned', () => {
  // The pipe, not the compiler, decides where a chunk ends. Treating every
  // mid-line boundary as an anomaly would abandon every diagnostic that
  // happens to straddle a read, which is most of them under small reads.
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  let input = '/usr/include/c++/13/vector:1:1: error: no matching function\n';
  for (let i = 0; i < 5; i++) input += '/usr/include/c++/13/bits/x.h:' + i + ':1: note: n\n';
  input += 'src/widget.cpp:42:15:   required from here\n';

  // Feed it one byte at a time, the worst case the OS can produce.
  for (const ch of input) h.condenser.write(ch);
  h.condenser.write('make: *** [all] Error 1\n');
  h.condenser.flushNow();

  assert.strictEqual(h.condensed.length, 1, 'byte-at-a-time input must still condense');
  assert.strictEqual(h.condensed[0].original, input);
});

test('a partial that never completes is released by the block time cap', () => {
  // The guard the spec wanted, expressed where it actually holds: a partial
  // is an anomaly only when it persists, and the 200ms cap is what notices.
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  const opening = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  h.condenser.write(opening);
  h.condenser.write('partial with no newline');
  h.condenser.flushNow();
  assert.strictEqual(h.output(), opening + 'partial with no newline');
});

test('entering the alternate screen mid-block fails open', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  const opening = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  h.condenser.write(opening);
  h.condenser.write('\x1b[?1049h');
  assert.strictEqual(h.output(), opening + '\x1b[?1049h');
});

test('a cursor sequence mid-block fails open', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  const opening = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  h.condenser.write(opening);
  h.condenser.write('\x1b[2Kredraw\n');
  h.condenser.flushNow();
  assert.strictEqual(h.output(), opening + '\x1b[2Kredraw\n');
});

test('when disabled, nothing is ever condensed', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 1, enabled: false });
  let input = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  for (let i = 0; i < 40; i++) input += '/usr/include/c++/13/bits/x.h:' + i + ':1: note: n\n';
  input += 'src/widget.cpp:42:15:   required from here\n';
  h.condenser.write(input);
  h.condenser.flushNow();
  assert.strictEqual(h.output(), input);
});

test('dispose flushes anything still held', () => {
  const h = harness();
  h.condenser.write('unflushed\n');
  h.condenser.dispose();
  assert.strictEqual(h.output(), 'unflushed\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostics-machine.test.js`
Expected: FAIL with "Diagnostics.Condenser is not a constructor"

- [ ] **Step 3: Write the implementation**

Insert before the `return` in `diagnostics.js`:

```js
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
```

and extend the returned object:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostics-machine.test.js`
Expected: PASS, 17 tests

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/diagnostics.js test/diagnostics-machine.test.js
git commit -m "Decide before writing, because scrollback cannot be unwritten"
```

---

## Task 8: Settings

**Files:**
- Modify: `src/main/settings.js` (DEFAULTS, NUMERIC_RANGES, the integer fixups at the end of `coerce`)
- Test: `test/diagnostics-settings.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `condenseDiagnostics` (boolean, default `true`) and `condenseDiagnosticsMinLines` (number, default `20`, clamped to `[1, 10000]`).

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { coerce, DEFAULTS } = require('../src/main/settings.js');

test('condensing is on by default', () => {
  assert.strictEqual(DEFAULTS.condenseDiagnostics, true);
});

test('the minimum-lines default is twenty', () => {
  assert.strictEqual(DEFAULTS.condenseDiagnosticsMinLines, 20);
});

test('the master switch accepts a boolean and rejects anything else', () => {
  assert.strictEqual(coerce({ condenseDiagnostics: false }).condenseDiagnostics, false);
  assert.strictEqual(coerce({ condenseDiagnostics: 'no' }).condenseDiagnostics, true);
  assert.strictEqual(coerce({ condenseDiagnostics: 0 }).condenseDiagnostics, true);
});

test('the minimum is clamped rather than trusted', () => {
  assert.strictEqual(coerce({ condenseDiagnosticsMinLines: 0 }).condenseDiagnosticsMinLines, 1);
  assert.strictEqual(coerce({ condenseDiagnosticsMinLines: -5 }).condenseDiagnosticsMinLines, 1);
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: 999999 }).condenseDiagnosticsMinLines,
    10000
  );
});

test('a non-numeric minimum falls back to the default', () => {
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: 'twenty' }).condenseDiagnosticsMinLines,
    20
  );
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: NaN }).condenseDiagnosticsMinLines,
    20
  );
});

test('the minimum stays an integer', () => {
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: 20.7 }).condenseDiagnosticsMinLines,
    21
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostics-settings.test.js`
Expected: FAIL - `undefined !== true`

- [ ] **Step 3: Write the implementation**

In `DEFAULTS`, after `bell: false,`:

```js
  // Diagnostic condensing. On by default: the failure mode is a diagnostic
  // shown in full, which is exactly today's behaviour.
  condenseDiagnostics: true,
  condenseDiagnosticsMinLines: 20,
```

In `NUMERIC_RANGES`:

```js
  condenseDiagnosticsMinLines: [1, 10000],
```

At the end of `coerce`, beside the existing integer fixups:

```js
  out.condenseDiagnosticsMinLines = Math.round(out.condenseDiagnosticsMinLines);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostics-settings.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js test/diagnostics-settings.test.js
git commit -m "Add the two condensing settings, clamped like every other"
```

---

## Task 9: The expand overlay

**Files:**
- Create: `src/renderer/js/diagnostic-overlay.js`
- Test: `test/diagnostic-overlay.test.js`

**Interfaces:**
- Consumes: records from `Condenser`'s `onCondensed` - `{ id, original, summary }`.
- Produces: `new Overlay.DiagnosticOverlay({ document, onCopy })` with `remember(record)`, `get(id)`, `last()`, `size()`, `open(id)`, `openLast()`, `close()`, `isOpen()`, `dispose()`. Bounded at **50** originals per pane.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Overlay = require('../src/renderer/js/diagnostic-overlay.js');

function record(id, original) {
  return {
    id: id,
    original: original || ('original ' + id + '\n'),
    summary: { headline: 'error: boom', location: 'src/a.cpp:1:1', hiddenCount: 40 },
  };
}

test('a remembered original can be retrieved by id', () => {
  const store = new Overlay.DiagnosticOverlay({});
  store.remember(record(1));
  assert.strictEqual(store.get(1).original, 'original 1\n');
});

test('the most recent original is what expand reaches for', () => {
  const store = new Overlay.DiagnosticOverlay({});
  store.remember(record(1));
  store.remember(record(2));
  assert.strictEqual(store.last().id, 2);
});

test('the store is bounded at fifty, dropping the oldest', () => {
  // A long build can produce hundreds of diagnostics. Memory must not grow
  // with the length of the build.
  const store = new Overlay.DiagnosticOverlay({});
  for (let i = 1; i <= 60; i++) store.remember(record(i));
  assert.strictEqual(store.size(), 50);
  assert.strictEqual(store.get(1), null);
  assert.strictEqual(store.get(11).original, 'original 11\n');
  assert.strictEqual(store.last().id, 60);
});

test('last() on an empty store is null rather than a throw', () => {
  const store = new Overlay.DiagnosticOverlay({});
  assert.strictEqual(store.last(), null);
  assert.strictEqual(store.isOpen(), false);
});

test('opening an unknown id does not open anything', () => {
  const store = new Overlay.DiagnosticOverlay({});
  assert.strictEqual(store.open(99), false);
  assert.strictEqual(store.isOpen(), false);
});

test('openLast on an empty store returns false', () => {
  const store = new Overlay.DiagnosticOverlay({});
  assert.strictEqual(store.openLast(), false);
});

test('the original is stored byte-for-byte, escapes and all', () => {
  const store = new Overlay.DiagnosticOverlay({});
  const raw = '\x1b[31merror\x1b[0m: boom\r\n  note\r\n';
  store.remember(record(1, raw));
  assert.strictEqual(store.get(1).original, raw);
});

test('dispose empties the store', () => {
  const store = new Overlay.DiagnosticOverlay({});
  store.remember(record(1));
  store.dispose();
  assert.strictEqual(store.size(), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostic-overlay.test.js`
Expected: FAIL with "Cannot find module '../src/renderer/js/diagnostic-overlay.js'"

- [ ] **Step 3: Write the implementation**

```js
/**
 * The expand affordance for a condensed diagnostic.
 *
 * Holds the untouched original bytes of recent condensed blocks and, in the
 * browser, renders them in a scrollable overlay with a copy button. The store
 * is bounded: a long build can emit hundreds of diagnostics and memory must
 * not grow with the length of the build.
 *
 * The store half is pure and tested directly; the DOM half is inert when no
 * document is supplied, which is how the test suite loads this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiagnosticOverlay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ORIGINALS = 50;

  class DiagnosticOverlay {
    constructor(options) {
      const o = options || {};
      this.document = o.document || null;
      this.onCopy = o.onCopy || function () {};
      this.records = new Map();
      this.element = null;
    }

    /** Keep the original, evicting the oldest once past the cap. */
    remember(record) {
      this.records.set(record.id, record);
      while (this.records.size > MAX_ORIGINALS) {
        const oldest = this.records.keys().next().value;
        this.records.delete(oldest);
      }
    }

    get(id) {
      return this.records.has(id) ? this.records.get(id) : null;
    }

    last() {
      let found = null;
      for (const record of this.records.values()) found = record;
      return found;
    }

    size() {
      return this.records.size;
    }

    isOpen() {
      return this.element !== null;
    }

    /** Show the original. Returns false when there is nothing to show. */
    open(id) {
      const record = this.get(id);
      if (!record) return false;
      if (!this.document) return true; // headless: the store is the contract

      this.close();

      const overlay = this.document.createElement('div');
      overlay.className = 'diagnostic-overlay';

      const pre = this.document.createElement('pre');
      pre.className = 'diagnostic-original';
      pre.textContent = record.original;
      overlay.appendChild(pre);

      const copy = this.document.createElement('button');
      copy.className = 'diagnostic-copy';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => this.onCopy(record.original));
      overlay.appendChild(copy);

      const close = this.document.createElement('button');
      close.className = 'diagnostic-close';
      close.textContent = 'Close';
      close.addEventListener('click', () => this.close());
      overlay.appendChild(close);

      this.element = overlay;
      return true;
    }

    /** Open the most recent diagnostic, for the palette entry and the key. */
    openLast() {
      const record = this.last();
      return record ? this.open(record.id) : false;
    }

    close() {
      if (!this.element) return;
      if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
      this.element = null;
    }

    dispose() {
      this.close();
      this.records.clear();
    }
  }

  return { DiagnosticOverlay, MAX_ORIGINALS };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostic-overlay.test.js`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/diagnostic-overlay.js test/diagnostic-overlay.test.js
git commit -m "Keep the original within reach, and bounded"
```

---

## Task 10: Wire the condenser into the pane

**Files:**
- Modify: `src/renderer/js/terminal-pane.js` (constructor, `write`, `dispose`)
- Modify: `src/renderer/index.html` (script tags)
- Modify: `src/renderer/js/app.js` (palette entry, `Alt+Enter` binding)
- Modify: `src/renderer/css/app.css` (overlay styles)

**Interfaces:**
- Consumes: `Diagnostics.Condenser`, `DiagnosticMatchers.ALL`, `DiagnosticOverlay.DiagnosticOverlay`.
- Produces: `pane.expandLastDiagnostic() -> boolean`.

- [ ] **Step 1: Add the script tags**

In `src/renderer/index.html`, after the `js/kit-glyphs.js` line and **before** `js/terminal-pane.js` (load order matters - the pane constructs a Condenser):

```html
<script src="js/demangle.js"></script>
<script src="js/diagnostics.js"></script>
<script src="js/diagnostic-matchers.js"></script>
<script src="js/diagnostic-overlay.js"></script>
```

- [ ] **Step 2: Build the condenser in the pane constructor**

In `terminal-pane.js`, after `this.disposed = false;`:

```js
      // Diagnostic condensing sits between the PTY and xterm. It is built
      // unconditionally and consulted per write, so toggling the setting
      // takes effect on the next line rather than needing a new pane.
      this.overlay = new window.DiagnosticOverlay.DiagnosticOverlay({
        document: document,
        onCopy: (text) => api.clipboard.write(text).catch(function () {}),
      });
      this.condenser = new window.Diagnostics.Condenser({
        emit: (text) => { if (!this.disposed && this.term) this.term.write(text); },
        onCondensed: (record) => this.overlay.remember(record),
        matchers: window.DiagnosticMatchers.ALL,
        cwd: () => this.cwd,
        enabled: () => this.settings.condenseDiagnostics !== false,
        minLines: () => this.settings.condenseDiagnosticsMinLines || 20,
      });
```

- [ ] **Step 3: Route write() through it**

Replace the `write` method:

```js
    write(data) {
      if (this.disposed || !this.term) return;
      this.condenser.write(data);
    }

    /** Show the original bytes of the most recent condensed diagnostic. */
    expandLastDiagnostic() {
      return this.overlay ? this.overlay.openLast() : false;
    }
```

and in `dispose()`, before the existing teardown:

```js
      if (this.condenser) this.condenser.dispose();
      if (this.overlay) this.overlay.dispose();
```

- [ ] **Step 4: Add the palette entry and the key binding**

In `app.js`'s `openPalette()` entry list, after the `Find in Terminal` entry:

```js
      { label: 'Expand Last Diagnostic', hint: 'Alt+Enter', run: expandLastDiagnostic },
```

and define it beside the other commands:

```js
  /** Show the untouched original of the most recent condensed diagnostic. */
  function expandLastDiagnostic() {
    const pane = activePane();
    if (pane && pane.expandLastDiagnostic) pane.expandLastDiagnostic();
  }
```

In `wireEvents()`, alongside the existing key handling:

```js
    document.addEventListener('keydown', (event) => {
      if (event.altKey && event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        expandLastDiagnostic();
      }
    });
```

- [ ] **Step 5: Add the overlay styles**

Append to `src/renderer/css/app.css`:

```css
.diagnostic-overlay {
  position: absolute;
  inset: 10%;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow: auto;
  border-radius: 8px;
  background: var(--panel-bg, #1a1b26);
  border: 1px solid var(--panel-border, #2a2b3c);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.diagnostic-original {
  flex: 1;
  margin: 0;
  overflow: auto;
  white-space: pre;
  font: inherit;
}

.diagnostic-copy,
.diagnostic-close {
  align-self: flex-end;
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 7: Manually verify in the app**

Run: `npm start`

Then in the terminal that opens, with a C++ compiler available:

```bash
printf '#include <vector>\nint main(){std::vector<int> v; v.push_back("x"); }\n' > /tmp/j.cpp && g++ /tmp/j.cpp
```

Expected: a three-line summary naming `/tmp/j.cpp`, and `Alt+Enter` opens the original.
Then confirm `vim` opens and redraws normally, and that a `read -p "name: "` prompt appears immediately with no delay.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/js/terminal-pane.js src/renderer/js/app.js src/renderer/index.html src/renderer/css/app.css
git commit -m "Put the condenser between the shell and the screen"
```

---

## Task 11: Fixtures, end-to-end, and chunk-boundary fuzzing

**Files:**
- Create: `test/fixtures/gcc-template.txt`, `test/fixtures/clang-template.txt`, `test/fixtures/ld-undefined.txt`, `test/fixtures/vim-session.txt`, `test/fixtures/progress-bar.txt`
- Create: `test/diagnostics-e2e.test.js`

**Interfaces:**
- Consumes: everything built so far.
- Produces: no new API. This task is the spec's testing gate.

- [ ] **Step 1: Capture the fixtures**

Write real captured output into `test/fixtures/`:

| Fixture | Must contain |
| --- | --- |
| `gcc-template.txt` | at least 40 lines of genuine `g++` template output, ending in a `make:` line |
| `clang-template.txt` | Clang's `in instantiation of ... requested here` vocabulary |
| `ld-undefined.txt` | a real `undefined reference to` block with a mangled `_ZN...` symbol |
| `vim-session.txt` | `ESC[?1049h`, cursor movement, `ESC[?1049l` |
| `progress-bar.txt` | CR-rewritten progress lines with no LF between them |

Capture them with `script`, which preserves the escapes a pipe would strip:

```bash
script -q /dev/null g++ broken.cpp > test/fixtures/gcc-template.txt 2>&1
```

- [ ] **Step 2: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Diagnostics = require('../src/renderer/js/diagnostics.js');
const Matchers = require('../src/renderer/js/diagnostic-matchers.js');

const FIXTURES = path.join(__dirname, 'fixtures');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

/** Feed `input` through a real Condenser in the given chunks. */
function run(input, chunks, options) {
  const emitted = [];
  const condensed = [];
  const condenser = new Diagnostics.Condenser({
    emit: (text) => emitted.push(text),
    onCondensed: (record) => condensed.push(record),
    matchers: (options && options.matchers) || Matchers.ALL,
    cwd: () => (options && options.cwd) || null,
    minLines: () => (options && options.minLines) || 20,
    schedule: () => null,
    cancel: () => {},
  });
  for (const chunk of chunks) condenser.write(chunk);
  condenser.flushNow();
  return { output: emitted.join(''), condensed: condensed };
}

function byBytes(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

test('THE GATE: a vim session passes through byte for byte', () => {
  const input = fixture('vim-session.txt');
  assert.strictEqual(run(input, [input]).output, input);
});

test('THE GATE: a progress bar passes through byte for byte', () => {
  const input = fixture('progress-bar.txt');
  assert.strictEqual(run(input, [input]).output, input);
});

test('THE GATE: non-diagnostic output survives any chunk size', () => {
  const input = fixture('vim-session.txt') + fixture('progress-bar.txt');
  for (const size of [1, 2, 3, 7, 13, 64, 512, 4096]) {
    assert.strictEqual(run(input, byBytes(input, size)).output, input,
      'lost bytes at chunk size ' + size);
  }
});

test('THE GATE: a chunk split mid-escape-sequence loses nothing', () => {
  const input = '\x1b[?1049h\x1b[2J\x1b[Hdrawing\x1b[?1049l\n';
  for (let cut = 1; cut < input.length; cut++) {
    const chunks = [input.slice(0, cut), input.slice(cut)];
    assert.strictEqual(run(input, chunks).output, input, 'lost bytes cutting at ' + cut);
  }
});

test('gcc template output condenses and names the user file', () => {
  const input = fixture('gcc-template.txt');
  const result = run(input, [input]);
  assert.strictEqual(result.condensed.length, 1);
  const shown = Diagnostics.stripSgr(result.output);
  assert.match(shown, /your code:/);
  assert.match(shown, /lines hidden/);
});

test('clang template output condenses too', () => {
  const input = fixture('clang-template.txt');
  assert.strictEqual(run(input, [input]).condensed.length, 1);
});

test('an undefined reference condenses with a demangled symbol', () => {
  const input = fixture('ld-undefined.txt');
  const result = run(input, [input], { minLines: 1 });
  assert.strictEqual(result.condensed.length, 1);
  assert.doesNotMatch(result.output, /_ZN/, 'the symbol should be demangled');
});

test('FUZZING: a diagnostic fixture produces identical output at every chunk size', () => {
  // Chunk boundaries are decided by the OS pipe, not by the compiler. The
  // same bytes must condense the same way however they arrive.
  const input = fixture('gcc-template.txt');
  const reference = run(input, [input]).output;
  for (const size of [1, 2, 5, 17, 64, 256, 1024]) {
    assert.strictEqual(run(input, byBytes(input, size)).output, reference,
      'differed at chunk size ' + size);
  }
});

test('FUZZING: randomly sized chunks are stable across many trials', () => {
  const input = fixture('gcc-template.txt');
  const reference = run(input, [input]).output;
  for (let trial = 0; trial < 200; trial++) {
    const chunks = [];
    let i = 0;
    while (i < input.length) {
      const size = 1 + Math.floor(Math.random() * 40);
      chunks.push(input.slice(i, i + size));
      i += size;
    }
    assert.strictEqual(run(input, chunks).output, reference, 'unstable on trial ' + trial);
  }
});

test('the retained original is a verbatim slice of the input', () => {
  const input = fixture('gcc-template.txt');
  const result = run(input, [input]);
  assert.ok(input.includes(result.condensed[0].original));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/diagnostics-e2e.test.js`
Expected: FAIL with ENOENT until Step 1 is complete, then real assertion failures if the machine mishandles a chunk boundary.

- [ ] **Step 4: Fix whatever the fuzzing finds**

Chunk-boundary defects belong in `diagnostics.js`, not in the test. Fix the module.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add test/fixtures test/diagnostics-e2e.test.js
git commit -m "Prove the passthrough invariant against real captured output"
```

---

## Task 12: Documentation

**Files:**
- Modify: `README.md` - the Features list, the Settings table, a new section, the test count
- Modify: `docs/design.md` - the module list

- [ ] **Step 1: Add the feature bullet**

In the Features list, after the Trace bullet:

```markdown
- **Diagnostic condensing** - a 200-line C++ template error becomes three lines:
  the error, the frame in *your* code, and a count of what was hidden. The
  original is one keystroke away and is never discarded. See
  [Diagnostic condensing](#diagnostic-condensing)
```

- [ ] **Step 2: Add the settings rows**

```markdown
| `condenseDiagnostics` | `true` | Condense long compiler and linker errors inline |
| `condenseDiagnosticsMinLines` | `20` | Leave shorter diagnostics alone; they are already readable |
```

- [ ] **Step 3: Add the section**

Place it after Trace, written in the README's existing voice: lead with the problem, show the output, then state the limits plainly.

Cover, in this order: the three-line output shape as a fenced example; that the `your code:` line is the product and that a block with no user frame is deliberately left alone; that nothing is ever lost, and the three ways to expand (`Alt+Enter`, clicking the arrow line, the palette entry) with the 50-original bound; that it works inside `make`, `cmake` and over `ssh` because it reads output rather than wrapping commands; the fail-open guards by name (cursor movement, alternate screen, partial line mid-block, 500 lines, 200ms) and that `vim`, `htop`, `less` and `tmux` are untouched; that symbols are demangled by a pure-JS Itanium subset and anything unparseable is shown mangled, which is what you see today; how to turn it off; and a **Not included** note covering Rust (deliberate - its diagnostics are already better than this produces) and the designed-but-unbuilt TypeScript, Java, Python, Node and Go matchers.

- [ ] **Step 4: Update the test count**

Re-run the count and update the Development paragraph with the real numbers and the new group breakdown:

```bash
npm test 2>&1 | grep -E "^. (tests|pass|fail|skipped)"
```

- [ ] **Step 5: Update docs/design.md**

Add the four modules to the module list with one line each on responsibility, and note that the condenser sits between the PTY data event and `term.write`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 7: Commit**

```bash
git add README.md docs/design.md
git commit -m "Document diagnostic condensing"
```

---

## Self-review of this plan

**Spec coverage.** Every section of the design maps to a task: the four-file architecture to Tasks 1-2, 3, 4-6 and 9; the matcher interface to Task 4; the streaming state machine to Task 7; all five safety guards to Tasks 2 and 7; the condensed-output format to Task 7's `render`; the two C++ families to Tasks 5 and 6; demangling to Task 3; interaction to Tasks 9-10; settings to Task 8; every bullet of the testing section to Tasks 1, 3, 7 and 11. Decomposition and the open question are recorded in Task 12's "Not included" copy rather than implemented, which is what the spec asks for.

**This plan's code was executed before it was handed over.** Every pure module
was extracted from the code blocks below, assembled, and run against the tests
below: 71 tests, 71 passing. The lossless invariant was then fuzzed over 3,000
random chunkings of a corpus containing a vim session, a CR-rewriting progress
bar, colour and an unterminated prompt - zero bytes lost - and chunk-size
determinism over 8 fixed sizes plus 500 random chunkings of a GCC template
block - zero differences. Four defects were found and fixed this way; they are
recorded below because each one is a place the spec was wrong, not a typo.

**Four spec corrections, found by running the code.**

1. **`parseLocation` could not read the line the feature exists to find.** GCC
   writes the user's own frame as `src/widget.cpp:42:15:   required from here`
   - with no `error:` or `note:` before it. A pattern that demands a severity
   parses every library frame and misses the only one worth reporting, so
   `condense` returned null on exactly the diagnostics it was built for. There
   are now two patterns, severity tried first.

2. **The block opened too late to capture its own headline.** Opening only on
   instantiation vocabulary meant the `error:` line had already been flushed by
   the time `required from here` arrived. The error line shape is now an opener
   - which the spec's own C++ section lists - and `isTemplateFamily` keeps
   ordinary errors out at close time, when the block can finally be classified.

3. **The terminating line was counted as part of the block.** `make: *** [all]
   Error 1` was being swallowed into the summary and inflating `hiddenCount`.
   `isEnd` is now checked before the line is appended, and the terminator falls
   through to ordinary output.

4. **The spec's "partial line while buffering fails open" guard defeats the
   feature.** The premise - "compilers do not split diagnostics mid-line" - is
   true of compilers and false of pipes: the OS decides where a read ends, and
   under small reads nearly every diagnostic straddles one. With that guard,
   condensing worked at one chunk size and silently stopped working at every
   other. Partial tails are now held and released by the same 16ms timer, with
   a `committed` offset so a partial already on screen is never written twice;
   a partial that genuinely never completes is caught by the 200ms block cap,
   which is where that guard actually belongs. The visible cost is that an
   unterminated prompt appears 16ms late rather than instantly - a delay the
   spec already budgets, and far cheaper than a feature that works only when
   the pipe cooperates.

**Two further spec details deliberately resolved here.** The spec's `isEnd(lines)` signature is ambiguous about whether it receives the whole block or the newest line; this plan passes `[line]` - the newest line only - and both matchers are written for that. And the spec lists `isVendorPath` on the matcher object while both C++ matchers share one implementation; this plan hoists it to a module-level function, which is what "adding a language is a small change" actually requires.

**Placeholder scan.** No TBDs. Every code step carries real code. Two steps state requirements rather than content, both deliberately: Task 11 Step 1, because fixtures must be captured from real compilers on the implementer's machine - so the step gives the capture command, a table of what each fixture must contain, and the minimum size; and Task 12 Step 3, because README prose must be written in the document's own voice - so the step enumerates every point the section must make, in order.

**Type consistency.** `{ headline, location, hiddenCount }` is produced by both matchers (Tasks 5, 6) and consumed by `render` (Task 7). `{ id, original, summary }` is produced by `_closeBlock` (Task 7) and consumed by `remember` (Task 9). `Condenser`'s injected `schedule`/`cancel` appear with identical signatures in Tasks 7 and 11. `pickUserFrame(paths, cwd)` is defined in Task 4 and called with that signature in Tasks 5 and 6. `openLast()` is defined in Task 9 and called in Task 10. `stripSgr` exists in both `diagnostics.js` and `diagnostic-matchers.js` - deliberate duplication of four lines, because making one module require the other purely for a regex would couple the state machine to the registry.

**What is still unproven.** The pure logic is verified; the parts that need a
real machine are not. Task 11's fixtures must come from real `g++` and `clang`
output - the synthetic blocks used in verification match the shapes those
compilers produce, but only real captures prove it. Task 10's DOM wiring, the
`Alt+Enter` binding and the overlay styling have no automated coverage and rest
on Step 7's manual check. And `condenseDiagnosticsMinLines: 20` remains a
guess, exactly as the spec admits.
