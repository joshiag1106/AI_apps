'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { coerce, DEFAULTS } = require('../src/main/settings.js');

test('the two Trace keys exist and default to empty', () => {
  assert.strictEqual(DEFAULTS.traceProgram, '');
  assert.strictEqual(DEFAULTS.traceStdin, '');
});

test('a program longer than the general 512-character string cap survives', () => {
  const program = 'int main(void) { return 0; } ' + 'x'.repeat(5000);
  assert.strictEqual(coerce({ traceProgram: program }).traceProgram, program,
    'the generic string cap must not truncate a program');
});

test('the program is capped at 64 KiB and stdin at 8 KiB', () => {
  const huge = 'a'.repeat(200000);
  assert.strictEqual(coerce({ traceProgram: huge }).traceProgram.length, 65536);
  assert.strictEqual(coerce({ traceStdin: huge }).traceStdin.length, 8192);
});

test('a non-string falls back to the default', () => {
  assert.strictEqual(coerce({ traceProgram: 42 }).traceProgram, '');
  assert.strictEqual(coerce({ traceStdin: null }).traceStdin, '');
  assert.strictEqual(coerce({ traceProgram: ['x'] }).traceProgram, '');
});

test('an empty program is preserved, not treated as missing', () => {
  assert.strictEqual(coerce({ traceProgram: '' }).traceProgram, '');
});

test('the existing keys still coerce exactly as they did', () => {
  assert.strictEqual(coerce({ fontSize: 999 }).fontSize, 72);
  assert.strictEqual(coerce({ fontSize: 1 }).fontSize, 6);
  assert.strictEqual(coerce({ theme: 'Dracula' }).theme, 'Dracula');
  assert.strictEqual(coerce({}).shell, null);
  assert.strictEqual(coerce({ cursorStyle: 'wobbly' }).cursorStyle, 'bar');
  assert.strictEqual(coerce({ shell: '/bin/with space' }).shell, null);
});

test('a settings file carrying both old and new keys coerces as a whole', () => {
  const out = coerce({
    fontSize: 16,
    theme: 'Nord',
    traceProgram: 'int main(void) { return 0; }',
    traceStdin: '3 4',
    unknownKey: 'ignored',
  });
  assert.strictEqual(out.fontSize, 16);
  assert.strictEqual(out.theme, 'Nord');
  assert.strictEqual(out.traceProgram, 'int main(void) { return 0; }');
  assert.strictEqual(out.traceStdin, '3 4');
  assert.strictEqual(out.unknownKey, undefined, 'unknown keys are dropped');
});
