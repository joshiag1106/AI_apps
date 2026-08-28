'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lex = require('../src/renderer/js/trace-lex.js');

function kinds(source) {
  return Lex.tokenize(source).tokens.map((t) => t.type);
}
function values(source) {
  return Lex.tokenize(source).tokens.map((t) => t.value);
}
function errorsOf(source) {
  return Lex.tokenize(source).errors;
}

test('an empty source yields just eof', () => {
  assert.deepStrictEqual(kinds(''), ['eof']);
});

test('keywords are distinguished from identifiers', () => {
  assert.deepStrictEqual(kinds('int x'), ['keyword', 'ident', 'eof']);
  assert.deepStrictEqual(kinds('integer'), ['ident', 'eof']);
});

test('every documented keyword is recognised', () => {
  for (const word of Lex.KEYWORDS) {
    assert.strictEqual(kinds(word)[0], 'keyword', word);
  }
});

test('decimal and hex integers', () => {
  assert.strictEqual(values('42')[0], 42);
  assert.strictEqual(values('0x1f')[0], 31);
  assert.strictEqual(values('0')[0], 0);
});

test('doubles are distinguished from integers', () => {
  assert.deepStrictEqual(kinds('3.5'), ['double', 'eof']);
  assert.deepStrictEqual(kinds('3'), ['int', 'eof']);
  assert.strictEqual(values('1e3')[0], 1000);
  assert.strictEqual(values('2.5e-1')[0], 0.25);
});

test('a trailing dot is part of the number, not a member access', () => {
  assert.deepStrictEqual(kinds('3.'), ['double', 'eof']);
});

test('string escapes decode', () => {
  const nl = String.fromCharCode(10);
  const tab = String.fromCharCode(9);
  assert.strictEqual(values('"a\\nb"')[0], 'a' + nl + 'b');
  assert.strictEqual(values('"a\\tb"')[0], 'a' + tab + 'b');
  assert.strictEqual(values('"a\\\\b"')[0], 'a\\b');
  assert.strictEqual(values('"a\\"b"')[0], 'a"b');
  assert.strictEqual(values('"a\\0b"')[0].charCodeAt(1), 0);
});

test('char literals decode to their numeric value', () => {
  assert.strictEqual(values("'A'")[0], 65);
  assert.strictEqual(values("'\\n'")[0], 10);
  assert.strictEqual(values("'\\0'")[0], 0);
});

test('both comment forms are trivia by default and available on request', () => {
  const nl = String.fromCharCode(10);
  assert.deepStrictEqual(kinds('int /* hi */ x'), ['keyword', 'ident', 'eof']);
  assert.deepStrictEqual(kinds('int x // hi' + nl), ['keyword', 'ident', 'eof']);
  const withTrivia = Lex.tokenize('int /* hi */ x', { includeTrivia: true });
  assert.ok(withTrivia.tokens.some((t) => t.type === 'comment'));
  assert.ok(withTrivia.tokens.some((t) => t.type === 'space'));
});

test('trivia tokens reconstruct the source exactly', () => {
  const nl = String.fromCharCode(10);
  const source = 'int main(void) {' + nl + '  return 0; // done' + nl + '}';
  const all = Lex.tokenize(source, { includeTrivia: true }).tokens
    .filter((t) => t.type !== 'eof');
  assert.strictEqual(all.map((t) => t.raw).join(''), source);
});

test('multi-character punctuators are matched longest-first', () => {
  assert.strictEqual(values('>>=')[0], '>>=');
  assert.strictEqual(values('->')[0], '->');
  assert.strictEqual(values('++')[0], '++');
  assert.strictEqual(values('<=')[0], '<=');
  assert.deepStrictEqual(values('+ +').slice(0, 2), ['+', '+']);
});

test('line and column are 1-based and track newlines', () => {
  const nl = String.fromCharCode(10);
  const tokens = Lex.tokenize('int' + nl + '  x').tokens;
  assert.deepStrictEqual([tokens[0].line, tokens[0].col], [1, 1]);
  assert.deepStrictEqual([tokens[1].line, tokens[1].col], [2, 3]);
});

test('an unterminated string is an error, not a throw', () => {
  const errs = errorsOf('"abc');
  assert.strictEqual(errs.length, 1);
  assert.strictEqual(errs[0].code, 'unterminated-string');
  assert.ok(errs[0].plain.length > 0);
});

test('an unterminated block comment is an error', () => {
  const errs = errorsOf('int /* abc');
  assert.strictEqual(errs[0].code, 'unterminated-comment');
});

test('an unknown escape is an error naming the escape', () => {
  const errs = errorsOf('"a\\qb"');
  assert.strictEqual(errs[0].code, 'unknown-escape');
  assert.ok(errs[0].terse.includes('q'));
});

test('a stray character is an error and lexing continues', () => {
  const result = Lex.tokenize('int @ x');
  assert.strictEqual(result.errors[0].code, 'stray-character');
  assert.deepStrictEqual(result.tokens.map((t) => t.type), ['keyword', 'ident', 'eof']);
});

test('errors never throw, whatever the input', () => {
  for (const bad of ['"', "'", '/*', '\\', '0x', "''", '@#$']) {
    assert.doesNotThrow(() => Lex.tokenize(bad), bad);
  }
});
