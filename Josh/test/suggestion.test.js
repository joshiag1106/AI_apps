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
