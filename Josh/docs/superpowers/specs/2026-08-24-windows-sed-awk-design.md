# Windows `sed`/`awk` support — design

## Problem

macOS and Linux ship `sed`/`awk` system-wide, so they already work in Josh
with zero code changes — Josh just execs whatever's on the host `PATH`.
Windows ships neither. Users on Windows who don't happen to have Git Bash,
WSL, or MSYS2 installed get "command not found" the first time a script or
tutorial uses either tool.

## Goals

- `sed` and `awk` work out of the box in a Windows install of Josh, with no
  extra setup.
- A user's own `sed`/`awk` (Git Bash, WSL, Chocolatey, wherever) always takes
  priority — the bundled copies are a fallback, never an override.
- No behavior change on macOS/Linux, and no new runtime network access
  (consistent with Josh's "no network access at all" security posture).
- Reproducible builds: the exact bytes shipped are pinned and verified, the
  same trust model `npm ci` already uses via lockfile integrity hashes.

## Non-goals

- Feature-parity with GNU sed/awk. busybox-w32's implementations cover the
  common cases but are not 100% compatible with GNU-only extensions.
- Any change to macOS or Linux builds.
- Bundling a general-purpose Unix toolbox. Only `sed` and `awk` ship; nothing
  else from busybox-w32's ~130 applets.

## Approach

Fetch a pinned, checksum-verified copy of
[busybox-w32](https://github.com/rmyorston/busybox-w32) at build time,
package it into the Windows installer via `electron-builder`'s
`extraResources`, and append its directory to `PATH` at shell-spawn time —
Windows only.

busybox-w32 is a single statically-linked executable (no DLLs) that
implements `sed`, `awk`, and ~130 other Unix tools as applets selected by
how the binary is invoked. Renaming (copying) it to `sed.exe` / `awk.exe`
makes it dispatch to those applets directly, so nothing at runtime needs to
know it's really the same binary three times over.

### Why fetch-and-verify over committing binaries to git

Every other dependency in this repo (`@lydell/node-pty`, Electron, xterm.js)
is resolved through `npm ci` against a lockfile integrity hash — never
committed as a blob. Fetching busybox-w32 at build time against a hardcoded
SHA256, the same way, keeps that pattern intact instead of introducing
binary diffs into git history that no one can meaningfully review. The cost
is a network dependency during the Windows build step specifically (already
true of `npm ci` itself), not at app runtime.

## Components

**`scripts/fetch-win-tools.js`** (new, mirrors the existing `scripts/verify.js`
/ `scripts/make-icon.js` build-helper pattern)
- Downloads one pinned, versioned file from `frippery.org/files/busybox/`
  (the maintainer's own distribution point — busybox-w32 has no GitHub
  Releases) — specifically the 64-bit Unicode build
  (`busybox-w64u-FRP-<tag>.exe`), which handles non-ASCII paths correctly.
  Current latest at design time: tag `FRP-6075-g169694ebd`, file
  `busybox-w64u-FRP-6075-g169694ebd.exe`, SHA256
  `6e263d154d8548d1eb936f65d1d8312c80df31c45974e48d6335e4dcc0f4f34c`
  (confirmed against the maintainer's published `SHA256SUM` at
  `frippery.org/files/busybox/SHA256SUM`). The implementation should
  re-verify this pair against that page before hardcoding it, in case a
  newer tag has shipped since.
- Verifies the download against the SHA256 hardcoded in the script (sourced
  by hand from the maintainer's published `SHA256SUM` at pin time — the same
  trust boundary as any npm lockfile hash). Aborts the build loudly on
  mismatch; never silently proceeds with an unverified binary.
- Writes three files into a gitignored `vendor/win/` — `busybox.exe`,
  `sed.exe`, `awk.exe` (real copies; Windows has no unprivileged symlinks).
- Only runs on Windows builds. A `postinstall`-style hook is wrong here (it'd
  run on every platform); it's wired as a prerequisite of `dist:win`
  specifically, same as `preflight`/`icon` are wired into `dist:*` already.

**`electron-builder.yml`**
- New `extraResources` entry, Windows-only, copying `vendor/win/*.exe` into
  the packaged app's `resources/bin-win/` directory.

**`src/main/shell-resolver.js`**
- `sanitizeEnv` gains a `platform` and `binDir` parameter. On `win32`, it
  **appends** `binDir` to `PATH` (never prepends — a user's own tools must
  always resolve first). On other platforms, behavior is unchanged.
- `binDir` is computed once in `main.js`/`pty-manager.js`: `vendor/win/` in
  dev (`npm start`), `path.join(process.resourcesPath, 'bin-win')` when
  packaged. This mirrors how the app already distinguishes dev vs. packaged
  paths for other resources.

**CI (`build.yml`)**
- The Windows `dist` job's existing "verify the shipped native binary"-style
  guard gets a Windows-specific counterpart: after packaging, confirm
  `sed.exe` and `awk.exe` exist in the unpacked app's resources and that
  `sed.exe --version`-equivalent invocation succeeds non-interactively. This
  catches a packaging regression the same way the existing `pty.node`
  architecture check catches its class of bug.

**`THIRD_PARTY_LICENSES.md`** (new)
- busybox-w32 is GPL-2.0. Shipping it as an independent subprocess alongside
  an MIT-licensed app (not linked into Josh's own code) is the same model
  used by any app that bundles a GPL CLI tool as a separate executable. This
  file records the license text and a link to source, which GPL
  distribution requires.

## Data flow

**Build time (Windows only):** `dist:win` → `fetch-win-tools.js` downloads +
verifies → `vendor/win/{busybox,sed,awk}.exe` → `electron-builder` copies
them into the installer's `resources/bin-win/`.

**Runtime (Windows only):** `PtyManager.create()` → `resolveShell()` picks
the user's shell as today (unchanged) → `sanitizeEnv()` appends
`resources/bin-win` to that shell's `PATH` → the shell resolves `sed`/`awk`
from wherever they already exist on the user's `PATH`, falling through to
the bundled copies only if nothing else provides them.

## Error handling

- Checksum mismatch at build time: `fetch-win-tools.js` exits non-zero, the
  build fails loudly. No silent fallback to an unverified binary.
- Missing `vendor/win/` or resources directory at runtime (e.g., someone
  builds Windows without ever running the fetch script): `sanitizeEnv`
  checks the directory exists before appending it to `PATH`. If it doesn't,
  `PATH` is left alone — the app must never fail to start a shell because an
  optional fallback tool is missing.
- macOS/Linux: `binDir` is never computed, `sanitizeEnv`'s new branch never
  runs. No behavior change, verified by existing tests continuing to pass.

## Testing

- `test/shell-resolver.test.js` gains cases for the new `sanitizeEnv`
  behavior: given `platform: 'win32'` and an injected "exists" check, the
  resulting `PATH` ends with `binDir`; given `platform: 'darwin'`/`'linux'`,
  `PATH` is byte-for-byte unchanged from today. Given a `binDir` that
  "doesn't exist" (injected check), `PATH` is unchanged.
- The CI packaging-verification step (see Components) is the only place that
  exercises the real fetched binary; it isn't practical to run busybox-w32
  inside the existing cross-platform Node test suite.

## Documentation

- README: add a bullet under Features noting Windows ships `sed`/`awk` via a
  bundled fallback, plus a short Troubleshooting entry ("my own `sed`/`awk`
  isn't being used" → check `PATH` ordering, since the bundle is intentionally
  last).
- New `THIRD_PARTY_LICENSES.md` linked from the README's License section.

## Open question for later (not blocking this design)

busybox-w32 doesn't publish a native Windows-on-ARM64 build. The x64 build
above runs under Windows 11's built-in x64 emulation on ARM64 machines, so
the fallback still works there, just emulated. Worth a one-line README note;
not worth blocking on a native ARM64 build that doesn't exist upstream.
