# Josh

[![build](https://github.com/joshiag1106/AI_apps/actions/workflows/build.yml/badge.svg)](https://github.com/joshiag1106/AI_apps/actions/workflows/build.yml)

A fast, secure, cross-platform terminal emulator. Real PTYs, GPU-accelerated
rendering, tabs and split panes. Runs on macOS, Windows and Linux from the same
source tree.

It is a real terminal, not a shell wrapper: `vim`, `htop`, `ssh`, `tmux`, job
control, `Ctrl+C`, 24-bit colour, window resizing and Unicode all behave exactly
as they do in Terminal.app or Windows Terminal.

---

## Features

- **Real pseudo-terminals** — ConPTY on Windows, `forkpty` on macOS and Linux
- **GPU rendering** — WebGL renderer with an automatic fallback if the GPU context is lost
- **Tabs and split panes** — split any pane horizontally or vertically, drag the dividers
- **Command palette** — fuzzy-searchable, every command in one place
- **Find in terminal** — search the scrollback with match highlighting
- **7 themes** — Tokyo Night, Dracula, Nord, One Dark, Solarized Dark/Light, GitHub Light
- **Follows your OS** — switches between your chosen light and dark theme automatically
- **Shell auto-detection** — zsh, bash, fish, PowerShell 7, Windows PowerShell, cmd
- **`sed` and `awk` on Windows** — bundled as a fallback, since Windows ships neither; your own copies always take priority. On Windows on ARM they run under x64 emulation, as upstream publishes no ARM64 build. See [Third-Party Licenses](THIRD_PARTY_LICENSES.md)
- **Directory awareness** — new tabs and splits open in the current directory
- **Session restore** — reopens your tabs where you left them
- **Native chrome** — macOS vibrancy and inset traffic lights, Windows title-bar overlay
- **Trace** — a second kind of pane that runs a C program one step at a time and
  draws the memory: stack frames, variables, heap blocks, and pointers as arrows.
  Needs no compiler. See [Trace](#trace)
- **No network access at all** — see [Security](#security)

## Install

### Pre-built installers

Download from the [Releases page](https://github.com/joshiag1106/AI_apps/releases):

| Platform | File |
| --- | --- |
| macOS | `Josh-<version>-arm64.dmg` (Apple silicon) or `-x64.dmg` (Intel) |
| Windows | `Josh-Setup-<version>-x64.exe`, or the `portable` build |
| Linux | `Josh-<version>-x86_64.AppImage` or the `.deb` |

On Linux, make the AppImage executable first:

```bash
chmod +x "Josh-"*.AppImage
```

Unsigned builds will be flagged by macOS Gatekeeper and Windows SmartScreen.

- **macOS 15 and later** — open the app, let it be blocked, then go to
  **System Settings → Privacy & Security**, scroll down and choose
  **Open Anyway**. The right-click → Open shortcut was removed in macOS 15.
- **macOS 14 and earlier** — right-click the app, choose **Open**, confirm.
- **Windows** — choose **More info**, then **Run anyway**.

### Run from source

Requires **Node.js 20 or newer**. Nothing else — no compiler, no Python, no
Xcode Command Line Tools, no Visual Studio Build Tools.

```bash
npm install
```

```bash
npm start
```

## Build your own installers

Build on the platform you are targeting. Cross-building is not supported:
Windows installers need Wine and Linux packages need a matching glibc, and both
produce unreliable results.

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

```bash
npm run dist:linux
```

Artifacts land in `dist/`. To build all three at once, push to GitHub — the
included workflow at `.github/workflows/build.yml` builds each platform on its
own native runner and attaches the installers to the run (and to the release, if
you pushed a `v*` tag).

## Keyboard shortcuts

Windows and Linux use `Ctrl+Shift` rather than plain `Ctrl`, because `Ctrl+C`,
`Ctrl+D`, `Ctrl+A`, `Ctrl+K` and `Ctrl+W` belong to the shell (interrupt,
end-of-file, beginning-of-line, kill-line, kill-word). Taking those keys would
break the terminal.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| New tab | `Cmd+T` | `Ctrl+Shift+T` |
| New window | `Cmd+N` | `Ctrl+Shift+N` |
| Split right | `Cmd+D` | `Ctrl+Shift+D` |
| Split down | `Cmd+Shift+D` | `Ctrl+Shift+E` |
| Close pane | `Cmd+W` | `Ctrl+Shift+W` |
| Copy | `Cmd+C` | `Ctrl+Shift+C` |
| Paste | `Cmd+V` | `Ctrl+Shift+V` |
| Select all | `Cmd+A` | `Ctrl+Shift+A` |
| Clear | `Cmd+K` | `Ctrl+Shift+K` |
| Find | `Cmd+F` | `Ctrl+Shift+F` |
| Command palette | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Open settings file | `Cmd+,` | `Ctrl+,` |
| Zoom in / out / reset | `Cmd +` / `Cmd -` / `Cmd 0` | `Ctrl +` / `Ctrl -` / `Ctrl 0` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Ctrl+Tab` / `Ctrl+Shift+Tab` |

## Settings

Settings live in a JSON file you can edit directly. Open it from the menu
(**Help → Open Settings File**, or `Cmd`/`Ctrl` + `,`).

| Platform | Location |
| --- | --- |
| macOS / Linux | `~/.config/josh/settings.json` |
| Windows | `%USERPROFILE%\.config\josh\settings.json` |

| Key | Default | Meaning |
| --- | --- | --- |
| `fontFamily` | JetBrains Mono, Fira Code, SF Mono, Menlo, Consolas, ... | Font stack; the first installed font wins |
| `fontSize` | `14` | 6–72 |
| `lineHeight` | `1.2` | 0.8–3 |
| `letterSpacing` | `0` | -5–10 |
| `cursorStyle` | `"bar"` | `bar`, `block` or `underline` |
| `cursorBlink` | `true` | |
| `theme` | `"auto"` | A theme name, or `auto` to follow the OS |
| `lightTheme` | `"GitHub Light"` | Used when `theme` is `auto` and the OS is light |
| `darkTheme` | `"Tokyo Night"` | Used when `theme` is `auto` and the OS is dark |
| `scrollback` | `10000` | 100–200000 lines |
| `shell` | `null` | Path to a shell. Must contain no spaces. `null` auto-detects |
| `shellArgs` | `null` | Arguments array. `null` uses login-shell defaults |
| `copyOnSelect` | `false` | Copy to clipboard as soon as text is selected |
| `confirmOnClose` | `true` | Ask before closing a window running more than one shell |
| `restoreSession` | `true` | Reopen last session's tabs and directories |
| `renderer` | `"webgl"` | `webgl` or `canvas` |
| `vibrancy` | `true` | macOS translucent background |
| `bell` | `false` | On a terminal bell, flash the pane and bounce the Dock / flash the taskbar. Visual, not audible |
| `traceProgram` | `""` | The program in your Trace pane, so it survives a restart. Capped at 64 KiB |
| `traceStdin` | `""` | The input your Trace program can read. Capped at 8 KiB |

An invalid or corrupt settings file is never fatal: unknown keys are ignored,
out-of-range numbers are clamped, and wrong types fall back to the default.

## Trace

Open the command palette and choose **New Trace Pane**. Write C on the left,
press **Step**, and watch the memory on the right: a box per variable, a group
per stack frame, heap blocks drawn apart from them, and an arrow from every
pointer to the thing it points at.

**Trace is a teaching simulator, not a C compiler.** It runs its own interpreter
over a subset of C, so it needs no compiler, no debugger and no network, and it
behaves identically on macOS, Windows and Linux. Real-world C will not run in
it, and that is not the goal.

**What it runs.** `int`, `char`, `double`, `void`, pointers, arrays, `struct`
and `enum`; every operator including `&`, `*`, `.`, `->`, `[]`, `sizeof` and
casts; `if`, `while`, `for`, `do`, `switch`, `break`, `continue`, `return`;
functions with recursion; object-like `#define`. Its library is built in:
`printf`, `puts`, `putchar`, `scanf`, `getchar`, `malloc`, `calloc`, `realloc`,
`free`, `exit`, `abs`, `rand`, `srand`, and the common `str*` and `mem*`
functions.

**What it refuses, by name.** `union`, function pointers, `goto`, `long`,
`short`, `unsigned`, `float`, bitfields, multiple files, a real preprocessor and
file I/O. Each one produces a message saying what is unsupported and what to use
instead, never a confusing parse error.

**Why a simulator rather than a real compiler.** Because it knows the extent and
type of every object, it catches the mistakes real hardware answers with silence
or garbage, and explains them where they happen:

- Reading memory that was never given a value
- Reading or writing past the end of an array, naming the array and its real length
- Using memory after `free`, freeing twice, or freeing something `malloc` never gave you
- Dereferencing `NULL`
- Using a local variable after the function that owned it returned
- Leaking memory, reported at exit with a count and a total
- Dividing by zero, signed overflow, and a negative index

Every message comes in two forms: a terse compiler-style one, so real `gcc`
output looks familiar later, and a plain-language explanation of what went
wrong.

**Stepping backwards.** *Step Back* walks the program backwards through what
already happened, and *Step* then carries on forwards from there.

**Limits**, each reported as a teaching message rather than a crash: 1 MiB of
memory, 200 stack frames, and 5,000,000 steps — the last of which is how an
endless loop announces itself.

## Security

A terminal displays fully attacker-controlled output — `cat` a hostile file and
that file chooses what your terminal receives. The design assumes this.

- **The renderer has no Node access.** `contextIsolation`, `sandbox`, and
  `nodeIntegration: false`. It talks to the system only through a fixed list of
  16 IPC channels defined in `src/preload/preload.js`.
- **No network access, at all.** The Content-Security-Policy is
  `default-src 'none'; connect-src 'none'`, and non-local requests are cancelled
  in the main process. There is no telemetry, no update check, no analytics.
- **Session ownership.** Each PTY belongs to the window that created it. A
  window cannot read or write another window's shell.
- **Every IPC argument is validated** — session ids must be owned v4 UUIDs,
  terminal sizes are bounded integers, writes are size-capped and rate-limited.
- **Shell paths never come from the renderer.** They are resolved in the main
  process from a per-OS allowlist plus your own settings file.
- **Link protocols are allowlisted.** Only `http`, `https` and `mailto` reach the
  OS, so a crafted `file://` or `javascript:` hyperlink in terminal output is
  inert.
- **Electron environment variables are stripped** before your shell starts, so
  `ELECTRON_RUN_AS_NODE` cannot turn the app binary into a Node interpreter.
- **Settings are written atomically with `0600`** permissions.

See [SECURITY.md](SECURITY.md) for the threat model and how to report an issue.

## Troubleshooting

**`npm start` fails saying Electron is not installed.**
npm 11 blocks dependency install scripts by default, so Electron's binary never
downloads. This is repaired automatically — `npm start` runs a preflight first.
To fix it permanently:

```bash
npm approve-scripts electron
```

You can run the preflight on its own at any time:

```bash
npm run verify
```

**Text renders slowly, or the terminal is blank.**
Set `"renderer": "canvas"` in your settings file. Some virtual machines and
remote-desktop sessions have no usable GPU.

**My tools are missing from `PATH`.**
Shells are started as login shells, so `~/.zprofile` and `/etc/paths` are read.
If you set a custom `shellArgs`, add `-l` yourself.

**My own `sed`/`awk` isn't being used on Windows.**
The bundled copies are appended to the *end* of `PATH`, after everything
already there, so anything you installed yourself should win. If the bundled
one runs instead, check that your `sed`/`awk` are actually on `PATH` in the
shell Josh launches — that is a login shell, so see the note above.

**Tests fail on a headless Linux machine.**
The end-to-end test boots Electron, which needs a display:

```bash
xvfb-run --auto-servernum npm test
```

## Development

```bash
npm test
```

488 tests. Ninety-three cover the IPC validators and channel contract, the
split-pane tree, settings coercion, shell resolution and palette filtering, plus
an end-to-end test that boots Electron, spawns a real shell and asserts the
output round-trips. The rest cover Trace: its lexer, parser, memory model,
diagnostics, evaluator and library, and a corpus of seventy-six whole programs
run end to end.

Architecture notes are in [docs/design.md](docs/design.md), and
[CONTRIBUTING.md](CONTRIBUTING.md) covers the layout and conventions.

## License

MIT — see [LICENSE](LICENSE). Windows builds additionally bundle a GPL-2.0
tool — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Built on [xterm.js](https://xtermjs.org), [Electron](https://electronjs.org)
and [@lydell/node-pty](https://github.com/lydell/node-pty).
