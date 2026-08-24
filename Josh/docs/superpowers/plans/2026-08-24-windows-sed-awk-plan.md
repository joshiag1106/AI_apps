# Windows sed/awk Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bundled `sed`/`awk` fallback in Josh's Windows installers so both tools work out of the box, without ever overriding a user's own copies.

**Architecture:** A build-time script fetches and checksum-verifies a pinned busybox-w32 build into `vendor/win/`, `electron-builder` packages it into the installer's `resources/bin-win/`, and `shell-resolver.js` appends that directory to `PATH` — Windows only, and only after everything already on the user's `PATH` — when a shell is spawned.

**Tech Stack:** Node.js built-ins only (`node:https`, `node:crypto`, `node:fs`), no new npm dependencies. Packaging via the existing `electron-builder` config.

**Spec:** [docs/superpowers/specs/2026-08-24-windows-sed-awk-design.md](../specs/2026-08-24-windows-sed-awk-design.md)

## Global Constraints

- Bundled `sed`/`awk` must be **appended** to `PATH`, never prepended — a user's own tools always resolve first.
- No new network access at app runtime — the only fetch happens at Windows build time, via `predist:win`.
- No behavior change on macOS or Linux.
- Only `sed` and `awk` ship — no other busybox-w32 applets, and the standalone `busybox.exe` itself is not packaged into the app, only the two renamed copies.
- The vendored binary is pinned by exact URL + SHA256; a checksum mismatch aborts the build loudly, never falls back to an unverified binary.
- Pinned source at design time: `https://frippery.org/files/busybox/busybox-w64u-FRP-6075-g169694ebd.exe`, SHA256 `6e263d154d8548d1eb936f65d1d8312c80df31c45974e48d6335e4dcc0f4f34c`.

---

## Task 1: Checksum verification helper

**Files:**
- Create: `scripts/lib/verify-checksum.js`
- Test: `test/verify-checksum.test.js`

**Interfaces:**
- Produces: `verifyChecksum(buffer: Buffer, expectedHex: string): boolean`

- [ ] **Step 1: Write the failing test**

```js
// test/verify-checksum.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');

const { verifyChecksum } = require('../scripts/lib/verify-checksum');

test('a buffer matching its own SHA256 verifies', () => {
  const buffer = Buffer.from('hello world');
  const hex = createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(verifyChecksum(buffer, hex), true);
});

test('a tampered buffer fails verification', () => {
  const buffer = Buffer.from('hello world');
  const hex = createHash('sha256').update(Buffer.from('something else')).digest('hex');
  assert.strictEqual(verifyChecksum(buffer, hex), false);
});

test('the expected hex is compared case-insensitively', () => {
  const buffer = Buffer.from('hello world');
  const hex = createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(verifyChecksum(buffer, hex.toUpperCase()), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/verify-checksum.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/verify-checksum'`

- [ ] **Step 3: Write the minimal implementation**

```js
// scripts/lib/verify-checksum.js
'use strict';

/**
 * Verifies a downloaded buffer against a pinned SHA256 hex digest.
 *
 * Kept separate from the download itself so the one part of vendoring a
 * third-party binary that must never be wrong - "does this match what we
 * pinned" - is unit tested without touching the network.
 */

const { createHash } = require('node:crypto');

function verifyChecksum(buffer, expectedHex) {
  const actualHex = createHash('sha256').update(buffer).digest('hex');
  return actualHex === expectedHex.toLowerCase();
}

module.exports = { verifyChecksum };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/verify-checksum.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/verify-checksum.js test/verify-checksum.test.js
git commit -m "$(cat <<'EOF'
Add checksum verification helper for vendored binaries

The Windows sed/awk fallback (see docs/superpowers/specs/2026-08-24-windows-sed-awk-design.md)
downloads a third-party binary at build time; this is the piece that
must never silently accept a corrupted or tampered download.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Windows bin-dir resolution + PATH injection in shell-resolver.js

**Files:**
- Modify: `src/main/shell-resolver.js`
- Test: `test/shell-resolver.test.js`

**Interfaces:**
- Consumes: nothing new
- Produces: `resolveWinBinDir({isPackaged: boolean, resourcesPath: string, appRoot: string}): string`, and `sanitizeEnv(sourceEnv: object, options?: {platform?: string, binDir?: string, exists?: (path: string) => boolean}): object` (options is optional and backward compatible — existing single-argument calls are unaffected)

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `test/shell-resolver.test.js`:

```js
const {
  resolveShell,
  sanitizeEnv,
  loginArgsFor,
  FALLBACKS,
  resolveWinBinDir,
} = require('../src/main/shell-resolver');
```

Append these tests to the end of `test/shell-resolver.test.js`:

```js
test('resolveWinBinDir points at the packaged resources folder when packaged', () => {
  const result = resolveWinBinDir({
    isPackaged: true,
    resourcesPath: 'C:\\Program Files\\Josh\\resources',
    appRoot: 'C:\\Program Files\\Josh\\resources\\app',
  });
  assert.strictEqual(result, 'C:\\Program Files\\Josh\\resources\\bin-win');
});

test('resolveWinBinDir points at the vendored dev copy when not packaged', () => {
  const path = require('node:path');
  const result = resolveWinBinDir({
    isPackaged: false,
    resourcesPath: undefined,
    appRoot: '/Users/dev/AI_apps/Josh',
  });
  assert.strictEqual(result, path.join('/Users/dev/AI_apps/Josh', 'vendor', 'win'));
});

test('on Windows, PATH gets the bundled bin dir appended after everything else', () => {
  const env = sanitizeEnv(
    { PATH: 'C:\\Windows\\System32' },
    { platform: 'win32', binDir: 'C:\\Program Files\\Josh\\resources\\bin-win', exists: () => true }
  );
  assert.strictEqual(env.PATH, 'C:\\Windows\\System32;C:\\Program Files\\Josh\\resources\\bin-win');
});

test('the bundled bin dir is appended to "Path" if that is the key Windows actually gave us', () => {
  const env = sanitizeEnv(
    { Path: 'C:\\Windows\\System32' },
    { platform: 'win32', binDir: 'C:\\bin-win', exists: () => true }
  );
  assert.strictEqual(env.Path, 'C:\\Windows\\System32;C:\\bin-win');
  assert.strictEqual(env.PATH, undefined);
});

test('a missing bundled bin dir leaves PATH untouched', () => {
  const env = sanitizeEnv(
    { PATH: 'C:\\Windows\\System32' },
    { platform: 'win32', binDir: 'C:\\does-not-exist', exists: () => false }
  );
  assert.strictEqual(env.PATH, 'C:\\Windows\\System32');
});

test('macOS and Linux never get the Windows bin dir appended', () => {
  for (const platform of ['darwin', 'linux']) {
    const env = sanitizeEnv(
      { PATH: '/usr/bin' },
      { platform, binDir: '/some/vendor/win', exists: () => true }
    );
    assert.strictEqual(env.PATH, '/usr/bin');
  }
});

test('sanitizeEnv with no options behaves exactly as before', () => {
  const env = sanitizeEnv({ PATH: '/usr/bin' });
  assert.strictEqual(env.PATH, '/usr/bin');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/shell-resolver.test.js`
Expected: FAIL — `resolveWinBinDir is not a function` (or `undefined`), and the PATH-appending assertions fail since `sanitizeEnv` doesn't yet accept a second argument.

- [ ] **Step 3: Implement in `src/main/shell-resolver.js`**

Add `node:path` to the requires at the top:

```js
const fsDefault = require('node:fs');
const path = require('node:path');
```

Replace the existing `sanitizeEnv` function with:

```js
/**
 * Environment hygiene before we hand control to a shell.
 *
 * Electron injects variables that confuse child processes — most importantly
 * ELECTRON_RUN_AS_NODE, which makes a re-exec of our own binary behave as a
 * bare Node interpreter. Leaving these in the shell environment is both a
 * correctness bug and a privilege-escalation foothold, so they are stripped.
 */
function sanitizeEnv(sourceEnv, { platform, binDir, exists } = {}) {
  const env = { ...sourceEnv };
  const strip = [
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'ELECTRON_NO_ASAR',
    'ELECTRON_FORCE_IS_PACKAGED',
    'ELECTRON_ENABLE_LOGGING',
    'ELECTRON_ENABLE_STACK_DUMPING',
    'NODE_OPTIONS',
    'GDK_BACKEND',
  ];
  for (const key of strip) delete env[key];

  // Announce ourselves honestly so programs can adapt (and so `clear` works).
  env.TERM = env.TERM && env.TERM !== 'dumb' ? env.TERM : 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'Josh';

  // Windows has no sed/awk out of the box. If a bundled fallback copy was
  // packaged and actually landed on disk, make it reachable - but only
  // *after* whatever the user already has on PATH, so their own tools
  // (Git Bash, WSL, Chocolatey, ...) always win over the bundled fallback.
  if (platform === 'win32' && binDir) {
    const fileExists = exists || fsDefault.existsSync;
    if (fileExists(binDir)) {
      appendToPathEnv(env, binDir, ';');
    }
  }

  return env;
}

/**
 * Appends to whichever PATH-like key already exists, case-insensitively.
 * Windows environments commonly use "Path", not "PATH"; blindly setting
 * env.PATH there would create a second, unused key and silently do nothing.
 */
function appendToPathEnv(env, dir, separator) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env[key] = env[key] ? env[key] + separator + dir : dir;
}

/**
 * Where the bundled Windows fallback tools (sed, awk) live, if anywhere.
 * A dev run reads the copy `npm run predist:win` vendored into the repo; a
 * packaged app reads the copy electron-builder placed under `resources/`.
 */
function resolveWinBinDir({ isPackaged, resourcesPath, appRoot }) {
  return isPackaged ? path.join(resourcesPath, 'bin-win') : path.join(appRoot, 'vendor', 'win');
}
```

Update the final export line:

```js
module.exports = { resolveShell, sanitizeEnv, loginArgsFor, FALLBACKS, resolveWinBinDir };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/shell-resolver.test.js`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS (all existing suites unaffected — `sanitizeEnv`'s new parameter is optional and defaults to a no-op)

- [ ] **Step 6: Commit**

```bash
git add src/main/shell-resolver.js test/shell-resolver.test.js
git commit -m "$(cat <<'EOF'
Add Windows bin-dir resolution and PATH fallback injection

sanitizeEnv now appends a bundled tools directory to PATH on Windows,
but only after everything the user already has — never overriding
their own sed/awk. resolveWinBinDir picks the dev-vendor path or the
packaged resources path depending on app.isPackaged. Both are unused
until pty-manager.js wires them in next.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire pty-manager.js to inject the Windows fallback PATH

**Files:**
- Modify: `src/main/pty-manager.js`

**Interfaces:**
- Consumes: `resolveWinBinDir`, `sanitizeEnv` from Task 2 (`src/main/shell-resolver.js`)
- Produces: nothing new — this is wiring inside `PtyManager.create()`

- [ ] **Step 1: Update the requires at the top of `src/main/pty-manager.js`**

```js
const path = require('node:path');
const { app } = require('electron');
const { randomUUID } = require('node:crypto');
const nodePty = require('@lydell/node-pty');
const { LIMITS, assertDimensions, assertWriteData, sanitizeTitle } = require('./validate');
const { resolveShell, sanitizeEnv, resolveWinBinDir } = require('./shell-resolver');
```

- [ ] **Step 2: Update `create()` to compute and pass the bin dir**

Find this line inside `create()`:

```js
    const env = sanitizeEnv(process.env);
```

Replace it with:

```js
    const binDir = resolveWinBinDir({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appRoot: path.join(__dirname, '..', '..'),
    });
    const env = sanitizeEnv(process.env, { platform: process.platform, binDir });
```

- [ ] **Step 3: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: PASS — in particular `test/smoke.test.js`, which boots a real Electron instance and spawns a real shell, still passes. On this dev machine (`process.platform !== 'win32'`), the new code path is a no-op: `sanitizeEnv` receives a `binDir` but the `platform === 'win32'` guard from Task 2 keeps `PATH` untouched.

- [ ] **Step 4: Commit**

```bash
git add src/main/pty-manager.js
git commit -m "$(cat <<'EOF'
Wire the Windows sed/awk fallback into shell environment setup

PtyManager.create() now computes the fallback bin dir and passes it
to sanitizeEnv. A no-op everywhere except win32, verified by the
existing smoke test still passing unchanged on this machine.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build-time fetch script for the vendored binary

**Files:**
- Create: `scripts/fetch-win-tools.js`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: `verifyChecksum` from Task 1 (`scripts/lib/verify-checksum.js`)
- Produces: `vendor/win/busybox.exe`, `vendor/win/sed.exe`, `vendor/win/awk.exe` on disk when run; npm script `predist:win`

There is no automated test for this task — it performs a real network
download, which the existing `scripts/verify.js` and `scripts/make-icon.js`
build helpers are likewise never unit tested for (same convention: nothing
under `scripts/` other than pure logic extracted into `scripts/lib/` is
covered by `node --test`). Verification is manual, in Step 3 below.

- [ ] **Step 1: Create `scripts/fetch-win-tools.js`**

```js
#!/usr/bin/env node
'use strict';

/**
 * Fetches a pinned, checksum-verified copy of busybox-w32 for the Windows
 * sed/awk fallback.
 * See docs/superpowers/specs/2026-08-24-windows-sed-awk-design.md.
 *
 * Wired as `predist:win`, so npm runs it automatically before
 * `npm run dist:win` and only before that script — never for dist:mac or
 * dist:linux. Skips the download if a vendored copy already on disk already
 * matches the pinned checksum, so repeated local builds don't re-fetch.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const { verifyChecksum } = require('./lib/verify-checksum');

const ROOT = path.join(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'win');

// Pinned per docs/superpowers/specs/2026-08-24-windows-sed-awk-design.md.
// Re-verify both values by hand against
// https://frippery.org/files/busybox/SHA256SUM before ever changing them —
// never trust a new URL without checking its published hash first.
const SOURCE_URL = 'https://frippery.org/files/busybox/busybox-w64u-FRP-6075-g169694ebd.exe';
const EXPECTED_SHA256 = '6e263d154d8548d1eb936f65d1d8312c80df31c45974e48d6335e4dcc0f4f34c';

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          resolve(download(res.headers.location, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GET ${url} failed: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

/** busybox-w32 dispatches by the name it was invoked as; Windows has no
 *  unprivileged symlinks, so real copies are the only portable option. */
function writeApplets(busyboxPath) {
  for (const applet of ['sed', 'awk']) {
    fs.copyFileSync(busyboxPath, path.join(VENDOR_DIR, `${applet}.exe`));
  }
  process.stdout.write('  ok    sed.exe and awk.exe written\n');
}

async function main() {
  const busyboxPath = path.join(VENDOR_DIR, 'busybox.exe');

  if (fs.existsSync(busyboxPath)) {
    const cached = fs.readFileSync(busyboxPath);
    if (verifyChecksum(cached, EXPECTED_SHA256)) {
      process.stdout.write('  ok    busybox.exe already vendored and checksum matches\n');
      writeApplets(busyboxPath);
      return;
    }
    process.stdout.write('  ..    vendored busybox.exe is stale or corrupt, re-fetching\n');
  }

  process.stdout.write(`  ..    downloading ${SOURCE_URL}\n`);
  const buffer = await download(SOURCE_URL);

  if (!verifyChecksum(buffer, EXPECTED_SHA256)) {
    process.stderr.write(
      '  FAIL  downloaded busybox.exe does not match the pinned SHA256.\n' +
        '        Refusing to use an unverified binary. If upstream shipped a\n' +
        '        new build, re-pin SOURCE_URL and EXPECTED_SHA256 by hand\n' +
        '        against https://frippery.org/files/busybox/SHA256SUM.\n'
    );
    process.exit(1);
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  fs.writeFileSync(busyboxPath, buffer);
  process.stdout.write('  ok    busybox.exe downloaded and verified\n');
  writeApplets(busyboxPath);
}

main().catch((error) => {
  process.stderr.write(`  FAIL  ${error.message}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Update `.gitignore`**

Append:

```
# Downloaded by `npm run predist:win` (see scripts/fetch-win-tools.js)
vendor/
```

- [ ] **Step 3: Update `package.json` and manually verify the script**

Add a `predist:win` entry to `"scripts"`, next to the existing `predist`:

```json
    "predist": "node scripts/verify.js",
    "predist:win": "node scripts/fetch-win-tools.js",
```

Run it by hand:

```bash
node scripts/fetch-win-tools.js
```

Expected output:
```
  ..    downloading https://frippery.org/files/busybox/busybox-w64u-FRP-6075-g169694ebd.exe
  ok    busybox.exe downloaded and verified
  ok    sed.exe and awk.exe written
```

Confirm the files landed and match the pinned checksum:

```bash
ls -la vendor/win/
shasum -a 256 vendor/win/busybox.exe
```

Expected: `vendor/win/busybox.exe`, `vendor/win/sed.exe`, `vendor/win/awk.exe` all present, each a few hundred KB to ~1-2MB, and the `shasum` output starts with `6e263d154d8548d1eb936f65d1d8312c80df31c45974e48d6335e4dcc0f4f34c`.

Run it a second time to confirm the cache path works:

```bash
node scripts/fetch-win-tools.js
```

Expected output (no download this time):
```
  ok    busybox.exe already vendored and checksum matches
  ok    sed.exe and awk.exe written
```

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-win-tools.js .gitignore package.json
git commit -m "$(cat <<'EOF'
Add build-time fetch script for the Windows sed/awk fallback

Downloads a pinned, checksum-verified busybox-w32 build into
vendor/win/ and writes sed.exe/awk.exe copies. Wired as predist:win,
so it runs automatically and only before `npm run dist:win`.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Package the fallback into the Windows installer

**Files:**
- Modify: `electron-builder.yml`

**Interfaces:**
- Consumes: `vendor/win/sed.exe`, `vendor/win/awk.exe` from Task 4
- Produces: `resources/bin-win/sed.exe`, `resources/bin-win/awk.exe` inside the packaged app — the exact path `resolveWinBinDir` (Task 2) expects when `isPackaged` is true

There is no automated test for this task (it's packaging configuration, and
this machine can't produce a real Windows installer to inspect). Verification
happens in Task 7's CI step, which runs on an actual Windows runner.

- [ ] **Step 1: Add a Windows-only `extraResources` entry**

In `electron-builder.yml`, find the `win:` block:

```yaml
win:
  target:
    - nsis
    - portable
```

Replace it with:

```yaml
win:
  target:
    - nsis
    - portable
  # sed.exe/awk.exe can't run from inside an asar archive any more than the
  # native pty.node binary can (see the file-level comment above) — they're
  # real executables, not app source, so they go into resources/ via
  # extraResources rather than the `files:` list. Only sed and awk ship, not
  # the standalone busybox.exe those two are copies of.
  extraResources:
    - from: vendor/win
      to: bin-win
      filter:
        - "sed.exe"
        - "awk.exe"
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "$(cat <<'EOF'
Package the vendored sed/awk fallback into Windows builds

extraResources copies sed.exe/awk.exe (not busybox.exe itself) from
vendor/win/ into resources/bin-win/ for Windows targets only — the
exact path resolveWinBinDir expects for a packaged app.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Documentation

**Files:**
- Create: `THIRD_PARTY_LICENSES.md`
- Modify: `README.md`

**Interfaces:** none — documentation only

- [ ] **Step 1: Create `THIRD_PARTY_LICENSES.md`**

```markdown
# Third-Party Licenses

Josh itself is MIT-licensed (see [LICENSE](LICENSE)). Windows builds also
bundle one separately-licensed executable.

## busybox-w32 (`sed.exe`, `awk.exe`)

- **What ships**: `sed.exe` and `awk.exe`, both renamed copies of a single
  busybox-w32 executable, as a fallback for the rare case where the shell
  running inside Josh doesn't already have its own `sed`/`awk` on `PATH`.
  Josh's own `PATH` handling always puts a user's own copies first — see
  `src/main/shell-resolver.js`. They run as ordinary subprocesses; nothing
  from busybox-w32 is linked into Josh's own code.
- **License**: GPL-2.0. Full text:
  <https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt>
- **Source**: <https://github.com/rmyorston/busybox-w32> (upstream of
  BusyBox itself: <https://busybox.net>). The exact pinned build is recorded
  in `scripts/fetch-win-tools.js`.
- **Modifications**: none. The vendored binary is used exactly as published
  upstream; Josh's build only copies it under the names `sed.exe`/`awk.exe`
  so it dispatches to those applets.
```

- [ ] **Step 2: Update `README.md`**

Add a bullet to the Features list, after `Shell auto-detection`:

```markdown
- **`sed`/`awk` on Windows** — bundled as a fallback if your shell doesn't already have them; your own copies always take priority (see [Third-Party Licenses](THIRD_PARTY_LICENSES.md)). On Windows on ARM, the fallback runs under x64 emulation — busybox-w32 doesn't publish a native ARM64 build.
```

Add a Troubleshooting entry, after the existing "My tools are missing from `PATH`" entry:

```markdown
**My own `sed`/`awk` isn't being used on Windows.**
Josh appends the bundled fallback to the end of `PATH`, after everything
already there, so your own installed copy should always win. If the
bundled one is running instead, check that your `sed`/`awk` are actually
on `PATH` in the shell Josh launches (a login shell — see above).
```

Add a link in the License section:

```markdown
## License

MIT — see [LICENSE](LICENSE). Windows builds also bundle a GPL-2.0 tool —
see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
```

- [ ] **Step 3: Commit**

```bash
git add THIRD_PARTY_LICENSES.md README.md
git commit -m "$(cat <<'EOF'
Document the Windows sed/awk fallback and its GPL-2.0 license

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: CI packaging verification

**Files:**
- Modify: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: the packaged output shape from Tasks 4 & 5 (`resources/bin-win/{sed,awk}.exe` inside the unpacked Windows build under `dist/`)

There is no automated test in the Node suite for this — like the existing
"Verify the shipped native binary" step it sits next to, this is a CI-only
guard that only a real Windows runner can meaningfully execute. Verification
happens by opening a PR and watching the `dist (windows-x64)` /
`dist (windows-arm64)` jobs.

- [ ] **Step 1: Add a Windows-only verification step to `build.yml`**

In `.github/workflows/build.yml`, find the existing step (inside the `dist` job):

```yaml
      - name: Verify the shipped native binary matches the target architecture
        if: runner.os != 'Windows'
        run: |
```

Immediately after that whole step (after its final `echo "Architecture matches the build target."` line, before the `- uses: actions/upload-artifact@v4` step), add:

```yaml
      - name: Verify the bundled sed/awk fallback was packaged (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          $sed = Get-ChildItem -Recurse -Path dist -Filter 'sed.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
          $awk = Get-ChildItem -Recurse -Path dist -Filter 'awk.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
          if (-not $sed) { Write-Error 'sed.exe was not packaged into dist/'; exit 1 }
          if (-not $awk) { Write-Error 'awk.exe was not packaged into dist/'; exit 1 }

          $sedOut = "hello" | & $sed.FullName -e 's/hello/world/'
          if ($sedOut -ne 'world') { Write-Error "sed.exe did not transform input as expected (got: $sedOut)"; exit 1 }

          $awkOut = "1 2 3" | & $awk.FullName '{print $2}'
          if ($awkOut -ne '2') { Write-Error "awk.exe did not extract the expected field (got: $awkOut)"; exit 1 }

          Write-Host "sed/awk fallback packaged and runnable."
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "$(cat <<'EOF'
Verify the packaged Windows sed/awk fallback in CI

Mirrors the existing native-binary architecture check: confirms
sed.exe/awk.exe landed in the packaged app and actually run, not
just that the build didn't error.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push the branch and open a PR to watch CI run for real**

```bash
git push -u origin feature/windows-sed-awk
```

```bash
gh pr create --repo joshiag1106/AI_apps --title "Add bundled sed/awk fallback for Windows" --body "$(cat <<'EOF'
## Summary
- Windows ships neither `sed` nor `awk`; macOS/Linux already have them system-wide, so this only touches Windows.
- Bundles a pinned, checksum-verified busybox-w32 build as `sed.exe`/`awk.exe`, appended to PATH *after* whatever the user already has — never an override.
- Spec: Josh/docs/superpowers/specs/2026-08-24-windows-sed-awk-design.md
- Plan: Josh/docs/superpowers/plans/2026-08-24-windows-sed-awk-plan.md

## Test plan
- [x] Unit tests for checksum verification and PATH-injection logic (`npm test`)
- [ ] CI: `dist (windows-x64)` and `dist (windows-arm64)` both pass the new sed/awk packaging-verification step
EOF
)"
```
