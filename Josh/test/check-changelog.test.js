'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { findRelease, describe } = require('../scripts/check-changelog.js');

/*
 * 1.0.5 was folded out of [Unreleased] by hand. Nothing made that a step, so
 * the next release can ship with a stale or empty section and every test will
 * still pass -- the same shape as the shortcut that was documented and dead.
 */

const CHANGELOG = [
  '# Changelog',
  '',
  'Preamble that mentions 1.0.5 in passing.',
  '',
  '## [Unreleased]',
  '',
  '## [1.0.5] — 2026-08-29',
  '',
  '### Fixed',
  '',
  '- The thing that was broken.',
  '',
  '## [1.0.4] — 2026-08-29',
  '',
  '### Added',
  '',
  '- Recall.',
  '',
  '[1.0.5]: https://example.invalid/v1.0.5',
].join('\n');

test('a released version is found with its body', () => {
  const found = findRelease(CHANGELOG, '1.0.5');
  assert.ok(found, '1.0.5 has a section');
  assert.match(found.body, /The thing that was broken/);
});

test('A VERSION WITH NO SECTION IS NOT FOUND', () => {
  assert.strictEqual(findRelease(CHANGELOG, '1.0.6'), null);
});

/*
 * The preamble mentions 1.0.5 as prose. Matching anywhere in the file rather
 * than on a heading would pass a changelog that documents nothing.
 */
test('a mention in prose is not a section', () => {
  const prose = '# Changelog\n\nWe shipped 1.0.9 recently.\n';
  assert.strictEqual(findRelease(prose, '1.0.9'), null);
});

test('AN EMPTY SECTION COUNTS AS MISSING, because it documents nothing', () => {
  const empty = '## [1.0.7] — 2026-01-01\n\n## [1.0.6] — 2025-12-01\n\n- Something.\n';
  const found = findRelease(empty, '1.0.7');
  assert.strictEqual(found, null, 'a heading with no entries is not a changelog');
});

test('a section holding only the Unreleased placeholder is not a release', () => {
  assert.strictEqual(findRelease(CHANGELOG, 'Unreleased'), null);
});

test('the last section in the file is read to the end, not dropped', () => {
  const tail = '# Changelog\n\n## [1.0.1] — 2026-01-01\n\n- The only entry.\n';
  const found = findRelease(tail, '1.0.1');
  assert.ok(found && /The only entry/.test(found.body));
});

test('a version with regex characters is matched literally', () => {
  const odd = '## [1.0.5] — x\n\n- Entry.\n';
  assert.ok(findRelease(odd, '1.0.5'), 'the real version is found');
  assert.strictEqual(findRelease(odd, '1x0x5'), null, 'dots must not act as wildcards');
});

test('the failure message names the version and the file', () => {
  const message = describe('1.0.6', 'Josh/CHANGELOG.md');
  assert.match(message, /1\.0\.6/);
  assert.match(message, /CHANGELOG\.md/);
});
