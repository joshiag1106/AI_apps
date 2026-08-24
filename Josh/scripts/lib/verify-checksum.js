'use strict';

/**
 * Verifies a downloaded buffer against a pinned SHA256 hex digest.
 *
 * Kept separate from the download itself so the one part of vendoring a
 * third-party binary that must never be wrong — "does this match what we
 * pinned" — is unit tested without touching the network.
 */

const { createHash } = require('node:crypto');

function verifyChecksum(buffer, expectedHex) {
  if (typeof expectedHex !== 'string' || expectedHex.length === 0) return false;
  const actualHex = createHash('sha256').update(buffer).digest('hex');
  return actualHex === expectedHex.toLowerCase();
}

module.exports = { verifyChecksum };
