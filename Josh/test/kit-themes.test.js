'use strict';
const test = require('node:test');
const assert = require('node:assert');
const KitThemes = require('../src/shared/kit-themes.js');

test('ships the five named themes', () => {
  assert.deepStrictEqual(
    KitThemes.themeNames().sort(),
    ['classic', 'context', 'plain', 'rail', 'stack']
  );
});

test('every built-in theme survives its own coercion unchanged', () => {
  for (const name of KitThemes.themeNames()) {
    const theme = KitThemes.THEMES[name];
    assert.deepStrictEqual(KitThemes.coerceTheme(theme), theme, name);
  }
});

test('drops segments with an unknown type', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{ type: 'cwd', slot: 'fg' }, { type: 'nonsense', slot: 'fg' }],
  });
  assert.strictEqual(out.segments.length, 1);
  assert.strictEqual(out.segments[0].type, 'cwd');
});

test('an unknown slot falls back to fg rather than dropping the segment', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{ type: 'cwd', slot: 'chartreuse' }],
  });
  assert.strictEqual(out.segments[0].slot, 'fg');
});

test('rejects a name that is not a safe identifier', () => {
  assert.strictEqual(KitThemes.coerceTheme({ name: '../etc', segments: [] }), null);
  assert.strictEqual(KitThemes.coerceTheme({ name: 'a b', segments: [] }), null);
  assert.strictEqual(KitThemes.coerceTheme({ name: '', segments: [] }), null);
});

test('caps the segment list', () => {
  const many = Array.from({ length: 40 }, () => ({ type: 'cwd', slot: 'fg' }));
  const out = KitThemes.coerceTheme({ name: 'x', segments: many });
  assert.strictEqual(out.segments.length, 12);
});

test('a non-object, or one with no segments array, yields null', () => {
  assert.strictEqual(KitThemes.coerceTheme(null), null);
  assert.strictEqual(KitThemes.coerceTheme([]), null);
  assert.strictEqual(KitThemes.coerceTheme({ name: 'x' }), null);
});

test('stripControls removes C0 controls and DEL but keeps ordinary text', () => {
  const dirty = 'a' + String.fromCharCode(7) + 'b' + String.fromCharCode(27) + 'c'
    + String.fromCharCode(127);
  assert.strictEqual(KitThemes.stripControls(dirty), 'abc');
  assert.strictEqual(KitThemes.stripControls('main'), 'main');
});

test('control characters are stripped out of a glyph', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{
      type: 'char', slot: 'fg',
      text: 'a' + String.fromCharCode(27) + 'b',
      fallback: '>',
    }],
  });
  assert.strictEqual(out.segments[0].text, 'ab');
});

test('an over-long glyph falls back rather than being truncated into nonsense', () => {
  const out = KitThemes.coerceTheme({
    name: 'x',
    segments: [{ type: 'char', slot: 'fg', text: 'far too long', fallback: '>' }],
  });
  assert.strictEqual(out.segments[0].text, '>');
});

test('the rail theme uses the powerline separator code point', () => {
  assert.strictEqual(KitThemes.SEPARATOR_RIGHT.codePointAt(0), 0xE0B0);
  const charSegment = KitThemes.THEMES.rail.segments.find((s) => s.type === 'char');
  assert.strictEqual(charSegment.text, KitThemes.SEPARATOR_RIGHT);
  assert.strictEqual(charSegment.fallback, '>');
});
