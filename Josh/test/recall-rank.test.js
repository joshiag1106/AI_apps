'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Rank = require('../src/main/recall-rank.js');

const NOW = 1756022400;
const HOUR = 3600;

const c = (over) => Object.assign(
  { cmd: 'ls', cwd: '/p', fp: ['git'], exit: 0, ms: 10, ts: NOW - HOUR }, over || {}
);
const ctx = (over) => Object.assign(
  { prefix: '', cwd: '/p', fingerprint: ['git'], now: NOW }, over || {}
);

test('only commands matching the prefix are returned', () => {
  const out = Rank.rank([c({ cmd: 'cargo test' }), c({ cmd: 'ls -la' })], ctx({ prefix: 'car' }));
  assert.deepStrictEqual(out.map((r) => r.cmd), ['cargo test']);
});

test('the prefix match is case-sensitive, because commands are', () => {
  assert.deepStrictEqual(Rank.rank([c({ cmd: 'Cargo' })], ctx({ prefix: 'car' })), []);
});

test('a command identical to the prefix is not offered', () => {
  // There is nothing left to suggest, and the ghost text would be empty.
  assert.deepStrictEqual(Rank.rank([c({ cmd: 'ls' })], ctx({ prefix: 'ls' })), []);
});

test('LOCALITY: the same directory outranks a fingerprint match', () => {
  const here = c({ cmd: 'cargo test --here', cwd: '/p' });
  const similar = c({ cmd: 'cargo test --elsewhere', cwd: '/other', fp: ['git'] });
  assert.strictEqual(Rank.rank([similar, here], ctx({ prefix: 'cargo' }))[0].cmd, 'cargo test --here');
});

test('LOCALITY: a fingerprint match outranks an unrelated directory', () => {
  const similar = c({ cmd: 'cargo a', cwd: '/other', fp: ['git'] });
  const unrelated = c({ cmd: 'cargo b', cwd: '/far', fp: [] });
  assert.strictEqual(Rank.rank([unrelated, similar], ctx({ prefix: 'cargo' }))[0].cmd, 'cargo a');
});

test('OUTCOME: a fresher failure must not beat an older success', () => {
  const worked = c({ cmd: 'cargo test --lib', exit: 0 });
  const failed = c({ cmd: 'cargo test --all', exit: 101, ts: NOW - 60 });
  assert.strictEqual(Rank.rank([failed, worked], ctx({ prefix: 'cargo' }))[0].cmd, 'cargo test --lib');
});

test('RECENCY: the more recent of two equals wins', () => {
  const old = c({ cmd: 'npm run old', ts: NOW - HOUR * 24 * 30 });
  const fresh = c({ cmd: 'npm run fresh', ts: NOW - 60 });
  assert.strictEqual(Rank.rank([old, fresh], ctx({ prefix: 'npm' }))[0].cmd, 'npm run fresh');
});

test('FREQUENCY: repetition helps, but sublinearly', () => {
  // One habit must not drown everything else: twenty repeats of a stale,
  // far-away command should not beat a fresh, local, successful one.
  const many = [];
  for (let i = 0; i < 20; i++) {
    many.push(c({ cmd: 'npm run stale', cwd: '/far', fp: [], ts: NOW - HOUR * 24 * 60 }));
  }
  const fresh = c({ cmd: 'npm run fresh', cwd: '/p', ts: NOW - 60 });
  assert.strictEqual(Rank.rank(many.concat([fresh]), ctx({ prefix: 'npm' }))[0].cmd, 'npm run fresh');
});

test('duplicates collapse to one entry', () => {
  assert.strictEqual(Rank.rank([c({ cmd: 'ls -la' }), c({ cmd: 'ls -la' })], ctx({ prefix: 'ls' })).length, 1);
});

test('REPAIR PAIRS: typing the form that failed suggests the form that worked', () => {
  // The single most valuable signal in the whole ranking function.
  const failed = c({ cmd: 'git push origin main', exit: 128, ts: NOW - 300 });
  const fixed = c({ cmd: 'git push --set-upstream origin main', exit: 0, ts: NOW - 290 });
  const out = Rank.rank([failed, fixed], ctx({ prefix: 'git push' }));
  assert.strictEqual(out[0].cmd, 'git push --set-upstream origin main');
});

test('best() returns only the text after the prefix', () => {
  assert.strictEqual(Rank.best([c({ cmd: 'cargo test --release' })], ctx({ prefix: 'cargo ' })), 'test --release');
});

test('best() is null when nothing matches', () => {
  assert.strictEqual(Rank.best([c({ cmd: 'ls' })], ctx({ prefix: 'xyz' })), null);
});

test('BEST() IS NULL FOR AN EMPTY PREFIX', () => {
  // With nothing typed there is no evidence to rank on, and ghost text
  // appearing on a bare prompt is startling rather than helpful.
  assert.strictEqual(Rank.best([c({ cmd: 'ls' })], ctx({ prefix: '' })), null);
});

test('best() is null when the prefix is unknown', () => {
  assert.strictEqual(Rank.best([c({ cmd: 'ls' })], ctx({ prefix: null })), null);
});

test('ranking is pure: it never reads the clock itself', () => {
  const candidates = [c({ cmd: 'ls -la' })];
  assert.deepStrictEqual(
    Rank.rank(candidates, ctx()).map((r) => r.score),
    Rank.rank(candidates, ctx()).map((r) => r.score)
  );
});

test('an empty candidate list ranks to nothing', () => {
  assert.deepStrictEqual(Rank.rank([], ctx({ prefix: 'x' })), []);
  assert.strictEqual(Rank.best([], ctx({ prefix: 'x' })), null);
});
