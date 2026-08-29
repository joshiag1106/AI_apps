'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Suggestion = require('../src/renderer/js/suggestion.js');

test('a shown suggestion is readable back', () => {
  const s = new Suggestion.Suggestion({});
  s.show('test --release');
  assert.strictEqual(s.text(), 'test --release');
});

test('an empty suggestion clears', () => {
  const s = new Suggestion.Suggestion({});
  s.show('x');
  s.show('');
  assert.strictEqual(s.text(), '');
});

test('accept returns the text and clears it', () => {
  const s = new Suggestion.Suggestion({});
  s.show('test --release');
  assert.strictEqual(s.accept(), 'test --release');
  assert.strictEqual(s.text(), '');
});

test('accepting nothing returns the empty string, never undefined', () => {
  assert.strictEqual(new Suggestion.Suggestion({}).accept(), '');
});

test('DISMISS SUPPRESSES UNTIL THE NEXT SHOW', () => {
  // Esc means "not now". It must not mean "never again this session".
  const s = new Suggestion.Suggestion({});
  s.show('one');
  s.dismiss();
  assert.strictEqual(s.text(), '');
  s.show('two');
  assert.strictEqual(s.text(), 'two');
});

test('a non-string suggestion is treated as a clear', () => {
  const s = new Suggestion.Suggestion({});
  s.show('x');
  s.show(null);
  assert.strictEqual(s.text(), '');
});

test('TAB IS NOT AN ACCEPT KEY', () => {
  // Tab belongs to the shell's own completion. Stealing it would break every
  // existing muscle memory.
  assert.ok(Suggestion.ACCEPT_KEYS.includes('ArrowRight'));
  assert.ok(Suggestion.ACCEPT_KEYS.includes('End'));
  assert.ok(!Suggestion.ACCEPT_KEYS.includes('Tab'), 'Tab must stay with the shell');
});

test('the module loads as a browser global, not only as CommonJS', () => {
  // Every other test require()s this file; the app loads it as a script tag
  // onto window, which is the other branch of the UMD wrapper and the one
  // that ships. A wrong global name would crash the renderer at startup with
  // the whole suite still green.
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const sandbox = { self: null, window: null };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'suggestion.js'), 'utf8'),
    sandbox, { filename: 'suggestion.js' }
  );
  // The exact expressions terminal-pane.js evaluates.
  assert.strictEqual(typeof sandbox.Suggestion.Suggestion, 'function');
  assert.ok(Array.isArray(sandbox.Suggestion.ACCEPT_KEYS));
  assert.ok(!sandbox.Suggestion.ACCEPT_KEYS.includes('Tab'));
});

test('index.html loads suggestion.js before the pane that constructs it', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8'
  );
  assert.ok(html.indexOf('js/suggestion.js') !== -1, 'suggestion.js must be loaded');
  assert.ok(
    html.indexOf('js/suggestion.js') < html.indexOf('js/terminal-pane.js'),
    'suggestion.js must load before terminal-pane.js'
  );
});

/* ------------------------------------------------------------ ghost in DOM */

/*
 * The suggestion was computed, delivered and rendered into a span that was
 * never put in the document: _render set textContent and nothing ever called
 * appendChild. Every test above passes on a detached element, which is how a
 * permanently invisible feature stayed green.
 */

/** Just enough DOM to tell attached from detached. */
function fakeDom() {
  const node = () => ({
    className: '',
    textContent: '',
    style: {},
    parentNode: null,
    children: [],
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    },
  });
  return { document: { createElement: node }, host: node() };
}

test('a shown suggestion is put into the host it was mounted on', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.show('us --short');
  assert.strictEqual(host.children.length, 1, 'the ghost must be in the document');
  assert.strictEqual(host.children[0].textContent, 'us --short');
});

test('the ghost is placed where the caller says the cursor is', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.show('us --short', { left: 96, top: 34 });
  assert.strictEqual(host.children[0].style.left, '96px');
  assert.strictEqual(host.children[0].style.top, '34px');
});

test('clearing takes the ghost back out of the document', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.show('us --short');
  s.show('');
  assert.strictEqual(host.children.length, 0, 'a cleared ghost must not linger');
});

test('a second suggestion replaces the first rather than stacking', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.show('one');
  s.show('two');
  assert.strictEqual(host.children.length, 1, 'exactly one ghost at a time');
  assert.strictEqual(host.children[0].textContent, 'two');
});

test('an unmounted suggestion still works, and does not throw', () => {
  const { document } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.show('us --short');
  assert.strictEqual(s.text(), 'us --short', 'the value survives with nowhere to draw it');
});

/*
 * The ghost sits over a canvas the terminal drew. If it does not use the
 * terminal's own font it is the wrong width per character, so it neither
 * lines up nor reads as a continuation of what was typed. `font: inherit`
 * inherits the app chrome's sans-serif, not the terminal's.
 */
test('the ghost draws in the font it was given, not the one it inherits', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.setFont({ family: 'JetBrains Mono, monospace', size: 14, letterSpacing: 0 });
  s.show('us --short');
  const style = host.children[0].style;
  assert.strictEqual(style.fontFamily, 'JetBrains Mono, monospace');
  assert.strictEqual(style.fontSize, '14px');
  assert.strictEqual(style.letterSpacing, '0px');
});

test('a font set after the ghost is showing reaches the element already drawn', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.show('us --short');
  s.setFont({ family: 'Fira Code', size: 18, letterSpacing: 1 });
  assert.strictEqual(host.children[0].style.fontSize, '18px', 'a settings change must apply live');
});

/*
 * The suggestion is computed from what was written to the shell, which is
 * earlier than the terminal echoing it back. Placed at that moment the ghost
 * sits one cell behind the cursor, overlapping the character just typed --
 * measured 8px adrift. So the pane re-places it when the cursor actually
 * moves, and this is what that costs the object.
 */
test('a ghost already showing can be moved to where the cursor ended up', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.show('us --short', { left: 100, top: 40 });
  s.place({ left: 108, top: 40 });
  assert.strictEqual(host.children[0].style.left, '108px');
});

test('placing with nothing to show draws no ghost', () => {
  const { document, host } = fakeDom();
  const s = new Suggestion.Suggestion({ document });
  s.mount(host);
  s.place({ left: 108, top: 40 });
  assert.strictEqual(host.children.length, 0, 'a cursor move alone must not conjure a ghost');
});
