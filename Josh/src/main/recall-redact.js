'use strict';

/**
 * The one question asked before anything reaches disk: may this command be
 * written down?
 *
 * This lives apart from the store because it is the module where a mistake
 * leaks a secret. It has no filesystem access and no dependencies, so it can
 * be reviewed and tested in isolation.
 *
 * The answer is a boolean, never a redacted string. Truncating a secret still
 * stores part of it, and a partially stored command is useless as a suggestion
 * anyway. Recording a shell history is a genuinely sensitive act and the
 * default is conservative.
 *
 * Over-redaction is not free either: `git show a1b2c3d` is exactly the kind of
 * command this feature exists to suggest, so short hex is deliberately kept.
 */

const PATTERNS = [
  // VAR=value where the name looks secret-ish.
  /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*\s*=/i,
  // --password / --token / --api-key / --secret, value in either form.
  /(?:^|\s)--?(?:password|passwd|token|api[-_]?key|secret|credential)(?:[=\s]|$)/i,
  // Authorization headers, however they are spelled.
  /\bauthorization\s*:\s*(?:bearer|basic|token)\b/i,
  // A long high-entropy literal: 40+ chars of base64/hex alphabet in one run.
  /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/,
];

/**
 * Compile user-supplied patterns, discarding any that will not compile.
 *
 * A bad regex in a settings file must not break recording, and must certainly
 * not throw during a PTY write.
 */
function compilePatterns(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (entry instanceof RegExp) { out.push(entry); continue; }
    if (typeof entry !== 'string' || !entry) continue;
    try {
      out.push(new RegExp(entry, 'i'));
    } catch {
      // An unparseable pattern is ignored, exactly as an unknown settings key is.
    }
  }
  return out;
}

/** True when this command must never be written down. */
function shouldRedact(cmd, extraPatterns) {
  // Anything that is not a real command string is refused rather than trusted.
  if (typeof cmd !== 'string' || cmd.trim() === '') return true;

  for (const pattern of PATTERNS) {
    if (pattern.test(cmd)) return true;
  }

  const extra = Array.isArray(extraPatterns) ? extraPatterns : [];
  for (const pattern of extra) {
    if (pattern instanceof RegExp && pattern.test(cmd)) return true;
  }

  return false;
}

module.exports = { shouldRedact, compilePatterns, PATTERNS };
