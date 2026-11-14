import { test, assert } from '../harness.mjs';
import { gpuInfo } from '../../src/core/gpu.js';

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
