'use strict';

const test = require('node:test');
const assert = require('node:assert');

const SplitTree = require('../src/renderer/js/split-tree.js');

test('a fresh tree is a single leaf', () => {
  const tree = SplitTree.leaf('a');
  assert.deepStrictEqual(SplitTree.leaves(tree), ['a']);
  assert.strictEqual(SplitTree.firstLeaf(tree), 'a');
});

test('splitting a leaf produces an even two-pane split', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  assert.strictEqual(tree.type, 'split');
  assert.strictEqual(tree.direction, 'row');
  assert.deepStrictEqual(tree.sizes, [0.5, 0.5]);
  assert.deepStrictEqual(SplitTree.leaves(tree), ['a', 'b']);
});

test('an unknown direction falls back to row rather than corrupting the tree', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'diagonal');
  assert.strictEqual(tree.direction, 'row');
});

test('splitting is immutable', () => {
  const original = SplitTree.leaf('a');
  const before = JSON.stringify(original);
  SplitTree.splitLeaf(original, 'a', 'b', 'row');
  assert.strictEqual(JSON.stringify(original), before);
});

test('splitting a nested leaf leaves its siblings untouched', () => {
  let tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  tree = SplitTree.splitLeaf(tree, 'b', 'c', 'column');
  assert.deepStrictEqual(SplitTree.leaves(tree), ['a', 'b', 'c']);
  assert.strictEqual(tree.children[0].id, 'a');
  assert.strictEqual(tree.children[1].direction, 'column');
});

test('splitting a leaf that is not present changes nothing', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'zzz', 'b', 'row');
  assert.deepStrictEqual(SplitTree.leaves(tree), ['a']);
});

test('removing one of two panes collapses the split away', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  const after = SplitTree.removeLeaf(tree, 'b');
  assert.strictEqual(after.type, 'leaf');
  assert.strictEqual(after.id, 'a');
});

test('removing the last pane yields null so the tab can close', () => {
  assert.strictEqual(SplitTree.removeLeaf(SplitTree.leaf('a'), 'a'), null);
});

test('nested splits collapse correctly, leaving no empty scaffolding', () => {
  let tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  tree = SplitTree.splitLeaf(tree, 'b', 'c', 'column');
  tree = SplitTree.removeLeaf(tree, 'c');
  assert.deepStrictEqual(SplitTree.leaves(tree), ['a', 'b']);
  tree = SplitTree.removeLeaf(tree, 'a');
  assert.strictEqual(tree.type, 'leaf');
  assert.strictEqual(tree.id, 'b');
});

test('removing an absent id is a no-op', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  assert.deepStrictEqual(SplitTree.leaves(SplitTree.removeLeaf(tree, 'zzz')), ['a', 'b']);
});

test('contains reports membership', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  assert.strictEqual(SplitTree.contains(tree, 'b'), true);
  assert.strictEqual(SplitTree.contains(tree, 'q'), false);
});

test('resize clamps so a pane can never be dragged out of existence', () => {
  const tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  assert.deepStrictEqual(SplitTree.resize(tree, 'root', -5).sizes, [
    SplitTree.MIN_SIZE,
    1 - SplitTree.MIN_SIZE,
  ]);
  assert.deepStrictEqual(SplitTree.resize(tree, 'root', 99).sizes, [
    1 - SplitTree.MIN_SIZE,
    SplitTree.MIN_SIZE,
  ]);
  assert.deepStrictEqual(SplitTree.resize(tree, 'root', 0.25).sizes, [0.25, 0.75]);
});

test('resize targets only the addressed split', () => {
  let tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  tree = SplitTree.splitLeaf(tree, 'b', 'c', 'column');
  const after = SplitTree.resize(tree, 'root.1', 0.3);
  assert.deepStrictEqual(after.sizes, [0.5, 0.5]); // root untouched
  assert.deepStrictEqual(after.children[1].sizes, [0.3, 0.7]);
});

test('neighbourOf picks the pane that should take focus next', () => {
  let tree = SplitTree.splitLeaf(SplitTree.leaf('a'), 'a', 'b', 'row');
  tree = SplitTree.splitLeaf(tree, 'b', 'c', 'row');
  assert.strictEqual(SplitTree.neighbourOf(tree, 'a'), 'b');
  assert.strictEqual(SplitTree.neighbourOf(tree, 'c'), 'b');
  assert.strictEqual(SplitTree.neighbourOf(tree, 'missing'), null);
});

test('neighbourOf on a lone leaf has nowhere to go', () => {
  assert.strictEqual(SplitTree.neighbourOf(SplitTree.leaf('a'), 'a'), null);
});

test('a deep chain of splits and removals stays consistent', () => {
  let tree = SplitTree.leaf('p0');
  for (let i = 1; i < 12; i += 1) {
    tree = SplitTree.splitLeaf(tree, 'p' + (i - 1), 'p' + i, i % 2 ? 'row' : 'column');
  }
  assert.strictEqual(SplitTree.leaves(tree).length, 12);
  for (let i = 0; i < 11; i += 1) {
    tree = SplitTree.removeLeaf(tree, 'p' + i);
  }
  assert.strictEqual(tree.type, 'leaf');
  assert.strictEqual(tree.id, 'p11');
  assert.strictEqual(SplitTree.removeLeaf(tree, 'p11'), null);
});
