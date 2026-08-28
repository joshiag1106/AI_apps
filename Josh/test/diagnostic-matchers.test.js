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

const GCC_TEMPLATE = [
  'In file included from /usr/include/c++/13/vector:60,\n',
  '                 from src/widget.cpp:1:\n',
  '/usr/include/c++/13/bits/stl_vector.h:1234:7: error: no matching function for call to push_back\n',
  '/usr/include/c++/13/bits/stl_vector.h:1235:9: note: candidate expects 1 argument\n',
  'src/widget.cpp:42:15:   required from here\n',
  '/usr/include/c++/13/bits/stl_algo.h:99:1: note: in instantiation of member function\n',
];

test('the template matcher claims a block that mentions instantiation', () => {
  const claimed = Matchers.cxxTemplate.starts.some((re) =>
    GCC_TEMPLATE.some((line) => re.test(line))
  );
  assert.strictEqual(claimed, true);
});

test('the template matcher reports the error and the user own frame', () => {
  const out = Matchers.cxxTemplate.condense(GCC_TEMPLATE, { cwd: null });
  assert.match(out.headline, /no matching function for call to/);
  assert.strictEqual(out.location, 'src/widget.cpp:42:15');
  assert.strictEqual(out.hiddenCount, GCC_TEMPLATE.length);
});

test('the headline is the error, not a note', () => {
  const lines = [
    '/usr/include/c++/13/vector:10:1: note: candidate here\n',
    '/usr/include/c++/13/vector:11:1: error: the actual problem\n',
    'src/widget.cpp:42:15:   required from here\n',
  ];
  const out = Matchers.cxxTemplate.condense(lines, { cwd: null });
  assert.match(out.headline, /the actual problem/);
});

test('a block with no frame of the user own condenses to null', () => {
  // An error genuinely inside a library. Showing "your code: <nothing>" would
  // be worse than showing the original.
  const lines = [
    '/usr/include/c++/13/vector:10:1: error: in instantiation of something\n',
    '/usr/include/c++/13/bits/stl_algo.h:99:1: note: required from here\n',
  ];
  assert.strictEqual(Matchers.cxxTemplate.condense(lines, { cwd: null }), null);
});

test('a block with no error line at all condenses to null', () => {
  const lines = ['src/widget.cpp:1:1: note: in instantiation of foo\n'];
  assert.strictEqual(Matchers.cxxTemplate.condense(lines, { cwd: null }), null);
});

test('the block ends at a line that is neither a location nor indented', () => {
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['make: *** [all] Error 1\n']), true);
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['src/a.cpp:1:1: note: x\n']), false);
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['    indented continuation\n']), false);
  assert.strictEqual(Matchers.cxxTemplate.isEnd(['\n']), false);
});

const LD_UNDEFINED = [
  '/usr/bin/ld: main.o: in function `main\':\n',
  'main.cpp:(.text+0x1f): undefined reference to `_ZN3vecIiE4pushEi\'\n',
  'collect2: error: ld returned 1 exit status\n',
];

test('the linker matcher claims an undefined-reference block', () => {
  const claimed = Matchers.cxxLinker.starts.some((re) =>
    LD_UNDEFINED.some((line) => re.test(line))
  );
  assert.strictEqual(claimed, true);
});

test('the linker matcher demangles the missing symbol into the headline', () => {
  const out = Matchers.cxxLinker.condense(LD_UNDEFINED, { cwd: null });
  assert.match(out.headline, /link error: undefined reference to/);
  assert.match(out.headline, /vec<int>::push\(int\)/);
  assert.strictEqual(out.hiddenCount, LD_UNDEFINED.length);
});

test('the linker matcher reports what the symbol was referenced from', () => {
  const out = Matchers.cxxLinker.condense(LD_UNDEFINED, { cwd: null });
  assert.match(out.location, /main/);
});

test('a symbol that will not demangle appears mangled rather than wrong', () => {
  const lines = ['/usr/bin/ld: main.o: undefined reference to `_ZQQQnonsense\'\n'];
  const out = Matchers.cxxLinker.condense(lines, { cwd: null });
  assert.match(out.headline, /_ZQQQnonsense/);
});

test('a linker block naming no object file at all condenses to null', () => {
  // Consistent with the template matcher: a summary that cannot say where the
  // symbol was wanted is not worth the transformation.
  const lines = ['/usr/bin/ld: undefined reference to `_ZQQQnonsense\'\n'];
  assert.strictEqual(Matchers.cxxLinker.condense(lines, { cwd: null }), null);
});

test('a duplicate symbol is recognised', () => {
  const lines = ['duplicate symbol `_ZN3foo3barEv\' in:\n', '    a.o\n', '    b.o\n'];
  const out = Matchers.cxxLinker.condense(lines, { cwd: null });
  assert.match(out.headline, /duplicate symbol/);
  assert.match(out.headline, /foo::bar\(\)/);
});

test('a linker block with no recognisable symbol condenses to null', () => {
  const lines = ['/usr/bin/ld: something went wrong\n'];
  assert.strictEqual(Matchers.cxxLinker.condense(lines, { cwd: null }), null);
});

test('the registry consults the template matcher before the linker matcher', () => {
  assert.deepStrictEqual(Matchers.ALL.map((m) => m.id), ['cxx-template', 'cxx-linker']);
});
