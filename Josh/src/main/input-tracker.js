'use strict';

/**
 * The partially typed command line, or an honest admission of ignorance.
 *
 * Between `B` (input starts) and `C` (command runs) no sequence fires per
 * keystroke, so this is the one place Recall must infer. It models only what
 * can be modelled with certainty -- printable characters and backspace -- and
 * gives up entirely on anything else: arrow keys, Tab, Ctrl+R, any escape
 * sequence.
 *
 * This is deliberately pessimistic. History recall, the shell's own completion
 * and reverse search all rewrite the line without Josh seeing meaningful
 * keystrokes, so a tracker that guessed would produce a confidently wrong
 * suggestion at exactly the moment the user is most likely to accept it. A
 * wrong suggestion is worse than no suggestion, and "I don't know" costs
 * nothing.
 */

/** Beyond this a line is not a command anyone is typing; stop modelling it. */
const MAX_LINE = 4096;

const DEL = '\x7f';
const BS = '\b';

function create() {
  let buffer = null; // null means "not synchronised"

  return {
    /** A `B` marker: the shell is at a fresh input point. */
    reset() {
      buffer = '';
    },

    /** Everything the renderer asks to write to the PTY passes through here. */
    consume(data) {
      if (buffer === null) return;
      if (typeof data !== 'string' || data === '') return;

      for (const ch of data) {
        if (ch === DEL || ch === BS) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        const code = ch.codePointAt(0);
        // C0 controls and DEL all mean the line changed in a way Josh did not
        // see: an escape sequence, a completion, a history recall, a submit.
        if (code < 0x20 || code === 0x7f) {
          buffer = null;
          return;
        }
        buffer += ch;
        if (buffer.length > MAX_LINE) {
          buffer = null;
          return;
        }
      }
    },

    /** The typed line, or null when Josh cannot know it. */
    line() {
      return buffer;
    },
  };
}

module.exports = { create, MAX_LINE };
