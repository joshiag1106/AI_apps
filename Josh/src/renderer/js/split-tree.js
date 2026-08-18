/**
 * Immutable binary tree describing how a tab's panes are arranged.
 *
 * Two node shapes:
 *   leaf  { type: 'leaf',  id }
 *   split { type: 'split', direction: 'row'|'column', children: [a, b], sizes: [x, y] }
 *
 * `row` places children side by side (a vertical divider between them),
 * `column` stacks them. Every operation returns a new tree rather than
 * mutating, which keeps the structure trivial to reason about and to test.
 *
 * Written as a UMD module so the browser can load it as a plain script while
 * the test suite can require() the exact same file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SplitTree = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_SIZE = 0.1;

  function leaf(id) {
    return { type: 'leaf', id: id };
  }

  function isLeaf(node) {
    return Boolean(node) && node.type === 'leaf';
  }

  /**
   * Replace the leaf `targetId` with a split containing it plus a new leaf.
   * Returns the original tree unchanged if the target is not present.
   */
  function splitLeaf(tree, targetId, newId, direction) {
    if (!tree) return leaf(newId);
    if (isLeaf(tree)) {
      if (tree.id !== targetId) return tree;
      return {
        type: 'split',
        direction: direction === 'column' ? 'column' : 'row',
        children: [leaf(tree.id), leaf(newId)],
        sizes: [0.5, 0.5],
      };
    }
    return {
      ...tree,
      children: tree.children.map((child) => splitLeaf(child, targetId, newId, direction)),
    };
  }

  /**
   * Remove a leaf. When a split is left with one child, the split collapses
   * and is replaced by that child, so the tree never keeps empty scaffolding.
   * Returns null when the last remaining leaf is removed.
   */
  function removeLeaf(tree, id) {
    if (!tree) return null;
    if (isLeaf(tree)) return tree.id === id ? null : tree;

    const kept = tree.children
      .map((child) => removeLeaf(child, id))
      .filter((child) => child !== null);

    if (kept.length === 0) return null;
    if (kept.length === 1) return kept[0];
    return { ...tree, children: kept };
  }

  /** All leaf ids, left to right / top to bottom. */
  function leaves(tree) {
    if (!tree) return [];
    if (isLeaf(tree)) return [tree.id];
    return tree.children.reduce((acc, child) => acc.concat(leaves(child)), []);
  }

  function firstLeaf(tree) {
    const all = leaves(tree);
    return all.length ? all[0] : null;
  }

  function contains(tree, id) {
    return leaves(tree).indexOf(id) !== -1;
  }

  /**
   * Adjust the split ratio of one node, addressed by its path from the root.
   * `ratio` is clamped so neither pane can be dragged out of existence.
   */
  /** Round to 4 decimals so binary floating point noise never accumulates. */
  function round(value) {
    return Math.round(value * 10000) / 10000;
  }

  function resize(tree, splitPath, ratio) {
    const clamped = round(Math.min(1 - MIN_SIZE, Math.max(MIN_SIZE, ratio)));
    function walk(node, path) {
      if (!node || isLeaf(node)) return node;
      if (path === splitPath) return { ...node, sizes: [clamped, round(1 - clamped)] };
      return {
        ...node,
        children: node.children.map((child, index) => walk(child, path + '.' + index)),
      };
    }
    return walk(tree, 'root');
  }

  /** The leaf that should take focus after `id` is closed. */
  function neighbourOf(tree, id) {
    const all = leaves(tree);
    const index = all.indexOf(id);
    if (index === -1) return null;
    return all[index + 1] || all[index - 1] || null;
  }

  return {
    MIN_SIZE,
    leaf,
    isLeaf,
    splitLeaf,
    removeLeaf,
    leaves,
    firstLeaf,
    contains,
    resize,
    neighbourOf,
  };
});
