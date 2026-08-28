'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };
const CHAR = { k: 'char' };

test('a global gets an address in the globals region', () => {
  const m = M.createMachine();
  const obj = m.declareGlobal({ name: 'counter', ctype: INT });
  assert.ok(obj.address >= M.LAYOUT.GLOBAL_BASE);
  assert.ok(obj.address < M.LAYOUT.HEAP_BASE);
  assert.strictEqual(obj.kind, 'global');
  assert.strictEqual(obj.size, 4);
});

test('globals do not overlap', () => {
  const m = M.createMachine();
  const a = m.declareGlobal({ name: 'a', ctype: INT });
  const b = m.declareGlobal({ name: 'b', ctype: INT });
  assert.ok(b.address >= a.address + a.size);
});

test('a local lives in the stack region and below the previous frame', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  assert.ok(obj.address < M.LAYOUT.STACK_TOP);
  assert.ok(obj.address > M.LAYOUT.HEAP_BASE);
  assert.strictEqual(obj.kind, 'local');
});

test('the stack grows downward across frames', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const outer = m.declareLocal({ name: 'x', ctype: INT });
  m.pushFrame('inner');
  const inner = m.declareLocal({ name: 'y', ctype: INT });
  assert.ok(inner.address < outer.address, 'a deeper frame sits lower in memory');
});

test('objectAt finds the object containing an address, not just its first byte', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const arr = m.declareLocal({ name: 'a', ctype: { k: 'array', of: INT, length: 4 } });
  assert.strictEqual(m.objectAt(arr.address).id, arr.id);
  assert.strictEqual(m.objectAt(arr.address + 7).id, arr.id, 'mid-object address');
  assert.strictEqual(m.objectAt(arr.address + arr.size), null, 'one past the end');
});

test('popping a frame kills its objects but keeps their records', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  m.pushFrame('inner');
  const local = m.declareLocal({ name: 'y', ctype: INT });
  m.popFrame();
  assert.strictEqual(m.objectAt(local.address), null, 'no longer live');
  const record = m.recordAt(local.address);
  assert.ok(record, 'the record is retained so a dangling pointer can be diagnosed');
  assert.strictEqual(record.alive, false);
  assert.strictEqual(record.name, 'y');
});

test('allocation returns heap addresses that do not overlap', () => {
  const m = M.createMachine();
  const a = m.allocate(16);
  const b = m.allocate(16);
  assert.ok(a >= M.LAYOUT.HEAP_BASE);
  assert.ok(b >= a + 16);
  assert.strictEqual(m.objectAt(a).kind, 'heap');
});

test('allocation returns zero when memory runs out, rather than throwing', () => {
  const m = M.createMachine();
  const huge = m.allocate(M.LAYOUT.CAPACITY);
  assert.strictEqual(huge, 0, 'a failed malloc returns NULL, as in C');
});

test('release marks a heap block freed and keeps the record', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  assert.deepStrictEqual(m.release(address), { ok: true });
  assert.strictEqual(m.objectAt(address), null);
  assert.strictEqual(m.recordAt(address).freed, true);
});

test('release refuses a double free, an interior pointer and a non-heap pointer', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.release(address);
  assert.strictEqual(m.release(address).ok, false, 'double free');
  assert.strictEqual(m.release(address).reason, 'double-free');

  const fresh = m.allocate(8);
  assert.strictEqual(m.release(fresh + 4).reason, 'not-block-start', 'interior pointer');

  m.pushFrame('main');
  const local = m.declareLocal({ name: 'x', ctype: INT });
  assert.strictEqual(m.release(local.address).reason, 'not-heap');
});

test('freed heap space is not handed out again, so use-after-free stays diagnosable', () => {
  const m = M.createMachine();
  const first = m.allocate(8);
  m.release(first);
  const second = m.allocate(8);
  assert.notStrictEqual(second, first,
    'reusing the address would make a use-after-free look valid');
});

test('memory starts uninitialised and is marked on write', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  assert.strictEqual(m.isInitialised(obj.address, 4), false);
  m.markInitialised(obj.address, 4);
  assert.strictEqual(m.isInitialised(obj.address, 4), true);
});

test('initialisation is tracked per byte, not per object', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 's', ctype: { k: 'array', of: CHAR, length: 4 } });
  m.markInitialised(obj.address, 2);
  assert.strictEqual(m.isInitialised(obj.address, 2), true);
  assert.strictEqual(m.isInitialised(obj.address, 4), false,
    'a partly written object must not read as fully initialised');
  assert.strictEqual(m.isInitialised(obj.address + 2, 1), false);
});

test('calloc-style zeroing marks the whole block initialised', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.markInitialised(address, 8);
  assert.strictEqual(m.isInitialised(address, 8), true);
});

test('liveObjects and frames report what the diagram will draw', () => {
  const m = M.createMachine();
  m.declareGlobal({ name: 'g', ctype: INT });
  m.pushFrame('main');
  m.declareLocal({ name: 'x', ctype: INT });
  m.allocate(4);
  const names = m.liveObjects().map((o) => o.name);
  assert.ok(names.includes('g'));
  assert.ok(names.includes('x'));
  assert.strictEqual(m.frames().length, 1);
  assert.strictEqual(m.frames()[0].functionName, 'main');
});

test('the frame depth cap is reported rather than exhausting the stack', () => {
  const m = M.createMachine();
  let depth = 0;
  let capped = false;
  while (depth < 500) {
    const result = m.pushFrame('recurse');
    if (result === null) {
      capped = true;
      break;
    }
    depth += 1;
  }
  assert.ok(capped, 'pushFrame must report the cap by returning null');
  assert.ok(depth <= 200);
});
