// Writes CHANGELOG.md and RELEASE_NOTES.md from src/core/releases.js (the one source of the version history).
// `npm run notes` writes them; `npm run notes -- --check` only reports whether they are up to date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES, renderChangelog, renderReleaseNotes } from '../src/core/releases.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const files = { 'CHANGELOG.md': renderChangelog(RELEASES), 'RELEASE_NOTES.md': renderReleaseNotes(RELEASES) };
let stale = 0;
for (const [name, text] of Object.entries(files)) {
  const file = path.join(root, name);
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
  if (check) { if (!same) { stale++; console.log(name + ': out of date'); } else console.log(name + ': ok'); continue; }
  if (!same) fs.writeFileSync(file, text);
  console.log(name + (same ? ': unchanged' : ': written'));
}
if (check && stale) process.exitCode = 1;
