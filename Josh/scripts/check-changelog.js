#!/usr/bin/env node
'use strict';

/**
 * Refuse to tag a version the changelog says nothing about.
 *
 * 1.0.5 was folded out of [Unreleased] by hand, and nothing made that a step.
 * A release whose changelog section is missing, or present but empty, is wrong
 * in a way no other test can see: the suite passes, the installers build, and
 * the omission only surfaces when someone reads the release page.
 *
 * Enforced on tag builds only. `master` between releases legitimately carries
 * an [Unreleased] section, and failing there would just train people to ignore
 * the check.
 *
 * Dependency-free and runs on plain Node, like verify.js beside it.
 */

const fs = require('node:fs');
const path = require('node:path');

/** A heading this file treats as starting a section. */
const HEADING = /^##\s+\[([^\]]+)\]/;

/**
 * The section for one version, or null when it is missing or says nothing.
 *
 * Matching is on headings rather than anywhere in the file, because a version
 * named in the preamble is prose, not a changelog entry. The version is
 * compared as a string, so its dots cannot act as regex wildcards.
 */
function findRelease(text, version) {
  if (typeof text !== 'string' || typeof version !== 'string') return null;
  if (version === 'Unreleased') return null;

  const lines = text.split('\n');
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const match = HEADING.exec(lines[i]);
    if (!match) continue;
    if (start === -1 && match[1] === version) {
      start = i;
      continue;
    }
    if (start !== -1) {
      return sectionOrNull(version, lines.slice(start + 1, i));
    }
  }

  // The last section in the file runs to the end rather than to a heading.
  if (start !== -1) return sectionOrNull(version, lines.slice(start + 1));
  return null;
}

/** A heading with nothing under it documents nothing, so it does not count. */
function sectionOrNull(version, bodyLines) {
  const body = bodyLines.join('\n').trim();
  return body === '' ? null : { version, body };
}

function describe(version, file) {
  return [
    'No changelog entry for ' + version + '.',
    '',
    'Add a "## [' + version + ']" section to ' + file + ', with the changes',
    'under it. If the entries are already written under "## [Unreleased]",',
    'rename that heading to this version and give it a date.',
  ].join('\n');
}

function main() {
  const root = path.join(__dirname, '..');
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const version = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  ).version;

  let text;
  try {
    text = fs.readFileSync(changelogPath, 'utf8');
  } catch {
    console.error('Cannot read ' + changelogPath);
    process.exit(1);
  }

  if (findRelease(text, version)) {
    console.log('  ok    CHANGELOG.md documents ' + version);
    return;
  }

  console.error(describe(version, 'Josh/CHANGELOG.md'));
  process.exit(1);
}

if (require.main === module) main();

module.exports = { findRelease, describe };
