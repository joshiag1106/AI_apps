'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Parse = require('../src/renderer/js/trace-parse.js');
const M = require('../src/renderer/js/trace-machine.js');
const I = require('../src/renderer/js/trace-interp.js');

/**
 * Run a function body's statements, counting steps.
 *
 * The body's own statements are driven directly rather than by executing the
 * block node, so the scope holding them survives for inspection afterwards. A
 * block pushes and pops its own scope, which would otherwise take every
 * variable with it before a single assertion ran.
 */
function run(bodySource, options) {
  const source = 'int main(void) {' + bodySource + '}';
  const parsed = Parse.parseProgram(source);
  assert.deepStrictEqual(parsed.errors, [], 'parse errors: ' + source);

  const machine = M.createMachine();
  const ctx = I.createContext({ ast: parsed.ast, machine: machine });
  machine.pushFrame('main');
  I.pushScope(ctx);

  const body = parsed.ast.body.find((n) => n.kind === 'func').body;
  const iterator = (function* driveBody() {
    for (const statement of body.body) {
      const completion = yield* I.execute(statement, ctx);
      if (completion.flow !== 'normal') return completion;
    }
    return { flow: 'normal' };
  }());

  let steps = 0;
  const limit = (options && options.limit) || 10000;
  let result = iterator.next();
  while (!result.done) {
    steps += 1;
    if (steps > limit) throw new Error('did not terminate within ' + limit + ' steps');
    result = iterator.next();
  }
  return { steps: steps, ctx: ctx, completion: result.value };
}

function valueOf(ctx, name) {
  for (let i = ctx.scopes.length - 1; i >= 0; i -= 1) {
    const entry = ctx.scopes[i].get(name);
    if (entry) return ctx.machine.readValue(entry.address, entry.ctype);
  }
  const global = ctx.globals.get(name);
  return global ? ctx.machine.readValue(global.address, global.ctype) : undefined;
}

test('a declaration creates a variable and an initialiser fills it', () => {
  assert.strictEqual(valueOf(run('int x = 5;').ctx, 'x'), 5);
});

test('a declaration without an initialiser leaves the variable uninitialised', () => {
  const ctx = run('int x;').ctx;
  const entry = ctx.scopes[ctx.scopes.length - 1].get('x');
  assert.strictEqual(ctx.machine.isInitialised(entry.address, 4), false);
});

test('several statements run in order', () => {
  assert.strictEqual(valueOf(run('int x = 1; x = x + 1; x = x * 10;').ctx, 'x'), 20);
});

test('each statement is one step', () => {
  assert.strictEqual(run('int x = 1; x = 2; x = 3;').steps, 3,
    'three statements, three steps');
});

test('if runs only the taken branch', () => {
  assert.strictEqual(valueOf(run('int x = 0; if (1) x = 1; else x = 2;').ctx, 'x'), 1);
  assert.strictEqual(valueOf(run('int x = 0; if (0) x = 1; else x = 2;').ctx, 'x'), 2);
});

test('if without else and a false test does nothing', () => {
  assert.strictEqual(valueOf(run('int x = 7; if (0) x = 1;').ctx, 'x'), 7);
});

test('a block introduces a scope that ends with it', () => {
  const ctx = run('int x = 1; { int y = 2; x = y; }').ctx;
  assert.strictEqual(valueOf(ctx, 'x'), 2);
  assert.strictEqual(valueOf(ctx, 'y'), undefined, 'y is gone with its block');
});

test('an inner declaration shadows an outer one', () => {
  assert.strictEqual(valueOf(run('int x = 1; { int x = 2; }').ctx, 'x'), 1,
    'the outer x is untouched');
});

test('while loops until its test fails', () => {
  const ctx = run('int i = 0; int n = 0; while (i < 5) { n = n + i; i = i + 1; }').ctx;
  assert.strictEqual(valueOf(ctx, 'i'), 5);
  assert.strictEqual(valueOf(ctx, 'n'), 10);
});

test('a while whose test is false at once never runs its body', () => {
  assert.strictEqual(valueOf(run('int x = 0; while (0) { x = 1; }').ctx, 'x'), 0);
});

test('do-while always runs its body once', () => {
  assert.strictEqual(valueOf(run('int x = 0; do { x = x + 1; } while (0);').ctx, 'x'), 1);
});

test('for runs init once, then test, body and update', () => {
  const ctx = run('int total = 0; for (int i = 1; i <= 4; i++) { total = total + i; }').ctx;
  assert.strictEqual(valueOf(ctx, 'total'), 10);
});

test('a for-loop variable does not escape the loop', () => {
  const ctx = run('int total = 0; for (int i = 0; i < 2; i++) { total++; }').ctx;
  assert.strictEqual(valueOf(ctx, 'i'), undefined);
});

test('break leaves the nearest enclosing loop', () => {
  const ctx = run('int i = 0; while (1) { i = i + 1; if (i == 3) break; }').ctx;
  assert.strictEqual(valueOf(ctx, 'i'), 3);
});

test('continue skips to the next iteration, and for still runs its update', () => {
  const ctx = run(
    'int n = 0; for (int i = 0; i < 5; i++) { if (i == 2) continue; n = n + 1; }').ctx;
  assert.strictEqual(valueOf(ctx, 'n'), 4);
});

test('break inside nested loops leaves only the inner one', () => {
  const ctx = run(
    'int n = 0; for (int i = 0; i < 3; i++) { for (int j = 0; j < 3; j++) '
    + '{ if (j == 1) break; n = n + 1; } }').ctx;
  assert.strictEqual(valueOf(ctx, 'n'), 3, 'one inner iteration per outer pass');
});

test('switch runs the matching case and falls through until break', () => {
  const body = 'int x = 0; switch (2) { case 1: x = 10; break; case 2: x = 20; '
    + 'case 3: x = x + 3; break; default: x = 99; }';
  assert.strictEqual(valueOf(run(body).ctx, 'x'), 23, '20 then fell through to +3');
});

test('switch runs default when nothing matches', () => {
  const body = 'int x = 0; switch (9) { case 1: x = 1; break; default: x = 99; }';
  assert.strictEqual(valueOf(run(body).ctx, 'x'), 99);
});

test('return produces a return completion carrying its value', () => {
  const completion = run('return 42;').completion;
  assert.strictEqual(completion.flow, 'return');
  assert.strictEqual(completion.value, 42);
});

test('return leaves the function immediately', () => {
  const ctx = run('int x = 1; return 0; x = 999;').ctx;
  assert.strictEqual(valueOf(ctx, 'x'), 1, 'the statement after return never ran');
});

test('an array initialiser list fills the elements', () => {
  assert.strictEqual(valueOf(run('int a[3] = {7, 8, 9}; int x = a[1];').ctx, 'x'), 8);
});

test('a string initialiser copies the bytes and the terminator', () => {
  const ctx = run('char s[3] = "hi"; int a = s[0]; int b = s[2];').ctx;
  assert.strictEqual(valueOf(ctx, 'a'), 104);
  assert.strictEqual(valueOf(ctx, 'b'), 0, 'the terminating zero is written');
});

test('a loop that never ends is bounded by the caller, not by the interpreter', () => {
  assert.throws(() => run('while (1) { int x = 1; }', { limit: 500 }),
    /did not terminate/,
    'the driver stops it; the interpreter itself just keeps yielding');
});

test('every iteration of a loop is at least one step', () => {
  const steps = run('for (int i = 0; i < 10; i++) { int x = i; }').steps;
  assert.ok(steps >= 10, 'got ' + steps);
});
