// Releases: one record per deploy, the version of package.json, and the two generated files.
import fs from 'node:fs';
import { test, assert } from '../harness.mjs';
import { RELEASES, renderChangelog, renderReleaseNotes, compareVersions } from '../../src/core/releases.js';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SECTIONS = ['added', 'changed', 'fixed', 'removed'];

test('releases: package.json carries the version of the newest record', () => {
  assert.equal(JSON.parse(read('package.json')).version, RELEASES[0].version);
});

test('releases: eight records, versions strictly falling, dates never rising, new on top', () => {
  assert.deepEqual(RELEASES.map((r) => r.version), ['1.5.0', '1.4.1', '1.4.0', '1.3.0', '1.2.0', '1.1.0', '1.0.1', '1.0.0']);
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(compareVersions(RELEASES[i - 1].version, RELEASES[i].version) > 0, RELEASES[i].version);
    assert.ok(RELEASES[i - 1].date >= RELEASES[i].date, RELEASES[i].version + ' date');
  }
  for (const r of RELEASES) assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('releases: a past deploy names its commit (7 hex, unique), the current one has none yet', () => {
  assert.equal(RELEASES[0].commit, null);
  const seen = new Set();
  for (const r of RELEASES.slice(1)) {
    assert.match(r.commit, /^[0-9a-f]{7}$/, r.version);
    assert.ok(!seen.has(r.commit), 'duplicate ' + r.commit);
    seen.add(r.commit);
  }
});

test('releases: every record has both languages, notes and at least one change', () => {
  for (const r of RELEASES) {
    for (const l of ['ru', 'en']) {
      assert.ok(r.title[l] && r.title[l].length > 3, r.version + ' title ' + l);
      assert.ok(r.notes[l].length >= 2 && r.notes[l].every((s) => typeof s === 'string' && s.length > 10), r.version + ' notes ' + l);
    }
    assert.deepEqual(Object.keys(r.changes).sort(), [...SECTIONS].sort(), r.version);
    assert.ok(SECTIONS.some((k) => r.changes[k].length > 0), r.version + ' changes');
    for (const k of r.known) assert.ok(k.ru && k.en, r.version + ' known');
  }
  assert.ok(RELEASES[0].known.length >= 2, 'the current release is honest about what is rough');
});

test('releases: the changelog groups changes by section, skips empty ones and marks the current release', () => {
  const fake = [
    { version: '2.0.0', date: '2030-01-02', commit: null, title: { ru: 'р', en: 'Second' }, notes: { ru: [], en: [] }, changes: { added: ['A one'], changed: [], fixed: ['F one', 'F two'], removed: [] }, known: [] },
    { version: '1.0.0', date: '2030-01-01', commit: 'abc1234', title: { ru: 'р', en: 'First' }, notes: { ru: [], en: [] }, changes: { added: ['Start'], changed: [], fixed: [], removed: [] }, known: [] },
  ];
  const md = renderChangelog(fake);
  assert.ok(md.startsWith('# Changelog\n'));
  assert.ok(md.indexOf('## 2.0.0 - 2030-01-02 (this release)') < md.indexOf('## 1.0.0 - 2030-01-01 (commit abc1234)'));
  assert.ok(md.includes('### Added\n\n- A one\n\n### Fixed\n\n- F one\n- F two\n'));
  assert.ok(!md.includes('### Changed') && !md.includes('### Removed'));
  assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'));
});

test('releases: the release notes read per release, with known issues only where there are some', () => {
  const fake = [
    { version: '2.0.0', date: '2030-01-02', commit: null, title: { ru: 'р', en: 'Second' }, notes: { ru: ['р'], en: ['Fast cars', 'New map'] }, changes: { added: ['x'], changed: [], fixed: [], removed: [] }, known: [{ ru: 'р', en: 'Rough edge' }] },
    { version: '1.0.0', date: '2030-01-01', commit: 'abc1234', title: { ru: 'р', en: 'First' }, notes: { ru: ['р'], en: ['Hello'] }, changes: { added: ['x'], changed: [], fixed: [], removed: [] }, known: [] },
  ];
  const md = renderReleaseNotes(fake);
  assert.ok(md.startsWith('# Release notes\n'));
  assert.ok(md.includes('## 2.0.0: Second\n\n2030-01-02, this release\n\n- Fast cars\n- New map\n\nKnown issues:\n\n- Rough edge\n'));
  assert.ok(md.includes('## 1.0.0: First\n\n2030-01-01, commit abc1234\n\n- Hello\n'));
  assert.equal(md.split('Known issues:').length, 2);
});

test('releases: CHANGELOG.md and RELEASE_NOTES.md match the data (run npm run notes)', () => {
  assert.equal(read('CHANGELOG.md'), renderChangelog(RELEASES));
  assert.equal(read('RELEASE_NOTES.md'), renderReleaseNotes(RELEASES));
});
