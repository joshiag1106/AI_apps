'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Integration = require('../src/main/shell-integration.js');

const N = 'a'.repeat(32);
const DIALECTS = ['zsh', 'bash', 'fish', 'pwsh'];

test('every supported dialect produces a snippet', () => {
  for (const dialect of DIALECTS) {
    assert.ok(Integration.recallSnippet(dialect, N).length > 0, dialect);
  }
});

test('THE NONCE APPEARS IN EVERY EMITTED SEQUENCE', () => {
  // A sequence without the nonce is ignored by the parser, so a dialect that
  // forgets it silently disables Recall for that shell -- with no error,
  // because "disabled for this session" is a legitimate state.
  for (const dialect of DIALECTS) {
    const snippet = Integration.recallSnippet(dialect, N);
    const markers = snippet.match(/133;[ABCD]/g) || [];
    assert.ok(markers.length >= 2, dialect + ' must emit at least prompt and command markers');
    const nonces = snippet.match(new RegExp('nonce=' + N, 'g')) || [];
    assert.ok(nonces.length >= markers.length,
      dialect + ' emits ' + markers.length + ' markers but only ' + nonces.length + ' nonces');
  }
});

test('AN UNSUPPORTED DIALECT PRODUCES NOTHING RATHER THAN A GUESS', () => {
  // Where integration cannot be established, Recall is disabled for the
  // session. Heuristic prompt detection is exactly the fragile inference this
  // design refuses.
  assert.strictEqual(Integration.recallSnippet('cmd', N), '');
  assert.strictEqual(Integration.recallSnippet('nonsense', N), '');
});

test('a missing nonce produces nothing', () => {
  assert.strictEqual(Integration.recallSnippet('zsh', ''), '');
  assert.strictEqual(Integration.recallSnippet('zsh', null), '');
});

test('the zsh snippet uses precmd and preexec', () => {
  const snippet = Integration.recallSnippet('zsh', N);
  assert.match(snippet, /precmd/);
  assert.match(snippet, /preexec/);
});

test('THE BASH SNIPPET INSTALLS A DEBUG TRAP, NOT AN RCFILE', () => {
  // Josh starts login shells and --rcfile is ignored for those. That
  // constraint dictates the whole bash mechanism.
  assert.match(Integration.recallSnippet('bash', N), /trap[\s\S]*DEBUG/);
});

test('the fish snippet uses the documented event names', () => {
  const snippet = Integration.recallSnippet('fish', N);
  assert.match(snippet, /fish_preexec/);
  assert.match(snippet, /fish_postexec/);
});

test('the command text is sent percent-encoded, not raw', () => {
  // A command containing a semicolon would otherwise split the sequence and
  // desynchronise the parser.
  for (const dialect of DIALECTS) {
    assert.match(Integration.recallSnippet(dialect, N), /cmd=/, dialect);
  }
});

test('the exit code is emitted with the D marker', () => {
  for (const dialect of DIALECTS) {
    assert.match(Integration.recallSnippet(dialect, N), /133;D/, dialect);
  }
});
