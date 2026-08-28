'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { coerce, DEFAULTS } = require('../src/main/settings.js');

test('condensing is on by default', () => {
  assert.strictEqual(DEFAULTS.condenseDiagnostics, true);
});

test('the minimum-lines default is twenty', () => {
  assert.strictEqual(DEFAULTS.condenseDiagnosticsMinLines, 20);
});

test('the master switch accepts a boolean and rejects anything else', () => {
  assert.strictEqual(coerce({ condenseDiagnostics: false }).condenseDiagnostics, false);
  assert.strictEqual(coerce({ condenseDiagnostics: 'no' }).condenseDiagnostics, true);
  assert.strictEqual(coerce({ condenseDiagnostics: 0 }).condenseDiagnostics, true);
});

test('the minimum is clamped rather than trusted', () => {
  assert.strictEqual(coerce({ condenseDiagnosticsMinLines: 0 }).condenseDiagnosticsMinLines, 1);
  assert.strictEqual(coerce({ condenseDiagnosticsMinLines: -5 }).condenseDiagnosticsMinLines, 1);
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: 999999 }).condenseDiagnosticsMinLines,
    10000
  );
});

test('a non-numeric minimum falls back to the default', () => {
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: 'twenty' }).condenseDiagnosticsMinLines,
    20
  );
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: NaN }).condenseDiagnosticsMinLines,
    20
  );
});

test('the minimum stays an integer', () => {
  assert.strictEqual(
    coerce({ condenseDiagnosticsMinLines: 20.7 }).condenseDiagnosticsMinLines,
    21
  );
});
