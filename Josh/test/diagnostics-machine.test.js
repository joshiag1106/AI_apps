'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Diagnostics = require('../src/renderer/js/diagnostics.js');
const Matchers = require('../src/renderer/js/diagnostic-matchers.js');

/** A controllable clock, so no test ever sleeps. */
function harness(options) {
  const emitted = [];
  const condensed = [];
  let pending = null;
  const condenser = new Diagnostics.Condenser({
    emit: (text) => emitted.push(text),
    onCondensed: (record) => condensed.push(record),
    matchers: (options && options.matchers) || [],
    cwd: () => (options && options.cwd) || null,
    enabled: () => !(options && options.enabled === false),
    minLines: () => (options && options.minLines !== undefined ? options.minLines : 20),
    schedule: (fn) => { pending = fn; return 1; },
    cancel: () => { pending = null; },
  });
  return {
    condenser,
    output: () => emitted.join(''),
    condensed,
    tick: () => { const fn = pending; pending = null; if (fn) fn(); },
  };
}

test('a partial line reaches the screen on the flush timer', () => {
  // The prompt case: `Enter your name: ` has no newline. It must not wait for
  // the next newline, which may never come - but it is held for the same 16ms
  // as everything else, so that a diagnostic split across a chunk boundary
  // still assembles into lines. 16ms is below perception; a hung prompt is not.
  const h = harness();
  h.condenser.write('Enter your name: ');
  assert.strictEqual(h.output(), '');
  h.tick();
  assert.strictEqual(h.output(), 'Enter your name: ');
});

test('a committed partial is never written twice when its line completes', () => {
  // The invariant that makes holding partials safe: once the timer has put
  // `Enter your name: ` on screen, the rest of that line must arrive as only
  // the remainder.
  const h = harness();
  h.condenser.write('Enter your name: ');
  h.tick();
  h.condenser.write('Ada\n');
  h.condenser.flushNow();
  assert.strictEqual(h.output(), 'Enter your name: Ada\n');
});

test('complete lines are flushed when the timer fires', () => {
  const h = harness();
  h.condenser.write('alpha\nbeta\n');
  assert.strictEqual(h.output(), '');
  h.tick();
  assert.strictEqual(h.output(), 'alpha\nbeta\n');
});

test('sixty-four queued lines flush without waiting for the timer', () => {
  const h = harness();
  let input = '';
  for (let i = 0; i < 64; i++) input += 'line ' + i + '\n';
  h.condenser.write(input);
  assert.strictEqual(h.output(), input);
});

test('LOSSLESS: ordinary output round-trips byte for byte', () => {
  const inputs = [
    'plain text\n',
    '\x1b[31mcoloured\x1b[0m\n',
    'progress: 10%\rprogress: 50%\rprogress: 100%\n',
    'no trailing newline',
    '\n\n\n',
    'mixed\r\nline\nendings\r\n',
  ];
  for (const input of inputs) {
    const h = harness();
    h.condenser.write(input);
    h.condenser.flushNow();
    assert.strictEqual(h.output(), input, 'lost bytes for ' + JSON.stringify(input));
  }
});

test('inside the alternate screen there is no line assembly at all', () => {
  // vim owns the display. Everything must pass straight through, immediately.
  const h = harness();
  h.condenser.write('\x1b[?1049h');
  h.condenser.write('\x1b[2J\x1b[Hvim drawing\n');
  assert.strictEqual(h.output(), '\x1b[?1049h\x1b[2J\x1b[Hvim drawing\n');
});

test('leaving the alternate screen restores normal handling', () => {
  const h = harness();
  h.condenser.write('\x1b[?1049h');
  h.condenser.write('\x1b[?1049l');
  h.condenser.write('after\n');
  assert.strictEqual(h.output(), '\x1b[?1049h\x1b[?1049l');
  h.tick();
  assert.strictEqual(h.output(), '\x1b[?1049h\x1b[?1049lafter\n');
});

test('a line with cursor movement fails open immediately', () => {
  const h = harness();
  h.condenser.write('\x1b[2Aredraw\n');
  assert.strictEqual(h.output(), '\x1b[2Aredraw\n');
});

test('a matched block shorter than the minimum flushes verbatim', () => {
  // The length is only knowable once the block closes, which is why the check
  // happens at the end rather than at the start.
  const h = harness({ matchers: Matchers.ALL, minLines: 20 });
  const input =
    '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n' +
    'src/a.cpp:2:2:   required from here\n' +
    'make: *** [all] Error 1\n';
  h.condenser.write(input);
  h.condenser.flushNow();
  assert.strictEqual(h.output(), input);
  assert.strictEqual(h.condensed.length, 0);
});

test('a matched block at or over the minimum is condensed', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  let input = '/usr/include/c++/13/vector:1:1: error: no matching function\n';
  for (let i = 0; i < 5; i++) {
    input += '/usr/include/c++/13/bits/stl_vector.h:' + i + ':1: note: candidate\n';
  }
  input += 'src/widget.cpp:42:15:   required from here\n';
  h.condenser.write(input);
  h.condenser.write('make: *** [all] Error 1\n');
  h.condenser.flushNow();

  // The summary is colour-coded, so assert against the text it renders
  // rather than against the bytes, which carry SGR between every field.
  const out = Diagnostics.stripSgr(h.output());
  assert.match(out, /no matching function/);
  assert.match(out, /your code: src\/widget\.cpp:42:15/);
  assert.match(out, /lines hidden/);
  assert.strictEqual(h.condensed.length, 1);
  assert.strictEqual(h.condensed[0].original, input);
});

test('exceeding the line cap while buffering flushes verbatim', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  let input = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  for (let i = 0; i < 600; i++) input += '/usr/include/c++/13/bits/x.h:' + i + ':1: note: n\n';
  h.condenser.write(input);
  h.condenser.flushNow();
  assert.strictEqual(h.output(), input);
  assert.strictEqual(h.condensed.length, 0);
});

test('a line split across chunks mid-block is held, not abandoned', () => {
  // The pipe, not the compiler, decides where a chunk ends. Treating every
  // mid-line boundary as an anomaly would abandon every diagnostic that
  // happens to straddle a read, which is most of them under small reads.
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  let input = '/usr/include/c++/13/vector:1:1: error: no matching function\n';
  for (let i = 0; i < 5; i++) input += '/usr/include/c++/13/bits/x.h:' + i + ':1: note: n\n';
  input += 'src/widget.cpp:42:15:   required from here\n';

  // Feed it one byte at a time, the worst case the OS can produce.
  for (const ch of input) h.condenser.write(ch);
  h.condenser.write('make: *** [all] Error 1\n');
  h.condenser.flushNow();

  assert.strictEqual(h.condensed.length, 1, 'byte-at-a-time input must still condense');
  assert.strictEqual(h.condensed[0].original, input);
});

test('a partial that never completes is released by the block time cap', () => {
  // The guard the spec wanted, expressed where it actually holds: a partial
  // is an anomaly only when it persists, and the 200ms cap is what notices.
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  const opening = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  h.condenser.write(opening);
  h.condenser.write('partial with no newline');
  h.condenser.flushNow();
  assert.strictEqual(h.output(), opening + 'partial with no newline');
});

test('entering the alternate screen mid-block fails open', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  const opening = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  h.condenser.write(opening);
  h.condenser.write('\x1b[?1049h');
  assert.strictEqual(h.output(), opening + '\x1b[?1049h');
});

test('a cursor sequence mid-block fails open', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 3 });
  const opening = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  h.condenser.write(opening);
  h.condenser.write('\x1b[2Kredraw\n');
  h.condenser.flushNow();
  assert.strictEqual(h.output(), opening + '\x1b[2Kredraw\n');
});

test('when disabled, nothing is ever condensed', () => {
  const h = harness({ matchers: Matchers.ALL, minLines: 1, enabled: false });
  let input = '/usr/include/c++/13/vector:1:1: error: in instantiation of foo\n';
  for (let i = 0; i < 40; i++) input += '/usr/include/c++/13/bits/x.h:' + i + ':1: note: n\n';
  input += 'src/widget.cpp:42:15:   required from here\n';
  h.condenser.write(input);
  h.condenser.flushNow();
  assert.strictEqual(h.output(), input);
});

test('dispose flushes anything still held', () => {
  const h = harness();
  h.condenser.write('unflushed\n');
  h.condenser.dispose();
  assert.strictEqual(h.output(), 'unflushed\n');
});
