'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Parser = require('../src/main/semantic-parser.js');

const N = 'a'.repeat(32);
const ST = '\x1b\\';

test('a nonce is 32 hex characters and differs every time', () => {
  const a = Parser.makeNonce();
  const b = Parser.makeNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(a, b);
});

test('prompt start parses', () => {
  const out = Parser.parseSequence('\x1b]133;A;nonce=' + N + ST, N);
  assert.strictEqual(out.type, 'A');
});

test('input start parses', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;B;nonce=' + N + ST, N).type, 'B');
});

test('command start carries the percent-encoded command line', () => {
  const seq = '\x1b]133;C;nonce=' + N + ';cmd=cargo%20test' + ST;
  const out = Parser.parseSequence(seq, N);
  assert.strictEqual(out.type, 'C');
  assert.strictEqual(out.cmd, 'cargo test');
});

test('command end carries the exit code', () => {
  const out = Parser.parseSequence('\x1b]133;D;nonce=' + N + ';0' + ST, N);
  assert.strictEqual(out.type, 'D');
  assert.strictEqual(out.exit, 0);
});

test('a non-zero exit code parses', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;D;nonce=' + N + ';127' + ST, N).exit, 127);
});

test('BEL terminates a sequence as well as ST', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + '\x07', N).type, 'A');
});

test('A MISSING NONCE IS REJECTED ENTIRELY', () => {
  // The whole threat model rests on this. `cat`-ing a file full of crafted
  // sequences must achieve nothing at all.
  assert.strictEqual(Parser.parseSequence('\x1b]133;A' + ST, N), null);
  assert.strictEqual(Parser.parseSequence('\x1b]133;C;cmd=rm%20-rf%20%2F' + ST, N), null);
});

test('A WRONG NONCE IS REJECTED ENTIRELY', () => {
  const wrong = 'b'.repeat(32);
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + wrong + ST, N), null);
  assert.strictEqual(
    Parser.parseSequence('\x1b]133;C;nonce=' + wrong + ';cmd=evil' + ST, N),
    null
  );
});

test('a nonce that merely starts with the right value is rejected', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + 'extra' + ST, N), null);
});

test('an unknown sequence type is rejected', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;Z;nonce=' + N + ST, N), null);
});

test('a malformed exit code is rejected rather than coerced', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;D;nonce=' + N + ';abc' + ST, N), null);
});

test('percent-decoding failure yields null rather than a throw', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;C;nonce=' + N + ';cmd=%ZZ' + ST, N), null);
});

test('an absent session nonce rejects everything', () => {
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + ST, null), null);
  assert.strictEqual(Parser.parseSequence('\x1b]133;A;nonce=' + N + ST, ''), null);
});
