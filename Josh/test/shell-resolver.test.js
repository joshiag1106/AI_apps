'use strict';

/**
 * Shell selection runs on all three platforms, so the filesystem probe is
 * injected. That lets one machine test the Windows and Linux behaviour too,
 * which is the whole point of a cross-platform app.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  resolveShell,
  sanitizeEnv,
  loginArgsFor,
  FALLBACKS,
  resolveWinBinDir,
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

test('COMSPEC does not preempt PowerShell', () => {
  // Regression: COMSPEC is always set to cmd.exe on Windows. Consulting it
  // before the fallback list made the PowerShell preference dead code, and
  // every Windows user silently got cmd.exe. CI caught it; this pins it.
  const result = resolveShell({
    platform: 'win32',
    env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
    exists: existsOnly(
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\cmd.exe'
    ),
  });
  assert.strictEqual(result.file, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
});

test('COMSPEC still rescues a system with no shell at any known path', () => {
  const result = resolveShell({
    platform: 'win32',
    env: { COMSPEC: 'D:\\odd\\location\\cmd.exe' },
    exists: existsOnly('D:\\odd\\location\\cmd.exe'),
  });
  assert.strictEqual(result.file, 'D:\\odd\\location\\cmd.exe');
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

// ---- Bundled Windows fallback tools (sed, awk) -------------------------------

test('resolveWinBinDir points at the packaged resources folder when packaged', () => {
  const result = resolveWinBinDir({
    isPackaged: true,
    resourcesPath: 'C:\\Program Files\\Josh\\resources',
    appRoot: 'C:\\Program Files\\Josh\\resources\\app',
  });
  assert.strictEqual(result, path.join('C:\\Program Files\\Josh\\resources', 'bin-win'));
});

test('resolveWinBinDir points at the vendored dev copy when not packaged', () => {
  const result = resolveWinBinDir({
    isPackaged: false,
    resourcesPath: undefined,
    appRoot: '/Users/dev/AI_apps/Josh',
  });
  assert.strictEqual(result, path.join('/Users/dev/AI_apps/Josh', 'vendor', 'win'));
});

test('on Windows, PATH gets the bundled bin dir appended after everything else', () => {
  // Appended, never prepended: a user's own sed/awk (Git Bash, WSL,
  // Chocolatey) must always win over the copy we ship as a fallback.
  const env = sanitizeEnv(
    { PATH: 'C:\\Windows\\System32' },
    { platform: 'win32', binDir: 'C:\\Josh\\bin-win', exists: () => true }
  );
  assert.strictEqual(env.PATH, 'C:\\Windows\\System32;C:\\Josh\\bin-win');
});

test('the bundled bin dir is appended to "Path" when that is the key Windows gave us', () => {
  // Windows environments commonly spell it "Path". Setting env.PATH there
  // would create a second, ignored key and silently do nothing.
  const env = sanitizeEnv(
    { Path: 'C:\\Windows\\System32' },
    { platform: 'win32', binDir: 'C:\\Josh\\bin-win', exists: () => true }
  );
  assert.strictEqual(env.Path, 'C:\\Windows\\System32;C:\\Josh\\bin-win');
  assert.strictEqual(env.PATH, undefined);
});

test('a missing bundled bin dir leaves PATH untouched', () => {
  // Someone can build Windows without ever running the fetch script. A shell
  // must still start; an absent optional tool is not a fatal condition.
  const env = sanitizeEnv(
    { PATH: 'C:\\Windows\\System32' },
    { platform: 'win32', binDir: 'C:\\does-not-exist', exists: () => false }
  );
  assert.strictEqual(env.PATH, 'C:\\Windows\\System32');
});

test('an environment with no PATH at all still receives the bundled bin dir', () => {
  const env = sanitizeEnv({}, { platform: 'win32', binDir: 'C:\\Josh\\bin-win', exists: () => true });
  assert.strictEqual(env.PATH, 'C:\\Josh\\bin-win');
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
