'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lex = require('../src/renderer/js/trace-lex.js');
const Parse = require('../src/renderer/js/trace-parse.js');
const M = require('../src/renderer/js/trace-machine.js');
const I = require('../src/renderer/js/trace-interp.js');

const INT = { k: 'int' };
const DOUBLE = { k: 'double' };
const PTR_INT = { k: 'ptr', to: INT };

/** Build a context with the given locals already declared and initialised. */
function contextWith(locals) {
  const machine = M.createMachine();
  const ctx = I.createContext({ ast: { kind: 'program', body: [] }, machine: machine });
  machine.pushFrame('main');
  ctx.scopes.push(new Map());
  machine.beginStep();
  for (const entry of locals || []) {
    const name = entry[0];
    const ctype = entry[1];
    const value = entry[2];
    const obj = machine.declareLocal({ name: name, ctype: ctype });
    ctx.scopes[ctx.scopes.length - 1].set(name, { address: obj.address, ctype: ctype });
    if (value !== undefined) {
      machine.writeValue(obj.address, ctype, value);
      machine.markInitialised(obj.address, M.sizeOf(ctype, ctx.structs));
    }
  }
  machine.endStep();
  return ctx;
}

function parseOne(source) {
  const parsed = Parse.parseExpression(Lex.tokenize(source).tokens, 0);
  assert.deepStrictEqual(parsed.errors, [], 'parse errors in ' + source);
  return parsed.node;
}

/**
 * Drive an expression generator to its result. None of the expressions here
 * contains a call, so each must finish on the first next(); anything that
 * yields would be a bug.
 */
function evalExpr(source, ctx) {
  const iterator = I.evaluate(parseOne(source), ctx);
  const first = iterator.next();
  assert.ok(first.done, 'a call-free expression must not yield');
  return first.value.value;
}

function halts(source, ctx, code) {
  try {
    const iterator = I.evaluate(parseOne(source), ctx);
    iterator.next();
    assert.fail('expected ' + code + ' for: ' + source);
  } catch (error) {
    assert.ok(error instanceof I.TraceHalt, 'expected TraceHalt, got ' + error);
    assert.strictEqual(error.diagnostic.code, code);
  }
}

test('a call-free expression completes in a single next()', () => {
  const ctx = contextWith([['a', INT, 2], ['b', INT, 3]]);
  assert.strictEqual(I.evaluate(parseOne('a * b + 1'), ctx).next().done, true);
});

test('arithmetic on integers', () => {
  const ctx = contextWith([['a', INT, 7], ['b', INT, 3]]);
  assert.strictEqual(evalExpr('a + b', ctx), 10);
  assert.strictEqual(evalExpr('a - b', ctx), 4);
  assert.strictEqual(evalExpr('a * b', ctx), 21);
  assert.strictEqual(evalExpr('a / b', ctx), 2, 'integer division truncates');
  assert.strictEqual(evalExpr('a % b', ctx), 1);
});

test('integer division truncates toward zero, as C requires', () => {
  const ctx = contextWith([['a', INT, -7], ['b', INT, 2]]);
  assert.strictEqual(evalExpr('a / b', ctx), -3, 'not -4');
  assert.strictEqual(evalExpr('a % b', ctx), -1);
});

test('double arithmetic does not truncate', () => {
  const ctx = contextWith([['x', DOUBLE, 7], ['y', DOUBLE, 2]]);
  assert.strictEqual(evalExpr('x / y', ctx), 3.5);
});

test('an int and a double promote to double', () => {
  const ctx = contextWith([['i', INT, 7], ['d', DOUBLE, 2]]);
  assert.strictEqual(evalExpr('i / d', ctx), 3.5);
});

test('comparisons yield 1 and 0, not true and false', () => {
  const ctx = contextWith([['a', INT, 7], ['b', INT, 3]]);
  assert.strictEqual(evalExpr('a > b', ctx), 1);
  assert.strictEqual(evalExpr('a < b', ctx), 0);
  assert.strictEqual(evalExpr('a == 7', ctx), 1);
  assert.strictEqual(evalExpr('a != 7', ctx), 0);
});

test('logical operators short-circuit', () => {
  // If && evaluated its right side, the uninitialised read would halt.
  const ctx = contextWith([['zero', INT, 0], ['never', INT]]);
  assert.strictEqual(evalExpr('zero && never', ctx), 0);
  assert.strictEqual(evalExpr('!zero || never', ctx), 1);
});

test('the conditional operator evaluates only the branch it takes', () => {
  const ctx = contextWith([['flag', INT, 1], ['good', INT, 5], ['never', INT]]);
  assert.strictEqual(evalExpr('flag ? good : never', ctx), 5);
});

test('assignment stores and yields the stored value', () => {
  const ctx = contextWith([['a', INT, 0], ['b', INT, 9]]);
  assert.strictEqual(evalExpr('a = b', ctx), 9);
  assert.strictEqual(evalExpr('a', ctx), 9, 'the store actually happened');
});

test('compound assignment reads, combines and stores', () => {
  const ctx = contextWith([['a', INT, 10]]);
  assert.strictEqual(evalExpr('a += 5', ctx), 15);
  assert.strictEqual(evalExpr('a *= 2', ctx), 30);
});

test('prefix and postfix increment differ in what they yield', () => {
  const ctx = contextWith([['a', INT, 5]]);
  assert.strictEqual(evalExpr('a++', ctx), 5, 'postfix yields the old value');
  assert.strictEqual(evalExpr('a', ctx), 6);
  assert.strictEqual(evalExpr('++a', ctx), 7, 'prefix yields the new value');
});

test('address-of and dereference round-trip', () => {
  const ctx = contextWith([['a', INT, 42], ['p', PTR_INT]]);
  const address = evalExpr('&a', ctx);
  assert.ok(address > 0);
  assert.strictEqual(evalExpr('p = &a', ctx), address);
  assert.strictEqual(evalExpr('*p', ctx), 42);
  assert.strictEqual(evalExpr('*&a', ctx), 42);
});

test('writing through a pointer changes the original', () => {
  const ctx = contextWith([['a', INT, 1], ['p', PTR_INT]]);
  evalExpr('p = &a', ctx);
  evalExpr('*p = 99', ctx);
  assert.strictEqual(evalExpr('a', ctx), 99);
});

test('an array decays to a pointer to its first element', () => {
  const ctx = contextWith([['a', { k: 'array', of: INT, length: 4 }]]);
  assert.strictEqual(evalExpr('a', ctx), evalExpr('&a[0]', ctx),
    'the array is its own first address');
});

test('pointer arithmetic scales by the element size', () => {
  const ctx = contextWith([['a', { k: 'array', of: INT, length: 4 }]]);
  const base = evalExpr('a', ctx);
  assert.strictEqual(evalExpr('a + 1', ctx), base + 4, 'one int, not one byte');
  assert.strictEqual(evalExpr('&a[2]', ctx), base + 8);
});

test('subscripting is defined as pointer arithmetic', () => {
  const ctx = contextWith([['a', { k: 'array', of: INT, length: 4 }]]);
  evalExpr('a[1] = 77', ctx);
  assert.strictEqual(evalExpr('a[1]', ctx), 77);
  assert.strictEqual(evalExpr('*(a + 1)', ctx), 77, 'a[i] is *(a + i)');
});

test('sizeof reports the real sizes, including whole arrays', () => {
  const ctx = contextWith([['a', { k: 'array', of: INT, length: 5 }]]);
  assert.strictEqual(evalExpr('sizeof(int)', ctx), 4);
  assert.strictEqual(evalExpr('sizeof(char)', ctx), 1);
  assert.strictEqual(evalExpr('sizeof(double)', ctx), 8);
  assert.strictEqual(evalExpr('sizeof(a)', ctx), 20, 'the whole array, not a pointer');
});

test('a cast to int truncates a double toward zero', () => {
  assert.strictEqual(evalExpr('(int)d', contextWith([['d', DOUBLE, 3.9]])), 3);
  assert.strictEqual(evalExpr('(int)d', contextWith([['d', DOUBLE, -3.9]])), -3);
});

test('reading an uninitialised variable halts with the right diagnostic', () => {
  halts('x + 1', contextWith([['x', INT]]), 'uninitialised-read');
});

test('dividing by zero halts', () => {
  halts('a / b', contextWith([['a', INT, 1], ['b', INT, 0]]), 'divide-by-zero');
  halts('a % b', contextWith([['a', INT, 1], ['b', INT, 0]]), 'divide-by-zero');
});

test('overflowing an int halts rather than wrapping silently', () => {
  halts('a * b', contextWith([['a', INT, 100000], ['b', INT, 100000]]), 'signed-overflow');
});

test('indexing past the end halts and names the array', () => {
  const arr = { k: 'array', of: INT, length: 3 };
  halts('a[5]', contextWith([['a', arr]]), 'index-out-of-range');
  halts('a[-1]', contextWith([['a', arr]]), 'negative-index');
});

test('dereferencing a null pointer halts', () => {
  halts('*p', contextWith([['p', PTR_INT, 0]]), 'null-dereference');
});

test('an unknown identifier halts with a semantic diagnostic', () => {
  halts('nosuchthing', contextWith([]), 'undeclared-identifier');
});
