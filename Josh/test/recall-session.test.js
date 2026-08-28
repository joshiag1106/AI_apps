'use strict';

/**
 * The wiring between the parser, the tracker, the store and the renderer.
 *
 * Driven through PtyManager's own event handling with a hand-built session
 * record, so the logic is exercised without spawning a shell -- the real
 * spawn path is already covered by smoke.test.js.
 */

const test = require('node:test');
const assert = require('node:assert');

const { PtyManager } = require('../src/main/pty-manager.js');
const Parser = require('../src/main/semantic-parser.js');
const InputTracker = require('../src/main/input-tracker.js');

const NONCE = 'a'.repeat(32);

/** A store that records what it was asked to keep, without touching disk. */
function fakeStore(entries) {
  const kept = [];
  return {
    kept,
    candidates: () => entries || [],
    record: (entry) => { kept.push(entry); return true; },
  };
}

function harness(options) {
  const suggestions = [];
  const store = (options && options.store) || fakeStore([]);
  const manager = new PtyManager({
    onSuggestion: (windowId, sessionId, text) => suggestions.push(text),
    recallStore: store,
  });
  const record = {
    id: 'session-1',
    windowId: 1,
    cwd: '/project',
    recall: {
      nonce: NONCE,
      inlineSuggest: !(options && options.inlineSuggest === false),
      state: Parser.createSession(NONCE),
      tracker: InputTracker.create(),
      pending: null,
      fingerprint: ['git'],
      fingerprintFor: '/project',
    },
  };
  return { manager, record, suggestions, store };
}

test('a completed command is recorded once, with its exit code and duration', () => {
  const h = harness();
  h.manager._onRecallEvent(h.record, { type: 'B', cmd: null, exit: null });
  h.manager._onRecallEvent(h.record, { type: 'C', cmd: 'cargo test', exit: null });
  h.manager._onRecallEvent(h.record, { type: 'D', cmd: null, exit: 0 });

  assert.strictEqual(h.store.kept.length, 1);
  assert.strictEqual(h.store.kept[0].cmd, 'cargo test');
  assert.strictEqual(h.store.kept[0].exit, 0);
  assert.strictEqual(h.store.kept[0].cwd, '/project');
  assert.ok(typeof h.store.kept[0].ms === 'number');
});

test('a failing command is recorded with its real exit code', () => {
  const h = harness();
  h.manager._onRecallEvent(h.record, { type: 'C', cmd: 'cargo build', exit: null });
  h.manager._onRecallEvent(h.record, { type: 'D', cmd: null, exit: 101 });
  assert.strictEqual(h.store.kept[0].exit, 101);
});

test('a D with no C before it records nothing', () => {
  // An interrupted or out-of-order session must not invent a command.
  const h = harness();
  h.manager._onRecallEvent(h.record, { type: 'D', cmd: null, exit: 0 });
  assert.strictEqual(h.store.kept.length, 0);
});

test('a session with Recall off has no recall state and records nothing', () => {
  const h = harness();
  h.record.recall = null;
  h.manager._onRecallEvent(h.record, { type: 'C', cmd: 'ls', exit: null });
  h.manager._onRecallEvent(h.record, { type: 'D', cmd: null, exit: 0 });
  assert.strictEqual(h.store.kept.length, 0);
  assert.strictEqual(h.suggestions.length, 0);
});

test('B clears any suggestion that was showing', () => {
  const h = harness();
  h.manager._onRecallEvent(h.record, { type: 'B', cmd: null, exit: null });
  assert.deepStrictEqual(h.suggestions, ['']);
});

const HISTORY = [
  { cmd: 'cargo test --release', cwd: '/project', fp: ['git'], exit: 0, ms: 10,
    ts: Math.floor(Date.now() / 1000) - 60 },
];

test('a suggestion is offered for the line being typed', () => {
  const h = harness({ store: fakeStore(HISTORY) });
  h.record.recall.state.phase = 'input';
  h.record.recall.tracker.reset();
  h.record.recall.tracker.consume('cargo ');
  h.manager._suggest(h.record);
  assert.strictEqual(h.suggestions[h.suggestions.length - 1], 'test --release');
});

test('NOTHING IS SUGGESTED WHILE A COMMAND IS RUNNING', () => {
  // A suggestion painted over a running program's output is nonsense.
  const h = harness({ store: fakeStore(HISTORY) });
  h.record.recall.state.phase = 'running';
  h.record.recall.tracker.reset();
  h.record.recall.tracker.consume('cargo ');
  h.manager._suggest(h.record);
  assert.strictEqual(h.suggestions.length, 0);
});

test('nothing is suggested once the tracker has given up on the line', () => {
  const h = harness({ store: fakeStore(HISTORY) });
  h.record.recall.state.phase = 'input';
  h.record.recall.tracker.reset();
  h.record.recall.tracker.consume('cargo ');
  h.record.recall.tracker.consume('\x1b[D'); // an arrow key: position now unknown
  h.manager._suggest(h.record);
  assert.strictEqual(h.suggestions.length, 0);
});

test('nothing is suggested when inline suggestion is switched off', () => {
  const h = harness({ store: fakeStore(HISTORY), inlineSuggest: false });
  h.record.recall.state.phase = 'input';
  h.record.recall.tracker.reset();
  h.record.recall.tracker.consume('cargo ');
  h.manager._suggest(h.record);
  assert.strictEqual(h.suggestions.length, 0);
});

test('SUGGESTION TEXT IS SANITISED BEFORE IT CROSSES THE BOUNDARY', () => {
  // A historical command carrying an escape sequence must not be able to
  // paint the renderer's UI.
  const hostile = [{
    cmd: 'echo \x1b[31mred\x1b[0m and more',
    cwd: '/project', fp: ['git'], exit: 0, ms: 1,
    ts: Math.floor(Date.now() / 1000) - 60,
  }];
  const h = harness({ store: fakeStore(hostile) });
  h.record.recall.state.phase = 'input';
  h.record.recall.tracker.reset();
  h.record.recall.tracker.consume('echo ');
  h.manager._suggest(h.record);
  const shown = h.suggestions[h.suggestions.length - 1];
  assert.ok(shown, 'a suggestion should be offered');
  assert.doesNotMatch(shown, /\x1b/, 'no escape may reach the renderer');
});
