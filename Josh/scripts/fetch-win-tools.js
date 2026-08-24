#!/usr/bin/env node
'use strict';

/**
 * Fetches a pinned, checksum-verified copy of busybox-w32 for the Windows
 * sed/awk fallback. See docs/superpowers/specs/2026-08-24-windows-sed-awk-design.md.
 *
 * Wired as `predist:win`, so npm runs it before `npm run dist:win` and only
 * before that script — `dist:mac` and `dist:linux` never touch it.
 *
 * Skips the download when a vendored copy already on disk matches the pinned
 * checksum, so repeated local builds do not re-fetch. Dependency-free and runs
 * on plain Node, like the other scripts in this directory.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const { verifyChecksum } = require('./lib/verify-checksum');

const ROOT = path.join(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'win');

// Pinned deliberately. busybox-w32 publishes no GitHub releases; these come
// from the maintainer's own distribution point. Re-verify BOTH values by hand
// against https://frippery.org/files/busybox/SHA256SUM before changing them —
// never point this at a new URL without checking its published hash first.
//
// The w64u build is the 64-bit Unicode one, which handles non-ASCII paths
// correctly. There is no native ARM64 build upstream; on Windows on ARM this
// runs under the OS's x64 emulation.
const SOURCE_URL = 'https://frippery.org/files/busybox/busybox-w64u-FRP-6075-g169694ebd.exe';
const EXPECTED_SHA256 = '6e263d154d8548d1eb936f65d1d8312c80df31c45974e48d6335e4dcc0f4f34c';

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location && redirectsLeft > 0) {
          res.resume();
          resolve(download(new URL(headers.location, url).toString(), redirectsLeft - 1));
          return;
        }
        if (statusCode !== 200) {
          res.resume();
          reject(new Error('GET ' + url + ' failed: HTTP ' + statusCode));
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

/**
 * busybox dispatches on the name it was invoked as, so `sed.exe` runs the sed
 * applet. Windows has no unprivileged symlinks, which makes real copies the
 * only portable option.
 */
function writeApplets(busyboxPath) {
  for (const applet of ['sed', 'awk']) {
    fs.copyFileSync(busyboxPath, path.join(VENDOR_DIR, applet + '.exe'));
  }
  process.stdout.write('  ok    sed.exe and awk.exe written\n');
}

async function main() {
  const busyboxPath = path.join(VENDOR_DIR, 'busybox.exe');

  if (fs.existsSync(busyboxPath) && verifyChecksum(fs.readFileSync(busyboxPath), EXPECTED_SHA256)) {
    process.stdout.write('  ok    busybox.exe already vendored, checksum matches\n');
    writeApplets(busyboxPath);
    return;
  }

  process.stdout.write('  ..    downloading ' + SOURCE_URL + '\n');
  const buffer = await download(SOURCE_URL);

  if (!verifyChecksum(buffer, EXPECTED_SHA256)) {
    process.stderr.write(
      '  FAIL  downloaded busybox.exe does not match the pinned SHA256.\n' +
        '        Refusing to package an unverified binary. If upstream shipped\n' +
        '        a new build, re-pin SOURCE_URL and EXPECTED_SHA256 by hand\n' +
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
  process.stderr.write('  FAIL  ' + error.message + '\n');
  process.exit(1);
});
