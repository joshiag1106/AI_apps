'use strict';
const test = require('node:test');
const assert = require('node:assert');
const KitRender = require('../src/shared/kit-render.js');
const KitThemes = require('../src/shared/kit-themes.js');
const Themes = require('../src/renderer/js/themes.js');

const TOKYO = Themes.THEMES['Tokyo Night'];

test('slots resolve from a real theme: accent and muted from ui, the rest from xterm', () => {
  const slots = KitRender.resolveSlots(TOKYO.ui, TOKYO.xterm);
  assert.strictEqual(slots.accent, TOKYO.ui.accent);
  assert.strictEqual(slots.muted, TOKYO.ui.muted);
  assert.strictEqual(slots.ok, TOKYO.xterm.green);
  assert.strictEqual(slots.warn, TOKYO.xterm.yellow);
  assert.strictEqual(slots.error, TOKYO.xterm.red);
  assert.strictEqual(slots.fg, TOKYO.xterm.foreground);
});

test('every slot resolves to a concrete colour even from an empty theme', () => {
  for (const slots of [KitRender.resolveSlots({}, {}), KitRender.resolveSlots()]) {
    for (const slot of KitThemes.SLOTS) {
      assert.match(slots[slot], /^#[0-9a-f]{6}$/i, slot);
    }
  }
});

test('a garbage colour is replaced rather than passed through into the prompt', () => {
  const slots = KitRender.resolveSlots({ accent: 'red; rm -rf /' }, { green: 42 });
  assert.match(slots.accent, /^#[0-9a-f]{6}$/i);
  assert.match(slots.ok, /^#[0-9a-f]{6}$/i);
});

test('home collapses to a tilde on an exact match and on a home-plus-slash prefix', () => {
  assert.strictEqual(KitRender.formatCwd('/home/u', '/home/u', 0, 'plain'), '~');
  assert.strictEqual(KitRender.formatCwd('/home/u/src', '/home/u', 0, 'plain'), '~/src');
});

test('a sibling directory sharing the home prefix is not mangled', () => {
  assert.strictEqual(
    KitRender.formatCwd('/home/username/src', '/home/u', 0, 'plain'),
    '/home/username/src'
  );
});

test('a truncation of zero means no truncation', () => {
  const deep = '/a/b/c/d/e';
  assert.strictEqual(KitRender.formatCwd(deep, '', 0, 'plain'), deep);
});

test('truncation keeps the trailing components and marks the elision', () => {
  const out = KitRender.formatCwd('/a/b/c/d/e', '', 2, 'plain');
  assert.strictEqual(out, '.../d/e');
  assert.strictEqual(KitRender.formatCwd('/a/b/c/d/e', '', 9, 'plain'), '/a/b/c/d/e');
});

test('root and the bare home survive truncation intact', () => {
  assert.strictEqual(KitRender.formatCwd('/', '', 2, 'plain'), '/');
  assert.strictEqual(KitRender.formatCwd('/home/u', '/home/u', 2, 'plain'), '~');
});

test('durations read in milliseconds, seconds and minutes', () => {
  assert.strictEqual(KitRender.formatDuration(850), '850ms');
  assert.strictEqual(KitRender.formatDuration(1000), '1s');
  assert.strictEqual(KitRender.formatDuration(1400), '1.4s');
  assert.strictEqual(KitRender.formatDuration(125000), '2m 5s');
  assert.strictEqual(KitRender.formatDuration(120000), '2m');
});

test('a duration never rounds up into a nonsense sixty seconds', () => {
  assert.strictEqual(KitRender.formatDuration(59950), '1m');
});

test('a clean tree shows the branch name alone', () => {
  assert.strictEqual(
    KitRender.formatGit({ branch: 'main' }, 'plain'),
    'main'
  );
});

test('zero counts are omitted', () => {
  const git = {
    branch: 'main', ahead: 0, behind: 0,
    staged: 0, unstaged: 0, untracked: 0, conflicts: 0,
  };
  assert.strictEqual(KitRender.formatGit(git, 'plain'), 'main');
});

test('each count appears with its own marker', () => {
  const only = (key) => KitRender.formatGit({ branch: 'main', [key]: 2 }, 'plain');
  const seen = new Set();
  for (const key of ['ahead', 'behind', 'staged', 'unstaged', 'untracked', 'conflicts']) {
    const out = only(key);
    assert.match(out, /^main /, key);
    assert.match(out, /2/, key);
    assert.strictEqual(seen.has(out), false, key + ' shares a marker with another count');
    seen.add(out);
  }
});

test('counts render in a fixed order', () => {
  const git = {
    branch: 'main', ahead: 1, behind: 2,
    staged: 3, unstaged: 4, untracked: 5, conflicts: 6,
  };
  const out = KitRender.formatGit(git, 'plain');
  const positions = [1, 2, 3, 4, 5, 6].map((n) => out.indexOf(String(n)));
  assert.deepStrictEqual(positions.slice().sort((a, b) => a - b), positions);
});

test('a detached head is presented as detached, not as a branch', () => {
  const attached = KitRender.formatGit({ branch: 'main' }, 'plain');
  const detached = KitRender.formatGit({ branch: 'abc1234', detached: true }, 'plain');
  assert.notStrictEqual(detached, 'abc1234');
  assert.match(detached, /abc1234/);
  assert.notStrictEqual(detached.replace('abc1234', 'main'), attached);
});

test('no branch means no git segment at all', () => {
  assert.strictEqual(KitRender.formatGit({ branch: '' }, 'plain'), '');
  assert.strictEqual(KitRender.formatGit(null, 'plain'), '');
});

test('rich and plain differ, and plain stays inside ASCII', () => {
  const segment = { type: 'char', slot: 'fg', text: KitThemes.SEPARATOR_RIGHT, fallback: '>' };
  assert.strictEqual(KitRender.pickGlyph(segment, 'rich'), KitThemes.SEPARATOR_RIGHT);
  assert.strictEqual(KitRender.pickGlyph(segment, 'plain'), '>');

  const git = { branch: 'main', staged: 1 };
  assert.notStrictEqual(KitRender.formatGit(git, 'rich'), KitRender.formatGit(git, 'plain'));
  for (const character of KitRender.formatGit(git, 'plain')) {
    assert.ok(character.codePointAt(0) < 0x80, 'plain output must stay ASCII');
  }
  assert.strictEqual(KitRender.formatCwd('/a/b/c', '', 1, 'plain'), '.../c');
  assert.notStrictEqual(
    KitRender.formatCwd('/a/b/c', '', 1, 'rich'),
    KitRender.formatCwd('/a/b/c', '', 1, 'plain')
  );
});

test('an unknown glyph mode is treated as plain', () => {
  const segment = { type: 'char', slot: 'fg', text: KitThemes.SEPARATOR_RIGHT, fallback: '>' };
  assert.strictEqual(KitRender.pickGlyph(segment, 'nonsense'), '>');
  assert.strictEqual(KitRender.pickGlyph(segment, undefined), '>');
});

const STATE = {
  user: 'ada', host: 'lovelace', cwd: '/home/ada/src/josh', home: '/home/ada',
  exit: 0, durationMs: 4200, jobs: 0, time: '09:41', venv: '',
  git: { branch: 'main', staged: 1 },
};

const CAPS = { ui: TOKYO.ui, xterm: TOKYO.xterm, glyphs: 'plain' };

test('every span carries a colour drawn from the resolved slots', () => {
  const slots = KitRender.resolveSlots(TOKYO.ui, TOKYO.xterm);
  const colours = new Set(Object.values(slots));
  for (const name of KitThemes.themeNames()) {
    const out = KitRender.renderPreview(KitThemes.THEMES[name], STATE, CAPS);
    assert.ok(Array.isArray(out.lines) && out.lines.length > 0, name);
    for (const line of out.lines) {
      for (const span of line) {
        assert.strictEqual(typeof span.text, 'string', name);
        assert.ok(colours.has(span.colour), name + ' span colour ' + span.colour);
      }
    }
  }
});

test('a multiline theme puts its prompt character on a second line', () => {
  const single = KitRender.renderPreview(KitThemes.THEMES.plain, STATE, CAPS);
  const multi = KitRender.renderPreview(KitThemes.THEMES.stack, STATE, CAPS);
  assert.strictEqual(single.lines.length, 1);
  assert.strictEqual(multi.lines.length, 2);
  assert.strictEqual(multi.lines[1].length, 1);
  assert.strictEqual(multi.lines[1][0].text.trim(), '>');
});

test('a segment with nothing to say renders no span', () => {
  const quiet = Object.assign({}, STATE, { exit: 0, durationMs: 0, git: null });
  const out = KitRender.renderPreview(KitThemes.THEMES.context, quiet, CAPS);
  const text = out.lines[0].map((s) => s.text).join('');
  assert.strictEqual(text.includes('0'), false, 'a zero exit code must not be shown');
});

test('a failing exit code is shown when the theme asks only for failures', () => {
  const failed = Object.assign({}, STATE, { exit: 127 });
  const out = KitRender.renderPreview(KitThemes.THEMES.classic, failed, CAPS);
  const text = out.lines[0].map((s) => s.text).join('');
  assert.match(text, /127/);
});

test('an empty theme renders an empty prompt rather than throwing', () => {
  const out = KitRender.renderPreview({ name: 'x', multiline: false, segments: [] }, STATE, CAPS);
  assert.deepStrictEqual(out.lines, [[]]);
  assert.doesNotThrow(() => KitRender.renderPreview(null, null, null));
});
