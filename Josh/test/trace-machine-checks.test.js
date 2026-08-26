'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };
const ARR5 = { k: 'array', of: INT, length: 5 };

function machineWithLocals() {
  const m = M.createMachine();
  m.pushFrame('main');
  return m;
}

test('a read of initialised memory is fine', () => {
  const m = machineWithLocals();
  const x = m.declareLocal({ name: 'x', ctype: INT });
  m.markInitialised(x.address, 4);
  assert.strictEqual(m.checkRead(x.address, 4), null);
});

test('1. reading uninitialised memory names the variable', () => {
  const m = machineWithLocals();
  const x = m.declareLocal({ name: 'x', ctype: INT });
  const d = m.checkRead(x.address, 4);
  assert.strictEqual(d.code, 'uninitialised-read');
  assert.ok(d.terse.length > 0);
  assert.ok(d.plain.includes('x'), 'the message should name the variable');
  assert.deepStrictEqual(d.highlight, [{ address: x.address, size: 4 }]);
});

test('1b. a partly initialised object still reports on the unwritten part', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  m.markInitialised(arr.address, 8);
  assert.strictEqual(m.checkRead(arr.address, 8), null);
  assert.strictEqual(m.checkRead(arr.address + 8, 4).code, 'uninitialised-read');
});

test('2 and 3. out-of-bounds read and write are distinguished', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  m.markInitialised(arr.address, 20);
  const read = m.checkRead(arr.address + 20, 4);
  const write = m.checkWrite(arr.address + 20, 4);
  assert.strictEqual(read.code, 'out-of-bounds-read');
  assert.strictEqual(write.code, 'out-of-bounds-write');
  assert.ok(read.plain.includes('a'), 'name the array that was overrun');
  assert.ok(/5/.test(read.plain), 'say how long it actually is');
});

test('4. use after free says what the block was', () => {
  const m = M.createMachine();
  const address = m.allocate(16);
  m.markInitialised(address, 16);
  m.release(address);
  const d = m.checkRead(address, 4);
  assert.strictEqual(d.code, 'use-after-free');
  assert.ok(d.plain.toLowerCase().includes('free'));
});

test('5. double free', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.release(address);
  assert.strictEqual(m.checkFree(address).code, 'double-free');
});

test('6. free of a non-heap pointer, and of an interior pointer', () => {
  const m = machineWithLocals();
  const x = m.declareLocal({ name: 'x', ctype: INT });
  assert.strictEqual(m.checkFree(x.address).code, 'free-of-non-heap');
  const block = m.allocate(16);
  assert.strictEqual(m.checkFree(block + 4).code, 'free-of-interior-pointer');
});

test('7. null dereference is its own message, not a generic bad address', () => {
  const m = M.createMachine();
  const d = m.checkRead(0, 4);
  assert.strictEqual(d.code, 'null-dereference');
  assert.ok(d.plain.toLowerCase().includes('null'));
});

test('8. a pointer into a returned frame names the function it belonged to', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  m.pushFrame('helper');
  const local = m.declareLocal({ name: 'temp', ctype: INT });
  m.markInitialised(local.address, 4);
  m.popFrame();
  const d = m.checkRead(local.address, 4);
  assert.strictEqual(d.code, 'dangling-stack-pointer');
  assert.ok(d.plain.includes('helper'), 'name the function that returned');
  assert.ok(d.plain.includes('temp'), 'name the variable');
});

test('9. leaks are reported at exit with a count and total', () => {
  const m = M.createMachine();
  m.allocate(16);
  m.allocate(32);
  const kept = m.allocate(8);
  m.release(kept);
  const d = m.checkLeaks();
  assert.strictEqual(d.code, 'memory-leak');
  assert.ok(/2/.test(d.plain), 'two blocks still allocated');
  assert.ok(/48/.test(d.plain), 'forty-eight bytes total');
  assert.strictEqual(d.highlight.length, 2);
});

test('9b. no leak means no diagnostic', () => {
  const m = M.createMachine();
  const address = m.allocate(16);
  m.release(address);
  assert.strictEqual(m.checkLeaks(), null);
});

test('10. division and modulo by zero', () => {
  const m = M.createMachine();
  assert.strictEqual(m.checkDivide(0).code, 'divide-by-zero');
  assert.strictEqual(m.checkDivide(1), null);
});

test('11. signed overflow is caught at the boundary, both ways', () => {
  const m = M.createMachine();
  assert.strictEqual(m.checkIntResult(2147483647), null);
  assert.strictEqual(m.checkIntResult(2147483648).code, 'signed-overflow');
  assert.strictEqual(m.checkIntResult(-2147483648), null);
  assert.strictEqual(m.checkIntResult(-2147483649).code, 'signed-overflow');
});

test('12. a negative index is its own message, clearer than out-of-bounds', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  const d = m.checkIndex(arr, -1, 4);
  assert.strictEqual(d.code, 'negative-index');
  assert.strictEqual(m.checkIndex(arr, 0, 4), null);
  assert.strictEqual(m.checkIndex(arr, 4, 4), null);
  assert.strictEqual(m.checkIndex(arr, 5, 4).code, 'index-out-of-range');
});

test('12b. the off-by-one message says the last valid index', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  const d = m.checkIndex(arr, 5, 4);
  assert.ok(/4/.test(d.plain), 'the last valid index of a 5-element array is 4');
});

test('13. strcpy into a short buffer is checked as a write', () => {
  const m = machineWithLocals();
  const buf = m.declareLocal({
    name: 'buf', ctype: { k: 'array', of: { k: 'char' }, length: 4 },
  });
  assert.strictEqual(m.checkWrite(buf.address, 4), null);
  assert.strictEqual(m.checkWrite(buf.address, 6).code, 'out-of-bounds-write');
});

test('an address in no object at all is reported as a wild pointer', () => {
  const m = M.createMachine();
  const d = m.checkRead(M.LAYOUT.HEAP_BASE + 5000, 4);
  assert.strictEqual(d.code, 'wild-pointer');
});

test('every diagnostic carries both messages and something to highlight', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  const produced = [
    m.checkRead(arr.address, 4),
    m.checkWrite(arr.address + 20, 4),
    m.checkRead(0, 4),
    m.checkDivide(0),
    m.checkIntResult(1e12),
  ];
  for (const d of produced) {
    assert.ok(d, 'expected a diagnostic');
    assert.ok(typeof d.code === 'string' && d.code.length > 0);
    assert.ok(typeof d.terse === 'string' && d.terse.length > 0);
    assert.ok(typeof d.plain === 'string' && d.plain.length > 20,
      'the plain message must actually explain: ' + d.code);
    assert.ok(Array.isArray(d.highlight));
  }
});

test('checks never throw, whatever address they are handed', () => {
  const m = M.createMachine();
  for (const address of [-1, 0, 7, M.LAYOUT.CAPACITY, M.LAYOUT.CAPACITY * 2, NaN]) {
    assert.doesNotThrow(() => m.checkRead(address, 4), String(address));
    assert.doesNotThrow(() => m.checkWrite(address, 4), String(address));
    assert.doesNotThrow(() => m.checkFree(address), String(address));
  }
});
