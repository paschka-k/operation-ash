// Tool tests: the pure helpers of the launcher (tools/launch-lib.mjs). Window, server and PowerShell are not tested here.
import { test, assert } from '../harness.mjs';
import { browserArgs, gpuOptions, originAllowed, findBrowser, effectiveChoice } from '../../tools/launch-lib.mjs';

// ---- browserArgs
test('browserArgs: app window, own profile, no first-run noise', () => {
  const a = browserArgs({ choice: 'default', profile: 'C:\\Users\\p\\AppData\\Local\\OperationAsh\\browser', url: 'http://127.0.0.1:5180/' });
  assert.ok(a.includes('--app=http://127.0.0.1:5180/'));
  assert.ok(a.includes('--user-data-dir=C:\\Users\\p\\AppData\\Local\\OperationAsh\\browser'));
  assert.ok(a.includes('--no-first-run'));
  assert.ok(!a.includes('--force_high_performance_gpu'), 'the default choice leaves the browser alone');
});

test('browserArgs: the fast graphics card is one key, nothing else changes', () => {
  const base = { profile: 'P', url: 'http://127.0.0.1:5180/' };
  const high = browserArgs({ ...base, choice: 'high' });
  const dflt = browserArgs({ ...base, choice: 'default' });
  assert.ok(high.includes('--force_high_performance_gpu'));
  assert.deepEqual(high.filter((x) => x !== '--force_high_performance_gpu'), dflt);
});

test('browserArgs: an unknown choice is the default one', () => {
  assert.ok(!browserArgs({ choice: 'nvidia', profile: 'P', url: 'u' }).includes('--force_high_performance_gpu'));
  assert.ok(!browserArgs({ profile: 'P', url: 'u' }).includes('--force_high_performance_gpu'));
});

// ---- gpuOptions
test('gpuOptions: laptop with a card and built-in graphics offers both, fast first', () => {
  const o = gpuOptions(['Intel(R) Iris(R) Xe Graphics', 'NVIDIA GeForce RTX 4070 Laptop GPU']);
  assert.deepEqual(o, [
    { id: 'high', name: 'NVIDIA GeForce RTX 4070 Laptop GPU', kind: 'discrete' },
    { id: 'default', name: 'Intel Iris Xe Graphics', kind: 'integrated' },
  ]);
});

test('gpuOptions: one graphics card leaves nothing to choose', () => {
  assert.deepEqual(gpuOptions(['Intel(R) UHD Graphics 630']), [{ id: 'default', name: 'Intel UHD Graphics 630', kind: 'integrated' }]);
  assert.deepEqual(gpuOptions(['NVIDIA GeForce GTX 1060']), [{ id: 'default', name: 'NVIDIA GeForce GTX 1060', kind: 'discrete' }]);
});

test('gpuOptions: the software adapter and empty names do not count; nothing found is an empty list', () => {
  const o = gpuOptions(['Microsoft Basic Render Driver', '', 'AMD Radeon RX 6800', null]);
  assert.deepEqual(o.map((x) => x.id), ['default']);
  assert.equal(o[0].name, 'AMD Radeon RX 6800');
  assert.deepEqual(gpuOptions([]), []);
  assert.deepEqual(gpuOptions(undefined), []);
});

test('gpuOptions: a virtual display does not take the place of the built-in graphics', () => {
  const o = gpuOptions(['Parsec Virtual Display Adapter', 'Intel(R) Iris(R) Xe Graphics', 'NVIDIA GeForce RTX 4070 Laptop GPU']);
  assert.equal(o.find((x) => x.id === 'default').name, 'Intel Iris Xe Graphics');
});

test('effectiveChoice: a saved choice that this machine cannot offer falls back', () => {
  const both = gpuOptions(['Intel(R) Iris(R) Xe Graphics', 'NVIDIA GeForce RTX 4070 Laptop GPU']);
  const one = gpuOptions(['Intel(R) UHD Graphics']);
  assert.equal(effectiveChoice('default', both), 'default');
  assert.equal(effectiveChoice(undefined, both), 'high', 'no saved choice: the fast card when there is one');
  assert.equal(effectiveChoice('high', one), 'default');
  assert.equal(effectiveChoice('garbage', one), 'default');
});

// ---- originAllowed
test('originAllowed: only the launcher page itself', () => {
  assert.equal(originAllowed('http://127.0.0.1:5180', 5180), true);
  assert.equal(originAllowed('http://localhost:5180', 5180), true);
  assert.equal(originAllowed('http://127.0.0.1:5181', 5180), false, 'another port');
  assert.equal(originAllowed('https://127.0.0.1:5180', 5180), false, 'another scheme');
  assert.equal(originAllowed('http://evil.example', 5180), false);
  assert.equal(originAllowed('http://127.0.0.1:5180.evil.example', 5180), false);
  assert.equal(originAllowed('http://evil.example/http://127.0.0.1:5180', 5180), false);
  assert.equal(originAllowed('null', 5180), false);
  assert.equal(originAllowed('', 5180), false);
  assert.equal(originAllowed(undefined, 5180), false, 'a request without Origin is not the page');
});

// ---- findBrowser
const WIN = { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\p\\AppData\\Local' };
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

test('findBrowser: Chrome first, then Edge, then nothing', () => {
  assert.deepEqual(findBrowser(WIN, () => true), { name: 'chrome', path: CHROME });
  assert.deepEqual(findBrowser(WIN, (p) => p === EDGE), { name: 'edge', path: EDGE });
  assert.equal(findBrowser(WIN, () => false), null);
});

test('findBrowser: Chrome in the user folder, and an environment with no Program Files', () => {
  const user = 'C:\\Users\\p\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
  assert.deepEqual(findBrowser(WIN, (p) => p === user), { name: 'chrome', path: user });
  assert.equal(findBrowser({}, () => true), null, 'no variables, no guesses');
});
