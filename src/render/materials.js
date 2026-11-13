// Procedural PBR texture sets. Every set is seamlessly tileable and has:
//   map        albedo (sRGB)
//   normalMap  tangent space normals derived from a height field
//   orm        R = ambient occlusion, G = roughness, B = metalness
// No image files are loaded, everything is computed here.

import * as THREE from 'three';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ noise
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
  const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fractal noise in 0..1. fx, fy are integer base frequencies. */
function fbm(u, v, fx, fy, oct, seed, gain = 0.5) {
  let amp = 0.5, sum = 0, norm = 0;
  let px = fx, py = fy;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * px, v * py, px, py, seed + o * 31);
    norm += amp;
    px *= 2; py *= 2; amp *= gain;
  }
  return sum / norm;
}

const W = { f1: 0, f2: 0, id: 0 };
/** Tileable cellular noise. Result in W. */
function worley(u, v, cells, seed) {
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
      const fx = cx + hash2(wx, wy, seed);
      const fy = cy + hash2(wx, wy, seed + 7);
      const d = Math.hypot(fx - x, fy - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 13); }
      else if (d < f2) f2 = d;
    }
  }
  W.f1 = f1; W.f2 = f2; W.id = id;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
function smooth(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// -------------------------------------------------------- set construction
/**
 * @param {number} size  pixels per side
 * @param {(u:number,v:number,o:object)=>void} shade  fills o.r,g,b (sRGB 0..1), o.h, o.rough, o.metal, o.ao
 * @param {number} strength  normal strength
 * @param {number} aniso
 */
function buildSet(size, shade, strength, aniso) {
  const n = size * size;
  const height = new Float32Array(n);
  const albedo = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  const o = { r: 0.5, g: 0.5, b: 0.5, h: 0, rough: 0.8, metal: 0, ao: 1 };

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      o.r = o.g = o.b = 0.5; o.h = 0; o.rough = 0.8; o.metal = 0; o.ao = 1;
      shade(u, v, o);
      const i = y * size + x;
      height[i] = o.h;
      const k = i * 4;
      albedo[k] = clamp01(o.r) * 255;
      albedo[k + 1] = clamp01(o.g) * 255;
      albedo[k + 2] = clamp01(o.b) * 255;
      albedo[k + 3] = 255;
      orm[k] = clamp01(o.ao) * 255;
      orm[k + 1] = clamp01(o.rough) * 255;
      orm[k + 2] = clamp01(o.metal) * 255;
      orm[k + 3] = 255;
    }
  }

  const normal = new Uint8Array(n * 4);
  const wrap = (a) => (a + size) % size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = height[y * size + wrap(x - 1)], hr = height[y * size + wrap(x + 1)];
      const hd = height[wrap(y - 1) * size + x], hu = height[wrap(y + 1) * size + x];
      // data row index grows with +v, so slope along v is (hu - hd)
      let nx = -(hr - hl) * 0.5 * strength * size * 0.02;
      let ny = -(hu - hd) * 0.5 * strength * size * 0.02;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const k = (y * size + x) * 4;
      normal[k] = (nx * 0.5 + 0.5) * 255;
      normal[k + 1] = (ny * 0.5 + 0.5) * 255;
      normal[k + 2] = (nz * 0.5 + 0.5) * 255;
      normal[k + 3] = 255;
    }
  }

  const make = (data, srgb) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = aniso;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return { map: make(albedo, true), normalMap: make(normal, false), orm: make(orm, false) };
}

// ----------------------------------------------------------- shaders
const SHADERS = {
  concrete(seed) {
    return (u, v, o) => {
      const n1 = fbm(u, v, 4, 4, 5, seed);
      const n2 = fbm(u, v, 16, 16, 4, seed + 1);
      const p = vnoise(u * 160, v * 160, 160, 160, seed + 2);
      const pore = p > 0.8 ? (p - 0.8) / 0.2 : 0;
      const streak = fbm(u, v, 10, 2, 3, seed + 4);
      const stain = smooth(0.52, 0.78, streak) * (0.5 + 0.5 * fbm(u, v, 2, 3, 3, seed + 5)) * 0.45;
      const ridge = 1 - Math.abs(2 * fbm(u, v, 5, 5, 3, seed + 3) - 1);
      const crack = smooth(0.988, 0.9985, ridge) * smooth(0.5, 0.68, fbm(u, v, 2, 2, 2, seed + 7));
      const g = 0.50 + (n1 - 0.5) * 0.15 + (n2 - 0.5) * 0.12 - stain * 0.16 - pore * 0.2 - crack * 0.38;
      o.r = g * 1.02; o.g = g; o.b = g * 0.95;
      o.h = n2 * 0.5 + n1 * 0.35 - pore * 0.55 - crack * 0.9;
      o.rough = 0.84 + (n2 - 0.5) * 0.22 + pore * 0.1 - stain * 0.08;
      o.ao = 1 - pore * 0.7 - crack * 0.55;
    };
  },

  plaster(seed) {
    return (u, v, o) => {
      const n1 = fbm(u, v, 3, 3, 5, seed);
      const n2 = fbm(u, v, 20, 20, 3, seed + 1);
      const chipMask = smooth(0.8, 0.86, fbm(u, v, 11, 11, 3, seed + 2));
      const streak = fbm(u, v, 8, 2, 3, seed + 4);
      const stain = smooth(0.5, 0.8, streak) * 0.4;
      const ridge = 1 - Math.abs(2 * fbm(u, v, 4, 4, 3, seed + 3) - 1);
      const crack = smooth(0.992, 0.9995, ridge) * smooth(0.55, 0.72, fbm(u, v, 2, 2, 2, seed + 7));
      // plaster layer
      let r = 0.70 + (n1 - 0.5) * 0.08 - stain * 0.2;
      let g = 0.66 + (n1 - 0.5) * 0.08 - stain * 0.2;
      let b = 0.58 + (n1 - 0.5) * 0.07 - stain * 0.18;
      // exposed masonry below
      const m = 0.33 + n2 * 0.18;
      r = mix(r, m * 1.05, chipMask);
      g = mix(g, m * 0.82, chipMask);
      b = mix(b, m * 0.74, chipMask);
      const dark = crack * 0.24;
      o.r = r - dark; o.g = g - dark; o.b = b - dark;
      o.h = mix(0.55 + n2 * 0.12, 0.2 + n2 * 0.35, chipMask) - crack * 0.7;
      o.rough = mix(0.88, 0.96, chipMask);
      o.ao = 1 - crack * 0.5 - chipMask * 0.25;
    };
  },

  brick(seed) {
    const ROWS = 16, COLS = 8; // a 2 m by 1.2 m tile: 128 different bricks before the pattern repeats
    return (u, v, o) => {
      const row = Math.floor(v * ROWS);
      const fy = v * ROWS - row;
      const uu = u * COLS + (row & 1 ? 0.5 : 0);
      const colRaw = Math.floor(uu);
      const fx = uu - colRaw;
      const col = ((colRaw % COLS) + COLS) % COLS;
      // distance to nearest brick edge in metres (brick 0.25 x 0.075)
      const dx = Math.min(fx, 1 - fx) * 0.25;
      const dy = Math.min(fy, 1 - fy) * 0.075;
      const d = Math.min(dx, dy);
      const mortar = 1 - smooth(0.0035, 0.0065, d);
      const id = hash2(col, row, seed);
      const id2 = hash2(col, row, seed + 9);
      const grit = fbm(u, v, 48, 48, 3, seed + 1);
      const blotch = fbm(u, v, 10, 10, 3, seed + 2);
      const soot = smooth(0.5, 0.9, fbm(u, v, 12, 4, 3, seed + 3));
      const chipN = vnoise(u * 128, v * 128, 128, 128, seed + 4);
      const chip = smooth(0.84, 0.9, chipN) * (1 - mortar);
      const lum = 0.86 + id * 0.32 + (grit - 0.5) * 0.25 + (blotch - 0.5) * 0.14;
      let r = (0.42 + id2 * 0.07) * lum;
      let g = (0.18 + id2 * 0.05) * lum;
      let b = (0.13 + id2 * 0.03) * lum;
      const mg = 0.5 + (grit - 0.5) * 0.25;
      r = mix(r, mg, mortar); g = mix(g, mg * 0.97, mortar); b = mix(b, mg * 0.92, mortar);
      const sootK = soot * 0.2; // large stains come from the world-space macro variation, not from the tile
      r *= 1 - sootK; g *= 1 - sootK; b *= 1 - sootK;
      r = mix(r, 0.22, chip * 0.6); g = mix(g, 0.12, chip * 0.6); b = mix(b, 0.09, chip * 0.6);
      o.r = r; o.g = g; o.b = b;
      o.h = (1 - mortar) * 0.55 * smooth(0, 0.012, d) + (grit - 0.5) * 0.12 - chip * 0.25;
      o.rough = 0.88 + (grit - 0.5) * 0.1 + mortar * 0.05;
      o.ao = 1 - mortar * 0.55 - (1 - smooth(0, 0.012, d)) * 0.2;
    };
  },

  asphalt(seed) {
    return (u, v, o) => {
      const base = fbm(u, v, 3, 3, 4, seed);
      const sp = vnoise(u * 300, v * 300, 300, 300, seed + 1);
      const sp2 = vnoise(u * 150, v * 150, 150, 150, seed + 2);
      const aggregate = (sp > 0.72 ? (sp - 0.72) * 2.4 : 0) + (sp2 > 0.8 ? (sp2 - 0.8) * 1.2 : 0);
      const ridge = 1 - Math.abs(2 * fbm(u, v, 3, 3, 4, seed + 3) - 1);
      const crack = smooth(0.99, 0.9988, ridge);
      const oil = smooth(0.62, 0.78, fbm(u, v, 3, 3, 3, seed + 4));
      const patch = smooth(0.55, 0.7, fbm(u, v, 2, 2, 3, seed + 5));
      const g = 0.115 + (base - 0.5) * 0.07 + aggregate * 0.55 - crack * 0.07 - oil * 0.035 + patch * 0.02;
      o.r = g * 1.02; o.g = g; o.b = g * 1.04;
      o.h = (sp - 0.5) * 0.55 + aggregate * 0.8 - crack * 1.0 + (base - 0.5) * 0.2;
      o.rough = 0.88 - oil * 0.35 + aggregate * 0.05;
      o.ao = 1 - crack * 0.6;
    };
  },

  dirt(seed) {
    return (u, v, o) => {
      worley(u, v, 28, seed);
      const f1 = W.f1, id = W.id;
      const peb = smooth(0.62, 0.15, f1); // 1 in the middle of a pebble
      worley(u, v, 9, seed + 20);
      const big = smooth(0.5, 0.08, W.f1) * (W.id > 0.55 ? 1 : 0);
      const soil = fbm(u, v, 6, 6, 5, seed + 1);
      const fine = vnoise(u * 200, v * 200, 200, 200, seed + 2);
      const tone = 0.34 + (soil - 0.5) * 0.28 + (fine - 0.5) * 0.08;
      const pc = 0.26 + id * 0.28;
      let r = mix(tone * 1.1, pc * 1.02, peb * 0.85);
      let g = mix(tone * 0.88, pc * 0.96, peb * 0.85);
      let b = mix(tone * 0.66, pc * 0.9, peb * 0.85);
      r = mix(r, 0.4, big * 0.5); g = mix(g, 0.38, big * 0.5); b = mix(b, 0.35, big * 0.5);
      o.r = r; o.g = g; o.b = b;
      o.h = peb * 0.7 + big * 0.5 + (soil - 0.5) * 0.3 + (fine - 0.5) * 0.12;
      o.rough = 0.93 - peb * 0.12;
      o.ao = 1 - (1 - peb) * 0.1 - smooth(0.3, 0, f1) * 0;
    };
  },

  wood(seed) {
    // Crate planks: 4 horizontal planks, vertical battens at the sides, nails.
    return (u, v, o) => {
      const planks = 4;
      const row = Math.floor(v * planks);
      const fy = v * planks - row;
      const id = hash2(row, 3, seed);
      const grain = vnoise(u * 4, v * 140, 4, 140, seed + row * 3) * 0.6 + vnoise(u * 9, v * 300, 9, 300, seed + 5) * 0.4;
      const knot = fbm(u, v, 6, 6, 3, seed + 6);
      const ring = 0.5 + 0.5 * Math.sin((grain * 9 + knot * 4) * TAU * 0.5);
      const batten = smooth(0.1, 0.085, Math.min(u, 1 - u));
      const gap = 1 - smooth(0.012, 0.03, Math.min(fy, 1 - fy));
      const bid = batten > 0.5 ? 0.8 + hash2(1, 9, seed) * 0.2 : 1;
      let L = (0.62 + id * 0.35) * bid + (ring - 0.5) * 0.35;
      let r = 0.46 * L, g = 0.30 * L, b = 0.17 * L;
      // nails
      const nx = Math.min(Math.abs(u - 0.05), Math.abs(u - 0.95));
      const ny = Math.abs(fy - 0.5);
      const nail = smooth(0.016, 0.009, Math.hypot(nx, ny * 0.25)) * (batten > 0.5 ? 1 : 0);
      const dirt = smooth(0.5, 0.85, fbm(u, v, 3, 3, 3, seed + 8));
      r = mix(r, r * 0.6, dirt * 0.5); g = mix(g, g * 0.6, dirt * 0.5); b = mix(b, b * 0.6, dirt * 0.5);
      r = mix(r, 0.38, nail); g = mix(g, 0.36, nail); b = mix(b, 0.34, nail);
      r *= 1 - gap * 0.8; g *= 1 - gap * 0.8; b *= 1 - gap * 0.8;
      o.r = r; o.g = g; o.b = b;
      o.h = (ring - 0.5) * 0.25 + (grain - 0.5) * 0.18 - gap * 0.7 + batten * 0.35 + nail * 0.3;
      o.rough = 0.72 + (grain - 0.5) * 0.2 - nail * 0.3;
      o.metal = nail * 0.9;
      o.ao = 1 - gap * 0.7;
    };
  },

  metal(seed) {
    // Worn painted steel. Tint through material.color.
    return (u, v, o) => {
      const n = fbm(u, v, 4, 4, 5, seed);
      const fine = fbm(u, v, 32, 32, 3, seed + 1);
      const rustN = fbm(u, v, 5, 5, 5, seed + 2);
      const edge = 1 - Math.abs(2 * fbm(u, v, 7, 7, 3, seed + 3) - 1);
      const rust = smooth(0.6, 0.74, rustN * 0.8 + (1 - edge) * 0.0 + smooth(0.9, 1, edge) * 0.25);
      const scratchN = vnoise(u * 12, v * 220, 12, 220, seed + 4);
      const scratch = smooth(0.9, 0.97, scratchN) * (1 - rust);
      const paint = 0.78 + (n - 0.5) * 0.2;
      let r = paint, g = paint, b = paint;
      const rr = 0.42 + fine * 0.2;
      r = mix(r, rr, rust); g = mix(g, rr * 0.42, rust); b = mix(b, rr * 0.18, rust);
      r = mix(r, 0.62, scratch * 0.7); g = mix(g, 0.62, scratch * 0.7); b = mix(b, 0.62, scratch * 0.7);
      o.r = r; o.g = g; o.b = b;
      o.h = (n - 0.5) * 0.3 + rust * (fine - 0.3) * 0.7 - scratch * 0.2;
      o.rough = mix(0.42, 0.88, rust) + (fine - 0.5) * 0.18 - scratch * 0.2;
      o.metal = scratch * 0.95 + rust * 0.05;
      o.ao = 1 - rust * 0.25;
    };
  },

  container(seed) {
    // Corrugated cargo container panel, vertical ribs 0.25 m apart. Tint through material.color.
    return (u, v, o) => {
      const rib = 0.5 + 0.5 * Math.sin(u * TAU * 4);
      const trap = smooth(0.15, 0.85, rib);
      const n = fbm(u, v, 4, 4, 5, seed);
      const fine = fbm(u, v, 40, 40, 3, seed + 1);
      const bottom = smooth(0.0, 0.5, 1 - v);
      // rust gathers near the bottom and in a few patches, instead of covering the panel like camouflage
      const rustN = fbm(u, v, 6, 6, 4, seed + 2) * 0.42 + bottom * 0.62 + (1 - trap) * 0.04;
      const rust = smooth(0.66, 0.95, rustN);
      const streak = smooth(0.5, 0.85, fbm(u, v, 14, 2, 3, seed + 3));
      const paint = (0.74 + (n - 0.5) * 0.22) * (1 - streak * 0.25);
      let r = paint, g = paint, b = paint;
      const rr = 0.4 + fine * 0.22;
      r = mix(r, rr, rust); g = mix(g, rr * 0.4, rust); b = mix(b, rr * 0.16, rust);
      o.r = r; o.g = g; o.b = b;
      o.h = trap * 1.4 + (fine - 0.5) * 0.15 + rust * (fine - 0.3) * 0.5;
      o.rough = mix(0.5, 0.9, rust) + (fine - 0.5) * 0.15;
      o.metal = rust * 0.05 + (1 - rust) * 0.0;
      o.ao = 0.7 + trap * 0.3 - rust * 0.15;
    };
  },

  sandbag(seed) {
    // 3 rows of bags, 2 bags per row, running bond.
    return (u, v, o) => {
      const rows = 3;
      const row = Math.floor(v * rows);
      const fy = v * rows - row;
      const uu = u * 2 + (row & 1 ? 0.5 : 0);
      const colRaw = Math.floor(uu);
      const fx = uu - colRaw;
      const col = ((colRaw % 2) + 2) % 2;
      const id = hash2(col, row, seed);
      const pillow = Math.pow(Math.sin(Math.PI * clamp01(fx)) * Math.sin(Math.PI * clamp01(fy)), 0.6);
      const weaveX = 0.5 + 0.5 * Math.sin(u * 700), weaveY = 0.5 + 0.5 * Math.sin(v * 700);
      const weave = weaveX * weaveY;
      const dirt = fbm(u, v, 4, 4, 4, seed + 1);
      const seam = 1 - smooth(0.0, 0.07, Math.min(fx, 1 - fx, fy * 0.6, (1 - fy) * 0.6));
      const L = 0.82 + id * 0.3 + (dirt - 0.5) * 0.4 + (weave - 0.5) * 0.12;
      o.r = 0.55 * L * (1 - seam * 0.4);
      o.g = 0.47 * L * (1 - seam * 0.4);
      o.b = 0.33 * L * (1 - seam * 0.4);
      o.h = pillow * 1.0 + (weave - 0.5) * 0.1 - seam * 0.4;
      o.rough = 0.95;
      o.ao = 0.55 + pillow * 0.45;
    };
  },
};

export const TEXTURE_SPECS = [
  { id: 'concrete', size: 1024, strength: 2.2, texWorld: [2.0, 2.0] },
  { id: 'plaster', size: 512, strength: 2.0, texWorld: [2.0, 2.0] },
  { id: 'brick', size: 1024, strength: 3.0, texWorld: [2.0, 1.2] },
  { id: 'asphalt', size: 1024, strength: 2.5, texWorld: [3.0, 3.0] },
  { id: 'dirt', size: 512, strength: 3.2, texWorld: [3.0, 3.0] },
  { id: 'wood', size: 512, strength: 2.6, texWorld: [1.0, 1.0] },
  { id: 'metal', size: 512, strength: 1.8, texWorld: [1.5, 1.5] },
  { id: 'container', size: 512, strength: 4.0, texWorld: [1.0, 1.0] },
  { id: 'sandbag', size: 512, strength: 3.0, texWorld: [1.0, 1.0] },
];

/**
 * Generate every texture set. Yields to the browser between sets so a
 * loading bar can paint. Returns {id: {map, normalMap, orm, texWorld}}.
 */
export async function generateTextures(aniso = 8, onProgress = () => {}) {
  const out = {};
  for (let i = 0; i < TEXTURE_SPECS.length; i++) {
    onProgress(i / TEXTURE_SPECS.length, TEXTURE_SPECS[i].id);
    await new Promise((r) => setTimeout(r, 0));
    out[TEXTURE_SPECS[i].id] = generateSet(i, aniso);
  }
  onProgress(1, 'done');
  return out;
}

/** The generated set number i of TEXTURE_SPECS. The seed depends only on i. */
function generateSet(i, aniso) {
  const spec = TEXTURE_SPECS[i];
  const set = buildSet(spec.size, SHADERS[spec.id](1000 + i * 101), spec.strength, aniso);
  set.texWorld = spec.texWorld;
  return set;
}

/** Create a standard PBR material from a texture set (generated or photoscanned). */
export function pbrMaterial(set, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.orm,
    metalnessMap: set.orm,
    aoMap: set.orm,
    roughness: 1,
    metalness: 1,
    color: opts.color ?? 0xffffff,
    side: opts.side ?? THREE.FrontSide,
  });
  // a photoscan is brought to the brightness the level was designed with (see SCAN_FIT)
  if (set.gain) { m.color.r *= set.gain[0]; m.color.g *= set.gain[1]; m.color.b *= set.gain[2]; }
  m.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1);
  m.aoMapIntensity = opts.ao ?? 1;
  m.envMapIntensity = opts.env ?? 1;
  m.userData.texWorld = set.texWorld;
  m.userData.macro = true; // static world surfaces get the anti-tiling colour variation
  // plaster: irregular patches of exposed brick, placed in world space (a scan brings its own damage)
  m.userData.patches = !!opts.patches && set.patches !== false;
  return m;
}

export function setAnisotropy(textures, aniso) {
  for (const set of Object.values(textures)) {
    for (const k of ['map', 'normalMap', 'orm']) {
      if (set[k].anisotropy !== aniso) { set[k].anisotropy = aniso; set[k].needsUpdate = true; }
    }
  }
}

/**
 * Small tileable normal map that is blended over every surface at close range,
 * so textures keep fine grain instead of turning into mush when you stand next to them.
 */
export function makeDetailNormal() {
  const set = buildSet(256, (u, v, o) => {
    o.h = fbm(u, v, 16, 16, 4, 77) * 0.6 + vnoise(u * 96, v * 96, 96, 96, 91) * 0.5;
  }, 2.6, 8);
  set.map.dispose();
  set.orm.dispose();
  set.normalMap.userData = { detail: false };
  return set.normalMap;
}

/**
 * Tileable low-frequency noise (R and G hold two independent layers). The renderer samples it in
 * world space to vary the colour of every surface over metres, which hides texture repetition.
 */
export function makeMacroNoise() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      data[i] = Math.round(255 * smooth(0.25, 0.75, fbm(u, v, 4, 4, 4, 311)));
      data[i + 1] = Math.round(255 * smooth(0.3, 0.7, fbm(u, v, 3, 3, 3, 733)));
      data[i + 2] = 0; data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ======================================================================
// Texture pack: photoscans when present, procedural otherwise.
//
//   loadTexturePack()  -> Promise<{sets, source, loaded, missing}>
//   getMaterial(kind, opts) -> THREE.Material (cached)
//   KINDS              the surface kinds the game asks for
//
// Photoscans are optional files in assets/textures/ named <kind>_diff.<ext>,
// <kind>_nor.<ext> (OpenGL normals) and <kind>_arm.<ext> (R ambient occlusion,
// G roughness, B metalness, the layout of Poly Haven ARM maps). ext is webp,
// jpg or png. In the single-file build they are embedded in window.__ASSETS.
// A kind whose three files are not all there keeps its procedural set, so a
// missing or broken file never breaks the game.
// ======================================================================

export const KINDS = TEXTURE_SPECS.map((s) => s.id);

let PACK = null;
const MATERIALS = new Map();

let MANIFEST = null; // a promise: callers that ask at the same time must wait for the same fetch

/** assets/manifest.json lists the optional files that exist. One request, no guessing. */
function readManifest(base) {
  if (MANIFEST) return MANIFEST;
  MANIFEST = (async () => {
    if (typeof location === 'undefined' || location.protocol === 'file:') return [];
    if (window.__ASSETS) return []; // single-file build: everything it has is embedded
    try {
      const r = await fetch(new URL('../manifest.json', new URL(base, location.href)).href);
      if (r.ok) { const j = await r.json(); return Array.isArray(j.files) ? j.files : []; }
    } catch (e) { /* no manifest: no optional assets */ }
    return [];
  })();
  return MANIFEST;
}

/**
 * URL of an optional asset: an embedded data URI (single-file build) or a file listed
 * in assets/manifest.json. Returns null when it is not there.
 */
export async function findAsset(name, exts, base) {
  const embedded = typeof window !== 'undefined' && window.__ASSETS;
  for (const ext of exts) {
    const file = name + '.' + ext;
    if (embedded && embedded[file]) return embedded[file];
  }
  const listed = await readManifest(base);
  for (const ext of exts) if (listed.includes(name + '.' + ext)) return base + name + '.' + ext;
  return null;
}

/**
 * How each photoscan is fitted to the game.
 *   world     metres one tile covers. From the Poly Haven catalog, except plaster (shown larger,
 *             its stains repeat too visibly at the scanned 1.8 m) and metal
 *   gain      linear colour multiplier that brings the scan's average to the average of the
 *             generated texture it replaces, so the level keeps the palette it was lit for
 *   grey      drop the scan's own colour and set its average brightness to this value: the
 *             corrugated iron is rust red all over, and containers are painted per object
 *   contrast  below 1 pulls the colour toward its average. The plaster scan is a badly damaged
 *             wall; at full contrast a street of it reads as a pattern
 *   patches   false: no shader patches of exposed brick on top, the scan has its own damage
 * Averages were measured on the files: asphalt 0.22 against 0.02 generated, plaster 0.16
 * against 0.36, dirt 0.23 against 0.09, corrugated iron 0.04 against 0.26.
 */
const SCAN_FIT = {
  concrete: { world: [2.7, 2.7], gain: [0.8, 0.85, 1.1] },
  plaster: { world: [2.6, 2.6], gain: [2.2, 2.2, 2.2], contrast: 0.35, patches: false },
  brick: { world: [1, 1], gain: [1.1, 0.9, 0.85] },
  asphalt: { world: [2.35, 2.35], gain: [0.21, 0.25, 0.3] },
  dirt: { world: [3, 3], gain: [0.42, 0.4, 0.45] },
  wood: { world: [1.8, 1.8], gain: [1, 0.85, 0.7] },
  metal: { world: [1.5, 1.5], gain: [1.2, 1.2, 1.2] },
  container: { world: [2, 2], grey: 0.26, contrast: 0.4 },
  // sandbag: no scan. A cloth scan (hessian) was tried: it shows the weave but not the bags,
  // and a wall of sandbags turned into a block of fabric. The generated set draws the bags.
};

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/**
 * A colour texture regraded on a canvas, in linear light. grey: keep brightness only and set
 * its average to that level. contrast: scale the distance of every pixel from the average.
 */
function gradeTexture(tex, { grey = 0, contrast = 1 }) {
  const img = tex.image;
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height), d = data.data, n = d.length / 4;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = toLinear(i / 255);
  const lin = new Float32Array(n * 3), mean = [0, 0, 0];
  for (let i = 0, k = 0; i < d.length; i += 4, k += 3) {
    let r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
    if (grey) r = g = b = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lin[k] = r; lin[k + 1] = g; lin[k + 2] = b;
    mean[0] += r; mean[1] += g; mean[2] += b;
  }
  for (let c = 0; c < 3; c++) mean[c] /= n;
  const scale = grey ? grey / (mean[0] || 1) : 1;
  for (let i = 0, k = 0; i < d.length; i += 4, k += 3) {
    for (let c = 0; c < 3; c++) {
      const v = (mean[c] + (lin[k + c] - mean[c]) * contrast) * scale;
      d[i + c] = Math.round(255 * toSrgb(Math.min(1, Math.max(0, v))));
    }
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.wrapS = out.wrapT = THREE.RepeatWrapping;
  out.colorSpace = tex.colorSpace;
  out.anisotropy = tex.anisotropy;
  out.generateMipmaps = true;
  out.minFilter = THREE.LinearMipmapLinearFilter;
  tex.dispose();
  return out;
}

function loadImageTexture(url, srgb, aniso) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => reject(new Error('cannot load ' + url));
    img.src = url;
  });
}

/** The photoscan of one kind as a texture set, or null when its three files are not all there. */
async function loadScan(kind, base, aniso) {
  const fit = SCAN_FIT[kind];
  if (!fit) return null;   // a scan that was never fitted to the level would look wrong
  const exts = ['webp', 'jpg', 'png'];
  const [d, n, a] = await Promise.all([
    findAsset(kind + '_diff', exts, base), findAsset(kind + '_nor', exts, base), findAsset(kind + '_arm', exts, base),
  ]);
  if (!d || !n || !a) return null;
  const [map, normalMap, orm] = await Promise.all([loadImageTexture(d, true, aniso), loadImageTexture(n, false, aniso), loadImageTexture(a, false, aniso)]);
  return {
    map: fit.grey || fit.contrast ? gradeTexture(map, fit) : map, normalMap, orm,
    texWorld: fit.world, gain: fit.gain, patches: fit.patches, scan: true,
  };
}

/**
 * Build the textures, one surface kind at a time: its photoscan when the files are there and
 * scans are wanted, the generated set otherwise. A scan that fails to load falls back to the
 * generated set, so a missing or broken file never breaks the game.
 */
export async function loadTexturePack({ aniso = 8, onProgress = () => {}, base = 'assets/textures/', scans = true } = {}) {
  const sets = {};
  const state = { sets, source: 'procedural', loaded: [], missing: [] };
  for (let i = 0; i < TEXTURE_SPECS.length; i++) {
    const kind = TEXTURE_SPECS[i].id;
    onProgress(i / TEXTURE_SPECS.length, kind);
    await new Promise((r) => setTimeout(r, 0));   // let the loading bar paint
    let set = null;
    if (scans) { try { set = await loadScan(kind, base, aniso); } catch (e) { set = null; } }
    if (set) { set.texWorld = set.texWorld || TEXTURE_SPECS[i].texWorld; state.loaded.push(kind); }
    else { set = generateSet(i, aniso); state.missing.push(kind); }
    sets[kind] = set;
  }
  state.source = state.loaded.length === 0 ? 'procedural' : state.missing.length === 0 ? 'scans' : 'mixed';
  PACK = state;
  MATERIALS.clear();
  onProgress(1, 'done');
  return state;
}

/** Which textures are in use: {source, loaded, missing}. */
export function texturePackState() {
  return PACK ? { source: PACK.source, loaded: [...PACK.loaded], missing: [...PACK.missing] } : { source: 'none', loaded: [], missing: [...KINDS] };
}

export function getTextureSets() { return PACK ? PACK.sets : null; }

/** A shared PBR material for a surface kind. opts: {color, normalScale, ao, env, side}. */
export function getMaterial(kind, opts = {}) {
  if (!PACK) throw new Error('loadTexturePack() must finish first');
  const key = kind + '|' + (opts.color ?? '') + '|' + (opts.normalScale ?? '') + '|' + (opts.side ?? '');
  let m = MATERIALS.get(key);
  if (!m) { m = pbrMaterial(PACK.sets[kind], opts); MATERIALS.set(key, m); }
  return m;
}
