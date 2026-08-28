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

/**
 * The most a partial sequence may occupy while waiting for its terminator.
 *
 * Without this, output containing the hint but never terminating -- which
 * hostile output can produce deliberately -- would grow the carry buffer
 * forever. Dropping the carry loses at most one marker, costing one unrecorded
 * command; retaining it unboundedly costs the process.
 */
const MAX_CARRY = 8192;

const NEXT = {
  idle:    { A: 'prompt' },
  prompt:  { B: 'input' },
  input:   { C: 'running' },
  running: { D: 'idle' },
};

function createSession(nonce) {
  return {
    nonce: typeof nonce === 'string' && nonce ? nonce : null,
    phase: 'idle',
    carry: '',
  };
}

/**
 * Consume one output chunk, returning every authenticated event in order.
 *
 * Sequences are left in the stream the renderer receives: xterm.js ignores OSC
 * codes it does not implement, and rewriting the stream risks corrupting
 * multi-byte or split chunks for no benefit.
 */
/**
 * The longest suffix of `text` that could be the beginning of a hint.
 *
 * The pipe, not the shell, decides where a read ends, so a marker is regularly
 * cut in half -- often after the single escape byte. Discarding that fragment
 * loses the marker entirely, and under small reads that means Recall records
 * nothing at all while appearing to work.
 */
function hintTail(text) {
  const max = Math.min(HINT.length - 1, text.length);
  for (let n = max; n > 0; n--) {
    if (HINT.startsWith(text.slice(text.length - n))) return text.slice(text.length - n);
  }
  return '';
}

function scan(state, chunk) {
  if (!state || !state.nonce || typeof chunk !== 'string' || !chunk) return [];

  // Cheap guard: one indexOf on every output chunk. When it misses, the chunk
  // may still END mid-hint, so keep just that fragment rather than dropping it.
  if (state.carry === '' && chunk.indexOf(HINT) === -1) {
    state.carry = hintTail(chunk);
    return [];
  }

  let text = state.carry + chunk;
  const events = [];

  for (;;) {
    const start = text.indexOf(HINT);
    if (start === -1) { text = hintTail(text); break; }

    const match = SEQUENCE.exec(text.slice(start));
    if (!match) {
      // An unterminated sequence: keep it for the next chunk.
      text = text.slice(start);
      break;
    }

    const event = parseSequence(match[0], state.nonce);
    if (event) {
      const target = NEXT[state.phase] && NEXT[state.phase][event.type];
      state.phase = target || 'idle';
      if (target) events.push(event);
    }

    text = text.slice(start + match[0].length);
  }

  state.carry = text.length > MAX_CARRY ? '' : text;
  return events;
}

module.exports = {
  HINT, SEQUENCE, MAX_COMMAND, MAX_CARRY,
  makeNonce, parseSequence, createSession, scan,
};
