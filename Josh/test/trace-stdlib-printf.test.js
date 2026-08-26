'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/renderer/js/trace-interp.js');

const NL = String.fromCharCode(10);
function lines() {
  return Array.prototype.slice.call(arguments).join(NL);
}

function runBody(body) {
  const runner = I.createRunner({ source: 'int main(void) {' + NL + body + NL + '}' });
  assert.deepStrictEqual(runner.errors, [], JSON.stringify(runner.errors));
  for (let i = 0; i < 20000; i += 1) {
    const result = runner.step();
    if (result.done) {
      return { output: runner.state().output.join(''), diagnostic: result.diagnostic };
    }
  }
  throw new Error('did not terminate');
}

function outputOf(body) {
  const result = runBody(body);
  assert.strictEqual(result.diagnostic, null,
    result.diagnostic && result.diagnostic.terse);
  return result.output;
}

function diagnosticOf(body) {
  const result = runBody(body);
  assert.ok(result.diagnostic, 'expected a diagnostic');
  return result.diagnostic;
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

test('%f rounds half to even, as C does and JavaScript does not', () => {
  assert.strictEqual(outputOf('printf("%.0f", 2.5); return 0;'), '2');
  assert.strictEqual(outputOf('printf("%.0f", 3.5); return 0;'), '4');
  assert.strictEqual(outputOf('printf("%.0f", 1.5); return 0;'), '2');
});

test('%p prints an address', () => {
  const out = outputOf('int x = 1; printf("%p", &x); return 0;');
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

test('zero padding keeps a sign in front of the zeros', () => {
  assert.strictEqual(outputOf('printf("[%05d]", 42); return 0;'), '[00042]');
  assert.strictEqual(outputOf('printf("[%05d]", -42); return 0;'), '[-0042]');
});

test('precision on a double', () => {
  assert.strictEqual(outputOf('printf("%.2f", 3.14159); return 0;'), '3.14');
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
  const body = lines('char s[2];', 's[0] = 104;', 's[1] = 105;',
    'printf("%s", s);', 'return 0;');
  const d = diagnosticOf(body);
  assert.strictEqual(d.code, 'out-of-bounds-read');
  assert.ok(d.plain.includes('s'), 'name the array that was overrun');
});

test('%s on an uninitialised array is caught', () => {
  assert.strictEqual(
    diagnosticOf('char s[4]; printf("%s", s); return 0;').code,
    'uninitialised-read'
  );
});

test('output accumulates across calls in order', () => {
  assert.strictEqual(outputOf('printf("a"); printf("b"); printf("c"); return 0;'), 'abc');
});

test('output is not duplicated by a rewind and replay', () => {
  const source = lines('int main(void) {', '  printf("a");', '  printf("b");',
    '  return 0;', '}');
  const runner = I.createRunner({ source: source });
  for (let i = 0; i < 6; i += 1) runner.step();
  runner.undo();
  runner.step();
  const text = runner.state().output.join('');
  assert.strictEqual(text.split('a').length - 1, 1, "'a' must appear exactly once");
});
