'use strict';

/**
 * The settings file is user-editable, so `coerce` is a trust boundary too:
 * a hand-mangled or hostile file must degrade to defaults, never crash the app.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { coerce, DEFAULTS, Settings } = require('../src/main/settings');

test('an empty object yields the defaults', () => {
  assert.deepStrictEqual(coerce({}), { ...DEFAULTS });
});

test('non-objects degrade to defaults instead of throwing', () => {
  for (const value of [null, undefined, 'string', 42, [], true]) {
    assert.deepStrictEqual(coerce(value), { ...DEFAULTS });
  }
});

test('unknown keys are dropped', () => {
  const result = coerce({ evil: 'payload', fontSize: 20 });
  assert.strictEqual(result.evil, undefined);
  assert.strictEqual(result.fontSize, 20);
});

test('prototype pollution through the settings file does not take effect', () => {
  coerce(JSON.parse('{"__proto__": {"polluted": "yes"}}'));
  assert.strictEqual({}.polluted, undefined);
});

test('numbers are clamped to their documented range', () => {
  assert.strictEqual(coerce({ fontSize: 9999 }).fontSize, 72);
  assert.strictEqual(coerce({ fontSize: -5 }).fontSize, 6);
  assert.strictEqual(coerce({ scrollback: 10 }).scrollback, 100);
  assert.strictEqual(coerce({ scrollback: 1e9 }).scrollback, 200000);
});

test('fontSize and scrollback stay integers', () => {
  assert.strictEqual(coerce({ fontSize: 14.7 }).fontSize, 15);
  assert.strictEqual(Number.isInteger(coerce({ scrollback: 1000.4 }).scrollback), true);
});

test('values of the wrong type fall back to the default', () => {
  assert.strictEqual(coerce({ fontSize: 'huge' }).fontSize, DEFAULTS.fontSize);
  assert.strictEqual(coerce({ cursorBlink: 'yes' }).cursorBlink, DEFAULTS.cursorBlink);
  assert.strictEqual(coerce({ fontSize: NaN }).fontSize, DEFAULTS.fontSize);
  assert.strictEqual(coerce({ fontSize: Infinity }).fontSize, DEFAULTS.fontSize);
});

test('enumerated values reject anything off the list', () => {
  assert.strictEqual(coerce({ cursorStyle: 'block' }).cursorStyle, 'block');
  assert.strictEqual(coerce({ cursorStyle: 'laser' }).cursorStyle, DEFAULTS.cursorStyle);
  assert.strictEqual(coerce({ renderer: 'canvas' }).renderer, 'canvas');
  assert.strictEqual(coerce({ renderer: 'raytraced' }).renderer, DEFAULTS.renderer);
});

test('a shell path containing spaces is rejected as ambiguous', () => {
  assert.strictEqual(coerce({ shell: '/bin/zsh' }).shell, '/bin/zsh');
  assert.strictEqual(coerce({ shell: '/bin/sh -c evil' }).shell, null);
  assert.strictEqual(coerce({ shell: 42 }).shell, null);
});

test('shellArgs must be an array of strings and is length-capped', () => {
  assert.deepStrictEqual(coerce({ shellArgs: ['-l'] }).shellArgs, ['-l']);
  assert.strictEqual(coerce({ shellArgs: 'not-an-array' }).shellArgs, null);
  assert.strictEqual(coerce({ shellArgs: [1, 2] }).shellArgs, null);
  assert.strictEqual(coerce({ shellArgs: new Array(100).fill('-x') }).shellArgs.length, 32);
});

test('lastSession keeps only sane strings and at most twenty of them', () => {
  assert.deepStrictEqual(coerce({ lastSession: ['/tmp', '/var'] }).lastSession, ['/tmp', '/var']);
  assert.deepStrictEqual(coerce({ lastSession: ['/tmp', 42, '', null] }).lastSession, ['/tmp']);
  assert.strictEqual(coerce({ lastSession: new Array(50).fill('/tmp') }).lastSession.length, 20);
  assert.deepStrictEqual(coerce({ lastSession: 'nope' }).lastSession, []);
});

test('coercing does not mutate the shared defaults', () => {
  coerce({ lastSession: ['/tmp'] });
  assert.deepStrictEqual(DEFAULTS.lastSession, []);
});

test('a corrupt settings file on disk loads as defaults', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-settings-'));
  const file = path.join(directory, 'settings.json');
  fs.writeFileSync(file, '{ this is not json ');

  assert.deepStrictEqual(new Settings(file).load(), { ...DEFAULTS });
  fs.rmSync(directory, { recursive: true, force: true });
});

test('a missing settings file loads as defaults', () => {
  const settings = new Settings(path.join(os.tmpdir(), 'josh-does-not-exist', 'settings.json'));
  assert.deepStrictEqual(settings.load(), { ...DEFAULTS });
});

test('saving writes owner-only permissions and round-trips', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-settings-'));
  const file = path.join(directory, 'settings.json');

  new Settings(file).save({ fontSize: 18, theme: 'Nord' });

  const reloaded = new Settings(file).load();
  assert.strictEqual(reloaded.fontSize, 18);
  assert.strictEqual(reloaded.theme, 'Nord');

  if (process.platform !== 'win32') {
    // 0600: the settings file records the user's shell choice, so it should
    // not be world-readable on a shared machine.
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test('saving leaves no temporary files behind', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-settings-'));
  const settings = new Settings(path.join(directory, 'settings.json'));
  settings.save({ fontSize: 16 });
  settings.save({ fontSize: 17 });
  const leftovers = fs.readdirSync(directory).filter((name) => name.endsWith('.tmp'));
  assert.deepStrictEqual(leftovers, []);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('every setting is honoured somewhere in the app', () => {
  // A setting that exists only in the schema is a promise the app does not
  // keep. `confirmOnClose` and `bell` were both listed in the README and read
  // by no code at all; this test is what catches that class of bug.
  const root = path.join(__dirname, '..', 'src');
  const files = [];
  (function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && entry.name !== 'settings.js') files.push(full);
    }
  })(root);

  const corpus = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const inert = Object.keys(DEFAULTS).filter((key) => !corpus.includes(key));
  assert.deepStrictEqual(inert, [], 'settings defined but never read: ' + inert.join(', '));
});

test('a partial save preserves previously stored values', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-settings-'));
  const file = path.join(directory, 'settings.json');

  const settings = new Settings(file);
  settings.save({ fontSize: 20 });
  settings.save({ theme: 'Dracula' });

  const reloaded = new Settings(file).load();
  assert.strictEqual(reloaded.fontSize, 20);
  assert.strictEqual(reloaded.theme, 'Dracula');
  fs.rmSync(directory, { recursive: true, force: true });
});
