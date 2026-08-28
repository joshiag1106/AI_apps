'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Demangle = require('../src/renderer/js/demangle.js');

test('a simple nested name demangles', () => {
  assert.strictEqual(Demangle.demangle('_ZN3foo3barEv'), 'foo::bar()');
});

test('builtin parameter types are named', () => {
  assert.strictEqual(Demangle.demangle('_Z3fooi'), 'foo(int)');
  assert.strictEqual(Demangle.demangle('_Z3fooc'), 'foo(char)');
  assert.strictEqual(Demangle.demangle('_Z3food'), 'foo(double)');
  assert.strictEqual(Demangle.demangle('_Z3foob'), 'foo(bool)');
});

test('several parameters are comma-separated', () => {
  assert.strictEqual(Demangle.demangle('_Z3fooid'), 'foo(int, double)');
});

test('pointer and const-reference qualifiers are rendered', () => {
  assert.strictEqual(Demangle.demangle('_Z3fooPi'), 'foo(int*)');
  assert.strictEqual(Demangle.demangle('_Z3fooRKi'), 'foo(int const&)');
});

test('the std abbreviation expands', () => {
  assert.strictEqual(Demangle.demangle('_ZNSt3maxEv'), 'std::max()');
});

test('template arguments are rendered inside angle brackets', () => {
  assert.strictEqual(Demangle.demangle('_ZN3vecIiE4pushEi'), 'vec<int>::push(int)');
});

test('a void parameter list renders as empty, not as (void)', () => {
  assert.strictEqual(Demangle.demangle('_ZN3foo3barEv'), 'foo::bar()');
});

test('GARBAGE ROUND-TRIPS: anything unparseable comes back unchanged', () => {
  // The floor for this module is "no worse than today". Today the user sees
  // the mangled name; a failed parse must show exactly that, never a partial
  // or corrupted rendering.
  const garbage = [
    'main',
    '_Z',
    '_ZN',
    '_ZN3fooE',
    '_ZNZZZ',
    '_ZN999999fooEv',
    '_ZN3fooEQ',
    '',
    'not mangled at all',
    '_ZSt_S_S0_backref',
  ];
  for (const input of garbage) {
    assert.strictEqual(Demangle.demangle(input), input, 'must round-trip: ' + input);
  }
});

test('back-references are not supported and round-trip unchanged', () => {
  // Back-references are the genuinely hard part of the ABI and are out of
  // scope. They must fail open rather than produce a wrong name.
  const input = '_ZN3foo3barES_';
  assert.strictEqual(Demangle.demangle(input), input);
});

test('a non-string input round-trips without throwing', () => {
  assert.strictEqual(Demangle.demangle(null), null);
  assert.strictEqual(Demangle.demangle(undefined), undefined);
});
