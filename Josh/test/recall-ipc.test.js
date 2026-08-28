'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Validate = require('../src/main/validate.js');

const PRELOAD = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preload', 'preload.js'), 'utf8'
);

const ch = (code) => String.fromCharCode(code);
const ESC = ch(27);
const NUL = ch(0);
const BEL = ch(7);
const LF = ch(10);
const DEL = ch(127);

test('ordinary suggestion text passes through', () => {
  assert.strictEqual(Validate.sanitizeSuggestion('test --release'), 'test --release');
});

test('CONTROL CHARACTERS ARE STRIPPED', () => {
  // Suggestion text derives from previously executed commands. A historical
  // command carrying an escape sequence must not be able to paint the UI.
  assert.strictEqual(Validate.sanitizeSuggestion('ls' + ESC + '[31m'), 'ls[31m');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + NUL + 'b'), 'ab');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + LF + 'b'), 'ab');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + BEL + 'b'), 'ab');
  assert.strictEqual(Validate.sanitizeSuggestion('a' + DEL + 'b'), 'ab');
});

test('every C0 control byte is removed', () => {
  for (let code = 0; code < 32; code++) {
    assert.strictEqual(Validate.sanitizeSuggestion('a' + ch(code) + 'b'), 'ab',
      'control ' + code + ' must be stripped');
  }
});

test('the length is clamped', () => {
  assert.ok(Validate.sanitizeSuggestion('x'.repeat(10000)).length <= 512);
});

test('a non-string suggestion becomes the empty string, never undefined', () => {
  assert.strictEqual(Validate.sanitizeSuggestion(null), '');
  assert.strictEqual(Validate.sanitizeSuggestion(undefined), '');
  assert.strictEqual(Validate.sanitizeSuggestion({}), '');
});

test('the suggestion event is on the preload event allowlist', () => {
  assert.match(PRELOAD, /'recall:suggestion'/);
});

test('RECALL ADDS NO INVOKE CHANNEL', () => {
  // The whole design turns on main pushing suggestions rather than the
  // renderer asking for them. If this count moves, that property was lost.
  const block = /const INVOKE_CHANNELS = new Set\(\[([\s\S]*?)\]\)/.exec(PRELOAD);
  assert.ok(block, 'INVOKE_CHANNELS must be declarable');
  const count = (block[1].match(/'[^']+'/g) || []).length;
  assert.strictEqual(count, 16, 'invoke channels must stay at 16, got ' + count);
});
