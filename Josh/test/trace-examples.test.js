'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Examples = require('../src/renderer/js/trace-examples.js');
const I = require('../src/renderer/js/trace-interp.js');

function runExample(example) {
  const runner = I.createRunner({
    source: example.source,
    stdin: example.stdin || '',
    maxSteps: 200000,
  });
  return { runner: runner, result: drive(runner) };
}

function drive(runner) {
  let result = null;
  for (let i = 0; i < 200002; i += 1) {
    result = runner.step();
    if (result.done) return result;
  }
  throw new Error('did not terminate');
}

test('there are enough examples to cover the basics', () => {
  assert.ok(Examples.EXAMPLES.length >= 8, 'got ' + Examples.EXAMPLES.length);
});

test('every example has a name, a description and source', () => {
  for (const example of Examples.EXAMPLES) {
    assert.ok(example.name && example.name.length > 0);
    assert.ok(example.description && example.description.length > 10, example.name);
    assert.ok(example.source && example.source.includes('main'), example.name);
  }
});

test('every description says what to watch, not just what the code is', () => {
  for (const example of Examples.EXAMPLES) {
    assert.ok(example.description.length > 30,
      example.name + ': description should guide the eye');
  }
});

test('every example parses without error', () => {
  for (const example of Examples.EXAMPLES) {
    const runner = I.createRunner({ source: example.source, stdin: example.stdin || '' });
    assert.deepStrictEqual(runner.errors, [],
      example.name + ': ' + JSON.stringify(runner.errors));
  }
});

test('every example either runs clean or demonstrates its stated bug', () => {
  for (const example of Examples.EXAMPLES) {
    const outcome = runExample(example);
    if (example.expectDiagnostic) {
      assert.ok(outcome.result.diagnostic, example.name + ' should raise a diagnostic');
      assert.strictEqual(outcome.result.diagnostic.code, example.expectDiagnostic,
        example.name);
    } else {
      assert.strictEqual(outcome.result.diagnostic, null,
        example.name + ': '
          + (outcome.result.diagnostic && outcome.result.diagnostic.terse));
      assert.ok(outcome.runner.state().output.length > 0,
        example.name + ' should print something a learner can see');
    }
  }
});

test('at least three examples demonstrate a classic mistake', () => {
  const buggy = Examples.EXAMPLES.filter((e) => e.expectDiagnostic);
  assert.ok(buggy.length >= 3, 'got ' + buggy.length);
});

test('a broken example still explains itself before it stops', () => {
  for (const example of Examples.EXAMPLES) {
    if (!example.expectDiagnostic) continue;
    const diagnostic = runExample(example).result.diagnostic;
    assert.ok(diagnostic.plain.length > 20, example.name);
    assert.ok(diagnostic.locations.length > 0, example.name + ' must point at a line');
  }
});

test('example names are unique', () => {
  const names = Examples.EXAMPLES.map((e) => e.name);
  assert.strictEqual(new Set(names).size, names.length);
});

test('the working examples come before the broken ones', () => {
  const firstBroken = Examples.EXAMPLES.findIndex((e) => e.expectDiagnostic);
  const lastWorking = Examples.EXAMPLES.map((e) => Boolean(e.expectDiagnostic))
    .lastIndexOf(false);
  assert.ok(firstBroken > lastWorking, 'teaching order: make it work, then break it');
});
