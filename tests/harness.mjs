// Minimal test harness: no dependencies. Tests register themselves with test(),
// run() executes them and sets a failing exit code if any fail.
import assert from 'node:assert/strict';

const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }
export { assert };

export function near(actual, expected, eps = 1e-6, msg = '') {
  if (!(Math.abs(actual - expected) <= eps)) throw new assert.AssertionError({ message: `${msg} expected ${expected} +- ${eps}, got ${actual}` });
}

export async function run() {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; if (process.env.VERBOSE) console.log('ok   ', t.name); }
    catch (e) { failed++; console.error('FAIL ', t.name, '\n      ', e.message); }
  }
  console.log(`${passed} passed, ${failed} failed (${tests.length} tests)`);
  if (failed) process.exitCode = 1;
  return { passed, failed };
}
