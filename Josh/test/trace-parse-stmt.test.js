'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lex = require('../src/renderer/js/trace-lex.js');
const Parse = require('../src/renderer/js/trace-parse.js');

function parseStmt(source) {
  const tokens = Lex.tokenize(source).tokens;
  const result = Parse.parseStatement(tokens, 0);
  assert.deepStrictEqual(result.errors, [], 'unexpected errors in ' + source);
  return result.node;
}

function typeName(t) {
  if (t.k === 'ptr') return typeName(t.to) + '*';
  if (t.k === 'array') return 'array(' + typeName(t.of) + ',' + t.length + ')';
  if (t.k === 'struct') return 'struct ' + t.tag;
  if (t.k === 'enum') return 'enum ' + t.tag;
  return t.k;
}

test('an expression statement wraps its expression', () => {
  const node = parseStmt('x = 1;');
  assert.strictEqual(node.kind, 'exprStmt');
  assert.strictEqual(node.expr.kind, 'assign');
});

test('a lone semicolon is an empty statement, not an error', () => {
  assert.strictEqual(parseStmt(';').kind, 'empty');
});

test('a block collects its statements', () => {
  const node = parseStmt('{ a; b; c; }');
  assert.strictEqual(node.kind, 'block');
  assert.strictEqual(node.body.length, 3);
});

test('an empty block is valid', () => {
  assert.deepStrictEqual(parseStmt('{}').body, []);
});

test('if without else leaves otherwise null', () => {
  const node = parseStmt('if (x) y;');
  assert.strictEqual(node.kind, 'if');
  assert.strictEqual(node.otherwise, null);
});

test('else binds to the nearest unmatched if', () => {
  const node = parseStmt('if (a) if (b) x; else y;');
  assert.strictEqual(node.otherwise, null, 'outer if must have no else');
  assert.strictEqual(node.then.kind, 'if');
  assert.ok(node.then.otherwise, 'inner if must own the else');
});

test('while and do-while', () => {
  assert.strictEqual(parseStmt('while (x) y;').kind, 'while');
  const doNode = parseStmt('do { x; } while (y);');
  assert.strictEqual(doNode.kind, 'do');
  assert.strictEqual(doNode.test.kind, 'ident');
});

test('for with all three clauses', () => {
  const node = parseStmt('for (i = 0; i < 10; i++) body;');
  assert.strictEqual(node.kind, 'for');
  assert.ok(node.init && node.test && node.update);
});

test('for with a declaration in the init clause', () => {
  const node = parseStmt('for (int i = 0; i < 10; i++) body;');
  assert.strictEqual(node.init.kind, 'declStmt');
  assert.strictEqual(node.init.decls[0].name, 'i');
});

test('for with every clause empty is an infinite loop, and parses', () => {
  const node = parseStmt('for (;;) body;');
  assert.strictEqual(node.init, null);
  assert.strictEqual(node.test, null);
  assert.strictEqual(node.update, null);
});

test('switch collects cases, with default carrying a null test', () => {
  const node = parseStmt('switch (x) { case 1: a; break; case 2: b; break; default: c; }');
  assert.strictEqual(node.kind, 'switch');
  assert.strictEqual(node.cases.length, 3);
  assert.strictEqual(node.cases[2].test, null);
});

test('a case with no body of its own falls through', () => {
  const node = parseStmt('switch (x) { case 1: case 2: a; }');
  assert.deepStrictEqual(node.cases[0].body, []);
  assert.strictEqual(node.cases[1].body.length, 1);
});

test('break, continue and return', () => {
  assert.strictEqual(parseStmt('break;').kind, 'break');
  assert.strictEqual(parseStmt('continue;').kind, 'continue');
  assert.strictEqual(parseStmt('return;').value, null);
  assert.strictEqual(parseStmt('return 1;').value.kind, 'num');
});

test('a simple declaration', () => {
  const node = parseStmt('int x;');
  assert.strictEqual(node.kind, 'declStmt');
  assert.strictEqual(node.decls[0].name, 'x');
  assert.strictEqual(typeName(node.decls[0].ctype), 'int');
  assert.strictEqual(node.decls[0].init, null);
});

test('a declaration with an initialiser', () => {
  const node = parseStmt('int x = 5;');
  assert.strictEqual(node.decls[0].init.value, 5);
});

test('several declarators share one base type', () => {
  const node = parseStmt('int a, b = 2, c;');
  assert.deepStrictEqual(node.decls.map((d) => d.name), ['a', 'b', 'c']);
  assert.strictEqual(node.decls[1].init.value, 2);
});

test('a pointer declarator binds to its own name, not the whole line', () => {
  const node = parseStmt('int *p, q;');
  assert.strictEqual(typeName(node.decls[0].ctype), 'int*');
  assert.strictEqual(typeName(node.decls[1].ctype), 'int', 'q is a plain int');
});

test('array declarators', () => {
  assert.strictEqual(typeName(parseStmt('int a[5];').decls[0].ctype), 'array(int,5)');
  assert.strictEqual(
    typeName(parseStmt('int a[2][3];').decls[0].ctype),
    'array(array(int,3),2)',
    'a is 2 arrays of 3, not 3 arrays of 2'
  );
});

test('brackets bind tighter than stars', () => {
  assert.strictEqual(
    typeName(parseStmt('int *a[5];').decls[0].ctype),
    'array(int*,5)',
    'a is an array of 5 pointers, not a pointer to an array'
  );
  assert.strictEqual(typeName(parseStmt('int **pp;').decls[0].ctype), 'int**');
});

test('an array initialiser list', () => {
  const node = parseStmt('int a[3] = {1, 2, 3};');
  assert.strictEqual(node.decls[0].init.kind, 'initList');
  assert.strictEqual(node.decls[0].init.items.length, 3);
});

test('an array sized by its initialiser has a resolved length', () => {
  const node = parseStmt('int a[] = {1, 2, 3};');
  assert.strictEqual(typeName(node.decls[0].ctype), 'array(int,3)');
});

test('a string initialiser sizes a char array including its terminator', () => {
  const node = parseStmt('char s[] = "hi";');
  assert.strictEqual(typeName(node.decls[0].ctype), 'array(char,3)');
});

test('a missing semicolon is reported once, at the right place', () => {
  const tokens = Lex.tokenize('int x = 1').tokens;
  const result = Parse.parseStatement(tokens, 0);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].code, 'expected-token');
  assert.ok(result.errors[0].terse.includes(';'));
});

test('statement parsing never throws', () => {
  for (const bad of ['if', 'while (', '{', 'int', 'for (;', 'switch (x) {', 'return']) {
    const tokens = Lex.tokenize(bad).tokens;
    assert.doesNotThrow(() => Parse.parseStatement(tokens, 0), bad);
  }
});
