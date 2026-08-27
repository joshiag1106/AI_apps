'use strict';
const test = require('node:test');
const assert = require('node:assert');

const KitPreview = require('../src/renderer/js/kit-preview.js');
const KitThemes = require('../src/shared/kit-themes.js');
const KitRender = require('../src/shared/kit-render.js');
const Themes = require('../src/renderer/js/themes.js');

const TOKYO = Themes.THEMES['Tokyo Night'];

const OPTIONS = {
  cwd: '/home/ada/src/josh',
  home: '/home/ada',
  user: 'ada',
  host: 'lovelace',
  ui: TOKYO.ui,
  xterm: TOKYO.xterm,
  glyphs: 'plain',
  selected: 'classic',
};

function model(overrides) {
  return KitPreview.previewModel(Object.assign({}, OPTIONS, overrides || {}));
}

/* ------------------------------------------------------------------ rows */

test('there is one row per theme, in the order the themes ship', () => {
  assert.deepStrictEqual(model().rows.map((row) => row.name), KitThemes.themeNames());
});

test('the current theme is the one marked selected, and only it', () => {
  const rows = model({ selected: 'rail' }).rows;
  assert.deepStrictEqual(rows.filter((row) => row.selected).map((row) => row.name), ['rail']);
});

test('a selection naming no theme leaves every row unselected', () => {
  assert.strictEqual(model({ selected: 'nonsense' }).rows.some((row) => row.selected), false);
});

/* -------------------------------------------------------------- previews */

test('every row carries both exit states in both glyph modes', () => {
  for (const row of model().rows) {
    assert.strictEqual(row.previews.length, 4, row.name);
    const seen = row.previews.map((p) => p.glyphs + ':' + p.exit).sort();
    assert.deepStrictEqual(seen, ['plain:0', 'plain:127', 'rich:0', 'rich:127'], row.name);
  }
});

test('a preview carries the spans renderPreview produced, not a re-rendering', () => {
  const row = model().rows.find((r) => r.name === 'classic');
  const preview = row.previews.find((p) => p.glyphs === 'plain' && p.exit === 0);

  const expected = KitRender.renderPreview(
    KitThemes.THEMES.classic,
    {
      user: 'ada', host: 'lovelace', cwd: OPTIONS.cwd, home: OPTIONS.home,
      exit: 0, durationMs: 4200, jobs: 0, time: '', venv: '',
      git: KitPreview.SAMPLE_GIT,
    },
    { ui: TOKYO.ui, xterm: TOKYO.xterm, glyphs: 'plain' }
  );

  assert.deepStrictEqual(preview.lines, expected.lines);
});

test('the failing state actually shows the failure the working one hides', () => {
  const row = model().rows.find((r) => r.name === 'classic');
  const text = (exit) => row.previews
    .find((p) => p.glyphs === 'plain' && p.exit === exit)
    .lines.map((line) => line.map((span) => span.text).join('')).join('');

  assert.match(text(127), /127/, 'a failing prompt should show its code');
  assert.strictEqual(text(0).includes('127'), false);
});

test('rich and plain previews really differ, so the choice means something', () => {
  const row = model().rows.find((r) => r.name === 'rail');
  const text = (glyphs) => row.previews
    .find((p) => p.glyphs === glyphs && p.exit === 0)
    .lines.map((line) => line.map((span) => span.text).join('')).join('');

  assert.notStrictEqual(text('rich'), text('plain'));
  assert.ok(text('rich').includes(KitThemes.SEPARATOR_RIGHT));
  assert.strictEqual(text('plain').includes(KitThemes.SEPARATOR_RIGHT), false);
});

test('a multiline theme previews as more than one line', () => {
  const stack = model().rows.find((r) => r.name === 'stack');
  assert.strictEqual(stack.multiline, true);
  assert.strictEqual(stack.previews[0].lines.length, 2);

  const plain = model().rows.find((r) => r.name === 'plain');
  assert.strictEqual(plain.multiline, false);
  assert.strictEqual(plain.previews[0].lines.length, 1);
});

test('every span carries a colour from the theme it was given', () => {
  const slots = new Set(Object.values(KitRender.resolveSlots(TOKYO.ui, TOKYO.xterm)));
  for (const row of model().rows) {
    for (const preview of row.previews) {
      for (const line of preview.lines) {
        for (const span of line) {
          assert.ok(slots.has(span.colour), row.name + ' ' + span.colour);
        }
      }
    }
  }
});

test('a different colour theme really changes the preview colours', () => {
  const dracula = Themes.THEMES.Dracula;
  const other = model({ ui: dracula.ui, xterm: dracula.xterm });
  const mine = model();
  const colours = (m) => m.rows[0].previews[0].lines[0].map((span) => span.colour).join(',');
  assert.notStrictEqual(colours(other), colours(mine));
});

/* ---------------------------------------------------------- what is real */

test('the working directory is the pane real one, collapsed against real home', () => {
  // stack does not truncate, so the collapsed home survives into the preview.
  const text = model().rows
    .find((row) => row.name === 'stack')
    .previews[0].lines[0].map((span) => span.text).join('');
  assert.match(text, /~\/src\/josh/, 'the tilde must come from the real home');
  assert.strictEqual(text.includes('/home/ada'), false, 'and the home must not be spelled out');
});

test('a theme that truncates elides the tilde along with the rest', () => {
  // plain keeps two trailing components, so ~ is one of the parts dropped.
  const text = model().rows
    .find((row) => row.name === 'plain')
    .previews[0].lines[0].map((span) => span.text).join('');
  assert.match(text, /\.\.\.\/src\/josh/);
});

/* -------------------------------------------------------- what is sampled */

test('the sampled git state is the one the plan fixes', () => {
  assert.strictEqual(KitPreview.SAMPLE_GIT.branch, 'main');
  assert.strictEqual(KitPreview.SAMPLE_GIT.staged, 1);
  assert.strictEqual(KitPreview.SAMPLE_GIT.unstaged, 2);
  assert.strictEqual(KitPreview.SAMPLE_GIT.ahead, 1);
});

test('the sample is labelled as a sample rather than passed off as real', () => {
  const out = model();
  assert.strictEqual(typeof out.sampleLabel, 'string');
  assert.match(out.sampleLabel, /sample/i);
  assert.deepStrictEqual(out.sampleGit, KitPreview.SAMPLE_GIT);
});

test('the panel is told which mode was detected, so it can lead with it', () => {
  assert.strictEqual(model({ glyphs: 'rich' }).detected, 'rich');
  assert.strictEqual(model({ glyphs: 'plain' }).detected, 'plain');
  assert.strictEqual(model({ glyphs: 'nonsense' }).detected, 'plain');
});

test('previewsFor narrows a row to the mode actually in use', () => {
  const row = model().rows[0];
  assert.strictEqual(KitPreview.previewsFor(row, 'rich').length, 2);
  assert.ok(KitPreview.previewsFor(row, 'rich').every((p) => p.glyphs === 'rich'));
  assert.ok(KitPreview.previewsFor(row, 'anything').every((p) => p.glyphs === 'plain'));
});

/* --------------------------------------------------------------- robustness */

test('a model built from nothing at all does not throw', () => {
  assert.doesNotThrow(() => KitPreview.previewModel());
  assert.doesNotThrow(() => KitPreview.previewModel(null));
  const out = KitPreview.previewModel();
  assert.strictEqual(out.rows.length, KitThemes.themeNames().length);
});
