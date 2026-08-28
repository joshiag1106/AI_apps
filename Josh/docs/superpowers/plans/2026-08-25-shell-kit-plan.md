# Shell Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Josh's spawned shell a git-aware prompt, opt-in alias packs and configured completion, generated per session into a temporary directory, without writing to any user dotfile.

**Architecture:** A theme is data. Pure shared modules resolve its colours and glyphs; `kit-emit.js` turns it into zsh, bash or PowerShell 7 script text; `shell-integration.js` writes that text into a `0700` temp directory and hands `pty-manager.js` the environment and arguments to spawn with. The same colour and glyph resolution feeds a renderer-side preview panel, so preview and shell agree on what a theme looks like.

**Tech Stack:** Node.js built-ins only, no new npm dependencies. UMD module wrapper (`module.exports` in Node, a global in the renderer) matching `split-tree.js`, `themes.js` and `command-palette.js`. Tests are `node --test`.

**Spec:** [docs/superpowers/specs/2026-08-25-shell-kit-design.md](../specs/2026-08-25-shell-kit-design.md)

## Global Constraints

- **No new IPC channels.** The preload allowlist stays at 16. Theme and pack changes travel on the existing `settings:set`; the glyph capability travels inside the existing `pty:create` payload.
- **No network access**, at build time or run time. No new npm dependencies.
- **No writes to any user dotfile, ever.** Josh writes only inside its own per-session temp directory and `~/.config/josh/`.
- **No oh-my-zsh code, theme name, curated alias list, or identifier.** Never use `ZSH_THEME`, `plugins=()`, `ZSH_CUSTOM`, or any `omz_` prefix. Josh's shell identifiers are all prefixed `__josh_` or `JOSH_`.
- **Every generated file is `0600` inside a `0700` directory** under `os.tmpdir()`, with an unpredictable name, removed on session exit.
- **Alias names must match `^[A-Za-z_][A-Za-z0-9_-]*$`.** Alias values are single-quoted with embedded quotes escaped per dialect. No free-form string from settings or a user pack file is ever interpolated unescaped into script text.
- **Never write a literal control or private-use character into a source file, and do not reach for backslash-u escapes either.** Build such characters with `String.fromCodePoint(0xE0B0)` and test them with `codePointAt`. Literals are invisible in review; escapes get rewritten by tooling. Powerline separator is U+E0B0, branch mark is U+E0A0.
- **Windows PowerShell 5.1 is excluded.** Only `pwsh` 7+ is supported on Windows.
- **The kit disables itself for a session** rather than half-applying, whenever: `settings.shellArgs` is set, the resolved shell is unsupported, or the temp directory cannot be created.
- **Node 20+**, matching `engines` in `package.json`.

## File Structure

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/shared/kit-themes.js` | Theme definitions, segment/slot vocabulary, coercion | yes |
| `src/shared/kit-render.js` | Colour + glyph resolution; concrete render for the preview | yes |
| `src/shared/kit-lib.js` | Static per-dialect shell snippets as string constants | yes |
| `src/shared/kit-emit.js` | Theme + packs to zsh / bash / pwsh script text | yes |
| `src/shared/kit-packs.js` | Alias and function pack definitions, coercion | yes |
| `src/main/shell-integration.js` | Temp dir, generated files, env, args, dispose | no |
| `src/renderer/js/kit-preview.js` | Theme preview panel | no |

**Deviation from the spec, deliberate:** the spec lists six files; this plan has seven. `kit-lib.js` holds the static shell snippets (git status parsing, the non-clobbering alias installer) that do not vary by theme. Keeping them out of `kit-emit.js` stops that module growing past 400 lines and lets the snippets be tested directly against real shells. It is a string-constant module, so `kit-emit.js` stays pure.

**Modified:**

| File | Change |
| --- | --- |
| `src/main/settings.js` | Seven new keys and coercion |
| `src/main/validate.js` | `assertGlyphMode` for the `pty:create` payload |
| `src/main/pty-manager.js` | Build integration on create, dispose on exit |
| `src/main/shell-resolver.js` | `pwsh` args when the kit is active |
| `src/renderer/js/app.js` | Glyph detection, palette entries, panel wiring |
| `src/renderer/index.html` | Script tags |
| `README.md`, `docs/design.md` | Documentation |

## How render() and emit() actually relate

The spec says preview and reality "cannot disagree, because they are one function." Precisely:

- **Shared:** the theme data, the segment order, the slot-to-colour resolution, and the glyph choice. These live in `kit-render.js` and both consumers call them.
- **Not shared:** text assembly. `render()` returns concrete spans from concrete state, for the preview. `emit()` returns shell code in which dynamic segments are references to shell variables computed at prompt time.

So a theme cannot look different in the two places in colour, glyph or ordering, which is what matters. The two are not literally the same call, and this plan does not pretend otherwise.

## Task order and dependencies

Tasks 1 to 5 are pure modules, verifiable entirely with `node --test`. Tasks 6 to 8 add main-process code and settings but wire nothing into the spawn path, so they change no behaviour either. **Task 9 is the first task with a visible effect**: until it lands, every shell starts exactly as it does today.

That ordering is deliberate. The whole kit is written and tested before anything can misapply it to a real shell, and a half-finished kit cannot cost anyone their terminal.

---

## Task 1: Theme definitions and coercion

**Files:**
- Create: `src/shared/kit-themes.js`
- Test: `test/kit-themes.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `SEGMENT_TYPES: string[]`, `SLOTS: string[]`
  - `THEMES: Record<string, Theme>` with keys `plain`, `classic`, `rail`, `stack`, `context`
  - `themeNames(): string[]`
  - `coerceTheme(raw: unknown): Theme|null` (returns `null` when unsalvageable)
  - `stripControls(s: string): string`
  - `SEPARATOR_RIGHT: string`
  - `Theme = { name: string, multiline: boolean, segments: Segment[] }`
  - `Segment = { type: string, slot: string, text?: string, fallback?: string, opts: object }`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const KitThemes = require('../src/shared/kit-themes.js');

test('ships the five named themes', () => {
  assert.deepStrictEqual(
    KitThemes.themeNames().sort(),
    ['classic', 'context', 'plain', 'rail', 'stack']
  );
});

test('every built-in theme survives its own coercion unchanged', () => {
  for (const name of KitThemes.themeNames()) {
    const theme = KitThemes.THEMES[name];
    assert.deepStrictEqual(KitThemes.coerceTheme(theme), theme, name);
  }
});

test('drops segments with an unknown type', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{ type: 'cwd', slot: 'fg' }, { type: 'nonsense', slot: 'fg' }],
  });
  assert.strictEqual(out.segments.length, 1);
  assert.strictEqual(out.segments[0].type, 'cwd');
});

test('an unknown slot falls back to fg rather than dropping the segment', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{ type: 'cwd', slot: 'chartreuse' }],
  });
  assert.strictEqual(out.segments[0].slot, 'fg');
});

test('rejects a name that is not a safe identifier', () => {
  assert.strictEqual(KitThemes.coerceTheme({ name: '../etc', segments: [] }), null);
  assert.strictEqual(KitThemes.coerceTheme({ name: 'a b', segments: [] }), null);
  assert.strictEqual(KitThemes.coerceTheme({ name: '', segments: [] }), null);
});

test('caps the segment list', () => {
  const many = Array.from({ length: 40 }, () => ({ type: 'cwd', slot: 'fg' }));
  const out = KitThemes.coerceTheme({ name: 'x', segments: many });
  assert.strictEqual(out.segments.length, 12);
});

test('a non-object, or one with no segments array, yields null', () => {
  assert.strictEqual(KitThemes.coerceTheme(null), null);
  assert.strictEqual(KitThemes.coerceTheme([]), null);
  assert.strictEqual(KitThemes.coerceTheme({ name: 'x' }), null);
});

test('stripControls removes C0 controls and DEL but keeps ordinary text', () => {
  const dirty = 'a' + String.fromCharCode(7) + 'b' + String.fromCharCode(27) + 'c'
    + String.fromCharCode(127);
  assert.strictEqual(KitThemes.stripControls(dirty), 'abc');
  assert.strictEqual(KitThemes.stripControls('main'), 'main');
});

test('control characters are stripped out of a glyph', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{
      type: 'char', slot: 'fg',
      text: 'a' + String.fromCharCode(27) + 'b',
      fallback: '>',
    }],
  });
  assert.strictEqual(out.segments[0].text, 'ab');
});

test('an over-long glyph falls back rather than being truncated into nonsense', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{ type: 'char', slot: 'fg', text: 'far too long', fallback: '>' }],
  });
  assert.strictEqual(out.segments[0].text, '>');
});

test('the rail theme uses the powerline separator code point', () => {
  assert.strictEqual(KitThemes.SEPARATOR_RIGHT.codePointAt(0), 0xE0B0);
  const charSegment = KitThemes.THEMES.rail.segments.find((s) => s.type === 'char');
  assert.strictEqual(charSegment.text, KitThemes.SEPARATOR_RIGHT);
  assert.strictEqual(charSegment.fallback, '>');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/kit-themes.test.js`
Expected: FAIL with `Cannot find module '../src/shared/kit-themes.js'`

- [ ] **Step 3: Write the implementation**

```js
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
```

Note on the built-in themes: `classic`, `stack` and `context` deliberately use a
plain `>` for both `text` and `fallback`. A fancier prompt character can be set
by a user theme, but shipping one in a built-in would mean shipping a glyph that
a plain font renders as an empty box, in the default theme, on first run.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/kit-themes.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/shared/kit-themes.js test/kit-themes.test.js
git commit -m "Add Shell Kit theme definitions and coercion"
```

---

## How Tasks 2 to 15 are written

Task 1 above spells out its implementation in full. The tasks below do not, and
that is deliberate.

Writing the Trace plan the exhaustive way produced eleven defects that only
surfaced during execution: invented APIs for files the plan had not read, test
harnesses that could not run, and a task whose settings tripped a guard the
repo already had. Prescribing the code did not prevent those; it created them,
because a plan cannot typecheck itself.

So each task below fixes what has to be agreed in advance -- the interface
other tasks depend on, the tests that define done, and the decisions that are
easy to get wrong -- and leaves the body to execution, where it is written
against the real files and run.

Every task is grounded in files already read: pty-manager.js,
shell-resolver.js, settings.js, validate.js, ipc.js, app.js, terminal-pane.js,
themes.js and split-tree.js. Where a task touches something not yet read, it
says so and its first step is to read it.

---

## Task 2: Colour and glyph resolution

**Files:** create `src/shared/kit-render.js`, `test/kit-render.test.js`

**Consumes:** Task 1 (`Theme`, `Segment`, `SEPARATOR_RIGHT`)

**Produces:**
- `resolveSlots(ui, xterm)` returning a slot-to-colour map
- `pickGlyph(segment, glyphs)`
- `formatCwd(cwd, home, truncate, glyphs)`
- `formatDuration(ms)`
- `formatGit(git, glyphs)`
- `renderPreview(theme, state, caps)` returning `{lines}` of `{text, colour}`

**Grounding.** themes.js exposes each theme as `{dark, ui: {chrome, border,
accent, muted}, xterm: {sixteen ANSI colours, foreground, background}}`. Slots
resolve from those: accent and muted from ui; ok, warn and error from the xterm
green, yellow and red; fg from the xterm foreground.

**Decisions that must not drift.**
- Every slot resolves to a concrete colour, never undefined, even when handed
  an empty theme.
- formatCwd collapses the home directory to a tilde only on an exact match or a
  home-plus-slash prefix, so /home/username is not mangled under /home/u.
- A truncation of 0 means no truncation.
- Zero git counts are omitted, so a clean tree shows the branch name alone.

**Tests:** slot resolution from a real theme and from an empty one; the tilde
cases including the near-miss; truncation on and off; duration across
milliseconds, seconds and minutes; git clean, dirty, detached, and each count;
rich versus plain glyph choice; every span carrying a colour.

---

## Task 3: Shell snippets and the git parser

**Files:** create `src/shared/kit-lib.js`, `test/kit-lib.test.js`

**Produces:** `POSIX_GIT`, `POSIX_ALIAS`, `PWSH_GIT`, `PWSH_ALIAS` -- dialect
snippets as string constants, so kit-emit.js stays pure.

**The thing this task exists to settle.** The spec calls the porcelain-v2
parser "pure and driven by fixtures", which reads as JavaScript. It cannot be:
the prompt renders in the shell at prompt time, so the parser is shell code. It
stays fixture-driven by piping fixtures through a real bash and zsh with
execFileSync, skipping whichever is absent.

**Shell contract.** `__josh_git_parse` reads porcelain-v2 on stdin and sets
JOSH_GIT_BRANCH, JOSH_GIT_DETACHED, JOSH_GIT_AHEAD, JOSH_GIT_BEHIND,
JOSH_GIT_STAGED, JOSH_GIT_UNSTAGED, JOSH_GIT_UNTRACKED, JOSH_GIT_CONFLICTS.

**Decisions that must not drift.**
- The XY field of a 1 or 2 record is two characters: index state then worktree
  state, with a dot meaning unmodified. MM counts once in each, which is why
  the two counters are independent.
- A branch head of "(detached)" means detached; the name then comes from the
  first seven characters of the branch oid.
- Behind counts are reported positive, not as the negative porcelain prints.
- `__josh_alias` refuses any name `command -v` already resolves: alias,
  function, builtin, keyword, or binary on PATH. That is what stops a gs alias
  shadowing Ghostscript, and it is the rule the packs depend on.
- Alias names match `[A-Za-z_][A-Za-z0-9_-]*` with one exception: two to four
  dots, so `..` and `...` can navigate upward. Nothing else non-alphanumeric is
  ever defined.
- `__josh_git_collect` walks up for a .git entry itself rather than letting git
  fail, so a directory outside any repository costs no process at all, and
  caches on the repository root so repeated prompts in one tree are free.

**Tests, per available POSIX shell:** clean, dirty with staged, unstaged and
both, untracked, detached, ahead, behind, conflicts, no upstream. Plus: the
installer refuses to shadow ls; it defines a free name; it rejects a name
containing a semicolon; it accepts two dots. Plus a shared test that no snippet
contains a control character.

**Deliberate gap:** the PowerShell snippets get no unit test, because testing
them needs pwsh and only the Windows CI runner guarantees it. Task 14's
end-to-end covers them and skips when pwsh is absent. Record it; do not pretend
otherwise.

---

## Task 4: Alias and function packs

**Files:** create `src/shared/kit-packs.js`, `test/kit-packs.test.js`

**Produces:** `PACKS` (git, core, dev, systems), `packNames()`,
`coercePack(raw)`, `selectPacks(names)`, `isSafeAliasName(name)`.

**Derivation rule, to be followed literally.** Every alias comes from its
tool's own help output, named as the tool's initial followed by the
subcommand's initials, disambiguated by appending the next consonant: git
status becomes gst, git stash becomes gsta. Mechanical and reproducible from
primary sources, which is both why the sets are defensible and why they are
predictable to learn. Do not copy an alias list from any existing framework.

**Sizes:** git about 30, core about 25, dev about 35, systems about 25.

**Decisions that must not drift.**
- Interactive rm, cp and mv are not in core. Aliasing rm is contentious enough
  to need its own opt-in flag.
- A pack declares `requires`, the binary it needs; a pack whose tool is absent
  defines nothing.
- User packs are JSON, coerced by the same function, subject to the same
  non-clobbering rule.

**Tests:** the four packs exist; every shipped alias name is safe; no alias is
defined twice across packs; no alias value contains a control character; the
dot exception is accepted and other punctuation is not; rm is absent from core;
selectPacks drops unknown names in place; coercePack rejects unsafe names and
strips control characters from values; every shipped pack survives its own
coercion unchanged.

---

## Task 5: Per-dialect emitters

**Files:** create `src/shared/kit-emit.js`, `test/kit-emit.test.js`

**Consumes:** Tasks 1 to 4.

**Produces:** `emit(theme, packs, dialect, options)` returning script text, for
zsh, bash and pwsh.

**The thing that breaks prompts.** Non-printing escape sequences must be
wrapped so the shell can compute the prompt's visible width. Get it wrong and
every wrapped command line corrupts, history recall redraws over itself, and
Ctrl+A lands in the wrong column. It is the most common defect in this entire
category of software, which is why the emitters are their own module with
golden-string tests.

| Dialect | Wraps non-printing sequences in | If wrong |
| --- | --- | --- |
| zsh | percent-brace pairs | wrapping and Ctrl+A miscount |
| bash | backslash-bracket pairs | same, plus corrupted redraw on history recall |
| PowerShell 7 | nothing; PSReadLine measures VT itself | stray markers print literally |

Also: zsh prompt strings treat the percent sign specially, so a literal one in
a path must be emitted doubled. bash needs no such doubling.

**Decisions that must not drift.**
- The emitted prompt is a function installed via the dialect's own hook --
  add-zsh-hook precmd, PROMPT_COMMAND, a wrapped prompt function -- not a
  static string, because the git segment is recomputed per prompt.
- Colours are emitted as truecolor escapes, which is sound because
  shell-resolver.js already sets COLORTERM=truecolor.
- No theme or pack name reaches the emitted text unescaped; names are checked
  against an allowlist first. Alias values are single-quoted with embedded
  quotes escaped per dialect.

**Tests:** golden strings per dialect; zsh wraps colour in its own markers and
bash in its own; neither marker ever appears in pwsh output; a literal percent
is doubled for zsh only; an alias value containing quotes, dollars, backticks
and newlines round-trips inertly; a rejected pack name produces no output at
all.

---

## Task 6: Per-session integration, zsh

**Files:** create `src/main/shell-integration.js`, `test/shell-integration.test.js`

**Consumes:** Task 5.

**Produces:** `build({shell, settings, glyphs, env, home, tmpdir})` returning
`{env, args, dispose}` -- or `null` when the kit must stay out of the way.

**Grounding.** pty-manager.js calls `resolveShell(...)` then `sanitizeEnv(...)`
and spawns with `{name, cols, rows, cwd, env}`. This module returns an env to
merge and args to append, and pty-manager wires it in Task 9. Keeping it free
of Electron imports, as pty-manager already is for its binDir, is what lets it
be tested without booting an app.

**The subtlety that matters.** Setting ZDOTDIR redirects all four zsh startup
files, not just .zshrc. Forwarding only .zshrc silently loses the user's
.zshenv and .zprofile, which on macOS is where PATH usually comes from. Generate
all of them:

- `.zshenv` -- source the user's, then force ZDOTDIR back to ours, because a
  user's .zshenv may set it itself
- `.zprofile` -- source the user's, same restore
- `.zshrc` -- source the user's, then install the kit, then export ZDOTDIR back
  to its real value
- no `.zlogin` -- ZDOTDIR is restored by then, so zsh finds the user's

Restoring ZDOTDIR inside .zshrc is what stops every nested zsh re-running the
integration. It gets its own test.

**Decisions that must not drift.**
- The temp directory is 0700 with an unpredictable name under the OS temp
  directory; every file inside is 0600; `dispose` removes the tree.
- The generated files source the user's own configuration **first**. The user's
  setup always wins; Josh only appends.
- Return null, changing nothing, when: `settings.shellArgs` is set (Josh must
  not silently override an explicit choice), the resolved shell is unsupported,
  or the temp directory cannot be created.

**Tests:** all four files are generated with the right contents; the user's
real ZDOTDIR is forwarded and restored; a user with no ZDOTDIR gets HOME; the
kit is skipped when shellArgs is set; dispose removes the directory; a
failure to create the directory returns null rather than throwing; file modes
are 0600 inside a 0700 directory.

---

## Task 7: Per-session integration, bash and PowerShell

**Files:** modify `src/main/shell-integration.js`, extend `test/shell-integration.test.js`

**bash, and its honest caveat.** `--rcfile` is ignored for login shells, and
`loginArgsFor` in shell-resolver.js starts POSIX shells with `-l` deliberately,
because a non-login shell misses /etc/paths and .zprofile and users report
"my tools are missing". So the kit rides an inherited PROMPT_COMMAND, which
bash reads from the environment and runs before the first prompt; it installs
itself once and then removes itself from PROMPT_COMMAND.

A .bashrc that **assigns** PROMPT_COMMAND rather than appending wipes the hook.
Josh then does nothing at all rather than half-applying. That is exactly the
case the optional export in Task 13 covers, so bash is automatic in the common
case and manual in the guaranteed one. Say so in the README, not only here.

**PowerShell 7.** Append `-NoExit -Command` pointing at the generated script.
Profiles load before -Command, so the user's profile wins and Josh appends
after it.

**Windows PowerShell 5.1 is excluded.** Its VT processing is off by default, so
the prompt would render as visible escape codes. Detect it from the resolved
path -- shell-resolver.js's FALLBACKS distinguish `pwsh.exe` under Program
Files from `powershell.exe` under System32 -- and return null.

**Tests:** bash gets a PROMPT_COMMAND in env and no args; the hook disarms
itself after first run (assert the generated text does so); pwsh gets -NoExit
-Command args and no env change; powershell.exe returns null; an unknown shell
returns null; fish returns null, since it is not in this spec.

---

## Task 8: Settings

**Files:** modify `src/main/settings.js`, create `test/kit-settings.test.js`

**Seven keys**, all coerced by the rules already in settings.js:

| Key | Default | Meaning |
| --- | --- | --- |
| `shellKit` | `false` | Master switch |
| `shellKitPrompt` | `"classic"` | Theme name, built-in or user |
| `shellKitPacks` | `["git","core"]` | Enabled packs, allowlisted names |
| `shellKitGlyphs` | `"auto"` | auto, rich or plain |
| `shellKitGitUntracked` | `true` | Scan untracked files in the git segment |
| `shellKitGitSkip` | `[]` | Path prefixes where the git segment is skipped |
| `shellKitSafeRemove` | `false` | Interactive rm, cp and mv aliases |

**Why the master switch defaults off.** Silently replacing the prompt of
someone running starship, Powerlevel10k or oh-my-zsh on a version upgrade would
be hostile. Enabling it detects a known framework in the environment and reports
the conflict rather than fighting it.

**Ordering, and the trap that dissolved a task in the Trace plan.**
`test/settings.test.js` contains a guard: *every setting is honoured somewhere
in the app*. It walks src/, concatenates every .js except settings.js, and
fails on any DEFAULTS key that appears nowhere. Its comment names confirmOnClose
and bell as exactly this bug.

So **this task must land after Tasks 6 and 7**, because shell-integration.js is
what reads these keys. Adding them earlier fails the guard, and satisfying it
with a token reference would game it rather than respect it.

**Tests:** defaults; each enum and array coerces and clamps; unknown pack names
are dropped; a non-array packs value falls back; the existing keys still coerce
exactly as before; a whole settings file carrying old and new keys together.

---

## Task 9: Wiring the spawn path

**Files:** modify `src/main/validate.js`, `src/main/ipc.js`, `src/main/pty-manager.js`;
extend `test/validate.test.js`, `test/ipc-contract.test.js`

**Produces:** `assertGlyphMode(value)` in validate.js, returning `'rich'` or
`'plain'` and rejecting anything else.

**Grounding.** ipc.js's pty:create handler already does
`assertDimensions(opts.cols, opts.rows)` and `assertCwd(opts.cwd)` before
calling `ptyManager.create({windowId, cols, rows, cwd, settings})`. The glyph
mode rides in that same payload -- **no new channel**, so the preload allowlist
stays at 16, which is the spec's promise and what README and design.md now say.

pty-manager.create then calls `shell-integration.build(...)`, merges the
returned env over the sanitized env, appends the returned args, and stores
`dispose` on the session record so `_destroy` can call it.

**Decisions that must not drift.**
- The renderer's glyph value is untrusted like everything else: validate it to
  the two-value enum, defaulting to plain, never passing it through raw.
- A build failure must not prevent the shell starting. Wrap it: if
  shell-integration throws, log nothing to the user and spawn exactly as
  before. A broken kit must never cost someone their terminal.
- dispose runs from `_destroy`, which already runs on both kill and exit.

**Tests:** assertGlyphMode accepts the two values and rejects everything else
including undefined, numbers and near-misses; the ipc contract test still sees
16 channels; a session created with the kit off spawns with an unchanged env;
a build that throws still yields a working session.

---

## Task 10: Glyph detection

**Files:** modify `src/renderer/js/terminal-pane.js`, create `src/renderer/js/kit-glyphs.js`
and `test/kit-glyphs.test.js`

**Produces:** `detectGlyphs(measure)` -- pure, taking an injected measuring
function so it can be tested without a canvas -- and a thin `measureWithCanvas`
the renderer supplies.

**How it works.** Measure the advance width of the powerline separator
(U+E0B0) against a plane-16 private-use code point no font defines. Equal
widths mean both fell back to the same missing-glyph box, so the font has no
powerline coverage.

**Grounding.** terminal-pane.js calls
`api.pty.create({cols, rows, cwd})` at line 82. Add `glyphs` to that object.
The pane already holds the configured font, so the measurement uses the real
font stack rather than a guess.

**Decisions that must not drift.**
- `shellKitGlyphs` of rich or plain overrides detection entirely; only auto
  measures.
- Detection failing for any reason yields plain. A missing glyph renders as a
  box on every prompt, which is worse than a plain one.

**Tests:** equal widths give plain; different widths give rich; a measure that
throws gives plain; the two overrides bypass measurement altogether.

---

## Task 11: The preview panel

**Files:** create `src/renderer/js/kit-preview.js`, `test/kit-preview.test.js`

**Consumes:** Tasks 1, 2 and 10.

**What is real and what is sampled.** Real: the cwd the renderer already
receives on the pty:cwd event, the active colour theme, the configured font,
and the actual render function. Sampled: git state -- branch main, one staged,
two modified, one ahead -- shown for both exit states and both glyph modes, and
labelled in the UI as a sample.

Git state is sampled deliberately. Rendering live git would mean the renderer
running git, which needs a new IPC channel and makes Josh spawn processes of
its own, expanding the trust boundary for a preview.

**Decisions that must not drift.**
- Selecting a theme calls the existing settings:set. No new channel.
- The panel reuses the palette's backdrop and dialog styling and its
  role=listbox keyboard pattern, so it is navigable without a mouse.

**Tests:** the pure model behind the panel -- one row per theme, each carrying
the spans renderPreview produced, both exit states present, the sample labelled
-- following the split that worked for Trace's diagram: model pure and tested,
DOM thin and checked by hand.

---

## Task 12: Palette entries

**Files:** modify `src/renderer/js/app.js`

**Grounding.** app.js builds palette entries as a flat array and already
generates dynamic ones -- `Theme: <name>` per theme, and a toggle whose label
carries its own state. The kit's entries follow that exact pattern.

Entries: `Shell Kit: on/off`, `Prompt Theme...` opening the preview, one
`Pack: <name> (on/off)` per pack, and `Copy Shell Kit source line` for the
Task 13 export.

**Decisions that must not drift.**
- Everything routes through the existing patchSettings, which already persists
  and re-applies.
- Changes affect **new** tabs and panes only. Never write into a live PTY: the
  shell may not be at a prompt, and without Recall's OSC 133 marking Josh
  cannot know. If the pane is inside vim, those keystrokes go into the file.
  Say so in the entry's hint text.

---

## Task 13: The optional export

**Files:** modify `src/main/shell-integration.js`, extend its test

Write the generated script to `~/.config/josh/shell-kit/init.zsh`, `.bash` and
`.ps1` when the kit is enabled, so it can be sourced from other terminals.

**Josh writes only inside its own config directory and never edits a dotfile.**
Adding the source line is the user's action; the palette offers to copy it and
the README shows it. That is the promise SECURITY.md makes, and the reason the
whole feature is built on a per-session temp directory in the first place.

**Tests:** the files are written with 0600 under a 0700 directory; they are
rewritten when settings change; disabling the kit leaves them alone rather than
deleting work the user may be sourcing; no path outside ~/.config/josh is ever
touched.

---

## Task 14: End to end

**Files:** create `test/kit-e2e.test.js`

Spawn a real zsh with the generated ZDOTDIR and assert: a prompt renders; an
alias from the git pack resolves; the user's own rc still ran; ZDOTDIR is back
to its real value inside the shell; stderr is clean. Repeat for bash via
PROMPT_COMMAND, and for pwsh when present, skipping when absent.

**Budget:** assert the kit adds under 40ms to shell startup, measured against
the same shell started without it.

This is the only test that exercises the PowerShell snippets at all, per the
gap recorded in Task 3.

---

## Task 15: Documentation

**Files:** modify `README.md`, `docs/design.md`, `THIRD_PARTY_LICENSES.md`

README: what the kit is, the one-line opt-in, the seven settings, the five
themes, the four packs, and the bash caveat from Task 7 stated plainly rather
than buried.

design.md: the four decisions worth explaining -- per-session temp rc rather
than dotfile writes, one theme definition emitted per dialect, glyph detection
being something only a GUI terminal can do, and packs that never clobber.

THIRD_PARTY_LICENSES.md: a NOTICE recording that the kit is an independent
implementation -- no oh-my-zsh file, theme, curated alias list or identifier;
aliases derived mechanically from each tool's own help output; shipped under
Josh's MIT.

---

## Self-review of this plan

**Spec coverage.** Themes to Task 1; colour and glyph resolution to Task 2;
the git parser and non-clobbering installer to Task 3; packs to Task 4;
emitters and zero-width escaping to Task 5; per-shell integration to Tasks 6
and 7; settings to Task 8; the spawn path and the 16-channel promise to Task 9;
glyph detection to Task 10; the preview to Task 11; palette to Task 12; the
optional export to Task 13; end-to-end and the startup budget to Task 14;
documentation to Task 15.

**Three traps are called out where they bite**, each learned the hard way while
executing the Trace plan:

1. Task 8 must land after Tasks 6 and 7, or settings.test.js's guard fails.
2. Task 3's parser is shell code, not JavaScript, whatever the spec's wording
   suggests.
3. Task 9 adds no IPC channel, because README and design.md now both state 16
   and a new one would make them wrong.

**One deliberate gap:** the PowerShell snippets have no unit test, only Task
14's end-to-end, which skips where pwsh is absent. Recorded in Tasks 3 and 14
rather than left to be discovered.
