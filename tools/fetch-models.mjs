// Downloads real CC0 photoscanned models from Poly Haven (glTF, 1k textures), packs each
// one into a single .glb and stores it in assets/models/ where the game picks it up.
//
//   npm run models            download and pack barrel, crate, cardboard box, road barrier, covered car
//   npm run models -- --dry   only read the catalog and print what would be downloaded
//
// A model that fails keeps its primitive version. Run `npm run build` afterwards to embed
// them in dist/game.html. The game scales each model to the size its props expect.
import fs from 'node:fs';
import path from 'node:path';
import { root, MODEL_MAP, getFiles, download, mb, ensureDir, writeManifest } from './assets-lib.mjs';
import { packGlb } from './glb.mjs';

const dry = process.argv.includes('--dry');
const outDir = path.join(root, 'assets', 'models');

let total = 0;
const plan = [];
for (const [prop, id] of Object.entries(MODEL_MAP)) {
  try {
    const files = await getFiles(id);
    const g = files.gltf && files.gltf['1k'] && files.gltf['1k'].gltf;
    if (!g) throw new Error('no gltf 1k');
    const parts = [{ rel: null, url: g.url, size: g.size }];
    for (const [rel, f] of Object.entries(g.include || {})) parts.push({ rel, url: f.url, size: f.size });
    const sum = parts.reduce((n, p) => n + p.size, 0);
    total += sum;
    plan.push({ prop, id, g, parts });
    console.log(`${prop.padEnd(18)} <- ${id.padEnd(24)} ${mb(sum)}`);
  } catch (e) {
    console.warn(`${prop.padEnd(18)} skipped: ${e.message}`);
  }
}
console.log(`total ${mb(total)} for ${plan.length} models (gltf 1k)`);
if (dry) { console.log('dry run: nothing downloaded'); process.exit(0); }

ensureDir(outDir);
for (const m of plan) {
  try {
    process.stdout.write(`downloading ${m.id} ... `);
    const gltf = JSON.parse((await download(m.parts[0].url)).toString('utf8'));
    let bin = null;
    const textures = new Map();
    for (const p of m.parts.slice(1)) {
      const data = await download(p.url);
      if (p.rel.endsWith('.bin')) bin = data; else textures.set(path.basename(p.rel), data);
    }
    fs.writeFileSync(path.join(outDir, `${m.prop}.glb`), packGlb(gltf, bin, textures));
    console.log('packed ' + m.prop + '.glb');
  } catch (e) {
    console.log('FAILED (' + e.message + '), the game keeps the primitive ' + m.prop);
  }
}
const files = writeManifest();
console.log(`manifest updated (${files.length} files). Run "npm run build" to embed them.`);
