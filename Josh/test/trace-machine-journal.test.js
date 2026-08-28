'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };

/**
 * Everything that defines the machine's observable state, reduced to one
 * comparable string. The megabyte of memory is hashed rather than serialised,
 * which is both exact enough for an equality check and fast enough to run in
 * a property test; the object and frame structure is compared literally.
 */
function fingerprint(m) {
  const digest = crypto.createHash('sha256').update(m.bytes).digest('hex');
  return JSON.stringify({
    bytes: digest,
    live: m.liveObjects().map((o) => [o.id, o.address, o.size, o.alive, o.freed,
      crypto.createHash('sha256').update(o.initialised).digest('hex')]),
    frames: m.frames().map((f) => [f.id, f.functionName, f.base]),
  });
}

function small() {
  return M.createMachine();
}

test('a step with no writes still undoes cleanly', () => {
  const m = small();
  const before = fingerprint(m);
  m.beginStep();
  m.endStep();
  assert.strictEqual(m.undoStep(), true);
  assert.strictEqual(fingerprint(m), before);
});

test('undo restores memory written during a step', () => {
  const m = small();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  m.beginStep();
  m.writeValue(obj.address, INT, 42);
  m.markInitialised(obj.address, 4);
  m.endStep();
  assert.strictEqual(m.readValue(obj.address, INT), 42);
  m.undoStep();
  assert.strictEqual(m.readValue(obj.address, INT), 0, 'the bytes go back');
  assert.strictEqual(m.isInitialised(obj.address, 4), false,
    'undo must restore the initialisation bitmap too, not only the bytes');
});

test('undo removes objects declared during the step', () => {
  const m = small();
  m.beginStep();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  m.endStep();
  assert.ok(m.objectAt(obj.address));
  m.undoStep();
  assert.strictEqual(m.objectAt(obj.address), null);
  assert.strictEqual(m.recordAt(obj.address), null,
    'the record goes too, not just its liveness');
  assert.strictEqual(m.frames().length, 0);
});

test('undo restores a popped frame and its objects', () => {
  const m = small();
  m.pushFrame('main');
  m.pushFrame('inner');
  const local = m.declareLocal({ name: 'y', ctype: INT });
  m.beginStep();
  m.popFrame();
  m.endStep();
  assert.strictEqual(m.frames().length, 1);
  m.undoStep();
  assert.strictEqual(m.frames().length, 2);
  assert.ok(m.objectAt(local.address), 'the local is live again');
});

test('undo restores a freed heap block', () => {
  const m = small();
  const address = m.allocate(8);
  m.beginStep();
  m.release(address);
  m.endStep();
  assert.strictEqual(m.recordAt(address).freed, true);
  m.undoStep();
  assert.strictEqual(m.recordAt(address).freed, false);
  assert.ok(m.objectAt(address));
});

test('undo returns false when there is nothing left', () => {
  const m = small();
  assert.strictEqual(m.undoStep(), false);
  m.beginStep();
  m.endStep();
  assert.strictEqual(m.undoStep(), true);
  assert.strictEqual(m.undoStep(), false);
});

test('PROPERTY: forward N then back N is byte-identical', () => {
  const m = small();
  m.pushFrame('main');
  const a = m.declareLocal({ name: 'a', ctype: INT });
  const b = m.declareLocal({ name: 'b', ctype: INT });
  const before = fingerprint(m);

  const N = 200;
  for (let i = 0; i < N; i += 1) {
    m.beginStep();
    // A mix of writes, allocations, frames and frees, so the property covers
    // every kind of journal entry rather than only memory writes.
    m.writeValue(a.address, INT, i);
    m.markInitialised(a.address, 4);
    if (i % 3 === 0) m.writeValue(b.address, INT, i * 2);
    if (i % 5 === 0) m.allocate(16);
    if (i % 7 === 0) m.pushFrame('f' + i);
    if (i % 11 === 0 && m.frames().length > 1) m.popFrame();
    m.endStep();
  }
  for (let i = 0; i < N; i += 1) assert.strictEqual(m.undoStep(), true, 'undo ' + i);

  assert.strictEqual(fingerprint(m), before,
    'stepping forward and back must be exactly reversible');
});

test('PROPERTY: the same sequence twice produces the same state', () => {
  function run() {
    const m = small();
    m.pushFrame('main');
    const x = m.declareLocal({ name: 'x', ctype: INT });
    for (let i = 0; i < 50; i += 1) {
      m.beginStep();
      m.writeValue(x.address, INT, i * 7);
      m.markInitialised(x.address, 4);
      if (i % 4 === 0) m.allocate(8);
      m.endStep();
    }
    return fingerprint(m);
  }
  assert.strictEqual(run(), run(), 'the machine must be deterministic');
});

test('the journal caps and reports how far back it can go', () => {
  const m = small();
  m.pushFrame('main');
  const x = m.declareLocal({ name: 'x', ctype: INT });
  for (let i = 0; i < 1000; i += 1) {
    m.beginStep();
    m.writeValue(x.address, INT, i);
    m.endStep();
  }
  assert.ok(m.stepsAvailable() > 0);
  assert.ok(m.stepsAvailable() <= 1000);
  assert.ok(M.MAX_JOURNAL >= 200000);
});

test('undoing past the retained window stops rather than corrupting state', () => {
  const m = small();
  m.pushFrame('main');
  const x = m.declareLocal({ name: 'x', ctype: INT });
  for (let i = 0; i < 100; i += 1) {
    m.beginStep();
    m.writeValue(x.address, INT, i);
    m.endStep();
  }
  let undone = 0;
  while (m.undoStep()) undone += 1;
  assert.strictEqual(m.undoStep(), false);
  assert.ok(undone <= 100);
});
