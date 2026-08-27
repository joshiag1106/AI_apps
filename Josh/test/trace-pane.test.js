'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Pane = require('../src/renderer/js/trace-pane.js');

function state(overrides) {
  return Object.assign({
    frames: [], objects: [], output: [], line: null,
    stepsAvailable: 0, halted: false, exitCode: null,
  }, overrides || {});
}

test('a fresh program can be run and stepped, but not stepped back', () => {
  const c = Pane.controlsFor({ state: state(), errors: [], running: false });
  assert.strictEqual(c.run, true);
  assert.strictEqual(c.step, true);
  assert.strictEqual(c.stepBack, false);
  assert.strictEqual(c.stop, false);
  assert.strictEqual(c.reset, true);
});

test('step back becomes available once there is history', () => {
  const c = Pane.controlsFor({ state: state({ stepsAvailable: 3 }), errors: [],
    running: false });
  assert.strictEqual(c.stepBack, true);
});

test('a halted program cannot be run or stepped, only reset or rewound', () => {
  const c = Pane.controlsFor({
    state: state({ halted: true, stepsAvailable: 5 }), errors: [], running: false,
  });
  assert.strictEqual(c.run, false);
  assert.strictEqual(c.step, false);
  assert.strictEqual(c.stepBack, true, 'you can still walk back through what happened');
  assert.strictEqual(c.reset, true);
});

test('a program that will not parse offers only reset', () => {
  const errors = [{ code: 'expected-token', terse: "expected ';'", plain: 'x',
    locations: [{ line: 2, col: 1, length: 1 }] }];
  const c = Pane.controlsFor({ state: state({ halted: true }), errors: errors,
    running: false });
  assert.strictEqual(c.run, false);
  assert.strictEqual(c.step, false);
  assert.strictEqual(c.stepBack, false);
  assert.strictEqual(c.reset, true);
});

test('while running, stop replaces run and stepping is off', () => {
  const c = Pane.controlsFor({ state: state(), errors: [], running: true });
  assert.strictEqual(c.run, false);
  assert.strictEqual(c.stop, true);
  assert.strictEqual(c.step, false, 'stepping while running would race the loop');
  assert.strictEqual(c.stepBack, false);
});

test('the status reports a parse error before anything runs', () => {
  const errors = [{ code: 'expected-token', terse: "expected ';'",
    plain: 'Trace expected a semicolon here.',
    locations: [{ line: 2, col: 5, length: 1 }] }];
  const status = Pane.statusFor({ state: state({ halted: true }), errors: errors,
    diagnostic: null, running: false });
  assert.strictEqual(status.kind, 'error');
  assert.ok(status.terse.includes(';'));
  assert.ok(status.plain.length > 10);
  assert.strictEqual(status.line, 2);
});

test('only the first parse error is shown, so the pane never floods', () => {
  const errors = [
    { code: 'a', terse: 'first', plain: 'first problem here',
      locations: [{ line: 1, col: 1, length: 1 }] },
    { code: 'b', terse: 'second', plain: 'second problem here',
      locations: [{ line: 9, col: 1, length: 1 }] },
  ];
  const status = Pane.statusFor({ state: state({ halted: true }), errors: errors,
    diagnostic: null, running: false });
  assert.strictEqual(status.terse, 'first');
  assert.strictEqual(status.line, 1);
});

test('a runtime diagnostic carries both messages and its line', () => {
  const diagnostic = {
    code: 'uninitialised-read', terse: 'read of uninitialised memory',
    plain: 'total has never been given a value, so reading it now would give '
      + 'whatever happened to be in memory.',
    locations: [{ line: 4, col: 9, length: 1 }], highlight: [],
  };
  const status = Pane.statusFor({ state: state({ halted: true }), errors: [],
    diagnostic: diagnostic, running: false });
  assert.strictEqual(status.kind, 'error');
  assert.strictEqual(status.terse, 'read of uninitialised memory');
  assert.ok(status.plain.includes('total'));
  assert.strictEqual(status.line, 4);
});

test('a clean finish reports the exit value, not an error', () => {
  const status = Pane.statusFor({
    state: state({ halted: true, exitCode: 0 }), errors: [], diagnostic: null,
    running: false,
  });
  assert.strictEqual(status.kind, 'done');
  assert.ok(/0/.test(status.terse));
});

test('a non-zero exit is reported plainly, and is not an error', () => {
  const status = Pane.statusFor({
    state: state({ halted: true, exitCode: 3 }), errors: [], diagnostic: null,
    running: false,
  });
  assert.strictEqual(status.kind, 'done');
  assert.ok(/3/.test(status.terse));
});

test('a program in progress reports the line it is about to run', () => {
  const status = Pane.statusFor({ state: state({ line: 7 }), errors: [],
    diagnostic: null, running: false });
  assert.strictEqual(status.kind, 'running');
  assert.strictEqual(status.line, 7);
});

test('a program that has not started says so', () => {
  const status = Pane.statusFor({ state: state(), errors: [], diagnostic: null,
    running: false });
  assert.strictEqual(status.kind, 'idle');
  assert.ok(status.terse.length > 0);
});

test('statusFor never returns undefined fields', () => {
  const cases = [
    { state: state(), errors: [], diagnostic: null, running: false },
    { state: state({ halted: true }), errors: [], diagnostic: null, running: false },
    { state: state({ line: 3 }), errors: [], diagnostic: null, running: true },
  ];
  for (const input of cases) {
    const status = Pane.statusFor(input);
    assert.ok(typeof status.kind === 'string' && status.kind.length > 0);
    assert.ok(typeof status.terse === 'string');
    assert.ok(typeof status.plain === 'string');
  }
});
