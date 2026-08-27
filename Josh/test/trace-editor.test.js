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

/**
 * Highlighting has to keep up with typing, and the way it stops keeping up is
 * by going accidentally quadratic in the length of the file.
 *
 * A wall-clock budget cannot express that, because it measures the machine.
 * This assertion used to read `elapsed < 250` and it failed on the Intel macOS
 * CI runner for no reason but load: the same suite took 11.3s on one run and
 * 17.3s on the next, and a highlight that normally costs ~10ms took 666ms.
 * Nothing had regressed. A test that fails when the neighbours are busy trains
 * people to ignore it.
 *
 * So the check is the shape of the curve instead, where machine speed cancels
 * out. The two sizes are measured *interleaved*, so load drifting during the
 * run lands on both alike; measured separately the numbers are visibly noisier.
 *
 * Calibration, rather than a guessed threshold. Cost per line, quadrupling the
 * input: linear is 1.0 and quadratic is 4.0. Ten local runs of the real
 * highlighter land between 1.05 and 1.12; three runs against a deliberately
 * quadratic one land between 2.56 and 2.61. The threshold sits at 1.8 -- 60%
 * clear of the worst honest result and 30% clear of the best dishonest one.
 */
const SMALL_FILE = ('int x = 1; // a line' + NL).repeat(2000);
const LARGE_FILE = ('int x = 1; // a line' + NL).repeat(8000);

/** Best-of-five for each size, interleaved, in milliseconds. */
function measureBoth() {
  let small = Infinity;
  let large = Infinity;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let started = process.hrtime.bigint();
    Editor.highlight(SMALL_FILE);
    const smallTook = Number(process.hrtime.bigint() - started) / 1e6;
    if (smallTook < small) small = smallTook;

    started = process.hrtime.bigint();
    Editor.highlight(LARGE_FILE);
    const largeTook = Number(process.hrtime.bigint() - started) / 1e6;
    if (largeTook < large) large = largeTook;
  }
  return { small: small, large: large };
}

test('highlighting stays linear in the length of the file', () => {
  const timing = measureBoth();
  const perLineGrowth = (timing.large / Math.max(timing.small, 0.5)) / 4;

  assert.ok(
    perLineGrowth < 1.8,
    'cost per line grew ' + perLineGrowth.toFixed(2) + 'x when the file quadrupled '
      + '(' + timing.small.toFixed(1) + 'ms -> ' + timing.large.toFixed(1) + 'ms). '
      + 'Linear is 1.0, quadratic is 4.0.'
  );
});

test('highlighting a large file finishes without pathological slowness', () => {
  // A ceiling, not a target. It catches total breakage only, and sits far
  // above the worst loaded-runner measurement on record (666ms), so a busy
  // machine alone can never trip it.
  const timing = measureBoth();
  assert.ok(timing.small < 3000, 'took ' + timing.small.toFixed(0) + 'ms');
});
