'use strict';

/**
 * End-to-end check: boot the real Electron binary, spawn a real shell through
 * the native PTY, run a command and confirm its output comes back.
 *
 * This is the test that actually proves cross-platform viability. The unit
 * tests all run in plain Node; only this one exercises the native binding
 * under Electron's ABI, which is exactly where a broken install shows up.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

// Required from Node (not from Electron), the electron package exports the
// filesystem path of its binary.
const electronBinary = require('electron');

test('electron boots, spawns a pty, and round-trips a command', { timeout: 120000 }, async () => {
  assert.strictEqual(
    typeof electronBinary,
    'string',
    'the electron package did not resolve to a binary path; run `npm run verify`'
  );

  const result = await new Promise((resolve, reject) => {
    const child = spawn(electronBinary, [ROOT], {
      cwd: ROOT,
      env: {
        ...process.env,
        JOSH_SMOKE: '1',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });

  // Surface the child's own diagnostics on failure; debugging a bare "exit 1"
  // from a CI runner is otherwise miserable.
  const detail = '\nstdout:\n' + result.stdout + '\nstderr:\n' + result.stderr;
  assert.strictEqual(result.code, 0, 'smoke run exited ' + result.code + detail);
  assert.match(result.stdout, /SMOKE PASS/, 'expected SMOKE PASS' + detail);
  assert.match(result.stdout, /smoke: shell=/, 'expected the resolved shell to be reported' + detail);
});
