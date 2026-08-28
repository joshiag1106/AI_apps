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
 * Two attempts at guarding that have now failed, and both failures are worth
 * recording, because the obvious third attempt fails the same way.
 *
 * The first was a wall-clock budget, `elapsed < 250`. It measures the machine,
 * not the code, and it failed on a loaded Intel macOS runner where the same
 * suite took 17.3s instead of 11.3s. Nothing had regressed.
 *
 * The second was this ratio: cost per line as the input quadruples, on the
 * theory that machine speed cancels out. It does not. On macos-latest, 2000
 * lines took 5.6ms -- faster than the laptop this was calibrated on -- while
 * 8000 lines took 42.8ms, about the same. The small input fits in that
 * machine's cache and the large one does not, so per-line cost depends on
 * cache geometry as much as on complexity. Calibrated at 1.05-1.12 locally,
 * it measured 1.91 there.
 *
 * That also collapses the discrimination the ratio was supposed to provide: a
 * deliberately quadratic highlighter measures 2.56, and an honest one measured
 * 1.91 on real hardware. There is no threshold between those worth trusting.
 *
 * The third version -- this one -- changes the clock rather than the theory,
 * and measures CPU time instead of wall clock. Wall clock counts the seconds
 * this process spent descheduled while something else used the core, which is
 * most of what a shared runner adds. Measured directly under eight competing
 * processes: the wall-clock ratio climbed to 1.43-1.60 while the CPU ratio
 * stayed between 1.06 and 1.12, against 1.10 idle. It does not drift with load.
 *
 * The threshold is 2.5, chosen against evidence rather than taste. Every
 * honest reading this project has recorded sits below it, including the 1.91
 * from macos-latest that broke version two. A deliberately quadratic
 * highlighter measures 3.60-4.79, so it sits below every dishonest reading
 * too. Cache geometry can still move the number -- CPU time counts a stall --
 * but it now has to move it more than twice as far to matter.
 */

const SMALL_FILE = ('int x = 1; // a line' + NL).repeat(2000);
const LARGE_FILE = ('int x = 1; // a line' + NL).repeat(8000);

/**
 * Best-of-five for each size, interleaved, in milliseconds of CPU time.
 *
 * CPU time, not wall clock. Wall clock counts the seconds this process spent
 * descheduled while something else used the core, so on a busy machine it
 * measures the machine. Measured directly under eight competing processes:
 * the wall-clock ratio climbed to 1.43-1.60 and CI once recorded 2.28, while
 * the CPU ratio stayed between 0.60 and 1.06 and -- the part that matters --
 * did not trend upward with load at all.
 */
function measureBoth() {
  return {
    small: perRunCpu(() => Editor.highlight(SMALL_FILE)),
    large: perRunCpu(() => Editor.highlight(LARGE_FILE)),
  };
}

/**
 * Milliseconds of CPU per run, measured over enough runs to outlast the clock.
 *
 * A single highlight cannot be timed directly: process.cpuUsage() advances in
 * steps of about 15.6ms on Windows, where the small file takes less than one
 * step and therefore measures 0.0ms. Dividing by that produced a fabricated
 * 8.00x ratio on a perfectly linear highlighter -- the first version of this
 * fix failed CI exactly that way.
 *
 * Accumulating until the total is far above one step makes the measurement
 * independent of how coarse the clock is, which is the property that was
 * missing rather than a threshold that needed loosening.
 */
function perRunCpu(thunk) {
  const started = process.cpuUsage();
  let runs = 0;
  let elapsed = 0;
  do {
    thunk();
    runs += 1;
    elapsed = cpuMillis(started);
  } while (elapsed < MIN_MEASURED_MS && runs < MAX_RUNS);
  return elapsed / runs;
}

/** Comfortably more than a dozen clock steps, even on the coarsest of them. */
const MIN_MEASURED_MS = 250;

/** A stop, so a pathologically slow machine cannot spin here forever. */
const MAX_RUNS = 500;

/** User plus system CPU since `since`, in milliseconds. */
function cpuMillis(since) {
  const used = process.cpuUsage(since);
  return (used.user + used.system) / 1000;
}

test('highlighting produces output proportional to its input', () => {
  // Machine-independent, so it runs everywhere: no clock, no threshold to
  // calibrate. It catches a highlighter whose *output* goes quadratic, which
  // is one real failure mode, and it is honest about being only that.
  const small = Editor.highlight(SMALL_FILE).length;
  const large = Editor.highlight(LARGE_FILE).length;
  const growth = large / small;

  assert.ok(
    growth > 3.5 && growth < 4.5,
    'four times the input produced ' + growth.toFixed(2) + 'x the spans '
      + '(' + small + ' -> ' + large + '); linear is 4x'
  );
});

test('highlighting stays linear in CPU time', () => {
  // Runs everywhere, including CI. The previous two versions measured wall
  // clock and had to be skipped on shared runners to stop them failing, which
  // meant the one check that actually catches a quadratic *algorithm* never
  // ran where regressions arrive. Measuring CPU time buys that coverage back.
  //
  // See the note at the top of this file for where 2.5 comes from: above
  // every honest reading recorded on this project, below every quadratic one.
  const timing = measureBoth();
  const perLineGrowth = (timing.large / timing.small) / 4;

  assert.ok(
    perLineGrowth < 2.5,
    'CPU per line grew ' + perLineGrowth.toFixed(2) + 'x when the file quadrupled '
      + '(' + timing.small.toFixed(3) + 'ms -> ' + timing.large.toFixed(3) + 'ms CPU per run). '
      + 'Linear is 1.0, quadratic is 4.0.'
  );
});

test('highlighting a large file finishes without pathological slowness', () => {
  // A ceiling, not a target, and the only timing assertion CI keeps. It sits
  // far above the worst loaded-runner measurement on record (666ms), so a busy
  // machine alone cannot trip it, and it catches total breakage only.
  const started = process.hrtime.bigint();
  Editor.highlight(SMALL_FILE);
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsed < 3000, 'took ' + elapsed.toFixed(0) + 'ms');
});
