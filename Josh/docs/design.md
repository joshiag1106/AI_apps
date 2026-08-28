# Josh — design

Architecture notes for the terminal emulator: what it is made of, and why the
non-obvious choices were made.

## Goal

A terminal with the same capabilities as the system terminal, on macOS, Windows
and Linux, deployable immediately, with a security posture that assumes terminal
output is hostile and an install path that cannot fail for platform-specific
reasons.

## Stack, and the alternatives rejected

**Electron 43 + xterm.js 6 + @lydell/node-pty.**

| Option | Outcome |
| --- | --- |
| Electron + xterm.js | **Chosen.** Real PTYs, GPU rendering, native installers, no toolchain beyond Node |
| Tauri + Rust `portable-pty` | Rejected: needs a Rust toolchain and per-OS WebView dependencies, so it fails "deployable immediately" |
| Python + Textual | Rejected: a TUI *inside* an existing terminal, not a terminal emulator. No PTY of its own |

### Why this PTY binding specifically

`@lydell/node-pty` ships prebuilt **Node-API** binaries for all six
platform/arch combinations as optional dependencies, and has **no install
scripts**.

The consequences are the whole reason it was chosen:

- No node-gyp, no Xcode Command Line Tools, no Visual Studio Build Tools, no Python
- No `electron-rebuild`, because Node-API is stable across both Node and Electron ABIs
- `npm install` executes no third-party code
- The lockfile pins all six prebuilds, so `npm ci` is deterministic on any OS

The mainstream alternative (`@homebridge/node-pty-prebuilt-multiarch`) runs
`prebuild-install` in a postinstall hook and **falls back to compiling from
source**, which reintroduces every toolchain dependency listed above.

## Process architecture

```
+- MAIN (Node privileged) --------------+   +- RENDERER (no Node) ----+
|  pty-manager    session ownership     |   |  xterm.js + WebGL       |
|  shell-resolver per-OS shell + env    |   |  tabs, splits, palette  |
|  ipc            validates everything  |<--|  strict CSP, no network |
|  security       CSP, nav, permissions |   |                         |
|  settings       schema-coerced, 0600  |   +---------^---------------+
+---------------+-----------------------+             |
                +---- PRELOAD: contextBridge ---------+
                      16 channels, fixed allowlist
```

The renderer never touches Node, the filesystem, or a shell path. It can only
ask the main process to act on a session id it already owns.

## Key decisions

### Output batching

A PTY emits thousands of small chunks per second under load. Forwarding each as
its own IPC message is the dominant cause of sluggish Electron terminals. Output
accumulates in the main process and flushes every 8 ms, or immediately past
64 KB. This single decision is what makes `cat` on a large file feel native.

### Session ownership

Sessions are keyed by the id of the window that created them. Every IPC handler
resolves a session through `resolveOwned(windowId, sessionId)`; the window id
comes from `event.sender`, never from the payload. A renderer therefore cannot
address another window's shell even if it forges an id.

### `Ctrl+Shift` on Windows and Linux

`Ctrl+C`, `Ctrl+D`, `Ctrl+A`, `Ctrl+K` and `Ctrl+W` are shell bindings —
interrupt, end-of-file, beginning-of-line, kill-line, kill-word. Binding
application commands to them would break the shell on two of three target
platforms, so those platforms use `Ctrl+Shift`. macOS has a separate Command key
and needs no workaround.

### Login shells

POSIX shells start with `-l`. Without it, macOS users lose everything from
`/etc/paths` and `~/.zprofile`, and report that their tools are missing.

### Per-platform window chrome

macOS gets inset traffic lights and background vibrancy; Windows gets a
colour-matched title-bar overlay; Linux keeps its native frame, because
frameless windows behave inconsistently across window managers. A user who
cannot close their terminal is a worse outcome than plain chrome.

### `asarUnpack` for the native binary

A `.node` file cannot be loaded from inside an asar archive. Packaging it there
yields an app that works in development and fails for every user.

### The preflight script

npm 11 blocks dependency lifecycle scripts by default, so a clean `npm install`
leaves Electron's binary undownloaded — the install reports success and the app
then fails with an unrelated-looking error. `scripts/verify.js` detects this and
repairs it, and is wired into `prestart`, `pretest` and `predist`.

## Pane layout

A tab holds an immutable binary tree:

```
leaf  { type: 'leaf',  id }
split { type: 'split', direction: 'row'|'column', children: [a, b], sizes: [x, y] }
```

Every operation returns a new tree. Removing a leaf collapses any split left
with a single child, so the structure never accumulates empty scaffolding.
Because it is pure data with no DOM involvement, the whole layout engine is
unit-tested in plain Node.

During a divider drag, flex ratios are set directly on the DOM for smoothness;
the tree is updated once on release, which is also when panes re-measure and the
PTYs are told their new size.

## Trace

A second kind of pane, running a C interpreter over a simulated machine. Four
decisions are worth recording.

**A pane type, not a modal panel.** `split-tree.js` already manages geometry
and `app.js` already holds pane objects in a map, so a Trace pane is simply a
pane with a different `kind`. Splitting, dragging, focusing and closing came
free, and the geometry tree still knows nothing about what a pane contains.

**The shadow map does two jobs.** Every live object records its address, size,
type and per-byte initialisation. That structure is what the diagram draws
*and* what makes undefined behaviour detectable: raw bytes cannot tell you an
address is one past the end of an array, but the shadow map can. Dead objects
are kept rather than deleted, which is the only reason a use-after-free can be
told apart from a wild pointer, and why the allocator never reuses a freed
block.

**Generators for stepping.** `execute` yields at each statement boundary, and
completions ride the generator's return value, so `break` inside an `if` inside
a `while` needs no bookkeeping. Expression evaluation is a generator too --
not because expressions pause, but because one can contain a call, and a call
must be steppable or the stack stays invisible.

**Journal backwards, replay forwards.** Writes are journalled with their
previous values, so Step Back is instant. A generator cannot be rewound, but
execution is deterministic, so stepping forward after a rewind restarts and
replays to the same point -- paid once, on the first forward step.

The whole feature is renderer-side: no IPC channel, no main-process change, no
filesystem, no subprocess, no `eval`. A Trace pane owns no PTY, so nothing typed
into it can reach a shell.

## Diagnostic condensing

Four renderer-side modules and one hook, where `terminal-pane.js`'s `write()`
used to call `this.term.write(data)` directly.

| File | Responsibility |
| --- | --- |
| `diagnostics.js` | Line assembly, escape and alternate-screen guards, the streaming state machine |
| `diagnostic-matchers.js` | Matcher registry, vendor-path judgement, the two C++ matchers |
| `demangle.js` | An Itanium ABI subset that returns the input unchanged on any failure |
| `diagnostic-overlay.js` | The expand UI and a bounded store of the 50 most recent originals |

**Buffering, not retraction.** Written lines can be erased with cursor-up only
while they are still on screen; a 200-line error has already scrolled into
scrollback, which ANSI cannot reach. Deciding before writing is the only
correct option, so complete lines are held for 16ms -- on top of the 8ms
batching `pty-manager.js` already performs -- and released either by that timer
or by a matcher claiming them.

**Only complete lines are held, but partial ones are held too.** The naive rule
"pass partial lines straight through" breaks the feature rather than the
prompt: the OS decides where a read ends, so under small reads nearly every
diagnostic straddles a boundary. Partials are held on the same timer and carry
a `committed` offset, so a partial already on screen is never written twice and
can no longer open a block.

**Adding a language is a matcher, not a change here.** A grammar, a vendor-path
rule and fixtures. Rust is excluded by design: its diagnostics are already
better than this produces.

The whole feature is renderer-side -- no IPC channel, no main-process change.
The renderer already holds this data; processing it there grants no capability
it did not have.

## Recall

Five modules in the main process and one in the renderer. Main already sees
both PTY output and every write the renderer requests, so the renderer never
has to *ask* for a suggestion -- main pushes one. That is why Recall adds one
event channel and no invoke channel.

| File | Responsibility |
| --- | --- |
| `semantic-parser.js` | OSC 133 grammar, nonce rejection, the per-session state machine |
| `input-tracker.js` | The partially typed line, or an honest refusal to guess |
| `recall-redact.js` | The one question asked before anything reaches disk |
| `recall-store.js` | Append-only JSONL, `0600`, in-memory index, compaction |
| `recall-rank.js` | Pure scoring: locality, outcome, recency, frequency, repair pairs |
| `suggestion.js` | Ghost text after the cursor, in the renderer |

**Redaction is a separate module on purpose.** It is where a mistake leaks a
secret, so it has no filesystem access and can be reviewed and tested with the
disk nowhere near it. The spec placed it inside the store; this does not.

**Recall is opt-in, and that is a decision not an oversight.** The Shell Kit
defaults off because silently replacing someone's prompt on a version upgrade
would be hostile. Silently beginning to record their command history is the
more invasive of the two, not the less: a prompt change is cosmetic, instantly
visible and trivially undone, and a shell history on disk is none of those. The
store being `0600` and redacted bounds the harm; it does not substitute for
being asked. The spec specified on-by-default and this disagrees with it.

**The nonce is the whole threat model.** A sequence that cannot present it is
ignored entirely -- not logged, not partially applied. Untrusted *execution*
remains out of scope; see SECURITY.md.

**bash needs its DEBUG trap installed last.** The trap fires on every command,
including the remaining lines of the snippet installing it, so an earlier trap
records Josh's own setup as the user's first command. It is installed after
everything else and suppressed until the first prompt clears it. This was found
by running the snippet in a real bash, not by reading it.

**fish is written but unreachable.** `recallSnippet` produces correct fish
hooks and they are tested, but `dialectFor` recognises only zsh, bash and pwsh,
so `build()` never reaches them. Making fish work means teaching Josh to
produce a Recall-only session for a shell the Shell Kit has no builder for.

## Testing

985 tests, no test-framework dependency (`node:test`).

- `validate.test.js` — the trust boundary; each case names the hostile input it rejects
- `split-tree.test.js` — layout algebra, including a 12-deep split/collapse cycle
- `settings.test.js` — coercion, clamping, prototype pollution, atomic writes, `0600`
- `shell-resolver.test.js` — all three platforms, via an injected filesystem probe
- `command-palette.test.js` — subsequence scoring and ranking
- `smoke.test.js` — boots the real Electron binary, spawns a real shell, asserts a
  command's output round-trips. This is the one that proves the native binding
  loads under Electron's ABI
- `recall-*.test.js`, `semantic-parser*.test.js`, `input-tracker.test.js`,
  `suggestion.test.js` — Recall. `recall-hooks-e2e.test.js` sources the generated
  hooks in a real zsh and bash and feeds their output back through the parser,
  which is the only way to know the shell and the parser agree
- `diagnostics-*.test.js`, `diagnostic-*.test.js`, `demangle.test.js` — condensing.
  The gate is `diagnostics-e2e.test.js`, which replays real captured compiler and
  terminal output through the condenser in randomly sized chunks and asserts the
  bytes come out unchanged when nothing is condensed. Fixture provenance is
  recorded in `test/fixtures/README.md`; they carry `-text` in `.gitattributes`
  because git normalising a line ending would change what they represent

## Distribution

Installers are built natively per platform by `.github/workflows/build.yml` —
macOS, Windows and Linux runners each build their own artifacts, because
cross-building desktop installers is unreliable. Tagging `v*` publishes them to
a GitHub release.

## The Shell Kit

Four decisions worth the explanation.

### A per-session temp directory, not a dotfile edit

Every shell framework in this category installs by writing into `~/.zshrc`. That
is what makes them hard to remove, hard to reason about, and impossible to ship
in an application that also promises not to touch your files.

Josh generates its script into a `0700` directory with an unpredictable name
under the OS temp directory, points the shell at it for that session only, and
deletes it on exit. The generated files source the user's own configuration
first, so the user's setup always wins and Josh only appends.

For zsh this means generating **all four** startup files, not just `.zshrc`.
`ZDOTDIR` redirects every one of them, so forwarding only `.zshrc` silently
loses `.zshenv` and `.zprofile` — which on macOS is where `PATH` usually comes
from. `.zshrc` then exports `ZDOTDIR` back to its real value, which is what
stops every nested zsh re-running the integration, and why no `.zlogin` is
generated: by the time zsh looks for one, it finds the user's.

### One theme definition, three dialects

A theme is data — an ordered list of segments naming semantic colour slots. One
module resolves those slots to colours and glyphs; another turns the result into
zsh, bash or PowerShell script; the preview panel calls the same resolution. So
a theme cannot look one way in the preview and another in the terminal.

The part that actually breaks prompts is escape-sequence bracketing. A colour
sequence not marked as non-printing is counted as visible width, and then every
wrapped command line corrupts, history recall redraws over itself, and `Ctrl+A`
lands in the wrong column. zsh needs `%{ %}`, bash needs `\[ \]`, and PowerShell
needs neither because PSReadLine measures VT itself. It is the most common
defect in this whole category of software and it is invisible until a line is
long enough to wrap, so the emitters are their own module and the tests run the
generated script through real shells and check that nothing outside a marker
carries an escape byte.

### Glyph detection, which only a GUI terminal can do

Whether to draw powerline separators depends on whether the user's font has
them. A shell framework runs inside a terminal and can only guess from
environment variables. Josh owns the window, so it measures: the advance width
of U+E0B0 against a plane-16 private-use code point no font defines. Equal
widths mean both fell back to the same missing-glyph box.

Anything that goes wrong yields the plain set. A missing glyph renders as an
empty box on every single prompt, which is worse than no glyph at all.

### Packs that never clobber

Before defining any name, the generated script checks `command -v`, which
resolves aliases, functions, builtins, keywords and binaries on `PATH` alike.
A name that already answers is skipped. This is what stops a two-letter alias
shadowing a real program — the specific complaint that `gs` shadows Ghostscript
— and it costs no process, `command -v` being a builtin.

Alias names are derived mechanically from each tool's own help output rather
than curated: the tool's initial, then the subcommand's initials, extended
until free. The derivation runs at load time and a test replays it, so the
shipped names cannot drift from the rule that documents them.
