# Changelog

Everything notable that has changed in Josh, newest first.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
Josh uses [semantic versioning](https://semver.org/spec/v2.0.0.html). Each
version links to its release, where the installers live.

## [Unreleased]

### Changed

- **The highlighter CPU-time check is advisory and no longer fails a build.**
  It had been rewritten three times, each rewrite fixing a real defect in the
  measurement and then flaking again for a new reason, most recently failing a
  release at 2.51 against a threshold of 2.5 on an unchanged highlighter. A
  timing-derived number measures the machine as much as the code, and a shared
  runner is not a constant. What still fails the build is the check beside it,
  which counts spans rather than milliseconds and needs no threshold. The cost,
  stated plainly: an algorithm that goes quadratic in time while its output
  stays linear is now reported rather than caught.

### Fixed

- **The highlighter complexity test no longer flakes on shared runners.** It
  measured a mean over however many runs fitted a fixed CPU budget, which gave
  the large file 2-4 samples against 10-13 for the small one -- so a single
  perturbed run landed with full weight on exactly the side with less
  smoothing. It now takes the median across five batches. Measured spread
  falls from 0.67 to 0.31 while a deliberately quadratic highlighter still
  measures 3.80, so the threshold keeps its discrimination.

### Changed

- **The Windows build no longer downloads anything.** The busybox build behind
  the `sed`/`awk` fallback is committed rather than fetched from
  frippery.org, after a release build timed out against that host. It stays
  pinned by SHA256, and the pin is now checked on every platform by `npm test`
  instead of only during a Windows build.

### Added

- **A release now fails if the changelog does not mention it.** 1.0.5 was
  folded out of `[Unreleased]` by hand and nothing made that a step, so the
  next release could have shipped with a stale or empty section while every
  test passed. Enforced on tag builds and dry runs only, since `master`
  between releases legitimately carries an `[Unreleased]` heading.

## [1.0.5] — 2026-08-29

### Added

- **Keyboard shortcuts for line height** (`Cmd`/`Ctrl` + `Alt` + `=` / `-` / `0`) and
  **theme cycling** (`Cmd`/`Ctrl` + `Alt` + `]` / `[`). Letter spacing has palette
  entries rather than a binding.

### Fixed

- **Increasing the font size did nothing.** `Cmd`/`Ctrl` + `+` was documented in
  the shortcut table and never fired, on any platform, because the accelerator
  bound the literal `+` character. Zoom out and reset were unaffected, so the
  feature looked half-broken rather than broken. It is now bound to `=`, the key
  the shortcut is actually pressed on. There is deliberately no second binding
  for the shifted `+`: a hidden alias was tried and did not fire, and a
  documented shortcut that does nothing is the bug being fixed.
- **"Actual Size" ignored a configured font size**, resetting to a literal 14
  written in the renderer rather than the schema default. All three reset
  commands now read the same shared defaults the settings schema uses.

## [1.0.4] — 2026-08-29

Four features, none of which were in 1.0.3.

### Added

- **Recall.** Josh notes which commands finished, where they ran and what they
  returned, then offers the one you probably want next as dim text at the
  cursor. Right Arrow or End accepts, Esc dismisses, and Tab is left to your
  shell's own completion. Its strongest signal is a repair pair: type a command
  that failed and Josh suggests the one that worked moments later.

  Off until you ask for it — `{ "recall": true }` — because recording a shell
  history is genuinely invasive. The store is plain text at
  `~/.config/josh/recall.jsonl`, mode `0600`, yours to read or delete. Commands
  that look like they carry a secret are dropped before anything is written,
  and prompt markers that cannot prove they came from your shell are ignored,
  so hostile terminal output cannot forge them. zsh, bash and PowerShell 7.

- **Shell Kit.** A git-aware prompt, opt-in alias packs and configured
  completion, without a single byte written into your dotfiles. Off by default:
  `{ "shellKit": true }`.

- **Trace.** A teaching pane. Write C on the left, press Step, and watch memory
  on the right: a box per variable, a group per stack frame, heap blocks drawn
  apart, an arrow from every pointer to what it points at. It runs its own
  interpreter over a subset of C, so it needs no compiler, no debugger and no
  network, and behaves identically on every platform. It is not a C compiler —
  real-world C will not run in it.

- **Diagnostic condensing.** A C++ template error is hundreds of lines of
  instantiation stack around one mistake. Josh renders the terminal, so it
  condenses them as they stream: the error, the first frame that is actually
  your code, and a count of what it hid. `⌥↵` expands. On by default for
  diagnostics over 20 lines.

- **macOS code signing and notarization**, which turn on by themselves once
  certificates are configured for the repository. None are configured, so the
  published builds remain unsigned.

## [1.0.3] — 2026-08-24

### Added

- A vendored **sed and awk fallback bundled into Windows builds**, so shell
  integration works on machines without them on `PATH`. Licensed GPL-2.0 and
  checksum-verified at build time.

### Fixed

- **The terminal bell still did nothing**, despite being implemented in 1.0.1.
  The `window:attention` IPC channel it calls was not on the allowlist, so
  every ring was dropped before it reached the window.

## [1.0.2] — 2026-08-21

Tagged, but no release was ever published for it. The fix below reached users
in 1.0.3.

### Fixed

- **Installers carried a native binary that could not load.** The PTY binding
  ships prebuilt binaries as platform-specific optional dependencies, and npm
  installs only the one matching the machine doing the install — so building
  both architectures on a single runner produced one working installer and one
  that could not open a shell at all. This is what shipped in 1.0.0 and 1.0.1:
  the Intel macOS build carried an arm64 binary, because the runner was Apple
  silicon. Every installer is now built on a runner of its own architecture,
  and the build fails if the packaged binary does not match.

## [1.0.1] — 2026-08-19

### Fixed

- **`confirmOnClose` and `bell` were documented but inert.** Both settings
  existed, were read, and did nothing. They now do what the documentation said.
- The headless self-test is exempt from single-instance arbitration, so it no
  longer hands its work to an already-running window.
- Line endings are normalised, so checked-in fixtures survive a clone on
  Windows.

## [1.0.0] — 2026-08-18

Initial release.

- Real pseudo-terminals — ConPTY on Windows, `forkpty` on macOS and Linux
- GPU rendering, with an automatic fallback if the WebGL context is lost
- Tabs and split panes, split any pane horizontally or vertically
- Command palette, find in terminal with match highlighting
- 7 themes, following your OS between your chosen light and dark
- Shell auto-detection: zsh, bash, fish, PowerShell 7, Windows PowerShell, cmd
- Directory-aware new tabs and splits, and session restore
- Native chrome: macOS vibrancy and inset traffic lights, Windows title-bar
  overlay
- No network access at all

Note that the macOS installers for this version and 1.0.1 shipped a native
binary for the wrong architecture; see 1.0.2.

[1.0.5]: https://github.com/joshiag1106/AI_apps/releases/tag/v1.0.5
[1.0.4]: https://github.com/joshiag1106/AI_apps/releases/tag/v1.0.4
[1.0.3]: https://github.com/joshiag1106/AI_apps/releases/tag/v1.0.3
[1.0.2]: https://github.com/joshiag1106/AI_apps/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/joshiag1106/AI_apps/releases/tag/v1.0.1
[1.0.0]: https://github.com/joshiag1106/AI_apps/releases/tag/v1.0.0
