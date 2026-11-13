// Builds the game into ONE html file that opens with a double click: no server, no
// install, no internet. Browsers refuse to load ES modules and neighbouring files
// from file://, so everything is inlined: the bundled script (three.js included),
// the styles and, in the full build, the optional photoscan textures and glTF models
// from assets/ as data URIs.
//
//   npm run build        dist/game.html       with assets/ embedded when it has files
//   npm run build:lite   dist/game-lite.html  procedural materials and primitive props only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lite = process.argv.includes('--lite');
const outName = lite ? 'game-lite.html' : 'game.html';

const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };

/** Embed assets/textures and assets/models as {file name: data URI}. */
function collectAssets() {
  const out = {};
  if (lite) return out;
  for (const dir of ['textures', 'models']) {
    const full = path.join(root, 'assets', dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      const mime = MIME[path.extname(f).toLowerCase()];
      if (!mime) continue;
      out[f] = `data:${mime};base64,` + fs.readFileSync(path.join(full, f)).toString('base64');
    }
  }
  return out;
}

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const assets = collectAssets();
const assetCount = Object.keys(assets).length;
// Always declared, even when empty: the game then knows everything is embedded and never probes the network.
const assetScript = `<script>window.__ASSETS=${JSON.stringify(assets)};</script>
`;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `${assetScript}<script>\n${js}\n</script>`);

if (html.includes('type="importmap"') || html.includes('src="src/main.js"') || html.includes('rel="stylesheet"')) throw new Error('build: index.html changed, an inlining step did not match. The output would not open from file://.');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const outPath = path.join(root, 'dist', outName);
fs.writeFileSync(outPath, html);
const mb = (fs.statSync(outPath).size / 1048576).toFixed(2);
console.log(`${outName}: ${mb} MB, ${assetCount} embedded asset file${assetCount === 1 ? '' : 's'}${lite ? ' (lite)' : ''}`);
