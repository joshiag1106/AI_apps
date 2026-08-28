'use strict';

/**
 * Tests for the IPC trust boundary. Everything here describes what a hostile
 * renderer is allowed to get away with, so these are the assertions that
 * matter most if the security model is ever refactored.
 */

const test = require('node:test');
const assert = require('node:assert');
const { randomUUID } = require('node:crypto');

const v = require('../src/main/validate');

test('accepts a genuine v4 session id', () => {
  assert.strictEqual(v.isSessionId(randomUUID()), true);
});

test('rejects session ids that are not v4 uuids', () => {
  const rejected = [
    '',
    'not-a-uuid',
    '../../etc/passwd',
    '00000000-0000-0000-0000-000000000000', // valid uuid shape, wrong version
    randomUUID().toUpperCase(), // we emit lowercase; be strict
    null,
    undefined,
    42,
    {},
  ];
  for (const value of rejected) {
    assert.strictEqual(v.isSessionId(value), false, 'should reject ' + String(value));
  }
});

test('assertSessionId throws a ValidationError on bad input', () => {
  assert.throws(() => v.assertSessionId('nope'), { name: 'ValidationError' });
});

test('write payloads must be strings', () => {
  assert.throws(() => v.assertWriteData(123), { name: 'ValidationError' });
  assert.throws(() => v.assertWriteData(null), { name: 'ValidationError' });
  assert.strictEqual(v.assertWriteData('ls -la\r'), 'ls -la\r');
});

test('write payloads are capped so one message cannot exhaust memory', () => {
  const justUnder = 'a'.repeat(v.LIMITS.MAX_WRITE_BYTES);
  assert.strictEqual(v.assertWriteData(justUnder).length, v.LIMITS.MAX_WRITE_BYTES);
  assert.throws(() => v.assertWriteData('a'.repeat(v.LIMITS.MAX_WRITE_BYTES + 1)), {
    name: 'ValidationError',
  });
});

test('the write cap counts bytes, not characters', () => {
  // A 4-byte emoji must not slip past a byte budget by counting as one char.
  const emoji = '\u{1F600}';
  const tooMany = emoji.repeat(v.LIMITS.MAX_WRITE_BYTES / 4 + 1);
  assert.throws(() => v.assertWriteData(tooMany), { name: 'ValidationError' });
});

test('dimensions must be integers inside sane bounds', () => {
  assert.deepStrictEqual(v.assertDimensions(80, 24), { cols: 80, rows: 24 });
  for (const [cols, rows] of [
    [0, 24],
    [80, 0],
    [-1, 24],
    [80, -1],
    [1e9, 24],
    [80, 1e9],
    [80.5, 24],
    ['80', 24],
    [NaN, 24],
    [Infinity, 24],
  ]) {
    assert.throws(() => v.assertDimensions(cols, rows), { name: 'ValidationError' });
  }
});

test('titles are stripped of escape and control characters', () => {
  // Titles arrive from the shell via OSC sequences, so they are attacker
  // controlled: a crafted title must not smuggle escapes back into the UI.
  assert.strictEqual(v.sanitizeTitle('build \x1b[31mdone\x07'), 'build [31mdone');
  assert.strictEqual(v.sanitizeTitle('a\u0000bc'), 'abc');
  assert.strictEqual(v.sanitizeTitle('plain title'), 'plain title');
});

test('titles are clamped to a sane length', () => {
  assert.strictEqual(v.sanitizeTitle('x'.repeat(5000)).length, v.LIMITS.MAX_TITLE);
  assert.strictEqual(v.sanitizeTitle(null), '');
  assert.strictEqual(v.sanitizeTitle(undefined), '');
});

test('cwd rejects null bytes and absurd lengths', () => {
  assert.strictEqual(v.assertCwd(null), null);
  assert.strictEqual(v.assertCwd(undefined), null);
  assert.strictEqual(v.assertCwd('/tmp'), '/tmp');
  assert.throws(() => v.assertCwd('/tmp/\u0000/etc'), { name: 'ValidationError' });
  assert.throws(() => v.assertCwd('/'.repeat(v.LIMITS.MAX_CWD + 1)), { name: 'ValidationError' });
  assert.throws(() => v.assertCwd(''), { name: 'ValidationError' });
  assert.throws(() => v.assertCwd(123), { name: 'ValidationError' });
});

test('only http, https and mailto URLs may reach the operating system', () => {
  assert.strictEqual(v.isSafeExternalUrl('https://example.com'), true);
  assert.strictEqual(v.isSafeExternalUrl('http://example.com/path?q=1'), true);
  assert.strictEqual(v.isSafeExternalUrl('mailto:someone@example.com'), true);
});

test('dangerous URL schemes in terminal output are refused', () => {
  // A hostile file could print an OSC 8 hyperlink using any of these.
  const dangerous = [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'smb://attacker/share',
    'vbscript:msgbox',
    'chrome://settings',
    'ms-msdt:/id',
    'not a url at all',
    '',
    null,
    undefined,
  ];
  for (const url of dangerous) {
    assert.strictEqual(v.isSafeExternalUrl(url), false, 'should refuse ' + String(url));
  }
});

test('over-long URLs are refused rather than parsed', () => {
  assert.strictEqual(
    v.isSafeExternalUrl('https://example.com/' + 'a'.repeat(v.LIMITS.MAX_URL)),
    false
  );
});

test('the session limit is a real number the manager can enforce', () => {
  assert.ok(Number.isInteger(v.LIMITS.MAX_SESSIONS_PER_WINDOW));
  assert.ok(v.LIMITS.MAX_SESSIONS_PER_WINDOW > 0);
});

test('the glyph mode is exactly two values, and undefined is not one of them', () => {
  assert.strictEqual(v.assertGlyphMode('rich'), 'rich');
  assert.strictEqual(v.assertGlyphMode('plain'), 'plain');
});

test('a near-miss glyph mode is rejected, not quietly rounded to one of them', () => {
  const rejected = [
    undefined, null, '', 'Rich', 'PLAIN', 'richx', ' rich', 'rich ',
    'powerline', 'auto', 0, 1, true, false, ['rich'], { mode: 'rich' },
  ];
  for (const value of rejected) {
    assert.throws(
      () => v.assertGlyphMode(value),
      v.ValidationError,
      'accepted ' + JSON.stringify(value)
    );
  }
});

test('the glyph mode never reaches shell script as anything but the two words', () => {
  // It is baked into generated script, so "rich" and "anything at all" are
  // not the same thing.
  assert.throws(() => v.assertGlyphMode('rich; rm -rf /'), v.ValidationError);
  assert.throws(() => v.assertGlyphMode("plain'"), v.ValidationError);
});
