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
                      15 channels, fixed allowlist
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

## Testing

75 tests, no test-framework dependency (`node:test`).

- `validate.test.js` — the trust boundary; each case names the hostile input it rejects
- `split-tree.test.js` — layout algebra, including a 12-deep split/collapse cycle
- `settings.test.js` — coercion, clamping, prototype pollution, atomic writes, `0600`
- `shell-resolver.test.js` — all three platforms, via an injected filesystem probe
- `command-palette.test.js` — subsequence scoring and ranking
- `smoke.test.js` — boots the real Electron binary, spawns a real shell, asserts a
  command's output round-trips. This is the one that proves the native binding
  loads under Electron's ABI

## Distribution

Installers are built natively per platform by `.github/workflows/build.yml` —
macOS, Windows and Linux runners each build their own artifacts, because
cross-building desktop installers is unreliable. Tagging `v*` publishes them to
a GitHub release.
