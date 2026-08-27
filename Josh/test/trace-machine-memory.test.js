'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };
const CHAR = { k: 'char' };
const DOUBLE = { k: 'double' };
const PTR = { k: 'ptr', to: INT };

test('scalar sizes match the documented model', () => {
  assert.strictEqual(M.sizeOf(INT, {}), 4);
  assert.strictEqual(M.sizeOf(CHAR, {}), 1);
  assert.strictEqual(M.sizeOf(DOUBLE, {}), 8);
  assert.strictEqual(M.sizeOf(PTR, {}), 8);
});

test('an array is its length times its element size', () => {
  assert.strictEqual(M.sizeOf({ k: 'array', of: INT, length: 5 }, {}), 20);
  assert.strictEqual(M.sizeOf({ k: 'array', of: CHAR, length: 3 }, {}), 3);
});

test('a two-dimensional array multiplies through', () => {
  const inner = { k: 'array', of: INT, length: 3 };
  assert.strictEqual(M.sizeOf({ k: 'array', of: inner, length: 2 }, {}), 24);
});

test('struct members are laid out with natural alignment and padding', () => {
  // char c; int i; char d;  ->  c at 0, 3 bytes padding, i at 4, d at 8,
  // then 3 bytes tail padding so the struct itself aligns to 4.
  const layout = M.structLayout([
    { name: 'c', ctype: CHAR },
    { name: 'i', ctype: INT },
    { name: 'd', ctype: CHAR },
  ], {});
  assert.deepStrictEqual(layout.fields.map((f) => f.offset), [0, 4, 8]);
  assert.strictEqual(layout.align, 4);
  assert.strictEqual(layout.size, 12);
});

test('a double forces eight-byte alignment', () => {
  const layout = M.structLayout([
    { name: 'c', ctype: CHAR },
    { name: 'd', ctype: DOUBLE },
  ], {});
  assert.deepStrictEqual(layout.fields.map((f) => f.offset), [0, 8]);
  assert.strictEqual(layout.size, 16);
});

test('reordering members changes the size, which is the lesson', () => {
  const bad = M.structLayout([
    { name: 'a', ctype: CHAR }, { name: 'b', ctype: INT }, { name: 'c', ctype: CHAR },
  ], {});
  const good = M.structLayout([
    { name: 'b', ctype: INT }, { name: 'a', ctype: CHAR }, { name: 'c', ctype: CHAR },
  ], {});
  assert.strictEqual(bad.size, 12);
  assert.strictEqual(good.size, 8);
});

test('a nested struct uses the inner layout', () => {
  const structs = { Inner: M.structLayout([{ name: 'x', ctype: INT }], {}) };
  const outer = M.structLayout([
    { name: 'i', ctype: { k: 'struct', tag: 'Inner' } },
    { name: 'j', ctype: INT },
  ], structs);
  assert.strictEqual(outer.size, 8);
});

test('integers round-trip little-endian', () => {
  const machine = M.createMachine();
  const address = M.LAYOUT.HEAP_BASE;
  machine.writeValue(address, INT, 0x01020304);
  assert.deepStrictEqual(
    Array.from(machine.readBytes(address, 4)),
    [0x04, 0x03, 0x02, 0x01]
  );
  assert.strictEqual(machine.readValue(address, INT), 0x01020304);
});

test('negative integers round-trip', () => {
  const machine = M.createMachine();
  machine.writeValue(M.LAYOUT.HEAP_BASE, INT, -1);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, INT), -1);
  machine.writeValue(M.LAYOUT.HEAP_BASE, INT, -2147483648);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, INT), -2147483648);
});

test('char is signed and wraps at one byte', () => {
  const machine = M.createMachine();
  machine.writeValue(M.LAYOUT.HEAP_BASE, CHAR, 65);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, CHAR), 65);
  machine.writeValue(M.LAYOUT.HEAP_BASE, CHAR, -1);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, CHAR), -1);
});

test('doubles round-trip exactly', () => {
  const machine = M.createMachine();
  for (const value of [0, 1, -1, 0.5, 3.14159265358979, 1e300, -1e-300]) {
    machine.writeValue(M.LAYOUT.HEAP_BASE, DOUBLE, value);
    assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, DOUBLE), value);
  }
});

test('pointers round-trip as addresses', () => {
  const machine = M.createMachine();
  machine.writeValue(M.LAYOUT.HEAP_BASE, PTR, 0x4000);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, PTR), 0x4000);
  machine.writeValue(M.LAYOUT.HEAP_BASE, PTR, 0);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, PTR), 0);
});

test('the address space is the documented size and shape', () => {
  assert.strictEqual(M.LAYOUT.CAPACITY, 0x100000);
  assert.ok(M.LAYOUT.GLOBAL_BASE > 0,
    'address zero must not be usable, so null is detectable');
  assert.ok(M.LAYOUT.HEAP_BASE > M.LAYOUT.GLOBAL_BASE);
  assert.strictEqual(M.LAYOUT.STACK_TOP, M.LAYOUT.CAPACITY);
});

test('an access outside the address space is refused, not silently wrapped', () => {
  const machine = M.createMachine();
  assert.throws(() => machine.readBytes(M.LAYOUT.CAPACITY + 8, 4), /out of range/i);
  assert.throws(() => machine.readBytes(-4, 4), /out of range/i);
});
