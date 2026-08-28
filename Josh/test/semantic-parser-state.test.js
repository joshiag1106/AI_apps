'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Parser = require('../src/main/semantic-parser.js');

const N = 'a'.repeat(32);
const ST = '\x1b\\';
const A = '\x1b]133;A;nonce=' + N + ST;
const B = '\x1b]133;B;nonce=' + N + ST;
const C = (cmd) => '\x1b]133;C;nonce=' + N + ';cmd=' + encodeURIComponent(cmd) + ST;
const D = (code) => '\x1b]133;D;nonce=' + N + ';' + code + ST;

test('a fresh session is idle', () => {
  assert.strictEqual(Parser.createSession(N).phase, 'idle');
});

test('the happy path walks idle to prompt to input to running and back', () => {
  const s = Parser.createSession(N);
  Parser.scan(s, A); assert.strictEqual(s.phase, 'prompt');
  Parser.scan(s, B); assert.strictEqual(s.phase, 'input');
  Parser.scan(s, C('ls')); assert.strictEqual(s.phase, 'running');
  Parser.scan(s, D(0)); assert.strictEqual(s.phase, 'idle');
});

test('scan returns the events it accepted', () => {
  const s = Parser.createSession(N);
  const events = Parser.scan(s, A + B + C('cargo test') + D(0));
  assert.deepStrictEqual(events.map((e) => e.type), ['A', 'B', 'C', 'D']);
  assert.strictEqual(events[2].cmd, 'cargo test');
  assert.strictEqual(events[3].exit, 0);
});

test('ordinary output between sequences is ignored', () => {
  const s = Parser.createSession(N);
  const events = Parser.scan(s, 'total 12\n' + A + 'drwxr-xr-x\n' + B);
  assert.deepStrictEqual(events.map((e) => e.type), ['A', 'B']);
});

test('A SEQUENCE SPLIT ACROSS CHUNKS REASSEMBLES', () => {
  // The pipe decides where a read ends. A prompt marker cut in half must not
  // be lost, or the session silently stops recording.
  const whole = A + B;
  for (let cut = 1; cut < whole.length; cut++) {
    const t = Parser.createSession(N);
    const first = Parser.scan(t, whole.slice(0, cut));
    const second = Parser.scan(t, whole.slice(cut));
    assert.deepStrictEqual(
      first.concat(second).map((e) => e.type), ['A', 'B'],
      'lost an event cutting at ' + cut
    );
  }
});

test('a sequence split byte by byte still reassembles', () => {
  const s = Parser.createSession(N);
  const whole = A + B + C('ls') + D(0);
  const seen = [];
  for (const ch of whole) for (const e of Parser.scan(s, ch)) seen.push(e.type);
  assert.deepStrictEqual(seen, ['A', 'B', 'C', 'D']);
});

test('an out-of-order transition resets to idle rather than throwing', () => {
  // A shell can always be interrupted mid-sequence: Ctrl+C between B and C
  // leaves the machine expecting a C that never comes. A stuck machine would
  // record nothing ever again, which is far worse than losing one command.
  const s = Parser.createSession(N);
  Parser.scan(s, A + B);
  Parser.scan(s, D(130));
  assert.strictEqual(s.phase, 'idle');
});

test('a forged sequence never advances the machine', () => {
  const s = Parser.createSession(N);
  const forged = '\x1b]133;A;nonce=' + 'b'.repeat(32) + ST;
  assert.deepStrictEqual(Parser.scan(s, forged), []);
  assert.strictEqual(s.phase, 'idle');
});

test('a chunk with no hint costs nothing and returns nothing', () => {
  const s = Parser.createSession(N);
  assert.deepStrictEqual(Parser.scan(s, 'ordinary output with no escapes\n'), []);
});

test('THE CARRY BUFFER CANNOT GROW WITHOUT BOUND', () => {
  // Output containing the hint but never a terminator must not accumulate
  // forever -- that is a memory leak driven by hostile output.
  const s = Parser.createSession(N);
  for (let i = 0; i < 100; i++) Parser.scan(s, '\x1b]133;' + 'x'.repeat(1000));
  assert.ok(s.carry.length <= Parser.MAX_CARRY, 'carry grew to ' + s.carry.length);
});

test('a session with no nonce accepts nothing', () => {
  assert.deepStrictEqual(Parser.scan(Parser.createSession(null), A), []);
});
