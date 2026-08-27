'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');
const Panel = require('../src/renderer/js/trace-panel.js');

const NL = String.fromCharCode(10);
function src() {
  return Array.prototype.slice.call(arguments).join(NL);
}

/** Run until `predicate(state)` holds, then build the model from that state. */
function modelAfter(source, predicate) {
  const runner = I.createRunner({ source: source });
  assert.deepStrictEqual(runner.errors, [], JSON.stringify(runner.errors));
  for (let i = 0; i < 10000; i += 1) {
    const result = runner.step();
    const state = runner.state();
    if (predicate(state)) return Panel.buildModel(state, runner.machine);
    if (result.done) {
      assert.fail('predicate never held; program finished');
    }
  }
  throw new Error('predicate never held');
}

function slotNamed(model, name) {
  for (const frame of model.frames) {
    const found = frame.slots.find((s) => s.name === name);
    if (found) return found;
  }
  return null;
}

test('a frame appears with its function name and its locals', () => {
  const source = src('int main(void) {', '  int x = 5;', '  int y = 6;',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.frames.length > 0
    && s.objects.filter((o) => o.kind === 'local').length === 2);
  assert.strictEqual(model.frames[0].functionName, 'main');
  assert.deepStrictEqual(model.frames[0].slots.map((s) => s.name).sort(), ['x', 'y']);
});

test('an uninitialised slot shows a question mark, never a zero', () => {
  const source = src('int main(void) {', '  int x;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.objects.some((o) => o.name === 'x'));
  const slot = slotNamed(model, 'x');
  assert.strictEqual(slot.initialised, false);
  assert.strictEqual(slot.value, '?');
});

test('an initialised slot shows its value and its type', () => {
  const source = src('int main(void) {', '  int x = 42;', '  int y = 0;',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  const slot = slotNamed(model, 'x');
  assert.strictEqual(slot.value, '42');
  assert.strictEqual(slot.typeName, 'int');
});

test('a pointer produces an arrow to what it points at', () => {
  const source = src('int main(void) {', '  int x = 1;', '  int *p = &x;',
    '  int z = 0;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 3);
  const pointer = slotNamed(model, 'p');
  const target = slotNamed(model, 'x');
  assert.strictEqual(pointer.isPointer, true);
  assert.strictEqual(pointer.typeName, 'int*');
  assert.strictEqual(pointer.target, target.address);
  assert.ok(model.arrows.some(
    (a) => a.from === pointer.address && a.to === pointer.target));
});

test('a null pointer is shown as NULL and draws no arrow', () => {
  const source = src('int main(void) {', '  int *p = 0;', '  int z = 0;',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  const pointer = slotNamed(model, 'p');
  assert.strictEqual(pointer.value, 'NULL');
  assert.strictEqual(pointer.target, null);
  assert.strictEqual(model.arrows.length, 0);
});

test('heap blocks appear with their size', () => {
  const source = src('int main(void) {', '  int *p = malloc(40);', '  free(p);',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.objects.some((o) => o.kind === 'heap'));
  assert.strictEqual(model.heap.length, 1);
  assert.strictEqual(model.heap[0].size, 40);
});

test('globals are their own group, separate from frames', () => {
  const source = src('int counter = 3;', 'int main(void) { return counter; }');
  const model = modelAfter(source, (s) => s.frames.length > 0);
  assert.ok(model.globals.some((g) => g.name === 'counter'));
  assert.strictEqual(slotNamed(model, 'counter'), null, 'not also inside a frame');
});

test('an anonymous global, such as a string literal, is not drawn', () => {
  const source = src('int main(void) {', '  printf("hello");', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  assert.ok(model.globals.every((g) => g.name), 'every drawn global has a name');
});

test('nested calls stack, innermost last', () => {
  const source = src('int inner(void) { int z = 1; return z; }',
    'int main(void) { return inner(); }');
  const model = modelAfter(source, (s) => s.frames.length === 2);
  assert.deepStrictEqual(model.frames.map((f) => f.functionName), ['main', 'inner']);
});

test('an array shows its elements rather than one opaque value', () => {
  const source = src('int main(void) {', '  int a[3] = {7, 8, 9};', '  int z = 0;',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  const slot = slotNamed(model, 'a');
  assert.strictEqual(slot.typeName, 'int[3]');
  assert.deepStrictEqual(slot.elements.map((e) => e.value), ['7', '8', '9']);
});

test('an array element that was never written shows a question mark too', () => {
  const source = src('int main(void) {', '  int a[3];', '  a[0] = 1;', '  int z = 0;',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 3);
  const slot = slotNamed(model, 'a');
  assert.deepStrictEqual(slot.elements.map((e) => e.value), ['1', '?', '?']);
});

test('the text view names every frame, slot and value in the model', () => {
  const source = src('int main(void) {', '  int x = 5;', '  int *p = &x;',
    '  int z = 0;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 3);
  const text = Panel.renderAsText(model);
  assert.ok(text.includes('main'));
  assert.ok(text.includes('x'));
  assert.ok(text.includes('5'));
  assert.ok(text.includes('p'));
  assert.ok(text.toLowerCase().includes('points to'),
    'the text view must state pointer relationships, since it has no arrows');
});

test('the text view says so when there is nothing to show', () => {
  const model = { frames: [], heap: [], globals: [], arrows: [] };
  assert.ok(Panel.renderAsText(model).length > 0);
});

test('describeType spells types the way C does', () => {
  assert.strictEqual(Panel.describeType({ k: 'int' }), 'int');
  assert.strictEqual(Panel.describeType({ k: 'ptr', to: { k: 'char' } }), 'char*');
  assert.strictEqual(
    Panel.describeType({ k: 'array', of: { k: 'int' }, length: 3 }), 'int[3]');
  assert.strictEqual(Panel.describeType({ k: 'struct', tag: 'P' }), 'struct P');
  assert.strictEqual(Panel.describeType(null), 'bytes');
});

test('buildModel never throws on a halted or empty state', () => {
  const empty = { frames: [], objects: [], output: [], line: null,
    stepsAvailable: 0, halted: true, exitCode: null };
  assert.doesNotThrow(() => Panel.buildModel(empty, null));
  assert.deepStrictEqual(Panel.buildModel(empty, null).frames, []);
});
