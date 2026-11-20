import { test, assert } from '../harness.mjs';
import { gpuInfo } from '../../src/core/gpu.js';
import { t, setLang, getLang } from '../../src/config.js';
// the lines of the main menu's hint about integrated graphics (the module touches the DOM only when built)
import { menuHintKeys } from '../../src/ui/gpu.js';

// The hint in both languages: R06/R07/R15i. A plain tab names the launcher first; Windows and the NVIDIA
// panel come after it as the other way. Under the launcher the hint leads to the game's own setting.
const LAUNCHER = { launcher: true, gpus: [{ id: 'high', name: 'NVIDIA GeForce RTX 4070 Laptop GPU', kind: 'discrete' }, { id: 'default', name: 'Intel(R) Iris(R) Xe Graphics', kind: 'integrated' }], choice: 'default' };
const OS_WAY = /Windows|NVIDIA/;
const LAUNCH_WAY = (s) => s.includes('npm run play') && s.includes('play-windows.cmd');

function hintTexts(kind, launcher, lang) {
  const keep = getLang();
  setLang(lang);
  try { return menuHintKeys(kind, launcher).map((k) => t(k)); } finally { setLang(keep); }
}

test('gpu hint: in a plain tab the launcher is the first and main way, Windows and NVIDIA only after it', () => {
  for (const lang of ['ru', 'en']) {
    for (const kind of ['integrated', 'software']) {
      const lines = hintTexts(kind, null, lang);
      assert.ok(lines.length > 0, lang + ' ' + kind + ': the hint has text');
      for (const s of lines) assert.ok(typeof s === 'string' && s.length > 0 && !/^gpu[A-Z]/.test(s), lang + ': a string missing from the table: ' + s);
      const launch = lines.findIndex(LAUNCH_WAY), os = lines.findIndex((s) => OS_WAY.test(s));
      assert.ok(launch >= 0, `${lang} ${kind}: the hint names npm run play and play-windows.cmd`);
      assert.ok(os === -1 || os > launch, `${lang} ${kind}: Windows or NVIDIA comes before the launcher: ${lines.join(' | ')}`);
      // the launcher line itself does not send to Windows first
      const first = lines[launch], w = first.search(OS_WAY);
      assert.ok(w === -1 || w > first.indexOf('npm run play'), `${lang}: the launcher line starts with Windows: ${first}`);
      if (kind === 'integrated') assert.equal(launch, 0, lang + ': on integrated graphics the launcher is the first line');
    }
  }
});

test('gpu hint: under the launcher it leads to the game\'s own "Graphics card" setting, not to Windows', () => {
  for (const lang of ['ru', 'en']) {
    const lines = hintTexts('integrated', LAUNCHER, lang);
    assert.ok(lines.length > 0, lang + ': the hint has text');
    assert.ok(!lines.some((s) => OS_WAY.test(s)), `${lang}: no Windows or NVIDIA under the launcher: ${lines.join(' | ')}`);
    setLang(lang);
    const item = t('gpuLabel');
    setLang('ru');
    assert.ok(lines[0].includes(item), `${lang}: the first line names the setting «${item}»: ${lines[0]}`);
    // one card only: nothing to choose, and still no Windows
    const one = hintTexts('integrated', { ...LAUNCHER, gpus: LAUNCHER.gpus.slice(1) }, lang);
    assert.ok(one.length > 0 && !one.some((s) => OS_WAY.test(s)), lang + ': one card under the launcher');
  }
});

// Renderer strings as browsers report them (WEBGL_debug_renderer_info or gl.RENDERER).
const CASES = [
  // [raw, name shown, kind, hint]
  ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Iris Xe Graphics', 'integrated', true],
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002820) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'NVIDIA GeForce RTX 4070 Laptop GPU', 'discrete', false],
  ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon Graphics', 'integrated', true],
  ['ANGLE (AMD, AMD Radeon RX 6800 XT (0x000073BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon RX 6800 XT', 'discrete', false],
  ['ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon 780M Graphics', 'integrated', true],
  ['ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Microsoft Basic Render Driver', 'software', true],
  ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'SwiftShader', 'software', true],
  ['llvmpipe (LLVM 15.0.7, 256 bits)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'software', true],
  ['ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', 'Mesa Intel UHD Graphics 620 (KBL GT2)', 'integrated', true],
  ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Arc A770 Graphics', 'discrete', false],
  ['NVIDIA GeForce GTX 1060/PCIe/SSE2', 'NVIDIA GeForce GTX 1060/PCIe/SSE2', 'discrete', false],
  ['ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', 'Apple M2', 'integrated', false],
];

test('gpuInfo: a readable name and the kind of graphics from the renderer string', () => {
  for (const [raw, name, kind, hint] of CASES) {
    const g = gpuInfo(raw);
    assert.equal(g.name, name, raw);
    assert.equal(g.kind, kind, raw);
    assert.equal(g.hint, hint, raw);
    assert.equal(g.raw, raw);
  }
});

test('gpuInfo: nothing known gives no hint', () => {
  for (const raw of ['', null, undefined, 'Mozilla', 'WebKit WebGL']) {
    const g = gpuInfo(raw);
    assert.equal(g.kind, 'unknown', String(raw));
    assert.equal(g.hint, false, String(raw));
  }
  assert.equal(gpuInfo('').name, '');
  assert.equal(gpuInfo('Mozilla').name, 'Mozilla');
});

test('gpuInfo: AMD APU graphics named like cards (Vega, R-series) are integrated, the cards stay discrete', () => {
  const integrated = [
    ['AMD Radeon RX Vega 10 Graphics', 'AMD Radeon RX Vega 10 Graphics'],
    ['AMD Radeon R7 Graphics', 'AMD Radeon R7 Graphics'],
    ['ANGLE (AMD, AMD Radeon(TM) RX Vega 10 Graphics (0x000015D8) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon RX Vega 10 Graphics'],
    ['ANGLE (AMD, AMD Radeon R7 Graphics (0x00001313) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon R7 Graphics'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Iris Xe Graphics'],
  ];
  for (const [raw, name] of integrated) {
    const g = gpuInfo(raw);
    assert.deepEqual([g.name, g.kind, g.hint], [name, 'integrated', true], raw);
  }
  const discrete = [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU (0x00002820) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, Radeon RX Vega (0x0000687F) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'AMD Radeon RX Vega 64',
    'AMD Radeon R7 200 Series',
    'AMD Radeon R9 290',
  ];
  for (const raw of discrete) {
    const g = gpuInfo(raw);
    assert.deepEqual([g.kind, g.hint], ['discrete', false], raw);
  }
});
