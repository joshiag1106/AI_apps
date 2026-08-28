'use strict';

/**
 * C lexer for Trace.
 *
 * Two consumers, one scanner. The parser asks for tokens without trivia; the
 * editor asks with trivia and uses `raw` to lay coloured spans over the exact
 * original text. Writing this once is what keeps the editor's idea of "this is
 * a keyword" identical to the interpreter's.
 *
 * Nothing here throws. Malformed input produces a diagnostic and scanning
 * continues, because a beginner's half-typed program is the normal case rather
 * than the exceptional one.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceLex = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEYWORDS = Object.freeze([
    'int', 'char', 'double', 'void', 'struct', 'enum',
    'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default',
    'break', 'continue', 'return', 'sizeof', 'const',
  ]);

  // Longest first: '>>=' must win over '>>', which must win over '>'.
  const PUNCTUATORS = Object.freeze([
    '<<=', '>>=', '...',
    '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
    '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^',
    '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '#',
  ]);

  const SIMPLE_ESCAPES = Object.freeze({
    n: 10, t: 9, r: 13, '0': 0, a: 7, b: 8, f: 12, v: 11,
    '\\': 92, "'": 39, '"': 34,
  });

  const SPACE = 32;
  const TAB = 9;
  const NEWLINE = 10;
  const RETURN = 13;

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }
  function isHexDigit(ch) {
    return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }
  function isIdentStart(ch) {
    return ch === '_' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }
  function isIdentPart(ch) {
    return isIdentStart(ch) || isDigit(ch);
  }

  function tokenize(source, options) {
    const text = String(source == null ? '' : source);
    const includeTrivia = Boolean(options && options.includeTrivia);
    const tokens = [];
    const errors = [];

    let index = 0;
    let line = 1;
    let col = 1;

    function fail(code, terse, plain, atLine, atCol, length) {
      errors.push({
        code: code,
        terse: terse,
        plain: plain,
        locations: [{ line: atLine, col: atCol, length: length }],
      });
    }

    function push(type, value, start, atLine, atCol) {
      const raw = text.slice(start, index);
      const token = {
        type: type,
        value: value,
        raw: raw,
        line: atLine,
        col: atCol,
        length: raw.length,
      };
      const trivia = type === 'comment' || type === 'space' || type === 'stray';
      if (includeTrivia || !trivia) tokens.push(token);
    }

    function advance(count) {
      for (let n = 0; n < count; n += 1) {
        if (text.charCodeAt(index) === NEWLINE) {
          line += 1;
          col = 1;
        } else {
          col += 1;
        }
        index += 1;
      }
    }

    while (index < text.length) {
      const start = index;
      const startLine = line;
      const startCol = col;
      const ch = text[index];
      const code = text.charCodeAt(index);

      // Whitespace, including newlines, becomes one trivia token per run.
      if (code === SPACE || code === TAB || code === NEWLINE || code === RETURN) {
        while (index < text.length) {
          const c = text.charCodeAt(index);
          if (c !== SPACE && c !== TAB && c !== NEWLINE && c !== RETURN) break;
          advance(1);
        }
        push('space', null, start, startLine, startCol);
        continue;
      }

      if (ch === '/' && text[index + 1] === '/') {
        while (index < text.length && text.charCodeAt(index) !== NEWLINE) advance(1);
        push('comment', null, start, startLine, startCol);
        continue;
      }

      if (ch === '/' && text[index + 1] === '*') {
        advance(2);
        let closed = false;
        while (index < text.length) {
          if (text[index] === '*' && text[index + 1] === '/') {
            advance(2);
            closed = true;
            break;
          }
          advance(1);
        }
        if (!closed) {
          fail('unterminated-comment',
            'unterminated comment',
            'This comment opens with a slash-star but never closes. Add a '
              + 'star-slash where you want it to end.',
            startLine, startCol, index - start);
        }
        push('comment', null, start, startLine, startCol);
        continue;
      }

      if (isIdentStart(ch)) {
        while (index < text.length && isIdentPart(text[index])) advance(1);
        const word = text.slice(start, index);
        push(KEYWORDS.includes(word) ? 'keyword' : 'ident', word, start, startLine, startCol);
        continue;
      }

      if (isDigit(ch) || (ch === '.' && isDigit(text[index + 1]))) {
        const scanned = scanNumber(text, index);
        advance(scanned.length);
        if (scanned.error) {
          fail(scanned.error.code, scanned.error.terse, scanned.error.plain,
            startLine, startCol, scanned.length);
        }
        push(scanned.type, scanned.value, start, startLine, startCol);
        continue;
      }

      if (ch === '"') {
        const scanned = scanQuoted(text, index, '"');
        advance(scanned.length);
        for (const err of scanned.errors) {
          fail(err.code, err.terse, err.plain, startLine, startCol, scanned.length);
        }
        push('string', scanned.text, start, startLine, startCol);
        continue;
      }

      if (ch === "'") {
        const scanned = scanQuoted(text, index, "'");
        advance(scanned.length);
        for (const err of scanned.errors) {
          fail(err.code, err.terse, err.plain, startLine, startCol, scanned.length);
        }
        if (scanned.errors.length === 0 && scanned.text.length !== 1) {
          fail('bad-char-literal',
            'character literal must hold exactly one character',
            'Single quotes hold one character, like a lowercase a. For text, '
              + 'use double quotes.',
            startLine, startCol, scanned.length);
        }
        push('char', scanned.text.length ? scanned.text.charCodeAt(0) : 0,
          start, startLine, startCol);
        continue;
      }

      const punct = PUNCTUATORS.find((p) => text.startsWith(p, index));
      if (punct) {
        advance(punct.length);
        push('punct', punct, start, startLine, startCol);
        continue;
      }

      advance(1);
      fail('stray-character',
        'stray ' + JSON.stringify(ch) + ' in program',
        'This character has no meaning in C. Delete it.',
        startLine, startCol, 1);
      // Emitted as trivia so the editor can reproduce the source exactly. The
      // parser never sees it; the error above is the parser's notification.
      push('stray', ch, start, startLine, startCol);
    }

    tokens.push({ type: 'eof', value: null, raw: '', line: line, col: col, length: 0 });
    return { tokens: tokens, errors: errors };
  }

  /** Returns {type, value, length, error?}. Consumes nothing itself. */
  function scanNumber(text, start) {
    let index = start;
    if (text[index] === '0' && (text[index + 1] === 'x' || text[index + 1] === 'X')) {
      index += 2;
      const digitsStart = index;
      while (index < text.length && isHexDigit(text[index])) index += 1;
      if (index === digitsStart) {
        return {
          type: 'int', value: 0, length: index - start,
          error: {
            code: 'bad-number',
            terse: 'hexadecimal literal has no digits',
            plain: 'A 0x prefix must be followed by hexadecimal digits, like 0x1f.',
          },
        };
      }
      return {
        type: 'int',
        value: parseInt(text.slice(digitsStart, index), 16),
        length: index - start,
      };
    }

    let isDouble = false;
    while (index < text.length && isDigit(text[index])) index += 1;
    if (text[index] === '.') {
      isDouble = true;
      index += 1;
      while (index < text.length && isDigit(text[index])) index += 1;
    }
    if (text[index] === 'e' || text[index] === 'E') {
      const save = index;
      index += 1;
      if (text[index] === '+' || text[index] === '-') index += 1;
      if (isDigit(text[index])) {
        isDouble = true;
        while (index < text.length && isDigit(text[index])) index += 1;
      } else {
        index = save; // the 'e' was not an exponent; leave it for the next token
      }
    }
    const raw = text.slice(start, index);
    return {
      type: isDouble ? 'double' : 'int',
      value: isDouble ? parseFloat(raw) : parseInt(raw, 10),
      length: index - start,
    };
  }

  /** Scans a quoted run, decoding escapes. Never throws. */
  function scanQuoted(text, start, quote) {
    let index = start + 1;
    let out = '';
    const errors = [];

    while (index < text.length && text[index] !== quote) {
      if (text.charCodeAt(index) === NEWLINE) break; // a newline ends the literal
      if (text[index] === '\\') {
        const escape = text[index + 1];
        if (escape === undefined) break;
        if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, escape)) {
          out += String.fromCharCode(SIMPLE_ESCAPES[escape]);
          index += 2;
          continue;
        }
        errors.push({
          code: 'unknown-escape',
          terse: 'unknown escape sequence backslash-' + escape,
          plain: 'A backslash starts an escape. The ones Trace understands are '
            + 'backslash n, t, r, 0, backslash, single quote and double quote.',
        });
        out += escape;
        index += 2;
        continue;
      }
      out += text[index];
      index += 1;
    }

    if (text[index] !== quote) {
      errors.push({
        code: quote === '"' ? 'unterminated-string' : 'unterminated-char',
        terse: 'unterminated literal',
        plain: 'This literal opens but never closes. Add a matching quote.',
      });
      return { text: out, length: index - start, errors: errors };
    }
    return { text: out, length: index + 1 - start, errors: errors };
  }

  return { tokenize, KEYWORDS, PUNCTUATORS };
});
