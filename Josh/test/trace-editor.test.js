'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Editor = require('../src/renderer/js/trace-editor.js');

const NL = String.fromCharCode(10);

function classOf(spans, text) {
  const found = spans.find((s) => s.text === text);
  return found ? found.cls : undefined;
}

test('highlighting reproduces the source exactly', () => {
  const source = 'int main(void) {' + NL + '  return 0; // done' + NL + '}';
  assert.strictEqual(Editor.highlight(source).map((s) => s.text).join(''), source);
});

test('each kind of token gets its own class', () => {
  const spans = Editor.highlight('int x = 1; // hi');
  assert.strictEqual(classOf(spans, 'int'), 'tok-keyword');
  assert.strictEqual(classOf(spans, 'x'), 'tok-ident');
  assert.strictEqual(classOf(spans, '1'), 'tok-number');
  assert.strictEqual(classOf(spans, '// hi'), 'tok-comment');
  assert.strictEqual(classOf(spans, '='), 'tok-punct');
});

test('strings and characters are their own class', () => {
  const spans = Editor.highlight('char *s = "hi";');
  assert.strictEqual(classOf(spans, '"hi"'), 'tok-string');
  assert.strictEqual(classOf(Editor.highlight("char c = 'z';"), "'z'"), 'tok-string');
});

test('a known library name is distinguished from an ordinary identifier', () => {
  const spans = Editor.highlight('printf("hi"); myfunc();');
  assert.strictEqual(classOf(spans, 'printf'), 'tok-builtin');
  assert.strictEqual(classOf(spans, 'myfunc'), 'tok-ident');
});

test('a block comment is one span, newlines and all', () => {
  const source = '/* one' + NL + 'two */';
  const spans = Editor.highlight(source);
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].cls, 'tok-comment');
  assert.strictEqual(spans[0].text, source);
});

test('half-typed source still highlights, and still round-trips', () => {
  for (const source of ['int x = "unterminated', '/* open', 'int', '', '@', 'a @ b']) {
    const spans = Editor.highlight(source);
    assert.strictEqual(spans.map((s) => s.text).join(''), source,
      'lost characters in ' + JSON.stringify(source));
  }
});

test('a stray character is marked rather than dropped', () => {
  const spans = Editor.highlight('a @ b');
  assert.strictEqual(classOf(spans, '@'), 'tok-error');
});

test('the parser never sees stray characters, only the editor does', () => {
  const Lex = require('../src/renderer/js/trace-lex.js');
  const plain = Lex.tokenize('int @ x').tokens.map((t) => t.type);
  assert.deepStrictEqual(plain, ['keyword', 'ident', 'eof'],
    'a stray character must stay out of the parser stream');
});

test('highlighting a large file stays fast enough to type against', () => {
  const source = ('int x = 1; // a line' + NL).repeat(2000);
  const started = Date.now();
  Editor.highlight(source);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 250, 'took ' + elapsed + 'ms');
});
