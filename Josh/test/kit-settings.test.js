'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Settings, DEFAULTS, coerce } = require('../src/main/settings.js');
const KitPacks = require('../src/shared/kit-packs.js');

const KIT_KEYS = [
  'shellKit', 'shellKitPrompt', 'shellKitPacks', 'shellKitGlyphs',
  'shellKitGitUntracked', 'shellKitGitSkip', 'shellKitSafeRemove',
];

/* ------------------------------------------------------------- defaults */

test('the seven keys exist with the defaults the spec fixes', () => {
  assert.strictEqual(DEFAULTS.shellKit, false);
  assert.strictEqual(DEFAULTS.shellKitPrompt, 'classic');
  assert.deepStrictEqual(DEFAULTS.shellKitPacks, ['git', 'core']);
  assert.strictEqual(DEFAULTS.shellKitGlyphs, 'auto');
  assert.strictEqual(DEFAULTS.shellKitGitUntracked, true);
  assert.deepStrictEqual(DEFAULTS.shellKitGitSkip, []);
  assert.strictEqual(DEFAULTS.shellKitSafeRemove, false);
});

test('the master switch is off, because replacing a prompt uninvited is hostile', () => {
  // Someone running starship, Powerlevel10k or oh-my-zsh must not lose their
  // prompt to a version upgrade.
  assert.strictEqual(coerce({}).shellKit, false);
});

test('an empty settings file yields exactly the defaults', () => {
  const out = coerce({});
  for (const key of KIT_KEYS) {
    assert.deepStrictEqual(out[key], DEFAULTS[key], key);
  }
});

/* ------------------------------------------------------------- booleans */

test('the boolean switches take booleans and nothing else', () => {
  for (const key of ['shellKit', 'shellKitGitUntracked', 'shellKitSafeRemove']) {
    assert.strictEqual(coerce({ [key]: true })[key], true, key);
    assert.strictEqual(coerce({ [key]: false })[key], false, key);
    for (const junk of ['true', 1, 0, null, [], {}]) {
      assert.strictEqual(coerce({ [key]: junk })[key], DEFAULTS[key], key + ' ' + String(junk));
    }
  }
});

/* ---------------------------------------------------------------- enums */

test('the glyph mode is a three-value enum', () => {
  for (const value of ['auto', 'rich', 'plain']) {
    assert.strictEqual(coerce({ shellKitGlyphs: value }).shellKitGlyphs, value);
  }
  for (const junk of ['RICH', 'powerline', '', 1, null, ['rich']]) {
    assert.strictEqual(coerce({ shellKitGlyphs: junk }).shellKitGlyphs, 'auto', String(junk));
  }
});

/* -------------------------------------------------------- the theme name */

test('a prompt name is an identifier, never a path', () => {
  assert.strictEqual(coerce({ shellKitPrompt: 'rail' }).shellKitPrompt, 'rail');
  assert.strictEqual(coerce({ shellKitPrompt: 'my-theme' }).shellKitPrompt, 'my-theme');
  for (const junk of ['../../etc/passwd', '/abs/path', 'Has Spaces', 'CAPS', '', 42, null]) {
    assert.strictEqual(
      coerce({ shellKitPrompt: junk }).shellKitPrompt, 'classic', JSON.stringify(junk)
    );
  }
});

test('a prompt name is capped rather than truncated into something else', () => {
  const long = 'a'.repeat(200);
  assert.strictEqual(coerce({ shellKitPrompt: long }).shellKitPrompt, 'classic');
});

/* ---------------------------------------------------------------- packs */

test('pack names are allowlisted, and an unknown one is dropped in place', () => {
  const out = coerce({ shellKitPacks: ['systems', 'nonsense', 'git'] });
  assert.deepStrictEqual(out.shellKitPacks, ['systems', 'git']);
});

test('every shipped pack name survives coercion', () => {
  const all = KitPacks.packNames();
  assert.deepStrictEqual(coerce({ shellKitPacks: all }).shellKitPacks, all);
});

test('an empty pack list is a choice, not a mistake', () => {
  assert.deepStrictEqual(coerce({ shellKitPacks: [] }).shellKitPacks, []);
});

test('a packs value that is not an array falls back to the default', () => {
  for (const junk of ['git', 42, null, { git: true }]) {
    assert.deepStrictEqual(
      coerce({ shellKitPacks: junk }).shellKitPacks, DEFAULTS.shellKitPacks, String(junk)
    );
  }
});

test('junk inside the packs array is dropped without taking the array down', () => {
  assert.deepStrictEqual(coerce({ shellKitPacks: [42, null, 'git', {}] }).shellKitPacks, ['git']);
});

/* ------------------------------------------------------------- git skip */

test('skip prefixes are trimmed, filtered and capped', () => {
  const out = coerce({ shellKitGitSkip: ['  /mnt/slow  ', '', '   ', '/net/share'] });
  assert.deepStrictEqual(out.shellKitGitSkip, ['/mnt/slow', '/net/share']);
});

test('the skip list is capped so one file cannot make every prompt slow', () => {
  const many = Array.from({ length: 200 }, (unused, i) => '/p' + i);
  assert.strictEqual(coerce({ shellKitGitSkip: many }).shellKitGitSkip.length, 32);
});

test('an absurdly long skip prefix is dropped, not stored', () => {
  const out = coerce({ shellKitGitSkip: ['/ok', '/' + 'x'.repeat(5000)] });
  assert.deepStrictEqual(out.shellKitGitSkip, ['/ok']);
});

test('a skip value that is not an array falls back', () => {
  assert.deepStrictEqual(coerce({ shellKitGitSkip: '/mnt' }).shellKitGitSkip, []);
});

/* ------------------------------------------------- alongside what existed */

test('the keys that existed before still coerce exactly as they did', () => {
  const out = coerce({
    fontSize: 999, lineHeight: 0.1, cursorStyle: 'nonsense',
    theme: 'Dracula', shellArgs: ['-l'], renderer: 'canvas',
  });
  assert.strictEqual(out.fontSize, 72, 'still clamped');
  assert.strictEqual(out.lineHeight, 0.8, 'still clamped');
  assert.strictEqual(out.cursorStyle, 'bar', 'still enum-checked');
  assert.strictEqual(out.theme, 'Dracula');
  assert.deepStrictEqual(out.shellArgs, ['-l']);
  assert.strictEqual(out.renderer, 'canvas');
});

test('a settings file carrying old and new keys together round-trips', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-kit-settings-'));
  try {
    const file = path.join(directory, 'settings.json');
    const settings = new Settings(file);
    settings.save({
      fontSize: 16,
      theme: 'Nord',
      shellKit: true,
      shellKitPrompt: 'rail',
      shellKitPacks: ['git', 'systems'],
      shellKitGlyphs: 'rich',
      shellKitGitSkip: ['/mnt/slow'],
      shellKitSafeRemove: true,
    });

    const reloaded = new Settings(file).load();
    assert.strictEqual(reloaded.fontSize, 16);
    assert.strictEqual(reloaded.theme, 'Nord');
    assert.strictEqual(reloaded.shellKit, true);
    assert.strictEqual(reloaded.shellKitPrompt, 'rail');
    assert.deepStrictEqual(reloaded.shellKitPacks, ['git', 'systems']);
    assert.strictEqual(reloaded.shellKitGlyphs, 'rich');
    assert.deepStrictEqual(reloaded.shellKitGitSkip, ['/mnt/slow']);
    assert.strictEqual(reloaded.shellKitSafeRemove, true);
    assert.strictEqual(reloaded.shellKitGitUntracked, true, 'an unsaved key keeps its default');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a partial save does not reset the kit keys already stored', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-kit-settings-'));
  try {
    const file = path.join(directory, 'settings.json');
    const settings = new Settings(file);
    settings.save({ shellKit: true, shellKitPrompt: 'stack' });
    settings.save({ fontSize: 18 });

    const reloaded = new Settings(file).load();
    assert.strictEqual(reloaded.shellKit, true);
    assert.strictEqual(reloaded.shellKitPrompt, 'stack');
    assert.strictEqual(reloaded.fontSize, 18);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a hand-mangled kit section degrades to defaults, not to a crash', () => {
  const out = coerce({
    shellKit: 'yes',
    shellKitPrompt: { name: 'evil' },
    shellKitPacks: 'git,core',
    shellKitGlyphs: ['rich'],
    shellKitGitSkip: { '/mnt': true },
    shellKitSafeRemove: 1,
    shellKitGitUntracked: 'no',
  });
  for (const key of KIT_KEYS) {
    assert.deepStrictEqual(out[key], DEFAULTS[key], key);
  }
});
