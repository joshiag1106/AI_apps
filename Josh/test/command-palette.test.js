'use strict';

const test = require('node:test');
const assert = require('node:assert');

const CommandPalette = require('../src/renderer/js/command-palette.js');
const { score, filter } = CommandPalette;

const command = (label) => ({ label, run() {} });

test('an empty query matches everything', () => {
  assert.strictEqual(score('', 'Split Right'), 0);
});

test('subsequence matching finds abbreviations', () => {
  assert.notStrictEqual(score('sr', 'Split Right'), null);
  assert.notStrictEqual(score('splr', 'Split Right'), null);
});

test('letters in the wrong order do not match', () => {
  assert.strictEqual(score('rs', 'Split'), null);
  assert.strictEqual(score('zzz', 'Split Right'), null);
});

test('matching is case-insensitive', () => {
  assert.notStrictEqual(score('SR', 'Split Right'), null);
  assert.notStrictEqual(score('sr', 'SPLIT RIGHT'), null);
});

test('contiguous matches score better than scattered ones', () => {
  // Lower is better; "New Tab" contains "ne" adjacently.
  assert.ok(score('ne', 'New Tab') < score('ne', 'Nord Elsewhere'));
});

test('filter ranks the tighter match first', () => {
  const results = filter([command('Reset Zoom'), command('Zoom In')], 'zoom');
  assert.strictEqual(results[0].label, 'Zoom In');
});

test('filter returns nothing when there is no match', () => {
  assert.deepStrictEqual(filter([command('New Tab')], 'qqqq'), []);
});

test('an empty query returns the list unfiltered', () => {
  assert.strictEqual(filter([command('New Tab'), command('Close Tab')], '').length, 2);
});

test('results are capped so the palette cannot render thousands of rows', () => {
  const many = Array.from({ length: 500 }, (_, i) => command('Command ' + i));
  assert.strictEqual(filter(many, '').length, 60);
  assert.strictEqual(filter(many, 'command').length, 60);
});

test('equal scores break alphabetically, so ordering is stable between openings', () => {
  assert.deepStrictEqual(
    filter([command('Beta'), command('Alpha')], 'a').map((c) => c.label),
    ['Alpha', 'Beta']
  );
});

test('filtering never mutates the command list it was given', () => {
  const commands = [command('Zoom In'), command('New Tab')];
  const before = commands.map((c) => c.label);
  filter(commands, 'zoom');
  assert.deepStrictEqual(
    commands.map((c) => c.label),
    before
  );
});
