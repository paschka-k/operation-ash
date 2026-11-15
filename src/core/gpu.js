// core/gpu: which graphics the game runs on, from the renderer string the browser reports
// (WEBGL_debug_renderer_info, or gl.RENDERER). Pure: the game layer reads the string, this decides.
//
//   gpuInfo('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)')
//     -> {raw, name: 'Intel Iris Xe Graphics', kind: 'integrated', hint: true}
//
// kind: 'discrete' | 'integrated' | 'software' | 'unknown'. hint: worth telling the player how to switch
// the browser to the fast graphics card: integrated graphics (Intel, AMD Radeon Graphics without a model
// number, the Vega and R-series graphics of AMD's processors) and software rendering (Microsoft Basic Render Driver, SwiftShader, llvmpipe). Apple's chips
// have nothing to switch to, an unknown or masked string tells nothing: no hint for either.

const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software rasterizer/i;
// AMD's built-in graphics whose names look like cards, looked at before DISCRETE: the Vega of the Ryzen
// processors ("Radeon RX Vega 10 Graphics", "Radeon Vega 8 Graphics"; the Vega 56 and 64 cards have no
// "Graphics") and the R-series of the A-series processors ("Radeon R7 Graphics"; the R7 and R9 cards
// carry a model number instead).
const BUILT_IN = [
  /radeon\s*(rx\s*)?vega\s*([1-9]|1[01])\s*graphics/i,
  /radeon\s*r\d\s*graphics/i,
];
const DISCRETE = [
  /nvidia|geforce|quadro|\brtx\b|\bgtx\b/i,
  /radeon.*\b(rx|pro|r[579]|vii)\b/i,               // AMD cards: RX 6800, Radeon Pro, R9 290, Radeon VII
  /\barc\b.*\b[ab]\d{3}\b/i,                         // Intel Arc A770, B580 (plain "Arc Graphics" is built in)
];
const INTEGRATED = [
  /intel/i,
  /radeon\s*graphics/i,                              // AMD's built-in graphics carry no model number
  /radeon\s*vega\s*\d+\s*graphics/i,
  /radeon\s*\d{3}m\b/i,                              // Radeon 680M, 780M
  /\bapple\b/i,
];

/** A short readable name: the device out of an ANGLE string, without ids, API versions and (R)/(TM). */
function cleanName(raw) {
  let s = String(raw ?? '').trim();
  if (/swiftshader/i.test(s)) return 'SwiftShader';
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) {
    const parts = angle[1].split(', ');                // vendor, device, backend
    s = parts.length > 2 ? parts.slice(1, -1).join(', ') : parts[parts.length - 1];
  }
  return s
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s+(Direct3D|D3D)\S*.*$/i, '')
    .replace(/^ANGLE \w+ Renderer:\s*/i, '')
    .replace(/\((R|TM|C)\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** What the renderer string says about the graphics. See the top of the file. */
export function gpuInfo(raw) {
  const name = cleanName(raw);
  const text = String(raw ?? '');
  let kind = 'unknown';
  if (SOFTWARE.test(text)) kind = 'software';
  else if (BUILT_IN.some((r) => r.test(name))) kind = 'integrated';
  else if (DISCRETE.some((r) => r.test(name))) kind = 'discrete';
  else if (INTEGRATED.some((r) => r.test(name))) kind = 'integrated';
  const hint = kind === 'software' || (kind === 'integrated' && !/\bapple\b/i.test(name));
  return { raw, name, kind, hint };
}
