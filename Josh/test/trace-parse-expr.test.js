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
