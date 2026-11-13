// Downloads real CC0 photoscanned PBR textures from Poly Haven, one set per surface
// kind, and stores them in assets/textures/ where the game picks them up.
//
//   npm run textures              download diffuse, normal and ARM maps at 1k
//   npm run textures -- --dry     only read the catalog and print what would be downloaded
//   npm run textures -- --res 2k  other resolution (1k is the default and keeps the build small)
//
// Each kind needs three files: <kind>_diff.jpg, <kind>_nor.jpg (OpenGL normals) and
// <kind>_arm.jpg (R ambient occlusion, G roughness, B metalness). A kind that fails keeps
// its procedural texture. Run `npm run build` afterwards to embed them in dist/game.html.
import fs from 'node:fs';
import path from 'node:path';
import { root, TEXTURE_MAP, getFiles, download, mb, ensureDir, writeManifest } from './assets-lib.mjs';

const dry = process.argv.includes('--dry');
const resIdx = process.argv.indexOf('--res');
const res = resIdx > 0 ? process.argv[resIdx + 1] : '1k';
const outDir = path.join(root, 'assets', 'textures');

const WANT = [['diff', 'Diffuse'], ['nor', 'nor_gl'], ['arm', 'arm']];
let total = 0;
const plan = [];
for (const [kind, id] of Object.entries(TEXTURE_MAP)) {
  try {
    const files = await getFiles(id);
    const picks = WANT.map(([suffix, key]) => {
      const f = files[key] && files[key][res] && files[key][res].jpg;
      if (!f) throw new Error(`${id}: no ${key} ${res} jpg`);
      return { suffix, url: f.url, size: f.size };
    });
    const sum = picks.reduce((n, p) => n + p.size, 0);
    total += sum;
    plan.push({ kind, id, picks });
    console.log(`${kind.padEnd(10)} <- ${id.padEnd(26)} ${mb(sum)}`);
  } catch (e) {
    console.warn(`${kind.padEnd(10)} skipped: ${e.message}`);
  }
}
console.log(`total ${mb(total)} for ${plan.length} sets (${res}, jpg)`);
if (dry) { console.log('dry run: nothing downloaded'); process.exit(0); }

ensureDir(outDir);
for (const set of plan) {
  // all three maps of a set are downloaded first and written together, so a failure never leaves half a set
  try {
    const got = [];
    for (const p of set.picks) {
      process.stdout.write(`downloading ${set.kind}_${p.suffix}.jpg ... `);
      got.push([p, await download(p.url)]);
      console.log('ok');
    }
    for (const [p, data] of got) fs.writeFileSync(path.join(outDir, `${set.kind}_${p.suffix}.jpg`), data);
  } catch (e) {
    console.log(`FAILED (${e.message}), the game keeps the procedural ${set.kind}`);
  }
}
const files = writeManifest();
console.log(`manifest updated (${files.length} files). Run "npm run build" to embed them.`);
