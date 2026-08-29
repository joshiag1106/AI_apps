'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { menuTemplate } = require('../src/main/menu-template.js');

/*
 * The template is a separate module from menu.js precisely so it can be
 * required without Electron. Nothing asserted these accelerators before, and
 * `CmdOrCtrl+Plus` shipped in a documented shortcut table without ever firing.
 */
function build(overrides) {
  return menuTemplate(Object.assign({
    isMac: true,
    appName: 'Josh',
    packaged: true,
    emit: (action) => () => action,
    onNewWindow: () => {},
    openSettingsFile: () => {},
    openExternal: () => {},
  }, overrides || {}));
}

/** Every item in the template, flattened out of its submenus. */
function items(template) {
  const out = [];
  const walk = (list) => {
    for (const item of list) {
      out.push(item);
      if (Array.isArray(item.submenu)) walk(item.submenu);
    }
  };
  walk(template);
  return out;
}

const withAccelerator = (template, accel) =>
  items(template).filter((i) => i.accelerator === accel);

test('the template builds without Electron present', () => {
  assert.ok(Array.isArray(build()), 'menuTemplate must be a pure data builder');
});

/*
 * `CmdOrCtrl+Plus` binds the literal '+', which needs Shift on the main row.
 * Zoom out and reset always worked; zoom in never fired, on any platform.
 */
test('ZOOM IN IS BOUND TO THE KEY PEOPLE ACTUALLY PRESS', () => {
  const zoom = withAccelerator(build(), 'CmdOrCtrl+=');
  assert.strictEqual(zoom.length, 1, 'exactly one item owns CmdOrCtrl+=');
  assert.strictEqual(zoom[0].label, 'Zoom In');
});

/*
 * Both a hidden alias and acceleratorWorksWhenHidden were tried for the
 * shifted '+' and neither fired against a running app. Zoom in has exactly
 * one binding, because a documented shortcut that does nothing is the bug.
 */
test('PLUS IS NOT BOUND AT ALL, because it never fired', () => {
  assert.strictEqual(withAccelerator(build(), 'CmdOrCtrl+Plus').length, 0);
});

test('nothing is bound to an accelerator on a hidden item', () => {
  const hidden = items(build()).filter((i) => i.visible === false && i.accelerator);
  assert.deepStrictEqual(hidden, [], 'hidden items do not register accelerators here');
});

test('zoom out and reset keep the bindings they always had', () => {
  const t = build();
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+-')[0].label, 'Zoom Out');
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+0')[0].label, 'Actual Size');
});

test('line height has its own three bindings, clear of the font size ones', () => {
  const t = build();
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+Alt+=').length, 1);
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+Alt+-').length, 1);
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+Alt+0').length, 1);
});

test('the themes cycle both ways', () => {
  const t = build();
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+Alt+]').length, 1);
  assert.strictEqual(withAccelerator(t, 'CmdOrCtrl+Alt+[').length, 1);
});

/*
 * A shortcut that fires two commands is worse than one that fires none: the
 * user cannot tell which they got.
 */
test('NO ACCELERATOR IS CLAIMED TWICE', () => {
  for (const isMac of [true, false]) {
    const used = items(build({ isMac })).map((i) => i.accelerator).filter(Boolean);
    const twice = used.filter((a, i) => used.indexOf(a) !== i);
    assert.deepStrictEqual(twice, [], 'duplicate accelerator on isMac=' + isMac);
  }
});

test('the dev tools item appears only in an unpackaged build', () => {
  const roles = (packaged) => items(build({ packaged })).map((i) => i.role);
  assert.ok(!roles(true).includes('toggleDevTools'));
  assert.ok(roles(false).includes('toggleDevTools'));
});
