'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Parse = require('../src/renderer/js/trace-parse.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

function ok(source) {
  const result = Parse.parseProgram(source);
  assert.deepStrictEqual(result.errors, [], 'unexpected errors in: ' + source);
  return result.ast;
}

function firstError(source) {
  const result = Parse.parseProgram(source);
  assert.ok(result.errors.length > 0, 'expected an error for: ' + source);
  return result.errors[0];
}

test('a minimal program', () => {
  const ast = ok('int main(void) { return 0; }');
  assert.strictEqual(ast.kind, 'program');
  assert.strictEqual(ast.body[0].kind, 'func');
  assert.strictEqual(ast.body[0].name, 'main');
  assert.deepStrictEqual(ast.body[0].params, []);
});

test('parameters are named and typed', () => {
  const fn = ok('int add(int a, int b) { return a + b; } int main(void) { return 0; }').body[0];
  assert.deepStrictEqual(fn.params.map((p) => p.name), ['a', 'b']);
  assert.strictEqual(fn.params[0].ctype.k, 'int');
});

test('a pointer parameter', () => {
  const fn = ok('void f(int *p) { } int main(void) { return 0; }').body[0];
  assert.strictEqual(fn.params[0].ctype.k, 'ptr');
});

test('an array parameter decays to a pointer', () => {
  const fn = ok('void f(int a[]) { } int main(void) { return 0; }').body[0];
  assert.strictEqual(fn.params[0].ctype.k, 'ptr',
    'an array parameter is a pointer, which is worth being explicit about');
});

test('several functions in one program', () => {
  const ast = ok(lines(
    'int helper(int x) { return x * 2; }',
    'int main(void) { return helper(21); }'
  ));
  assert.strictEqual(ast.body.length, 2);
});

test('global declarations sit alongside functions', () => {
  const ast = ok(lines('int counter = 0;', 'int main(void) { return counter; }'));
  assert.strictEqual(ast.body[0].kind, 'globalDecl');
  assert.strictEqual(ast.body[0].decls[0].name, 'counter');
});

test('a struct definition records its members in order', () => {
  const ast = ok(lines(
    'struct Point { int x; int y; };',
    'int main(void) { return 0; }'
  ));
  assert.strictEqual(ast.body[0].kind, 'structDef');
  assert.strictEqual(ast.body[0].tag, 'Point');
  assert.deepStrictEqual(ast.body[0].members.map((m) => m.name), ['x', 'y']);
});

test('a struct member may be a pointer or an array', () => {
  const def = ok('struct S { int *p; char name[8]; }; int main(void) { return 0; }').body[0];
  assert.strictEqual(def.members[0].ctype.k, 'ptr');
  assert.strictEqual(def.members[1].ctype.k, 'array');
});

test('enum values default to counting up from zero', () => {
  const def = ok('enum Colour { RED, GREEN, BLUE }; int main(void) { return 0; }').body[0];
  assert.deepStrictEqual(def.values, [
    { name: 'RED', value: 0 },
    { name: 'GREEN', value: 1 },
    { name: 'BLUE', value: 2 },
  ]);
});

test('an explicit enum value restarts the count', () => {
  const def = ok('enum E { A = 5, B, C = 10, D }; int main(void) { return 0; }').body[0];
  assert.deepStrictEqual(def.values.map((v) => v.value), [5, 6, 10, 11]);
});

test('include of a supported header is accepted and dropped', () => {
  const ast = ok(lines('#include <stdio.h>', 'int main(void) { return 0; }'));
  assert.strictEqual(ast.body.length, 1, 'the include leaves no node behind');
});

test('include of an unsupported header says which headers exist', () => {
  const err = firstError(lines('#include <math.h>', 'int main(void) { return 0; }'));
  assert.strictEqual(err.code, 'unsupported-header');
  assert.ok(err.plain.includes('stdio.h'));
});

test('an object-like define substitutes its value', () => {
  const ast = ok(lines('#define MAX 100', 'int main(void) { return MAX; }'));
  const ret = ast.body[0].body.body[0];
  assert.strictEqual(ret.value.kind, 'num');
  assert.strictEqual(ret.value.value, 100);
});

test('a function-like define is refused clearly', () => {
  const err = firstError('#define SQ(x) ((x)*(x))');
  assert.strictEqual(err.code, 'unsupported-construct');
  assert.ok(err.plain.toLowerCase().includes('object-like'));
});

test('each unsupported construct names itself and lists what is supported', () => {
  const cases = [
    ['int main(void) { goto end; return 0; }', 'goto'],
    ['union U { int a; double b; }; int main(void) { return 0; }', 'union'],
    ['int main(void) { unsigned int x = 1; return 0; }', 'unsigned'],
    ['int main(void) { float f = 1.0; return 0; }', 'float'],
    ['int main(void) { long n = 1; return 0; }', 'long'],
  ];
  for (const entry of cases) {
    const err = firstError(entry[0]);
    assert.strictEqual(err.code, 'unsupported-construct', entry[0]);
    assert.ok(err.terse.includes(entry[1]), 'terse should name ' + entry[1]);
    assert.ok(err.plain.length > 20, 'plain should explain, for ' + entry[1]);
  }
});

test('an unsupported construct is reported once, not once per token', () => {
  const result = Parse.parseProgram('int main(void) { goto a; goto b; return 0; }');
  const gotos = result.errors.filter((e) => e.terse.includes('goto'));
  assert.strictEqual(gotos.length, 2, 'one per occurrence, not one per token');
});

test('lexer errors and parse errors arrive in one list, in source order', () => {
  const result = Parse.parseProgram(lines('int main(void) {', '  char c = "oops;', '}'));
  assert.ok(result.errors.length > 0);
  for (let i = 1; i < result.errors.length; i += 1) {
    const previous = result.errors[i - 1].locations[0];
    const current = result.errors[i].locations[0];
    assert.ok(current.line >= previous.line, 'errors must be ordered by position');
  }
});

test('a program with no main is a diagnostic, not a silent no-op', () => {
  const err = firstError('int helper(void) { return 1; }');
  assert.strictEqual(err.code, 'no-main');
  assert.ok(err.plain.includes('main'));
});

test('parseProgram never throws, whatever the source', () => {
  const bad = ['', '{', 'int', '#', '#include', 'struct', 'int f(', '}}}}', '"'];
  for (const source of bad) {
    assert.doesNotThrow(() => Parse.parseProgram(source), JSON.stringify(source));
  }
});
