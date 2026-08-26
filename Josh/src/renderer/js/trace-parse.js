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

  const UNARY_OPS = Object.freeze(['-', '+', '!', '~', '*', '&', '++', '--']);

  const TYPE_KEYWORDS = Object.freeze(['int', 'char', 'double', 'void', 'struct', 'enum']);

  function parseExpression(tokens, start) {
    const state = { tokens: tokens, index: start, errors: [] };
    const node = parseAssign(state);
    return { node: node, next: state.index, errors: state.errors };
  }

  // --- token helpers -------------------------------------------------------

  function last(tokens) {
    return tokens[tokens.length - 1];
  }
  function peek(state, offset) {
    return state.tokens[state.index + (offset || 0)] || last(state.tokens);
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

    if (token.type === 'punct' && UNARY_OPS.includes(token.value)) {
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
      return locate({
        kind: 'num',
        value: token.value,
        ctype: token.type === 'double' ? 'double' : 'int',
      }, token);
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
    // The eof guard is essential: an unclosed brace must end the loop rather
    // than spin forever.
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
    else {
      error(state, 'expected-token', "expected 'while'",
        'A do loop ends with while and its condition.');
    }
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

    return locate({
      kind: 'for', init: init, test: test, update: update, body: statement(state),
    }, token);
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
          'Everything inside a switch belongs to a case. Start with a case label.');
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
      if (atPunct(state, ']')) {
        dims.push(null); // sized by the initialiser
      } else {
        const size = peek(state);
        if (size.type === 'int') {
          dims.push(take(state).value);
        } else {
          dims.push(null);
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

  return {
    parseExpression, parseStatement, parseDeclarator, declaration,
    PRECEDENCE, ASSIGN_OPS, UNARY_OPS, TYPE_KEYWORDS,
    // Exported for Tasks 3 and 4, which add statement and top-level parsing to
    // this same file and need the same helpers and the same state object.
    internals: {
      peek, at, atPunct, take, expectPunct, error, locate,
      parseAssign, parseTypeName, parseBaseType, startsType,
      statement, block, declaration, initialiserList, resolveArrayLength,
    },
  };
});
