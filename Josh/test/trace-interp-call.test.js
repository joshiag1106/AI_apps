'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

/**
 * Run a whole program to completion. Programs here observe themselves through
 * main's exit value rather than printf, so this task stands on its own; the
 * library arrives in Tasks 12 and 13.
 */
function runProgram(source, options) {
  const runner = I.createRunner({
    source: source,
    stdin: (options && options.stdin) || '',
    maxSteps: (options && options.maxSteps) || undefined,
  });
  assert.deepStrictEqual(runner.errors, [], 'errors: ' + JSON.stringify(runner.errors));
  let steps = 0;
  const limit = (options && options.limit) || 100000;
  for (;;) {
    const result = runner.step();
    steps += 1;
    if (result.diagnostic) {
      return { runner: runner, diagnostic: result.diagnostic, steps: steps };
    }
    if (result.done) return { runner: runner, diagnostic: null, steps: steps };
    if (steps > limit) throw new Error('did not terminate');
  }
}

function exitOf(source) {
  const outcome = runProgram(source);
  assert.strictEqual(outcome.diagnostic, null,
    outcome.diagnostic && outcome.diagnostic.terse);
  return outcome.runner.state().exitCode;
}

test('a program runs from main and reports its exit value', () => {
  const outcome = runProgram('int main(void) { return 7; }');
  assert.strictEqual(outcome.runner.state().halted, true);
  assert.strictEqual(outcome.runner.state().exitCode, 7);
});

test('a called function runs, and its frame appears while it does', () => {
  const source = lines(
    'int twice(int n) { return n * 2; }',
    'int main(void) { int r = twice(21); return r; }'
  );
  const runner = I.createRunner({ source: source });
  assert.deepStrictEqual(runner.errors, []);

  let sawCallee = false;
  for (let i = 0; i < 200; i += 1) {
    const result = runner.step();
    if (runner.state().frames.map((f) => f.functionName).includes('twice')) {
      sawCallee = true;
    }
    if (result.done || result.diagnostic) break;
  }
  assert.ok(sawCallee, 'the callee must be visible on the stack while it runs');
  assert.strictEqual(runner.state().frames.length, 0, 'and gone once it returns');
  assert.strictEqual(runner.state().exitCode, 42);
});

test('arguments are passed by value', () => {
  const source = lines(
    'void bump(int n) { n = n + 100; }',
    'int main(void) { int x = 1; bump(x); return x; }'
  );
  assert.strictEqual(exitOf(source), 1, "the caller's x is untouched");
});

test('a pointer parameter lets a function change the caller variable', () => {
  const source = lines(
    'void bump(int *n) { *n = *n + 100; }',
    'int main(void) { int x = 1; bump(&x); return x; }'
  );
  assert.strictEqual(exitOf(source), 101);
});

test('recursion works and unwinds', () => {
  const source = lines(
    'int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }',
    'int main(void) { return fact(5); }'
  );
  assert.strictEqual(exitOf(source), 120);
});

test('a frame is torn down when its function returns', () => {
  const source = lines(
    'int helper(void) { int secret = 5; return secret; }',
    'int main(void) { int a = helper(); int b = helper(); return a + b; }'
  );
  const outcome = runProgram(source);
  assert.strictEqual(outcome.runner.state().frames.length, 0);
  assert.strictEqual(outcome.runner.state().exitCode, 10);
});

test('14. falling off the end of a non-void function is caught', () => {
  const source = lines(
    'int broken(int n) { if (n > 0) return 1; }',
    'int main(void) { return broken(-1); }'
  );
  const diagnostic = runProgram(source).diagnostic;
  assert.strictEqual(diagnostic.code, 'missing-return');
  assert.ok(diagnostic.plain.includes('broken'));
});

test('a void function may end without a return', () => {
  const source = lines(
    'void nothing(void) { int x = 1; }',
    'int main(void) { nothing(); return 0; }'
  );
  assert.strictEqual(runProgram(source).diagnostic, null);
});

test('calling with the wrong number of arguments is a clear diagnostic', () => {
  const source = lines(
    'int add(int a, int b) { return a + b; }',
    'int main(void) { return add(1); }'
  );
  const diagnostic = runProgram(source).diagnostic;
  assert.strictEqual(diagnostic.code, 'argument-count');
  assert.ok(/2/.test(diagnostic.plain) && /1/.test(diagnostic.plain));
});

test('calling a function that does not exist names it', () => {
  const diagnostic = runProgram('int main(void) { return nope(1); }').diagnostic;
  assert.strictEqual(diagnostic.code, 'undeclared-function');
  assert.ok(diagnostic.plain.includes('nope'));
});

test('runaway recursion reports stack overflow rather than crashing', () => {
  const source = lines(
    'int forever(int n) { return forever(n + 1); }',
    'int main(void) { return forever(0); }'
  );
  const diagnostic = runProgram(source, { limit: 100000 }).diagnostic;
  assert.strictEqual(diagnostic.code, 'stack-overflow');
  assert.ok(diagnostic.plain.length > 20);
});

test('an infinite loop stops at the step cap with a teaching message', () => {
  const runner = I.createRunner({
    source: 'int main(void) { while (1) { int x = 1; } }',
    maxSteps: 500,
  });
  let last = null;
  for (let i = 0; i < 600; i += 1) {
    last = runner.step();
    if (last.diagnostic || last.done) break;
  }
  assert.ok(last.diagnostic, 'the cap must produce a diagnostic');
  assert.strictEqual(last.diagnostic.code, 'step-limit');
  assert.ok(last.diagnostic.plain.length > 20);
});

test('globals are visible in every function', () => {
  const source = lines(
    'int counter = 10;',
    'void bump(void) { counter = counter + 1; }',
    'int main(void) { bump(); bump(); return counter; }'
  );
  assert.strictEqual(exitOf(source), 12);
});

test('a global without an initialiser starts at zero, unlike a local', () => {
  assert.strictEqual(exitOf(lines('int g;', 'int main(void) { return g; }')), 0);
});

test('struct definitions are laid out before the program runs', () => {
  const source = lines(
    'struct P { int x; int y; };',
    'int main(void) { struct P p; p.x = 3; p.y = 4; return p.x + p.y; }'
  );
  assert.strictEqual(exitOf(source), 7);
});

test('enum constants are usable as values', () => {
  const source = lines(
    'enum Colour { RED, GREEN, BLUE };',
    'int main(void) { return GREEN; }'
  );
  assert.strictEqual(exitOf(source), 1);
});

test('step reports the line it is about to run', () => {
  const source = lines('int main(void) {', '  int x = 1;', '  int y = 2;',
    '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  assert.strictEqual(runner.step().line, 2, 'the first executable line');
});

test('reset returns a runner to its starting state', () => {
  const runner = I.createRunner({ source: 'int main(void) { int x = 1; return 0; }' });
  runner.step();
  runner.step();
  runner.reset();
  const state = runner.state();
  assert.strictEqual(state.frames.length, 0);
  assert.deepStrictEqual(state.output, []);
  assert.strictEqual(state.halted, false);
});

test('a program with errors never starts', () => {
  const runner = I.createRunner({ source: 'int main(void) { return }' });
  assert.ok(runner.errors.length > 0);
  assert.strictEqual(runner.step().done, true, 'stepping a broken program does nothing');
});

test('stepping back and then forward again reaches the same state', () => {
  const source = lines('int main(void) {', '  int x = 1;', '  x = 2;', '  x = 3;',
    '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  runner.step(); runner.step(); runner.step();
  const forward = JSON.stringify(runner.state().objects.map(
    (o) => [o.address, o.name, o.alive]));

  assert.strictEqual(runner.undo(), true);
  assert.strictEqual(runner.step().done, false, 'forward must work after an undo');
  assert.strictEqual(
    JSON.stringify(runner.state().objects.map((o) => [o.address, o.name, o.alive])),
    forward,
    'replay must land in exactly the state we left'
  );
});

test('undo at the very start reports there is nothing to undo', () => {
  const runner = I.createRunner({ source: 'int main(void) { return 0; }' });
  assert.strictEqual(runner.undo(), false);
});
