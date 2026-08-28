# Recall Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Josh learns where a prompt begins, when a command runs, and what it returned — authenticated against forged output — records that history locally with mandatory redaction, and offers an inline ghost-text suggestion that is right often enough to trust and silent whenever it is not.

**Architecture:** Six modules. Five in the main process, because main already sees both PTY output and every renderer write, so the renderer never has to *ask* for a suggestion — main pushes one. The interesting logic (parsing, tracking, redaction, ranking) is pure and testable without Electron, matching how `validate.js`, `split-tree.js` and `shell-resolver.js` are already structured.

**Tech Stack:** Plain ES2020 JavaScript, CommonJS in main / UMD in the renderer, `node:test` + `node:assert`, `node:crypto` for the nonce. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-24-recall-foundation-design.md`](../specs/2026-08-24-recall-foundation-design.md)

## Global Constraints

- **Exactly one new IPC channel:** the event `recall:suggestion`, payload `{sessionId, text}`. **Zero new invoke channels.** The invoke allowlist stays at 16.
- **The nonce is mandatory.** A sequence whose `nonce` is absent or does not match the session's is ignored entirely — not logged, not partially applied.
- **Redaction runs before anything touches disk.** A matching command is dropped entirely, never truncated, never partially stored.
- **Suggestion text is sanitised in main** before crossing to the renderer — control characters stripped and length clamped, exactly as `sanitizeTitle` already does.
- **A wrong suggestion is worse than no suggestion.** Every uncertainty produces silence.
- **Where integration cannot be established, Recall is disabled for that session** — never a heuristic fallback. Guessing prompt boundaries produces confidently wrong suggestions.
- **Tab is untouched.** It belongs to the shell's own completion. Right Arrow and End accept; Esc dismisses.
- Store at `~/.config/josh/recall.jsonl`, `0600`, atomic writes, same discipline as `settings.js`.
- Settings defaults: `recall` `true`, `recallInlineSuggest` `true`, `recallExcludePatterns` `[]`, `recallMaxEntries` `50000`.
- No network access, consistent with the app-wide CSP.
- `shell-integration.js` is **shared with the Shell Kit**. Recall adds OSC 133 hooks and a nonce to files it already generates; it must not regress any Shell Kit test.

---

## File Structure

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/main/semantic-parser.js` | OSC 133 grammar, nonce rejection, per-session state machine | yes |
| `src/main/input-tracker.js` | The partially typed line, or an honest "I don't know" | yes |
| `src/main/recall-redact.js` | The one question: may this command be written down? | yes |
| `src/main/recall-store.js` | Append-only JSONL, in-memory index, compaction | no |
| `src/main/recall-rank.js` | Pure scoring: locality, outcome, recency, frequency, repair pairs | yes |
| `src/renderer/js/suggestion.js` | Ghost text overlay aligned to the cursor cell | no |
| `src/main/shell-integration.js` | Modified: OSC 133 hooks and the nonce, per dialect | no |
| `src/main/pty-manager.js` | Modified: scan output, track writes, own the nonce | no |
| `src/main/validate.js` | Modified: `sanitizeSuggestion` | no |
| `src/main/settings.js` | Modified: four new keys | no |
| `src/preload/preload.js` | Modified: one event channel | no |

Redaction lives in its own file rather than inside the store, against the spec's file list, for one reason: it is the module where a mistake leaks a secret, and it should be reviewable and testable without the filesystem anywhere near it.

## Task order and dependencies

Tasks 1-3 build the pure input side. Tasks 4-5 build storage, redaction first. Task 6 is ranking. Task 7 is settings. Tasks 8-10 are integration and the trust boundary. Task 11 is the renderer. Task 12 verifies and documents.

Tasks 1-8 are all pure and can be executed in any order, or in parallel.

---

## Task 1: The OSC 133 grammar and nonce rejection

**Files:**
- Create: `src/main/semantic-parser.js`
- Test: `test/semantic-parser.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Parser.HINT` — the cheap substring guard.
  - `Parser.makeNonce() -> string` — 32 hex characters from `node:crypto`.
  - `Parser.parseSequence(text, nonce) -> { type, cmd, exit } | null` — one sequence, or null when the nonce is absent, wrong, or the shape is unrecognised.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Parser = require('../src/main/semantic-parser.js');

const N = 'a'.repeat(32);
const ST = '\x1b\\';

test('a nonce is 32 hex characters and differs every time', () => {
  const a = Parser.makeNonce();
  const b = Parser.makeNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(a, b);
});

test('prompt start parses', () => {
  const out = Parser.parseSequence('\x1b]133;A;nonce=' + N + ST, N);
  assert.strictEqual(out.type, 'A');
});

test('input start parses', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;B;nonce=' + N + ST, N).type, 'B');
});

test('command start carries the percent-encoded command line', () => {
  const seq = '\x1b]133;C;nonce=' + N + ';cmd=cargo%20test' + ST;
  const out = Parser.parseSequence(seq, N);
  assert.strictEqual(out.type, 'C');
  assert.strictEqual(out.cmd, 'cargo test');
});

test('command end carries the exit code', () => {
  const out = Parser.parseSequence('\x1b]133;D;nonce=' + N + ';0' + ST, N);
  assert.strictEqual(out.type, 'D');
  assert.strictEqual(out.exit, 0);
});

test('a non-zero exit code parses', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;D;nonce=' + N + ';127' + ST, N).exit, 127);
});

test('BEL terminates a sequence as well as ST', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + '\x07', N).type, 'A');
});

test('A MISSING NONCE IS REJECTED ENTIRELY', () => {
  // The whole threat model rests on this. `cat`-ing a file full of crafted
  // sequences must achieve nothing at all.
  assert.strictEqual(Parser.parseSequence('\x1b]133;A' + ST, N), null);
  assert.strictEqual(Parser.parseSequence('\x1b]133;C;cmd=rm%20-rf%20%2F' + ST, N), null);
});

test('A WRONG NONCE IS REJECTED ENTIRELY', () => {
  const wrong = 'b'.repeat(32);
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + wrong + ST, N), null);
  assert.strictEqual(
    Parser.parseSequence('\x1b]133;C;nonce=' + wrong + ';cmd=evil' + ST, N),
    null
  );
});

test('a nonce that merely starts with the right value is rejected', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + 'extra' + ST, N), null);
});

test('an unknown sequence type is rejected', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;Z;nonce=' + N + ST, N), null);
});

test('a malformed exit code is rejected rather than coerced', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;D;nonce=' + N + ';abc' + ST, N), null);
});

test('percent-decoding failure yields null rather than a throw', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;C;nonce=' + N + ';cmd=%ZZ' + ST, N), null);
});

test('an absent session nonce rejects everything', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + ST, null), null);
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + ST, ''), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/semantic-parser.test.js`
Expected: FAIL with "Cannot find module '../src/main/semantic-parser.js'"

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * OSC 133 semantic prompt marking, authenticated by a per-session nonce.
 *
 * Terminal output is fully attacker-controlled: a hostile file, log or HTTP
 * response chooses what Josh receives. Semantic marking would make that worse
 * -- output able to forge prompt state could make Josh record fabricated
 * history, or suggest an attacker's command at the moment the user is most
 * likely to accept it.
 *
 * The nonce closes that. Josh mints a fresh random value per session and
 * ignores any sequence not carrying it, so `cat`-ing crafted sequences
 * achieves nothing. What the nonce does NOT defend against, plainly: any
 * program the user actually runs inherits the environment and can read the
 * nonce. That is untrusted *execution*, which no terminal can prevent, and is
 * out of scope. The nonce defends against untrusted *output*, the realistic
 * and stated threat.
 */

const { randomBytes } = require('node:crypto');

/** Cheap substring guard, checked before any regex runs on an output chunk. */
const HINT = '\x1b]133;';

/** `ESC ] 133 ; <body> (BEL | ST)` */
const SEQUENCE = /\x1b\]133;([^\x07\x1b]*)(?:\x07|\x1b\\)/;

const MAX_COMMAND = 4096;

function makeNonce() {
  return randomBytes(16).toString('hex');
}

/** Percent-decoding that answers null instead of throwing on bad input. */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Parse one sequence against the session's nonce.
 *
 * Returns null for anything unrecognised, unauthenticated or malformed. There
 * is deliberately no error channel: a rejected sequence is not an event worth
 * reporting, and reporting it would itself be a signal an attacker could use.
 */
function parseSequence(text, nonce) {
  if (typeof nonce !== 'string' || !nonce) return null;
  if (typeof text !== 'string') return null;

  const match = SEQUENCE.exec(text);
  if (!match) return null;

  const parts = match[1].split(';');
  const type = parts[0];
  if (type !== 'A' && type !== 'B' && type !== 'C' && type !== 'D') return null;

  // The nonce must be the next field and must match exactly. A prefix match
  // would let `nonce=<real><anything>` through.
  if (parts[1] !== 'nonce=' + nonce) return null;

  if (type === 'A' || type === 'B') return { type, cmd: null, exit: null };

  if (type === 'C') {
    const field = parts[2];
    if (typeof field !== 'string' || !field.startsWith('cmd=')) {
      return { type, cmd: null, exit: null };
    }
    const cmd = safeDecode(field.slice(4));
    if (cmd === null) return null;
    return { type, cmd: cmd.slice(0, MAX_COMMAND), exit: null };
  }

  const code = parts[2];
  if (typeof code !== 'string' || !/^\d{1,3}$/.test(code)) return null;
  return { type, cmd: null, exit: Number(code) };
}

module.exports = { HINT, SEQUENCE, MAX_COMMAND, makeNonce, parseSequence };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/semantic-parser.test.js`
Expected: PASS, 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/semantic-parser.js test/semantic-parser.test.js
git commit -m "Refuse every prompt marker that cannot prove it came from our shell"
```

---

## Task 2: The per-session state machine

**Files:**
- Modify: `src/main/semantic-parser.js`
- Test: `test/semantic-parser-state.test.js`

**Interfaces:**
- Consumes: `parseSequence`, `HINT`, `SEQUENCE` from Task 1.
- Produces:
  - `Parser.createSession(nonce) -> state` with `state.phase` in `'idle' | 'prompt' | 'input' | 'running'` and `state.carry`.
  - `Parser.scan(state, chunk) -> Array<{type, cmd, exit}>` — every authenticated event in the chunk, in order, with the machine advanced. Sequences split across chunks reassemble; out-of-order transitions reset to `idle`.
  - `Parser.MAX_CARRY`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Parser = require('../src/main/semantic-parser.js');

const N = 'a'.repeat(32);
const ST = '\x1b\\';
const A = '\x1b]133;A;nonce=' + N + ST;
const B = '\x1b]133;B;nonce=' + N + ST;
const C = (cmd) => '\x1b]133;C;nonce=' + N + ';cmd=' + encodeURIComponent(cmd) + ST;
const D = (code) => '\x1b]133;D;nonce=' + N + ';' + code + ST;

test('a fresh session is idle', () => {
  assert.strictEqual(Parser.createSession(N).phase, 'idle');
});

test('the happy path walks idle to prompt to input to running and back', () => {
  const s = Parser.createSession(N);
  Parser.scan(s, A); assert.strictEqual(s.phase, 'prompt');
  Parser.scan(s, B); assert.strictEqual(s.phase, 'input');
  Parser.scan(s, C('ls')); assert.strictEqual(s.phase, 'running');
  Parser.scan(s, D(0)); assert.strictEqual(s.phase, 'idle');
});

test('scan returns the events it accepted', () => {
  const s = Parser.createSession(N);
  const events = Parser.scan(s, A + B + C('cargo test') + D(0));
  assert.deepStrictEqual(events.map((e) => e.type), ['A', 'B', 'C', 'D']);
  assert.strictEqual(events[2].cmd, 'cargo test');
  assert.strictEqual(events[3].exit, 0);
});

test('ordinary output between sequences is ignored', () => {
  const s = Parser.createSession(N);
  const events = Parser.scan(s, 'total 12\n' + A + 'drwxr-xr-x\n' + B);
  assert.deepStrictEqual(events.map((e) => e.type), ['A', 'B']);
});

test('A SEQUENCE SPLIT ACROSS CHUNKS REASSEMBLES', () => {
  // The pipe decides where a read ends. A prompt marker cut in half must not
  // be lost, or the session silently stops recording.
  const whole = A + B;
  for (let cut = 1; cut < whole.length; cut++) {
    const t = Parser.createSession(N);
    const first = Parser.scan(t, whole.slice(0, cut));
    const second = Parser.scan(t, whole.slice(cut));
    assert.deepStrictEqual(
      first.concat(second).map((e) => e.type), ['A', 'B'],
      'lost an event cutting at ' + cut
    );
  }
});

test('a sequence split byte by byte still reassembles', () => {
  const s = Parser.createSession(N);
  const whole = A + B + C('ls') + D(0);
  const seen = [];
  for (const ch of whole) for (const e of Parser.scan(s, ch)) seen.push(e.type);
  assert.deepStrictEqual(seen, ['A', 'B', 'C', 'D']);
});

test('an out-of-order transition resets to idle rather than throwing', () => {
  // A shell can always be interrupted mid-sequence: Ctrl+C between B and C
  // leaves the machine expecting a C that never comes. A stuck machine would
  // record nothing ever again, which is far worse than losing one command.
  const s = Parser.createSession(N);
  Parser.scan(s, A + B);
  Parser.scan(s, D(130));
  assert.strictEqual(s.phase, 'idle');
});

test('a forged sequence never advances the machine', () => {
  const s = Parser.createSession(N);
  const forged = '\x1b]133;A;nonce=' + 'b'.repeat(32) + ST;
  assert.deepStrictEqual(Parser.scan(s, forged), []);
  assert.strictEqual(s.phase, 'idle');
});

test('a chunk with no hint costs nothing and returns nothing', () => {
  const s = Parser.createSession(N);
  assert.deepStrictEqual(Parser.scan(s, 'ordinary output with no escapes\n'), []);
});

test('THE CARRY BUFFER CANNOT GROW WITHOUT BOUND', () => {
  // Output containing the hint but never a terminator must not accumulate
  // forever -- that is a memory leak driven by hostile output.
  const s = Parser.createSession(N);
  for (let i = 0; i < 100; i++) Parser.scan(s, '\x1b]133;' + 'x'.repeat(1000));
  assert.ok(s.carry.length <= Parser.MAX_CARRY, 'carry grew to ' + s.carry.length);
});

test('a session with no nonce accepts nothing', () => {
  assert.deepStrictEqual(Parser.scan(Parser.createSession(null), A), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/semantic-parser-state.test.js`
Expected: FAIL with "Parser.createSession is not a function"

- [ ] **Step 3: Write the implementation**

Add to `semantic-parser.js` before `module.exports`:

```js
/**
 * The most a partial sequence may occupy while waiting for its terminator.
 *
 * Without this, output containing the hint but never terminating -- which
 * hostile output can produce deliberately -- would grow the carry buffer
 * forever. Dropping the carry loses at most one marker, costing one unrecorded
 * command; retaining it unboundedly costs the process.
 */
const MAX_CARRY = 8192;

const NEXT = {
  idle:    { A: 'prompt' },
  prompt:  { B: 'input' },
  input:   { C: 'running' },
  running: { D: 'idle' },
};

function createSession(nonce) {
  return {
    nonce: typeof nonce === 'string' && nonce ? nonce : null,
    phase: 'idle',
    carry: '',
  };
}

/**
 * Consume one output chunk, returning every authenticated event in order.
 *
 * Sequences are left in the stream the renderer receives: xterm.js ignores OSC
 * codes it does not implement, and rewriting the stream risks corrupting
 * multi-byte or split chunks for no benefit.
 */
/**
 * The longest suffix of `text` that could be the beginning of a hint.
 *
 * The pipe, not the shell, decides where a read ends, so a marker is regularly
 * cut in half -- often after the single escape byte. Discarding that fragment
 * loses the marker entirely, and under small reads that means Recall records
 * nothing at all while appearing to work.
 */
function hintTail(text) {
  const max = Math.min(HINT.length - 1, text.length);
  for (let n = max; n > 0; n--) {
    if (HINT.startsWith(text.slice(text.length - n))) return text.slice(text.length - n);
  }
  return '';
}

function scan(state, chunk) {
  if (!state || !state.nonce || typeof chunk !== 'string' || !chunk) return [];

  // Cheap guard: one indexOf on every output chunk. When it misses, the chunk
  // may still END mid-hint, so keep just that fragment rather than dropping it.
  if (state.carry === '' && chunk.indexOf(HINT) === -1) {
    state.carry = hintTail(chunk);
    return [];
  }

  let text = state.carry + chunk;
  const events = [];

  for (;;) {
    const start = text.indexOf(HINT);
    if (start === -1) { text = hintTail(text); break; }

    const match = SEQUENCE.exec(text.slice(start));
    if (!match) {
      // An unterminated sequence: keep it for the next chunk.
      text = text.slice(start);
      break;
    }

    const event = parseSequence(match[0], state.nonce);
    if (event) {
      const target = NEXT[state.phase] && NEXT[state.phase][event.type];
      state.phase = target || 'idle';
      if (target) events.push(event);
    }

    text = text.slice(start + match[0].length);
  }

  state.carry = text.length > MAX_CARRY ? '' : text;
  return events;
}
```

and extend the exports:

```js
module.exports = {
  HINT, SEQUENCE, MAX_COMMAND, MAX_CARRY,
  makeNonce, parseSequence, createSession, scan,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/semantic-parser-state.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/semantic-parser.js test/semantic-parser-state.test.js
git commit -m "Follow the shell through a command, and recover when it is interrupted"
```

---

## Task 3: The input tracker

**Files:**
- Create: `src/main/input-tracker.js`
- Test: `test/input-tracker.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `Tracker.create() -> tracker` with `reset()`, `consume(data)`, and `line()` returning the typed line or **null** when invalidated. `Tracker.MAX_LINE`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Tracker = require('../src/main/input-tracker.js');

test('a fresh tracker knows nothing', () => {
  assert.strictEqual(Tracker.create().line(), null);
});

test('after a reset the line is empty, not unknown', () => {
  const t = Tracker.create();
  t.reset();
  assert.strictEqual(t.line(), '');
});

test('printable characters accumulate', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('c'); t.consume('a'); t.consume('t');
  assert.strictEqual(t.line(), 'cat');
});

test('a multi-character paste of printables accumulates', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('git st');
  assert.strictEqual(t.line(), 'git st');
});

test('backspace removes the last character', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x7f');
  assert.strictEqual(t.line(), 'ca');
});

test('backspace on an empty line stays empty rather than going negative', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('\x7f');
  assert.strictEqual(t.line(), '');
});

test('AN ARROW KEY INVALIDATES', () => {
  // The cursor moved somewhere Josh cannot model. Every later keystroke lands
  // at an unknown position, so the line is no longer knowable.
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x1b[D');
  assert.strictEqual(t.line(), null);
});

test('TAB INVALIDATES, because the shell rewrites the line', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('car'); t.consume('\t');
  assert.strictEqual(t.line(), null);
});

test('Ctrl+R invalidates, because history search replaces the line', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x12');
  assert.strictEqual(t.line(), null);
});

test('carriage return invalidates -- the line is submitted, not typed', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\r');
  assert.strictEqual(t.line(), null);
});

test('every C0 control character invalidates, except the backspace byte', () => {
  for (let code = 0; code < 0x20; code++) {
    if (code === 0x08) continue; // that byte is editing, not an escape -- see below
    const t = Tracker.create();
    t.reset();
    t.consume('x');
    t.consume(String.fromCharCode(code));
    assert.strictEqual(t.line(), null, 'control 0x' + code.toString(16) + ' must invalidate');
  }
});

test('the 0x08 backspace byte edits rather than invalidating', () => {
  // Terminals disagree about which byte Backspace sends: most send DEL (0x7f),
  // some send BS (0x08). Treating 0x08 as an unmodellable control would make
  // the tracker give up on every correction those terminals produce.
  const t = Tracker.create();
  t.reset();
  t.consume('cat');
  t.consume(String.fromCharCode(0x08));
  assert.strictEqual(t.line(), 'ca');
});

test('once invalidated, further printables do not silently resume', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x1b[D'); t.consume('s');
  assert.strictEqual(t.line(), null);
});

test('the next reset resyncs after an invalidation', () => {
  // A `B` marker means the shell is at a fresh input point, so whatever
  // confused the tracker no longer matters.
  const t = Tracker.create();
  t.reset();
  t.consume('\x1b[D');
  assert.strictEqual(t.line(), null);
  t.reset();
  t.consume('ls');
  assert.strictEqual(t.line(), 'ls');
});

test('an absurdly long line invalidates rather than growing forever', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('x'.repeat(Tracker.MAX_LINE + 1));
  assert.strictEqual(t.line(), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/input-tracker.test.js`
Expected: FAIL with "Cannot find module '../src/main/input-tracker.js'"

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * The partially typed command line, or an honest admission of ignorance.
 *
 * Between `B` (input starts) and `C` (command runs) no sequence fires per
 * keystroke, so this is the one place Recall must infer. It models only what
 * can be modelled with certainty -- printable characters and backspace -- and
 * gives up entirely on anything else: arrow keys, Tab, Ctrl+R, any escape
 * sequence.
 *
 * This is deliberately pessimistic. History recall, the shell's own completion
 * and reverse search all rewrite the line without Josh seeing meaningful
 * keystrokes, so a tracker that guessed would produce a confidently wrong
 * suggestion at exactly the moment the user is most likely to accept it. A
 * wrong suggestion is worse than no suggestion, and "I don't know" costs
 * nothing.
 */

/** Beyond this a line is not a command anyone is typing; stop modelling it. */
const MAX_LINE = 4096;

const DEL = '\x7f';
const BS = '\b';

function create() {
  let buffer = null; // null means "not synchronised"

  return {
    /** A `B` marker: the shell is at a fresh input point. */
    reset() {
      buffer = '';
    },

    /** Everything the renderer asks to write to the PTY passes through here. */
    consume(data) {
      if (buffer === null) return;
      if (typeof data !== 'string' || data === '') return;

      for (const ch of data) {
        if (ch === DEL || ch === BS) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        const code = ch.codePointAt(0);
        // C0 controls and DEL all mean the line changed in a way Josh did not
        // see: an escape sequence, a completion, a history recall, a submit.
        if (code < 0x20 || code === 0x7f) {
          buffer = null;
          return;
        }
        buffer += ch;
        if (buffer.length > MAX_LINE) {
          buffer = null;
          return;
        }
      }
    },

    /** The typed line, or null when Josh cannot know it. */
    line() {
      return buffer;
    },
  };
}

module.exports = { create, MAX_LINE };
```

Note that `BS` is `\b`, which is `0x08` and therefore also caught by the C0 check — the explicit branch must come first, which is why it is written above the control test rather than below it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/input-tracker.test.js`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/input-tracker.js test/input-tracker.test.js
git commit -m "Model the typed line only as far as certainty goes"
```

---

## Task 4: Redaction

**Files:**
- Create: `src/main/recall-redact.js`
- Test: `test/recall-redact.test.js`

**Interfaces:**
- Consumes: nothing. No filesystem access, deliberately.
- Produces: `Redact.shouldRedact(cmd, extraPatterns) -> boolean` and `Redact.compilePatterns(list) -> RegExp[]`, which silently drops invalid regexes rather than throwing.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Redact = require('../src/main/recall-redact.js');

const keep = (cmd) => assert.strictEqual(Redact.shouldRedact(cmd, []), false, 'should keep: ' + cmd);
const drop = (cmd) => assert.strictEqual(Redact.shouldRedact(cmd, []), true, 'should drop: ' + cmd);

test('ordinary commands are kept', () => {
  keep('ls -la');
  keep('git status');
  keep('cargo test --release');
  keep('npm run build');
  keep('ssh user@host');
  keep('cd ../other-project');
});

test('an assignment to a secret-shaped variable is dropped', () => {
  drop('GITHUB_TOKEN=ghp_abcdefghijklmnop npm publish');
  drop('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI cargo run');
  drop('export API_KEY=abc123');
  drop('DB_PASSWORD=hunter2 ./run.sh');
});

test('a secret-bearing flag is dropped', () => {
  drop('curl -u user --password hunter2 https://example.com');
  drop('mysql --password=hunter2');
  drop('gh auth login --token ghp_xxxxxxxxxxxx');
  drop('deploy --api-key abcdef123456');
  drop('tool --secret value');
});

test('a long high-entropy literal is dropped', () => {
  drop('echo eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijklmnopqrstuvwx');
  drop('curl -H "Authorization: Bearer 9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c"');
});

test('A SHORT HEX STRING IS KEPT -- git lives on those', () => {
  // Over-redacting is not free: `git show a1b2c3d` is exactly the kind of
  // command the whole feature exists to suggest.
  keep('git show a1b2c3d');
  keep('git checkout 4f2a9c1');
  keep('docker run -p 8080:8080 myimage');
});

test('a path that merely contains the word key is kept', () => {
  keep('vim ~/.ssh/config');
  keep('cat notes/monkey.txt');
  keep('ls keyboards/');
});

test('matching is case-insensitive', () => {
  drop('github_token=abc npm publish');
  drop('curl --PASSWORD hunter2');
});

test('a user pattern drops what it matches', () => {
  assert.strictEqual(Redact.shouldRedact('internal-tool deploy', [/internal-tool/]), true);
  assert.strictEqual(Redact.shouldRedact('ls', [/internal-tool/]), false);
});

test('an invalid user pattern is discarded, not thrown', () => {
  const compiled = Redact.compilePatterns(['(unclosed', 'valid.*']);
  assert.strictEqual(compiled.length, 1);
  assert.ok(compiled[0].test('valid thing'));
});

test('a non-string command is redacted rather than trusted', () => {
  assert.strictEqual(Redact.shouldRedact(null, []), true);
  assert.strictEqual(Redact.shouldRedact(undefined, []), true);
  assert.strictEqual(Redact.shouldRedact(42, []), true);
  assert.strictEqual(Redact.shouldRedact('', []), true);
});

test('REDACTION IS ALL OR NOTHING -- the answer is a boolean, never a string', () => {
  // Truncating a secret still stores part of it, and a partially stored
  // command is both useless as a suggestion and dangerous on disk.
  assert.strictEqual(typeof Redact.shouldRedact('API_KEY=x ls', []), 'boolean');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recall-redact.test.js`
Expected: FAIL with "Cannot find module '../src/main/recall-redact.js'"

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * The one question asked before anything reaches disk: may this command be
 * written down?
 *
 * This lives apart from the store because it is the module where a mistake
 * leaks a secret. It has no filesystem access and no dependencies, so it can
 * be reviewed and tested in isolation.
 *
 * The answer is a boolean, never a redacted string. Truncating a secret still
 * stores part of it, and a partially stored command is useless as a suggestion
 * anyway. Recording a shell history is a genuinely sensitive act and the
 * default is conservative.
 *
 * Over-redaction is not free either: `git show a1b2c3d` is exactly the kind of
 * command this feature exists to suggest, so short hex is deliberately kept.
 */

const PATTERNS = [
  // VAR=value where the name looks secret-ish.
  /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*\s*=/i,
  // --password / --token / --api-key / --secret, value in either form.
  /(?:^|\s)--?(?:password|passwd|token|api[-_]?key|secret|credential)(?:[=\s]|$)/i,
  // Authorization headers, however they are spelled.
  /\bauthorization\s*:\s*(?:bearer|basic|token)\b/i,
  // A long high-entropy literal: 40+ chars of base64/hex alphabet in one run.
  /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/,
];

/**
 * Compile user-supplied patterns, discarding any that will not compile.
 *
 * A bad regex in a settings file must not break recording, and must certainly
 * not throw during a PTY write.
 */
function compilePatterns(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (entry instanceof RegExp) { out.push(entry); continue; }
    if (typeof entry !== 'string' || !entry) continue;
    try {
      out.push(new RegExp(entry, 'i'));
    } catch {
      // An unparseable pattern is ignored, exactly as an unknown settings key is.
    }
  }
  return out;
}

/** True when this command must never be written down. */
function shouldRedact(cmd, extraPatterns) {
  // Anything that is not a real command string is refused rather than trusted.
  if (typeof cmd !== 'string' || cmd.trim() === '') return true;

  for (const pattern of PATTERNS) {
    if (pattern.test(cmd)) return true;
  }

  const extra = Array.isArray(extraPatterns) ? extraPatterns : [];
  for (const pattern of extra) {
    if (pattern instanceof RegExp && pattern.test(cmd)) return true;
  }

  return false;
}

module.exports = { shouldRedact, compilePatterns, PATTERNS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recall-redact.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/recall-redact.js test/recall-redact.test.js
git commit -m "Decide what may be written down, before anything is"
```

---

## Task 5: The store

**Files:**
- Create: `src/main/recall-store.js`
- Test: `test/recall-store.test.js`

**Interfaces:**
- Consumes: `Redact.shouldRedact`, `Redact.compilePatterns` from Task 4.
- Produces: `new Store.RecallStore({ file, maxEntries, excludePatterns })` with `load()`, `record(entry) -> boolean`, `candidates() -> Array`, `compact()`, `size()`; and `Store.fingerprintFor(names) -> string[]`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Store = require('../src/main/recall-store.js');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'josh-recall-')), 'recall.jsonl');
}

const entry = (over) => Object.assign(
  { cmd: 'ls', cwd: '/p', fp: ['git'], exit: 0, ms: 12, ts: 1756022400 }, over || {}
);

test('a recorded command can be read back', () => {
  const s = new Store.RecallStore({ file: tmpFile() });
  assert.strictEqual(s.record(entry({ cmd: 'cargo test' })), true);
  assert.strictEqual(s.candidates()[0].cmd, 'cargo test');
});

test('records survive a reload from disk', () => {
  const file = tmpFile();
  new Store.RecallStore({ file }).record(entry({ cmd: 'npm run build' }));
  const b = new Store.RecallStore({ file });
  b.load();
  assert.strictEqual(b.candidates()[0].cmd, 'npm run build');
});

test('THE FILE IS 0600', () => {
  // The store is a shell history. Its mode is part of the threat model.
  const file = tmpFile();
  new Store.RecallStore({ file }).record(entry());
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
});

test('A REDACTED COMMAND NEVER REACHES DISK', () => {
  const file = tmpFile();
  const s = new Store.RecallStore({ file });
  assert.strictEqual(s.record(entry({ cmd: 'API_KEY=secret123 deploy' })), false);
  assert.strictEqual(s.size(), 0);
  const onDisk = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  assert.doesNotMatch(onDisk, /secret123/);
  assert.doesNotMatch(onDisk, /API_KEY/);
});

test('a user exclude pattern keeps its matches off disk', () => {
  const s = new Store.RecallStore({ file: tmpFile(), excludePatterns: ['internal-tool'] });
  assert.strictEqual(s.record(entry({ cmd: 'internal-tool deploy' })), false);
  assert.strictEqual(s.record(entry({ cmd: 'ls' })), true);
});

test('each record is one line of JSON carrying a schema version', () => {
  const file = tmpFile();
  const s = new Store.RecallStore({ file });
  s.record(entry({ cmd: 'ls' }));
  s.record(entry({ cmd: 'pwd' }));
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(JSON.parse(lines[0]).v, 1);
  assert.strictEqual(JSON.parse(lines[0]).cmd, 'ls');
});

test('A CORRUPT LINE IS SKIPPED RATHER THAN FAILING THE LOAD', () => {
  // The file is plain text on disk. A half-written line after a crash must not
  // cost the user their entire history.
  const file = tmpFile();
  fs.writeFileSync(file, '{"v":1,"cmd":"ls"}\nnot json at all\n{"v":1,"cmd":"pwd"}\n', { mode: 0o600 });
  const s = new Store.RecallStore({ file });
  s.load();
  assert.deepStrictEqual(s.candidates().map((c) => c.cmd), ['ls', 'pwd']);
});

test('a missing file loads as an empty store, not an error', () => {
  const s = new Store.RecallStore({ file: path.join(os.tmpdir(), 'josh-nope', 'x.jsonl') });
  s.load();
  assert.strictEqual(s.size(), 0);
});

test('compaction keeps the store within its cap', () => {
  const s = new Store.RecallStore({ file: tmpFile(), maxEntries: 10 });
  for (let i = 0; i < 25; i++) s.record(entry({ cmd: 'cmd' + i, ts: 1756022400 + i }));
  s.compact();
  assert.ok(s.size() <= 10, 'size was ' + s.size());
});

test('compaction keeps the most recent records', () => {
  const s = new Store.RecallStore({ file: tmpFile(), maxEntries: 5 });
  for (let i = 0; i < 20; i++) s.record(entry({ cmd: 'cmd' + i, ts: 1756022400 + i }));
  s.compact();
  assert.ok(s.candidates().map((c) => c.cmd).includes('cmd19'), 'the newest must survive');
});

test('a fingerprint names the ecosystems a directory belongs to', () => {
  assert.deepStrictEqual(
    Store.fingerprintFor(['package.json', '.git', 'README.md']).sort(), ['git', 'npm']
  );
  assert.deepStrictEqual(Store.fingerprintFor(['Cargo.toml']), ['cargo']);
  assert.deepStrictEqual(Store.fingerprintFor([]), []);
});

test('an unknown directory has an empty fingerprint rather than a guess', () => {
  assert.deepStrictEqual(Store.fingerprintFor(['notes.txt', 'photo.jpg']), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recall-store.test.js`
Expected: FAIL with "Cannot find module '../src/main/recall-store.js'"

- [ ] **Step 3: Write the implementation**

Write `src/main/recall-store.js` as a CommonJS module containing:

- A module docstring stating that this is a shell history on disk, that `0600` and redaction-before-write are both part of the threat model, and that a corrupt line costs one record rather than the file.
- `const SCHEMA = 1;`, `const FILE_MODE = 0o600;`, `const DIR_MODE = 0o700;`
- `MARKERS`, a frozen map of marker filename to ecosystem tag covering at least: `package.json`→`npm`, `Cargo.toml`→`cargo`, `.git`→`git`, `go.mod`→`go`, `pyproject.toml` and `requirements.txt`→`python`, `Gemfile`→`ruby`, `pom.xml` and `build.gradle`→`java`, `Makefile`→`make`, `CMakeLists.txt`→`cmake`, `Dockerfile`→`docker`.
- `fingerprintFor(names)` — map through `MARKERS`, dedupe, sort, return `[]` for anything unrecognised. Never guesses.
- `class RecallStore`:
  - `constructor({ file, maxEntries = 50000, excludePatterns = [] })`, storing `this.patterns = Redact.compilePatterns(excludePatterns)` and `this.entries = []`.
  - `load()` — read the file if present, split on newline, `JSON.parse` each line inside its own `try` and skip failures, keep records whose `v` this build understands. A missing file, an unreadable file, and a non-existent parent directory all yield an empty store, never a throw.
  - `record(entry)` — call `Redact.shouldRedact(entry.cmd, this.patterns)` **first** and return `false` immediately if it says so, without touching the filesystem at all. Otherwise create the parent directory with `{ recursive: true, mode: DIR_MODE }`, append one JSON line with `{ v: SCHEMA, ts, cmd, cwd, fp, exit, ms }` using `{ mode: FILE_MODE }` so the file is never briefly world-readable, push onto `this.entries`, and return `true`. Call `compact()` when `this.entries.length > this.maxEntries * 1.2`, so compaction is amortised rather than running on every write.
  - `candidates()` returns `this.entries`; `size()` returns its length.
  - `compact()` — keep the most recent `maxEntries` records, breaking ties toward commands that appear more often, then rewrite atomically: write a sibling temp file with `{ mode: FILE_MODE }` and `fs.renameSync` over the original, matching the discipline already in `settings.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recall-store.test.js`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/recall-store.js test/recall-store.test.js
git commit -m "Keep a shell history that is bounded, private and survives corruption"
```

---

## Task 6: Ranking

**Files:**
- Create: `src/main/recall-rank.js`
- Test: `test/recall-rank.test.js`

**Interfaces:**
- Consumes: nothing. **Pure** — no filesystem, no Electron, no clock; `now` is passed in.
- Produces: `Rank.rank(candidates, { prefix, cwd, fingerprint, now }) -> [{cmd, score}]` best first, and `Rank.best(candidates, context) -> string | null` returning the text after `prefix`, or null for silence.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Rank = require('../src/main/recall-rank.js');

const NOW = 1756022400;
const HOUR = 3600;

const c = (over) => Object.assign(
  { cmd: 'ls', cwd: '/p', fp: ['git'], exit: 0, ms: 10, ts: NOW - HOUR }, over || {}
);
const ctx = (over) => Object.assign(
  { prefix: '', cwd: '/p', fingerprint: ['git'], now: NOW }, over || {}
);

test('only commands matching the prefix are returned', () => {
  const out = Rank.rank([c({ cmd: 'cargo test' }), c({ cmd: 'ls -la' })], ctx({ prefix: 'car' }));
  assert.deepStrictEqual(out.map((r) => r.cmd), ['cargo test']);
});

test('the prefix match is case-sensitive, because commands are', () => {
  assert.deepStrictEqual(Rank.rank([c({ cmd: 'Cargo' })], ctx({ prefix: 'car' })), []);
});

test('a command identical to the prefix is not offered', () => {
  // There is nothing left to suggest, and the ghost text would be empty.
  assert.deepStrictEqual(Rank.rank([c({ cmd: 'ls' })], ctx({ prefix: 'ls' })), []);
});

test('LOCALITY: the same directory outranks a fingerprint match', () => {
  const here = c({ cmd: 'cargo test --here', cwd: '/p' });
  const similar = c({ cmd: 'cargo test --elsewhere', cwd: '/other', fp: ['git'] });
  assert.strictEqual(Rank.rank([similar, here], ctx({ prefix: 'cargo' }))[0].cmd, 'cargo test --here');
});

test('LOCALITY: a fingerprint match outranks an unrelated directory', () => {
  const similar = c({ cmd: 'cargo a', cwd: '/other', fp: ['git'] });
  const unrelated = c({ cmd: 'cargo b', cwd: '/far', fp: [] });
  assert.strictEqual(Rank.rank([unrelated, similar], ctx({ prefix: 'cargo' }))[0].cmd, 'cargo a');
});

test('OUTCOME: a fresher failure must not beat an older success', () => {
  const worked = c({ cmd: 'cargo test --lib', exit: 0 });
  const failed = c({ cmd: 'cargo test --all', exit: 101, ts: NOW - 60 });
  assert.strictEqual(Rank.rank([failed, worked], ctx({ prefix: 'cargo' }))[0].cmd, 'cargo test --lib');
});

test('RECENCY: the more recent of two equals wins', () => {
  const old = c({ cmd: 'npm run old', ts: NOW - HOUR * 24 * 30 });
  const fresh = c({ cmd: 'npm run fresh', ts: NOW - 60 });
  assert.strictEqual(Rank.rank([old, fresh], ctx({ prefix: 'npm' }))[0].cmd, 'npm run fresh');
});

test('FREQUENCY: repetition helps, but sublinearly', () => {
  // One habit must not drown everything else: twenty repeats of a stale,
  // far-away command should not beat a fresh, local, successful one.
  const many = [];
  for (let i = 0; i < 20; i++) {
    many.push(c({ cmd: 'npm run stale', cwd: '/far', fp: [], ts: NOW - HOUR * 24 * 60 }));
  }
  const fresh = c({ cmd: 'npm run fresh', cwd: '/p', ts: NOW - 60 });
  assert.strictEqual(Rank.rank(many.concat([fresh]), ctx({ prefix: 'npm' }))[0].cmd, 'npm run fresh');
});

test('duplicates collapse to one entry', () => {
  assert.strictEqual(Rank.rank([c({ cmd: 'ls -la' }), c({ cmd: 'ls -la' })], ctx({ prefix: 'ls' })).length, 1);
});

test('REPAIR PAIRS: typing the form that failed suggests the form that worked', () => {
  // The single most valuable signal in the whole ranking function.
  const failed = c({ cmd: 'git push origin main', exit: 128, ts: NOW - 300 });
  const fixed = c({ cmd: 'git push --set-upstream origin main', exit: 0, ts: NOW - 290 });
  const out = Rank.rank([failed, fixed], ctx({ prefix: 'git push' }));
  assert.strictEqual(out[0].cmd, 'git push --set-upstream origin main');
});

test('best() returns only the text after the prefix', () => {
  assert.strictEqual(Rank.best([c({ cmd: 'cargo test --release' })], ctx({ prefix: 'cargo ' })), 'test --release');
});

test('best() is null when nothing matches', () => {
  assert.strictEqual(Rank.best([c({ cmd: 'ls' })], ctx({ prefix: 'xyz' })), null);
});

test('BEST() IS NULL FOR AN EMPTY PREFIX', () => {
  // With nothing typed there is no evidence to rank on, and ghost text
  // appearing on a bare prompt is startling rather than helpful.
  assert.strictEqual(Rank.best([c({ cmd: 'ls' })], ctx({ prefix: '' })), null);
});

test('best() is null when the prefix is unknown', () => {
  assert.strictEqual(Rank.best([c({ cmd: 'ls' })], ctx({ prefix: null })), null);
});

test('ranking is pure: it never reads the clock itself', () => {
  const candidates = [c({ cmd: 'ls -la' })];
  assert.deepStrictEqual(
    Rank.rank(candidates, ctx()).map((r) => r.score),
    Rank.rank(candidates, ctx()).map((r) => r.score)
  );
});

test('an empty candidate list ranks to nothing', () => {
  assert.deepStrictEqual(Rank.rank([], ctx({ prefix: 'x' })), []);
  assert.strictEqual(Rank.best([], ctx({ prefix: 'x' })), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recall-rank.test.js`
Expected: FAIL with "Cannot find module '../src/main/recall-rank.js'"

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * Pure scoring over recorded commands.
 *
 * No filesystem, no Electron, no clock -- `now` is passed in. Purity is what
 * makes the interesting behaviour testable, matching how validate.js,
 * split-tree.js and shell-resolver.js are already structured here.
 *
 * The weights are judgements, not measurements, and are grouped in one place
 * so they can be tuned once there is real usage to tune against.
 */

const WEIGHT = Object.freeze({
  sameDirectory: 3.0,
  sameFingerprint: 1.5,
  succeeded: 1.0,
  failed: -4.0,      // heavily demoted: suggesting a known-broken command is worse than silence
  frequency: 0.8,    // multiplied by log(1 + count), so habits do not drown everything
  repair: 5.0,       // the strongest signal there is: it demonstrably fixed this
  recencyHalfLife: 60 * 60 * 24 * 7, // one week
});

const REPAIR_WINDOW = 600; // ten minutes

/** How close two commands are, used only to pair a failure with its fix. */
function looksLikeRepairOf(fixed, failed) {
  if (fixed === failed) return false;
  const a = failed.split(/\s+/);
  const b = fixed.split(/\s+/);
  if (!a.length || !b.length) return false;
  // Same program, and the fix keeps most of what the failure said.
  if (a[0] !== b[0]) return false;
  const shared = a.filter((word) => b.includes(word)).length;
  return shared >= Math.max(1, Math.floor(a.length / 2));
}

/** Rank candidates for the line being typed, best first. */
function rank(candidates, context) {
  const ctx = context || {};
  const prefix = typeof ctx.prefix === 'string' ? ctx.prefix : null;
  if (prefix === null || !Array.isArray(candidates)) return [];

  const now = typeof ctx.now === 'number' ? ctx.now : 0;
  const cwd = ctx.cwd || null;
  const fingerprint = Array.isArray(ctx.fingerprint) ? ctx.fingerprint : [];

  // A failure followed shortly by a similar success is the strongest evidence
  // in the store: the second command demonstrably fixed the first.
  const repaired = new Set();
  for (const failure of candidates) {
    if (!failure || failure.exit === 0) continue;
    for (const fix of candidates) {
      if (!fix || fix.exit !== 0) continue;
      const gap = fix.ts - failure.ts;
      if (gap < 0 || gap > REPAIR_WINDOW) continue;
      if (looksLikeRepairOf(fix.cmd, failure.cmd)) repaired.add(fix.cmd);
    }
  }

  const counts = new Map();
  for (const entry of candidates) {
    if (entry && typeof entry.cmd === 'string') {
      counts.set(entry.cmd, (counts.get(entry.cmd) || 0) + 1);
    }
  }

  const best = new Map();
  for (const entry of candidates) {
    if (!entry || typeof entry.cmd !== 'string') continue;
    // Only a strict extension of what is typed can be a suggestion.
    if (!entry.cmd.startsWith(prefix) || entry.cmd.length === prefix.length) continue;

    let score = 0;
    if (cwd && entry.cwd === cwd) {
      score += WEIGHT.sameDirectory;
    } else if (fingerprint.length && Array.isArray(entry.fp) &&
               entry.fp.some((tag) => fingerprint.includes(tag))) {
      score += WEIGHT.sameFingerprint;
    }

    score += entry.exit === 0 ? WEIGHT.succeeded : WEIGHT.failed;
    score += WEIGHT.frequency * Math.log(1 + (counts.get(entry.cmd) || 1));
    score += Math.pow(2, -((now - entry.ts) / WEIGHT.recencyHalfLife));
    if (repaired.has(entry.cmd)) score += WEIGHT.repair;

    const previous = best.get(entry.cmd);
    if (!previous || score > previous.score) best.set(entry.cmd, { cmd: entry.cmd, score });
  }

  return [...best.values()].sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd));
}

/**
 * The text to show after the cursor, or null for silence.
 *
 * An empty prefix returns null on purpose: with nothing typed there is no
 * evidence to rank on, and ghost text on a bare prompt is startling rather
 * than helpful. A non-positive score is also silence -- it means the best
 * candidate is a command that failed.
 */
function best(candidates, context) {
  const ctx = context || {};
  if (typeof ctx.prefix !== 'string' || ctx.prefix === '') return null;
  const ranked = rank(candidates, ctx);
  if (!ranked.length || ranked[0].score <= 0) return null;
  return ranked[0].cmd.slice(ctx.prefix.length);
}

module.exports = { rank, best, WEIGHT, REPAIR_WINDOW, looksLikeRepairOf };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recall-rank.test.js`
Expected: PASS, 16 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/recall-rank.js test/recall-rank.test.js
git commit -m "Score what worked, where it worked, and what fixed what"
```

---

## Task 7: Settings

**Files:**
- Modify: `src/main/settings.js` — `DEFAULTS`, `NUMERIC_RANGES`, a `recallExcludePatterns` branch in `coerce`, and the integer fixups
- Test: `test/recall-settings.test.js`

**Interfaces:**
- Produces: `recall` (bool, `true`), `recallInlineSuggest` (bool, `true`), `recallExcludePatterns` (string array, `[]`, capped at 64 entries of 512 chars), `recallMaxEntries` (number, `50000`, clamped `[100, 1000000]`).

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { coerce, DEFAULTS } = require('../src/main/settings.js');

test('recall and inline suggestion default on', () => {
  assert.strictEqual(DEFAULTS.recall, true);
  assert.strictEqual(DEFAULTS.recallInlineSuggest, true);
});

test('the exclude list defaults empty and the cap defaults to fifty thousand', () => {
  assert.deepStrictEqual(DEFAULTS.recallExcludePatterns, []);
  assert.strictEqual(DEFAULTS.recallMaxEntries, 50000);
});

test('the switches accept booleans and reject anything else', () => {
  assert.strictEqual(coerce({ recall: false }).recall, false);
  assert.strictEqual(coerce({ recall: 'yes' }).recall, true);
  assert.strictEqual(coerce({ recallInlineSuggest: false }).recallInlineSuggest, false);
});

test('the entry cap is clamped and kept an integer', () => {
  assert.strictEqual(coerce({ recallMaxEntries: 1 }).recallMaxEntries, 100);
  assert.strictEqual(coerce({ recallMaxEntries: 99999999 }).recallMaxEntries, 1000000);
  assert.strictEqual(coerce({ recallMaxEntries: 500.6 }).recallMaxEntries, 501);
  assert.strictEqual(coerce({ recallMaxEntries: 'lots' }).recallMaxEntries, 50000);
});

test('exclude patterns keep only non-empty strings', () => {
  assert.deepStrictEqual(
    coerce({ recallExcludePatterns: ['secret', 42, null, '', 'internal'] }).recallExcludePatterns,
    ['secret', 'internal']
  );
});

test('a non-array exclude list falls back to the default', () => {
  assert.deepStrictEqual(coerce({ recallExcludePatterns: 'secret' }).recallExcludePatterns, []);
});

test('the exclude list is capped in both count and length', () => {
  assert.strictEqual(coerce({ recallExcludePatterns: new Array(200).fill('x') }).recallExcludePatterns.length, 64);
  assert.ok(coerce({ recallExcludePatterns: ['y'.repeat(5000)] }).recallExcludePatterns[0].length <= 512);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recall-settings.test.js`
Expected: FAIL — `undefined !== true`

- [ ] **Step 3: Write the implementation**

In `DEFAULTS`, after the Shell Kit block:

```js
  // Recall. On by default: the store is local, 0600 and redacted before any
  // write, and a terminal that cannot learn from what you already ran is the
  // status quo this feature exists to change.
  recall: true,
  recallInlineSuggest: true,
  recallExcludePatterns: [],
  recallMaxEntries: 50000,
```

In `NUMERIC_RANGES`:

```js
  recallMaxEntries: [100, 1000000],
```

In `coerce`, beside the `shellKitGitSkip` branch:

```js
    if (key === 'recallExcludePatterns') {
      if (Array.isArray(value)) {
        out.recallExcludePatterns = value
          .filter((pattern) => typeof pattern === 'string' && pattern.length > 0)
          .map((pattern) => pattern.slice(0, 512))
          .slice(0, 64);
      }
      continue;
    }
```

and beside the existing integer fixups at the end of `coerce`:

```js
  out.recallMaxEntries = Math.round(out.recallMaxEntries);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recall-settings.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js test/recall-settings.test.js
git commit -m "Add the four Recall settings, coerced like every other"
```

---

## Task 8: Suggestion sanitisation at the trust boundary

**Files:**
- Modify: `src/main/validate.js` — `LIMITS`, `sanitizeSuggestion`, exports
- Modify: `src/preload/preload.js` — `EVENT_CHANNELS` only
- Test: `test/recall-ipc.test.js`

**Interfaces:**
- Produces: `Validate.sanitizeSuggestion(value) -> string`, and `recall:suggestion` on the event allowlist. **No invoke channel is added.**

- [ ] **Step 1: Write the failing test**

Control bytes are built with `String.fromCharCode` rather than written as literals, so the test file itself stays free of them.

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Validate = require('../src/main/validate.js');

const PRELOAD = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preload', 'preload.js'), 'utf8'
);

const ch = (code) => String.fromCharCode(code);
const ESC = ch(27);
const NUL = ch(0);
const BEL = ch(7);
const LF = ch(10);
const DEL = ch(127);

test('ordinary suggestion text passes through', () => {
  assert.strictEqual(Validate.sanitizeSuggestion('test --release'), 'test --release');
});

test('CONTROL CHARACTERS ARE STRIPPED', () => {
  // Suggestion text derives from previously executed commands. A historical
  // command carrying an escape sequence must not be able to paint the UI.
  assert.strictEqual(Validate.sanitizeSuggestion('ls' + ESC + '[31m'), 'ls[31m');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + NUL + 'b'), 'ab');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + LF + 'b'), 'ab');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + BEL + 'b'), 'ab');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + DEL + 'b'), 'ab');
});

test('every C0 control byte is removed', () => {
  for (let code = 0; code < 32; code++) {
    assert.strictEqual(Validate.sanitizeSuggestion('a' + ch(code) + 'b'), 'ab',
      'control ' + code + ' must be stripped');
  }
});

test('the length is clamped', () => {
  assert.ok(Validate.sanitizeSuggestion('x'.repeat(10000)).length <= 512);
});

test('a non-string suggestion becomes the empty string, never undefined', () => {
  assert.strictEqual(Validate.sanitizeSuggestion(null), '');
  assert.strictEqual(Validate.sanitizeSuggestion(undefined), '');
  assert.strictEqual(Validate.sanitizeSuggestion({}), '');
});

test('the suggestion event is on the preload event allowlist', () => {
  assert.match(PRELOAD, /'recall:suggestion'/);
});

test('RECALL ADDS NO INVOKE CHANNEL', () => {
  // The whole design turns on main pushing suggestions rather than the
  // renderer asking for them. If this count moves, that property was lost.
  const block = /const INVOKE_CHANNELS = new Set\(\[([\s\S]*?)\]\)/.exec(PRELOAD);
  assert.ok(block, 'INVOKE_CHANNELS must be declarable');
  const count = (block[1].match(/'[^']+'/g) || []).length;
  assert.strictEqual(count, 16, 'invoke channels must stay at 16, got ' + count);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recall-ipc.test.js`
Expected: FAIL with "Validate.sanitizeSuggestion is not a function"

- [ ] **Step 3: Write the implementation**

In `validate.js`, add `MAX_SUGGESTION: 512` to `LIMITS`, then add `sanitizeSuggestion` directly beside `sanitizeTitle`.

**Reuse `sanitizeTitle`'s existing character class verbatim** — the escaped C0-plus-DEL range it already applies, together with its `eslint-disable-next-line no-control-regex` comment. Do not retype the class as literal bytes; copy the line from `sanitizeTitle` and change only the limit it clamps to:

```js
/**
 * Suggestion text derives from previously executed commands, so it is data,
 * not something safe to hand a renderer verbatim. A historical command
 * carrying an escape sequence must not be able to paint the UI.
 *
 * Same character class as sanitizeTitle, a different clamp. Both exist because
 * OSC-supplied text reaches the UI from outside Josh's control.
 */
function sanitizeSuggestion(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').slice(0, LIMITS.MAX_SUGGESTION);
}
```

Hoist that shared class to a module-level `CONTROL_CHARS` constant and have `sanitizeTitle` use it too, so the two cannot drift apart. `sanitizeTitle`'s behaviour must not change — `test/validate.test.js` already covers it and must still pass.

Add `sanitizeSuggestion` to the exports. In `preload.js`, add `'recall:suggestion'` to `EVENT_CHANNELS` **only** — `INVOKE_CHANNELS` is untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recall-ipc.test.js test/validate.test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Run the full suite** — `test/ipc-contract.test.js` asserts the preload contract and must still pass.

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add src/main/validate.js src/preload/preload.js test/recall-ipc.test.js
git commit -m "Push suggestions across the boundary as data, and only as data"
```

---

## Task 9: Shell hooks that carry the nonce

**Files:**
- Modify: `src/main/shell-integration.js`
- Test: `test/recall-hooks.test.js`

**Interfaces:**
- Consumes: `Parser.makeNonce` from Task 1.
- Produces: `Integration.recallSnippet(dialect, nonce) -> string`, and `build()` gains a `recall` option threading the nonce into the generated files and setting `JOSH_RECALL_NONCE`.

**This module is shared with the Shell Kit.** Every existing `kit-*` test must still pass; Recall adds to what is generated and removes nothing.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Integration = require('../src/main/shell-integration.js');

const N = 'a'.repeat(32);
const DIALECTS = ['zsh', 'bash', 'fish', 'pwsh'];

test('every supported dialect produces a snippet', () => {
  for (const dialect of DIALECTS) {
    assert.ok(Integration.recallSnippet(dialect, N).length > 0, dialect);
  }
});

test('THE NONCE APPEARS IN EVERY EMITTED SEQUENCE', () => {
  // A sequence without the nonce is ignored by the parser, so a dialect that
  // forgets it silently disables Recall for that shell -- with no error,
  // because "disabled for this session" is a legitimate state.
  for (const dialect of DIALECTS) {
    const snippet = Integration.recallSnippet(dialect, N);
    const markers = snippet.match(/133;[ABCD]/g) || [];
    assert.ok(markers.length >= 2, dialect + ' must emit at least prompt and command markers');
    const nonces = snippet.match(new RegExp('nonce=' + N, 'g')) || [];
    assert.ok(nonces.length >= markers.length,
      dialect + ' emits ' + markers.length + ' markers but only ' + nonces.length + ' nonces');
  }
});

test('AN UNSUPPORTED DIALECT PRODUCES NOTHING RATHER THAN A GUESS', () => {
  // Where integration cannot be established, Recall is disabled for the
  // session. Heuristic prompt detection is exactly the fragile inference this
  // design refuses.
  assert.strictEqual(Integration.recallSnippet('cmd', N), '');
  assert.strictEqual(Integration.recallSnippet('nonsense', N), '');
});

test('a missing nonce produces nothing', () => {
  assert.strictEqual(Integration.recallSnippet('zsh', ''), '');
  assert.strictEqual(Integration.recallSnippet('zsh', null), '');
});

test('the zsh snippet uses precmd and preexec', () => {
  const snippet = Integration.recallSnippet('zsh', N);
  assert.match(snippet, /precmd/);
  assert.match(snippet, /preexec/);
});

test('THE BASH SNIPPET INSTALLS A DEBUG TRAP, NOT AN RCFILE', () => {
  // Josh starts login shells and --rcfile is ignored for those. That
  // constraint dictates the whole bash mechanism.
  assert.match(Integration.recallSnippet('bash', N), /trap[\s\S]*DEBUG/);
});

test('the fish snippet uses the documented event names', () => {
  const snippet = Integration.recallSnippet('fish', N);
  assert.match(snippet, /fish_preexec/);
  assert.match(snippet, /fish_postexec/);
});

test('the command text is sent percent-encoded, not raw', () => {
  // A command containing a semicolon would otherwise split the sequence and
  // desynchronise the parser.
  for (const dialect of DIALECTS) {
    assert.match(Integration.recallSnippet(dialect, N), /cmd=/, dialect);
  }
});

test('the exit code is emitted with the D marker', () => {
  for (const dialect of DIALECTS) {
    assert.match(Integration.recallSnippet(dialect, N), /133;D/, dialect);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recall-hooks.test.js`
Expected: FAIL with "Integration.recallSnippet is not a function"

- [ ] **Step 3: Write the implementation**

Add `recallSnippet(dialect, nonce)`, returning the empty string for any dialect outside the table and for an absent nonce. Per dialect:

- **zsh** — a `precmd` capturing the exit status as its very first statement, before anything can clobber it, emitting `D` with that code and then `A` and `B`; a `preexec` emitting `C` with the percent-encoded first argument.
- **bash** — emitted through the inherited `PROMPT_COMMAND` the Shell Kit already relies on, since `--rcfile` is ignored for login shells. `PROMPT_COMMAND` captures the status first, emits `D`, then `A` and `B`; a `DEBUG` trap emits `C` with `BASH_COMMAND`.
- **fish** — `function __josh_preexec --on-event fish_preexec` emitting `C`, and an `--on-event fish_postexec` handler emitting `D` with `status`; the prompt markers hang off `fish_prompt`.
- **pwsh** — a wrapped `prompt` emitting `D` with `LASTEXITCODE` and then `A` and `B`, with `C` emitted from a `PSConsoleHostReadLine` wrapper.

Percent-encoding must happen **in the shell**, so a command containing a semicolon cannot split the sequence. Use each shell's own facility rather than shelling out: a small `printf` loop over unsafe bytes for zsh and bash, `string escape --style=url` for fish, `[uri]::EscapeDataString` for PowerShell.

Then thread it through `build()`: accept `recall` in the options object and, when it is a non-empty nonce string, append the dialect's snippet to the file the Shell Kit already generates and set `JOSH_RECALL_NONCE` in the returned `env`. When `settings.recall !== true`, or the dialect is unsupported, append nothing and set no variable.

**`build()` currently returns null the moment `settings.shellKit !== true`.** Recall must work with the Shell Kit off, so that early return has to become a check that *both* features are off before standing down. This is the one place the two features genuinely interact.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recall-hooks.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Prove the Shell Kit did not regress**

Run: `node --test test/kit-emit.test.js test/kit-spawn.test.js test/kit-e2e.test.js test/shell-integration.test.js`
Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add src/main/shell-integration.js test/recall-hooks.test.js
git commit -m "Teach five shells to announce where the prompt begins"
```

---

## Task 10: Wire Recall into the PTY path

**Files:**
- Modify: `src/main/pty-manager.js`, `src/main/main.js`
- Test: `test/recall-session.test.js`

**Interfaces:**
- Consumes: Tasks 1-9.
- Produces: a per-session Recall record inside `PtyManager`, and an `onSuggestion(windowId, sessionId, text)` handler alongside `onData` / `onExit` / `onCwd`.

- [ ] **Step 1: Extend the constructor**

Accept `onSuggestion`, `recallStore` and `recallSettings` alongside the existing handlers, defaulting `onSuggestion` to a no-op exactly as the others do. The store is **injected**, not constructed here, so `pty-manager.js` stays free of Electron and of `app.getPath` — the same reason `binDir` is already injected.

- [ ] **Step 2: Mint a nonce per session**

In `create()`, when `settings.recall === true` and the shell's dialect is supported, call `Parser.makeNonce()`, pass it as `ShellIntegration.build({ recall: nonce, ... })`, and set:

```js
      record.recall = {
        nonce,
        state: Parser.createSession(nonce),
        tracker: InputTracker.create(),
        pending: null,        // the C event awaiting its D
        fingerprint: [],      // cached per cwd, so there is no fs call per command
        fingerprintFor: null, // the cwd that fingerprint was computed for
      };
```

Otherwise `record.recall = null` — Recall is disabled for that session, with no heuristic fallback.

- [ ] **Step 3: Scan output in the existing data path**

Beside the `OSC7_HINT` guard in `_onData`, add the same shape — cheap substring guard first, because this runs on every output chunk:

```js
      if (record.recall && chunk.indexOf(Parser.HINT) !== -1) {
        for (const event of Parser.scan(record.recall.state, chunk)) {
          this._onRecallEvent(record, event);
        }
      }
```

- [ ] **Step 4: Handle the four events**

`_onRecallEvent(record, event)`:
- `A` — nothing beyond the transition the parser already made.
- `B` — `record.recall.tracker.reset()`, and push an empty suggestion so the renderer clears.
- `C` — `record.recall.pending = { cmd: event.cmd, startedAt: Date.now() }`.
- `D` — when a `C` is pending, refresh the cached fingerprint if `record.cwd` has changed since `fingerprintFor`, then call `this.recallStore.record({ cmd, cwd: record.cwd, fp: record.recall.fingerprint, exit: event.exit, ms: Date.now() - startedAt, ts: Math.floor(Date.now() / 1000) })` and clear `pending`.

- [ ] **Step 5: Feed the tracker from the write path**

In `write()`, before forwarding to the PTY, call `record.recall.tracker.consume(data)` when Recall is active, then recompute: `Rank.best(this.recallStore.candidates(), { prefix: tracker.line(), cwd: record.cwd, fingerprint, now })`, pass the result through `Validate.sanitizeSuggestion`, and call `this.onSuggestion(...)` — including with the empty string, which is how the renderer is told to clear.

Emit **nothing at all** when `tracker.line()` is null, when `settings.recallInlineSuggest !== true`, or when `record.recall.state.phase !== 'input'`. A suggestion while a program is running would be nonsense.

- [ ] **Step 6: Wire the handler in main.js**

In `createPtyManager()`, beside the existing handlers:

```js
    onSuggestion: (windowId, sessionId, text) =>
      sendToWindow(windowId, 'recall:suggestion', { sessionId, text }),
```

- [ ] **Step 7: Write the test**

`test/recall-session.test.js` drives a `PtyManager` with a fake pty, following the approach the existing manager tests already use, and asserts:

- a session created with `recall: false` has no `record.recall` at all;
- forged sequences (wrong nonce) change nothing and record nothing;
- a full A/B/C/D cycle records exactly one store entry, with the right exit code;
- a command the redactor rejects records nothing;
- a suggestion is emitted only while the phase is `input`, never while `running`.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 9: Commit**

```bash
git add src/main/pty-manager.js src/main/main.js test/recall-session.test.js
git commit -m "Let a session learn from the commands it runs"
```

---

## Task 11: The ghost text overlay

**Files:**
- Create: `src/renderer/js/suggestion.js`
- Modify: `src/renderer/js/terminal-pane.js`, `src/renderer/index.html`, `src/renderer/css/app.css`
- Test: `test/suggestion.test.js`

**Interfaces:**
- Consumes: `recall:suggestion` events.
- Produces: `new Suggestion.Suggestion({ document, onAccept })` with `show(text)`, `clear()`, `accept() -> string`, `dismiss()`, `text()`; and `Suggestion.ACCEPT_KEYS`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Suggestion = require('../src/renderer/js/suggestion.js');

test('a shown suggestion is readable back', () => {
  const s = new Suggestion.Suggestion({});
  s.show('test --release');
  assert.strictEqual(s.text(), 'test --release');
});

test('an empty suggestion clears', () => {
  const s = new Suggestion.Suggestion({});
  s.show('x');
  s.show('');
  assert.strictEqual(s.text(), '');
});

test('accept returns the text and clears it', () => {
  const s = new Suggestion.Suggestion({});
  s.show('test --release');
  assert.strictEqual(s.accept(), 'test --release');
  assert.strictEqual(s.text(), '');
});

test('accepting nothing returns the empty string, never undefined', () => {
  assert.strictEqual(new Suggestion.Suggestion({}).accept(), '');
});

test('DISMISS SUPPRESSES UNTIL THE NEXT SHOW', () => {
  // Esc means "not now". It must not mean "never again this session".
  const s = new Suggestion.Suggestion({});
  s.show('one');
  s.dismiss();
  assert.strictEqual(s.text(), '');
  s.show('two');
  assert.strictEqual(s.text(), 'two');
});

test('a non-string suggestion is treated as a clear', () => {
  const s = new Suggestion.Suggestion({});
  s.show('x');
  s.show(null);
  assert.strictEqual(s.text(), '');
});

test('TAB IS NOT AN ACCEPT KEY', () => {
  // Tab belongs to the shell's own completion. Stealing it would break every
  // existing muscle memory.
  assert.ok(Suggestion.ACCEPT_KEYS.includes('ArrowRight'));
  assert.ok(Suggestion.ACCEPT_KEYS.includes('End'));
  assert.ok(!Suggestion.ACCEPT_KEYS.includes('Tab'), 'Tab must stay with the shell');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/suggestion.test.js`
Expected: FAIL with "Cannot find module '../src/renderer/js/suggestion.js'"

- [ ] **Step 3: Write the implementation**

A UMD module in the style of `split-tree.js`, whose state half is pure and whose DOM half is inert when no `document` is supplied — the arrangement the test suite already relies on elsewhere in this codebase.

`ACCEPT_KEYS` is the frozen array `['ArrowRight', 'End']`. `dismiss()` clears the text and sets a flag the next `show()` resets.

The overlay is absolutely positioned and aligned to the cursor cell, because the WebGL renderer draws to a canvas and the suggestion cannot be a terminal cell. It must be `pointer-events: none` so it never intercepts a click, and dim enough to read as text that has not been entered.

- [ ] **Step 4: Wire it into the pane**

Add the script tag before `terminal-pane.js`; construct a `Suggestion` in the pane; subscribe to `recall:suggestion`, filtering by `sessionId`; on `ArrowRight` or `End` while text is showing, `preventDefault()` and write the accepted text through the existing `pty:write` path — no new privileged capability is involved; on `Escape`, `dismiss()`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 6: Manually verify**

Run: `npm start`. In a zsh or bash pane, run a few commands, start typing one again, and confirm: dim ghost text appears, Right Arrow accepts it, Esc dismisses it, and **Tab still completes filenames exactly as it always did**.

Then confirm the store: `~/.config/josh/recall.jsonl` exists with mode `0600`. Run a command with a secret-shaped assignment and confirm it is **not** in the file.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/js/suggestion.js src/renderer/js/terminal-pane.js src/renderer/index.html src/renderer/css/app.css test/suggestion.test.js
git commit -m "Show what you probably meant, dimly, and only when sure"
```

---

## Task 12: Documentation

**Files:**
- Modify: `README.md`, `SECURITY.md`, `docs/design.md`

- [ ] **Step 1: Add the feature bullet and the four settings rows**

`recall`, `recallInlineSuggest`, `recallExcludePatterns` and `recallMaxEntries` in the settings table, and a Features bullet pointing at the new section.

- [ ] **Step 2: Add the README section**

In the README's voice: lead with the problem, show the behaviour, then state the limits. Cover, in order: what Recall observes and that it is authenticated by a per-session nonce; that the store is local, `0600`, and redacted **before** anything is written, naming the classes of command dropped entirely; the four settings and how to turn it off; the accept keys and that **Tab is untouched**; per-shell support including cmd.exe's prompt-marking-only limitation; and that where integration cannot be established Recall disables itself rather than guessing.

- [ ] **Step 3: Extend SECURITY.md**

State the nonce's guarantee and, just as plainly, its limit: it defends against untrusted *output*, not untrusted *execution*. Any program the user runs inherits the environment and can read the nonce — true of every terminal, and out of scope. Note the two mitigations: the `0600` store with redaction before write, and suggestion sanitisation at the boundary.

- [ ] **Step 4: Update the test count**

```bash
npm test 2>&1 | grep -E "^. (tests|pass|fail|skipped)"
```

- [ ] **Step 5: Commit**

```bash
git add README.md SECURITY.md docs/design.md
git commit -m "Document Recall, including what its nonce does not defend"
```

---

## Self-review of this plan

**This plan's code was executed before it was handed over.** The four pure modules — `semantic-parser.js`, `input-tracker.js`, `recall-redact.js`, `recall-rank.js` — were extracted from the code blocks above, assembled and run against the tests above: **67 tests, 67 passing**. Two properties were then fuzzed:

- **Marker survival:** a full A/B/C/D stream interleaved with ordinary output, fed in 5,000 randomly sized chunks — **zero markers lost**.
- **Forgery rejection:** crafted output carrying a wrong nonce and two absent ones, fed in 2,000 randomly sized chunks — **zero sequences accepted, and the phase never left idle**.

Two defects were found and fixed. Both are recorded because each was a design error, not a typo.

1. **The cheap substring guard destroyed any marker split across a read.** `scan` returned early when `chunk.indexOf(HINT) === -1`, discarding the chunk. A read ending on the single escape byte — common, because the pipe and not the shell decides where a read ends — dropped that byte, so the following chunk no longer contained a hint either and the marker vanished. Under small reads Recall would have recorded **nothing at all** while appearing to work perfectly: no error, no warning, just an empty store. `hintTail` now retains the longest suffix that could begin a hint, on both the early-return path and the loop's exit.

2. **The `0x08` backspace byte was treated as an unmodellable control.** Terminals disagree about what Backspace sends — most send DEL (`0x7f`), some send BS (`0x08`). Invalidating on `0x08` would make the tracker give up on every correction those terminals produce: a silent, permanent loss of suggestions for a subset of users. The explicit backspace branch now covers both bytes, and the test asserts that specifically rather than a blanket rule that was wrong.

**One spec deviation, deliberate.** The spec lists five modules, with redaction inside `recall-store.js`. This plan splits it into `src/main/recall-redact.js`. It is the module where a mistake leaks a secret, and it should be reviewable and testable with the filesystem nowhere near it.

**One integration risk, named because it is easy to get wrong.** `shell-integration.js` currently returns null the moment `settings.shellKit !== true`. Recall must work with the Shell Kit off, so Task 9 Step 3 changes that early return to stand down only when *both* features are off. Miss it and turning off the Shell Kit silently disables Recall — with no error, because "disabled for this session" is a legitimate state the design deliberately allows.

**Placeholder scan.** Tasks 1-4 and 6-8 carry complete implementations. Tasks 5 and 9-11 specify behaviour, structure and every constant rather than full source, each for a stated reason: Task 5 because the store is `fs` plumbing whose shape is already fixed by `settings.js`'s atomic-write discipline; Task 9 because five shell dialects are five languages and the snippets must be written against the real shells; Tasks 10-11 because they are edits threaded through existing files the implementer will have open anyway. Each names the exact file, the exact insertion point, and what its tests must assert.

**Type consistency.** `{ type, cmd, exit }` is produced by `parseSequence` (Task 1), returned by `scan` (Task 2) and consumed by `_onRecallEvent` (Task 10). `{ v, ts, cmd, cwd, fp, exit, ms }` is written by `record` (Task 5) and read by `rank` (Task 6). `rank(candidates, { prefix, cwd, fingerprint, now })` is defined in Task 6 and called with that signature in Task 10 Step 5. `tracker.line()` returning `string | null` is defined in Task 3 and its null case is honoured in Task 10 Step 5. `sanitizeSuggestion` is defined in Task 8 and applied in Task 10 Step 5. `ACCEPT_KEYS` is defined in Task 11 and used in the same task's wiring.

**What the tests deliberately pin.** Four assertions exist to stop a future change quietly removing a security or correctness property, each of which would otherwise fail *silently* — the feature would keep working while its guarantee was gone:

- nonce rejection, both missing and wrong (Task 1);
- the invoke-channel count staying at exactly 16 (Task 8);
- every dialect's markers carrying a nonce (Task 9);
- redaction returning a boolean rather than a truncated string (Task 4).

**What is still unproven.** The pure logic is verified; everything touching a real machine is not. The five shell snippets in Task 9 must be written and exercised against real zsh, bash, fish and pwsh — `kit-e2e.test.js` is the existing precedent for how. Task 10's PTY wiring and Task 11's DOM overlay rest on their own tests plus Task 11 Step 6's manual check. And the spec's own open question stands: per-keystroke ranking latency is unmeasured, and if it proves too slow at the top of `recallMaxEntries` the linear scan in `rank` needs a prefix trie. Worth measuring during Task 10 rather than designing for now.
