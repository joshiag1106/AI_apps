# Contributing

Thanks for taking a look. Bug reports, fixes and features are all welcome.

## Getting set up

You need Node.js 20 or newer. Nothing else — no compiler, no Python, no Xcode
Command Line Tools, no Visual Studio Build Tools.

```bash
npm install
```

```bash
npm start
```

If the app will not start, run the preflight — it diagnoses and repairs the
common install problems:

```bash
npm run verify
```

## Tests

```bash
npm test
```

On a headless Linux machine, the end-to-end test needs a display:

```bash
xvfb-run --auto-servernum npm test
```

Please add tests with your change. The pure logic — IPC validators, the split
tree, settings coercion, shell resolution, palette filtering — is all testable
in plain Node with no Electron and no DOM, and that is where most behaviour
should live.

Security-relevant changes need a test that states what an attacker cannot do.
`test/validate.test.js` is the model: each case names the hostile input it
rejects.

## Layout

```
src/main/       Node-privileged. Owns PTYs, windows, settings, the trust boundary.
  validate.js       Pure validators for everything crossing IPC
  shell-resolver.js Per-OS shell detection and environment hygiene
  pty-manager.js    PTY lifecycle, session ownership, output batching
  security.js       CSP, permissions, navigation guards, external-link allowlist
  ipc.js            Every renderer-facing channel, each one validated
  settings.js       Schema-coerced, atomic, 0600
  window-manager.js Window creation and per-platform chrome
  menu.js           Native menus
  main.js           Lifecycle wiring and the headless smoke-test mode
src/preload/    The only bridge. A fixed channel allowlist, nothing else.
src/renderer/   No Node access. xterm.js, tabs, splits, palette, themes.
test/           node:test. No test framework dependency.
scripts/        verify.js (preflight) and make-icon.js (icon generation)
```

## Conventions

- **The renderer is untrusted.** Never add an IPC channel that takes a path, a
  command, or a shell argument straight from the renderer. Derive it in main.
- **Add new channels to both allowlists** — `src/preload/preload.js` and
  `src/main/ipc.js`. A channel missing from the preload list is unreachable by
  design.
- **Never use `innerHTML`.** Terminal titles and paths are attacker-controlled.
- **Comment the why, not the what.** Several non-obvious decisions (output
  batching, the `Ctrl+Shift` accelerators, `asarUnpack`) exist for reasons that
  are documented inline. Keep that up.
- Two-space indent, single quotes, semicolons — match the surrounding file.

## Adding a theme

Add an entry to `src/renderer/js/themes.js` with both an `xterm` palette and the
four `ui` tokens. It appears in the command palette automatically.

## Releasing

Push a `v*` tag. The workflow in `.github/workflows/build.yml` runs the tests on
all three operating systems, builds installers natively on each, and attaches
them to a GitHub release.
