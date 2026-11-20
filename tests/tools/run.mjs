// Runs every tests/tools/*.test.mjs in name order (tools, not game logic). npm run test:tools.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from '../harness.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(pathToFileURL(path.join(dir, f)).href);
}
await run();
