// Tiny static file server, no dependencies. Usage: node server.mjs [port]
// The server itself is in tools/serve-lib.mjs (the launcher, tools/play.mjs, uses it too).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './tools/serve-lib.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 5174);

createGameServer(root).listen(port, '127.0.0.1', () => {
  console.log('Game running at http://localhost:' + port + '/');
});
