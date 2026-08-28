'use strict';

/**
 * OSC 133 semantic prompt marking, authenticated by a per-session nonce.
 *
 * Terminal output is fully attacker-controlled: a hostile file, log or HTTP
 * response chooses what Josh receives. Semantic marking would make that worse
 * -- output able to forge prompt state could make Josh record fabricated
 * history, or suggest an attacker's command at the moment the user is most
 * likely to accept it.
 *
 * The nonce closes that. Josh mints a fresh random value per session and
 * ignores any sequence not carrying it, so `cat`-ing crafted sequences
 * achieves nothing. What the nonce does NOT defend against, plainly: any
 * program the user actually runs inherits the environment and can read the
 * nonce. That is untrusted *execution*, which no terminal can prevent, and is
 * out of scope. The nonce defends against untrusted *output*, the realistic
 * and stated threat.
 */

const { randomBytes } = require('node:crypto');

/** Cheap substring guard, checked before any regex runs on an output chunk. */
const HINT = '\x1b]133;';

/** `ESC ] 133 ; <body> (BEL | ST)` */
const SEQUENCE = /\x1b\]133;([^\x07\x1b]*)(?:\x07|\x1b\\)/;

const MAX_COMMAND = 4096;

function makeNonce() {
  return randomBytes(16).toString('hex');
}

/** Percent-decoding that answers null instead of throwing on bad input. */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Parse one sequence against the session's nonce.
 *
 * Returns null for anything unrecognised, unauthenticated or malformed. There
 * is deliberately no error channel: a rejected sequence is not an event worth
 * reporting, and reporting it would itself be a signal an attacker could use.
 */
function parseSequence(text, nonce) {
  if (typeof nonce !== 'string' || !nonce) return null;
  if (typeof text !== 'string') return null;

  const match = SEQUENCE.exec(text);
  if (!match) return null;

  const parts = match[1].split(';');
  const type = parts[0];
  if (type !== 'A' && type !== 'B' && type !== 'C' && type !== 'D') return null;

  // The nonce must be the next field and must match exactly. A prefix match
  // would let `nonce=<real><anything>` through.
  if (parts[1] !== 'nonce=' + nonce) return null;

  if (type === 'A' || type === 'B') return { type, cmd: null, exit: null };

  if (type === 'C') {
    const field = parts[2];
    if (typeof field !== 'string' || !field.startsWith('cmd=')) {
      return { type, cmd: null, exit: null };
    }
    const cmd = safeDecode(field.slice(4));
    if (cmd === null) return null;
    return { type, cmd: cmd.slice(0, MAX_COMMAND), exit: null };
  }

  const code = parts[2];
  if (typeof code !== 'string' || !/^\d{1,3}$/.test(code)) return null;
  return { type, cmd: null, exit: Number(code) };
}

module.exports = { HINT, SEQUENCE, MAX_COMMAND, makeNonce, parseSequence };
