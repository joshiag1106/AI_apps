'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Diagnostics = require('../src/renderer/js/diagnostics.js');

test('plain text is safe', () => {
  assert.strictEqual(Diagnostics.isSafeLine('error: no matching function\n'), true);
});

test('SGR colour is safe, because diagnostics colour text', () => {
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[1;31merror:\x1b[0m oops\n'), true);
});

test('cursor movement is not safe', () => {
  // A compiler does not move the cursor. Something that does is a program
  // drawing a UI, and buffering its output would corrupt the display.
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[2Aoverwrite\n'), false);
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[Hhome\n'), false);
  assert.strictEqual(Diagnostics.isSafeLine('\x1b[2Kerase\n'), false);
});

test('an OSC sequence is not safe', () => {
  assert.strictEqual(Diagnostics.isSafeLine('\x1b]0;title\x07\n'), false);
});

test('a lone ESC with no recognisable sequence is not safe', () => {
  assert.strictEqual(Diagnostics.isSafeLine('text\x1b\n'), false);
});

test('entering the alternate screen is tracked', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1049h', false), true);
});

test('leaving the alternate screen is tracked', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1049l', true), false);
});

test('the legacy alternate-screen codes are tracked too', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?47h', false), true);
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1047h', false), true);
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?47l', true), false);
});

test('the last mode change in a chunk wins', () => {
  // vim starting and immediately exiting inside one read.
  assert.strictEqual(Diagnostics.scanScreenMode('\x1b[?1049h junk \x1b[?1049l', false), false);
});

test('a chunk with no mode change leaves the state alone', () => {
  assert.strictEqual(Diagnostics.scanScreenMode('ordinary output\n', true), true);
  assert.strictEqual(Diagnostics.scanScreenMode('ordinary output\n', false), false);
});

test('stripSgr removes colour but keeps the text', () => {
  assert.strictEqual(
    Diagnostics.stripSgr('\x1b[1;31merror:\x1b[0m no matching function\n'),
    'error: no matching function\n'
  );
});

test('stripSgr leaves a line with no escapes untouched', () => {
  assert.strictEqual(Diagnostics.stripSgr('plain\n'), 'plain\n');
});
