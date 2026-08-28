'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { coerce, DEFAULTS } = require('../src/main/settings.js');

test('recall and inline suggestion default on', () => {
  assert.strictEqual(DEFAULTS.recall, true);
  assert.strictEqual(DEFAULTS.recallInlineSuggest, true);
});

test('the exclude list defaults empty and the cap defaults to fifty thousand', () => {
  assert.deepStrictEqual(DEFAULTS.recallExcludePatterns, []);
  assert.strictEqual(DEFAULTS.recallMaxEntries, 50000);
});

test('the switches accept booleans and reject anything else', () => {
  assert.strictEqual(coerce({ recall: false }).recall, false);
  assert.strictEqual(coerce({ recall: 'yes' }).recall, true);
  assert.strictEqual(coerce({ recallInlineSuggest: false }).recallInlineSuggest, false);
});

test('the entry cap is clamped and kept an integer', () => {
  assert.strictEqual(coerce({ recallMaxEntries: 1 }).recallMaxEntries, 100);
  assert.strictEqual(coerce({ recallMaxEntries: 99999999 }).recallMaxEntries, 1000000);
  assert.strictEqual(coerce({ recallMaxEntries: 500.6 }).recallMaxEntries, 501);
  assert.strictEqual(coerce({ recallMaxEntries: 'lots' }).recallMaxEntries, 50000);
});

test('exclude patterns keep only non-empty strings', () => {
  assert.deepStrictEqual(
    coerce({ recallExcludePatterns: ['secret', 42, null, '', 'internal'] }).recallExcludePatterns,
    ['secret', 'internal']
  );
});

test('a non-array exclude list falls back to the default', () => {
  assert.deepStrictEqual(coerce({ recallExcludePatterns: 'secret' }).recallExcludePatterns, []);
});

test('the exclude list is capped in both count and length', () => {
  assert.strictEqual(coerce({ recallExcludePatterns: new Array(200).fill('x') }).recallExcludePatterns.length, 64);
  assert.ok(coerce({ recallExcludePatterns: ['y'.repeat(5000)] }).recallExcludePatterns[0].length <= 512);
});
