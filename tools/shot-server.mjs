// Dev-only helper. Receives canvas screenshots (data URLs) from the page and
// writes them to a folder so they can be inspected at full resolution.
// Usage: node tools/shot-server.mjs <output-dir> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] || './shots');
const port = Number(process.argv[3] || 5175);
fs.mkdirSync(outDir, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method !== 'POST' || url.pathname !== '/shot') { res.writeHead(404); res.end(); return; }
  const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(body);
    if (!m) { res.writeHead(400); res.end('bad data'); return; }
    const file = path.join(outDir, name + (m[1] === 'png' ? '.png' : '.jpg'));
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    res.writeHead(200); res.end(file);
  });
}).listen(port, '127.0.0.1', () => console.log('shot server on ' + port + ' -> ' + outDir));
