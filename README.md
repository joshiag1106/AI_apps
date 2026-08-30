# AI_apps

[![build](https://github.com/joshiag1106/AI_apps/actions/workflows/build.yml/badge.svg)](https://github.com/joshiag1106/AI_apps/actions/workflows/build.yml)

Applications built in this workspace. Each lives in its own directory with its
own dependencies, tests and build pipeline.

## Contents

| App | What it is | Platforms |
| --- | --- | --- |
| [**Josh**](Josh/) | A fast, secure terminal emulator with tabs, split panes and GPU rendering | macOS, Windows, Linux |
| [**Kautilya**](GeoIntel/) | Multilingual geopolitical risk intelligence, with real depth on Chinese-language sources | Web |

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

## Kautilya

Geopolitical event monitoring that reads the news in the language it was written
in. It ingests 73 multilingual feeds, clusters reports of the same incident across
languages, and scores each event for *corroboration* — how many genuinely
independent outlets, countries and languages carry it — rather than for truth,
which it does not claim to determine.

The Chinese-language layer is the point: a glossary and a detector for the PRC's
official escalation ladder, so a rung-8 "strong protest" is read as the formal
signal it is rather than as ordinary adjectives.

```bash
cd GeoIntel && npm install && npm run ingest && npm run dev
```

Runs fully without any API keys. See [GeoIntel/README.md](GeoIntel/README.md) for
the scoring model and its stated limitations, and [GeoIntel/STATE.md](GeoIntel/STATE.md)
for what is verified, what is not, and where to pick the work up.

## Builds

Pushing to `master` runs Josh's test suite on macOS, Windows and Linux and builds
installers natively on each. Tagging `v*` publishes them to a GitHub release.
Kautilya has its own suite (`cd GeoIntel && npm test`) and is not yet wired into CI.
