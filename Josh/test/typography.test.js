'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Typography = require('../src/shared/typography.js');

/* ------------------------------------------------------------------ values */

test('the defaults are the ones the settings schema starts from', () => {
  assert.strictEqual(Typography.DEFAULTS.fontSize, 14);
  assert.strictEqual(Typography.DEFAULTS.lineHeight, 1.2);
  assert.strictEqual(Typography.DEFAULTS.letterSpacing, 0);
});

/* ------------------------------------------------------------------ adjust */

test('adjusting moves by the step given', () => {
  assert.strictEqual(Typography.adjust(14, 1, [6, 72]), 15);
  assert.strictEqual(Typography.adjust(14, -1, [6, 72]), 13);
});

test('ADJUSTING STOPS AT THE RANGE, it does not run past it', () => {
  assert.strictEqual(Typography.adjust(72, 1, [6, 72]), 72);
  assert.strictEqual(Typography.adjust(6, -1, [6, 72]), 6);
});

/*
 * 1.2 + 0.05 is 1.2000000000000002 in binary floating point, and that value
 * reaches the settings file, the prompt and the status bar. Rounding is what
 * keeps a line height readable after ten keystrokes.
 */
test('a fractional step does not accumulate binary noise', () => {
  assert.strictEqual(Typography.adjust(1.2, 0.05, [0.8, 3]), 1.25);
  let v = 1.2;
  for (let i = 0; i < 10; i++) v = Typography.adjust(v, 0.05, [0.8, 3]);
  assert.strictEqual(v, 1.7, 'ten steps of 0.05 from 1.2 is exactly 1.7');
});

test('a value that is not a number falls back rather than becoming NaN', () => {
  assert.strictEqual(Typography.adjust(undefined, 1, [6, 72], 14), 15);
  assert.strictEqual(Typography.adjust('big', 1, [6, 72], 14), 15);
});

/* ------------------------------------------------------------------- theme */

test('cycling a theme moves forward and wraps at the end', () => {
  const names = ['A', 'B', 'C'];
  assert.strictEqual(Typography.cycleTheme(names, 'A', 1), 'B');
  assert.strictEqual(Typography.cycleTheme(names, 'C', 1), 'A');
});

test('cycling backwards wraps at the start', () => {
  const names = ['A', 'B', 'C'];
  assert.strictEqual(Typography.cycleTheme(names, 'B', -1), 'A');
  assert.strictEqual(Typography.cycleTheme(names, 'A', -1), 'C');
});

/*
 * `theme` is 'auto' by default, which is not a member of the list. Cycling
 * from it must land somewhere real rather than returning undefined.
 */
test('cycling from a name that is not in the list starts at the first', () => {
  const names = ['A', 'B', 'C'];
  assert.strictEqual(Typography.cycleTheme(names, 'auto', 1), 'A');
  assert.strictEqual(Typography.cycleTheme(names, undefined, 1), 'A');
});

test('cycling an empty list yields nothing rather than throwing', () => {
  assert.strictEqual(Typography.cycleTheme([], 'A', 1), null);
});

test('the module loads as a browser global, not only as CommonJS', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'shared', 'typography.js'), 'utf8'
  );
  assert.match(src, /root\.Typography = factory\(\)/, 'the renderer loads it as window.Typography');
});

/* ------------------------------------------------------------------ ranges */

/*
 * The renderer clamps as it steps so the status bar never shows a value the
 * settings file would refuse. Sharing the ranges is what keeps the two ends
 * agreeing; duplicating them is how the reset value drifted from the default.
 */
test('the ranges are the ones the settings schema enforces', () => {
  assert.deepStrictEqual(Typography.RANGES.fontSize, [6, 72]);
  assert.deepStrictEqual(Typography.RANGES.lineHeight, [0.8, 3]);
  assert.deepStrictEqual(Typography.RANGES.letterSpacing, [-5, 10]);
});

test('every default sits inside its own range', () => {
  for (const key of Object.keys(Typography.DEFAULTS)) {
    const [min, max] = Typography.RANGES[key];
    const value = Typography.DEFAULTS[key];
    assert.ok(value >= min && value <= max, key + ' default ' + value + ' outside [' + min + ',' + max + ']');
  }
});

test('the settings schema takes its typography numbers from this module', () => {
  const Settings = require('../src/main/settings.js');
  for (const key of Object.keys(Typography.DEFAULTS)) {
    assert.strictEqual(Settings.DEFAULTS[key], Typography.DEFAULTS[key], key + ' must not be declared twice');
  }
});

test('index.html loads typography.js before the app that steps it', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8'
  );
  const typo = html.indexOf('shared/typography.js');
  const app = html.indexOf('js/app.js');
  assert.ok(typo !== -1, 'typography.js must be loaded');
  assert.ok(typo < app, 'it must load before app.js');
});
