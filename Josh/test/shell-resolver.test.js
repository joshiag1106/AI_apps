'use strict';

/**
 * Shell selection runs on all three platforms, so the filesystem probe is
 * injected. That lets one machine test the Windows and Linux behaviour too,
 * which is the whole point of a cross-platform app.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  resolveShell,
  sanitizeEnv,
  loginArgsFor,
  FALLBACKS,
} = require('../src/main/shell-resolver');

const existsOnly =
  (...paths) =>
  (candidate) =>
    paths.includes(candidate);

test('an explicit setting wins when the file exists', () => {
  const result = resolveShell({
    platform: 'darwin',
    env: { SHELL: '/bin/bash' },
    explicit: '/opt/homebrew/bin/fish',
    exists: existsOnly('/opt/homebrew/bin/fish', '/bin/bash'),
  });
  assert.strictEqual(result.file, '/opt/homebrew/bin/fish');
});

test('a configured shell that does not exist is skipped, not spawned', () => {
  const result = resolveShell({
    platform: 'linux',
    env: {},
    explicit: '/nope/does-not-exist',
    exists: existsOnly('/bin/bash'),
  });
  assert.strictEqual(result.file, '/bin/bash');
});

test('$SHELL is honoured on Unix', () => {
  const result = resolveShell({
    platform: 'linux',
    env: { SHELL: '/usr/bin/fish' },
    exists: existsOnly('/usr/bin/fish', '/bin/bash'),
  });
  assert.strictEqual(result.file, '/usr/bin/fish');
});

test('$SHELL is ignored on Windows, where it is usually a Git-Bash leftover', () => {
  const result = resolveShell({
    platform: 'win32',
    env: { SHELL: '/usr/bin/bash' },
    exists: existsOnly('C:\\Windows\\System32\\cmd.exe'),
  });
  assert.strictEqual(result.file, 'C:\\Windows\\System32\\cmd.exe');
});

test('Windows prefers PowerShell 7 when it is installed', () => {
  const result = resolveShell({
    platform: 'win32',
    env: {},
    exists: existsOnly(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\cmd.exe'
    ),
  });
  assert.strictEqual(result.file, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  assert.deepStrictEqual(result.args, []); // no -l on Windows
});

test('Windows falls back through PowerShell to cmd', () => {
  const result = resolveShell({
    platform: 'win32',
    env: {},
    exists: existsOnly('C:\\Windows\\System32\\cmd.exe'),
  });
  assert.strictEqual(result.file, 'C:\\Windows\\System32\\cmd.exe');
});

test('macOS defaults to zsh, Linux to bash', () => {
  assert.strictEqual(resolveShell({ platform: 'darwin', env: {}, exists: () => true }).file, '/bin/zsh');
  assert.strictEqual(resolveShell({ platform: 'linux', env: {}, exists: () => true }).file, '/bin/bash');
});

test('POSIX shells start as login shells so PATH is correct', () => {
  // Without -l, macOS users lose everything from /etc/paths and ~/.zprofile
  // and report "my tools are missing".
  assert.deepStrictEqual(loginArgsFor('/bin/zsh', 'darwin'), ['-l']);
  assert.deepStrictEqual(loginArgsFor('/usr/bin/fish', 'linux'), ['-l']);
  assert.deepStrictEqual(loginArgsFor('C:\\Windows\\System32\\cmd.exe', 'win32'), []);
});

test('when nothing on the list exists we still return something spawnable', () => {
  assert.strictEqual(resolveShell({ platform: 'linux', env: {}, exists: () => false }).file, '/bin/sh');
  assert.strictEqual(resolveShell({ platform: 'win32', env: {}, exists: () => false }).file, 'cmd.exe');
});

test('an unknown platform still resolves rather than crashing', () => {
  const result = resolveShell({ platform: 'freebsd', env: {}, exists: () => true });
  assert.strictEqual(typeof result.file, 'string');
  assert.ok(result.file.length > 0);
});

test('a shell path containing a null byte is refused', () => {
  const result = resolveShell({
    platform: 'linux',
    env: {},
    explicit: '/bin/sh\u0000/evil',
    exists: (p) => p === '/bin/bash' || p === '/bin/sh\u0000/evil',
  });
  assert.strictEqual(result.file, '/bin/bash');
});

test('every platform has a fallback list', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    assert.ok(Array.isArray(FALLBACKS[platform]) && FALLBACKS[platform].length > 0);
  }
});

test('Electron variables are stripped before the shell inherits the environment', () => {
  // ELECTRON_RUN_AS_NODE is the dangerous one: it makes a re-exec of our own
  // binary behave as a bare Node interpreter.
  const env = sanitizeEnv({
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ASAR: '1',
    NODE_OPTIONS: '--require /tmp/evil.js',
    PATH: '/usr/bin',
    HOME: '/home/user',
  });
  assert.strictEqual(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.strictEqual(env.ELECTRON_NO_ASAR, undefined);
  assert.strictEqual(env.NODE_OPTIONS, undefined);
  assert.strictEqual(env.PATH, '/usr/bin');
  assert.strictEqual(env.HOME, '/home/user');
});

test('the shell is told it is running in a colour-capable terminal', () => {
  const env = sanitizeEnv({});
  assert.strictEqual(env.TERM, 'xterm-256color');
  assert.strictEqual(env.COLORTERM, 'truecolor');
  assert.strictEqual(env.TERM_PROGRAM, 'Josh');
});

test('a dumb TERM is upgraded rather than passed through', () => {
  assert.strictEqual(sanitizeEnv({ TERM: 'dumb' }).TERM, 'xterm-256color');
  assert.strictEqual(sanitizeEnv({ TERM: 'screen-256color' }).TERM, 'screen-256color');
});

test('sanitizeEnv does not mutate the environment it was given', () => {
  const source = { ELECTRON_RUN_AS_NODE: '1' };
  sanitizeEnv(source);
  assert.strictEqual(source.ELECTRON_RUN_AS_NODE, '1');
});
