'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { verifyChecksum } = require('../scripts/lib/verify-checksum.js');

/*
 * The binary is committed rather than fetched, because a release must not
 * depend on frippery.org being reachable -- one build already timed out
 * against it mid-release.
 *
 * Committing it moves the risk rather than removing it: an opaque blob in git
 * is only trustworthy while something still checks it against the published
 * hash. That check used to happen during the Windows build, on a downloaded
 * copy. It now happens here, on every platform, on every `npm test`.
 */

const ROOT = path.join(__dirname, '..');
const BUSYBOX = path.join(ROOT, 'vendor', 'win', 'busybox.exe');

/** The pin, read from the script rather than copied, so the two cannot drift. */
function pinnedSha256() {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-win-tools.js'), 'utf8');
  const match = /EXPECTED_SHA256\s*=\s*'([a-f0-9]{64})'/.exec(source);
  assert.ok(match, 'fetch-win-tools.js must declare a 64-character SHA256 pin');
  return match[1];
}

test('the busybox build is committed, not left to a download', () => {
  assert.ok(fs.existsSync(BUSYBOX), BUSYBOX + ' must be in the repository');
});

test('THE COMMITTED BYTES MATCH THE PINNED HASH', () => {
  assert.ok(
    verifyChecksum(fs.readFileSync(BUSYBOX), pinnedSha256()),
    'the committed binary is not the build the pin describes'
  );
});

test('it is a Windows executable, not a stray file under that name', () => {
  const head = fs.readFileSync(BUSYBOX).subarray(0, 2).toString('latin1');
  assert.strictEqual(head, 'MZ', 'a PE binary starts with the DOS header magic');
});

/*
 * sed.exe and awk.exe are byte-identical copies made at build time. Committing
 * them too would triple the cost in git for nothing.
 */
test('the derived applet copies are not committed', () => {
  for (const applet of ['sed.exe', 'awk.exe']) {
    const tracked = require('node:child_process')
      .execFileSync('git', ['check-ignore', path.join('vendor', 'win', applet)],
        { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.ok(tracked, applet + ' must stay ignored');
  }
});
