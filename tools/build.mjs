// Builds the game into ONE html file that opens with a double click: no server, no
// install, no internet. Browsers refuse to load ES modules and neighbouring files
// from file://, so everything is inlined: the bundled script (three.js included)
// and the styles.
//
//   npm run build         dist/game.html        generated textures and primitive props, about 1 MB.
//                                               This is the file kept in the repository.
//   npm run build:scans   dist/game-scans.html  the same with the photoscans from assets/ embedded
//                                               as data URIs (about 38 MB), still one offline file
//   npm run build:web     dist/web/             for a web server: index.html (about 1 MB) and a copy
//                                               of assets/ next to it; the page loads the scans it
//                                               finds in assets/manifest.json and shows progress
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scans = process.argv.includes('--scans');
const web = process.argv.includes('--web');
const outName = web ? 'web/index.html' : scans ? 'game-scans.html' : 'game.html';

const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary' };

/** Embed assets/textures and assets/models as {file name: data URI}. */
function collectAssets() {
  const out = {};
  if (!scans) return out;
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
// The single files declare it even when empty: the game then knows everything is embedded and
// never probes the network. The web build leaves it out, so the page reads assets/manifest.json.
const assetScript = web ? '' : `<script>window.__ASSETS=${JSON.stringify(assets)};</script>
`;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `${assetScript}<script>\n${js}\n</script>`);

if (html.includes('type="importmap"') || html.includes('src="src/main.js"') || html.includes('rel="stylesheet"')) throw new Error('build: index.html changed, an inlining step did not match. The output would not open from file://.');
const outPath = path.join(root, 'dist', outName);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
const mb = (bytes) => (bytes / 1048576).toFixed(2);
let note = `${assetCount} embedded asset file${assetCount === 1 ? '' : 's'}`;
if (web) {
  // a fresh copy of assets/ (manifest, textures, models) next to the page
  const from = path.join(root, 'assets'), to = path.join(root, 'dist', 'web', 'assets');
  fs.rmSync(to, { recursive: true, force: true });
  let files = 0, bytes = 0;
  if (fs.existsSync(path.join(from, 'manifest.json'))) {
    fs.cpSync(from, to, { recursive: true });
    for (const dir of ['textures', 'models']) {
      const full = path.join(to, dir);
      if (fs.existsSync(full)) for (const f of fs.readdirSync(full)) { files++; bytes += fs.statSync(path.join(full, f)).size; }
    }
  }
  note = `${files} asset file${files === 1 ? '' : 's'} beside it (${mb(bytes)} MB)`;
}
console.log(`${outName}: ${mb(fs.statSync(outPath).size)} MB, ${note}`);
