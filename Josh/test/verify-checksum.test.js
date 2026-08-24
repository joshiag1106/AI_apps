'use strict';

/**
 * The Windows sed/awk fallback downloads a third-party binary at build time.
 * "Does this match the bytes we pinned" is the one question that must never be
 * answered wrongly, so it lives in its own module and is tested without
 * touching the network.
 */

const test = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');

const { verifyChecksum } = require('../scripts/lib/verify-checksum');

test('a buffer matching its own SHA256 verifies', () => {
  const buffer = Buffer.from('hello world');
  const hex = createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(verifyChecksum(buffer, hex), true);
});

test('a tampered buffer fails verification', () => {
  const buffer = Buffer.from('hello world');
  const hex = createHash('sha256').update(Buffer.from('something else')).digest('hex');
  assert.strictEqual(verifyChecksum(buffer, hex), false);
});

test('the expected hex is compared case-insensitively', () => {
  const buffer = Buffer.from('hello world');
  const hex = createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(verifyChecksum(buffer, hex.toUpperCase()), true);
});

test('an empty buffer does not accidentally verify against an empty string', () => {
  // Guards the degenerate case: a failed download producing zero bytes must
  // not be waved through by an equally empty expectation.
  assert.strictEqual(verifyChecksum(Buffer.alloc(0), ''), false);
});
