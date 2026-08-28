'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Diagnostics = require('../src/renderer/js/diagnostics.js');

test('a chunk of whole lines splits into lines with no remainder', () => {
  const out = Diagnostics.splitLines('', 'alpha\nbeta\n');
  assert.deepStrictEqual(out.lines, ['alpha\n', 'beta\n']);
  assert.strictEqual(out.rest, '');
});

test('a trailing partial line is returned as the remainder, not a line', () => {
  // The bug this test exists for: `Enter your name: ` has no newline. If it is
  // treated as a line and queued, the prompt never appears and the terminal
  // looks hung.
  const out = Diagnostics.splitLines('', 'done\nEnter your name: ');
  assert.deepStrictEqual(out.lines, ['done\n']);
  assert.strictEqual(out.rest, 'Enter your name: ');
});

test('pending text from the previous chunk is prepended before splitting', () => {
  const out = Diagnostics.splitLines('half', 'line\n');
  assert.deepStrictEqual(out.lines, ['halfline\n']);
  assert.strictEqual(out.rest, '');
});

test('CRLF terminators are preserved exactly, not normalised', () => {
  const out = Diagnostics.splitLines('', 'a\r\nb\n');
  assert.deepStrictEqual(out.lines, ['a\r\n', 'b\n']);
});

test('a bare CR is not a line terminator', () => {
  // Progress bars rewrite a line with CR and no LF. Splitting on CR would
  // shred them into hundreds of "lines".
  const out = Diagnostics.splitLines('', '50%\r75%\r100%\n');
  assert.deepStrictEqual(out.lines, ['50%\r75%\r100%\n']);
  assert.strictEqual(out.rest, '');
});

test('an empty chunk produces nothing and preserves pending', () => {
  const out = Diagnostics.splitLines('partial', '');
  assert.deepStrictEqual(out.lines, []);
  assert.strictEqual(out.rest, 'partial');
});

test('THE INVARIANT: lines joined with the remainder reproduce the input byte for byte', () => {
  const cases = [
    ['', ''],
    ['', '\n'],
    ['', '\n\n\n'],
    ['pending', 'more\ntext\r\nhere'],
    ['', '\x1b[31mred\x1b[0m\n'],
    ['', 'no newline at all'],
    ['a', '\n'],
    ['', '\r\n\r\n'],
  ];
  for (const [pending, chunk] of cases) {
    const out = Diagnostics.splitLines(pending, chunk);
    assert.strictEqual(out.lines.join('') + out.rest, pending + chunk,
      'invariant broken for ' + JSON.stringify([pending, chunk]));
  }
});
