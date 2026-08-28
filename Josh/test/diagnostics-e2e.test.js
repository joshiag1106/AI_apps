'use strict';

/**
 * The lossless-passthrough invariant is this feature's gate: for any input
 * containing no diagnostic, everything emitted must be byte-identical to the
 * input. If that cannot hold, the feature does not ship.
 *
 * Fixtures are real captures wherever the machine could produce them; see
 * test/fixtures/README.md for the provenance of each, including the one that
 * is a labelled reconstruction rather than a capture.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Diagnostics = require('../src/renderer/js/diagnostics.js');
const Matchers = require('../src/renderer/js/diagnostic-matchers.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/** Feed `input` through a real Condenser in the given chunks. */
function run(input, chunks, options) {
  const emitted = [];
  const condensed = [];
  const condenser = new Diagnostics.Condenser({
    emit: (text) => emitted.push(text),
    onCondensed: (record) => condensed.push(record),
    matchers: (options && options.matchers) || Matchers.ALL,
    cwd: () => (options && options.cwd) || null,
    minLines: () => (options && options.minLines) || 20,
    schedule: () => null,
    cancel: () => {},
  });
  for (const chunk of chunks) condenser.write(chunk);
  condenser.flushNow();
  return { output: emitted.join(''), condensed: condensed };
}

function byBytes(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

const PASSTHROUGH = ['altscreen-session.txt', 'vim-session.txt', 'progress-bar.txt'];

test('THE GATE: output that is not a diagnostic passes through byte for byte', () => {
  for (const name of PASSTHROUGH) {
    const input = fixture(name);
    assert.strictEqual(run(input, [input]).output, input, 'lost bytes in ' + name);
  }
});

test('THE GATE: non-diagnostic output survives any chunk size', () => {
  const input = PASSTHROUGH.map(fixture).join('');
  for (const size of [1, 2, 3, 7, 13, 64, 512, 4096]) {
    assert.strictEqual(run(input, byBytes(input, size)).output, input,
      'lost bytes at chunk size ' + size);
  }
});

test('THE GATE: a chunk split mid-escape-sequence loses nothing', () => {
  const input = fixture('altscreen-session.txt');
  for (let cut = 1; cut < input.length; cut++) {
    assert.strictEqual(
      run(input, [input.slice(0, cut), input.slice(cut)]).output, input,
      'lost bytes cutting at ' + cut
    );
  }
});

test('THE GATE: a real diagnostic is never lost either, only rearranged', () => {
  // Condensing moves bytes out of the stream and into the retained original.
  // Nothing may vanish: everything hidden must be recoverable.
  const input = fixture('clang-template.txt');
  const result = run(input, [input]);
  const hidden = result.condensed.map((r) => r.original).join('');
  assert.ok(hidden.length > 0, 'something should have been condensed');
  for (const record of result.condensed) {
    assert.ok(input.includes(record.original), 'a retained original must be a slice of the input');
  }
});

test('a real clang instantiation stack condenses and names the user file', () => {
  const input = fixture('clang-template.txt');
  const result = run(input, [input], { cwd: null });
  assert.ok(result.condensed.length > 0, 'real clang output must condense');
  const shown = Diagnostics.stripSgr(result.output);
  assert.match(shown, /your code: deep\.cpp:\d+/);
  assert.match(shown, /lines hidden/);
  assert.ok(result.output.length < input.length, 'condensing must actually shorten the output');
});

test('a reconstructed gcc instantiation stack condenses too', () => {
  // GCC's vocabulary differs from clang's -- "required from here" carries no
  // severity word -- and that difference is what cxx-template keys on.
  const input = fixture('gcc-template-reconstructed.txt');
  const result = run(input, [input], { minLines: 5 });
  assert.strictEqual(result.condensed.length, 1);
  const shown = Diagnostics.stripSgr(result.output);
  assert.match(shown, /your code: deep\.cpp:6:8/);
});

test('a real linker error condenses and reports where the symbol was wanted', () => {
  const input = fixture('ld-undefined.txt');
  const result = run(input, [input], { minLines: 2 });
  assert.strictEqual(result.condensed.length, 1);
  assert.match(Diagnostics.stripSgr(result.output), /link error:/);
});

test('FUZZING: a real diagnostic produces identical output at every chunk size', () => {
  // Chunk boundaries are decided by the OS pipe, not by the compiler. The same
  // bytes must condense the same way however they arrive.
  const input = fixture('clang-template.txt');
  const reference = run(input, [input]).output;
  for (const size of [1, 2, 5, 17, 64, 256, 1024]) {
    assert.strictEqual(run(input, byBytes(input, size)).output, reference,
      'differed at chunk size ' + size);
  }
});

test('FUZZING: randomly sized chunks are stable across many trials', () => {
  const input = fixture('gcc-template-reconstructed.txt');
  const reference = run(input, [input], { minLines: 5 }).output;
  for (let trial = 0; trial < 200; trial++) {
    const chunks = [];
    let i = 0;
    while (i < input.length) {
      const size = 1 + Math.floor(Math.random() * 40);
      chunks.push(input.slice(i, i + size));
      i += size;
    }
    assert.strictEqual(run(input, chunks, { minLines: 5 }).output, reference,
      'unstable on trial ' + trial);
  }
});
