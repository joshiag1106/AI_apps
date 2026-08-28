'use strict';

/**
 * The snippets are shell code, and a string assertion only proves Josh wrote
 * what Josh meant to write. These tests run them in real shells and feed the
 * result to the real parser, which is the only way to know the two halves
 * agree. They skip where the shell is absent, as kit-e2e.test.js does.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const Integration = require('../src/main/shell-integration.js');
const Parser = require('../src/main/semantic-parser.js');

const NONCE = 'a'.repeat(32);

function available(command, args) {
  const probe = spawnSync(command, args, { encoding: 'utf8' });
  return !probe.error && probe.status === 0;
}

const HAS_ZSH = available('zsh', ['-f', '-c', 'exit 0']);
const HAS_BASH = available('bash', ['--norc', '-c', 'exit 0']);

function withSnippet(dialect, body, shell, shellArgs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-recall-'));
  const file = path.join(dir, 'init.sh');
  fs.writeFileSync(file, Integration.recallSnippet(dialect, NONCE));
  try {
    return spawnSync(shell, shellArgs.concat(['source ' + file + '\n' + body]), {
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Every event the real parser accepts from real shell output. */
function parse(text) {
  return Parser.scan(Parser.createSession(NONCE), text || '');
}

test('zsh: the encoder percent-encodes the separator that would split a sequence', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  // A semicolon in a command would otherwise end the OSC sequence early and
  // desynchronise the parser for the rest of the session.
  const run = withSnippet('zsh', "__josh_enc 'cargo test; echo hi'", 'zsh', ['-f', '-c']);
  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(run.stdout.trim(), 'cargo%20test%3B%20echo%20hi');
});

test('zsh: a real prompt cycle drives the parser through a whole command', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  // The order a real session produces: precmd draws the prompt, the user
  // types, preexec fires as the command starts, precmd fires again after it
  // finishes. Driving the hooks in any other order is rejected by the state
  // machine on purpose, so the test has to be faithful to the real cycle.
  const run = withSnippet(
    'zsh', "__josh_precmd\n__josh_preexec 'ls -la'\n__josh_precmd", 'zsh', ['-f', '-c']
  );
  assert.strictEqual(run.status, 0, run.stderr);
  const events = parse(run.stdout);
  assert.deepStrictEqual(events.map((e) => e.type), ['A', 'B', 'C', 'D', 'A', 'B']);

  const command = events.find((e) => e.type === 'C');
  assert.strictEqual(command.cmd, 'ls -la', 'the command must survive encoding and parsing');
  assert.strictEqual(events.find((e) => e.type === 'D').exit, 0, 'the exit code must arrive');
});

test('zsh: a command containing a semicolon survives the round trip', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  // End to end, this is the property percent-encoding exists for: an
  // unencoded semicolon would terminate the OSC field early and the parser
  // would read a truncated command, or none at all.
  const run = withSnippet(
    'zsh', "__josh_precmd\n__josh_preexec 'cargo test; echo hi'", 'zsh', ['-f', '-c']
  );
  const command = parse(run.stdout).find((e) => e.type === 'C');
  assert.ok(command, 'the command marker must survive');
  assert.strictEqual(command.cmd, 'cargo test; echo hi');
});

test('zsh: registers its hooks rather than only defining them', {
  skip: HAS_ZSH ? false : 'zsh is not installed',
}, () => {
  const run = withSnippet(
    'zsh', 'print -r -- "$precmd_functions $preexec_functions"', 'zsh', ['-f', '-c']
  );
  assert.match(run.stdout, /__josh_precmd/);
  assert.match(run.stdout, /__josh_preexec/);
});

test('bash: the encoder percent-encodes the separator', {
  skip: HAS_BASH ? false : 'bash is not installed',
}, () => {
  const run = withSnippet('bash', "__josh_enc 'cargo test; echo hi'", 'bash', ['--norc', '-c']);
  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(run.stdout.trim(), 'cargo%20test%3B%20echo%20hi');
});

test('bash: SOURCING THE SNIPPET RECORDS NOTHING', {
  skip: HAS_BASH ? false : 'bash is not installed',
}, () => {
  // The bug this test exists for: the DEBUG trap fires on every command,
  // including the remaining lines of the snippet installing it. An earlier
  // trap recorded Josh's own `case ";$PROMPT_COMMAND;" in` as the user's
  // command. The trap is installed last, suppressed until the first prompt.
  const run = withSnippet('bash', 'true', 'bash', ['--norc', '-c']);
  const events = parse(run.stdout);
  const commands = events.filter((e) => e.type === 'C').map((e) => e.cmd);
  for (const cmd of commands) {
    assert.doesNotMatch(cmd, /PROMPT_COMMAND|__josh_/, 'recorded Josh’s own setup: ' + cmd);
  }
});

test('bash: installs its prompt hook without discarding the user’s', {
  skip: HAS_BASH ? false : 'bash is not installed',
}, () => {
  const run = withSnippet(
    'bash', 'echo "PC=$PROMPT_COMMAND"; trap -p DEBUG', 'bash', ['--norc', '-c']
  );
  assert.match(run.stdout, /PC=.*__josh_prompt/);
  assert.match(run.stdout, /__josh_debug/, 'the DEBUG trap must be installed');
});

test('bash: a user PROMPT_COMMAND set before Josh is preserved', {
  skip: HAS_BASH ? false : 'bash is not installed',
}, () => {
  // Josh appends; it never replaces. Someone else's prompt work must survive.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'josh-recall-'));
  const file = path.join(dir, 'init.sh');
  fs.writeFileSync(file, Integration.recallSnippet('bash', NONCE));
  const run = spawnSync('bash', ['--norc', '-c',
    'PROMPT_COMMAND="echo mine"\nsource ' + file + '\necho "PC=$PROMPT_COMMAND"'],
  { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.match(run.stdout, /echo mine/, 'the user’s PROMPT_COMMAND must survive');
  assert.match(run.stdout, /__josh_prompt/);
});
