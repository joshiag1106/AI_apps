'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Tracker = require('../src/main/input-tracker.js');

test('a fresh tracker knows nothing', () => {
  assert.strictEqual(Tracker.create().line(), null);
});

test('after a reset the line is empty, not unknown', () => {
  const t = Tracker.create();
  t.reset();
  assert.strictEqual(t.line(), '');
});

test('printable characters accumulate', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('c'); t.consume('a'); t.consume('t');
  assert.strictEqual(t.line(), 'cat');
});

test('a multi-character paste of printables accumulates', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('git st');
  assert.strictEqual(t.line(), 'git st');
});

test('backspace removes the last character', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x7f');
  assert.strictEqual(t.line(), 'ca');
});

test('backspace on an empty line stays empty rather than going negative', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('\x7f');
  assert.strictEqual(t.line(), '');
});

test('AN ARROW KEY INVALIDATES', () => {
  // The cursor moved somewhere Josh cannot model. Every later keystroke lands
  // at an unknown position, so the line is no longer knowable.
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x1b[D');
  assert.strictEqual(t.line(), null);
});

test('TAB INVALIDATES, because the shell rewrites the line', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('car'); t.consume('\t');
  assert.strictEqual(t.line(), null);
});

test('Ctrl+R invalidates, because history search replaces the line', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x12');
  assert.strictEqual(t.line(), null);
});

test('carriage return invalidates -- the line is submitted, not typed', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\r');
  assert.strictEqual(t.line(), null);
});

test('every C0 control character invalidates, except the backspace byte', () => {
  for (let code = 0; code < 0x20; code++) {
    if (code === 0x08) continue; // that byte is editing, not an escape -- see below
    const t = Tracker.create();
    t.reset();
    t.consume('x');
    t.consume(String.fromCharCode(code));
    assert.strictEqual(t.line(), null, 'control 0x' + code.toString(16) + ' must invalidate');
  }
});

test('the 0x08 backspace byte edits rather than invalidating', () => {
  // Terminals disagree about which byte Backspace sends: most send DEL (0x7f),
  // some send BS (0x08). Treating 0x08 as an unmodellable control would make
  // the tracker give up on every correction those terminals produce.
  const t = Tracker.create();
  t.reset();
  t.consume('cat');
  t.consume(String.fromCharCode(0x08));
  assert.strictEqual(t.line(), 'ca');
});

test('once invalidated, further printables do not silently resume', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('cat'); t.consume('\x1b[D'); t.consume('s');
  assert.strictEqual(t.line(), null);
});

test('the next reset resyncs after an invalidation', () => {
  // A `B` marker means the shell is at a fresh input point, so whatever
  // confused the tracker no longer matters.
  const t = Tracker.create();
  t.reset();
  t.consume('\x1b[D');
  assert.strictEqual(t.line(), null);
  t.reset();
  t.consume('ls');
  assert.strictEqual(t.line(), 'ls');
});

test('an absurdly long line invalidates rather than growing forever', () => {
  const t = Tracker.create();
  t.reset();
  t.consume('x'.repeat(Tracker.MAX_LINE + 1));
  assert.strictEqual(t.line(), null);
});
