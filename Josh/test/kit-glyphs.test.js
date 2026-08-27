'use strict';
const test = require('node:test');
const assert = require('node:assert');
const KitGlyphs = require('../src/renderer/js/kit-glyphs.js');
const KitThemes = require('../src/shared/kit-themes.js');

/** A measure that returns a width per string, and records what it was asked. */
function measurer(widths, log) {
  return (text) => {
    if (log) log.push(text);
    if (!Object.prototype.hasOwnProperty.call(widths, text)) return NaN;
    return widths[text];
  };
}

const P = KitGlyphs.POWERLINE;
const U = KitGlyphs.UNDEFINED_GLYPH;

test('the two probes are the separator and a code point no font defines', () => {
  assert.strictEqual(P.codePointAt(0), 0xE0B0);
  assert.strictEqual(P, KitThemes.SEPARATOR_RIGHT, 'measure what the theme will draw');
  assert.strictEqual(U.codePointAt(0), 0x10FFFD);
});

test('equal widths mean both fell back to the same box, so plain', () => {
  assert.strictEqual(KitGlyphs.detectGlyphs(measurer({ [P]: 8, [U]: 8 })), 'plain');
});

test('different widths mean the font really has the glyph, so rich', () => {
  assert.strictEqual(KitGlyphs.detectGlyphs(measurer({ [P]: 8.4, [U]: 12 })), 'rich');
  assert.strictEqual(KitGlyphs.detectGlyphs(measurer({ [P]: 14, [U]: 8 })), 'rich');
});

test('a difference below the noise floor is not a difference', () => {
  assert.strictEqual(KitGlyphs.detectGlyphs(measurer({ [P]: 8, [U]: 8.001 })), 'plain');
  assert.strictEqual(KitGlyphs.detectGlyphs(measurer({ [P]: 8, [U]: 8.5 })), 'rich');
});

test('a measure that throws yields plain', () => {
  assert.strictEqual(KitGlyphs.detectGlyphs(() => { throw new Error('no canvas'); }), 'plain');
});

test('a measure that returns nonsense yields plain', () => {
  for (const widths of [
    { [P]: NaN, [U]: 8 },
    { [P]: 8, [U]: NaN },
    { [P]: 0, [U]: 0 },
    { [P]: -1, [U]: 8 },
    { [P]: Infinity, [U]: 8 },
  ]) {
    assert.strictEqual(KitGlyphs.detectGlyphs(measurer(widths)), 'plain', JSON.stringify(widths));
  }
});

test('no measure at all yields plain', () => {
  for (const value of [null, undefined, 'nope', 42, {}]) {
    assert.strictEqual(KitGlyphs.detectGlyphs(value), 'plain', String(value));
  }
});

test('an empty font measures nothing rather than guessing rich', () => {
  assert.strictEqual(KitGlyphs.detectGlyphs(measurer({})), 'plain');
});

/* ------------------------------------------------------------- overrides */

test('an explicit mode is returned without measuring at all', () => {
  for (const wanted of ['rich', 'plain']) {
    const log = [];
    const measure = measurer({ [P]: 8, [U]: 20 }, log);
    assert.strictEqual(KitGlyphs.resolveGlyphs({ shellKitGlyphs: wanted }, measure), wanted);
    assert.deepStrictEqual(log, [], wanted + ' must not measure');
  }
});

test('auto measures, and so does a missing or malformed setting', () => {
  for (const setting of [{ shellKitGlyphs: 'auto' }, {}, null, { shellKitGlyphs: 42 }]) {
    const log = [];
    const measure = measurer({ [P]: 8, [U]: 20 }, log);
    assert.strictEqual(KitGlyphs.resolveGlyphs(setting, measure), 'rich', JSON.stringify(setting));
    assert.deepStrictEqual(log, [P, U], 'both probes must be measured');
  }
});

test('auto with no way to measure still yields plain', () => {
  assert.strictEqual(KitGlyphs.resolveGlyphs({ shellKitGlyphs: 'auto' }, null), 'plain');
});

/* ----------------------------------------------------------- the canvas half */

test('no document means no measuring function, which reads as plain', () => {
  assert.strictEqual(KitGlyphs.measureWithCanvas('monospace', 14, null), null);
  assert.strictEqual(KitGlyphs.detectGlyphs(KitGlyphs.measureWithCanvas('monospace', 14, null)),
    'plain');
});

test('a document whose canvas has no 2d context yields no measuring function', () => {
  const doc = { createElement: () => ({ getContext: () => null }) };
  assert.strictEqual(KitGlyphs.measureWithCanvas('monospace', 14, doc), null);
});

test('a canvas that throws on getContext yields no measuring function', () => {
  const doc = { createElement: () => ({ getContext: () => { throw new Error('blocked'); } }) };
  assert.strictEqual(KitGlyphs.measureWithCanvas('monospace', 14, doc), null);
});

test('the measuring function uses the real font stack it was given', () => {
  let assignedFont = '';
  const doc = {
    createElement: () => ({
      getContext: () => ({
        set font(value) { assignedFont = value; },
        get font() { return assignedFont; },
        measureText: (text) => ({ width: text === P ? 9 : 15 }),
      }),
    }),
  };
  const measure = KitGlyphs.measureWithCanvas('JetBrains Mono, monospace', 18, doc);
  assert.strictEqual(assignedFont, '18px JetBrains Mono, monospace');
  assert.strictEqual(KitGlyphs.detectGlyphs(measure), 'rich');
});

test('a nonsensical font size falls back rather than producing a broken font string', () => {
  let assignedFont = '';
  const doc = {
    createElement: () => ({
      getContext: () => ({
        set font(value) { assignedFont = value; },
        get font() { return assignedFont; },
        measureText: () => ({ width: 8 }),
      }),
    }),
  };
  KitGlyphs.measureWithCanvas('', 0, doc);
  assert.strictEqual(assignedFont, '14px monospace');
});
