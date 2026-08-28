'use strict';

/**
 * Pure validation helpers for every value that crosses the IPC boundary.
 *
 * The renderer is treated as hostile. Anything arriving from it is unvalidated
 * attacker-controlled input until one of these functions has vouched for it.
 * These functions are deliberately free of Electron/Node-fs dependencies so the
 * whole trust boundary can be unit-tested without booting an app.
 */

const LIMITS = Object.freeze({
  MAX_WRITE_BYTES: 1024 * 1024, // 1 MiB — generous for paste, fatal for flooding
  MAX_COLS: 2000,
  MAX_ROWS: 2000,
  MIN_COLS: 1,
  MIN_ROWS: 1,
  MAX_TITLE: 512,
  MAX_SUGGESTION: 512,
  MAX_CWD: 4096,
  MAX_SESSIONS_PER_WINDOW: 50,
  MAX_URL: 2048,
});

// RFC 4122 v4, which is what crypto.randomUUID() produces.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Protocols we are willing to hand to the OS. Terminal output is untrusted:
// a malicious file could print an OSC-8 hyperlink pointing at file:// or
// smb:// and try to get the shell to open it. Only these three are safe.
const SAFE_PROTOCOLS = Object.freeze(['https:', 'http:', 'mailto:']);

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function fail(message) {
  throw new ValidationError(message);
}

function isSessionId(value) {
  return typeof value === 'string' && UUID_V4.test(value);
}

function assertSessionId(value) {
  if (!isSessionId(value)) fail('invalid session id');
  return value;
}

/** Terminal input. Must be a string; capped so one IPC call cannot exhaust memory. */
function assertWriteData(value) {
  if (typeof value !== 'string') fail('write payload must be a string');
  if (Buffer.byteLength(value, 'utf8') > LIMITS.MAX_WRITE_BYTES) {
    fail('write payload exceeds ' + LIMITS.MAX_WRITE_BYTES + ' bytes');
  }
  return value;
}

/** Terminal geometry. Non-integers and absurd sizes are rejected outright. */
function assertDimensions(cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    fail('cols and rows must be integers');
  }
  if (cols < LIMITS.MIN_COLS || cols > LIMITS.MAX_COLS) fail('cols out of range');
  if (rows < LIMITS.MIN_ROWS || rows > LIMITS.MAX_ROWS) fail('rows out of range');
  return { cols, rows };
}

/**
 * C0 controls and DEL. Hoisted so the two sanitisers below cannot drift apart:
 * both exist because text reaching the UI came from outside Josh's control.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Titles come from the shell via OSC sequences — strip control chars, then clamp. */
function sanitizeTitle(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').slice(0, LIMITS.MAX_TITLE);
}

/**
 * Suggestion text derives from previously executed commands, so it is data,
 * not something safe to hand a renderer verbatim. A historical command
 * carrying an escape sequence must not be able to paint the UI.
 */
function sanitizeSuggestion(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').slice(0, LIMITS.MAX_SUGGESTION);
}

/**
 * A requested working directory. We only check shape here; existence and the
 * real security decision (is this a directory we may spawn in?) belong to the
 * caller, which has fs access.
 */
function assertCwd(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail('cwd must be a string or null');
  if (value.length === 0 || value.length > LIMITS.MAX_CWD) fail('cwd length invalid');
  if (value.includes('\u0000')) fail('cwd contains a null byte');
  return value;
}

/**
 * Decides whether a URL from terminal output may be handed to the OS.
 * Returns false (never throws) so callers can silently ignore hostile links.
 */
/**
 * The renderer measured the font and says whether it has powerline glyphs.
 * That is a claim from an untrusted process like any other, so it is checked
 * against the two-value enum rather than passed through: the value ends up
 * baked into shell script, where "rich" and "anything at all" are not the same
 * thing. Absent is rejected too; the caller decides what a missing value means.
 */
function assertGlyphMode(value) {
  if (value !== 'rich' && value !== 'plain') fail('glyph mode must be rich or plain');
  return value;
}

function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.length > LIMITS.MAX_URL) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return SAFE_PROTOCOLS.includes(parsed.protocol);
}

module.exports = {
  LIMITS,
  SAFE_PROTOCOLS,
  ValidationError,
  isSessionId,
  assertSessionId,
  assertWriteData,
  assertDimensions,
  sanitizeTitle,
  sanitizeSuggestion,
  assertCwd,
  assertGlyphMode,
  isSafeExternalUrl,
};
