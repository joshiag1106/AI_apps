'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Store = require('../src/main/recall-store.js');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'josh-recall-')), 'recall.jsonl');
}

const entry = (over) => Object.assign(
  { cmd: 'ls', cwd: '/p', fp: ['git'], exit: 0, ms: 12, ts: 1756022400 }, over || {}
);

test('a recorded command can be read back', () => {
  const s = new Store.RecallStore({ file: tmpFile() });
  assert.strictEqual(s.record(entry({ cmd: 'cargo test' })), true);
  assert.strictEqual(s.candidates()[0].cmd, 'cargo test');
});

test('records survive a reload from disk', () => {
  const file = tmpFile();
  new Store.RecallStore({ file }).record(entry({ cmd: 'npm run build' }));
  const b = new Store.RecallStore({ file });
  b.load();
  assert.strictEqual(b.candidates()[0].cmd, 'npm run build');
});

test('THE FILE IS 0600', () => {
  // The store is a shell history. Its mode is part of the threat model.
  const file = tmpFile();
  new Store.RecallStore({ file }).record(entry());
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
});

test('A REDACTED COMMAND NEVER REACHES DISK', () => {
  const file = tmpFile();
  const s = new Store.RecallStore({ file });
  assert.strictEqual(s.record(entry({ cmd: 'API_KEY=secret123 deploy' })), false);
  assert.strictEqual(s.size(), 0);
  const onDisk = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  assert.doesNotMatch(onDisk, /secret123/);
  assert.doesNotMatch(onDisk, /API_KEY/);
});

test('a user exclude pattern keeps its matches off disk', () => {
  const s = new Store.RecallStore({ file: tmpFile(), excludePatterns: ['internal-tool'] });
  assert.strictEqual(s.record(entry({ cmd: 'internal-tool deploy' })), false);
  assert.strictEqual(s.record(entry({ cmd: 'ls' })), true);
});

test('each record is one line of JSON carrying a schema version', () => {
  const file = tmpFile();
  const s = new Store.RecallStore({ file });
  s.record(entry({ cmd: 'ls' }));
  s.record(entry({ cmd: 'pwd' }));
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(JSON.parse(lines[0]).v, 1);
  assert.strictEqual(JSON.parse(lines[0]).cmd, 'ls');
});

test('A CORRUPT LINE IS SKIPPED RATHER THAN FAILING THE LOAD', () => {
  // The file is plain text on disk. A half-written line after a crash must not
  // cost the user their entire history.
  const file = tmpFile();
  fs.writeFileSync(file, '{"v":1,"cmd":"ls"}\nnot json at all\n{"v":1,"cmd":"pwd"}\n', { mode: 0o600 });
  const s = new Store.RecallStore({ file });
  s.load();
  assert.deepStrictEqual(s.candidates().map((c) => c.cmd), ['ls', 'pwd']);
});

test('a missing file loads as an empty store, not an error', () => {
  const s = new Store.RecallStore({ file: path.join(os.tmpdir(), 'josh-nope', 'x.jsonl') });
  s.load();
  assert.strictEqual(s.size(), 0);
});

test('compaction keeps the store within its cap', () => {
  const s = new Store.RecallStore({ file: tmpFile(), maxEntries: 10 });
  for (let i = 0; i < 25; i++) s.record(entry({ cmd: 'cmd' + i, ts: 1756022400 + i }));
  s.compact();
  assert.ok(s.size() <= 10, 'size was ' + s.size());
});

test('compaction keeps the most recent records', () => {
  const s = new Store.RecallStore({ file: tmpFile(), maxEntries: 5 });
  for (let i = 0; i < 20; i++) s.record(entry({ cmd: 'cmd' + i, ts: 1756022400 + i }));
  s.compact();
  assert.ok(s.candidates().map((c) => c.cmd).includes('cmd19'), 'the newest must survive');
});

test('a fingerprint names the ecosystems a directory belongs to', () => {
  assert.deepStrictEqual(
    Store.fingerprintFor(['package.json', '.git', 'README.md']).sort(), ['git', 'npm']
  );
  assert.deepStrictEqual(Store.fingerprintFor(['Cargo.toml']), ['cargo']);
  assert.deepStrictEqual(Store.fingerprintFor([]), []);
});

test('an unknown directory has an empty fingerprint rather than a guess', () => {
  assert.deepStrictEqual(Store.fingerprintFor(['notes.txt', 'photo.jpg']), []);
});
