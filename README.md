# AI_apps

[![build](https://github.com/joshiag1106/AI_apps/actions/workflows/build.yml/badge.svg)](https://github.com/joshiag1106/AI_apps/actions/workflows/build.yml)

Applications built in this workspace. Each lives in its own directory with its
own dependencies, tests and build pipeline.

## Contents

| App | What it is | Platforms |
| --- | --- | --- |
| [**Josh**](Josh/) | A fast, secure terminal emulator with tabs, split panes and GPU rendering | macOS, Windows, Linux |

## Josh

A real terminal emulator, not a shell wrapper — `vim`, `htop`, `ssh`, `tmux`,
job control, `Ctrl+C`, 24-bit colour and Unicode all behave as they do in
Terminal.app or Windows Terminal.

Built on Electron and xterm.js with a deliberately strict security posture: the
renderer has no Node access, there is no network capability of any kind, and
every message crossing the IPC boundary is validated. Requires only Node.js 20+
to build — no compiler, no Python, no Xcode Command Line Tools, no Visual Studio
Build Tools on any platform.

```bash
cd Josh && npm install && npm start
```

See [Josh/README.md](Josh/README.md) for installation, keyboard shortcuts,
settings and the security model.

## Builds

Pushing to `master` runs the test suite on macOS, Windows and Linux and builds
installers natively on each. Tagging `v*` publishes them to a GitHub release.
