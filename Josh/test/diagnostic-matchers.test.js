'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Matchers = require('../src/renderer/js/diagnostic-matchers.js');

test('the shared compiler line shape parses', () => {
  const out = Matchers.parseLocation('src/widget.cpp:42:15: error: no matching function\n');
  assert.deepStrictEqual(out, {
    path: 'src/widget.cpp',
    line: 42,
    column: 15,
    severity: 'error',
    message: 'no matching function',
  });
});

test('a location without a column still parses', () => {
  const out = Matchers.parseLocation('main.cpp:7: warning: unused variable\n');
  assert.strictEqual(out.path, 'main.cpp');
  assert.strictEqual(out.line, 7);
  assert.strictEqual(out.column, null);
  assert.strictEqual(out.severity, 'warning');
});

test('an absolute Windows path parses despite the drive colon', () => {
  const out = Matchers.parseLocation('C:\\src\\widget.cpp:42:15: error: boom\n');
  assert.strictEqual(out.path, 'C:\\src\\widget.cpp');
  assert.strictEqual(out.line, 42);
});

test('a line that is not a location returns null', () => {
  assert.strictEqual(Matchers.parseLocation('just some text\n'), null);
  assert.strictEqual(Matchers.parseLocation('make: *** [all] Error 1\n'), null);
});

test('SGR colour does not prevent a location from parsing', () => {
  const out = Matchers.parseLocation('\x1b[1msrc/a.cpp:1:1:\x1b[0m \x1b[31merror:\x1b[0m boom\n');
  assert.strictEqual(out.path, 'src/a.cpp');
  assert.strictEqual(out.severity, 'error');
});

test('standard library paths are vendor paths', () => {
  assert.strictEqual(Matchers.isVendorPath('/usr/include/c++/13/vector'), true);
  assert.strictEqual(Matchers.isVendorPath('/usr/include/x86_64-linux-gnu/bits/stl_vector.h'), true);
  assert.strictEqual(Matchers.isVendorPath('/Library/Developer/CommandLineTools/usr/include/c++/v1/vector'), true);
  assert.strictEqual(Matchers.isVendorPath('C:\\Program Files\\MSVC\\include\\vector'), true);
});

test('the user own source is not a vendor path', () => {
  assert.strictEqual(Matchers.isVendorPath('src/widget.cpp'), false);
  assert.strictEqual(Matchers.isVendorPath('/home/me/project/main.cpp'), false);
});

test('the user frame is the first non-vendor path', () => {
  const frames = [
    '/usr/include/c++/13/vector',
    '/usr/include/c++/13/bits/stl_vector.h',
    'src/widget.cpp',
    'src/other.cpp',
  ];
  assert.strictEqual(Matchers.pickUserFrame(frames, null), 'src/widget.cpp');
});

test('a path under the working directory is preferred over one that is not', () => {
  // Both are non-vendor, but the one inside the project is far more likely to
  // be what the user is actually editing.
  const frames = ['/opt/thirdparty/src/lib.cpp', '/home/me/project/src/widget.cpp'];
  assert.strictEqual(
    Matchers.pickUserFrame(frames, '/home/me/project'),
    '/home/me/project/src/widget.cpp'
  );
});

test('when every frame is a vendor path there is no user frame', () => {
  // This is the case where condense() must return null: a summary that cannot
  // point at the user's code is not worth the transformation.
  const frames = ['/usr/include/c++/13/vector', '/usr/include/c++/13/bits/stl_algo.h'];
  assert.strictEqual(Matchers.pickUserFrame(frames, '/home/me/project'), null);
});

test('the registry is an array so matchers are consulted in order', () => {
  assert.ok(Array.isArray(Matchers.ALL));
});
