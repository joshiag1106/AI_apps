'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Redact = require('../src/main/recall-redact.js');

const keep = (cmd) => assert.strictEqual(Redact.shouldRedact(cmd, []), false, 'should keep: ' + cmd);
const drop = (cmd) => assert.strictEqual(Redact.shouldRedact(cmd, []), true, 'should drop: ' + cmd);

test('ordinary commands are kept', () => {
  keep('ls -la');
  keep('git status');
  keep('cargo test --release');
  keep('npm run build');
  keep('ssh user@host');
  keep('cd ../other-project');
});

test('an assignment to a secret-shaped variable is dropped', () => {
  drop('GITHUB_TOKEN=ghp_abcdefghijklmnop npm publish');
  drop('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI cargo run');
  drop('export API_KEY=abc123');
  drop('DB_PASSWORD=hunter2 ./run.sh');
});

test('a secret-bearing flag is dropped', () => {
  drop('curl -u user --password hunter2 https://example.com');
  drop('mysql --password=hunter2');
  drop('gh auth login --token ghp_xxxxxxxxxxxx');
  drop('deploy --api-key abcdef123456');
  drop('tool --secret value');
});

test('a long high-entropy literal is dropped', () => {
  drop('echo eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijklmnopqrstuvwx');
  drop('curl -H "Authorization: Bearer 9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c"');
});

test('A SHORT HEX STRING IS KEPT -- git lives on those', () => {
  // Over-redacting is not free: `git show a1b2c3d` is exactly the kind of
  // command the whole feature exists to suggest.
  keep('git show a1b2c3d');
  keep('git checkout 4f2a9c1');
  keep('docker run -p 8080:8080 myimage');
});

test('a path that merely contains the word key is kept', () => {
  keep('vim ~/.ssh/config');
  keep('cat notes/monkey.txt');
  keep('ls keyboards/');
});

test('matching is case-insensitive', () => {
  drop('github_token=abc npm publish');
  drop('curl --PASSWORD hunter2');
});

test('a user pattern drops what it matches', () => {
  assert.strictEqual(Redact.shouldRedact('internal-tool deploy', [/internal-tool/]), true);
  assert.strictEqual(Redact.shouldRedact('ls', [/internal-tool/]), false);
});

test('an invalid user pattern is discarded, not thrown', () => {
  const compiled = Redact.compilePatterns(['(unclosed', 'valid.*']);
  assert.strictEqual(compiled.length, 1);
  assert.ok(compiled[0].test('valid thing'));
});

test('a non-string command is redacted rather than trusted', () => {
  assert.strictEqual(Redact.shouldRedact(null, []), true);
  assert.strictEqual(Redact.shouldRedact(undefined, []), true);
  assert.strictEqual(Redact.shouldRedact(42, []), true);
  assert.strictEqual(Redact.shouldRedact('', []), true);
});

test('REDACTION IS ALL OR NOTHING -- the answer is a boolean, never a string', () => {
  // Truncating a secret still stores part of it, and a partially stored
  // command is both useless as a suggestion and dangerous on disk.
  assert.strictEqual(typeof Redact.shouldRedact('API_KEY=x ls', []), 'boolean');
});
