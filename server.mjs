// Tiny static file server, no dependencies. Usage: node server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 5174);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    if (rel.includes('\\') || rel.includes('\0') || rel.split('/').includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }
    const file = path.normalize(path.join(root, rel));
    const within = path.relative(root, file);
    if (within.startsWith('..') || path.isAbsolute(within)) { res.writeHead(403); res.end('Forbidden'); return; }
    // Only serve the game: index, src, styles and the three.js package. Checked on the resolved path.
    const top = within.split(path.sep)[0];
    const allowed = ['index.html', 'styles.css', 'favicon.svg', 'src', 'node_modules', 'assets', 'dist', '.autopilot'];
    if (!allowed.includes(top)) { res.writeHead(404); res.end('Not found'); return; }
    if (top === 'node_modules' && !within.split(path.sep).slice(0, 2).join('/').endsWith('node_modules/three')) { res.writeHead(404); res.end('Not found'); return; }
    if (rel === '/assets/manifest.json' && !fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
      res.end('{"files":[]}');
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('Game running at http://localhost:' + port + '/');
});
