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
  assert.strictEqual(codeOf('int *p = malloc(4); free(p); free(p); return 0;'),
    'double-free');
});

test('freeing a local variable is caught', () => {
  assert.strictEqual(codeOf('int x = 1; free(&x); return 0;'), 'free-of-non-heap');
});

test('free(NULL) is allowed and does nothing', () => {
  assert.strictEqual(outputOf('free(0); printf("ok"); return 0;'), 'ok');
});

test('9. a leak is reported at exit', () => {
  const result = runBody('int *p = malloc(16); return 0;');
  assert.strictEqual(result.diagnostic.code, 'memory-leak');
  assert.ok(/16/.test(result.diagnostic.plain));
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
  assert.strictEqual(codeOf('char d[3]; strcpy(d, "hello"); return 0;'),
    'out-of-bounds-write');
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
  const body = lines('char b[4];', 'memset(b, 65, 4);',
    'printf("%c%c", b[0], b[3]);', 'return 0;');
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
  assert.strictEqual(outputOf(body), outputOf(body),
    'the same program must print the same');
});

test('srand with the same seed reproduces the same sequence', () => {
  const a = outputOf('srand(1); printf("%d", rand()); return 0;');
  const b = outputOf('srand(1); printf("%d", rand()); return 0;');
  const c = outputOf('srand(2); printf("%d", rand()); return 0;');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c, 'a different seed must give a different sequence');
});

test('rand is never negative', () => {
  const body = lines('int bad = 0;', 'for (int i = 0; i < 50; i++) {',
    '  if (rand() < 0) bad = 1;', '}', 'printf("%d", bad);', 'return 0;');
  assert.strictEqual(outputOf(body), '0');
});

test('exit ends the program at once with no leak report', () => {
  const result = runBody('printf("a"); exit(0); printf("b"); return 0;');
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
  const body = lines('int a;', 'int n = scanf("%d", &a);', 'printf("%d", n);',
    'return 0;');
  assert.strictEqual(outputOf(body, '5'), '1');
  assert.strictEqual(outputOf(body, ''), '0');
});

test('getchar walks the input and reports end of input', () => {
  const body = lines('printf("%c", getchar());', 'printf("%c", getchar());',
    'if (getchar() == -1) printf("!");', 'return 0;');
  assert.strictEqual(outputOf(body, 'ab'), 'ab!');
});
