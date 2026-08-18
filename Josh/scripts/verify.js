#!/usr/bin/env node
'use strict';

/**
 * Preflight check, wired to `prestart`, `pretest` and `predist`.
 *
 * It exists because of a real, reproducible failure: npm 11 refuses to run
 * dependency lifecycle scripts unless they have been approved, so a clean
 * `npm install` leaves Electron's own postinstall unexecuted and its binary
 * never downloads. The install "succeeds", then `npm start` fails with an
 * error that points nowhere near the cause.
 *
 * Rather than make every user debug that, this script detects the situation
 * and repairs it. It is deliberately dependency-free and runs on plain Node.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const problems = [];
const notes = [];

function ok(message) {
  process.stdout.write('  ok    ' + message + '\n');
}
function fixed(message) {
  process.stdout.write('  fixed ' + message + '\n');
}
function bad(message) {
  process.stdout.write('  FAIL  ' + message + '\n');
  problems.push(message);
}

// ---- Node version -----------------------------------------------------------

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  bad('Node ' + process.versions.node + ' is too old; this app needs Node 20 or newer.');
} else {
  ok('Node ' + process.versions.node);
}

// ---- Electron binary --------------------------------------------------------

function electronBinaryPath() {
  const pathFile = path.join(ROOT, 'node_modules', 'electron', 'path.txt');
  if (!fs.existsSync(pathFile)) return null;
  const relative = fs.readFileSync(pathFile, 'utf8').trim();
  return path.join(ROOT, 'node_modules', 'electron', 'dist', relative);
}

function electronInstalled() {
  const binary = electronBinaryPath();
  return Boolean(binary && fs.existsSync(binary));
}

if (!fs.existsSync(path.join(ROOT, 'node_modules', 'electron'))) {
  bad('The electron package is missing. Run: npm install');
} else if (electronInstalled()) {
  ok('Electron runtime present');
} else {
  // The npm 11 case. Electron ships its own downloader; invoke it directly.
  process.stdout.write('  ..    Electron binary missing, downloading it now...\n');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'electron', 'install.js')], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch (error) {
    bad('Could not download the Electron runtime: ' + error.message);
  }
  if (electronInstalled()) {
    fixed('Electron runtime downloaded');
    notes.push(
      'Your npm blocked Electron install script (npm 11+ does this by default).\n' +
        '  It has been repaired. To stop it recurring, run: npm approve-scripts electron'
    );
  } else if (problems.length === 0) {
    bad('Electron runtime still missing after attempting a repair.');
  }
}

// ---- Native PTY binding -----------------------------------------------------

const PTY_PACKAGE = '@lydell/node-pty-' + process.platform + '-' + process.arch;
const ptyDirectory = path.join(ROOT, 'node_modules', '@lydell', 'node-pty');

if (!fs.existsSync(ptyDirectory)) {
  bad('@lydell/node-pty is missing. Run: npm install');
} else if (!fs.existsSync(path.join(ROOT, 'node_modules', PTY_PACKAGE))) {
  bad(
    'No prebuilt PTY binary for ' +
      process.platform +
      '-' +
      process.arch +
      ' (expected package ' +
      PTY_PACKAGE +
      '). Run: npm install'
  );
} else {
  ok('PTY prebuild ' + PTY_PACKAGE);
}

// ---- Renderer assets --------------------------------------------------------

const requiredAssets = [
  'node_modules/@xterm/xterm/lib/xterm.js',
  'node_modules/@xterm/xterm/css/xterm.css',
  'node_modules/@xterm/addon-fit/lib/addon-fit.js',
  'node_modules/@xterm/addon-webgl/lib/addon-webgl.js',
  'node_modules/@xterm/addon-search/lib/addon-search.js',
  'node_modules/@xterm/addon-web-links/lib/addon-web-links.js',
  'node_modules/@xterm/addon-unicode11/lib/addon-unicode11.js',
  'src/renderer/index.html',
  'src/preload/preload.js',
];

const missingAssets = requiredAssets.filter((asset) => !fs.existsSync(path.join(ROOT, asset)));
if (missingAssets.length) {
  bad('Missing files: ' + missingAssets.join(', '));
} else {
  ok('Renderer assets present (' + requiredAssets.length + ' files)');
}

// ---- Result -----------------------------------------------------------------

if (notes.length) {
  process.stdout.write('\n' + notes.map((note) => '  note: ' + note).join('\n') + '\n');
}

if (problems.length) {
  process.stdout.write('\nPreflight failed:\n');
  for (const problem of problems) process.stdout.write('  - ' + problem + '\n');
  process.exit(1);
}

process.stdout.write('\nPreflight passed.\n');
