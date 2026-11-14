// Runs the tests of src/core. They import no three.js, touch no DOM and draw nothing.
// Every tests/core/*.test.mjs is picked up, in name order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from './harness.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'core');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(pathToFileURL(path.join(dir, f)).href);
}
await run();
