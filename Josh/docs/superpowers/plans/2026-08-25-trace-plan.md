# Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second kind of pane in Josh that runs a C program one step at a time and draws what happens — stack frames, variables with real byte values, heap blocks, and pointers as arrows — catching and explaining the mistakes real hardware answers with silence.

**Architecture:** Renderer-only. Source goes through a lexer and parser to an AST; a step evaluator walks it against a byte-addressed machine with a shadow map recording every live object's address, size, type and per-byte initialisation. The shadow map is both what the diagram draws and what makes undefined behaviour detectable. The UI drives stepping, so the interpreter contains no loop of its own.

**Tech Stack:** Node.js built-ins and browser DOM only. No new npm dependencies. UMD module wrapper (`module.exports` in Node, a global in the renderer) matching `split-tree.js`, `themes.js` and `command-palette.js`. Tests are `node --test`.

**Spec:** [docs/superpowers/specs/2026-08-25-trace-design.md](../specs/2026-08-25-trace-design.md)

## Global Constraints

- **Renderer-only.** No main-process logic change, no new IPC channel, no Node API, no filesystem, no subprocess, no network. The preload allowlist stays at 16 channels.
- **No `eval`, no `Function`, no dynamic code generation.** The interpreter walks an AST. The CSP forbids it anyway; the design does not want it.
- **The interpreter contains no loop over program steps.** `step()` performs one step and returns. Any "run to completion" loop lives in the UI, with yields. A runaway program must never hang the app.
- **Hard caps, each producing a teaching diagnostic rather than a failure:** 5,000,000 total steps; 1 MiB address space (`0x00000000` to `0x00100000`); 200 stack frames; 200,000 journal entries.
- **Real sizes, little-endian:** `int` 4, `char` 1, `double` 8, pointer 8. Addresses are real numbers, printable with `%p`.
- **Determinism.** Same program, same output, same journal, every run, every platform. `rand` is seeded to a fixed value unless `srand` is called.
- **Every diagnostic carries two messages**, a `terse` compiler-style one and a `plain` beginner-facing one, plus source locations and any memory ranges to highlight.
- **Leaving the subset is a diagnostic, never a crash and never a bare parse error.** It names the construct and lists what is supported.
- **Never write a literal control or private-use character into a source file, and do not use backslash-u escapes for them.** Build them with `String.fromCharCode(10)` and compare with `codePointAt`.
- **Node 20+**, matching `engines` in `package.json`.

## File Structure

| File | Responsibility | Pure |
| --- | --- | --- |
| `src/renderer/js/trace-lex.js` | Source to tokens; also feeds editor syntax colouring | yes |
| `src/renderer/js/trace-parse.js` | Tokens to AST, with real error messages | yes |
| `src/renderer/js/trace-machine.js` | Byte memory, shadow map, journal, UB checks | yes |
| `src/renderer/js/trace-interp.js` | The step evaluator | yes |
| `src/renderer/js/trace-stdlib.js` | Built-in library functions | yes |
| `src/renderer/js/trace-examples.js` | Shipped worked programs (data only) | yes |
| `src/renderer/js/trace-editor.js` | Editable code pane | no |
| `src/renderer/js/trace-panel.js` | Diagram, controls, output | no |

**Modified:** `split-tree.js` (panes gain a `kind`), `app.js` (construct Trace panes, palette entries), `index.html` (script tags), `css/app.css` (styles), `settings.js` (two keys), `README.md` and `docs/design.md`.

`trace-machine.js` is the largest and most load-bearing module. It is built across Tasks 5 to 8 rather than written at once, and each of those tasks leaves it independently testable.

## Task order and dependencies

```
1 lex --> 2 expr parse --> 3 stmt parse --> 4 top level
                                                |
5 memory --> 6 shadow --> 7 journal --> 8 UB    |
                 |                              |
                 +------------> 9 expr eval <---+
                                  |
                             10 statements
                                  |
                             11 functions --> 12 printf --> 13 allocator
                                                                 |
                                                            14 corpus
                                                                 |
        15 pane type --> 16 editor --> 17 diagram --> 18 controls --> 19 docs
```

Tasks 1 to 14 are pure and verifiable entirely with `node --test`; nothing in
them changes what the application does. Task 15 is the first task with a visible
effect. That ordering is deliberate: the engine is finished and tested before
any UI exists to misreport it.

---

## Task 1: Lexer

**Files:**
- Create: `src/renderer/js/trace-lex.js`
- Test: `test/trace-lex.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `tokenize(source: string, options?: {includeTrivia?: boolean}): {tokens: Token[], errors: Diagnostic[]}`
  - `KEYWORDS: string[]`, `PUNCTUATORS: string[]`
  - `Token = { type, value, raw, line, col, length }`
  - `type` is one of `ident`, `keyword`, `int`, `double`, `char`, `string`, `punct`, `comment`, `space`, `eof`
  - `Diagnostic = { code, terse, plain, locations: [{line, col, length}] }`
  - `value` is a number for `int`, `double` and `char`; the decoded contents for
    `string`; the raw text for `ident`, `keyword` and `punct`; `null` for trivia

`includeTrivia` is what lets the editor colour code with the very same lexer the
interpreter uses. Default `false` drops `comment` and `space`. Every token keeps
`raw`, the exact source text it came from, so the editor can lay coloured spans
over the original without a second scanner.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lex = require('../src/renderer/js/trace-lex.js');

function kinds(source) {
  return Lex.tokenize(source).tokens.map((t) => t.type);
}
function values(source) {
  return Lex.tokenize(source).tokens.map((t) => t.value);
}
function errorsOf(source) {
  return Lex.tokenize(source).errors;
}

test('an empty source yields just eof', () => {
  assert.deepStrictEqual(kinds(''), ['eof']);
});

test('keywords are distinguished from identifiers', () => {
  assert.deepStrictEqual(kinds('int x'), ['keyword', 'ident', 'eof']);
  assert.deepStrictEqual(kinds('integer'), ['ident', 'eof']);
});

test('every documented keyword is recognised', () => {
  for (const word of Lex.KEYWORDS) {
    assert.strictEqual(kinds(word)[0], 'keyword', word);
  }
});

test('decimal and hex integers', () => {
  assert.strictEqual(values('42')[0], 42);
  assert.strictEqual(values('0x1f')[0], 31);
  assert.strictEqual(values('0')[0], 0);
});

test('doubles are distinguished from integers', () => {
  assert.deepStrictEqual(kinds('3.5'), ['double', 'eof']);
  assert.deepStrictEqual(kinds('3'), ['int', 'eof']);
  assert.strictEqual(values('1e3')[0], 1000);
  assert.strictEqual(values('2.5e-1')[0], 0.25);
});

test('a trailing dot is part of the number, not a member access', () => {
  assert.deepStrictEqual(kinds('3.'), ['double', 'eof']);
});

test('string escapes decode', () => {
  const nl = String.fromCharCode(10);
  const tab = String.fromCharCode(9);
  assert.strictEqual(values('"a\\nb"')[0], 'a' + nl + 'b');
  assert.strictEqual(values('"a\\tb"')[0], 'a' + tab + 'b');
  assert.strictEqual(values('"a\\\\b"')[0], 'a\\b');
  assert.strictEqual(values('"a\\"b"')[0], 'a"b');
  assert.strictEqual(values('"a\\0b"')[0].charCodeAt(1), 0);
});

test('char literals decode to their numeric value', () => {
  assert.strictEqual(values("'A'")[0], 65);
  assert.strictEqual(values("'\\n'")[0], 10);
  assert.strictEqual(values("'\\0'")[0], 0);
});

test('both comment forms are trivia by default and available on request', () => {
  const nl = String.fromCharCode(10);
  assert.deepStrictEqual(kinds('int /* hi */ x'), ['keyword', 'ident', 'eof']);
  assert.deepStrictEqual(kinds('int x // hi' + nl), ['keyword', 'ident', 'eof']);
  const withTrivia = Lex.tokenize('int /* hi */ x', { includeTrivia: true });
  assert.ok(withTrivia.tokens.some((t) => t.type === 'comment'));
  assert.ok(withTrivia.tokens.some((t) => t.type === 'space'));
});

test('trivia tokens reconstruct the source exactly', () => {
  const nl = String.fromCharCode(10);
  const source = 'int main(void) {' + nl + '  return 0; // done' + nl + '}';
  const all = Lex.tokenize(source, { includeTrivia: true }).tokens
    .filter((t) => t.type !== 'eof');
  assert.strictEqual(all.map((t) => t.raw).join(''), source);
});

test('multi-character punctuators are matched longest-first', () => {
  assert.strictEqual(values('>>=')[0], '>>=');
  assert.strictEqual(values('->')[0], '->');
  assert.strictEqual(values('++')[0], '++');
  assert.strictEqual(values('<=')[0], '<=');
  assert.deepStrictEqual(values('+ +').slice(0, 2), ['+', '+']);
});

test('line and column are 1-based and track newlines', () => {
  const nl = String.fromCharCode(10);
  const tokens = Lex.tokenize('int' + nl + '  x').tokens;
  assert.deepStrictEqual([tokens[0].line, tokens[0].col], [1, 1]);
  assert.deepStrictEqual([tokens[1].line, tokens[1].col], [2, 3]);
});

test('an unterminated string is an error, not a throw', () => {
  const errs = errorsOf('"abc');
  assert.strictEqual(errs.length, 1);
  assert.strictEqual(errs[0].code, 'unterminated-string');
  assert.ok(errs[0].plain.length > 0);
});

test('an unterminated block comment is an error', () => {
  const errs = errorsOf('int /* abc');
  assert.strictEqual(errs[0].code, 'unterminated-comment');
});

test('an unknown escape is an error naming the escape', () => {
  const errs = errorsOf('"a\\qb"');
  assert.strictEqual(errs[0].code, 'unknown-escape');
  assert.ok(errs[0].terse.includes('q'));
});

test('a stray character is an error and lexing continues', () => {
  const result = Lex.tokenize('int @ x');
  assert.strictEqual(result.errors[0].code, 'stray-character');
  assert.deepStrictEqual(result.tokens.map((t) => t.type), ['keyword', 'ident', 'eof']);
});

test('errors never throw, whatever the input', () => {
  for (const bad of ['"', "'", '/*', '\\', '0x', "''", '@#$']) {
    assert.doesNotThrow(() => Lex.tokenize(bad), bad);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-lex.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-lex.js'`

- [ ] **Step 3: Write the implementation**

```js
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
      if (includeTrivia || (type !== 'comment' && type !== 'space')) tokens.push(token);
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
        index = save; // 'e' was not an exponent; leave it for the next token
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-lex.test.js`
Expected: PASS, 17 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-lex.js test/trace-lex.test.js
git commit -m "Add the Trace C lexer"
```

---

## The shared vocabulary

Tasks 2, 3 and 4 build the parser and between them fix two vocabularies that
every later task consumes. They are stated once, here, so no task has to guess.

### Types

Types are recursive rather than flat, because `int *[3]` and `int (*)[3]` differ
only in nesting and a flat representation cannot tell them apart.

```js
{ k: 'int' } | { k: 'char' } | { k: 'double' } | { k: 'void' }
{ k: 'ptr',    to: Type }
{ k: 'array',  of: Type, length: number|null }   // null only in a parameter
{ k: 'struct', tag: string }
{ k: 'enum',   tag: string }
```

### AST nodes

Every node carries `line` and `col`. Expressions:

| `kind` | Fields |
| --- | --- |
| `num` | `value`, `ctype` (`'int'` or `'double'`) |
| `charlit` | `value` (number) |
| `str` | `value` (string) |
| `ident` | `name` |
| `unary` | `op`, `operand` |
| `postfix` | `op`, `operand` |
| `binary` | `op`, `left`, `right` |
| `assign` | `op`, `target`, `value` |
| `cond` | `test`, `then`, `otherwise` |
| `call` | `callee`, `args` |
| `index` | `array`, `index` |
| `member` | `object`, `name`, `arrow` (boolean) |
| `cast` | `ctype`, `operand` |
| `sizeofType` | `ctype` |
| `sizeofExpr` | `operand` |

Statements:

| `kind` | Fields |
| --- | --- |
| `block` | `body` |
| `if` | `test`, `then`, `otherwise` (may be `null`) |
| `while` | `test`, `body` |
| `do` | `body`, `test` |
| `for` | `init`, `test`, `update`, `body` (each may be `null`) |
| `switch` | `disc`, `cases: [{ test, body }]` where `test` is `null` for `default` |
| `break`, `continue` | none |
| `return` | `value` (may be `null`) |
| `exprStmt` | `expr` |
| `declStmt` | `decls: [{ name, ctype, init }]` |
| `empty` | none |

Top level:

| `kind` | Fields |
| --- | --- |
| `func` | `name`, `returnType`, `params: [{name, ctype}]`, `body` |
| `globalDecl` | same shape as `declStmt` |
| `structDef` | `tag`, `members: [{name, ctype}]` |
| `enumDef` | `tag`, `values: [{name, value}]` |

---

## Task 2: Parser, expressions

**Files:**
- Create: `src/renderer/js/trace-parse.js`
- Test: `test/trace-parse-expr.test.js`

**Interfaces:**
- Consumes: `trace-lex.js` (`tokenize`)
- Produces:
  - `parseExpression(tokens: Token[], start: number): {node: Node, next: number, errors: Diagnostic[]}`
  - `PRECEDENCE: Record<string, number>`
  - Node shapes exactly as tabled above

Written first because expressions are the deepest recursion and the easiest
place to get precedence subtly wrong. Statements in Task 3 are comparatively
mechanical once this is right.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lex = require('../src/renderer/js/trace-lex.js');
const Parse = require('../src/renderer/js/trace-parse.js');

/** Parse an expression and return a compact s-expression, for readable tests. */
function sexpr(source) {
  const tokens = Lex.tokenize(source).tokens;
  const result = Parse.parseExpression(tokens, 0);
  assert.deepStrictEqual(result.errors, [], 'unexpected parse errors in ' + source);
  return render(result.node);
}

function render(node) {
  switch (node.kind) {
    case 'num': case 'charlit': return String(node.value);
    case 'str': return JSON.stringify(node.value);
    case 'ident': return node.name;
    case 'unary': return '(' + node.op + ' ' + render(node.operand) + ')';
    case 'postfix': return '(post' + node.op + ' ' + render(node.operand) + ')';
    case 'binary':
      return '(' + node.op + ' ' + render(node.left) + ' ' + render(node.right) + ')';
    case 'assign':
      return '(' + node.op + ' ' + render(node.target) + ' ' + render(node.value) + ')';
    case 'cond':
      return '(?: ' + render(node.test) + ' ' + render(node.then) + ' '
        + render(node.otherwise) + ')';
    case 'call':
      return '(call ' + render(node.callee)
        + node.args.map((a) => ' ' + render(a)).join('') + ')';
    case 'index': return '(idx ' + render(node.array) + ' ' + render(node.index) + ')';
    case 'member':
      return '(' + (node.arrow ? '-> ' : '. ') + render(node.object) + ' ' + node.name + ')';
    case 'cast': return '(cast ' + typeName(node.ctype) + ' ' + render(node.operand) + ')';
    case 'sizeofType': return '(sizeof-t ' + typeName(node.ctype) + ')';
    case 'sizeofExpr': return '(sizeof-e ' + render(node.operand) + ')';
    default: throw new Error('unknown node kind ' + node.kind);
  }
}

function typeName(t) {
  if (t.k === 'ptr') return typeName(t.to) + '*';
  if (t.k === 'array') return typeName(t.of) + '[' + (t.length === null ? '' : t.length) + ']';
  if (t.k === 'struct') return 'struct ' + t.tag;
  if (t.k === 'enum') return 'enum ' + t.tag;
  return t.k;
}

test('literals and identifiers', () => {
  assert.strictEqual(sexpr('42'), '42');
  assert.strictEqual(sexpr('3.5'), '3.5');
  assert.strictEqual(sexpr("'A'"), '65');
  assert.strictEqual(sexpr('"hi"'), '"hi"');
  assert.strictEqual(sexpr('count'), 'count');
});

test('multiplication binds tighter than addition', () => {
  assert.strictEqual(sexpr('1 + 2 * 3'), '(+ 1 (* 2 3))');
  assert.strictEqual(sexpr('1 * 2 + 3'), '(+ (* 1 2) 3)');
});

test('parentheses override precedence', () => {
  assert.strictEqual(sexpr('(1 + 2) * 3'), '(* (+ 1 2) 3)');
});

test('binary operators of equal precedence are left-associative', () => {
  assert.strictEqual(sexpr('1 - 2 - 3'), '(- (- 1 2) 3)');
  assert.strictEqual(sexpr('1 / 2 / 3'), '(/ (/ 1 2) 3)');
});

test('assignment is right-associative', () => {
  assert.strictEqual(sexpr('a = b = c'), '(= a (= b c))');
});

test('the full precedence ladder, in one expression', () => {
  assert.strictEqual(
    sexpr('a || b && c | d ^ e & f == g < h + i * j'),
    '(|| a (&& b (| c (^ d (& e (== f (< g (+ h (* i j)))))))))'
  );
});

test('comparison binds tighter than equality', () => {
  assert.strictEqual(sexpr('a < b == c'), '(== (< a b) c)');
});

test('unary operators', () => {
  assert.strictEqual(sexpr('-x'), '(- x)');
  assert.strictEqual(sexpr('!x'), '(! x)');
  assert.strictEqual(sexpr('*p'), '(* p)');
  assert.strictEqual(sexpr('&x'), '(& x)');
  assert.strictEqual(sexpr('++x'), '(++ x)');
});

test('unary minus binds tighter than multiplication', () => {
  assert.strictEqual(sexpr('-a * b'), '(* (- a) b)');
});

test('dereference and member access compose the way C says', () => {
  // *p.x is *(p.x), not (*p).x -- the classic trap
  assert.strictEqual(sexpr('*p.x'), '(* (. p x))');
  assert.strictEqual(sexpr('(*p).x'), '(. (* p) x)');
  assert.strictEqual(sexpr('p->x'), '(-> p x)');
});

test('postfix increment differs from prefix', () => {
  assert.strictEqual(sexpr('x++'), '(post++ x)');
  assert.strictEqual(sexpr('++x'), '(++ x)');
});

test('postfix chains left to right', () => {
  assert.strictEqual(sexpr('a[i].b'), '(. (idx a i) b)');
  assert.strictEqual(sexpr('f(1)(2)'), '(call (call f 1) 2)');
  assert.strictEqual(sexpr('a[i][j]'), '(idx (idx a i) j)');
});

test('calls with zero, one and several arguments', () => {
  assert.strictEqual(sexpr('f()'), '(call f)');
  assert.strictEqual(sexpr('f(1)'), '(call f 1)');
  assert.strictEqual(sexpr('f(1, 2, 3)'), '(call f 1 2 3)');
});

test('a comma inside a call is an argument separator, not the comma operator', () => {
  assert.strictEqual(sexpr('f(a, b)'), '(call f a b)');
});

test('the conditional operator is right-associative', () => {
  assert.strictEqual(sexpr('a ? b : c ? d : e'), '(?: a b (?: c d e))');
});

test('conditional binds looser than the operators inside it', () => {
  assert.strictEqual(sexpr('a + 1 ? b : c'), '(?: (+ a 1) b c)');
});

test('compound assignment', () => {
  assert.strictEqual(sexpr('x += 1'), '(+= x 1)');
  assert.strictEqual(sexpr('x *= y + 1'), '(*= x (+ y 1))');
});

test('sizeof distinguishes a type from an expression', () => {
  assert.strictEqual(sexpr('sizeof(int)'), '(sizeof-t int)');
  assert.strictEqual(sexpr('sizeof(x)'), '(sizeof-e x)');
  assert.strictEqual(sexpr('sizeof x'), '(sizeof-e x)');
  assert.strictEqual(sexpr('sizeof(int*)'), '(sizeof-t int*)');
});

test('casts parse and bind tighter than binary operators', () => {
  assert.strictEqual(sexpr('(int)x'), '(cast int x)');
  assert.strictEqual(sexpr('(double)a / b'), '(/ (cast double a) b)');
  assert.strictEqual(sexpr('(char*)p'), '(cast char* p)');
});

test('a parenthesised identifier is not mistaken for a cast', () => {
  assert.strictEqual(sexpr('(x) + 1'), '(+ x 1)');
});

test('a missing closing paren is reported, not thrown', () => {
  const tokens = Lex.tokenize('(1 + 2').tokens;
  const result = Parse.parseExpression(tokens, 0);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].code, 'expected-token');
  assert.ok(result.errors[0].terse.includes(')'));
});

test('a missing operand is reported with a beginner-facing message', () => {
  const tokens = Lex.tokenize('1 +').tokens;
  const result = Parse.parseExpression(tokens, 0);
  assert.strictEqual(result.errors[0].code, 'expected-expression');
  assert.ok(result.errors[0].plain.length > 0);
});

test('parsing never throws, whatever the token stream', () => {
  for (const bad of ['', '+', '((((', 'f(', 'a ?', '.', '[]', 'sizeof']) {
    const tokens = Lex.tokenize(bad).tokens;
    assert.doesNotThrow(() => Parse.parseExpression(tokens, 0), bad);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-parse-expr.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-parse.js'`

- [ ] **Step 3: Write the implementation**

Precedence climbing, one table, one loop. The two places C's grammar is
genuinely awkward are commented, because they are where a reimplementation
usually goes wrong.

```js
'use strict';

/**
 * C parser for Trace.
 *
 * Precedence climbing for binary operators, recursive descent for everything
 * else. Errors are collected rather than thrown: a beginner's program is
 * usually mid-edit, and a parser that gives up on the first problem is a
 * parser that mostly says nothing useful.
 *
 * On error the parser still returns a node -- an `error` placeholder when it
 * has nothing better -- so callers never have to null-check their way through
 * a tree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Higher binds tighter. Assignment and the conditional are handled outside
  // this table because they are right-associative.
  const PRECEDENCE = Object.freeze({
    '||': 1,
    '&&': 2,
    '|': 3,
    '^': 4,
    '&': 5,
    '==': 6, '!=': 6,
    '<': 7, '<=': 7, '>': 7, '>=': 7,
    '<<': 8, '>>': 8,
    '+': 9, '-': 9,
    '*': 10, '/': 10, '%': 10,
  });

  const ASSIGN_OPS = Object.freeze([
    '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=',
  ]);

  const TYPE_KEYWORDS = Object.freeze(['int', 'char', 'double', 'void', 'struct', 'enum']);

  function parseExpression(tokens, start) {
    const state = { tokens: tokens, index: start, errors: [] };
    const node = parseAssign(state);
    return { node: node, next: state.index, errors: state.errors };
  }

  // --- token helpers -------------------------------------------------------

  function peek(state, offset) {
    return state.tokens[state.index + (offset || 0)] || last(state.tokens);
  }
  function last(tokens) {
    return tokens[tokens.length - 1];
  }
  function at(state, type, value) {
    const token = peek(state);
    return token.type === type && (value === undefined || token.value === value);
  }
  function atPunct(state, value) {
    return at(state, 'punct', value);
  }
  function take(state) {
    const token = peek(state);
    if (token.type !== 'eof') state.index += 1;
    return token;
  }
  function expectPunct(state, value) {
    if (atPunct(state, value)) return take(state);
    error(state, 'expected-token',
      "expected '" + value + "'",
      "Trace expected a '" + value + "' here.");
    return null;
  }
  function error(state, code, terse, plain) {
    const token = peek(state);
    state.errors.push({
      code: code,
      terse: terse,
      plain: plain,
      locations: [{ line: token.line, col: token.col, length: token.length || 1 }],
    });
  }
  function locate(node, token) {
    node.line = token.line;
    node.col = token.col;
    return node;
  }

  // --- the ladder ----------------------------------------------------------

  function parseAssign(state) {
    const startToken = peek(state);
    const left = parseConditional(state);
    const token = peek(state);
    if (token.type === 'punct' && ASSIGN_OPS.includes(token.value)) {
      take(state);
      const right = parseAssign(state); // right-associative
      return locate({ kind: 'assign', op: token.value, target: left, value: right },
        startToken);
    }
    return left;
  }

  function parseConditional(state) {
    const startToken = peek(state);
    const test = parseBinary(state, 1);
    if (!atPunct(state, '?')) return test;
    take(state);
    const then = parseAssign(state);
    expectPunct(state, ':');
    const otherwise = parseConditional(state); // right-associative
    return locate({ kind: 'cond', test: test, then: then, otherwise: otherwise },
      startToken);
  }

  function parseBinary(state, minPrecedence) {
    let left = parseUnary(state);
    for (;;) {
      const token = peek(state);
      if (token.type !== 'punct') break;
      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;
      take(state);
      // Left-associative: the right side takes strictly tighter operators only.
      const right = parseBinary(state, precedence + 1);
      left = locate({ kind: 'binary', op: token.value, left: left, right: right }, token);
    }
    return left;
  }

  function parseUnary(state) {
    const token = peek(state);

    if (token.type === 'keyword' && token.value === 'sizeof') {
      take(state);
      // sizeof(int) is a type; sizeof(x) is an expression. Only a type keyword
      // after the paren distinguishes them, so look ahead exactly one token.
      if (atPunct(state, '(') && startsType(state, 1)) {
        take(state);
        const ctype = parseTypeName(state);
        expectPunct(state, ')');
        return locate({ kind: 'sizeofType', ctype: ctype }, token);
      }
      const operand = parseUnary(state);
      return locate({ kind: 'sizeofExpr', operand: operand }, token);
    }

    if (token.type === 'punct' && ['-', '+', '!', '~', '*', '&', '++', '--'].includes(token.value)) {
      take(state);
      const operand = parseUnary(state);
      return locate({ kind: 'unary', op: token.value, operand: operand }, token);
    }

    // A cast is '(' type ')' unary. Without the type check, '(x) + 1' would be
    // read as a cast of '+1' to type x.
    if (atPunct(state, '(') && startsType(state, 1)) {
      take(state);
      const ctype = parseTypeName(state);
      expectPunct(state, ')');
      const operand = parseUnary(state);
      return locate({ kind: 'cast', ctype: ctype, operand: operand }, token);
    }

    return parsePostfix(state);
  }

  function parsePostfix(state) {
    let node = parsePrimary(state);
    for (;;) {
      const token = peek(state);
      if (atPunct(state, '(')) {
        take(state);
        const args = [];
        if (!atPunct(state, ')')) {
          for (;;) {
            args.push(parseAssign(state)); // not parseExpression: comma separates args
            if (!atPunct(state, ',')) break;
            take(state);
          }
        }
        expectPunct(state, ')');
        node = locate({ kind: 'call', callee: node, args: args }, token);
        continue;
      }
      if (atPunct(state, '[')) {
        take(state);
        const index = parseAssign(state);
        expectPunct(state, ']');
        node = locate({ kind: 'index', array: node, index: index }, token);
        continue;
      }
      if (atPunct(state, '.') || atPunct(state, '->')) {
        const arrow = token.value === '->';
        take(state);
        const name = at(state, 'ident') ? take(state).value : null;
        if (name === null) {
          error(state, 'expected-member',
            'expected a member name',
            'After a dot or arrow, name the member you want.');
        }
        node = locate({ kind: 'member', object: node, name: name, arrow: arrow }, token);
        continue;
      }
      if (atPunct(state, '++') || atPunct(state, '--')) {
        take(state);
        node = locate({ kind: 'postfix', op: token.value, operand: node }, token);
        continue;
      }
      break;
    }
    return node;
  }

  function parsePrimary(state) {
    const token = peek(state);

    if (token.type === 'int' || token.type === 'double') {
      take(state);
      return locate({ kind: 'num', value: token.value,
        ctype: token.type === 'double' ? 'double' : 'int' }, token);
    }
    if (token.type === 'char') {
      take(state);
      return locate({ kind: 'charlit', value: token.value }, token);
    }
    if (token.type === 'string') {
      take(state);
      return locate({ kind: 'str', value: token.value }, token);
    }
    if (token.type === 'ident') {
      take(state);
      return locate({ kind: 'ident', name: token.value }, token);
    }
    if (atPunct(state, '(')) {
      take(state);
      const inner = parseAssign(state);
      expectPunct(state, ')');
      return inner;
    }

    error(state, 'expected-expression',
      'expected an expression',
      'Trace expected a value here, such as a number, a variable name, or a '
        + 'call to a function.');
    return locate({ kind: 'error' }, token);
  }

  // --- types ---------------------------------------------------------------

  /** Does a type start `offset` tokens ahead? Used to tell casts from parens. */
  function startsType(state, offset) {
    const token = peek(state, offset);
    return token.type === 'keyword'
      && (TYPE_KEYWORDS.includes(token.value) || token.value === 'const');
  }

  /** A type name in a cast or sizeof: base type plus any number of stars. */
  function parseTypeName(state) {
    let ctype = parseBaseType(state);
    while (atPunct(state, '*')) {
      take(state);
      ctype = { k: 'ptr', to: ctype };
    }
    return ctype;
  }

  function parseBaseType(state) {
    if (at(state, 'keyword', 'const')) take(state); // accepted and ignored
    const token = peek(state);
    if (token.type === 'keyword' && (token.value === 'struct' || token.value === 'enum')) {
      take(state);
      const tag = at(state, 'ident') ? take(state).value : null;
      if (tag === null) {
        error(state, 'expected-tag',
          'expected a name after ' + token.value,
          'Write the name of the ' + token.value + ' here.');
      }
      return { k: token.value, tag: tag };
    }
    if (token.type === 'keyword' && TYPE_KEYWORDS.includes(token.value)) {
      take(state);
      return { k: token.value };
    }
    error(state, 'expected-type',
      'expected a type name',
      'Trace expected a type here: int, char, double, void, struct or enum.');
    return { k: 'int' };
  }

  return {
    parseExpression, PRECEDENCE, ASSIGN_OPS, TYPE_KEYWORDS,
    // exported for Tasks 3 and 4, which continue in the same state object
    internals: {
      peek, at, atPunct, take, expectPunct, error, locate,
      parseAssign, parseTypeName, parseBaseType, startsType,
    },
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-parse-expr.test.js`
Expected: PASS, 23 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-parse.js test/trace-parse-expr.test.js
git commit -m "Add the Trace expression parser"
```

**Why `internals` is exported:** Tasks 3 and 4 add statement and top-level
parsing to this same file and need the same helpers and the same `state` object.
Exporting them under one clearly named key is preferable to duplicating them or
splitting the parser across files that would then need to share mutable state.

---

## Task 3: Parser, statements and declarations

**Files:**
- Modify: `src/renderer/js/trace-parse.js`
- Test: `test/trace-parse-stmt.test.js`

**Interfaces:**
- Consumes: Task 2's `internals`
- Produces:
  - `parseStatement(tokens, start): {node, next, errors}`
  - `parseDeclarator(state, baseType): {name, ctype}`
  - Statement node shapes exactly as tabled in the shared vocabulary

The one genuinely tricky piece is the declarator. In `int *a[5]`, the star and
the brackets both modify `a`, and they do not apply in written order: `a` is an
array of five pointers, not a pointer to an array. Step 3 handles that
explicitly and Step 1 tests it.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Lex = require('../src/renderer/js/trace-lex.js');
const Parse = require('../src/renderer/js/trace-parse.js');

function parseStmt(source) {
  const tokens = Lex.tokenize(source).tokens;
  const result = Parse.parseStatement(tokens, 0);
  assert.deepStrictEqual(result.errors, [], 'unexpected errors in ' + source);
  return result.node;
}

function typeName(t) {
  if (t.k === 'ptr') return typeName(t.to) + '*';
  if (t.k === 'array') return 'array(' + typeName(t.of) + ',' + t.length + ')';
  if (t.k === 'struct') return 'struct ' + t.tag;
  if (t.k === 'enum') return 'enum ' + t.tag;
  return t.k;
}

test('an expression statement wraps its expression', () => {
  const node = parseStmt('x = 1;');
  assert.strictEqual(node.kind, 'exprStmt');
  assert.strictEqual(node.expr.kind, 'assign');
});

test('a lone semicolon is an empty statement, not an error', () => {
  assert.strictEqual(parseStmt(';').kind, 'empty');
});

test('a block collects its statements', () => {
  const node = parseStmt('{ a; b; c; }');
  assert.strictEqual(node.kind, 'block');
  assert.strictEqual(node.body.length, 3);
});

test('an empty block is valid', () => {
  assert.deepStrictEqual(parseStmt('{}').body, []);
});

test('if without else leaves otherwise null', () => {
  const node = parseStmt('if (x) y;');
  assert.strictEqual(node.kind, 'if');
  assert.strictEqual(node.otherwise, null);
});

test('else binds to the nearest unmatched if', () => {
  const node = parseStmt('if (a) if (b) x; else y;');
  assert.strictEqual(node.otherwise, null, 'outer if must have no else');
  assert.strictEqual(node.then.kind, 'if');
  assert.ok(node.then.otherwise, 'inner if must own the else');
});

test('while and do-while', () => {
  assert.strictEqual(parseStmt('while (x) y;').kind, 'while');
  const doNode = parseStmt('do { x; } while (y);');
  assert.strictEqual(doNode.kind, 'do');
  assert.strictEqual(doNode.test.kind, 'ident');
});

test('for with all three clauses', () => {
  const node = parseStmt('for (i = 0; i < 10; i++) body;');
  assert.strictEqual(node.kind, 'for');
  assert.ok(node.init && node.test && node.update);
});

test('for with a declaration in the init clause', () => {
  const node = parseStmt('for (int i = 0; i < 10; i++) body;');
  assert.strictEqual(node.init.kind, 'declStmt');
  assert.strictEqual(node.init.decls[0].name, 'i');
});

test('for with every clause empty is an infinite loop, and parses', () => {
  const node = parseStmt('for (;;) body;');
  assert.strictEqual(node.init, null);
  assert.strictEqual(node.test, null);
  assert.strictEqual(node.update, null);
});

test('switch collects cases, with default carrying a null test', () => {
  const node = parseStmt('switch (x) { case 1: a; break; case 2: b; break; default: c; }');
  assert.strictEqual(node.kind, 'switch');
  assert.strictEqual(node.cases.length, 3);
  assert.strictEqual(node.cases[2].test, null);
});

test('a case with no body of its own falls through', () => {
  const node = parseStmt('switch (x) { case 1: case 2: a; }');
  assert.deepStrictEqual(node.cases[0].body, []);
  assert.strictEqual(node.cases[1].body.length, 1);
});

test('break, continue and return', () => {
  assert.strictEqual(parseStmt('break;').kind, 'break');
  assert.strictEqual(parseStmt('continue;').kind, 'continue');
  assert.strictEqual(parseStmt('return;').value, null);
  assert.strictEqual(parseStmt('return 1;').value.kind, 'num');
});

test('a simple declaration', () => {
  const node = parseStmt('int x;');
  assert.strictEqual(node.kind, 'declStmt');
  assert.strictEqual(node.decls[0].name, 'x');
  assert.strictEqual(typeName(node.decls[0].ctype), 'int');
  assert.strictEqual(node.decls[0].init, null);
});

test('a declaration with an initialiser', () => {
  const node = parseStmt('int x = 5;');
  assert.strictEqual(node.decls[0].init.value, 5);
});

test('several declarators share one base type', () => {
  const node = parseStmt('int a, b = 2, c;');
  assert.deepStrictEqual(node.decls.map((d) => d.name), ['a', 'b', 'c']);
  assert.strictEqual(node.decls[1].init.value, 2);
});

test('a pointer declarator binds to its own name, not the whole line', () => {
  const node = parseStmt('int *p, q;');
  assert.strictEqual(typeName(node.decls[0].ctype), 'int*');
  assert.strictEqual(typeName(node.decls[1].ctype), 'int', 'q is a plain int');
});

test('array declarators', () => {
  assert.strictEqual(typeName(parseStmt('int a[5];').decls[0].ctype), 'array(int,5)');
  assert.strictEqual(
    typeName(parseStmt('int a[2][3];').decls[0].ctype),
    'array(array(int,3),2)',
    'a is 2 arrays of 3, not 3 arrays of 2'
  );
});

test('brackets bind tighter than stars', () => {
  assert.strictEqual(
    typeName(parseStmt('int *a[5];').decls[0].ctype),
    'array(int*,5)',
    'a is an array of 5 pointers, not a pointer to an array'
  );
  assert.strictEqual(typeName(parseStmt('int **pp;').decls[0].ctype), 'int**');
});

test('an array initialiser list', () => {
  const node = parseStmt('int a[3] = {1, 2, 3};');
  assert.strictEqual(node.decls[0].init.kind, 'initList');
  assert.strictEqual(node.decls[0].init.items.length, 3);
});

test('an array sized by its initialiser has a resolved length', () => {
  const node = parseStmt('int a[] = {1, 2, 3};');
  assert.strictEqual(typeName(node.decls[0].ctype), 'array(int,3)');
});

test('a string initialiser sizes a char array including its terminator', () => {
  const node = parseStmt('char s[] = "hi";');
  assert.strictEqual(typeName(node.decls[0].ctype), 'array(char,3)');
});

test('a missing semicolon is reported once, at the right place', () => {
  const tokens = Lex.tokenize('int x = 1').tokens;
  const result = Parse.parseStatement(tokens, 0);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].code, 'expected-token');
  assert.ok(result.errors[0].terse.includes(';'));
});

test('statement parsing never throws', () => {
  for (const bad of ['if', 'while (', '{', 'int', 'for (;', 'switch (x) {', 'return']) {
    const tokens = Lex.tokenize(bad).tokens;
    assert.doesNotThrow(() => Parse.parseStatement(tokens, 0), bad);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-parse-stmt.test.js`
Expected: FAIL with `Parse.parseStatement is not a function`

- [ ] **Step 3: Write the implementation**

Add to `trace-parse.js`, inside the same factory, before the `return`.

```js
  // --- statements ----------------------------------------------------------

  function parseStatement(tokens, start) {
    const state = { tokens: tokens, index: start, errors: [] };
    const node = statement(state);
    return { node: node, next: state.index, errors: state.errors };
  }

  function statement(state) {
    const token = peek(state);

    if (atPunct(state, '{')) return block(state);
    if (atPunct(state, ';')) {
      take(state);
      return locate({ kind: 'empty' }, token);
    }
    if (token.type === 'keyword') {
      switch (token.value) {
        case 'if': return ifStatement(state);
        case 'while': return whileStatement(state);
        case 'do': return doStatement(state);
        case 'for': return forStatement(state);
        case 'switch': return switchStatement(state);
        case 'break': case 'continue': {
          take(state);
          expectPunct(state, ';');
          return locate({ kind: token.value }, token);
        }
        case 'return': {
          take(state);
          const value = atPunct(state, ';') ? null : parseAssign(state);
          expectPunct(state, ';');
          return locate({ kind: 'return', value: value }, token);
        }
        default: break;
      }
      if (startsType(state, 0)) return declaration(state);
    }

    const expr = parseAssign(state);
    expectPunct(state, ';');
    return locate({ kind: 'exprStmt', expr: expr }, token);
  }

  function block(state) {
    const token = peek(state);
    expectPunct(state, '{');
    const body = [];
    // eof guard: an unclosed brace must end the loop, not spin forever
    while (!atPunct(state, '}') && !at(state, 'eof')) body.push(statement(state));
    expectPunct(state, '}');
    return locate({ kind: 'block', body: body }, token);
  }

  function parenTest(state) {
    expectPunct(state, '(');
    const test = parseAssign(state);
    expectPunct(state, ')');
    return test;
  }

  function ifStatement(state) {
    const token = take(state);
    const test = parenTest(state);
    const then = statement(state);
    let otherwise = null;
    // A dangling else binds to the nearest if. Because `then` was parsed by a
    // recursive call that would itself have consumed an else, reaching here
    // with an else token means it belongs to *this* if.
    if (at(state, 'keyword', 'else')) {
      take(state);
      otherwise = statement(state);
    }
    return locate({ kind: 'if', test: test, then: then, otherwise: otherwise }, token);
  }

  function whileStatement(state) {
    const token = take(state);
    const test = parenTest(state);
    return locate({ kind: 'while', test: test, body: statement(state) }, token);
  }

  function doStatement(state) {
    const token = take(state);
    const body = statement(state);
    if (at(state, 'keyword', 'while')) take(state);
    else error(state, 'expected-token', "expected 'while'",
      'A do loop ends with while and its condition.');
    const test = parenTest(state);
    expectPunct(state, ';');
    return locate({ kind: 'do', body: body, test: test }, token);
  }

  function forStatement(state) {
    const token = take(state);
    expectPunct(state, '(');

    let init = null;
    if (!atPunct(state, ';')) {
      init = startsType(state, 0) ? declaration(state) : expressionStatement(state);
    } else {
      take(state);
    }

    const test = atPunct(state, ';') ? null : parseAssign(state);
    expectPunct(state, ';');
    const update = atPunct(state, ')') ? null : parseAssign(state);
    expectPunct(state, ')');

    return locate({ kind: 'for', init: init, test: test, update: update,
      body: statement(state) }, token);
  }

  function expressionStatement(state) {
    const token = peek(state);
    const expr = parseAssign(state);
    expectPunct(state, ';');
    return locate({ kind: 'exprStmt', expr: expr }, token);
  }

  function switchStatement(state) {
    const token = take(state);
    const disc = parenTest(state);
    expectPunct(state, '{');
    const cases = [];
    while (!atPunct(state, '}') && !at(state, 'eof')) {
      if (at(state, 'keyword', 'case') || at(state, 'keyword', 'default')) {
        const isDefault = peek(state).value === 'default';
        take(state);
        const test = isDefault ? null : parseAssign(state);
        expectPunct(state, ':');
        cases.push({ test: test, body: [] });
        continue;
      }
      if (cases.length === 0) {
        error(state, 'statement-before-case',
          'statement before the first case label',
          'Everything inside a switch belongs to a case. Start with a case '
            + 'label.');
        statement(state);
        continue;
      }
      cases[cases.length - 1].body.push(statement(state));
    }
    expectPunct(state, '}');
    return locate({ kind: 'switch', disc: disc, cases: cases }, token);
  }

  // --- declarations --------------------------------------------------------

  function declaration(state) {
    const token = peek(state);
    const base = parseBaseType(state);
    const decls = [];
    for (;;) {
      const declared = parseDeclarator(state, base);
      let init = null;
      if (atPunct(state, '=')) {
        take(state);
        init = atPunct(state, '{') ? initialiserList(state) : parseAssign(state);
      }
      decls.push({
        name: declared.name,
        ctype: resolveArrayLength(declared.ctype, init),
        init: init,
      });
      if (!atPunct(state, ',')) break;
      take(state);
    }
    expectPunct(state, ';');
    return locate({ kind: 'declStmt', decls: decls }, token);
  }

  /**
   * Stars are written before the name and brackets after it, but brackets bind
   * tighter. So `int *a[5]` is an array of five pointers, and the wrapping
   * order below is: base, then stars, then brackets from the inside out.
   */
  function parseDeclarator(state, base) {
    let stars = 0;
    while (atPunct(state, '*')) {
      take(state);
      stars += 1;
    }
    const name = at(state, 'ident') ? take(state).value : null;
    if (name === null) {
      error(state, 'expected-name',
        'expected a variable name',
        'Give this variable a name.');
    }
    const dims = [];
    while (atPunct(state, '[')) {
      take(state);
      if (atPunct(state, ']')) dims.push(null); // sized by the initialiser
      else {
        const size = peek(state);
        dims.push(size.type === 'int' ? take(state).value : null);
        if (size.type !== 'int') {
          error(state, 'non-constant-array-size',
            'array size must be a constant',
            'Trace needs to know an array size when the program is read, so it '
              + 'must be a plain number.');
        }
      }
      expectPunct(state, ']');
    }

    let ctype = base;
    for (let n = 0; n < stars; n += 1) ctype = { k: 'ptr', to: ctype };
    for (let n = dims.length - 1; n >= 0; n -= 1) {
      ctype = { k: 'array', of: ctype, length: dims[n] };
    }
    return { name: name, ctype: ctype };
  }

  function initialiserList(state) {
    const token = peek(state);
    expectPunct(state, '{');
    const items = [];
    if (!atPunct(state, '}')) {
      for (;;) {
        items.push(atPunct(state, '{') ? initialiserList(state) : parseAssign(state));
        if (!atPunct(state, ',')) break;
        take(state);
        if (atPunct(state, '}')) break; // a trailing comma is allowed
      }
    }
    expectPunct(state, '}');
    return locate({ kind: 'initList', items: items }, token);
  }

  /** `int a[] = {1,2,3}` and `char s[] = "hi"` learn their length here. */
  function resolveArrayLength(ctype, init) {
    if (!init || ctype.k !== 'array' || ctype.length !== null) return ctype;
    if (init.kind === 'initList') {
      return { k: 'array', of: ctype.of, length: init.items.length };
    }
    if (init.kind === 'str') {
      return { k: 'array', of: ctype.of, length: init.value.length + 1 };
    }
    return ctype;
  }
```

Add `parseStatement`, `parseDeclarator` and `declaration` to the module's
returned object, and add `declaration`, `statement` and `initialiserList` to
`internals` for Task 4.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-parse-stmt.test.js`
Expected: PASS, 24 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-parse.js test/trace-parse-stmt.test.js
git commit -m "Add Trace statement and declaration parsing"
```

---

## Task 4: Parser, top level and unsupported constructs

**Files:**
- Modify: `src/renderer/js/trace-parse.js`
- Test: `test/trace-parse-top.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 3
- Produces:
  - `parseProgram(source: string): {ast: {kind:'program', body: TopLevel[]}, errors: Diagnostic[]}`
  - `UNSUPPORTED: Record<string, {terse, plain}>`
  - Top-level node shapes as tabled in the shared vocabulary

`parseProgram` takes **source text**, not tokens: it runs the lexer itself and
merges lexer errors with parse errors into one ordered list, so every later
consumer has a single entry point and a single error list.

This task also owns the promise in the spec that leaving the subset produces a
clear message rather than a confusing parse error. That is a stated goal, so it
gets tests of its own rather than being left to emerge.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Parse = require('../src/renderer/js/trace-parse.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

function ok(source) {
  const result = Parse.parseProgram(source);
  assert.deepStrictEqual(result.errors, [], 'unexpected errors in: ' + source);
  return result.ast;
}

function firstError(source) {
  const result = Parse.parseProgram(source);
  assert.ok(result.errors.length > 0, 'expected an error for: ' + source);
  return result.errors[0];
}

test('a minimal program', () => {
  const ast = ok('int main(void) { return 0; }');
  assert.strictEqual(ast.kind, 'program');
  assert.strictEqual(ast.body[0].kind, 'func');
  assert.strictEqual(ast.body[0].name, 'main');
  assert.deepStrictEqual(ast.body[0].params, []);
});

test('parameters are named and typed', () => {
  const fn = ok('int add(int a, int b) { return a + b; }').body[0];
  assert.deepStrictEqual(fn.params.map((p) => p.name), ['a', 'b']);
  assert.strictEqual(fn.params[0].ctype.k, 'int');
});

test('a pointer parameter', () => {
  const fn = ok('void f(int *p) { }').body[0];
  assert.strictEqual(fn.params[0].ctype.k, 'ptr');
});

test('an array parameter decays to a pointer', () => {
  const fn = ok('void f(int a[]) { }').body[0];
  assert.strictEqual(fn.params[0].ctype.k, 'ptr',
    'an array parameter is a pointer, which is worth being explicit about');
});

test('several functions in one program', () => {
  const ast = ok(lines(
    'int helper(int x) { return x * 2; }',
    'int main(void) { return helper(21); }'
  ));
  assert.strictEqual(ast.body.length, 2);
});

test('global declarations sit alongside functions', () => {
  const ast = ok(lines('int counter = 0;', 'int main(void) { return counter; }'));
  assert.strictEqual(ast.body[0].kind, 'globalDecl');
  assert.strictEqual(ast.body[0].decls[0].name, 'counter');
});

test('a struct definition records its members in order', () => {
  const ast = ok(lines(
    'struct Point { int x; int y; };',
    'int main(void) { return 0; }'
  ));
  assert.strictEqual(ast.body[0].kind, 'structDef');
  assert.strictEqual(ast.body[0].tag, 'Point');
  assert.deepStrictEqual(ast.body[0].members.map((m) => m.name), ['x', 'y']);
});

test('a struct member may be a pointer or an array', () => {
  const def = ok('struct S { int *p; char name[8]; };').body[0];
  assert.strictEqual(def.members[0].ctype.k, 'ptr');
  assert.strictEqual(def.members[1].ctype.k, 'array');
});

test('enum values default to counting up from zero', () => {
  const def = ok('enum Colour { RED, GREEN, BLUE };').body[0];
  assert.deepStrictEqual(def.values, [
    { name: 'RED', value: 0 },
    { name: 'GREEN', value: 1 },
    { name: 'BLUE', value: 2 },
  ]);
});

test('an explicit enum value restarts the count', () => {
  const def = ok('enum E { A = 5, B, C = 10, D };').body[0];
  assert.deepStrictEqual(def.values.map((v) => v.value), [5, 6, 10, 11]);
});

test('include of a supported header is accepted and dropped', () => {
  const ast = ok(lines('#include <stdio.h>', 'int main(void) { return 0; }'));
  assert.strictEqual(ast.body.length, 1, 'the include leaves no node behind');
});

test('include of an unsupported header says which headers exist', () => {
  const err = firstError(lines('#include <math.h>', 'int main(void) { return 0; }'));
  assert.strictEqual(err.code, 'unsupported-header');
  assert.ok(err.plain.includes('stdio.h'));
});

test('an object-like define substitutes its value', () => {
  const ast = ok(lines('#define MAX 100', 'int main(void) { return MAX; }'));
  const ret = ast.body[0].body.body[0];
  assert.strictEqual(ret.value.kind, 'num');
  assert.strictEqual(ret.value.value, 100);
});

test('a function-like define is refused clearly', () => {
  const err = firstError('#define SQ(x) ((x)*(x))');
  assert.strictEqual(err.code, 'unsupported-construct');
  assert.ok(err.plain.toLowerCase().includes('object-like'));
});

test('each unsupported construct names itself and lists what is supported', () => {
  const cases = [
    ['int main(void) { goto end; end: return 0; }', 'goto'],
    ['union U { int a; double b; };', 'union'],
    ['int main(void) { unsigned int x = 1; return 0; }', 'unsigned'],
    ['int main(void) { float f = 1.0; return 0; }', 'float'],
    ['int main(void) { long n = 1; return 0; }', 'long'],
  ];
  for (const [source, construct] of cases) {
    const err = firstError(source);
    assert.strictEqual(err.code, 'unsupported-construct', source);
    assert.ok(err.terse.includes(construct), 'terse should name ' + construct);
    assert.ok(err.plain.length > 20, 'plain should explain, for ' + construct);
  }
});

test('an unsupported construct is reported once, not once per token', () => {
  const result = Parse.parseProgram('int main(void) { goto a; goto b; return 0; }');
  const gotos = result.errors.filter((e) => e.terse.includes('goto'));
  assert.strictEqual(gotos.length, 2, 'one per occurrence, not one per token');
});

test('lexer errors and parse errors arrive in one list, in source order', () => {
  const result = Parse.parseProgram(lines('int main(void) {', '  char c = "unterminated;', '}'));
  assert.ok(result.errors.length > 0);
  for (let i = 1; i < result.errors.length; i += 1) {
    const previous = result.errors[i - 1].locations[0];
    const current = result.errors[i].locations[0];
    assert.ok(current.line >= previous.line, 'errors must be ordered by position');
  }
});

test('a program with no main is a diagnostic, not a silent no-op', () => {
  const err = firstError('int helper(void) { return 1; }');
  assert.strictEqual(err.code, 'no-main');
  assert.ok(err.plain.includes('main'));
});

test('parseProgram never throws, whatever the source', () => {
  const bad = ['', '{', 'int', '#', '#include', 'struct', 'int f(', '}}}}', '"'];
  for (const source of bad) {
    assert.doesNotThrow(() => Parse.parseProgram(source), JSON.stringify(source));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-parse-top.test.js`
Expected: FAIL with `Parse.parseProgram is not a function`

- [ ] **Step 3: Write the implementation**

```js
  // --- unsupported constructs ---------------------------------------------

  /**
   * The spec promises that leaving the subset produces a clear message rather
   * than a baffling parse error, so the refusals are a table rather than
   * something each parse site invents.
   */
  const SUPPORTED_HEADERS = Object.freeze(['stdio.h', 'stdlib.h', 'string.h']);

  const UNSUPPORTED = Object.freeze({
    goto: {
      terse: "'goto' is not supported",
      plain: 'Trace supports if, while, for, do, switch, break, continue and '
        + 'return. Those can express any loop or branch you need here.',
    },
    union: {
      terse: "'union' is not supported",
      plain: 'Trace supports struct and enum. A struct gives each member its '
        + 'own storage, which is what you want while learning.',
    },
    unsigned: {
      terse: "'unsigned' is not supported",
      plain: 'Trace has one integer type, int, which is 4 bytes and signed.',
    },
    signed: {
      terse: "'signed' is not supported",
      plain: 'Trace has one integer type, int, which is already signed.',
    },
    long: {
      terse: "'long' is not supported",
      plain: 'Trace has one integer type, int, which is 4 bytes.',
    },
    short: {
      terse: "'short' is not supported",
      plain: 'Trace has one integer type, int, which is 4 bytes.',
    },
    float: {
      terse: "'float' is not supported",
      plain: 'Trace has one floating-point type, double, which is 8 bytes.',
    },
    static: {
      terse: "'static' is not supported",
      plain: 'Every variable in Trace is either local to a function or global.',
    },
    extern: {
      terse: "'extern' is not supported",
      plain: 'A Trace program is a single file, so there is nothing external '
        + 'to declare.',
    },
    typedef: {
      terse: "'typedef' is not supported",
      plain: 'Write the type out in full. Trace supports int, char, double, '
        + 'void, pointers, arrays, struct and enum.',
    },
  });

  // These are lexed as identifiers, not keywords, so the top-level loop checks
  // for them by name before trying to parse a declaration.
  const UNSUPPORTED_WORDS = Object.freeze(Object.keys(UNSUPPORTED));

  // --- top level -----------------------------------------------------------

  function parseProgram(source) {
    const lexed = TraceLexRef().tokenize(source);
    const macros = Object.create(null);
    const tokens = preprocess(lexed.tokens, macros, lexed.errors);

    const state = { tokens: tokens, index: 0, errors: [] };
    const body = [];
    let guard = 0;

    while (!at(state, 'eof')) {
      const before = state.index;
      const node = topLevel(state);
      if (node) body.push(node);
      // A parser that fails to consume anything would spin. Force progress.
      if (state.index === before) take(state);
      guard += 1;
      if (guard > 100000) break;
    }

    if (!body.some((n) => n.kind === 'func' && n.name === 'main')) {
      state.errors.push({
        code: 'no-main',
        terse: "no 'main' function",
        plain: 'Every C program starts at a function called main. Add '
          + 'int main(void) { ... } to your program.',
        locations: [{ line: 1, col: 1, length: 1 }],
      });
    }

    const errors = lexed.errors.concat(state.errors).sort(byPosition);
    return { ast: { kind: 'program', body: body }, errors: errors };
  }

  function byPosition(a, b) {
    const left = a.locations[0];
    const right = b.locations[0];
    return left.line - right.line || left.col - right.col;
  }

  /**
   * A deliberately tiny preprocessor: object-like #define substitution and
   * #include validation. Anything else is refused by name.
   */
  function preprocess(tokens, macros, errors) {
    const out = [];
    let index = 0;

    while (index < tokens.length) {
      const token = tokens[index];

      if (token.type === 'punct' && token.value === '#') {
        const directive = tokens[index + 1];
        const name = directive && directive.value;

        if (name === 'include') {
          const consumed = readToEndOfLine(tokens, index);
          const header = consumed.tokens
            .map((t) => t.raw).join('').replace(/[<>"]/g, '').replace('include', '')
            .replace('#', '').trim();
          if (!SUPPORTED_HEADERS.includes(header)) {
            errors.push({
              code: 'unsupported-header',
              terse: "cannot include '" + header + "'",
              plain: 'Trace has its library built in. The headers it recognises '
                + 'are ' + SUPPORTED_HEADERS.join(', ') + '.',
              locations: [{ line: token.line, col: token.col, length: 1 }],
            });
          }
          index = consumed.next;
          continue;
        }

        if (name === 'define') {
          const consumed = readToEndOfLine(tokens, index);
          const parts = consumed.tokens.slice(2); // past '#' and 'define'
          const macroName = parts[0];
          const isFunctionLike = parts[1] && parts[1].type === 'punct'
            && parts[1].value === '(' && parts[1].col === macroName.col + macroName.length;
          if (!macroName || macroName.type !== 'ident' || isFunctionLike) {
            errors.push({
              code: 'unsupported-construct',
              terse: 'only object-like #define is supported',
              plain: 'Trace supports object-like defines such as #define MAX 100. '
                + 'A define that takes arguments is not supported; use a '
                + 'function instead.',
              locations: [{ line: token.line, col: token.col, length: 1 }],
            });
          } else {
            macros[macroName.value] = parts.slice(1);
          }
          index = consumed.next;
          continue;
        }

        errors.push({
          code: 'unsupported-construct',
          terse: 'unsupported directive #' + (name || ''),
          plain: 'Trace supports #include of its own headers and object-like '
            + '#define. Nothing else.',
          locations: [{ line: token.line, col: token.col, length: 1 }],
        });
        index = readToEndOfLine(tokens, index).next;
        continue;
      }

      if (token.type === 'ident' && macros[token.value]) {
        for (const replacement of macros[token.value]) {
          out.push(Object.assign({}, replacement, { line: token.line, col: token.col }));
        }
        index += 1;
        continue;
      }

      out.push(token);
      index += 1;
    }
    return out;
  }

  function readToEndOfLine(tokens, start) {
    const line = tokens[start].line;
    let index = start;
    const consumed = [];
    while (index < tokens.length && tokens[index].line === line
      && tokens[index].type !== 'eof') {
      consumed.push(tokens[index]);
      index += 1;
    }
    return { tokens: consumed, next: index };
  }

  function topLevel(state) {
    const token = peek(state);

    if (token.type === 'ident' && UNSUPPORTED_WORDS.includes(token.value)) {
      refuse(state, token);
      return null;
    }

    if (at(state, 'keyword', 'struct') && peek(state, 2).value === '{') {
      return structDefinition(state);
    }
    if (at(state, 'keyword', 'enum') && peek(state, 2).value === '{') {
      return enumDefinition(state);
    }
    if (!startsType(state, 0)) {
      error(state, 'expected-declaration',
        'expected a declaration',
        'At the top level of a C program, write a function, a global variable, '
          + 'a struct or an enum.');
      return null;
    }

    const base = parseBaseType(state);
    const declared = parseDeclarator(state, base);

    if (atPunct(state, '(')) return functionDefinition(state, declared, token);

    // Not a function: rewind into the shared declaration path by finishing the
    // remaining declarators here, so `int a = 1, b;` works at file scope too.
    const decls = [];
    let current = declared;
    for (;;) {
      let init = null;
      if (atPunct(state, '=')) {
        take(state);
        init = atPunct(state, '{') ? initialiserList(state) : parseAssign(state);
      }
      decls.push({ name: current.name, ctype: resolveArrayLength(current.ctype, init),
        init: init });
      if (!atPunct(state, ',')) break;
      take(state);
      current = parseDeclarator(state, base);
    }
    expectPunct(state, ';');
    return locate({ kind: 'globalDecl', decls: decls }, token);
  }

  function refuse(state, token) {
    const entry = UNSUPPORTED[token.value];
    state.errors.push({
      code: 'unsupported-construct',
      terse: entry.terse,
      plain: entry.plain,
      locations: [{ line: token.line, col: token.col, length: token.length }],
    });
    take(state);
  }

  function functionDefinition(state, declared, token) {
    expectPunct(state, '(');
    const params = [];
    if (!atPunct(state, ')')) {
      if (at(state, 'keyword', 'void') && peek(state, 1).value === ')') {
        take(state);
      } else {
        for (;;) {
          const base = parseBaseType(state);
          const param = parseDeclarator(state, base);
          // An array parameter is a pointer. Making that explicit here means
          // the interpreter never has to special-case it.
          const ctype = param.ctype.k === 'array'
            ? { k: 'ptr', to: param.ctype.of }
            : param.ctype;
          params.push({ name: param.name, ctype: ctype });
          if (!atPunct(state, ',')) break;
          take(state);
        }
      }
    }
    expectPunct(state, ')');
    return locate({
      kind: 'func',
      name: declared.name,
      returnType: declared.ctype,
      params: params,
      body: block(state),
    }, token);
  }

  function structDefinition(state) {
    const token = take(state); // 'struct'
    const tag = at(state, 'ident') ? take(state).value : null;
    expectPunct(state, '{');
    const members = [];
    while (!atPunct(state, '}') && !at(state, 'eof')) {
      const base = parseBaseType(state);
      for (;;) {
        const member = parseDeclarator(state, base);
        members.push({ name: member.name, ctype: member.ctype });
        if (!atPunct(state, ',')) break;
        take(state);
      }
      expectPunct(state, ';');
    }
    expectPunct(state, '}');
    expectPunct(state, ';');
    return locate({ kind: 'structDef', tag: tag, members: members }, token);
  }

  function enumDefinition(state) {
    const token = take(state); // 'enum'
    const tag = at(state, 'ident') ? take(state).value : null;
    expectPunct(state, '{');
    const values = [];
    let next = 0;
    while (!atPunct(state, '}') && !at(state, 'eof')) {
      const name = at(state, 'ident') ? take(state).value : null;
      if (atPunct(state, '=')) {
        take(state);
        const literal = peek(state);
        if (literal.type === 'int') {
          next = take(state).value;
        } else {
          error(state, 'non-constant-enum',
            'enum value must be a plain number',
            'Give this enum constant a whole number, like RED = 1.');
        }
      }
      values.push({ name: name, value: next });
      next += 1;
      if (!atPunct(state, ',')) break;
      take(state);
    }
    expectPunct(state, '}');
    expectPunct(state, ';');
    return locate({ kind: 'enumDef', tag: tag, values: values }, token);
  }
```

`TraceLexRef()` resolves the lexer in both environments, since this module is
loaded by `require` in Node and as a global in the renderer. Add near the top of
the factory:

```js
  function TraceLexRef() {
    if (typeof module === 'object' && module.exports) {
      return require('./trace-lex.js');
    }
    return (typeof self !== 'undefined' ? self : this).TraceLex;
  }
```

Add `parseProgram`, `UNSUPPORTED` and `SUPPORTED_HEADERS` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-parse-top.test.js`
Expected: PASS, 19 tests

- [ ] **Step 5: Run the whole suite, to confirm nothing earlier regressed**

Run: `npm test`
Expected: PASS. The 81 pre-existing tests plus Tasks 1 to 4.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/trace-parse.js test/trace-parse-top.test.js
git commit -m "Add Trace top-level parsing and unsupported-construct diagnostics"
```

---

## Task 5: The machine, memory and layout

**Files:**
- Create: `src/renderer/js/trace-machine.js`
- Test: `test/trace-machine-memory.test.js`

**Interfaces:**
- Consumes: type shapes from the shared vocabulary
- Produces:
  - `SIZES`, `ALIGNS`, `LAYOUT` (address-space constants)
  - `sizeOf(ctype, structs): number`
  - `alignOf(ctype, structs): number`
  - `structLayout(members, structs): {size, align, fields: [{name, ctype, offset}]}`
  - `createMachine(options?): Machine`
  - `Machine.readValue(address, ctype): number`
  - `Machine.writeValue(address, ctype, value): void`
  - `Machine.readBytes(address, count): Uint8Array`
  - `Machine.writeBytes(address, bytes): void`
  - `structs` is `Record<tag, {size, align, fields}>`, built once per program

Padding is real, not smoothed away. A beginner who prints `sizeof(struct S)` and
gets 16 for three members totalling 13 bytes has met alignment, and the diagram
can show them the holes.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };
const CHAR = { k: 'char' };
const DOUBLE = { k: 'double' };
const PTR = { k: 'ptr', to: INT };

test('scalar sizes match the documented model', () => {
  assert.strictEqual(M.sizeOf(INT, {}), 4);
  assert.strictEqual(M.sizeOf(CHAR, {}), 1);
  assert.strictEqual(M.sizeOf(DOUBLE, {}), 8);
  assert.strictEqual(M.sizeOf(PTR, {}), 8);
});

test('an array is its length times its element size', () => {
  assert.strictEqual(M.sizeOf({ k: 'array', of: INT, length: 5 }, {}), 20);
  assert.strictEqual(M.sizeOf({ k: 'array', of: CHAR, length: 3 }, {}), 3);
});

test('a two-dimensional array multiplies through', () => {
  const inner = { k: 'array', of: INT, length: 3 };
  assert.strictEqual(M.sizeOf({ k: 'array', of: inner, length: 2 }, {}), 24);
});

test('struct members are laid out with natural alignment and padding', () => {
  // char c; int i; char d;  ->  c at 0, 3 bytes padding, i at 4, d at 8,
  // then 3 bytes tail padding so the struct itself aligns to 4.
  const layout = M.structLayout([
    { name: 'c', ctype: CHAR },
    { name: 'i', ctype: INT },
    { name: 'd', ctype: CHAR },
  ], {});
  assert.deepStrictEqual(layout.fields.map((f) => f.offset), [0, 4, 8]);
  assert.strictEqual(layout.align, 4);
  assert.strictEqual(layout.size, 12);
});

test('a double forces eight-byte alignment', () => {
  const layout = M.structLayout([
    { name: 'c', ctype: CHAR },
    { name: 'd', ctype: DOUBLE },
  ], {});
  assert.deepStrictEqual(layout.fields.map((f) => f.offset), [0, 8]);
  assert.strictEqual(layout.size, 16);
});

test('reordering members changes the size, which is the lesson', () => {
  const bad = M.structLayout([
    { name: 'a', ctype: CHAR }, { name: 'b', ctype: INT }, { name: 'c', ctype: CHAR },
  ], {});
  const good = M.structLayout([
    { name: 'b', ctype: INT }, { name: 'a', ctype: CHAR }, { name: 'c', ctype: CHAR },
  ], {});
  assert.strictEqual(bad.size, 12);
  assert.strictEqual(good.size, 8);
});

test('a nested struct uses the inner layout', () => {
  const structs = { Inner: M.structLayout([{ name: 'x', ctype: INT }], {}) };
  const outer = M.structLayout([
    { name: 'i', ctype: { k: 'struct', tag: 'Inner' } },
    { name: 'j', ctype: INT },
  ], structs);
  assert.strictEqual(outer.size, 8);
});

test('integers round-trip little-endian', () => {
  const machine = M.createMachine();
  const address = M.LAYOUT.HEAP_BASE;
  machine.writeValue(address, INT, 0x01020304);
  assert.deepStrictEqual(
    Array.from(machine.readBytes(address, 4)),
    [0x04, 0x03, 0x02, 0x01]
  );
  assert.strictEqual(machine.readValue(address, INT), 0x01020304);
});

test('negative integers round-trip', () => {
  const machine = M.createMachine();
  machine.writeValue(M.LAYOUT.HEAP_BASE, INT, -1);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, INT), -1);
  machine.writeValue(M.LAYOUT.HEAP_BASE, INT, -2147483648);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, INT), -2147483648);
});

test('char is signed and wraps at one byte', () => {
  const machine = M.createMachine();
  machine.writeValue(M.LAYOUT.HEAP_BASE, CHAR, 65);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, CHAR), 65);
  machine.writeValue(M.LAYOUT.HEAP_BASE, CHAR, -1);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, CHAR), -1);
});

test('doubles round-trip exactly', () => {
  const machine = M.createMachine();
  for (const value of [0, 1, -1, 0.5, 3.14159265358979, 1e300, -1e-300]) {
    machine.writeValue(M.LAYOUT.HEAP_BASE, DOUBLE, value);
    assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, DOUBLE), value);
  }
});

test('pointers round-trip as addresses', () => {
  const machine = M.createMachine();
  machine.writeValue(M.LAYOUT.HEAP_BASE, PTR, 0x4000);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, PTR), 0x4000);
  machine.writeValue(M.LAYOUT.HEAP_BASE, PTR, 0);
  assert.strictEqual(machine.readValue(M.LAYOUT.HEAP_BASE, PTR), 0);
});

test('the address space is the documented size and shape', () => {
  assert.strictEqual(M.LAYOUT.CAPACITY, 0x100000);
  assert.ok(M.LAYOUT.GLOBAL_BASE > 0, 'address zero must not be usable, so null is detectable');
  assert.ok(M.LAYOUT.HEAP_BASE > M.LAYOUT.GLOBAL_BASE);
  assert.strictEqual(M.LAYOUT.STACK_TOP, M.LAYOUT.CAPACITY);
});

test('an access outside the address space is refused, not silently wrapped', () => {
  const machine = M.createMachine();
  assert.throws(() => machine.readBytes(M.LAYOUT.CAPACITY + 8, 4), /out of range/i);
  assert.throws(() => machine.readBytes(-4, 4), /out of range/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-machine-memory.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-machine.js'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * The Trace machine: real bytes, real addresses, real padding.
 *
 * This file is built across four tasks. This one is the bottom layer -- sizes,
 * alignment, and reading and writing typed values into a flat byte array.
 * Nothing here knows what an object is; that is the shadow map, added next.
 *
 * The values are the real ones, not simplified: int is 4 bytes and signed,
 * double is an IEEE 754 double, structs are padded to natural alignment. A
 * learner who prints sizeof and finds a surprise has learned something true.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceMachine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZES = Object.freeze({ int: 4, char: 1, double: 8, ptr: 8, enum: 4 });
  const ALIGNS = Object.freeze({ int: 4, char: 1, double: 8, ptr: 8, enum: 4 });

  /**
   * Address zero and the page above it are deliberately unusable, so a null
   * dereference is a distinguishable event rather than a read of whatever
   * happens to live at the bottom of memory.
   */
  const LAYOUT = Object.freeze({
    CAPACITY: 0x100000,     // 1 MiB
    NULL_GUARD: 0x0000,
    GLOBAL_BASE: 0x1000,
    HEAP_BASE: 0x10000,
    STACK_TOP: 0x100000,
  });

  function sizeOf(ctype, structs) {
    switch (ctype.k) {
      case 'int': case 'char': case 'double': return SIZES[ctype.k];
      case 'ptr': return SIZES.ptr;
      case 'enum': return SIZES.enum;
      case 'void': return 1; // sizeof(void) is 1 by convention here, never 0
      case 'array': return sizeOf(ctype.of, structs) * (ctype.length || 0);
      case 'struct': {
        const layout = structs[ctype.tag];
        return layout ? layout.size : 0;
      }
      default: return 0;
    }
  }

  function alignOf(ctype, structs) {
    switch (ctype.k) {
      case 'int': case 'char': case 'double': return ALIGNS[ctype.k];
      case 'ptr': return ALIGNS.ptr;
      case 'enum': return ALIGNS.enum;
      case 'void': return 1;
      case 'array': return alignOf(ctype.of, structs);
      case 'struct': {
        const layout = structs[ctype.tag];
        return layout ? layout.align : 1;
      }
      default: return 1;
    }
  }

  function roundUp(value, align) {
    if (align <= 1) return value;
    const remainder = value % align;
    return remainder === 0 ? value : value + (align - remainder);
  }

  /**
   * Natural alignment with tail padding, exactly as a real C compiler does it.
   * The padding is retained in the returned fields' offsets, so the diagram can
   * show the holes rather than pretending members are adjacent.
   */
  function structLayout(members, structs) {
    let offset = 0;
    let align = 1;
    const fields = [];

    for (const member of members) {
      const memberAlign = alignOf(member.ctype, structs);
      const memberSize = sizeOf(member.ctype, structs);
      offset = roundUp(offset, memberAlign);
      fields.push({ name: member.name, ctype: member.ctype, offset: offset });
      offset += memberSize;
      if (memberAlign > align) align = memberAlign;
    }

    return { size: roundUp(offset, align), align: align, fields: fields };
  }

  function createMachine(options) {
    const capacity = (options && options.capacity) || LAYOUT.CAPACITY;
    const bytes = new Uint8Array(capacity);
    const view = new DataView(bytes.buffer);

    function checkRange(address, count) {
      if (!Number.isInteger(address) || address < 0 || address + count > capacity) {
        throw new RangeError(
          'address out of range: ' + address + ' for ' + count + ' bytes');
      }
    }

    return {
      capacity: capacity,
      bytes: bytes,

      readBytes: function (address, count) {
        checkRange(address, count);
        return bytes.slice(address, address + count);
      },

      writeBytes: function (address, source) {
        checkRange(address, source.length);
        bytes.set(source, address);
      },

      /** Little-endian, matching every machine a learner is likely to meet. */
      readValue: function (address, ctype) {
        switch (ctype.k) {
          case 'char': checkRange(address, 1); return view.getInt8(address);
          case 'int': case 'enum': checkRange(address, 4); return view.getInt32(address, true);
          case 'double': checkRange(address, 8); return view.getFloat64(address, true);
          case 'ptr': {
            checkRange(address, 8);
            // Addresses fit comfortably in 32 bits at this capacity, so the
            // high word is always zero and Number stays exact.
            return view.getUint32(address, true);
          }
          case 'array': case 'struct':
            // An array or struct in value position is its own address.
            return address;
          default:
            throw new TypeError('cannot read a value of type ' + ctype.k);
        }
      },

      writeValue: function (address, ctype, value) {
        switch (ctype.k) {
          case 'char': checkRange(address, 1); view.setInt8(address, value | 0); return;
          case 'int': case 'enum':
            checkRange(address, 4); view.setInt32(address, value | 0, true); return;
          case 'double':
            checkRange(address, 8); view.setFloat64(address, Number(value), true); return;
          case 'ptr':
            checkRange(address, 8);
            view.setUint32(address, value >>> 0, true);
            view.setUint32(address + 4, 0, true);
            return;
          default:
            throw new TypeError('cannot write a value of type ' + ctype.k);
        }
      },
    };
  }

  return { SIZES, ALIGNS, LAYOUT, sizeOf, alignOf, structLayout, roundUp, createMachine };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-machine-memory.test.js`
Expected: PASS, 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-machine.js test/trace-machine-memory.test.js
git commit -m "Add the Trace memory model, sizes and struct layout"
```

---

## Task 6: The shadow map and object lifecycle

**Files:**
- Modify: `src/renderer/js/trace-machine.js`
- Test: `test/trace-machine-shadow.test.js`

**Interfaces:**
- Consumes: Task 5
- Produces, on the object returned by `createMachine`:
  - `declareGlobal({name, ctype}): Obj`
  - `pushFrame(functionName): number` (returns the frame id)
  - `popFrame(): void`
  - `declareLocal({name, ctype}): Obj`
  - `allocate(size): number` (returns an address, or 0 when out of memory)
  - `release(address): {ok: boolean, reason?: string}`
  - `objectAt(address): Obj|null` (live objects only)
  - `recordAt(address): Obj|null` (live *or* dead, for diagnosis)
  - `markInitialised(address, count)`, `isInitialised(address, count): boolean`
  - `liveObjects(): Obj[]`, `frames(): Frame[]`
  - `Obj = {id, name, address, size, ctype, kind, frameId, alive, freed, initialised: Uint8Array}`
  - `Frame = {id, functionName, base, objects: Obj[]}`

The shadow map is the load-bearing structure of the whole feature. It does two
jobs: it is what the diagram draws, and it is what makes undefined behaviour
detectable. Task 8 adds the checks; this task adds the bookkeeping they read.

**A dead object is retained, not deleted.** Freeing a heap block or popping a
frame marks its record dead and keeps it. That retention is the only reason
use-after-free and dangling-stack-pointer can be told apart from a wild address,
and it is what lets a diagnostic say *what used to be here* instead of merely
"invalid".

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };
const CHAR = { k: 'char' };

test('a global gets an address in the globals region', () => {
  const m = M.createMachine();
  const obj = m.declareGlobal({ name: 'counter', ctype: INT });
  assert.ok(obj.address >= M.LAYOUT.GLOBAL_BASE);
  assert.ok(obj.address < M.LAYOUT.HEAP_BASE);
  assert.strictEqual(obj.kind, 'global');
  assert.strictEqual(obj.size, 4);
});

test('globals do not overlap', () => {
  const m = M.createMachine();
  const a = m.declareGlobal({ name: 'a', ctype: INT });
  const b = m.declareGlobal({ name: 'b', ctype: INT });
  assert.ok(b.address >= a.address + a.size);
});

test('a local lives in the stack region and below the previous frame', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  assert.ok(obj.address < M.LAYOUT.STACK_TOP);
  assert.ok(obj.address > M.LAYOUT.HEAP_BASE);
  assert.strictEqual(obj.kind, 'local');
});

test('the stack grows downward across frames', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const outer = m.declareLocal({ name: 'x', ctype: INT });
  m.pushFrame('inner');
  const inner = m.declareLocal({ name: 'y', ctype: INT });
  assert.ok(inner.address < outer.address, 'a deeper frame sits lower in memory');
});

test('objectAt finds the object containing an address, not just its first byte', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const arr = m.declareLocal({ name: 'a', ctype: { k: 'array', of: INT, length: 4 } });
  assert.strictEqual(m.objectAt(arr.address).id, arr.id);
  assert.strictEqual(m.objectAt(arr.address + 7).id, arr.id, 'mid-object address');
  assert.strictEqual(m.objectAt(arr.address + arr.size), null, 'one past the end');
});

test('popping a frame kills its objects but keeps their records', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  m.pushFrame('inner');
  const local = m.declareLocal({ name: 'y', ctype: INT });
  m.popFrame();
  assert.strictEqual(m.objectAt(local.address), null, 'no longer live');
  const record = m.recordAt(local.address);
  assert.ok(record, 'the record is retained so a dangling pointer can be diagnosed');
  assert.strictEqual(record.alive, false);
  assert.strictEqual(record.name, 'y');
});

test('allocation returns heap addresses that do not overlap', () => {
  const m = M.createMachine();
  const a = m.allocate(16);
  const b = m.allocate(16);
  assert.ok(a >= M.LAYOUT.HEAP_BASE);
  assert.ok(b >= a + 16);
  assert.strictEqual(m.objectAt(a).kind, 'heap');
});

test('allocation returns zero when memory runs out, rather than throwing', () => {
  const m = M.createMachine();
  const huge = m.allocate(M.LAYOUT.CAPACITY);
  assert.strictEqual(huge, 0, 'a failed malloc returns NULL, as in C');
});

test('release marks a heap block freed and keeps the record', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  assert.deepStrictEqual(m.release(address), { ok: true });
  assert.strictEqual(m.objectAt(address), null);
  assert.strictEqual(m.recordAt(address).freed, true);
});

test('release refuses a double free, an interior pointer and a non-heap pointer', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.release(address);
  assert.strictEqual(m.release(address).ok, false, 'double free');
  assert.strictEqual(m.release(address).reason, 'double-free');

  const fresh = m.allocate(8);
  assert.strictEqual(m.release(fresh + 4).reason, 'not-block-start', 'interior pointer');

  m.pushFrame('main');
  const local = m.declareLocal({ name: 'x', ctype: INT });
  assert.strictEqual(m.release(local.address).reason, 'not-heap');
});

test('freed heap space is not handed out again, so use-after-free stays diagnosable', () => {
  const m = M.createMachine();
  const first = m.allocate(8);
  m.release(first);
  const second = m.allocate(8);
  assert.notStrictEqual(second, first,
    'reusing the address would make a use-after-free look valid');
});

test('memory starts uninitialised and is marked on write', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  assert.strictEqual(m.isInitialised(obj.address, 4), false);
  m.markInitialised(obj.address, 4);
  assert.strictEqual(m.isInitialised(obj.address, 4), true);
});

test('initialisation is tracked per byte, not per object', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 's', ctype: { k: 'array', of: CHAR, length: 4 } });
  m.markInitialised(obj.address, 2);
  assert.strictEqual(m.isInitialised(obj.address, 2), true);
  assert.strictEqual(m.isInitialised(obj.address, 4), false,
    'a partly written object must not read as fully initialised');
  assert.strictEqual(m.isInitialised(obj.address + 2, 1), false);
});

test('calloc-style zeroing marks the whole block initialised', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.markInitialised(address, 8);
  assert.strictEqual(m.isInitialised(address, 8), true);
});

test('liveObjects and frames report what the diagram will draw', () => {
  const m = M.createMachine();
  m.declareGlobal({ name: 'g', ctype: INT });
  m.pushFrame('main');
  m.declareLocal({ name: 'x', ctype: INT });
  m.allocate(4);
  const names = m.liveObjects().map((o) => o.name);
  assert.ok(names.includes('g'));
  assert.ok(names.includes('x'));
  assert.strictEqual(m.frames().length, 1);
  assert.strictEqual(m.frames()[0].functionName, 'main');
});

test('the frame depth cap is reported rather than exhausting the stack', () => {
  const m = M.createMachine();
  let depth = 0;
  let capped = false;
  while (depth < 500) {
    const result = m.pushFrame('recurse');
    if (result === null) {
      capped = true;
      break;
    }
    depth += 1;
  }
  assert.ok(capped, 'pushFrame must report the cap by returning null');
  assert.ok(depth <= 200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-machine-shadow.test.js`
Expected: FAIL with `m.declareGlobal is not a function`

- [ ] **Step 3: Write the implementation**

Add inside `createMachine`, before its `return`, and extend the returned object.

```js
    const MAX_FRAMES = 200;

    const objects = [];          // every record ever created, live or dead
    const frameStack = [];
    let globalNext = LAYOUT.GLOBAL_BASE;
    let heapNext = LAYOUT.HEAP_BASE;
    let stackNext = LAYOUT.STACK_TOP;
    let nextObjectId = 1;
    let nextFrameId = 1;
    let structs = {};

    function makeObject(name, address, size, ctype, kind, frameId) {
      const obj = {
        id: nextObjectId,
        name: name,
        address: address,
        size: size,
        ctype: ctype,
        kind: kind,
        frameId: frameId,
        alive: true,
        freed: false,
        initialised: new Uint8Array(size), // one flag per byte
      };
      nextObjectId += 1;
      objects.push(obj);
      return obj;
    }

    function declareGlobal(decl) {
      const size = sizeOf(decl.ctype, structs);
      const align = alignOf(decl.ctype, structs);
      globalNext = roundUp(globalNext, align);
      const obj = makeObject(decl.name, globalNext, size, decl.ctype, 'global', null);
      globalNext += size;
      return obj;
    }

    /** Returns the new frame id, or null when the depth cap is reached. */
    function pushFrame(functionName) {
      if (frameStack.length >= MAX_FRAMES) return null;
      const frame = {
        id: nextFrameId,
        functionName: functionName,
        base: stackNext,
        objects: [],
      };
      nextFrameId += 1;
      frameStack.push(frame);
      return frame.id;
    }

    /**
     * Objects are marked dead but kept. Keeping them is what lets a later
     * dereference say "this pointed at y in inner, which has returned" rather
     * than the useless "invalid address".
     */
    function popFrame() {
      const frame = frameStack.pop();
      if (!frame) return;
      for (const obj of frame.objects) obj.alive = false;
      stackNext = frame.base;
    }

    function declareLocal(decl) {
      const frame = frameStack[frameStack.length - 1];
      if (!frame) return null;
      const size = sizeOf(decl.ctype, structs);
      const align = alignOf(decl.ctype, structs);
      // The stack grows down: move down by the size, then align downward.
      let address = stackNext - size;
      address = address - (address % align === 0 ? 0 : address % align);
      stackNext = address;
      const obj = makeObject(decl.name, address, size, decl.ctype, 'local', frame.id);
      frame.objects.push(obj);
      return obj;
    }

    /**
     * A bump allocator that never reuses freed space. Reuse would make a
     * use-after-free indistinguishable from a legitimate access, which would
     * cost the feature its most valuable diagnostic. A 1 MiB space is ample
     * for programs a learner writes.
     */
    function allocate(size) {
      const rounded = roundUp(Math.max(1, size), 8);
      if (heapNext + rounded > stackNext) return 0; // NULL, as C would return
      const address = heapNext;
      heapNext += rounded;
      makeObject(null, address, rounded, null, 'heap', null);
      return address;
    }

    function release(address) {
      const record = recordAt(address);
      if (!record) return { ok: false, reason: 'not-heap' };
      if (record.kind !== 'heap') return { ok: false, reason: 'not-heap' };
      if (record.address !== address) return { ok: false, reason: 'not-block-start' };
      if (record.freed) return { ok: false, reason: 'double-free' };
      record.freed = true;
      record.alive = false;
      return { ok: true };
    }

    function contains(obj, address) {
      return address >= obj.address && address < obj.address + obj.size;
    }

    function objectAt(address) {
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (objects[i].alive && contains(objects[i], address)) return objects[i];
      }
      return null;
    }

    /** Live or dead. Task 8's diagnostics need the dead ones. */
    function recordAt(address) {
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (contains(objects[i], address)) return objects[i];
      }
      return null;
    }

    function markInitialised(address, count) {
      const obj = objectAt(address);
      if (!obj) return;
      const start = address - obj.address;
      for (let i = 0; i < count && start + i < obj.size; i += 1) {
        obj.initialised[start + i] = 1;
      }
    }

    function isInitialised(address, count) {
      const obj = objectAt(address);
      if (!obj) return false;
      const start = address - obj.address;
      for (let i = 0; i < count; i += 1) {
        if (start + i >= obj.size || !obj.initialised[start + i]) return false;
      }
      return true;
    }

    function liveObjects() {
      return objects.filter((o) => o.alive);
    }

    function leakedBlocks() {
      return objects.filter((o) => o.kind === 'heap' && !o.freed);
    }
```

Extend the returned object with `declareGlobal`, `pushFrame`, `popFrame`,
`declareLocal`, `allocate`, `release`, `objectAt`, `recordAt`, `markInitialised`,
`isInitialised`, `liveObjects`, `leakedBlocks`, `frames: () => frameStack.slice()`,
`setStructs: (value) => { structs = value; }`, and `MAX_FRAMES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-machine-shadow.test.js`
Expected: PASS, 16 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-machine.js test/trace-machine-shadow.test.js
git commit -m "Add the Trace shadow map and object lifecycle"
```

**A note on the bump allocator.** Never reusing freed memory is a deliberate
trade. A real allocator recycles, and a recycled block makes use-after-free
undetectable — which is exactly why the bug is so hard to find in real C. Since
the whole point of this feature is to make that bug visible, Trace keeps every
block's address unique for the life of the program. The cost is that a program
looping over malloc and free will exhaust 1 MiB sooner than a real one would;
that produces the out-of-memory teaching message, which is an acceptable outcome
for the programs a beginner writes.

---

## Task 7: The journal and Step Back

**Files:**
- Modify: `src/renderer/js/trace-machine.js`
- Test: `test/trace-machine-journal.test.js`

**Interfaces:**
- Consumes: Tasks 5 and 6
- Produces, on the machine:
  - `beginStep(): void`, `endStep(): void`
  - `undoStep(): boolean` (false when there is nothing left to undo)
  - `stepsAvailable(): number`
  - `MAX_JOURNAL = 200000`

**A required refactor first.** Task 6 implemented `popFrame` with
`frameStack.pop()`, which throws the frame away. Undo cannot restore what was
discarded. Change the representation to an append-only `allFrames` array plus a
`frameDepth` counter: pushing appends and increments, popping only decrements,
and `frames()` returns `allFrames.slice(0, frameDepth)`. Undo then restores one
number instead of reconstructing an object. Task 6's tests must still pass
unchanged after this change; if any needs editing, the refactor is wrong.

The same insight applies throughout: **objects are only ever appended**, never
removed, and every other piece of machine state is either a scalar or a byte in
memory. So a step's undo record is the handful of scalars as they were, plus the
previous bytes of anything written. No deep copying, no snapshots.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };

/** Everything that defines the machine's observable state, as a comparable string. */
function fingerprint(m) {
  return JSON.stringify({
    bytes: Array.from(m.bytes),
    live: m.liveObjects().map((o) => [o.id, o.address, o.size, o.alive, o.freed,
      Array.from(o.initialised)]),
    frames: m.frames().map((f) => [f.id, f.functionName, f.base]),
  });
}

test('a step with no writes still undoes cleanly', () => {
  const m = M.createMachine();
  const before = fingerprint(m);
  m.beginStep();
  m.endStep();
  assert.strictEqual(m.undoStep(), true);
  assert.strictEqual(fingerprint(m), before);
});

test('undo restores memory written during a step', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  m.beginStep();
  m.writeValue(obj.address, INT, 42);
  m.markInitialised(obj.address, 4);
  m.endStep();
  assert.strictEqual(m.readValue(obj.address, INT), 42);
  m.undoStep();
  assert.strictEqual(m.isInitialised(obj.address, 4), false,
    'undo must restore the initialisation bitmap too, not only the bytes');
});

test('undo removes objects declared during the step', () => {
  const m = M.createMachine();
  m.beginStep();
  m.pushFrame('main');
  const obj = m.declareLocal({ name: 'x', ctype: INT });
  m.endStep();
  assert.ok(m.objectAt(obj.address));
  m.undoStep();
  assert.strictEqual(m.objectAt(obj.address), null);
  assert.strictEqual(m.recordAt(obj.address), null, 'the record goes too, not just liveness');
  assert.strictEqual(m.frames().length, 0);
});

test('undo restores a popped frame and its objects', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  m.pushFrame('inner');
  const local = m.declareLocal({ name: 'y', ctype: INT });
  m.beginStep();
  m.popFrame();
  m.endStep();
  assert.strictEqual(m.frames().length, 1);
  m.undoStep();
  assert.strictEqual(m.frames().length, 2);
  assert.ok(m.objectAt(local.address), 'the local is live again');
});

test('undo restores a freed heap block', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.beginStep();
  m.release(address);
  m.endStep();
  assert.strictEqual(m.recordAt(address).freed, true);
  m.undoStep();
  assert.strictEqual(m.recordAt(address).freed, false);
  assert.ok(m.objectAt(address));
});

test('undo returns false when there is nothing left', () => {
  const m = M.createMachine();
  assert.strictEqual(m.undoStep(), false);
  m.beginStep();
  m.endStep();
  assert.strictEqual(m.undoStep(), true);
  assert.strictEqual(m.undoStep(), false);
});

test('PROPERTY: forward N then back N is byte-identical', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const a = m.declareLocal({ name: 'a', ctype: INT });
  const b = m.declareLocal({ name: 'b', ctype: INT });
  const before = fingerprint(m);

  const N = 200;
  for (let i = 0; i < N; i += 1) {
    m.beginStep();
    // A mix of writes, allocations, frames and frees, so the property covers
    // every kind of journal entry rather than only memory writes.
    m.writeValue(a.address, INT, i);
    m.markInitialised(a.address, 4);
    if (i % 3 === 0) m.writeValue(b.address, INT, i * 2);
    if (i % 5 === 0) m.allocate(16);
    if (i % 7 === 0) m.pushFrame('f' + i);
    if (i % 11 === 0 && m.frames().length > 1) m.popFrame();
    m.endStep();
  }
  for (let i = 0; i < N; i += 1) assert.strictEqual(m.undoStep(), true, 'undo ' + i);

  assert.strictEqual(fingerprint(m), before,
    'stepping forward and back must be exactly reversible');
});

test('PROPERTY: the same sequence twice produces the same state', () => {
  function run() {
    const m = M.createMachine();
    m.pushFrame('main');
    const x = m.declareLocal({ name: 'x', ctype: INT });
    for (let i = 0; i < 50; i += 1) {
      m.beginStep();
      m.writeValue(x.address, INT, i * 7);
      m.markInitialised(x.address, 4);
      if (i % 4 === 0) m.allocate(8);
      m.endStep();
    }
    return fingerprint(m);
  }
  assert.strictEqual(run(), run(), 'the machine must be deterministic');
});

test('the journal caps and reports how far back it can go', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const x = m.declareLocal({ name: 'x', ctype: INT });
  for (let i = 0; i < 1000; i += 1) {
    m.beginStep();
    m.writeValue(x.address, INT, i);
    m.endStep();
  }
  assert.ok(m.stepsAvailable() > 0);
  assert.ok(m.stepsAvailable() <= 1000);
  assert.ok(M.MAX_JOURNAL >= 200000);
});

test('undoing past the retained window stops rather than corrupting state', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  const x = m.declareLocal({ name: 'x', ctype: INT });
  for (let i = 0; i < 100; i += 1) {
    m.beginStep();
    m.writeValue(x.address, INT, i);
    m.endStep();
  }
  let undone = 0;
  while (m.undoStep()) undone += 1;
  assert.strictEqual(m.undoStep(), false);
  assert.ok(undone <= 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-machine-journal.test.js`
Expected: FAIL with `m.beginStep is not a function`

- [ ] **Step 3: Write the implementation**

```js
    const MAX_JOURNAL = 200000;

    const journal = [];
    let currentStep = null;

    /**
     * One entry per step. Because objects are append-only and every other piece
     * of state is a scalar or a byte, undoing a step is: put the bytes back,
     * put the flags back, then restore five numbers. No snapshots.
     */
    function beginStep() {
      currentStep = {
        writes: [],          // {address, previous: Uint8Array}
        flags: [],           // {objectId, field, previous}
        initBits: [],        // {objectId, offset, previous: Uint8Array}
        objectCount: objects.length,
        frameCount: allFrames.length,
        frameDepth: frameDepth,
        globalNext: globalNext,
        heapNext: heapNext,
        stackNext: stackNext,
      };
    }

    function endStep() {
      if (!currentStep) return;
      journal.push(currentStep);
      currentStep = null;
      // Dropping the oldest keeps the most recent window, which is the window
      // a learner actually wants to walk back through.
      if (journal.length > MAX_JOURNAL) journal.shift();
    }

    /** Called by writeBytes and writeValue before they change anything. */
    function recordWrite(address, count) {
      if (!currentStep) return;
      currentStep.writes.push({
        address: address,
        previous: bytes.slice(address, address + count),
      });
    }

    function recordFlag(obj, field) {
      if (!currentStep) return;
      currentStep.flags.push({ objectId: obj.id, field: field, previous: obj[field] });
    }

    function recordInitBits(obj, offset, count) {
      if (!currentStep) return;
      currentStep.initBits.push({
        objectId: obj.id,
        offset: offset,
        previous: obj.initialised.slice(offset, offset + count),
      });
    }

    function objectById(id) {
      for (let i = objects.length - 1; i >= 0; i -= 1) {
        if (objects[i].id === id) return objects[i];
      }
      return null;
    }

    function undoStep() {
      const step = journal.pop();
      if (!step) return false;

      // Reverse order matters: two writes to one address in a single step must
      // be undone last-first to land on the original bytes.
      for (let i = step.writes.length - 1; i >= 0; i -= 1) {
        const entry = step.writes[i];
        bytes.set(entry.previous, entry.address);
      }
      for (let i = step.initBits.length - 1; i >= 0; i -= 1) {
        const entry = step.initBits[i];
        const obj = objectById(entry.objectId);
        if (obj) obj.initialised.set(entry.previous, entry.offset);
      }
      for (let i = step.flags.length - 1; i >= 0; i -= 1) {
        const entry = step.flags[i];
        const obj = objectById(entry.objectId);
        if (obj) obj[entry.field] = entry.previous;
      }

      objects.length = step.objectCount;
      allFrames.length = step.frameCount;
      frameDepth = step.frameDepth;
      globalNext = step.globalNext;
      heapNext = step.heapNext;
      stackNext = step.stackNext;
      return true;
    }

    function stepsAvailable() {
      return journal.length;
    }
```

Then wire the recorders into the mutators written in Tasks 5 and 6:

- `writeBytes` and `writeValue` call `recordWrite(address, count)` **before**
  writing.
- `markInitialised` calls `recordInitBits(obj, start, count)` before setting.
- `popFrame` calls `recordFlag(obj, 'alive')` for each object it kills, and
  decrements `frameDepth` instead of popping.
- `release` calls `recordFlag(record, 'freed')` and `recordFlag(record, 'alive')`
  before setting them.

Replace the frame representation as described above: `allFrames` is append-only,
`frameDepth` is the live count, `pushFrame` reuses `allFrames[frameDepth]` if a
frame is already there from an undone step or appends a new one, and `frames()`
returns `allFrames.slice(0, frameDepth)`.

Export `beginStep`, `endStep`, `undoStep`, `stepsAvailable` on the machine and
`MAX_JOURNAL` on the module.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-machine-journal.test.js`
Expected: PASS, 10 tests

- [ ] **Step 5: Confirm Task 6 still passes unchanged**

Run: `node --test test/trace-machine-shadow.test.js`
Expected: PASS, 16 tests, with **no edits** to that file. If a test there needed
changing, the frame refactor altered observable behaviour and is wrong.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/trace-machine.js test/trace-machine-journal.test.js
git commit -m "Add the Trace execution journal and Step Back"
```

---

## Task 8: The fourteen checks

**Files:**
- Modify: `src/renderer/js/trace-machine.js`
- Test: `test/trace-machine-checks.test.js`

**Interfaces:**
- Consumes: Tasks 5 to 7
- Produces, on the machine:
  - `checkRead(address, count): Diagnostic|null`
  - `checkWrite(address, count): Diagnostic|null`
  - `checkFree(address): Diagnostic|null`
  - `checkIndex(baseObject, index, elementSize): Diagnostic|null`
  - `checkDivide(divisor): Diagnostic|null`
  - `checkIntResult(value): Diagnostic|null`
  - `checkLeaks(): Diagnostic|null`
  - `describeAddress(address): string` (used inside messages and by the diagram)

Each returns `null` when all is well, or a `Diagnostic` carrying `code`, `terse`,
`plain`, `locations` (filled in by the caller, which knows the source position)
and `highlight`, a list of `{address, size}` ranges for the diagram to mark.

The checks live on the machine rather than in the interpreter because they are
answers about *memory*, and memory is what the machine knows. The interpreter
supplies the source location and decides whether a diagnostic halts execution.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/renderer/js/trace-machine.js');

const INT = { k: 'int' };
const ARR5 = { k: 'array', of: INT, length: 5 };

function machineWithLocals() {
  const m = M.createMachine();
  m.pushFrame('main');
  return m;
}

test('a read of initialised memory is fine', () => {
  const m = machineWithLocals();
  const x = m.declareLocal({ name: 'x', ctype: INT });
  m.markInitialised(x.address, 4);
  assert.strictEqual(m.checkRead(x.address, 4), null);
});

test('1. reading uninitialised memory names the variable', () => {
  const m = machineWithLocals();
  const x = m.declareLocal({ name: 'x', ctype: INT });
  const d = m.checkRead(x.address, 4);
  assert.strictEqual(d.code, 'uninitialised-read');
  assert.ok(d.terse.length > 0);
  assert.ok(d.plain.includes('x'), 'the message should name the variable');
  assert.deepStrictEqual(d.highlight, [{ address: x.address, size: 4 }]);
});

test('1b. a partly initialised object still reports on the unwritten part', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  m.markInitialised(arr.address, 8);
  assert.strictEqual(m.checkRead(arr.address, 8), null);
  assert.strictEqual(m.checkRead(arr.address + 8, 4).code, 'uninitialised-read');
});

test('2 and 3. out-of-bounds read and write are distinguished', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  m.markInitialised(arr.address, 20);
  const read = m.checkRead(arr.address + 20, 4);
  const write = m.checkWrite(arr.address + 20, 4);
  assert.strictEqual(read.code, 'out-of-bounds-read');
  assert.strictEqual(write.code, 'out-of-bounds-write');
  assert.ok(read.plain.includes('a'), 'name the array that was overrun');
  assert.ok(/5/.test(read.plain), 'say how long it actually is');
});

test('4. use after free says what the block was', () => {
  const m = M.createMachine();
  const address = m.allocate(16);
  m.markInitialised(address, 16);
  m.release(address);
  const d = m.checkRead(address, 4);
  assert.strictEqual(d.code, 'use-after-free');
  assert.ok(d.plain.toLowerCase().includes('free'));
});

test('5. double free', () => {
  const m = M.createMachine();
  const address = m.allocate(8);
  m.release(address);
  assert.strictEqual(m.checkFree(address).code, 'double-free');
});

test('6. free of a non-heap pointer, and of an interior pointer', () => {
  const m = machineWithLocals();
  const x = m.declareLocal({ name: 'x', ctype: INT });
  assert.strictEqual(m.checkFree(x.address).code, 'free-of-non-heap');
  const block = m.allocate(16);
  assert.strictEqual(m.checkFree(block + 4).code, 'free-of-interior-pointer');
});

test('7. null dereference is its own message, not a generic bad address', () => {
  const m = M.createMachine();
  const d = m.checkRead(0, 4);
  assert.strictEqual(d.code, 'null-dereference');
  assert.ok(d.plain.toLowerCase().includes('null'));
});

test('8. a pointer into a returned frame names the function it belonged to', () => {
  const m = M.createMachine();
  m.pushFrame('main');
  m.pushFrame('helper');
  const local = m.declareLocal({ name: 'temp', ctype: INT });
  m.markInitialised(local.address, 4);
  m.popFrame();
  const d = m.checkRead(local.address, 4);
  assert.strictEqual(d.code, 'dangling-stack-pointer');
  assert.ok(d.plain.includes('helper'), 'name the function that returned');
  assert.ok(d.plain.includes('temp'), 'name the variable');
});

test('9. leaks are reported at exit with a count and total', () => {
  const m = M.createMachine();
  m.allocate(16);
  m.allocate(32);
  const kept = m.allocate(8);
  m.release(kept);
  const d = m.checkLeaks();
  assert.strictEqual(d.code, 'memory-leak');
  assert.ok(/2/.test(d.plain), 'two blocks still allocated');
  assert.ok(/48/.test(d.plain), 'forty-eight bytes total');
  assert.strictEqual(d.highlight.length, 2);
});

test('9b. no leak means no diagnostic', () => {
  const m = M.createMachine();
  const address = m.allocate(16);
  m.release(address);
  assert.strictEqual(m.checkLeaks(), null);
});

test('10. division and modulo by zero', () => {
  const m = M.createMachine();
  assert.strictEqual(m.checkDivide(0).code, 'divide-by-zero');
  assert.strictEqual(m.checkDivide(1), null);
});

test('11. signed overflow is caught at the boundary, both ways', () => {
  const m = M.createMachine();
  assert.strictEqual(m.checkIntResult(2147483647), null);
  assert.strictEqual(m.checkIntResult(2147483648).code, 'signed-overflow');
  assert.strictEqual(m.checkIntResult(-2147483648), null);
  assert.strictEqual(m.checkIntResult(-2147483649).code, 'signed-overflow');
});

test('12. a negative index is its own message, clearer than out-of-bounds', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  const d = m.checkIndex(arr, -1, 4);
  assert.strictEqual(d.code, 'negative-index');
  assert.strictEqual(m.checkIndex(arr, 0, 4), null);
  assert.strictEqual(m.checkIndex(arr, 4, 4), null);
  assert.strictEqual(m.checkIndex(arr, 5, 4).code, 'index-out-of-range');
});

test('12b. the off-by-one message says the last valid index', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  const d = m.checkIndex(arr, 5, 4);
  assert.ok(/4/.test(d.plain), 'the last valid index of a 5-element array is 4');
});

test('13. strcpy into a short buffer is checked as a write', () => {
  const m = machineWithLocals();
  const buf = m.declareLocal({ name: 'buf', ctype: { k: 'array', of: { k: 'char' }, length: 4 } });
  assert.strictEqual(m.checkWrite(buf.address, 4), null);
  assert.strictEqual(m.checkWrite(buf.address, 6).code, 'out-of-bounds-write');
});

test('an address in no object at all is reported as a wild pointer', () => {
  const m = M.createMachine();
  const d = m.checkRead(M.LAYOUT.HEAP_BASE + 5000, 4);
  assert.strictEqual(d.code, 'wild-pointer');
});

test('every diagnostic carries both messages and something to highlight', () => {
  const m = machineWithLocals();
  const arr = m.declareLocal({ name: 'a', ctype: ARR5 });
  const produced = [
    m.checkRead(arr.address, 4),
    m.checkWrite(arr.address + 20, 4),
    m.checkRead(0, 4),
    m.checkDivide(0),
    m.checkIntResult(1e12),
  ];
  for (const d of produced) {
    assert.ok(d, 'expected a diagnostic');
    assert.ok(typeof d.code === 'string' && d.code.length > 0);
    assert.ok(typeof d.terse === 'string' && d.terse.length > 0);
    assert.ok(typeof d.plain === 'string' && d.plain.length > 20,
      'the plain message must actually explain: ' + d.code);
    assert.ok(Array.isArray(d.highlight));
  }
});

test('checks never throw, whatever address they are handed', () => {
  const m = M.createMachine();
  for (const address of [-1, 0, 7, M.LAYOUT.CAPACITY, M.LAYOUT.CAPACITY * 2, NaN]) {
    assert.doesNotThrow(() => m.checkRead(address, 4), String(address));
    assert.doesNotThrow(() => m.checkWrite(address, 4), String(address));
    assert.doesNotThrow(() => m.checkFree(address), String(address));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-machine-checks.test.js`
Expected: FAIL with `m.checkRead is not a function`

- [ ] **Step 3: Write the implementation**

```js
    const INT_MIN = -2147483648;
    const INT_MAX = 2147483647;

    function diagnostic(code, terse, plain, highlight) {
      return {
        code: code,
        terse: terse,
        plain: plain,
        locations: [],              // the interpreter fills these in
        highlight: highlight || [],
      };
    }

    /** A human phrase for an address, reused inside several messages. */
    function describeAddress(address) {
      const record = recordAt(address);
      if (!record) return 'address ' + address;
      const offset = address - record.address;
      const where = offset === 0 ? '' : ' plus ' + offset + ' bytes';
      if (record.kind === 'heap') return 'a heap block of ' + record.size + ' bytes' + where;
      return (record.name || 'an unnamed object') + where;
    }

    function accessProblem(address, count, verb) {
      if (!Number.isInteger(address)) {
        return diagnostic('wild-pointer',
          'invalid address',
          'This pointer does not hold a usable address. It was probably never '
            + 'given a value.',
          []);
      }
      if (address >= LAYOUT.NULL_GUARD && address < LAYOUT.GLOBAL_BASE) {
        return diagnostic('null-dereference',
          'null pointer dereferenced',
          'This pointer is NULL, which means it points at nothing. Check '
            + 'whether it was ever set, and whether a malloc that could have '
            + 'returned NULL was checked.',
          []);
      }

      const record = recordAt(address);
      if (!record) {
        return diagnostic('wild-pointer',
          'address belongs to no object',
          'This address is not inside any variable or allocated block. The '
            + 'pointer holds a value that was never a real address.',
          []);
      }

      if (record.kind === 'heap' && record.freed) {
        return diagnostic('use-after-free',
          'use of freed memory',
          'This memory was released with free, so it no longer belongs to the '
            + 'program. Once a block is freed, the pointer to it must not be '
            + 'used again.',
          [{ address: record.address, size: record.size }]);
      }

      if (!record.alive && record.kind === 'local') {
        const frame = allFrames.find((f) => f.id === record.frameId);
        const functionName = frame ? frame.functionName : 'a function';
        return diagnostic('dangling-stack-pointer',
          'use of a local variable after its function returned',
          'This points at ' + record.name + ', a local variable of '
            + functionName + '. That function has returned, so its locals no '
            + 'longer exist. Returning a pointer to a local is never safe.',
          [{ address: record.address, size: record.size }]);
      }

      if (address + count > record.address + record.size) {
        const elementCount = record.ctype && record.ctype.k === 'array'
          ? record.ctype.length : null;
        const extent = elementCount !== null
          ? record.name + ' has ' + elementCount + ' elements, so the last valid '
            + 'index is ' + (elementCount - 1) + '.'
          : (record.name || 'this block') + ' is ' + record.size + ' bytes long.';
        return diagnostic(
          verb === 'write' ? 'out-of-bounds-write' : 'out-of-bounds-read',
          verb === 'write' ? 'write past the end of an object'
            : 'read past the end of an object',
          'This ' + verb + ' goes past the end of ' + (record.name || 'the block')
            + '. ' + extent,
          [{ address: record.address, size: record.size }]);
      }

      return null;
    }

    function checkRead(address, count) {
      const problem = accessProblem(address, count, 'read');
      if (problem) return problem;
      if (!isInitialised(address, count)) {
        const record = recordAt(address);
        const name = record && record.name ? record.name : 'this memory';
        return diagnostic('uninitialised-read',
          'read of uninitialised memory',
          name + ' has never been given a value, so reading it now would give '
            + 'whatever happened to be in memory. Assign to it before you read '
            + 'it.',
          [{ address: address, size: count }]);
      }
      return null;
    }

    function checkWrite(address, count) {
      return accessProblem(address, count, 'write');
    }

    function checkFree(address) {
      if (address >= LAYOUT.NULL_GUARD && address < LAYOUT.GLOBAL_BASE) {
        return null; // free(NULL) is defined and does nothing
      }
      const record = recordAt(address);
      if (!record || record.kind !== 'heap') {
        return diagnostic('free-of-non-heap',
          'free of memory that did not come from malloc',
          'Only memory returned by malloc, calloc or realloc can be freed. '
            + 'Local variables and globals are managed for you.',
          record ? [{ address: record.address, size: record.size }] : []);
      }
      if (record.address !== address) {
        return diagnostic('free-of-interior-pointer',
          'free of a pointer into the middle of a block',
          'free needs the exact address malloc returned. This pointer has been '
            + 'moved along by ' + (address - record.address) + ' bytes.',
          [{ address: record.address, size: record.size }]);
      }
      if (record.freed) {
        return diagnostic('double-free',
          'memory freed twice',
          'This block has already been freed. Freeing it again is an error; set '
            + 'the pointer to NULL after freeing to make that obvious.',
          [{ address: record.address, size: record.size }]);
      }
      return null;
    }

    function checkIndex(object, index, elementSize) {
      if (index < 0) {
        return diagnostic('negative-index',
          'negative array index',
          'Array indexes start at 0, so a negative index is always outside the '
            + 'array.',
          [{ address: object.address, size: object.size }]);
      }
      const count = Math.floor(object.size / elementSize);
      if (index >= count) {
        return diagnostic('index-out-of-range',
          'array index out of range',
          (object.name || 'This array') + ' has ' + count + ' elements, so the '
            + 'last valid index is ' + (count - 1) + '. Index ' + index
            + ' is past the end.',
          [{ address: object.address, size: object.size }]);
      }
      return null;
    }

    function checkDivide(divisor) {
      if (divisor !== 0) return null;
      return diagnostic('divide-by-zero',
        'division by zero',
        'Dividing by zero has no answer, and on a real machine it usually stops '
          + 'the program. Check the divisor before dividing.',
        []);
    }

    function checkIntResult(value) {
      if (value >= INT_MIN && value <= INT_MAX) return null;
      return diagnostic('signed-overflow',
        'signed integer overflow',
        'An int holds whole numbers from ' + INT_MIN + ' to ' + INT_MAX
          + '. This result is ' + value + ', which does not fit. In real C the '
          + 'behaviour here is undefined, so the program could do anything.',
        []);
    }

    function checkLeaks() {
      const leaked = leakedBlocks();
      if (leaked.length === 0) return null;
      const total = leaked.reduce((sum, block) => sum + block.size, 0);
      return diagnostic('memory-leak',
        leaked.length + ' allocation(s) never freed',
        'The program ended with ' + leaked.length + ' block(s) still allocated, '
          + total + ' bytes in total. Every malloc needs a matching free.',
        leaked.map((block) => ({ address: block.address, size: block.size })));
    }
```

Export all eight `check*` functions plus `describeAddress` on the machine.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-machine-checks.test.js`
Expected: PASS, 18 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. The 81 pre-existing tests plus Tasks 1 to 8.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/trace-machine.js test/trace-machine-checks.test.js
git commit -m "Add the fourteen Trace memory checks"
```

**Checks 13 and 14 have no code of their own.** A `strcpy` overflow is just
`checkWrite` called with the length the copy would need, which Task 13 does, and
a missing `return` is a control-flow fact the interpreter observes in Task 11.
Both are tested where they are produced rather than duplicated here. The count
of fourteen in the spec refers to *behaviours caught*, not functions written.

---

## Two decisions that shape Tasks 9 to 11

**What a "step" is.** A step executes **one statement**, not one sub-expression.
`x = a * b + c;` is a single step. For a complete beginner, sub-expression
stepping is noise: they want to watch a line run and see what changed. Line
granularity is also what makes the current-line highlight in the editor
meaningful. Loops still step per iteration, because each iteration re-executes a
statement, so `while (1) { }` cannot outrun the step cap.

**How pausing is implemented: generators.** `function* execute(node)` with
`yield` at each statement boundary and `yield*` for nested statements gives the
whole step machine for free, and `step()` becomes `iterator.next()`. The
alternative, an explicit continuation stack, is several hundred lines of
bookkeeping that a generator does correctly by construction.

Expressions are therefore **not** generators. They evaluate recursively and
atomically inside one step, which is the whole reason they are simple.

**Halting.** A check that fires raises a `TraceHalt` carrying the diagnostic,
caught at the top of `step()`. Exceptions are the right tool here: a failed
check must abandon an arbitrarily deep expression evaluation immediately, and
threading a failure return through every evaluator would obscure the code and
still be easy to get wrong. This is the one place in Trace that throws
deliberately.

---

## Task 9: Evaluating expressions

**Files:**
- Create: `src/renderer/js/trace-interp.js`
- Test: `test/trace-interp-expr.test.js`

**Interfaces:**
- Consumes: `trace-machine.js`, `trace-parse.js`
- Produces:
  - `TraceHalt` (class; carries `.diagnostic`)
  - `createContext({ast, machine}): Ctx`
  - `evaluate(node, ctx): {value: number, ctype: Type}`
  - `evaluateLValue(node, ctx): {address: number, ctype: Type}`
  - `Ctx = {machine, structs, functions, globals, scopes, output, diagnostics}`
  - `scopes` is an array of `Map<name, {address, ctype}>`, innermost last

An **lvalue** is anything with an address: a variable, `a[i]`, `s.member`,
`*p`. `evaluateLValue` returns where it lives; `evaluate` returns what is in it.
Assignment needs the first, arithmetic needs the second, and `&x` is exactly
"take the lvalue and stop". Keeping them as two functions rather than one with a
flag is what makes `&a[i]` and `*&x` fall out correctly instead of needing
special cases.

**Arrays decay.** In any rvalue position an array yields its own address with
type `ptr to element`. That single rule makes `int *p = arr;`, `arr[i]`,
`*(arr + i)` and passing an array to a function all work without further code,
and it is the honest explanation of why C arrays behave as they do.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Parse = require('../src/renderer/js/trace-parse.js');
const M = require('../src/renderer/js/trace-machine.js');
const I = require('../src/renderer/js/trace-interp.js');

const INT = { k: 'int' };

/** Build a context with the given locals already declared and initialised. */
function contextWith(locals) {
  const machine = M.createMachine();
  const ctx = I.createContext({ ast: { kind: 'program', body: [] }, machine: machine });
  machine.pushFrame('main');
  ctx.scopes.push(new Map());
  machine.beginStep();
  for (const [name, ctype, value] of locals || []) {
    const obj = machine.declareLocal({ name: name, ctype: ctype });
    ctx.scopes[ctx.scopes.length - 1].set(name, { address: obj.address, ctype: ctype });
    if (value !== undefined) {
      machine.writeValue(obj.address, ctype, value);
      machine.markInitialised(obj.address, M.sizeOf(ctype, ctx.structs));
    }
  }
  machine.endStep();
  return ctx;
}

/** Parse a single expression and evaluate it in ctx. */
function evalExpr(source, ctx) {
  const Lex = require('../src/renderer/js/trace-lex.js');
  const tokens = Lex.tokenize(source).tokens;
  const parsed = Parse.parseExpression(tokens, 0);
  assert.deepStrictEqual(parsed.errors, [], 'parse errors in ' + source);
  return I.evaluate(parsed.node, ctx).value;
}

function halts(source, ctx, code) {
  try {
    evalExpr(source, ctx);
    assert.fail('expected ' + code + ' for: ' + source);
  } catch (error) {
    assert.ok(error instanceof I.TraceHalt, 'expected TraceHalt, got ' + error);
    assert.strictEqual(error.diagnostic.code, code);
  }
}

test('arithmetic on integers', () => {
  const ctx = contextWith([['a', INT, 7], ['b', INT, 3]]);
  assert.strictEqual(evalExpr('a + b', ctx), 10);
  assert.strictEqual(evalExpr('a - b', ctx), 4);
  assert.strictEqual(evalExpr('a * b', ctx), 21);
  assert.strictEqual(evalExpr('a / b', ctx), 2, 'integer division truncates');
  assert.strictEqual(evalExpr('a % b', ctx), 1);
});

test('integer division truncates toward zero, as C requires', () => {
  const ctx = contextWith([['a', INT, -7], ['b', INT, 2]]);
  assert.strictEqual(evalExpr('a / b', ctx), -3, 'not -4');
  assert.strictEqual(evalExpr('a % b', ctx), -1);
});

test('double arithmetic does not truncate', () => {
  const ctx = contextWith([['x', { k: 'double' }, 7], ['y', { k: 'double' }, 2]]);
  assert.strictEqual(evalExpr('x / y', ctx), 3.5);
});

test('an int and a double promote to double', () => {
  const ctx = contextWith([['i', INT, 7], ['d', { k: 'double' }, 2]]);
  assert.strictEqual(evalExpr('i / d', ctx), 3.5);
});

test('comparisons yield 1 and 0, not true and false', () => {
  const ctx = contextWith([['a', INT, 7], ['b', INT, 3]]);
  assert.strictEqual(evalExpr('a > b', ctx), 1);
  assert.strictEqual(evalExpr('a < b', ctx), 0);
  assert.strictEqual(evalExpr('a == 7', ctx), 1);
  assert.strictEqual(evalExpr('a != 7', ctx), 0);
});

test('logical operators short-circuit', () => {
  const ctx = contextWith([['a', INT, 0], ['b', INT, 0]]);
  // If && evaluated its right side, the uninitialised read below would halt.
  const ctx2 = contextWith([['zero', INT, 0], ['never', INT]]);
  assert.strictEqual(evalExpr('zero && never', ctx2), 0);
  assert.strictEqual(evalExpr('!zero || never', ctx2), 1);
  assert.strictEqual(evalExpr('a || b', ctx), 0);
});

test('the conditional operator evaluates only the branch it takes', () => {
  const ctx = contextWith([['flag', INT, 1], ['good', INT, 5], ['never', INT]]);
  assert.strictEqual(evalExpr('flag ? good : never', ctx), 5);
});

test('assignment stores and yields the stored value', () => {
  const ctx = contextWith([['a', INT, 0], ['b', INT, 9]]);
  assert.strictEqual(evalExpr('a = b', ctx), 9);
  assert.strictEqual(evalExpr('a', ctx), 9, 'the store actually happened');
});

test('compound assignment reads, combines and stores', () => {
  const ctx = contextWith([['a', INT, 10]]);
  assert.strictEqual(evalExpr('a += 5', ctx), 15);
  assert.strictEqual(evalExpr('a *= 2', ctx), 30);
});

test('prefix and postfix increment differ in what they yield', () => {
  const ctx = contextWith([['a', INT, 5]]);
  assert.strictEqual(evalExpr('a++', ctx), 5, 'postfix yields the old value');
  assert.strictEqual(evalExpr('a', ctx), 6);
  assert.strictEqual(evalExpr('++a', ctx), 7, 'prefix yields the new value');
});

test('address-of and dereference round-trip', () => {
  const ctx = contextWith([['a', INT, 42], ['p', { k: 'ptr', to: INT }]]);
  const address = evalExpr('&a', ctx);
  assert.ok(address > 0);
  assert.strictEqual(evalExpr('p = &a', ctx), address);
  assert.strictEqual(evalExpr('*p', ctx), 42);
  assert.strictEqual(evalExpr('*&a', ctx), 42);
});

test('writing through a pointer changes the original', () => {
  const ctx = contextWith([['a', INT, 1], ['p', { k: 'ptr', to: INT }]]);
  evalExpr('p = &a', ctx);
  evalExpr('*p = 99', ctx);
  assert.strictEqual(evalExpr('a', ctx), 99);
});

test('an array decays to a pointer to its first element', () => {
  const arr = { k: 'array', of: INT, length: 4 };
  const ctx = contextWith([['a', arr]]);
  const decayed = evalExpr('a', ctx);
  const first = evalExpr('&a[0]', ctx);
  assert.strictEqual(decayed, first, 'the array is its own first address');
});

test('pointer arithmetic scales by the element size', () => {
  const arr = { k: 'array', of: INT, length: 4 };
  const ctx = contextWith([['a', arr]]);
  const base = evalExpr('a', ctx);
  assert.strictEqual(evalExpr('a + 1', ctx), base + 4, 'one int, not one byte');
  assert.strictEqual(evalExpr('&a[2]', ctx), base + 8);
});

test('subscripting is defined as pointer arithmetic', () => {
  const arr = { k: 'array', of: INT, length: 4 };
  const ctx = contextWith([['a', arr]]);
  evalExpr('a[1] = 77', ctx);
  assert.strictEqual(evalExpr('a[1]', ctx), 77);
  assert.strictEqual(evalExpr('*(a + 1)', ctx), 77, 'a[i] is *(a + i)');
});

test('sizeof reports the real sizes, including padding', () => {
  const ctx = contextWith([['a', { k: 'array', of: INT, length: 5 }]]);
  assert.strictEqual(evalExpr('sizeof(int)', ctx), 4);
  assert.strictEqual(evalExpr('sizeof(char)', ctx), 1);
  assert.strictEqual(evalExpr('sizeof(double)', ctx), 8);
  assert.strictEqual(evalExpr('sizeof(a)', ctx), 20, 'the whole array, not a pointer');
});

test('a cast to int truncates a double toward zero', () => {
  const ctx = contextWith([['d', { k: 'double' }, 3.9]]);
  assert.strictEqual(evalExpr('(int)d', ctx), 3);
  const negative = contextWith([['d', { k: 'double' }, -3.9]]);
  assert.strictEqual(evalExpr('(int)d', negative), -3);
});

test('reading an uninitialised variable halts with the right diagnostic', () => {
  halts('x + 1', contextWith([['x', INT]]), 'uninitialised-read');
});

test('dividing by zero halts', () => {
  halts('a / b', contextWith([['a', INT, 1], ['b', INT, 0]]), 'divide-by-zero');
  halts('a % b', contextWith([['a', INT, 1], ['b', INT, 0]]), 'divide-by-zero');
});

test('overflowing an int halts rather than wrapping silently', () => {
  halts('a * b', contextWith([['a', INT, 100000], ['b', INT, 100000]]), 'signed-overflow');
});

test('indexing past the end halts and names the array', () => {
  const arr = { k: 'array', of: INT, length: 3 };
  const ctx = contextWith([['a', arr]]);
  halts('a[5]', ctx, 'index-out-of-range');
  halts('a[-1]', ctx, 'negative-index');
});

test('dereferencing a null pointer halts', () => {
  const ctx = contextWith([['p', { k: 'ptr', to: INT }, 0]]);
  halts('*p', ctx, 'null-dereference');
});

test('an unknown identifier halts with a semantic diagnostic', () => {
  halts('nosuchthing', contextWith([]), 'undeclared-identifier');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-interp-expr.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-interp.js'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * The Trace evaluator.
 *
 * Expressions evaluate recursively and atomically; statements (Task 10) are
 * generators that yield between steps. The split is deliberate: a step is a
 * statement, so nothing inside an expression ever needs to pause.
 *
 * Every memory access goes through the machine's checks first. That is the
 * whole point of the feature, so there is no fast path that skips them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceInterp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Machine = (typeof module === 'object' && module.exports)
    ? require('./trace-machine.js')
    : (typeof self !== 'undefined' ? self : this).TraceMachine;

  /** Raised when a check fires. Caught at the top of step(). */
  class TraceHalt extends Error {
    constructor(diagnostic) {
      super(diagnostic.terse);
      this.name = 'TraceHalt';
      this.diagnostic = diagnostic;
    }
  }

  function halt(diagnostic, node) {
    if (node && diagnostic.locations.length === 0) {
      diagnostic.locations = [{ line: node.line, col: node.col, length: 1 }];
    }
    throw new TraceHalt(diagnostic);
  }

  function semantic(code, terse, plain, node) {
    halt({ code: code, terse: terse, plain: plain, locations: [], highlight: [] }, node);
  }

  function createContext(options) {
    return {
      machine: options.machine,
      ast: options.ast,
      structs: {},
      functions: Object.create(null),
      globals: new Map(),
      scopes: [],
      output: [],
      diagnostics: [],
      stdin: { text: '', position: 0 },
      steps: 0,
    };
  }

  // --- names ---------------------------------------------------------------

  function lookup(name, ctx, node) {
    for (let i = ctx.scopes.length - 1; i >= 0; i -= 1) {
      const found = ctx.scopes[i].get(name);
      if (found) return found;
    }
    const global = ctx.globals.get(name);
    if (global) return global;
    semantic('undeclared-identifier',
      "'" + name + "' was not declared",
      'Trace has not seen a variable called ' + name + '. Check the spelling, '
        + 'and check that it is declared before it is used.',
      node);
    return null;
  }

  // --- types ---------------------------------------------------------------

  function isArithmetic(ctype) {
    return ctype.k === 'int' || ctype.k === 'char' || ctype.k === 'double'
      || ctype.k === 'enum';
  }
  function isPointerish(ctype) {
    return ctype.k === 'ptr' || ctype.k === 'array';
  }
  function pointee(ctype) {
    return ctype.k === 'ptr' ? ctype.to : ctype.of;
  }
  function sizeOf(ctype, ctx) {
    return Machine.sizeOf(ctype, ctx.structs);
  }

  /**
   * An array in rvalue position becomes a pointer to its first element. One
   * rule, and `int *p = arr`, `arr[i]`, `*(arr + i)` and passing an array to a
   * function all follow from it.
   */
  function decay(result) {
    if (result.ctype.k !== 'array') return result;
    return { value: result.address !== undefined ? result.address : result.value,
      ctype: { k: 'ptr', to: result.ctype.of } };
  }

  function usualConversion(left, right) {
    if (left.ctype.k === 'double' || right.ctype.k === 'double') return { k: 'double' };
    return { k: 'int' };
  }

  // --- lvalues -------------------------------------------------------------

  function evaluateLValue(node, ctx) {
    switch (node.kind) {
      case 'ident': {
        const entry = lookup(node.name, ctx, node);
        return { address: entry.address, ctype: entry.ctype };
      }
      case 'unary':
        if (node.op === '*') {
          const target = decay(evaluate(node.operand, ctx));
          if (!isPointerish(target.ctype)) {
            semantic('not-a-pointer', 'cannot dereference a non-pointer',
              'Only a pointer can be dereferenced with *.', node);
          }
          return { address: target.value, ctype: pointee(target.ctype) };
        }
        break;
      case 'index': {
        const base = decay(evaluate(node.array, ctx));
        if (!isPointerish(base.ctype)) {
          semantic('not-an-array', 'cannot subscript this value',
            'Only an array or a pointer can be indexed with [].', node);
        }
        const elementType = pointee(base.ctype);
        const elementSize = sizeOf(elementType, ctx);
        const index = evaluate(node.index, ctx).value;

        // Index checking needs the object, which a bare pointer may not have.
        const object = ctx.machine.objectAt(base.value);
        if (object && object.ctype && object.ctype.k === 'array') {
          const problem = ctx.machine.checkIndex(object, index, elementSize);
          if (problem) halt(problem, node);
        }
        return { address: base.value + index * elementSize, ctype: elementType };
      }
      case 'member': {
        let ownerType;
        let ownerAddress;
        if (node.arrow) {
          const pointer = decay(evaluate(node.object, ctx));
          ownerAddress = pointer.value;
          ownerType = pointee(pointer.ctype);
        } else {
          const owner = evaluateLValue(node.object, ctx);
          ownerAddress = owner.address;
          ownerType = owner.ctype;
        }
        if (ownerType.k !== 'struct') {
          semantic('not-a-struct', 'this value has no members',
            'Only a struct has members reached with . or ->.', node);
        }
        const layout = ctx.structs[ownerType.tag];
        const field = layout && layout.fields.find((f) => f.name === node.name);
        if (!field) {
          semantic('no-such-member',
            "no member named '" + node.name + "'",
            'struct ' + ownerType.tag + ' has no member called ' + node.name + '.',
            node);
        }
        return { address: ownerAddress + field.offset, ctype: field.ctype };
      }
      default: break;
    }
    semantic('not-assignable', 'this is not something with an address',
      'You can only take the address of, or assign to, a variable, an array '
        + 'element, a struct member, or a dereferenced pointer.', node);
    return null;
  }

  function loadFrom(address, ctype, ctx, node) {
    if (ctype.k === 'array' || ctype.k === 'struct') {
      // Not loaded as a value: an aggregate is used by address.
      return { value: address, ctype: ctype, address: address };
    }
    const problem = ctx.machine.checkRead(address, sizeOf(ctype, ctx));
    if (problem) halt(problem, node);
    return { value: ctx.machine.readValue(address, ctype), ctype: ctype, address: address };
  }

  function storeTo(address, ctype, value, ctx, node) {
    const size = sizeOf(ctype, ctx);
    const problem = ctx.machine.checkWrite(address, size);
    if (problem) halt(problem, node);
    const coerced = ctype.k === 'double' ? Number(value) : Math.trunc(value);
    if (ctype.k === 'int') {
      const overflow = ctx.machine.checkIntResult(coerced);
      if (overflow) halt(overflow, node);
    }
    ctx.machine.writeValue(address, ctype, coerced);
    ctx.machine.markInitialised(address, size);
    return coerced;
  }

  // --- rvalues -------------------------------------------------------------

  function evaluate(node, ctx) {
    switch (node.kind) {
      case 'num':
        return { value: node.value, ctype: { k: node.ctype } };
      case 'charlit':
        return { value: node.value, ctype: { k: 'char' } };
      case 'str':
        return { value: internString(node.value, ctx), ctype: { k: 'ptr', to: { k: 'char' } } };
      case 'ident': case 'index': case 'member': {
        const place = evaluateLValue(node, ctx);
        return loadFrom(place.address, place.ctype, ctx, node);
      }
      case 'unary': return unary(node, ctx);
      case 'postfix': return postfix(node, ctx);
      case 'binary': return binary(node, ctx);
      case 'assign': return assign(node, ctx);
      case 'cond': {
        const test = decay(evaluate(node.test, ctx));
        return decay(evaluate(test.value ? node.then : node.otherwise, ctx));
      }
      case 'cast': return cast(node, ctx);
      case 'sizeofType':
        return { value: sizeOf(node.ctype, ctx), ctype: { k: 'int' } };
      case 'sizeofExpr': {
        const inner = evaluateLValue2(node.operand, ctx);
        return { value: sizeOf(inner.ctype, ctx), ctype: { k: 'int' } };
      }
      case 'call': return ctx.callExpression(node, ctx); // installed by Task 11
      default:
        semantic('cannot-evaluate', 'cannot evaluate this expression',
          'Trace does not know how to evaluate this.', node);
        return null;
    }
  }

  /** sizeof(expr) must not evaluate its operand, only learn its type. */
  function evaluateLValue2(node, ctx) {
    if (node.kind === 'ident' || node.kind === 'index' || node.kind === 'member') {
      return evaluateLValue(node, ctx);
    }
    return { address: 0, ctype: evaluate(node, ctx).ctype };
  }

  function unary(node, ctx) {
    if (node.op === '&') {
      const place = evaluateLValue(node.operand, ctx);
      return { value: place.address, ctype: { k: 'ptr', to: place.ctype } };
    }
    if (node.op === '*') {
      const place = evaluateLValue(node, ctx);
      return loadFrom(place.address, place.ctype, ctx, node);
    }
    if (node.op === '++' || node.op === '--') {
      const place = evaluateLValue(node.operand, ctx);
      const current = loadFrom(place.address, place.ctype, ctx, node);
      const stride = isPointerish(place.ctype) ? sizeOf(pointee(place.ctype), ctx) : 1;
      const updated = current.value + (node.op === '++' ? stride : -stride);
      storeTo(place.address, place.ctype, updated, ctx, node);
      return { value: updated, ctype: place.ctype };
    }
    const operand = decay(evaluate(node.operand, ctx));
    switch (node.op) {
      case '-': return checkedInt(-operand.value, operand.ctype, ctx, node);
      case '+': return operand;
      case '!': return { value: operand.value ? 0 : 1, ctype: { k: 'int' } };
      case '~': return { value: ~operand.value, ctype: { k: 'int' } };
      default:
        semantic('cannot-evaluate', 'unsupported unary operator ' + node.op,
          'Trace does not support this operator.', node);
        return null;
    }
  }

  function postfix(node, ctx) {
    const place = evaluateLValue(node.operand, ctx);
    const current = loadFrom(place.address, place.ctype, ctx, node);
    const stride = isPointerish(place.ctype) ? sizeOf(pointee(place.ctype), ctx) : 1;
    const updated = current.value + (node.op === '++' ? stride : -stride);
    storeTo(place.address, place.ctype, updated, ctx, node);
    return { value: current.value, ctype: place.ctype }; // the OLD value
  }

  function checkedInt(value, ctype, ctx, node) {
    if (ctype.k === 'double') return { value: value, ctype: ctype };
    const problem = ctx.machine.checkIntResult(value);
    if (problem) halt(problem, node);
    return { value: value, ctype: { k: 'int' } };
  }

  function binary(node, ctx) {
    // Short-circuit before evaluating the right side at all.
    if (node.op === '&&' || node.op === '||') {
      const left = decay(evaluate(node.left, ctx)).value;
      if (node.op === '&&' && !left) return { value: 0, ctype: { k: 'int' } };
      if (node.op === '||' && left) return { value: 1, ctype: { k: 'int' } };
      const right = decay(evaluate(node.right, ctx)).value;
      return { value: right ? 1 : 0, ctype: { k: 'int' } };
    }

    const left = decay(evaluate(node.left, ctx));
    const right = decay(evaluate(node.right, ctx));

    // Pointer arithmetic scales by the pointee size. This is where `p + 1`
    // moving four bytes comes from, and it is worth being explicit about.
    if ((node.op === '+' || node.op === '-') && isPointerish(left.ctype)
      && !isPointerish(right.ctype)) {
      const stride = sizeOf(pointee(left.ctype), ctx);
      const offset = right.value * stride;
      return { value: node.op === '+' ? left.value + offset : left.value - offset,
        ctype: left.ctype };
    }
    if (node.op === '-' && isPointerish(left.ctype) && isPointerish(right.ctype)) {
      const stride = sizeOf(pointee(left.ctype), ctx);
      return { value: Math.trunc((left.value - right.value) / stride), ctype: { k: 'int' } };
    }

    const resultType = usualConversion(left, right);
    const a = left.value;
    const b = right.value;

    switch (node.op) {
      case '+': return checkedInt(a + b, resultType, ctx, node);
      case '-': return checkedInt(a - b, resultType, ctx, node);
      case '*': return checkedInt(a * b, resultType, ctx, node);
      case '/': {
        const problem = ctx.machine.checkDivide(b);
        if (problem) halt(problem, node);
        const value = resultType.k === 'double' ? a / b : Math.trunc(a / b);
        return checkedInt(value, resultType, ctx, node);
      }
      case '%': {
        const problem = ctx.machine.checkDivide(b);
        if (problem) halt(problem, node);
        return checkedInt(a % b, { k: 'int' }, ctx, node);
      }
      case '<': return { value: a < b ? 1 : 0, ctype: { k: 'int' } };
      case '<=': return { value: a <= b ? 1 : 0, ctype: { k: 'int' } };
      case '>': return { value: a > b ? 1 : 0, ctype: { k: 'int' } };
      case '>=': return { value: a >= b ? 1 : 0, ctype: { k: 'int' } };
      case '==': return { value: a === b ? 1 : 0, ctype: { k: 'int' } };
      case '!=': return { value: a !== b ? 1 : 0, ctype: { k: 'int' } };
      case '&': return { value: a & b, ctype: { k: 'int' } };
      case '|': return { value: a | b, ctype: { k: 'int' } };
      case '^': return { value: a ^ b, ctype: { k: 'int' } };
      case '<<': return checkedInt(a << b, { k: 'int' }, ctx, node);
      case '>>': return { value: a >> b, ctype: { k: 'int' } };
      default:
        semantic('cannot-evaluate', 'unsupported operator ' + node.op,
          'Trace does not support this operator.', node);
        return null;
    }
  }

  function assign(node, ctx) {
    const place = evaluateLValue(node.target, ctx);
    let value;
    if (node.op === '=') {
      value = decay(evaluate(node.value, ctx)).value;
    } else {
      const current = loadFrom(place.address, place.ctype, ctx, node);
      const operator = node.op.slice(0, -1);
      value = binary({
        kind: 'binary', op: operator,
        left: { kind: 'literalValue', value: current.value, ctype: current.ctype },
        right: node.value,
        line: node.line, col: node.col,
      }, ctx).value;
    }
    const stored = storeTo(place.address, place.ctype, value, ctx, node);
    return { value: stored, ctype: place.ctype };
  }

  function cast(node, ctx) {
    const inner = decay(evaluate(node.operand, ctx));
    if (node.ctype.k === 'int' || node.ctype.k === 'char') {
      return { value: Math.trunc(inner.value), ctype: node.ctype };
    }
    if (node.ctype.k === 'double') {
      return { value: Number(inner.value), ctype: node.ctype };
    }
    return { value: inner.value, ctype: node.ctype };
  }

  /**
   * String literals live in the globals region and are pooled, so two
   * occurrences of the same literal share one address, as they typically do in
   * a real program.
   */
  function internString(text, ctx) {
    if (!ctx.stringPool) ctx.stringPool = new Map();
    if (ctx.stringPool.has(text)) return ctx.stringPool.get(text);
    const bytes = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    const obj = ctx.machine.declareGlobal({
      name: null,
      ctype: { k: 'array', of: { k: 'char' }, length: bytes.length },
    });
    ctx.machine.writeBytes(obj.address, bytes);
    ctx.machine.markInitialised(obj.address, bytes.length);
    ctx.stringPool.set(text, obj.address);
    return obj.address;
  }

  return {
    TraceHalt, createContext, evaluate, evaluateLValue,
    loadFrom, storeTo, decay, halt, semantic, sizeOf,
    isArithmetic, isPointerish, pointee, internString,
  };
});
```

Add a `literalValue` case to `evaluate` returning `{value: node.value, ctype:
node.ctype}`; it exists only so compound assignment can reuse `binary` without
re-reading the target.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-interp-expr.test.js`
Expected: PASS, 22 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-interp.js test/trace-interp-expr.test.js
git commit -m "Add Trace expression evaluation"
```

---

## Amendment to Task 9: evaluation must be a generator

**Apply this as part of Task 9. Do not implement Task 9 as written above without
it.**

Task 9 states that expressions "evaluate recursively and atomically" and that
"nothing inside an expression ever needs to pause." That is wrong, and the error
only becomes visible at Task 11.

An expression can contain a **function call**, and the callee is made of
statements. If evaluation cannot pause, a call must run to completion inside one
step — which means a learner never sees a frame pushed, never watches parameters
arrive, and never steps through a function they wrote. Watching the stack is
most of why this feature exists, so atomic evaluation is not an option.

### The change

`evaluate`, `evaluateLValue`, `unary`, `postfix`, `binary`, `assign` and `cast`
all become generator functions, and every call to them becomes `yield*`:

```js
function* evaluate(node, ctx) { ... }
function* evaluateLValue(node, ctx) { ... }

// at every call site, without exception:
const left = decay(yield* evaluate(node.left, ctx));
const place = yield* evaluateLValue(node.target, ctx);
```

`decay`, `loadFrom`, `storeTo`, `checkedInt`, `internString`, `lookup` and
`sizeOf` stay ordinary functions: none of them evaluates a subexpression, so
none of them can encounter a call.

**These generators yield nothing of their own.** The only `yield` in the whole
expression path is the one inside a function call, in Task 11, at the callee's
statement boundaries. So a call-free expression still completes inside a single
step, exactly as intended — the generator machinery costs a little syntax and
buys the ability to suspend precisely where a call happens.

### Test helper change

Task 9's `evalExpr` helper must drive the generator to completion. Replace it
with:

```js
/** Drive an expression generator to its result. A call-free expression
 *  finishes on the first next(); anything that yields here is a bug in the
 *  test, since these expressions contain no calls. */
function evalExpr(source, ctx) {
  const Lex = require('../src/renderer/js/trace-lex.js');
  const tokens = Lex.tokenize(source).tokens;
  const parsed = Parse.parseExpression(tokens, 0);
  assert.deepStrictEqual(parsed.errors, [], 'parse errors in ' + source);
  const iterator = I.evaluate(parsed.node, ctx);
  const first = iterator.next();
  assert.ok(first.done, 'a call-free expression must not yield');
  return first.value.value;
}
```

`halts` needs the same treatment: wrap the two lines that build and drain the
iterator in the existing `try`.

Add one test, which is the reason for the whole amendment:

```js
test('a call-free expression completes in a single next()', () => {
  const Lex = require('../src/renderer/js/trace-lex.js');
  const ctx = contextWith([['a', INT, 2], ['b', INT, 3]]);
  const parsed = Parse.parseExpression(Lex.tokenize('a * b + 1').tokens, 0);
  assert.strictEqual(I.evaluate(parsed.node, ctx).next().done, true);
});
```

Expected test count for Task 9 becomes **23**.

---

## Task 10: Executing statements

**Files:**
- Modify: `src/renderer/js/trace-interp.js`
- Test: `test/trace-interp-stmt.test.js`

**Interfaces:**
- Consumes: Task 9 as amended
- Produces:
  - `execute(node, ctx)` (generator; returns a `Completion`)
  - `Completion = {flow: 'normal'|'break'|'continue'|'return', value?: number}`
  - `pushScope(ctx)`, `popScope(ctx)`

A generator **returns** its completion and **yields** at statement boundaries.
`yield*` propagates both, so `break` inside a nested `if` inside a `while` needs
no bookkeeping: the `if` returns `{flow:'break'}`, the block passes it up, and
the loop acts on it. This is the payoff for choosing generators.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Parse = require('../src/renderer/js/trace-parse.js');
const M = require('../src/renderer/js/trace-machine.js');
const I = require('../src/renderer/js/trace-interp.js');

/** Run a function body's statements, counting steps. Returns {steps, ctx}. */
function run(bodySource, options) {
  const source = 'int main(void) {' + bodySource + '}';
  const parsed = Parse.parseProgram(source);
  assert.deepStrictEqual(parsed.errors, [], 'parse errors: ' + source);

  const machine = M.createMachine();
  const ctx = I.createContext({ ast: parsed.ast, machine: machine });
  I.prepareProgram(ctx);
  machine.pushFrame('main');
  I.pushScope(ctx);

  const body = parsed.ast.body.find((n) => n.kind === 'func').body;
  const iterator = I.execute(body, ctx);
  let steps = 0;
  const limit = (options && options.limit) || 10000;
  let result = iterator.next();
  while (!result.done) {
    steps += 1;
    if (steps > limit) throw new Error('did not terminate within ' + limit + ' steps');
    result = iterator.next();
  }
  return { steps: steps, ctx: ctx, completion: result.value };
}

function valueOf(ctx, name) {
  for (let i = ctx.scopes.length - 1; i >= 0; i -= 1) {
    const entry = ctx.scopes[i].get(name);
    if (entry) return ctx.machine.readValue(entry.address, entry.ctype);
  }
  const global = ctx.globals.get(name);
  return global ? ctx.machine.readValue(global.address, global.ctype) : undefined;
}

test('a declaration creates a variable and an initialiser fills it', () => {
  const { ctx } = run('int x = 5;');
  assert.strictEqual(valueOf(ctx, 'x'), 5);
});

test('a declaration without an initialiser leaves the variable uninitialised', () => {
  const { ctx } = run('int x;');
  const entry = ctx.scopes[ctx.scopes.length - 1].get('x');
  assert.strictEqual(ctx.machine.isInitialised(entry.address, 4), false);
});

test('several statements run in order', () => {
  const { ctx } = run('int x = 1; x = x + 1; x = x * 10;');
  assert.strictEqual(valueOf(ctx, 'x'), 20);
});

test('each statement is one step', () => {
  const { steps } = run('int x = 1; x = 2; x = 3;');
  assert.strictEqual(steps, 3, 'three statements, three steps');
});

test('if runs only the taken branch', () => {
  assert.strictEqual(valueOf(run('int x = 0; if (1) x = 1; else x = 2;').ctx, 'x'), 1);
  assert.strictEqual(valueOf(run('int x = 0; if (0) x = 1; else x = 2;').ctx, 'x'), 2);
});

test('if without else and a false test does nothing', () => {
  assert.strictEqual(valueOf(run('int x = 7; if (0) x = 1;').ctx, 'x'), 7);
});

test('a block introduces a scope that ends with it', () => {
  const { ctx } = run('int x = 1; { int y = 2; x = y; }');
  assert.strictEqual(valueOf(ctx, 'x'), 2);
  assert.strictEqual(valueOf(ctx, 'y'), undefined, 'y is gone with its block');
});

test('an inner declaration shadows an outer one', () => {
  const { ctx } = run('int x = 1; { int x = 2; } ');
  assert.strictEqual(valueOf(ctx, 'x'), 1, 'the outer x is untouched');
});

test('while loops until its test fails', () => {
  const { ctx } = run('int i = 0; int n = 0; while (i < 5) { n = n + i; i = i + 1; }');
  assert.strictEqual(valueOf(ctx, 'i'), 5);
  assert.strictEqual(valueOf(ctx, 'n'), 10);
});

test('a while whose test is false at once never runs its body', () => {
  const { ctx } = run('int x = 0; while (0) { x = 1; }');
  assert.strictEqual(valueOf(ctx, 'x'), 0);
});

test('do-while always runs its body once', () => {
  const { ctx } = run('int x = 0; do { x = x + 1; } while (0);');
  assert.strictEqual(valueOf(ctx, 'x'), 1);
});

test('for runs init once, then test, body and update', () => {
  const { ctx } = run('int total = 0; for (int i = 1; i <= 4; i++) { total = total + i; }');
  assert.strictEqual(valueOf(ctx, 'total'), 10);
});

test('a for-loop variable does not escape the loop', () => {
  const { ctx } = run('int total = 0; for (int i = 0; i < 2; i++) { total++; }');
  assert.strictEqual(valueOf(ctx, 'i'), undefined);
});

test('break leaves the nearest enclosing loop', () => {
  const { ctx } = run('int i = 0; while (1) { i = i + 1; if (i == 3) break; }');
  assert.strictEqual(valueOf(ctx, 'i'), 3);
});

test('continue skips to the next iteration, and for still runs its update', () => {
  const { ctx } = run(
    'int n = 0; for (int i = 0; i < 5; i++) { if (i == 2) continue; n = n + 1; }');
  assert.strictEqual(valueOf(ctx, 'n'), 4);
});

test('break inside nested loops leaves only the inner one', () => {
  const { ctx } = run(
    'int n = 0; for (int i = 0; i < 3; i++) { for (int j = 0; j < 3; j++) '
    + '{ if (j == 1) break; n = n + 1; } }');
  assert.strictEqual(valueOf(ctx, 'n'), 3, 'one inner iteration per outer pass');
});

test('switch runs the matching case and falls through until break', () => {
  const body = 'int x = 0; switch (2) { case 1: x = 10; break; case 2: x = 20; '
    + 'case 3: x = x + 3; break; default: x = 99; }';
  assert.strictEqual(valueOf(run(body).ctx, 'x'), 23, '20 then fell through to +3');
});

test('switch runs default when nothing matches', () => {
  const body = 'int x = 0; switch (9) { case 1: x = 1; break; default: x = 99; }';
  assert.strictEqual(valueOf(run(body).ctx, 'x'), 99);
});

test('return produces a return completion carrying its value', () => {
  const { completion } = run('return 42;');
  assert.strictEqual(completion.flow, 'return');
  assert.strictEqual(completion.value, 42);
});

test('return leaves the function immediately', () => {
  const { ctx } = run('int x = 1; return 0; x = 999;');
  assert.strictEqual(valueOf(ctx, 'x'), 1, 'the statement after return never ran');
});

test('an array initialiser list fills the elements', () => {
  const { ctx } = run('int a[3] = {7, 8, 9}; int x = a[1];');
  assert.strictEqual(valueOf(ctx, 'x'), 8);
});

test('a string initialiser copies the bytes and the terminator', () => {
  const { ctx } = run('char s[3] = "hi"; int a = s[0]; int b = s[2];');
  assert.strictEqual(valueOf(ctx, 'a'), 104);
  assert.strictEqual(valueOf(ctx, 'b'), 0, 'the terminating zero is written');
});

test('a loop that never ends is bounded by the caller, not by the interpreter', () => {
  assert.throws(() => run('while (1) { int x = 1; }', { limit: 500 }),
    /did not terminate/, 'the driver stops it; the interpreter itself just keeps yielding');
});

test('every iteration of a loop is at least one step', () => {
  const { steps } = run('for (int i = 0; i < 10; i++) { int x = i; }');
  assert.ok(steps >= 10, 'got ' + steps);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-interp-stmt.test.js`
Expected: FAIL with `I.execute is not a function`

- [ ] **Step 3: Write the implementation**

```js
  const NORMAL = { flow: 'normal' };

  function pushScope(ctx) {
    ctx.scopes.push(new Map());
  }
  function popScope(ctx) {
    ctx.scopes.pop();
  }

  /**
   * Executes one statement. Yields once before doing its work, so the driver
   * can show the line about to run; nested statements yield in turn through
   * `yield*`. Returns a Completion, which `yield*` also propagates, so break,
   * continue and return need no side channel.
   */
  function* execute(node, ctx) {
    switch (node.kind) {
      case 'block': {
        pushScope(ctx);
        try {
          for (const statement of node.body) {
            const completion = yield* execute(statement, ctx);
            if (completion.flow !== 'normal') return completion;
          }
        } finally {
          popScope(ctx); // finally, so a halt still tears the scope down
        }
        return NORMAL;
      }

      case 'empty':
        return NORMAL;

      case 'exprStmt':
        yield node;
        ctx.machine.beginStep();
        try {
          yield* evaluate(node.expr, ctx);
        } finally {
          ctx.machine.endStep();
        }
        return NORMAL;

      case 'declStmt':
        yield node;
        ctx.machine.beginStep();
        try {
          for (const decl of node.decls) yield* declare(decl, ctx, node);
        } finally {
          ctx.machine.endStep();
        }
        return NORMAL;

      case 'if': {
        yield node;
        ctx.machine.beginStep();
        let test;
        try {
          test = decay(yield* evaluate(node.test, ctx)).value;
        } finally {
          ctx.machine.endStep();
        }
        if (test) return yield* execute(node.then, ctx);
        if (node.otherwise) return yield* execute(node.otherwise, ctx);
        return NORMAL;
      }

      case 'while': {
        for (;;) {
          yield node;
          ctx.machine.beginStep();
          let test;
          try {
            test = decay(yield* evaluate(node.test, ctx)).value;
          } finally {
            ctx.machine.endStep();
          }
          if (!test) return NORMAL;
          const completion = yield* execute(node.body, ctx);
          if (completion.flow === 'break') return NORMAL;
          if (completion.flow === 'return') return completion;
        }
      }

      case 'do': {
        for (;;) {
          const completion = yield* execute(node.body, ctx);
          if (completion.flow === 'break') return NORMAL;
          if (completion.flow === 'return') return completion;
          yield node;
          ctx.machine.beginStep();
          let test;
          try {
            test = decay(yield* evaluate(node.test, ctx)).value;
          } finally {
            ctx.machine.endStep();
          }
          if (!test) return NORMAL;
        }
      }

      case 'for': {
        // The init declaration belongs to a scope of its own, so `i` does not
        // leak out of the loop.
        pushScope(ctx);
        try {
          if (node.init) {
            const completion = yield* execute(node.init, ctx);
            if (completion.flow === 'return') return completion;
          }
          for (;;) {
            if (node.test) {
              yield node;
              ctx.machine.beginStep();
              let test;
              try {
                test = decay(yield* evaluate(node.test, ctx)).value;
              } finally {
                ctx.machine.endStep();
              }
              if (!test) return NORMAL;
            } else {
              yield node; // `for (;;)` still costs a step per iteration
            }

            const completion = yield* execute(node.body, ctx);
            if (completion.flow === 'break') return NORMAL;
            if (completion.flow === 'return') return completion;

            // `continue` reaches here, which is why the update still runs.
            if (node.update) {
              ctx.machine.beginStep();
              try {
                yield* evaluate(node.update, ctx);
              } finally {
                ctx.machine.endStep();
              }
            }
          }
        } finally {
          popScope(ctx);
        }
      }

      case 'switch': {
        yield node;
        ctx.machine.beginStep();
        let value;
        try {
          value = decay(yield* evaluate(node.disc, ctx)).value;
        } finally {
          ctx.machine.endStep();
        }

        let index = node.cases.findIndex((entry) => {
          if (entry.test === null) return false;
          return constantOf(entry.test, ctx) === value;
        });
        if (index === -1) index = node.cases.findIndex((entry) => entry.test === null);
        if (index === -1) return NORMAL;

        pushScope(ctx);
        try {
          // Fall through from the matched case onward until break.
          for (let i = index; i < node.cases.length; i += 1) {
            for (const statement of node.cases[i].body) {
              const completion = yield* execute(statement, ctx);
              if (completion.flow === 'break') return NORMAL;
              if (completion.flow !== 'normal') return completion;
            }
          }
        } finally {
          popScope(ctx);
        }
        return NORMAL;
      }

      case 'break':
        yield node;
        return { flow: 'break' };

      case 'continue':
        yield node;
        return { flow: 'continue' };

      case 'return': {
        yield node;
        if (!node.value) return { flow: 'return', value: undefined };
        ctx.machine.beginStep();
        try {
          const result = decay(yield* evaluate(node.value, ctx));
          return { flow: 'return', value: result.value };
        } finally {
          ctx.machine.endStep();
        }
      }

      default:
        semantic('cannot-execute', 'cannot execute this statement',
          'Trace does not know how to run this.', node);
        return NORMAL;
    }
  }

  /** A case label must be a constant, so it is read without side effects. */
  function constantOf(node, ctx) {
    if (node.kind === 'num' || node.kind === 'charlit') return node.value;
    if (node.kind === 'ident') {
      const enumValue = ctx.enums && ctx.enums.get(node.name);
      if (enumValue !== undefined) return enumValue;
    }
    semantic('non-constant-case', 'case label must be a constant',
      'A case label has to be a plain number or an enum constant.', node);
    return 0;
  }

  function* declare(decl, ctx, node) {
    const obj = ctx.machine.declareLocal({ name: decl.name, ctype: decl.ctype });
    if (!obj) {
      halt({
        code: 'stack-overflow',
        terse: 'out of stack space',
        plain: 'Every function call adds a frame to the stack, and this program '
          + 'has run out of room. A function calling itself with no stopping '
          + 'condition is the usual cause.',
        locations: [], highlight: [],
      }, node);
    }
    ctx.scopes[ctx.scopes.length - 1].set(decl.name,
      { address: obj.address, ctype: decl.ctype });
    if (decl.init) yield* initialise(obj.address, decl.ctype, decl.init, ctx, node);
  }

  /** Handles scalars, initialiser lists and the string-into-char-array case. */
  function* initialise(address, ctype, init, ctx, node) {
    if (ctype.k === 'array' && init.kind === 'str') {
      const elementSize = sizeOf(ctype.of, ctx);
      for (let i = 0; i < ctype.length; i += 1) {
        const code = i < init.value.length ? init.value.charCodeAt(i) : 0;
        storeTo(address + i * elementSize, ctype.of, code, ctx, node);
      }
      return;
    }
    if (init.kind === 'initList') {
      if (ctype.k === 'array') {
        const elementSize = sizeOf(ctype.of, ctx);
        for (let i = 0; i < init.items.length && i < ctype.length; i += 1) {
          yield* initialise(address + i * elementSize, ctype.of, init.items[i], ctx, node);
        }
        // C zero-fills the remainder of a partially initialised aggregate.
        for (let i = init.items.length; i < ctype.length; i += 1) {
          storeTo(address + i * elementSize, ctype.of, 0, ctx, node);
        }
        return;
      }
      if (ctype.k === 'struct') {
        const layout = ctx.structs[ctype.tag];
        for (let i = 0; i < init.items.length && i < layout.fields.length; i += 1) {
          const field = layout.fields[i];
          yield* initialise(address + field.offset, field.ctype, init.items[i], ctx, node);
        }
        return;
      }
    }
    const value = decay(yield* evaluate(init, ctx)).value;
    storeTo(address, ctype, value, ctx, node);
  }
```

Export `execute`, `pushScope`, `popScope`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-interp-stmt.test.js`
Expected: PASS, 23 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-interp.js test/trace-interp-stmt.test.js
git commit -m "Add Trace statement execution"
```

**On `beginStep`/`endStep` placement.** They wrap only the parts that touch
memory, and always in `try`/`finally`. A check that fires mid-statement throws
`TraceHalt` through the evaluator, and the `finally` closes the journal entry so
that partial step remains undoable. Without it, Step Back across a halted
statement would corrupt the machine.

---

## Task 11: Functions, frames, and the runner

**Files:**
- Modify: `src/renderer/js/trace-interp.js`
- Test: `test/trace-interp-call.test.js`

**Interfaces:**
- Consumes: Tasks 9 (amended) and 10
- Produces:
  - `prepareProgram(ctx): Diagnostic[]` (collects structs, enums, functions, globals)
  - `createRunner({source, stdin?}): Runner`
  - `Runner.errors: Diagnostic[]` (parse and preparation errors; non-empty means the program never starts)
  - `Runner.step(): {done: boolean, line: number|null, diagnostic: Diagnostic|null}`
  - `Runner.undo(): boolean`
  - `Runner.state(): {frames, objects, output, line, stepsAvailable, halted}`
  - `Runner.reset(): void`
  - `MAX_STEPS = 5000000`

`createRunner` is the **entire public surface the UI touches**. Tasks 16 to 18
build the editor and diagram against these six members and nothing else, so the
engine can be reworked later without moving the UI.

This task also delivers check 14 from the spec, the missing `return`, which is
a control-flow fact only the caller can observe.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

/** Run a whole program to completion. */
function runProgram(source, options) {
  const runner = I.createRunner({ source: source, stdin: (options && options.stdin) || '' });
  assert.deepStrictEqual(runner.errors, [], 'errors: ' + JSON.stringify(runner.errors));
  let steps = 0;
  const limit = (options && options.limit) || 100000;
  for (;;) {
    const result = runner.step();
    steps += 1;
    if (result.diagnostic) return { runner: runner, diagnostic: result.diagnostic, steps: steps };
    if (result.done) return { runner: runner, diagnostic: null, steps: steps };
    if (steps > limit) throw new Error('did not terminate');
  }
}

function outputOf(source, options) {
  return runProgram(source, options).runner.state().output.join('');
}

test('a program runs from main and returns its exit value', () => {
  const { runner } = runProgram('int main(void) { return 7; }');
  assert.strictEqual(runner.state().halted, true);
});

test('a called function runs, and its frame appears while it does', () => {
  const source = lines(
    'int twice(int n) { return n * 2; }',
    'int main(void) { int r = twice(21); return r; }'
  );
  const runner = I.createRunner({ source: source });
  assert.deepStrictEqual(runner.errors, []);

  let sawCallee = false;
  for (let i = 0; i < 200; i += 1) {
    const result = runner.step();
    const names = runner.state().frames.map((f) => f.functionName);
    if (names.includes('twice')) sawCallee = true;
    if (result.done || result.diagnostic) break;
  }
  assert.ok(sawCallee, 'the callee must be visible on the stack while it runs');
  assert.strictEqual(runner.state().frames.length, 0, 'and gone once it returns');
});

test('arguments are passed by value', () => {
  const source = lines(
    'void bump(int n) { n = n + 100; }',
    'int main(void) { int x = 1; bump(x); printf("%d", x); return 0; }'
  );
  assert.strictEqual(outputOf(source), '1', 'the caller\'s x is untouched');
});

test('a pointer parameter lets a function change the caller\'s variable', () => {
  const source = lines(
    'void bump(int *n) { *n = *n + 100; }',
    'int main(void) { int x = 1; bump(&x); printf("%d", x); return 0; }'
  );
  assert.strictEqual(outputOf(source), '101');
});

test('recursion works and unwinds', () => {
  const source = lines(
    'int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }',
    'int main(void) { printf("%d", fact(5)); return 0; }'
  );
  assert.strictEqual(outputOf(source), '120');
});

test('a locals frame is torn down when its function returns', () => {
  const source = lines(
    'int helper(void) { int secret = 5; return secret; }',
    'int main(void) { int a = helper(); int b = helper(); return a + b; }'
  );
  const { runner } = runProgram(source);
  assert.strictEqual(runner.state().frames.length, 0);
});

test('14. falling off the end of a non-void function is caught', () => {
  const source = lines(
    'int broken(int n) { if (n > 0) return 1; }',
    'int main(void) { return broken(-1); }'
  );
  const { diagnostic } = runProgram(source);
  assert.strictEqual(diagnostic.code, 'missing-return');
  assert.ok(diagnostic.plain.includes('broken'));
});

test('a void function may end without a return', () => {
  const source = lines(
    'void nothing(void) { int x = 1; }',
    'int main(void) { nothing(); return 0; }'
  );
  assert.strictEqual(runProgram(source).diagnostic, null);
});

test('calling with the wrong number of arguments is a clear diagnostic', () => {
  const source = lines(
    'int add(int a, int b) { return a + b; }',
    'int main(void) { return add(1); }'
  );
  const { diagnostic } = runProgram(source);
  assert.strictEqual(diagnostic.code, 'argument-count');
  assert.ok(/2/.test(diagnostic.plain) && /1/.test(diagnostic.plain));
});

test('calling a function that does not exist names it', () => {
  const { diagnostic } = runProgram('int main(void) { return nope(1); }');
  assert.strictEqual(diagnostic.code, 'undeclared-function');
  assert.ok(diagnostic.plain.includes('nope'));
});

test('runaway recursion reports stack overflow rather than crashing', () => {
  const source = lines(
    'int forever(int n) { return forever(n + 1); }',
    'int main(void) { return forever(0); }'
  );
  const { diagnostic } = runProgram(source, { limit: 100000 });
  assert.strictEqual(diagnostic.code, 'stack-overflow');
  assert.ok(diagnostic.plain.length > 20);
});

test('an infinite loop stops at the step cap with a teaching message', () => {
  const runner = I.createRunner({ source: 'int main(void) { while (1) { int x = 1; } }' });
  let last = null;
  for (let i = 0; i < I.MAX_STEPS + 10; i += 1) {
    last = runner.step();
    if (last.diagnostic || last.done) break;
  }
  assert.ok(last.diagnostic, 'the cap must produce a diagnostic');
  assert.strictEqual(last.diagnostic.code, 'step-limit');
});

test('globals are visible in every function', () => {
  const source = lines(
    'int counter = 10;',
    'void bump(void) { counter = counter + 1; }',
    'int main(void) { bump(); bump(); printf("%d", counter); return 0; }'
  );
  assert.strictEqual(outputOf(source), '12');
});

test('a global without an initialiser starts at zero, unlike a local', () => {
  const source = lines('int g;', 'int main(void) { printf("%d", g); return 0; }');
  assert.strictEqual(outputOf(source), '0');
});

test('struct definitions are laid out before the program runs', () => {
  const source = lines(
    'struct P { int x; int y; };',
    'int main(void) { struct P p; p.x = 3; p.y = 4; printf("%d", p.x + p.y); return 0; }'
  );
  assert.strictEqual(outputOf(source), '7');
});

test('enum constants are usable as values', () => {
  const source = lines(
    'enum Colour { RED, GREEN, BLUE };',
    'int main(void) { printf("%d", GREEN); return 0; }'
  );
  assert.strictEqual(outputOf(source), '1');
});

test('9. a leak is reported when the program ends', () => {
  const source = 'int main(void) { int *p = malloc(40); return 0; }';
  const { diagnostic } = runProgram(source);
  assert.strictEqual(diagnostic.code, 'memory-leak');
  assert.ok(/40/.test(diagnostic.plain));
});

test('step reports the line it is about to run', () => {
  const source = lines('int main(void) {', '  int x = 1;', '  int y = 2;', '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  const first = runner.step();
  assert.strictEqual(first.line, 2, 'the first executable line');
});

test('undo walks execution backwards', () => {
  const source = lines('int main(void) {', '  int x = 1;', '  x = 99;', '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  runner.step();
  runner.step();
  const after = JSON.stringify(runner.state().objects.map((o) => o.address));
  assert.strictEqual(runner.undo(), true);
  assert.ok(runner.state().stepsAvailable >= 0);
  assert.ok(after.length > 0);
});

test('reset returns a runner to its starting state', () => {
  const source = 'int main(void) { int x = 1; return 0; }';
  const runner = I.createRunner({ source: source });
  runner.step();
  runner.step();
  runner.reset();
  const state = runner.state();
  assert.strictEqual(state.frames.length, 0);
  assert.deepStrictEqual(state.output, []);
  assert.strictEqual(state.halted, false);
});

test('a program with errors never starts', () => {
  const runner = I.createRunner({ source: 'int main(void) { return }' });
  assert.ok(runner.errors.length > 0);
  assert.strictEqual(runner.step().done, true, 'stepping a broken program does nothing');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-interp-call.test.js`
Expected: FAIL with `I.createRunner is not a function`

- [ ] **Step 3: Write the implementation**

```js
  const MAX_STEPS = 5000000;

  /**
   * Walks the top level once, before anything runs: lay out structs, record
   * enum constants, index functions by name, and create globals. Doing this in
   * one pass is what lets a function call one defined later in the file.
   */
  function prepareProgram(ctx) {
    const errors = [];
    ctx.enums = new Map();

    for (const node of ctx.ast.body) {
      if (node.kind === 'structDef') {
        ctx.structs[node.tag] = Machine.structLayout(node.members, ctx.structs);
      }
    }
    ctx.machine.setStructs(ctx.structs);

    for (const node of ctx.ast.body) {
      if (node.kind === 'enumDef') {
        for (const entry of node.values) ctx.enums.set(entry.name, entry.value);
      }
    }

    for (const node of ctx.ast.body) {
      if (node.kind !== 'func') continue;
      if (ctx.functions[node.name]) {
        errors.push({
          code: 'duplicate-function',
          terse: "'" + node.name + "' is defined more than once",
          plain: 'Each function needs its own name. Rename one of them.',
          locations: [{ line: node.line, col: node.col, length: 1 }],
          highlight: [],
        });
      }
      ctx.functions[node.name] = node;
    }

    // Globals are zero-initialised, which is a real and teachable difference
    // from locals: a global you forget to set is 0, a local is whatever was
    // there.
    ctx.machine.beginStep();
    for (const node of ctx.ast.body) {
      if (node.kind !== 'globalDecl') continue;
      for (const decl of node.decls) {
        const obj = ctx.machine.declareGlobal({ name: decl.name, ctype: decl.ctype });
        ctx.globals.set(decl.name, { address: obj.address, ctype: decl.ctype });
        ctx.machine.writeBytes(obj.address, new Uint8Array(obj.size));
        ctx.machine.markInitialised(obj.address, obj.size);
        if (decl.init) {
          const iterator = initialise(obj.address, decl.ctype, decl.init, ctx, node);
          let result = iterator.next();
          while (!result.done) result = iterator.next();
        }
      }
    }
    ctx.machine.endStep();

    return errors;
  }

  /** Installed on the context so `evaluate` can reach it without a cycle. */
  function* callExpression(node, ctx) {
    if (node.callee.kind !== 'ident') {
      semantic('not-callable', 'this is not a function',
        'Only a function name can be called.', node);
    }
    const name = node.callee.name;

    const builtin = ctx.builtins && ctx.builtins[name];
    if (builtin) {
      const args = [];
      for (const argument of node.args) args.push(decay(yield* evaluate(argument, ctx)));
      return builtin(args, ctx, node);
    }

    const fn = ctx.functions[name];
    if (!fn) {
      semantic('undeclared-function',
        "'" + name + "' was not declared",
        'Trace has not seen a function called ' + name + '. Check the spelling, '
          + 'and that it is defined somewhere in this file.',
        node);
    }
    if (node.args.length !== fn.params.length) {
      semantic('argument-count',
        name + ' takes ' + fn.params.length + ' argument(s), got ' + node.args.length,
        name + ' is defined to take ' + fn.params.length + ' argument(s), but '
          + 'this call passes ' + node.args.length + '.',
        node);
    }

    // Arguments are evaluated in the caller's frame, before the callee's frame
    // exists. Getting this order wrong is how `f(x)` ends up seeing the
    // callee's uninitialised x instead of the caller's.
    const args = [];
    for (const argument of node.args) args.push(decay(yield* evaluate(argument, ctx)));

    return yield* callFunction(fn, args, ctx, node);
  }

  function* callFunction(fn, args, ctx, node) {
    const frameId = ctx.machine.pushFrame(fn.name);
    if (frameId === null) {
      halt({
        code: 'stack-overflow',
        terse: 'too many nested function calls',
        plain: 'Each call adds a frame to the stack and this program has '
          + 'reached the limit of ' + ctx.machine.MAX_FRAMES + '. A function '
          + 'that calls itself without a stopping condition is the usual cause.',
        locations: [], highlight: [],
      }, node);
    }

    const savedScopes = ctx.scopes;
    ctx.scopes = [new Map()]; // a function cannot see its caller's locals

    try {
      ctx.machine.beginStep();
      try {
        for (let i = 0; i < fn.params.length; i += 1) {
          const param = fn.params[i];
          const obj = ctx.machine.declareLocal({ name: param.name, ctype: param.ctype });
          ctx.scopes[0].set(param.name, { address: obj.address, ctype: param.ctype });
          storeTo(obj.address, param.ctype, args[i].value, ctx, node);
        }
      } finally {
        ctx.machine.endStep();
      }

      const completion = yield* execute(fn.body, ctx);

      if (completion.flow !== 'return' && fn.returnType.k !== 'void') {
        halt({
          code: 'missing-return',
          terse: "control reaches the end of non-void function '" + fn.name + "'",
          plain: fn.name + ' says it returns a value, but this path through it '
            + 'ends without a return. The caller would receive whatever happened '
            + 'to be lying around.',
          locations: [{ line: fn.line, col: fn.col, length: 1 }],
          highlight: [],
        }, node);
      }

      const value = completion.flow === 'return' ? completion.value : 0;
      return { value: value === undefined ? 0 : value, ctype: fn.returnType };
    } finally {
      ctx.scopes = savedScopes;
      ctx.machine.beginStep();
      try {
        ctx.machine.popFrame();
      } finally {
        ctx.machine.endStep();
      }
    }
  }

  // --- the runner ----------------------------------------------------------

  function createRunner(options) {
    const Parse = (typeof module === 'object' && module.exports)
      ? require('./trace-parse.js')
      : (typeof self !== 'undefined' ? self : this).TraceParse;
    const Stdlib = (typeof module === 'object' && module.exports)
      ? require('./trace-stdlib.js')
      : (typeof self !== 'undefined' ? self : this).TraceStdlib;

    const source = String(options.source || '');
    const stdinText = String(options.stdin || '');

    let ctx = null;
    let iterator = null;
    let errors = [];
    let halted = false;
    let currentLine = null;
    let stepCount = 0;

    function start() {
      const parsed = Parse.parseProgram(source);
      const machine = Machine.createMachine();
      ctx = createContext({ ast: parsed.ast, machine: machine });
      ctx.stdin = { text: stdinText, position: 0 };
      ctx.callExpression = callExpression;
      ctx.builtins = Stdlib.createBuiltins();

      errors = parsed.errors.concat(parsed.errors.length ? [] : prepareProgram(ctx));
      halted = errors.length > 0;
      currentLine = null;
      stepCount = 0;
      iterator = errors.length ? null : driver();
    }

    /** The outermost generator: call main, then check for leaks. */
    function* driver() {
      const main = ctx.functions.main;
      const result = yield* callFunction(main, [], ctx, main);
      const leak = ctx.machine.checkLeaks();
      if (leak) halt(leak, main);
      return result;
    }

    function step() {
      if (halted || !iterator) return { done: true, line: currentLine, diagnostic: null };

      stepCount += 1;
      if (stepCount > MAX_STEPS) {
        halted = true;
        return {
          done: true, line: currentLine,
          diagnostic: {
            code: 'step-limit',
            terse: 'program did not finish',
            plain: 'This program has run ' + MAX_STEPS + ' steps without '
              + 'finishing, so it may never finish. Look at the loop on this '
              + 'line and check that something changes the value its condition '
              + 'tests.',
            locations: currentLine ? [{ line: currentLine, col: 1, length: 1 }] : [],
            highlight: [],
          },
        };
      }

      try {
        const result = iterator.next();
        if (result.done) {
          halted = true;
          return { done: true, line: currentLine, diagnostic: null };
        }
        currentLine = result.value && result.value.line ? result.value.line : currentLine;
        return { done: false, line: currentLine, diagnostic: null };
      } catch (error) {
        halted = true;
        if (error instanceof TraceHalt) {
          const diagnostic = error.diagnostic;
          if (diagnostic.locations.length === 0 && currentLine) {
            diagnostic.locations = [{ line: currentLine, col: 1, length: 1 }];
          }
          return { done: true, line: currentLine, diagnostic: diagnostic };
        }
        // An unexpected internal fault must still surface as a diagnostic
        // rather than a blank pane.
        return {
          done: true, line: currentLine,
          diagnostic: {
            code: 'internal-error',
            terse: 'Trace hit an internal problem',
            plain: 'Something went wrong inside Trace itself, not in your '
              + 'program. Details: ' + String(error && error.message),
            locations: [], highlight: [],
          },
        };
      }
    }

    function undo() {
      if (!ctx) return false;
      // Undoing memory is exact; the generator's position is not recoverable,
      // so undo is offered as state inspection rather than resumed execution.
      // Task 18 disables Step Forward after an undo until Reset or a re-run.
      return ctx.machine.undoStep();
    }

    function state() {
      if (!ctx) return { frames: [], objects: [], output: [], line: null,
        stepsAvailable: 0, halted: true };
      return {
        frames: ctx.machine.frames(),
        objects: ctx.machine.liveObjects(),
        output: ctx.output,
        line: currentLine,
        stepsAvailable: ctx.machine.stepsAvailable(),
        halted: halted,
      };
    }

    start();
    return {
      get errors() { return errors; },
      step, undo, state, reset: start,
    };
  }
```

Export `prepareProgram`, `createRunner`, `callExpression`, `callFunction`,
`MAX_STEPS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-interp-call.test.js`
Expected: PASS, 21 tests. Task 12 must land before the `printf` assertions here
pass; run this task's non-`printf` tests first, then re-run the file after Task
12 and confirm all 21.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-interp.js test/trace-interp-call.test.js
git commit -m "Add Trace function calls, frames and the runner"
```

**An honest limitation, recorded rather than hidden.** `undo()` reverses the
*machine* exactly, but a JavaScript generator cannot be rewound, so execution
cannot resume forward from an undone position. Step Back therefore lets a
learner walk backwards through what happened and inspect it; going forward again
needs Reset and a re-run, which is deterministic and so lands in the same place.
Task 18 makes that explicit in the controls rather than letting Step Forward
appear to work and then behave oddly. Making stepping resumable after an undo
would mean replacing generators with an explicit continuation stack, which is
noted in Deferred.

---

## Amendment to Task 11: Step Back must resume forward

**Apply this as part of Task 11, replacing the `undo` implementation and the
closing note above it.**

Task 11 records that a generator cannot be rewound, so execution cannot continue
forward after an undo, and proposes telling the user to Reset. That is a poor
answer to the exact question this feature exists to serve. A learner steps back
to ask *"wait, what just happened?"* and then wants to step forward again and
watch it more carefully. Making them start over is the wrong behaviour.

**The fix uses a property the design already guarantees.** Execution is
deterministic — a stated goal in the spec, with a property test in Task 7. So
any earlier position can be reached exactly by starting over and replaying. The
generator does not need rewinding; it needs re-creating.

Keep both mechanisms, because they answer different questions:

| Operation | Mechanism | Cost |
| --- | --- | --- |
| Step Back, and inspect | Journal undo (Task 7) | O(1) |
| First Step Forward after any Step Back | Reset and replay to the current index | O(steps so far) |

The journal keeps backward stepping instant, which is what makes holding the
button down feel right. The replay is paid once, on the first forward step after
a rewind, which is a deliberate action a learner takes rarely.

### The change

Track the index and whether the generator has diverged from it:

```js
    let stepIndex = 0;      // how many steps have actually executed
    let rewound = false;    // true when the journal is behind the generator

    function undo() {
      if (!ctx || stepIndex === 0) return false;
      if (!ctx.machine.undoStep()) return false;
      stepIndex -= 1;
      rewound = true;
      halted = false;
      currentLine = lineHistory[stepIndex] || null;
      return true;
    }

    /** Rebuild the machine and run forward to `target`, silently. */
    function replayTo(target) {
      const output = ctx.output.slice(0, outputHistory[target] || 0);
      start();                       // fresh machine, fresh generator
      for (let i = 0; i < target; i += 1) {
        const result = iterator.next();
        if (result.done) break;
        stepIndex = i + 1;
      }
      ctx.output.length = 0;
      Array.prototype.push.apply(ctx.output, output);
      rewound = false;
    }
```

and make `step()` repair the divergence before doing anything else:

```js
      if (rewound) replayTo(stepIndex);
```

`lineHistory` and `outputHistory` are two arrays the runner appends to on every
step: the line that ran, and the length of `ctx.output` at that point. They cost
two numbers per step and let a rewound state show the right line and the right
output without replaying anything.

### Tests to add to Task 11

```js
test('stepping back and then forward again reaches the same state', () => {
  const source = lines('int main(void) {', '  int x = 1;', '  x = 2;', '  x = 3;',
    '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  runner.step(); runner.step(); runner.step();
  const forward = JSON.stringify(runner.state().objects.map((o) => o.address));

  assert.strictEqual(runner.undo(), true);
  assert.strictEqual(runner.step().done, false, 'forward must work after an undo');
  assert.strictEqual(
    JSON.stringify(runner.state().objects.map((o) => o.address)),
    forward,
    'replay must land in exactly the state we left'
  );
});

test('output is not duplicated by a rewind and replay', () => {
  const source = lines('int main(void) {', '  printf("a");', '  printf("b");',
    '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  for (let i = 0; i < 6; i += 1) runner.step();
  runner.undo();
  runner.step();
  const text = runner.state().output.join('');
  assert.strictEqual(text.split('a').length - 1, 1, "'a' must appear once");
});

test('undo at the very start reports there is nothing to undo', () => {
  const runner = I.createRunner({ source: 'int main(void) { return 0; }' });
  assert.strictEqual(runner.undo(), false);
});
```

Task 11's expected test count becomes **24**.

**What this removes from Deferred:** the note about replacing generators with an
explicit continuation stack. It is no longer needed.

---

## Task 12: printf and the output stream

**Files:**
- Create: `src/renderer/js/trace-stdlib.js`
- Test: `test/trace-stdlib-printf.test.js`

**Interfaces:**
- Consumes: `trace-machine.js`, `trace-interp.js` helpers
- Produces:
  - `createBuiltins(): Record<string, (args, ctx, node) => {value, ctype}>`
  - `formatPrintf(template: string, args: Arg[], ctx, node): string`
  - `readCString(address, ctx, node): string`
  - `Arg = {value: number, ctype: Type}`

A builtin receives **already-evaluated, already-decayed** arguments, so it never
touches the AST and stays a plain function rather than a generator.

`readCString` walks memory until a zero byte, checking every byte as it goes. A
string with no terminator therefore produces an out-of-bounds diagnostic naming
the array — which is the single most common beginner C bug, so it is worth
getting right here rather than reading past the end quietly.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

function outputOf(body) {
  const runner = I.createRunner({ source: 'int main(void) {' + NL + body + NL + '}' });
  assert.deepStrictEqual(runner.errors, [], JSON.stringify(runner.errors));
  for (let i = 0; i < 20000; i += 1) {
    const result = runner.step();
    if (result.done) {
      assert.strictEqual(result.diagnostic, null,
        result.diagnostic && result.diagnostic.terse);
      break;
    }
  }
  return runner.state().output.join('');
}

function diagnosticOf(body) {
  const runner = I.createRunner({ source: 'int main(void) {' + NL + body + NL + '}' });
  for (let i = 0; i < 20000; i += 1) {
    const result = runner.step();
    if (result.diagnostic) return result.diagnostic;
    if (result.done) return null;
  }
  return null;
}

test('printf writes plain text', () => {
  assert.strictEqual(outputOf('printf("hello"); return 0;'), 'hello');
});

test('escapes in the template are already decoded by the lexer', () => {
  assert.strictEqual(outputOf('printf("a\\nb"); return 0;'), 'a' + NL + 'b');
});

test('%d prints an integer, including negatives', () => {
  assert.strictEqual(outputOf('printf("%d", 42); return 0;'), '42');
  assert.strictEqual(outputOf('printf("%d", -7); return 0;'), '-7');
});

test('%i is an alias for %d', () => {
  assert.strictEqual(outputOf('printf("%i", 5); return 0;'), '5');
});

test('%c prints one character from its code', () => {
  assert.strictEqual(outputOf('printf("%c", 65); return 0;'), 'A');
  assert.strictEqual(outputOf("printf(\"%c\", 'z'); return 0;"), 'z');
});

test('%s prints a string from memory', () => {
  assert.strictEqual(outputOf('printf("%s", "world"); return 0;'), 'world');
  assert.strictEqual(outputOf('char s[6] = "hello"; printf("%s", s); return 0;'), 'hello');
});

test('%f prints six decimal places by default, as C does', () => {
  assert.strictEqual(outputOf('printf("%f", 1.5); return 0;'), '1.500000');
});

test('%p prints an address', () => {
  const out = outputOf('int x = 1; printf("%p", &x); return 0;');
  assert.ok(out.length > 0);
  assert.ok(/^0x[0-9a-f]+$/.test(out), 'got ' + out);
});

test('%% prints a literal percent sign', () => {
  assert.strictEqual(outputOf('printf("100%%"); return 0;'), '100%');
});

test('several conversions in one call, in order', () => {
  assert.strictEqual(
    outputOf('printf("%d and %s and %c", 1, "two", 51); return 0;'),
    '1 and two and 3'
  );
});

test('width pads on the left, and a minus flag pads on the right', () => {
  assert.strictEqual(outputOf('printf("[%5d]", 42); return 0;'), '[   42]');
  assert.strictEqual(outputOf('printf("[%-5d]", 42); return 0;'), '[42   ]');
});

test('zero padding', () => {
  assert.strictEqual(outputOf('printf("[%05d]", 42); return 0;'), '[00042]');
});

test('precision on a double', () => {
  assert.strictEqual(outputOf('printf("%.2f", 3.14159); return 0;'), '3.14');
  assert.strictEqual(outputOf('printf("%.0f", 2.5); return 0;'), '2');
});

test('puts writes its argument and a newline', () => {
  assert.strictEqual(outputOf('puts("hi"); return 0;'), 'hi' + NL);
});

test('putchar writes one character', () => {
  assert.strictEqual(outputOf('putchar(65); putchar(66); return 0;'), 'AB');
});

test('too few arguments for the conversions is a clear diagnostic', () => {
  const d = diagnosticOf('printf("%d %d", 1); return 0;');
  assert.strictEqual(d.code, 'printf-missing-argument');
  assert.ok(d.plain.length > 20);
});

test('an unknown conversion is named rather than printed raw', () => {
  const d = diagnosticOf('printf("%q", 1); return 0;');
  assert.strictEqual(d.code, 'printf-unknown-conversion');
  assert.ok(d.terse.includes('q'));
});

test('%s on a string with no terminator is caught, not read past', () => {
  const body = lines(
    'char s[2];',
    's[0] = 104;',
    's[1] = 105;',
    'printf("%s", s);',
    'return 0;'
  );
  const d = diagnosticOf(body);
  assert.ok(d, 'expected a diagnostic');
  assert.strictEqual(d.code, 'out-of-bounds-read');
  assert.ok(d.plain.includes('s'), 'name the array that was overrun');
});

test('%s on an uninitialised array is caught', () => {
  const d = diagnosticOf('char s[4]; printf("%s", s); return 0;');
  assert.strictEqual(d.code, 'uninitialised-read');
});

test('output accumulates across calls in order', () => {
  assert.strictEqual(outputOf('printf("a"); printf("b"); printf("c"); return 0;'), 'abc');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-stdlib-printf.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-stdlib.js'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * Trace's built-in library.
 *
 * Every function here receives arguments the evaluator has already computed and
 * decayed, so none of them is a generator and none of them sees the AST.
 *
 * Reads go through the machine's checks exactly as the interpreter's do. A
 * printf("%s") on an unterminated array must produce the same out-of-bounds
 * diagnostic as a hand-written loop would; a library that quietly read past the
 * end would be teaching the wrong lesson.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceStdlib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Interp = (typeof module === 'object' && module.exports)
    ? require('./trace-interp.js')
    : (typeof self !== 'undefined' ? self : this).TraceInterp;

  const INT = { k: 'int' };
  const CHAR = { k: 'char' };
  const VOID = { k: 'void' };

  function fail(code, terse, plain, node) {
    Interp.halt({ code: code, terse: terse, plain: plain, locations: [], highlight: [] },
      node);
  }

  /** Walks to the terminating zero, checking every byte on the way. */
  function readCString(address, ctx, node) {
    let out = '';
    let cursor = address;
    for (let i = 0; i < 65536; i += 1) {
      const problem = ctx.machine.checkRead(cursor, 1);
      if (problem) Interp.halt(problem, node);
      const byte = ctx.machine.readValue(cursor, CHAR) & 0xff;
      if (byte === 0) return out;
      out += String.fromCharCode(byte);
      cursor += 1;
    }
    fail('string-too-long', 'string has no terminator',
      'Trace followed this string for 65536 bytes without finding a zero byte.',
      node);
    return out;
  }

  function pad(text, width, leftAlign, zero) {
    if (!width || text.length >= width) return text;
    const filler = (zero && !leftAlign ? '0' : ' ').repeat(width - text.length);
    if (leftAlign) return text + filler;
    // A zero-padded negative number keeps its sign in front of the zeros.
    if (zero && (text[0] === '-' || text[0] === '+')) {
      return text[0] + filler + text.slice(1);
    }
    return filler + text;
  }

  /**
   * Supports the conversions the spec lists: d i c s f p and %%, with the
   * minus and zero flags, a width, and a precision.
   */
  function formatPrintf(template, args, ctx, node) {
    let out = '';
    let argIndex = 0;
    let i = 0;

    function nextArg(conversion) {
      if (argIndex >= args.length) {
        fail('printf-missing-argument',
          'not enough arguments for the format string',
          'The format string uses %' + conversion + ', but no value was passed '
            + 'for it. Every conversion needs a matching argument.',
          node);
      }
      const value = args[argIndex];
      argIndex += 1;
      return value;
    }

    while (i < template.length) {
      if (template[i] !== '%') {
        out += template[i];
        i += 1;
        continue;
      }
      i += 1;
      if (template[i] === '%') {
        out += '%';
        i += 1;
        continue;
      }

      let leftAlign = false;
      let zero = false;
      while (template[i] === '-' || template[i] === '0' || template[i] === '+') {
        if (template[i] === '-') leftAlign = true;
        if (template[i] === '0') zero = true;
        i += 1;
      }
      let width = 0;
      while (template[i] >= '0' && template[i] <= '9') {
        width = width * 10 + Number(template[i]);
        i += 1;
      }
      let precision = null;
      if (template[i] === '.') {
        i += 1;
        precision = 0;
        while (template[i] >= '0' && template[i] <= '9') {
          precision = precision * 10 + Number(template[i]);
          i += 1;
        }
      }

      const conversion = template[i];
      i += 1;

      switch (conversion) {
        case 'd': case 'i':
          out += pad(String(Math.trunc(nextArg(conversion).value)), width, leftAlign, zero);
          break;
        case 'c':
          out += pad(String.fromCharCode(nextArg('c').value & 0xff), width, leftAlign, false);
          break;
        case 's':
          out += pad(readCString(nextArg('s').value, ctx, node), width, leftAlign, false);
          break;
        case 'f': {
          const places = precision === null ? 6 : precision;
          out += pad(Number(nextArg('f').value).toFixed(places), width, leftAlign, zero);
          break;
        }
        case 'p':
          out += pad('0x' + (nextArg('p').value >>> 0).toString(16), width, leftAlign, false);
          break;
        default:
          fail('printf-unknown-conversion',
            "unknown conversion '%" + (conversion || '') + "'",
            'Trace understands %d, %i, %c, %s, %f, %p and %% in a format '
              + 'string.',
            node);
      }
    }
    return out;
  }

  function createBuiltins() {
    return {
      printf: function (args, ctx, node) {
        if (args.length === 0) {
          fail('printf-missing-argument', 'printf needs a format string',
            'Give printf a string to print, such as printf("hello").', node);
        }
        const template = readCString(args[0].value, ctx, node);
        ctx.output.push(formatPrintf(template, args.slice(1), ctx, node));
        return { value: 0, ctype: INT };
      },

      puts: function (args, ctx, node) {
        const text = readCString(args[0].value, ctx, node);
        ctx.output.push(text + String.fromCharCode(10));
        return { value: 0, ctype: INT };
      },

      putchar: function (args, ctx) {
        ctx.output.push(String.fromCharCode(args[0].value & 0xff));
        return { value: args[0].value, ctype: INT };
      },
    };
  }

  return { createBuiltins, formatPrintf, readCString, INT, CHAR, VOID, fail, pad };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-stdlib-printf.test.js`
Expected: PASS, 20 tests

- [ ] **Step 5: Re-run Task 11's file, now that printf exists**

Run: `node --test test/trace-interp-call.test.js`
Expected: PASS, 24 tests

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/trace-stdlib.js test/trace-stdlib-printf.test.js
git commit -m "Add Trace printf and the output stream"
```

---

## Task 13: The allocator, strings, and input

**Files:**
- Modify: `src/renderer/js/trace-stdlib.js`
- Test: `test/trace-stdlib-lib.test.js`

**Interfaces:**
- Consumes: Task 12
- Produces, added to `createBuiltins()`:
  `malloc`, `calloc`, `realloc`, `free`, `exit`, `abs`, `rand`, `srand`,
  `strlen`, `strcpy`, `strncpy`, `strcmp`, `strcat`, `memset`, `memcpy`,
  `scanf`, `getchar`
- Also produces: `ExitSignal` (class, carries `.code`)

Three rules hold throughout, and each exists to preserve a diagnostic:

1. **Every byte read or written goes through the machine's checks.** `strcpy`
   into a four-byte buffer must produce the same out-of-bounds diagnostic a
   hand-written loop would. This is spec check 13, and it lives here rather than
   as its own code.
2. **`malloc` returns uninitialised memory; `calloc` returns zeroed memory.**
   The difference is real and worth seeing: reading a fresh `malloc` block is
   caught as an uninitialised read, and reading a `calloc` block is not.
3. **`rand` is deterministic.** A fixed seed unless `srand` is called, using a
   small in-module generator rather than `Math.random`, so the same program
   prints the same numbers on every run and on every platform.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

function runBody(body, stdin) {
  const runner = I.createRunner({
    source: 'int main(void) {' + NL + body + NL + '}',
    stdin: stdin || '',
  });
  assert.deepStrictEqual(runner.errors, [], JSON.stringify(runner.errors));
  for (let i = 0; i < 50000; i += 1) {
    const result = runner.step();
    if (result.done) {
      return { output: runner.state().output.join(''), diagnostic: result.diagnostic };
    }
  }
  throw new Error('did not terminate');
}

function outputOf(body, stdin) {
  const result = runBody(body, stdin);
  assert.strictEqual(result.diagnostic, null,
    result.diagnostic && result.diagnostic.terse);
  return result.output;
}

function codeOf(body) {
  const result = runBody(body);
  assert.ok(result.diagnostic, 'expected a diagnostic');
  return result.diagnostic.code;
}

test('malloc returns usable memory', () => {
  assert.strictEqual(
    outputOf('int *p = malloc(4); *p = 7; printf("%d", *p); free(p); return 0;'),
    '7'
  );
});

test('malloc memory starts uninitialised, and reading it is caught', () => {
  assert.strictEqual(
    codeOf('int *p = malloc(4); printf("%d", *p); return 0;'),
    'uninitialised-read'
  );
});

test('calloc memory is zeroed, so reading it is fine', () => {
  assert.strictEqual(
    outputOf('int *p = calloc(2, 4); printf("%d", p[0]); free(p); return 0;'),
    '0'
  );
});

test('an allocation too large for the heap returns NULL', () => {
  assert.strictEqual(
    outputOf('int *p = malloc(2000000); if (p == 0) printf("null"); return 0;'),
    'null'
  );
});

test('realloc keeps the existing contents', () => {
  const body = lines(
    'int *p = malloc(8);',
    'p[0] = 1; p[1] = 2;',
    'p = realloc(p, 16);',
    'printf("%d%d", p[0], p[1]);',
    'free(p);',
    'return 0;'
  );
  assert.strictEqual(outputOf(body), '12');
});

test('use after free is caught', () => {
  assert.strictEqual(
    codeOf('int *p = malloc(4); *p = 1; free(p); printf("%d", *p); return 0;'),
    'use-after-free'
  );
});

test('double free is caught', () => {
  assert.strictEqual(codeOf('int *p = malloc(4); free(p); free(p); return 0;'), 'double-free');
});

test('freeing a local variable is caught', () => {
  assert.strictEqual(codeOf('int x = 1; free(&x); return 0;'), 'free-of-non-heap');
});

test('free(NULL) is allowed and does nothing', () => {
  assert.strictEqual(outputOf('free(0); printf("ok"); return 0;'), 'ok');
});

test('a leak is reported at exit', () => {
  assert.strictEqual(codeOf('int *p = malloc(16); return 0;'), 'memory-leak');
});

test('strlen counts up to the terminator', () => {
  assert.strictEqual(outputOf('printf("%d", strlen("hello")); return 0;'), '5');
  assert.strictEqual(outputOf('printf("%d", strlen("")); return 0;'), '0');
});

test('strcpy copies including the terminator', () => {
  assert.strictEqual(
    outputOf('char d[6]; strcpy(d, "hello"); printf("%s", d); return 0;'),
    'hello'
  );
});

test('13. strcpy into a buffer that is too small is caught', () => {
  assert.strictEqual(
    codeOf('char d[3]; strcpy(d, "hello"); return 0;'),
    'out-of-bounds-write'
  );
});

test('the strcpy overflow diagnostic names the buffer and its size', () => {
  const result = runBody('char small[3]; strcpy(small, "hello"); return 0;');
  assert.ok(result.diagnostic.plain.includes('small'));
  assert.ok(/3/.test(result.diagnostic.plain));
});

test('strncpy stops at the limit', () => {
  const body = lines('char d[4];', 'strncpy(d, "hello", 3);', 'd[3] = 0;',
    'printf("%s", d);', 'return 0;');
  assert.strictEqual(outputOf(body), 'hel');
});

test('strcmp orders strings', () => {
  assert.strictEqual(outputOf('printf("%d", strcmp("abc", "abc")); return 0;'), '0');
  assert.ok(Number(outputOf('printf("%d", strcmp("abc", "abd")); return 0;')) < 0);
  assert.ok(Number(outputOf('printf("%d", strcmp("b", "a")); return 0;')) > 0);
});

test('strcat appends', () => {
  const body = lines('char d[8];', 'strcpy(d, "ab");', 'strcat(d, "cd");',
    'printf("%s", d);', 'return 0;');
  assert.strictEqual(outputOf(body), 'abcd');
});

test('strcat past the end of the buffer is caught', () => {
  const body = lines('char d[4];', 'strcpy(d, "ab");', 'strcat(d, "cdef");', 'return 0;');
  assert.strictEqual(codeOf(body), 'out-of-bounds-write');
});

test('memset fills and marks the bytes initialised', () => {
  const body = lines('char b[4];', 'memset(b, 65, 4);', 'printf("%c%c", b[0], b[3]);',
    'return 0;');
  assert.strictEqual(outputOf(body), 'AA');
});

test('memcpy copies raw bytes', () => {
  const body = lines('int a[2]; int b[2];', 'a[0] = 5; a[1] = 6;',
    'memcpy(b, a, 8);', 'printf("%d%d", b[0], b[1]);', 'return 0;');
  assert.strictEqual(outputOf(body), '56');
});

test('memcpy past the end of the destination is caught', () => {
  const body = lines('int a[4]; int b[2];', 'memset(a, 0, 16);',
    'memcpy(b, a, 16);', 'return 0;');
  assert.strictEqual(codeOf(body), 'out-of-bounds-write');
});

test('abs', () => {
  assert.strictEqual(outputOf('printf("%d %d", abs(-5), abs(5)); return 0;'), '5 5');
});

test('rand is deterministic across runs', () => {
  const body = 'printf("%d %d %d", rand(), rand(), rand()); return 0;';
  assert.strictEqual(outputOf(body), outputOf(body), 'the same program must print the same');
});

test('srand with the same seed reproduces the same sequence', () => {
  const a = outputOf('srand(1); printf("%d", rand()); return 0;');
  const b = outputOf('srand(1); printf("%d", rand()); return 0;');
  const c = outputOf('srand(2); printf("%d", rand()); return 0;');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c, 'a different seed must give a different sequence');
});

test('rand stays within RAND_MAX and is never negative', () => {
  const body = lines('for (int i = 0; i < 50; i++) {', '  int r = rand();',
    '  if (r < 0) printf("bad");', '}', 'printf("ok");', 'return 0;');
  assert.strictEqual(outputOf(body), 'ok');
});

test('exit ends the program at once with no leak report', () => {
  const body = 'printf("a"); exit(0); printf("b"); return 0;';
  const result = runBody(body);
  assert.strictEqual(result.output, 'a');
  assert.strictEqual(result.diagnostic, null);
});

test('scanf reads integers from the stdin box', () => {
  const body = lines('int a; int b;', 'scanf("%d", &a);', 'scanf("%d", &b);',
    'printf("%d", a + b);', 'return 0;');
  assert.strictEqual(outputOf(body, '3 4'), '7');
});

test('scanf reads several conversions in one call', () => {
  const body = lines('int a; int b;', 'scanf("%d %d", &a, &b);',
    'printf("%d", a * b);', 'return 0;');
  assert.strictEqual(outputOf(body, '6 7'), '42');
});

test('scanf reads a word into a char array', () => {
  const body = lines('char name[8];', 'scanf("%s", name);',
    'printf("hi %s", name);', 'return 0;');
  assert.strictEqual(outputOf(body, 'sam'), 'hi sam');
});

test('scanf returns how many items it converted, and 0 at end of input', () => {
  const body = lines('int a;', 'int n = scanf("%d", &a);', 'printf("%d", n);', 'return 0;');
  assert.strictEqual(outputOf(body, '5'), '1');
  assert.strictEqual(outputOf(body, ''), '0');
});

test('getchar walks the input and reports end of input', () => {
  const body = lines('printf("%c", getchar());', 'printf("%c", getchar());',
    'if (getchar() == -1) printf("!");', 'return 0;');
  assert.strictEqual(outputOf(body, 'ab'), 'ab!');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/trace-stdlib-lib.test.js`
Expected: FAIL, since `malloc` is not a known function

- [ ] **Step 3: Write the implementation**

```js
  const RAND_MAX = 32767;

  /** Raised by exit(); caught by the runner's driver. */
  class ExitSignal extends Error {
    constructor(code) {
      super('exit');
      this.name = 'ExitSignal';
      this.code = code;
    }
  }

  /**
   * A small linear congruential generator, chosen so that the same program
   * prints the same numbers on every machine. Math.random would break the
   * determinism the whole feature depends on, including replay.
   */
  function makeRandom() {
    let seed = 1;
    return {
      seed: function (value) { seed = value >>> 0; },
      next: function () {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed >>> 16) % (RAND_MAX + 1);
      },
    };
  }

  /** Every copy goes byte by byte through the checks, so overruns are caught. */
  function copyBytes(destination, source, count, ctx, node) {
    const readProblem = ctx.machine.checkRead(source, count);
    if (readProblem) Interp.halt(readProblem, node);
    const writeProblem = ctx.machine.checkWrite(destination, count);
    if (writeProblem) Interp.halt(writeProblem, node);
    ctx.machine.writeBytes(destination, ctx.machine.readBytes(source, count));
    ctx.machine.markInitialised(destination, count);
  }

  function writeCString(address, text, ctx, node) {
    const bytes = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    const problem = ctx.machine.checkWrite(address, bytes.length);
    if (problem) Interp.halt(problem, node);
    ctx.machine.writeBytes(address, bytes);
    ctx.machine.markInitialised(address, bytes.length);
  }
```

Add these entries to the object `createBuiltins` returns:

```js
      malloc: function (args, ctx) {
        return { value: ctx.machine.allocate(Math.max(0, args[0].value)), ctype: PTR_VOID };
      },

      calloc: function (args, ctx) {
        const size = Math.max(0, args[0].value * args[1].value);
        const address = ctx.machine.allocate(size);
        if (address !== 0) {
          ctx.machine.writeBytes(address, new Uint8Array(size));
          ctx.machine.markInitialised(address, size);
        }
        return { value: address, ctype: PTR_VOID };
      },

      realloc: function (args, ctx, node) {
        const oldAddress = args[0].value;
        const newSize = Math.max(0, args[1].value);
        if (oldAddress === 0) {
          return { value: ctx.machine.allocate(newSize), ctype: PTR_VOID };
        }
        const record = ctx.machine.recordAt(oldAddress);
        if (!record || record.kind !== 'heap' || record.freed || record.address !== oldAddress) {
          const problem = ctx.machine.checkFree(oldAddress);
          if (problem) Interp.halt(problem, node);
        }
        const address = ctx.machine.allocate(newSize);
        if (address === 0) return { value: 0, ctype: PTR_VOID };
        const keep = Math.min(record.size, newSize);
        ctx.machine.writeBytes(address, ctx.machine.readBytes(oldAddress, keep));
        // Only the bytes that were initialised in the old block stay so.
        for (let i = 0; i < keep; i += 1) {
          if (ctx.machine.isInitialised(oldAddress + i, 1)) {
            ctx.machine.markInitialised(address + i, 1);
          }
        }
        ctx.machine.release(oldAddress);
        return { value: address, ctype: PTR_VOID };
      },

      free: function (args, ctx, node) {
        const problem = ctx.machine.checkFree(args[0].value);
        if (problem) Interp.halt(problem, node);
        if (args[0].value !== 0) ctx.machine.release(args[0].value);
        return { value: 0, ctype: VOID };
      },

      exit: function (args) { throw new ExitSignal(args[0] ? args[0].value : 0); },

      abs: function (args) { return { value: Math.abs(args[0].value), ctype: INT }; },

      rand: function (args, ctx) {
        if (!ctx.random) ctx.random = makeRandom();
        return { value: ctx.random.next(), ctype: INT };
      },

      srand: function (args, ctx) {
        if (!ctx.random) ctx.random = makeRandom();
        ctx.random.seed(args[0].value);
        return { value: 0, ctype: VOID };
      },

      strlen: function (args, ctx, node) {
        return { value: readCString(args[0].value, ctx, node).length, ctype: INT };
      },

      strcpy: function (args, ctx, node) {
        writeCString(args[0].value, readCString(args[1].value, ctx, node), ctx, node);
        return { value: args[0].value, ctype: PTR_CHAR };
      },

      strncpy: function (args, ctx, node) {
        const text = readCString(args[1].value, ctx, node).slice(0, args[2].value);
        const problem = ctx.machine.checkWrite(args[0].value, args[2].value);
        if (problem) Interp.halt(problem, node);
        for (let i = 0; i < args[2].value; i += 1) {
          ctx.machine.writeValue(args[0].value + i, CHAR,
            i < text.length ? text.charCodeAt(i) : 0);
        }
        ctx.machine.markInitialised(args[0].value, args[2].value);
        return { value: args[0].value, ctype: PTR_CHAR };
      },

      strcmp: function (args, ctx, node) {
        const a = readCString(args[0].value, ctx, node);
        const b = readCString(args[1].value, ctx, node);
        return { value: a < b ? -1 : (a > b ? 1 : 0), ctype: INT };
      },

      strcat: function (args, ctx, node) {
        const existing = readCString(args[0].value, ctx, node);
        const added = readCString(args[1].value, ctx, node);
        writeCString(args[0].value, existing + added, ctx, node);
        return { value: args[0].value, ctype: PTR_CHAR };
      },

      memset: function (args, ctx, node) {
        const count = Math.max(0, args[2].value);
        const problem = ctx.machine.checkWrite(args[0].value, count);
        if (problem) Interp.halt(problem, node);
        ctx.machine.writeBytes(args[0].value, new Uint8Array(count).fill(args[1].value & 0xff));
        ctx.machine.markInitialised(args[0].value, count);
        return { value: args[0].value, ctype: PTR_VOID };
      },

      memcpy: function (args, ctx, node) {
        copyBytes(args[0].value, args[1].value, Math.max(0, args[2].value), ctx, node);
        return { value: args[0].value, ctype: PTR_VOID };
      },

      getchar: function (args, ctx) {
        const stdin = ctx.stdin;
        if (stdin.position >= stdin.text.length) return { value: -1, ctype: INT };
        const code = stdin.text.charCodeAt(stdin.position);
        stdin.position += 1;
        return { value: code, ctype: INT };
      },

      scanf: function (args, ctx, node) {
        const template = readCString(args[0].value, ctx, node);
        const stdin = ctx.stdin;
        let argIndex = 1;
        let converted = 0;

        function skipSpace() {
          while (stdin.position < stdin.text.length
            && /\s/.test(stdin.text[stdin.position])) stdin.position += 1;
        }
        function readToken() {
          skipSpace();
          const start = stdin.position;
          while (stdin.position < stdin.text.length
            && !/\s/.test(stdin.text[stdin.position])) stdin.position += 1;
          return stdin.text.slice(start, stdin.position);
        }

        for (let i = 0; i < template.length; i += 1) {
          if (template[i] !== '%') continue;
          i += 1;
          const conversion = template[i];
          if (conversion === '%') continue;
          if (argIndex >= args.length) {
            fail('scanf-missing-argument', 'not enough arguments for scanf',
              'Every conversion in the format string needs a matching pointer, '
                + 'written with & in front of the variable.', node);
          }
          const target = args[argIndex];
          argIndex += 1;
          const token = readToken();
          if (token.length === 0) break; // end of input: stop, report the count

          if (conversion === 'd' || conversion === 'i') {
            const value = parseInt(token, 10);
            if (Number.isNaN(value)) break;
            const problem = ctx.machine.checkWrite(target.value, 4);
            if (problem) Interp.halt(problem, node);
            ctx.machine.writeValue(target.value, INT, value);
            ctx.machine.markInitialised(target.value, 4);
          } else if (conversion === 'f') {
            const value = parseFloat(token);
            if (Number.isNaN(value)) break;
            const problem = ctx.machine.checkWrite(target.value, 8);
            if (problem) Interp.halt(problem, node);
            ctx.machine.writeValue(target.value, { k: 'double' }, value);
            ctx.machine.markInitialised(target.value, 8);
          } else if (conversion === 's') {
            writeCString(target.value, token, ctx, node);
          } else if (conversion === 'c') {
            const problem = ctx.machine.checkWrite(target.value, 1);
            if (problem) Interp.halt(problem, node);
            ctx.machine.writeValue(target.value, CHAR, token.charCodeAt(0));
            ctx.machine.markInitialised(target.value, 1);
          } else {
            fail('scanf-unknown-conversion',
              "unknown conversion '%" + (conversion || '') + "' in scanf",
              'scanf in Trace understands %d, %i, %f, %s and %c.', node);
          }
          converted += 1;
        }
        return { value: converted, ctype: INT };
      },
```

Add `const PTR_VOID = { k: 'ptr', to: VOID };` and
`const PTR_CHAR = { k: 'ptr', to: CHAR };` near the other constants, and export
`ExitSignal` and `RAND_MAX`.

Finally, catch `ExitSignal` in the runner's `driver` from Task 11, so `exit()`
ends the program cleanly and **skips the leak check** — a program that calls
`exit` has not leaked in any sense worth reporting:

```js
    function* driver() {
      const main = ctx.functions.main;
      try {
        const result = yield* callFunction(main, [], ctx, main);
        const leak = ctx.machine.checkLeaks();
        if (leak) halt(leak, main);
        return result;
      } catch (error) {
        if (error && error.name === 'ExitSignal') {
          return { value: error.code, ctype: { k: 'int' } };
        }
        throw error;
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/trace-stdlib-lib.test.js`
Expected: PASS, 31 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-stdlib.js src/renderer/js/trace-interp.js test/trace-stdlib-lib.test.js
git commit -m "Add the Trace allocator, string functions and input"
```

---

## Task 14: The program corpus

**Files:**
- Create: `test/trace-corpus.test.js`
- Test: itself

**Interfaces:**
- Consumes: everything from Tasks 1 to 13
- Produces: nothing importable. This is the end-to-end proof.

Every entry is `{name, source, output?, code?, stdin?}`: run the program to
completion and assert either the exact output or the exact diagnostic code.
Failures here point at an interaction between modules that unit tests missed,
which is the whole reason the corpus exists.

**Write 60 to 80 entries**, distributed as below. The table gives the first
entries in each group verbatim; continue in the same style until each group
reaches its count.

| Group | Count | Covers |
| --- | --- | --- |
| Basics | 10 | Arithmetic, precedence, integer division, char arithmetic, casts, `sizeof` |
| Control flow | 12 | Every loop form, nested loops, `break`, `continue`, `switch` fall-through, dangling `else` |
| Functions | 10 | Value and pointer parameters, recursion, mutual recursion, early return, `void` |
| Arrays and strings | 12 | Indexing, iteration, 2-D arrays, string building, the library functions |
| Pointers | 12 | Pointer arithmetic, pointers to pointers, swap through pointers, array-pointer equivalence |
| Structs and enums | 6 | Members, nesting, arrays of structs, pointer-to-struct with `->` |
| The classic mistakes | 14 | One per diagnostic in the spec's list, written the way a beginner writes them |

- [ ] **Step 1: Write the test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');

const NL = String.fromCharCode(10);
function src() {
  return Array.prototype.slice.call(arguments).join(NL);
}

const PROGRAMS = [
  // --- Basics ------------------------------------------------------------
  {
    name: 'arithmetic and precedence',
    source: src('int main(void) {', '  printf("%d", 2 + 3 * 4);', '  return 0;', '}'),
    output: '14',
  },
  {
    name: 'integer division truncates toward zero',
    source: src('int main(void) {', '  printf("%d %d", 7 / 2, -7 / 2);', '  return 0;', '}'),
    output: '3 -3',
  },
  {
    name: 'char arithmetic produces letters',
    source: src('int main(void) {', "  char c = 'a';", '  printf("%c", c + 1);',
      '  return 0;', '}'),
    output: 'b',
  },
  {
    name: 'sizeof reports real sizes including padding',
    source: src('struct S { char c; int i; };', 'int main(void) {',
      '  printf("%d %d %d", sizeof(int), sizeof(char), sizeof(struct S));',
      '  return 0;', '}'),
    output: '4 1 8',
  },

  // --- Control flow ------------------------------------------------------
  {
    name: 'fizzbuzz to 15',
    source: src('int main(void) {', '  for (int i = 1; i <= 15; i++) {',
      '    if (i % 15 == 0) printf("FB");',
      '    else if (i % 3 == 0) printf("F");',
      '    else if (i % 5 == 0) printf("B");',
      '    else printf("%d", i);', '  }', '  return 0;', '}'),
    output: '12F4BF78FB11F1314FB',
  },
  {
    name: 'switch falls through until break',
    source: src('int main(void) {', '  int n = 0;', '  switch (1) {',
      '    case 1: n = n + 1;', '    case 2: n = n + 10; break;',
      '    case 3: n = n + 100;', '  }', '  printf("%d", n);', '  return 0;', '}'),
    output: '11',
  },
  {
    name: 'nested loops build a triangle',
    source: src('int main(void) {', '  for (int i = 1; i <= 3; i++) {',
      '    for (int j = 0; j < i; j++) printf("*");', '    printf("|");', '  }',
      '  return 0;', '}'),
    output: '*|**|***|',
  },

  // --- Functions ---------------------------------------------------------
  {
    name: 'recursion computes a factorial',
    source: src('int fact(int n) {', '  if (n <= 1) return 1;',
      '  return n * fact(n - 1);', '}',
      'int main(void) { printf("%d", fact(6)); return 0; }'),
    output: '720',
  },
  {
    name: 'swap through pointers changes the caller',
    source: src('void swap(int *a, int *b) {', '  int t = *a; *a = *b; *b = t;', '}',
      'int main(void) {', '  int x = 1; int y = 2;', '  swap(&x, &y);',
      '  printf("%d%d", x, y);', '  return 0;', '}'),
    output: '21',
  },

  // --- Arrays and strings ------------------------------------------------
  {
    name: 'sum an array',
    source: src('int main(void) {', '  int a[5] = {1, 2, 3, 4, 5};', '  int total = 0;',
      '  for (int i = 0; i < 5; i++) total = total + a[i];',
      '  printf("%d", total);', '  return 0;', '}'),
    output: '15',
  },
  {
    name: 'reverse a string in place',
    source: src('int main(void) {', '  char s[6] = "abcde";', '  int n = strlen(s);',
      '  for (int i = 0; i < n / 2; i++) {',
      '    char t = s[i]; s[i] = s[n - 1 - i]; s[n - 1 - i] = t;', '  }',
      '  printf("%s", s);', '  return 0;', '}'),
    output: 'edcba',
  },
  {
    name: 'a two-dimensional array',
    source: src('int main(void) {', '  int g[2][3];',
      '  for (int i = 0; i < 2; i++)',
      '    for (int j = 0; j < 3; j++) g[i][j] = i * 3 + j;',
      '  printf("%d%d", g[0][2], g[1][0]);', '  return 0;', '}'),
    output: '23',
  },

  // --- Pointers ----------------------------------------------------------
  {
    name: 'walking an array with a pointer',
    source: src('int main(void) {', '  int a[4] = {10, 20, 30, 40};', '  int *p = a;',
      '  printf("%d %d", *p, *(p + 2));', '  return 0;', '}'),
    output: '10 30',
  },
  {
    name: 'a[i] and *(a + i) are the same thing',
    source: src('int main(void) {', '  int a[3] = {5, 6, 7};',
      '  if (a[1] == *(a + 1)) printf("same");', '  return 0;', '}'),
    output: 'same',
  },

  // --- Structs and enums -------------------------------------------------
  {
    name: 'a struct through a pointer',
    source: src('struct P { int x; int y; };',
      'int total(struct P *p) { return p->x + p->y; }',
      'int main(void) {', '  struct P p; p.x = 3; p.y = 4;',
      '  printf("%d", total(&p));', '  return 0;', '}'),
    output: '7',
  },

  // --- The classic mistakes ---------------------------------------------
  {
    name: 'off by one at the end of an array',
    source: src('int main(void) {', '  int a[5];',
      '  for (int i = 0; i <= 5; i++) a[i] = i;', '  return 0;', '}'),
    code: 'index-out-of-range',
  },
  {
    name: 'reading a variable that was never set',
    source: src('int main(void) {', '  int total;',
      '  for (int i = 0; i < 3; i++) total = total + i;',
      '  printf("%d", total);', '  return 0;', '}'),
    code: 'uninitialised-read',
  },
  {
    name: 'returning a pointer to a local',
    source: src('int *broken(void) {', '  int local = 42;', '  return &local;', '}',
      'int main(void) {', '  int *p = broken();', '  printf("%d", *p);',
      '  return 0;', '}'),
    code: 'dangling-stack-pointer',
  },
  {
    name: 'forgetting to free',
    source: src('int main(void) {', '  int *p = malloc(100);', '  *p = 1;',
      '  return 0;', '}'),
    code: 'memory-leak',
  },
  {
    name: 'a string with no room for its terminator',
    source: src('int main(void) {', '  char s[5];', '  strcpy(s, "hello");',
      '  return 0;', '}'),
    code: 'out-of-bounds-write',
  },
  {
    name: 'dividing by a counter that reached zero',
    source: src('int main(void) {', '  int n = 3;',
      '  while (n >= 0) { printf("%d", 12 / n); n = n - 1; }', '  return 0;', '}'),
    code: 'divide-by-zero',
  },
  {
    name: 'a loop whose condition never changes',
    source: src('int main(void) {', '  int i = 0;',
      '  while (i < 10) { printf("x"); }', '  return 0;', '}'),
    code: 'step-limit',
  },
];

for (const program of PROGRAMS) {
  test('corpus: ' + program.name, () => {
    const runner = I.createRunner({ source: program.source, stdin: program.stdin || '' });
    assert.deepStrictEqual(runner.errors, [],
      'should parse cleanly: ' + JSON.stringify(runner.errors));

    let result = null;
    for (let i = 0; i <= I.MAX_STEPS; i += 1) {
      result = runner.step();
      if (result.done) break;
    }

    if (program.code) {
      assert.ok(result.diagnostic, 'expected diagnostic ' + program.code);
      assert.strictEqual(result.diagnostic.code, program.code);
      assert.ok(result.diagnostic.plain.length > 20, 'the explanation must be real');
      assert.ok(result.diagnostic.locations.length > 0, 'and must point somewhere');
    } else {
      assert.strictEqual(result.diagnostic, null,
        result.diagnostic && result.diagnostic.terse);
      assert.strictEqual(runner.state().output.join(''), program.output);
    }
  });
}

test('every corpus program is deterministic', () => {
  for (const program of PROGRAMS) {
    if (program.code === 'step-limit') continue; // capped, not run to completion
    const outputs = [0, 1].map(function () {
      const runner = I.createRunner({ source: program.source, stdin: program.stdin || '' });
      for (let i = 0; i < 200000; i += 1) if (runner.step().done) break;
      return runner.state().output.join('');
    });
    assert.strictEqual(outputs[0], outputs[1], program.name);
  }
});
```

- [ ] **Step 2: Run it and fix what it finds**

Run: `node --test test/trace-corpus.test.js`

Expect real failures on the first run: the corpus exercises combinations the
unit tests do not. Fix the **modules**, not the corpus, unless a program is
genuinely wrong. Each failure here is a bug a learner would have hit.

- [ ] **Step 3: Extend to the full distribution**

Add entries until each group in the table above reaches its stated count, 60 to
80 in total.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. The 81 pre-existing tests plus Tasks 1 to 14.

- [ ] **Step 5: Commit**

```bash
git add test/trace-corpus.test.js src/renderer/js/
git commit -m "Add the Trace end-to-end program corpus"
```

---

## Task 15: Settings keys and the Trace pane type

**Files:**
- Modify: `src/main/settings.js`, `src/renderer/js/split-tree.js`, `src/renderer/js/app.js`, `src/renderer/index.html`
- Test: `test/trace-settings.test.js`, plus additions to `test/split-tree.test.js`

**Interfaces:**
- Produces: settings keys `traceProgram` and `traceStdin`; panes carry `kind`

**A note on the two halves of this task.** The settings half is exact: the
existing `coerce` in `settings.js` caps every string value at 512 characters,
which would silently truncate a program, so both keys need their own branch
alongside the one `shell` already has. The pane-type half must follow whatever
structure `split-tree.js` already uses — **read that file first**. The tests
below define the required behaviour without assuming an internal shape.

- [ ] **Step 1: Write the failing settings test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { coerce, DEFAULTS } = require('../src/main/settings.js');

test('the two Trace keys exist and default to empty', () => {
  assert.strictEqual(DEFAULTS.traceProgram, '');
  assert.strictEqual(DEFAULTS.traceStdin, '');
});

test('a program longer than the general 512-character string cap survives', () => {
  const program = 'int main(void) { return 0; } ' + 'x'.repeat(5000);
  const out = coerce({ traceProgram: program });
  assert.strictEqual(out.traceProgram, program,
    'the generic string cap must not truncate a program');
});

test('the program is capped at 64 KiB and stdin at 8 KiB', () => {
  const huge = 'a'.repeat(200000);
  assert.strictEqual(coerce({ traceProgram: huge }).traceProgram.length, 65536);
  assert.strictEqual(coerce({ traceStdin: huge }).traceStdin.length, 8192);
});

test('a non-string falls back to the default', () => {
  assert.strictEqual(coerce({ traceProgram: 42 }).traceProgram, '');
  assert.strictEqual(coerce({ traceStdin: null }).traceStdin, '');
});

test('the existing keys still coerce as they did', () => {
  assert.strictEqual(coerce({ fontSize: 999 }).fontSize, 72);
  assert.strictEqual(coerce({ theme: 'Dracula' }).theme, 'Dracula');
  assert.strictEqual(coerce({}).shell, null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/trace-settings.test.js`
Expected: FAIL, since `DEFAULTS.traceProgram` is undefined

- [ ] **Step 3: Add the keys to `settings.js`**

Add to `DEFAULTS`:

```js
  // Trace pane contents. Kept here because settings.json is the only
  // persistence Josh has, and using it costs no new IPC channel.
  traceProgram: '',
  traceStdin: '',
```

and add this branch to `coerce`, **before** the generic `typeof fallback ===
'string'` branch, since that one caps at 512 and would truncate a program:

```js
    if (key === 'traceProgram' || key === 'traceStdin') {
      const cap = key === 'traceProgram' ? 65536 : 8192;
      if (typeof value === 'string') out[key] = value.slice(0, cap);
      continue;
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/trace-settings.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Write the failing pane-type test**

Append to `test/split-tree.test.js`, adapting the construction calls to the
module's actual signature, which you read in Step 0.

```js
test('a pane records what kind it is, defaulting to terminal', () => {
  const tree = makeTree();                 // however the existing tests build one
  const pane = tree.rootPane();
  assert.strictEqual(pane.kind, 'terminal');
});

test('a pane can be split into a Trace pane', () => {
  const tree = makeTree();
  const created = tree.split(tree.rootPane().id, 'right', { kind: 'trace' });
  assert.strictEqual(created.kind, 'trace');
  assert.strictEqual(tree.rootPane().kind, 'terminal', 'the original is unchanged');
});

test('splitting, focusing and closing work the same for both kinds', () => {
  const tree = makeTree();
  const trace = tree.split(tree.rootPane().id, 'right', { kind: 'trace' });
  const third = tree.split(trace.id, 'down', { kind: 'terminal' });
  assert.strictEqual(tree.panes().length, 3);
  tree.close(trace.id);
  assert.strictEqual(tree.panes().length, 2);
  assert.ok(tree.panes().every((p) => p.id !== trace.id));
  assert.ok(tree.panes().some((p) => p.id === third.id));
});

test('a Trace pane owns no PTY session', () => {
  const tree = makeTree();
  const trace = tree.split(tree.rootPane().id, 'right', { kind: 'trace' });
  assert.ok(!trace.sessionId, 'a Trace pane must never be given a shell');
});
```

- [ ] **Step 6: Add `kind` to the pane model**

In `split-tree.js`, give every pane a `kind` defaulting to `'terminal'`, accept
it in whatever options object `split` already takes, and preserve it through
splitting and closing. Change nothing else about the tree's behaviour.

In `app.js`, branch on `pane.kind` where a pane is constructed: `'terminal'`
builds a `TerminalPane` and requests a PTY as it does today; `'trace'` builds a
Trace pane and **requests no session**. Session restore must skip Trace panes,
since there is no working directory to restore.

In `index.html`, add the script tags in dependency order, before `app.js`:

```html
<script src="js/trace-lex.js"></script>
<script src="js/trace-parse.js"></script>
<script src="js/trace-machine.js"></script>
<script src="js/trace-interp.js"></script>
<script src="js/trace-stdlib.js"></script>
<script src="js/trace-examples.js"></script>
<script src="js/trace-editor.js"></script>
<script src="js/trace-panel.js"></script>
```

- [ ] **Step 7: Run the suite**

Run: `npm test`
Expected: PASS, including every pre-existing `split-tree` test unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/main/settings.js src/renderer/js/split-tree.js src/renderer/js/app.js src/renderer/index.html test/
git commit -m "Add Trace settings keys and the Trace pane type"
```

---

## Task 16: The editor

**Files:**
- Create: `src/renderer/js/trace-editor.js`
- Modify: `src/renderer/css/app.css`
- Test: `test/trace-editor.test.js`

**Interfaces:**
- Consumes: `trace-lex.js`
- Produces:
  - `highlight(source: string): Array<{text, cls}>` (pure, testable in Node)
  - `createEditor({container, onChange}): Editor`
  - `Editor.getValue()`, `Editor.setValue(text)`, `Editor.setCurrentLine(line|null)`, `Editor.markError(location|null)`, `Editor.focus()`, `Editor.destroy()`

The editor is a transparent `textarea` over a rendered `<pre>`, the standard
technique: the textarea handles input, selection and accessibility, and the
layer beneath supplies colour. Both use identical font metrics, so they align.

**The colouring comes from `trace-lex.js` with `includeTrivia: true`.** That is
why Task 1 kept `raw` on every token: the editor concatenates `raw` to
reconstruct the source exactly, so highlighting can never disagree with what the
interpreter is about to parse.

Only `highlight` is unit-tested; the DOM half is exercised by the manual check
in Task 18. Josh has no DOM test harness and this task does not add one.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Editor = require('../src/renderer/js/trace-editor.js');

const NL = String.fromCharCode(10);

test('highlighting reproduces the source exactly', () => {
  const source = 'int main(void) {' + NL + '  return 0; // done' + NL + '}';
  assert.strictEqual(Editor.highlight(source).map((s) => s.text).join(''), source);
});

test('each kind of token gets its own class', () => {
  const spans = Editor.highlight('int x = 1; // hi');
  const classOf = (text) => (spans.find((s) => s.text === text) || {}).cls;
  assert.strictEqual(classOf('int'), 'tok-keyword');
  assert.strictEqual(classOf('x'), 'tok-ident');
  assert.strictEqual(classOf('1'), 'tok-number');
  assert.strictEqual(classOf('// hi'), 'tok-comment');
  assert.strictEqual(classOf('='), 'tok-punct');
});

test('strings are their own class', () => {
  const spans = Editor.highlight('char *s = "hi";');
  assert.ok(spans.some((s) => s.text === '"hi"' && s.cls === 'tok-string'));
});

test('a known library name is distinguished from an ordinary identifier', () => {
  const spans = Editor.highlight('printf("hi"); myfunc();');
  const classOf = (text) => (spans.find((s) => s.text === text) || {}).cls;
  assert.strictEqual(classOf('printf'), 'tok-builtin');
  assert.strictEqual(classOf('myfunc'), 'tok-ident');
});

test('half-typed source still highlights, and still round-trips', () => {
  for (const source of ['int x = "unterminated', '/* open', 'int', '', '@']) {
    const spans = Editor.highlight(source);
    assert.strictEqual(spans.map((s) => s.text).join(''), source, JSON.stringify(source));
  }
});

test('highlighting a large file stays fast enough to type against', () => {
  const source = ('int x = 1; // a line' + NL).repeat(2000);
  const started = Date.now();
  Editor.highlight(source);
  assert.ok(Date.now() - started < 250, 'took ' + (Date.now() - started) + 'ms');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/trace-editor.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-editor.js'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';

/**
 * The Trace code pane: a transparent textarea over a coloured layer.
 *
 * Colouring uses the interpreter's own lexer, so what a learner sees marked as
 * a keyword is exactly what the parser will treat as one. Keeping `raw` on
 * every token (Task 1) is what makes the reconstruction exact, including
 * whitespace and comments.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TraceEditor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const Lex = (typeof module === 'object' && module.exports)
    ? require('./trace-lex.js')
    : (typeof self !== 'undefined' ? self : this).TraceLex;

  const BUILTINS = Object.freeze([
    'printf', 'puts', 'putchar', 'scanf', 'getchar',
    'malloc', 'calloc', 'realloc', 'free', 'exit', 'abs', 'rand', 'srand',
    'strlen', 'strcpy', 'strncpy', 'strcmp', 'strcat', 'memset', 'memcpy',
  ]);

  const CLASSES = Object.freeze({
    keyword: 'tok-keyword',
    ident: 'tok-ident',
    int: 'tok-number',
    double: 'tok-number',
    char: 'tok-string',
    string: 'tok-string',
    punct: 'tok-punct',
    comment: 'tok-comment',
    space: 'tok-space',
  });

  /** Pure, so it is testable in Node without a DOM. */
  function highlight(source) {
    const tokens = Lex.tokenize(source, { includeTrivia: true }).tokens;
    const spans = [];
    for (const token of tokens) {
      if (token.type === 'eof') continue;
      const cls = token.type === 'ident' && BUILTINS.includes(token.value)
        ? 'tok-builtin'
        : (CLASSES[token.type] || 'tok-ident');
      spans.push({ text: token.raw, cls: cls });
    }
    return spans;
  }

  function createEditor(options) {
    const container = options.container;
    const onChange = options.onChange || function () {};

    container.classList.add('trace-editor');
    const gutter = document.createElement('div');
    gutter.className = 'trace-gutter';
    const layer = document.createElement('pre');
    layer.className = 'trace-layer';
    layer.setAttribute('aria-hidden', 'true'); // the textarea is what is read
    const input = document.createElement('textarea');
    input.className = 'trace-input';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'C program');
    container.append(gutter, layer, input);

    let currentLine = null;
    let errorLocation = null;

    function render() {
      const source = input.value;

      layer.textContent = '';
      for (const span of highlight(source)) {
        const element = document.createElement('span');
        element.className = span.cls;
        element.textContent = span.text;
        layer.appendChild(element);
      }

      const lineCount = source.split(String.fromCharCode(10)).length;
      gutter.textContent = '';
      for (let n = 1; n <= lineCount; n += 1) {
        const element = document.createElement('div');
        element.textContent = String(n);
        if (n === currentLine) element.className = 'is-current';
        if (errorLocation && n === errorLocation.line) element.className = 'is-error';
        gutter.appendChild(element);
      }
    }

    input.addEventListener('input', function () {
      render();
      onChange(input.value);
    });
    // Keep the coloured layer aligned with the textarea while scrolling.
    input.addEventListener('scroll', function () {
      layer.scrollTop = input.scrollTop;
      layer.scrollLeft = input.scrollLeft;
      gutter.scrollTop = input.scrollTop;
    });

    render();

    return {
      getValue: function () { return input.value; },
      setValue: function (text) { input.value = text; render(); },
      setCurrentLine: function (line) { currentLine = line; render(); },
      markError: function (location) { errorLocation = location; render(); },
      focus: function () { input.focus(); },
      destroy: function () { container.textContent = ''; },
    };
  }

  return { highlight, createEditor, BUILTINS, CLASSES };
});
```

Add styles to `app.css`: `.trace-editor` is `position: relative`; `.trace-layer`
and `.trace-input` are absolutely positioned over each other with identical
`font`, `line-height`, `padding` and `white-space: pre`; `.trace-input` gets
`color: transparent`, a visible `caret-color`, and `background: transparent`.
Token colours come from the active theme's tokens, so the editor follows the
terminal's theme like everything else.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/trace-editor.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-editor.js src/renderer/css/app.css test/trace-editor.test.js
git commit -m "Add the Trace code editor"
```

---

## Task 17: The diagram

**Files:**
- Create: `src/renderer/js/trace-panel.js`
- Modify: `src/renderer/css/app.css`, `src/renderer/js/trace-interp.js`, `src/renderer/js/trace-machine.js`
- Test: `test/trace-panel.test.js`

**Interfaces:**
- Consumes: `Runner.state()` and `Runner.machine` from Task 11
- Produces:
  - `buildModel(state, machine): DiagramModel` (pure)
  - `renderAsText(model): string` (pure)
  - `describeType(ctype): string` (pure)
  - `createPanel({container}): Panel` with `Panel.update(state, machine)`
  - `DiagramModel = {frames: [{functionName, slots}], heap: [Block], globals: [Slot], arrows: [{from, to}]}`
  - `Slot = {name, typeName, address, value, initialised, isPointer, target, elements}`

**`buildModel` and `renderAsText` are pure and tested**; only the DOM painting is
not. That split also delivers the spec's "state as text" view, which exists for
screen-reader users and is the accessible equivalent of the boxes, not a debug
afterthought.

Values are formatted honestly. An uninitialised slot shows `?`, never `0` — a
diagram that invented a zero would teach exactly the wrong thing about
uninitialised memory, which is the lesson this feature is built around.

Two one-line additions to earlier modules are needed: `Runner` gains
`get machine() { return ctx ? ctx.machine : null; }` (Task 11), and the machine
gains `structsRef()` alongside `setStructs` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');
const Panel = require('../src/renderer/js/trace-panel.js');

const NL = String.fromCharCode(10);
function src() {
  return Array.prototype.slice.call(arguments).join(NL);
}

/** Run until `predicate(state)` holds, then return the model. */
function modelAfter(source, predicate) {
  const runner = I.createRunner({ source: source });
  assert.deepStrictEqual(runner.errors, []);
  for (let i = 0; i < 10000; i += 1) {
    const result = runner.step();
    const state = runner.state();
    if (predicate(state)) return Panel.buildModel(state, runner.machine);
    if (result.done) return Panel.buildModel(state, runner.machine);
  }
  throw new Error('predicate never held');
}

test('a frame appears with its function name and its locals', () => {
  const source = src('int main(void) {', '  int x = 5;', '  int y = 6;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.frames.length > 0
    && s.objects.filter((o) => o.kind === 'local').length === 2);
  assert.strictEqual(model.frames[0].functionName, 'main');
  assert.deepStrictEqual(model.frames[0].slots.map((s) => s.name).sort(), ['x', 'y']);
});

test('an uninitialised slot shows a question mark, never a zero', () => {
  const source = src('int main(void) {', '  int x;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.objects.some((o) => o.name === 'x'));
  const slot = model.frames[0].slots.find((s) => s.name === 'x');
  assert.strictEqual(slot.initialised, false);
  assert.strictEqual(slot.value, '?');
});

test('an initialised slot shows its value and its type', () => {
  const source = src('int main(void) {', '  int x = 42;', '  int y = 0;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  const slot = model.frames[0].slots.find((s) => s.name === 'x');
  assert.strictEqual(slot.value, '42');
  assert.strictEqual(slot.typeName, 'int');
});

test('a pointer produces an arrow to what it points at', () => {
  const source = src('int main(void) {', '  int x = 1;', '  int *p = &x;',
    '  int z = 0;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 3);
  const pointer = model.frames[0].slots.find((s) => s.name === 'p');
  assert.strictEqual(pointer.isPointer, true);
  assert.ok(model.arrows.some((a) => a.from === pointer.address && a.to === pointer.target));
});

test('a null pointer is shown as NULL and draws no arrow', () => {
  const source = src('int main(void) {', '  int *p = 0;', '  int z = 0;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  const pointer = model.frames[0].slots.find((s) => s.name === 'p');
  assert.strictEqual(pointer.value, 'NULL');
  assert.strictEqual(model.arrows.length, 0);
});

test('heap blocks appear with their size', () => {
  const source = src('int main(void) {', '  int *p = malloc(40);', '  free(p);',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.objects.some((o) => o.kind === 'heap'));
  assert.strictEqual(model.heap.length, 1);
  assert.strictEqual(model.heap[0].size, 40);
});

test('globals are their own group, separate from frames', () => {
  const source = src('int counter = 3;', 'int main(void) { return counter; }');
  const model = modelAfter(source, (s) => s.frames.length > 0);
  assert.ok(model.globals.some((g) => g.name === 'counter'));
  assert.ok(!model.frames.some((f) => f.slots.some((s) => s.name === 'counter')));
});

test('nested calls stack, innermost last', () => {
  const source = src('int inner(void) { int z = 1; return z; }',
    'int main(void) { return inner(); }');
  const model = modelAfter(source, (s) => s.frames.length === 2);
  assert.deepStrictEqual(model.frames.map((f) => f.functionName), ['main', 'inner']);
});

test('an array shows its elements rather than one opaque value', () => {
  const source = src('int main(void) {', '  int a[3] = {7, 8, 9};', '  int z = 0;',
    '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 2);
  const slot = model.frames[0].slots.find((s) => s.name === 'a');
  assert.strictEqual(slot.typeName, 'int[3]');
  assert.deepStrictEqual(slot.elements.map((e) => e.value), ['7', '8', '9']);
});

test('the text view names every frame, slot and value in the model', () => {
  const source = src('int main(void) {', '  int x = 5;', '  int *p = &x;',
    '  int z = 0;', '  return 0;', '}');
  const model = modelAfter(source, (s) => s.line !== null && s.line > 3);
  const text = Panel.renderAsText(model);
  assert.ok(text.includes('main'));
  assert.ok(text.includes('x'));
  assert.ok(text.includes('5'));
  assert.ok(text.includes('p'));
  assert.ok(text.toLowerCase().includes('points to'),
    'the text view must state pointer relationships, since it has no arrows');
});

test('the text view says so when there is nothing to show', () => {
  const model = { frames: [], heap: [], globals: [], arrows: [] };
  assert.ok(Panel.renderAsText(model).length > 0);
});

test('buildModel never throws on a halted or empty state', () => {
  const empty = { frames: [], objects: [], output: [], line: null,
    stepsAvailable: 0, halted: true };
  assert.doesNotThrow(() => Panel.buildModel(empty, null));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/trace-panel.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-panel.js'`

- [ ] **Step 3: Write the implementation**

Build `buildModel` and `renderAsText` first and get the tests green; add the DOM
painting afterwards, since nothing tests it directly.

```js
  /** C's own spelling for a type: int, int*, int[3], struct P. */
  function describeType(ctype) {
    if (!ctype) return 'bytes';
    if (ctype.k === 'ptr') return describeType(ctype.to) + '*';
    if (ctype.k === 'array') return describeType(ctype.of) + '[' + ctype.length + ']';
    if (ctype.k === 'struct') return 'struct ' + ctype.tag;
    if (ctype.k === 'enum') return 'enum ' + ctype.tag;
    return ctype.k;
  }

  /** Honest formatting: '?' for uninitialised, never a made-up zero. */
  function formatSlot(obj, machine) {
    const base = {
      name: obj.name, typeName: describeType(obj.ctype), address: obj.address,
      initialised: machine.isInitialised(obj.address, obj.size),
      isPointer: Boolean(obj.ctype && obj.ctype.k === 'ptr'),
      target: null, elements: null, value: null,
    };

    if (obj.ctype && obj.ctype.k === 'array') {
      const elementSize = Machine.sizeOf(obj.ctype.of, machine.structsRef());
      base.elements = [];
      for (let i = 0; i < obj.ctype.length; i += 1) {
        const address = obj.address + i * elementSize;
        base.elements.push({
          index: i,
          address: address,
          value: machine.isInitialised(address, elementSize)
            ? String(machine.readValue(address, obj.ctype.of))
            : '?',
        });
      }
      return base;
    }

    if (!base.initialised) {
      base.value = '?';
      return base;
    }
    const raw = machine.readValue(obj.address, obj.ctype);
    if (base.isPointer) {
      base.value = raw === 0 ? 'NULL' : '0x' + (raw >>> 0).toString(16);
      base.target = raw === 0 ? null : raw;
    } else {
      base.value = String(raw);
    }
    return base;
  }

  function buildModel(state, machine) {
    const model = { frames: [], heap: [], globals: [], arrows: [] };
    if (!machine) return model;

    const byFrame = new Map();
    for (const obj of state.objects) {
      if (obj.kind === 'global') {
        if (obj.name) model.globals.push(formatSlot(obj, machine));
      } else if (obj.kind === 'heap') {
        model.heap.push({ address: obj.address, size: obj.size });
      } else if (obj.kind === 'local') {
        if (!byFrame.has(obj.frameId)) byFrame.set(obj.frameId, []);
        byFrame.get(obj.frameId).push(formatSlot(obj, machine));
      }
    }

    for (const frame of state.frames) {
      model.frames.push({
        functionName: frame.functionName,
        slots: byFrame.get(frame.id) || [],
      });
    }

    const everySlot = model.globals.concat(
      model.frames.reduce((all, f) => all.concat(f.slots), []));
    for (const slot of everySlot) {
      if (slot.isPointer && slot.target !== null) {
        model.arrows.push({ from: slot.address, to: slot.target });
      }
    }
    return model;
  }

  function describeSlot(slot) {
    if (slot.elements) {
      return slot.typeName + ' ' + slot.name + ' = {'
        + slot.elements.map((e) => e.value).join(', ') + '}';
    }
    const base = slot.typeName + ' ' + slot.name + ' = ' + slot.value;
    if (slot.isPointer && slot.target !== null) {
      return base + ' (points to 0x' + slot.target.toString(16) + ')';
    }
    return base;
  }

  function renderAsText(model) {
    const NL = String.fromCharCode(10);
    const out = [];
    if (model.globals.length) {
      out.push('Globals:');
      for (const slot of model.globals) out.push('  ' + describeSlot(slot));
    }
    for (const frame of model.frames) {
      out.push('Frame ' + frame.functionName + ':');
      if (frame.slots.length === 0) out.push('  (no variables yet)');
      for (const slot of frame.slots) out.push('  ' + describeSlot(slot));
    }
    if (model.heap.length) {
      out.push('Heap:');
      for (const block of model.heap) {
        out.push('  block of ' + block.size + ' bytes at 0x'
          + block.address.toString(16));
      }
    }
    if (out.length === 0) out.push('Nothing is running yet. Press Step to begin.');
    return out.join(NL);
  }
```

For the DOM half: a `<div>` per frame containing a `<div>` per slot carrying a
`data-address`, plus an absolutely positioned `<svg>` overlay whose lines are
computed from `getBoundingClientRect` of the source and target slots. Redraw the
arrows on `update` and on container resize. Give the container `role="img"` with
an `aria-label` holding `renderAsText(model)`, so the diagram is described rather
than opaque.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/trace-panel.test.js`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/trace-panel.js src/renderer/js/trace-interp.js src/renderer/js/trace-machine.js src/renderer/css/app.css test/trace-panel.test.js
git commit -m "Add the Trace memory diagram and its text equivalent"
```

---

## Task 18: Controls, the run loop, and examples

**Files:**
- Create: `src/renderer/js/trace-examples.js`
- Modify: `src/renderer/js/trace-panel.js`, `src/renderer/js/app.js`
- Test: `test/trace-examples.test.js`

**Interfaces:**
- Produces: `EXAMPLES: [{name, description, source, stdin?, expectDiagnostic?}]`; a fully wired Trace pane

The run loop is the only place the step cap meets wall-clock time:

```js
function runLoop() {
  const deadline = Date.now() + 12;   // stay inside one frame
  for (;;) {
    const result = runner.step();
    if (result.done || result.diagnostic) { finish(result); return; }
    if (Date.now() > deadline) break;
  }
  update();
  rafHandle = requestAnimationFrame(runLoop);
}
```

Yielding every 12ms keeps the window responsive and lets Stop work, which is
what makes "a runaway program cannot hang Josh" true in practice rather than
merely in principle.

**Step Forward after a Step Back** triggers the replay from the Task 11
amendment. It is not disabled and needs no warning; it simply works, with a brief
pause on a long program.

Palette entries to add in `app.js`, alongside the existing ones: `New Trace
Pane`, `Trace: Run`, `Trace: Step`, `Trace: Step Back`, `Trace: Reset`, and
`Trace: Open Example...`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Examples = require('../src/renderer/js/trace-examples.js');
const I = require('../src/renderer/js/trace-interp.js');

test('there are enough examples to cover the basics', () => {
  assert.ok(Examples.EXAMPLES.length >= 8, 'got ' + Examples.EXAMPLES.length);
});

test('every example has a name, a description and source', () => {
  for (const example of Examples.EXAMPLES) {
    assert.ok(example.name && example.name.length > 0);
    assert.ok(example.description && example.description.length > 10, example.name);
    assert.ok(example.source && example.source.includes('main'), example.name);
  }
});

test('every example parses without error', () => {
  for (const example of Examples.EXAMPLES) {
    const runner = I.createRunner({ source: example.source, stdin: example.stdin || '' });
    assert.deepStrictEqual(runner.errors, [],
      example.name + ': ' + JSON.stringify(runner.errors));
  }
});

test('every example either runs clean or demonstrates its stated bug', () => {
  for (const example of Examples.EXAMPLES) {
    const runner = I.createRunner({ source: example.source, stdin: example.stdin || '' });
    let result = null;
    for (let i = 0; i < 200000; i += 1) {
      result = runner.step();
      if (result.done) break;
    }
    if (example.expectDiagnostic) {
      assert.ok(result.diagnostic, example.name + ' should raise a diagnostic');
      assert.strictEqual(result.diagnostic.code, example.expectDiagnostic, example.name);
    } else {
      assert.strictEqual(result.diagnostic, null,
        example.name + ': ' + (result.diagnostic && result.diagnostic.terse));
    }
  }
});

test('at least three examples demonstrate a classic mistake', () => {
  const buggy = Examples.EXAMPLES.filter((e) => e.expectDiagnostic);
  assert.ok(buggy.length >= 3, 'got ' + buggy.length);
});

test('example names are unique', () => {
  const names = Examples.EXAMPLES.map((e) => e.name);
  assert.strictEqual(new Set(names).size, names.length);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/trace-examples.test.js`
Expected: FAIL with `Cannot find module '../src/renderer/js/trace-examples.js'`

- [ ] **Step 3: Write the examples and wire the controls**

Ship at least eight, in teaching order, each with a description saying what to
watch in the diagram. Suggested set: hello world; variables and arithmetic; `if`
and comparison; a counting loop; an array and its elements; a function call,
watching the frame appear; pointers, watching the arrow; `malloc` and `free`,
watching the heap. Then at least three that demonstrate a mistake on purpose,
each with `expectDiagnostic`: reading an uninitialised variable
(`uninitialised-read`); running one past the end of an array
(`index-out-of-range`); forgetting to free (`memory-leak`).

Wire the pane: editor on top, then controls, then diagram and output side by
side, with the stdin box below. Persist `getValue()` to `traceProgram` on a
debounce through the existing `settings.set`, and load it when the pane opens.

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/trace-examples.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Try it by hand**

Run: `npm start`

Open a Trace pane, load each example, and confirm: the current line highlights
as it steps; the diagram updates; pointer arrows point at the right slots; Run
completes without freezing the window; Stop interrupts a runaway loop; Step Back
walks backwards and Step Forward then continues correctly; and a diagnostic shows
both messages with the right line marked.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/js/trace-examples.js src/renderer/js/trace-panel.js src/renderer/js/app.js test/trace-examples.test.js
git commit -m "Add Trace controls, the run loop and worked examples"
```

---

## Task 19: Documentation

**Files:**
- Modify: `README.md`, `docs/design.md`

- [ ] **Step 1: Update `README.md`**

Add Trace to the feature list, plus a short section covering: what it is, that it
needs no compiler installed, the subset of C it runs, the built-in library, the
two settings keys, and the limits (1 MiB, 200 frames, 5,000,000 steps). Say
plainly that it is a **teaching simulator, not a C compiler**, so nobody arrives
expecting to run real-world code in it.

- [ ] **Step 2: Update `docs/design.md`**

Add Trace to the architecture notes, recording the four decisions worth
explaining: a pane type rather than a modal panel; the shadow map doing double
duty as both what the diagram draws and what makes undefined behaviour
detectable; generators for stepping; and journal-for-backward plus
replay-for-forward.

While there, fix the pre-existing error on the architecture diagram line, which
reads **"15 channels, fixed allowlist"**. `preload.js` defines 16, which is what
`README.md` already says. Trace adds none, so the correct number stays 16.

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS. The 81 pre-existing tests plus everything from Tasks 1 to 18.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/design.md
git commit -m "Document Trace, and correct the channel count in the design notes"
```

---

## Self-review of this plan

**Spec coverage.** Every section of the design maps to a task: the C subset to
Tasks 1 to 4 and 9 to 13; the machine model to Task 5; the shadow map to Task 6;
the fourteen checks to Task 8, with checks 13 and 14 delivered in Tasks 13 and 11
where they actually arise; the step machine to Tasks 10 and 11; Step Back to Task
7 plus the Task 11 amendment; the pane, editor and diagram to Tasks 15 to 17;
two-message diagnostics throughout; settings to Task 15; testing in every task
plus the corpus in Task 14; documentation to Task 19.

**Two errors were found while writing this plan and are corrected in place**,
both as explicit amendments rather than silent patches:

1. Task 9 made expression evaluation atomic, which would have made function
   calls unsteppable and hidden the stack — the very thing the feature exists to
   show.
2. Task 11 accepted that Step Back could not resume forward. Determinism, which
   the design already guarantees and Task 7 already property-tests, makes replay
   exact, so it can.

**One gap, deliberately accepted and recorded.** The DOM halves of Tasks 16 and
17 are covered by the manual check in Task 18 Step 5, not by automated tests.
Josh has no DOM test harness, and adding one is a larger change than this feature
should carry. The pure model-building beneath both is fully tested, which is
where the logic that can actually be wrong lives.

**Expected test count on completion.** Roughly 200 new tests on top of the
existing 81: about 100 across Tasks 1 to 8, about 100 across Tasks 9 to 14
including the 60 to 80 corpus programs, and about 30 across Tasks 15 to 18.

---

## Amendment to Task 4: refuse unsupported constructs inside function bodies too

**Found while executing Task 4. Apply it as part of that task.**

Task 4 checks `UNSUPPORTED` only in `topLevel`. That catches `union`, which is
written at file scope, and misses everything else: `goto`, `unsigned`, `float`
and `long` all appear **inside function bodies**, which are parsed by
`statement`, not `topLevel`. Four of the five cases in Task 4's own test would
have produced cascading parse errors instead of the clear refusals the spec
promises.

These words lex as **identifiers**, not keywords, which is exactly why they slip
past: nothing in the statement path looks at them.

### The change

Add the same check to the top of `statement()`, before anything else:

```js
  function statement(state) {
    const token = peek(state);

    // Unsupported words lex as identifiers, not keywords, so they must be
    // caught here as well as at the top level: goto, unsigned, float and long
    // all appear inside function bodies, which topLevel never sees.
    if (token.type === 'ident' && Object.prototype.hasOwnProperty.call(
      UNSUPPORTED, token.value)) {
      refuse(state, token, skipStatement);
      return locate({ kind: 'empty' }, token);
    }
    ...
```

`refuse` takes the skip strategy as a parameter, because the two sites need
different recovery, and recovery is what keeps the count at one error per
occurrence rather than a cascade:

```js
  function refuse(state, token, skip) {
    const entry = UNSUPPORTED[token.value];
    state.errors.push({
      code: 'unsupported-construct',
      terse: entry.terse,
      plain: entry.plain,
      locations: [{ line: token.line, col: token.col, length: token.length }],
    });
    take(state);
    skip(state);
  }

  /** Skip to just past the next semicolon, stopping at a closing brace or eof. */
  function skipStatement(state) {
    for (;;) {
      if (at(state, 'eof') || atPunct(state, '}')) return;
      if (atPunct(state, ';')) { take(state); return; }
      take(state);
    }
  }

  /** Skip a whole top-level construct, including any balanced brace group. */
  function skipTopLevel(state) {
    let depth = 0;
    for (;;) {
      if (at(state, 'eof')) return;
      if (atPunct(state, '{')) { depth += 1; take(state); continue; }
      if (atPunct(state, '}')) {
        take(state);
        depth -= 1;
        if (depth <= 0) {
          if (atPunct(state, ';')) take(state);
          return;
        }
        continue;
      }
      if (depth === 0 && atPunct(state, ';')) { take(state); return; }
      take(state);
    }
  }
```

`skipTopLevel` walks the balanced braces so `union U { int a; double b; };`
yields **one** refusal rather than a refusal plus a stray "expected a
declaration" for the leftover tag.

### Test corrections in the same task

Three of Task 4's test sources have no `main`, so the file's own `no-main`
diagnostic fires and `ok()` fails on them. Append
`int main(void) { return 0; }` to the sources in these tests:

- `parameters are named and typed`
- `a pointer parameter`
- `an array parameter decays to a pointer`

Do the same for the `struct`, `enum` and `union` sources.

Task 4's expected result stands at **19 tests**.
