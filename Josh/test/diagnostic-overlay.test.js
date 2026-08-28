'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Overlay = require('../src/renderer/js/diagnostic-overlay.js');

function record(id, original) {
  return {
    id: id,
    original: original || ('original ' + id + '\n'),
    summary: { headline: 'error: boom', location: 'src/a.cpp:1:1', hiddenCount: 40 },
  };
}

test('a remembered original can be retrieved by id', () => {
  const store = new Overlay.DiagnosticOverlay({});
  store.remember(record(1));
  assert.strictEqual(store.get(1).original, 'original 1\n');
});

test('the most recent original is what expand reaches for', () => {
  const store = new Overlay.DiagnosticOverlay({});
  store.remember(record(1));
  store.remember(record(2));
  assert.strictEqual(store.last().id, 2);
});

test('the store is bounded at fifty, dropping the oldest', () => {
  // A long build can produce hundreds of diagnostics. Memory must not grow
  // with the length of the build.
  const store = new Overlay.DiagnosticOverlay({});
  for (let i = 1; i <= 60; i++) store.remember(record(i));
  assert.strictEqual(store.size(), 50);
  assert.strictEqual(store.get(1), null);
  assert.strictEqual(store.get(11).original, 'original 11\n');
  assert.strictEqual(store.last().id, 60);
});

test('last() on an empty store is null rather than a throw', () => {
  const store = new Overlay.DiagnosticOverlay({});
  assert.strictEqual(store.last(), null);
  assert.strictEqual(store.isOpen(), false);
});

test('opening an unknown id does not open anything', () => {
  const store = new Overlay.DiagnosticOverlay({});
  assert.strictEqual(store.open(99), false);
  assert.strictEqual(store.isOpen(), false);
});

test('openLast on an empty store returns false', () => {
  const store = new Overlay.DiagnosticOverlay({});
  assert.strictEqual(store.openLast(), false);
});

test('the original is stored byte-for-byte, escapes and all', () => {
  const store = new Overlay.DiagnosticOverlay({});
  const raw = '\x1b[31merror\x1b[0m: boom\r\n  note\r\n';
  store.remember(record(1, raw));
  assert.strictEqual(store.get(1).original, raw);
});

test('dispose empties the store', () => {
  const store = new Overlay.DiagnosticOverlay({});
  store.remember(record(1));
  store.dispose();
  assert.strictEqual(store.size(), 0);
});
