// Building blocks for the weapons in the player's hands.
//
// A weapon used to be sixty-odd separate boxes. Here its parts are cut from side-view
// outlines, turned on the barrel axis or rounded, painted per vertex and poured into one
// geometry per moving part, so a weapon costs a handful of draw calls.
//
// Three materials cover a weapon: hard (metal, polymer), soft (gloves) and cloth (sleeves).
//
//   const s = new Sculpt();
//   s.prism('body', PAINT.polymer, outline, 0.03);   // a part cut from a side view
//   s.lathe('body', PAINT.steel, profile);           // a turned part on the barrel axis
//   s.mesh('body', materials.hard)                   // -> THREE.Mesh
//
// Axes of a weapon: the muzzle points to -z, up is +y, the right side is +x. Metres.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Paints. metal and rough multiply the detail texture of the material, glow makes the vertex
 * shine with its own colour (sight dots, the red dot of the optic).
 */
export const PAINT = {
  steel: { color: 0x34373c, metal: 0.92, rough: 0.5 },
  steelWorn: { color: 0x6a6f76, metal: 0.95, rough: 0.4 },
  blued: { color: 0x202227, metal: 0.72, rough: 0.4 },
  parkerized: { color: 0x383a3d, metal: 0.5, rough: 0.6 },
  anodized: { color: 0x26282c, metal: 0.55, rough: 0.52 },
  polymer: { color: 0x1f2022, metal: 0, rough: 0.74 },
  polymerLight: { color: 0x2c2d30, metal: 0, rough: 0.8 },
  earth: { color: 0x7b684a, metal: 0, rough: 0.82 },
  earthDark: { color: 0x5b4c36, metal: 0, rough: 0.85 },
  rubber: { color: 0x121212, metal: 0, rough: 0.95 },
  hollow: { color: 0x030303, metal: 0, rough: 1 },
  brass: { color: 0x94763a, metal: 1, rough: 0.46 },
  shellRed: { color: 0x8e1f18, metal: 0, rough: 0.55 },
  lensRim: { color: 0x0c0d0f, metal: 0.4, rough: 0.3 },
  dotWhite: { color: 0xe8e8d8, metal: 0, rough: 0.6, glow: 1.1 },
  dotRed: { color: 0xff1206, metal: 0, rough: 0.6, glow: 3.2 },
  // cloth and gloves (the soft material)
  glove: { color: 0x6b6046, metal: 0, rough: 1 },
  gloveDark: { color: 0x2a2a28, metal: 0, rough: 0.9 },
  guard: { color: 0x17181a, metal: 0, rough: 0.62 },
  strap: { color: 0x74654a, metal: 0, rough: 1 },
  sleeve: { color: 0x5a5c42, metal: 0, rough: 1 },
  sleeveDark: { color: 0x3a3c2c, metal: 0, rough: 1 },
  // wave 13 weapons
  olive: { color: 0x4b4f3a, metal: 0, rough: 0.78 },
  oliveDark: { color: 0x34372a, metal: 0, rough: 0.82 },
  lens: { color: 0x10202a, metal: 0.7, rough: 0.12 },
  gauge: { color: 0xdedbd0, metal: 0, rough: 0.5, glow: 0.15 },
  fuelRed: { color: 0x6a1e15, metal: 0.3, rough: 0.55 },
  hazard: { color: 0xb8902a, metal: 0, rough: 0.7 },
  copper: { color: 0x8a5a36, metal: 0.95, rough: 0.42 },
  ember: { color: 0xff7a20, metal: 0, rough: 0.6, glow: 2.4 },
};

const _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** A placement: position, then rotation (radians, XYZ order), then scale. */
export function place(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** Outline of a rectangle with rounded corners, [[x, y], ...]. */
export function roundRect(cx, cy, w, h, r, seg = 4) {
  const pts = [], hw = w / 2 - r, hh = h / 2 - r;
  const corners = [[hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, Math.PI * 1.5]];
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * Math.PI / 2;
      pts.push([cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r]);
    }
  }
  return pts;
}

export class Sculpt {
  constructor() { this.buckets = new Map(); }

  /**
   * Pour a geometry into a part. `matrix` places it, `paint` colours every vertex of it.
   * shade(nx, ny, nz) -> factor darkens vertices by the way they face in the geometry's own space.
   */
  add(part, geometry, paint, matrix = null, shade = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    let b = this.buckets.get(part);
    if (!b) { b = { pos: [], nor: [], col: [], surf: [] }; this.buckets.set(part, b); }
    const P = g.attributes.position, N = g.attributes.normal;
    const c = paint.linear || (paint.linear = new THREE.Color(paint.color));
    const metal = paint.metal ?? 0, rough = paint.rough ?? 0.8, glow = paint.glow ?? 0;
    // a mirrored placement turns every triangle inside out: read its corners backwards
    const flip = !!matrix && matrix.determinant() < 0;
    if (matrix) _n3.getNormalMatrix(matrix);
    for (let t = 0; t + 2 < P.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = t + (flip ? 2 - k : k);
        _v.fromBufferAttribute(P, i);
        if (matrix) _v.applyMatrix4(matrix);
        b.pos.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(N, i);
        const dim = shade ? shade(_v.x, _v.y, _v.z) : 1;
        if (matrix) _v.applyMatrix3(_n3).normalize();
        b.nor.push(_v.x, _v.y, _v.z);
        b.col.push(c.r * dim, c.g * dim, c.b * dim);
        b.surf.push(metal, rough, glow);
      }
    }
    return this;
  }

  /** A block with softened edges. r: edge radius (0 keeps it sharp and cheap). */
  box(part, paint, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, r = Math.min(0.0028, Math.min(w, h, d) * 0.25)) {
    const g = r < 0.0007 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
    return this.add(part, g, paint, place(x, y, z, rx, ry, rz));
  }

  /**
   * A part cut from a side view. pts: the outline as [[z, y], ...], `width` across the gun.
   * holes: outlines cut through it. bevel rounds the edges of both sides.
   */
  prism(part, paint, pts, width, { x = 0, bevel = 0.002, holes = [], matrix = null } = {}) {
    const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
    const b = Math.min(bevel, width * 0.45);
    const depth = width - 2 * b;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateY(-Math.PI / 2);          // outline x becomes z of the gun, the thickness lies along x
    g.translate(x, 0, 0);
    return this.add(part, g, paint, matrix);
  }

  /**
   * A part with a window in it, seen from the front: outer and inner outlines as [[x, y], ...],
   * `depth` along the gun starting at z and running back. inner may be null (a solid plate).
   */
  frame(part, paint, outer, inner, depth, z, { bevel = 0.0012, matrix = null } = {}) {
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    if (inner) shape.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y))));
    const b = Math.min(bevel, depth * 0.45);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: depth - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 2, curveSegments: 6,
    });
    g.translate(0, 0, z + b);
    return this.add(part, g, paint, matrix);
  }

  /**
   * A turned part around the barrel axis at (x, y). profile: [[z, r], ...] with z growing,
   * that is from the muzzle backwards. Every corner of the profile stays a hard edge.
   */
  lathe(part, paint, profile, { x = 0, y = 0, seg = 16, matrix = null } = {}) {
    const pts = [];
    profile.forEach(([z, r], i) => {
      pts.push(new THREE.Vector2(Math.max(r, 0.00001), z));
      if (i > 0 && i < profile.length - 1) pts.push(new THREE.Vector2(Math.max(r, 0.00001), z));   // doubled point: hard edge
    });
    const g = new THREE.LatheGeometry(pts, seg);
    g.rotateX(Math.PI / 2);           // the lathe axis becomes z of the gun
    g.translate(x, y, 0);
    return this.add(part, g, paint, matrix);
  }

  /** A plain cylinder. axis: 'x', 'y' or 'z'. r2: radius of the far end when it tapers. */
  cyl(part, paint, r, len, x = 0, y = 0, z = 0, axis = 'z', seg = 12, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    else if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return this.add(part, g, paint);
  }

  has(part) { return this.buckets.has(part); }

  /**
   * One mesh for everything poured into a part. The detail texture is laid on by box projection
   * (per triangle, along the axis it faces most), `uvScale` repeats per metre.
   */
  mesh(part, material, uvScale = 14) {
    const b = this.buckets.get(part);
    if (!b) throw new Error('no such part: ' + part);
    const n = b.pos.length / 3, P = b.pos, uv = new Float32Array(n * 2);
    for (let t = 0; t + 2 < n; t += 3) {
      _a.set(P[t * 3], P[t * 3 + 1], P[t * 3 + 2]);
      _b.set(P[t * 3 + 3], P[t * 3 + 4], P[t * 3 + 5]);
      _c.set(P[t * 3 + 6], P[t * 3 + 7], P[t * 3 + 8]);
      _b.sub(_a); _c.sub(_a); _b.cross(_c);
      const ax = Math.abs(_b.x), ay = Math.abs(_b.y), az = Math.abs(_b.z);
      for (let k = 0; k < 3; k++) {
        const i = t + k, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        if (ax >= ay && ax >= az) { uv[i * 2] = z * uvScale; uv[i * 2 + 1] = y * uvScale; }
        else if (ay >= az) { uv[i * 2] = x * uvScale; uv[i * 2 + 1] = z * uvScale; }
        else { uv[i * 2] = x * uvScale; uv[i * 2 + 1] = y * uvScale; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setAttribute('surf', new THREE.Float32BufferAttribute(b.surf, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(g, material);
    mesh.name = part;
    return mesh;
  }
}

// ----------------------------------------------------------------- textures
function lattice(cells, seed) {
  const a = new Float32Array(cells * cells);
  let s = seed >>> 0;
  for (let i = 0; i < a.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; a[i] = s / 4294967296; }
  return a;
}

/** Tileable value noise, size x size, `cells` lattice cells across. Values 0..1. */
function tileNoise(size, cells, seed) {
  const L = lattice(cells, seed), out = new Float32Array(size * size), k = cells / size;
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = y * k, y0 = Math.floor(fy), v = sm(fy - y0), ya = (y0 % cells) * cells, yb = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = x * k, x0 = Math.floor(fx), u = sm(fx - x0), xa = x0 % cells, xb = (x0 + 1) % cells;
      const a = L[ya + xa], b = L[ya + xb], c = L[yb + xa], d = L[yb + xb];
      out[y * size + x] = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
  }
  return out;
}

function fbm(size, octaves, seed) {
  const out = new Float32Array(size * size);
  let total = 0;
  octaves.forEach(([cells, weight], i) => {
    const n = tileNoise(size, cells, seed + i * 977);
    for (let j = 0; j < out.length; j++) out[j] += n[j] * weight;
    total += weight;
  });
  for (let j = 0; j < out.length; j++) out[j] /= total;
  return out;
}

function toTexture(size, fill, srgb) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) {
    const [r, g, b] = fill(i % size, Math.floor(i / size), i);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Normal map of a tileable height field (0..1). strength: how steep a full step reads. */
function normalTexture(size, height, strength) {
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  return toTexture(size, (x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const inv = 1 / Math.hypot(dx, dy, 1);
    return [(-dx * inv * 0.5 + 0.5) * 255, (dy * inv * 0.5 + 0.5) * 255, (inv * 0.5 + 0.5) * 255];
  }, false);
}

/** Thin straight scratches, wrapped at the edges. Adds `amount` along each one. */
function scratches(size, field, count, amount, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) {
    let x = rnd() * size, y = rnd() * size;
    const a = rnd() * Math.PI * 2, len = 8 + rnd() * 46, k = amount * (0.4 + rnd() * 0.6);
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let j = 0; j < len; j++, x += dx, y += dy) {
      const px = ((Math.round(x) % size) + size) % size, py = ((Math.round(y) % size) + size) % size;
      field[py * size + px] += k * Math.sin((j / len) * Math.PI);
    }
  }
}

const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

/**
 * The two detail sets every weapon shares: `hard` for metal and polymer (fine grain, oily
 * smudges, scratches), `soft` for gloves and sleeves (weave and folds).
 */
function detailTextures() {
  const S = 256;
  // metal and polymer
  const blot = fbm(S, [[4, 0.5], [9, 0.3], [20, 0.2]], 11);
  const smudge = fbm(S, [[3, 0.6], [7, 0.4]], 23);
  const grain = fbm(S, [[64, 0.5], [128, 0.5]], 37);
  const light = new Float32Array(S * S), shine = new Float32Array(S * S);
  scratches(S, light, 46, 0.2, 5);
  scratches(S, shine, 70, 0.4, 9);
  const hard = {
    map: toTexture(S, (x, y, i) => { const v = byte(0.84 + 0.16 * blot[i] + light[i] - 0.05 * grain[i]); return [v, v, v]; }, true),
    rough: toTexture(S, (x, y, i) => {
      const oily = Math.max(0, smudge[i] - 0.52) * 1.5;            // patches rubbed smooth by hands
      const v = byte(0.8 + 0.2 * grain[i] - oily - shine[i]);
      return [255, v, 255];
    }, false),
    normal: normalTexture(S, grain, 1.6),
  };
  // cloth
  const folds = fbm(S, [[3, 0.55], [6, 0.3], [13, 0.15]], 51);
  const dirt = fbm(S, [[5, 0.6], [11, 0.4]], 67);
  const weave = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = Math.sin((x * Math.PI) / 4), b = Math.sin((y * Math.PI) / 4);
    // threads cross over and under each other in a four pixel checker
    weave[y * S + x] = ((x >> 2) + (y >> 2)) % 2 ? a * a : b * b;
  }
  const clothHeight = new Float32Array(S * S);
  for (let i = 0; i < clothHeight.length; i++) clothHeight[i] = weave[i] * 0.16 + folds[i] * 2.2;
  // Gloves are plain cloth. Sleeves carry a two-tone disruptive pattern: with the pattern on
  // both, glove and sleeve read as one camouflage mitten.
  const patchA = fbm(S, [[3, 0.6], [6, 0.4]], 83), patchB = fbm(S, [[5, 0.55], [10, 0.45]], 91);
  const rough = toTexture(S, () => [255, 244, 255], false), normal = normalTexture(S, clothHeight, 2.4);
  const soft = {
    map: toTexture(S, (x, y, i) => { const v = byte(0.8 + 0.14 * dirt[i] + 0.1 * weave[i]); return [v, v, v]; }, true),
    rough, normal,
  };
  const cloth = {
    map: toTexture(S, (x, y, i) => {
      const tone = patchA[i] > 0.56 ? 0.66 : patchB[i] > 0.6 ? 1.12 : 0.9;
      const v = (0.82 + 0.12 * dirt[i] + 0.1 * weave[i]) * tone;
      return [byte(v), byte(v * (patchB[i] > 0.6 ? 0.97 : 1)), byte(v * (patchB[i] > 0.6 ? 0.86 : 1))];
    }, true),
    rough, normal,
  };
  return { hard, soft, cloth };
}

/**
 * Standard material that reads metalness, roughness and glow from the `surf` attribute and
 * colour from the vertex colours, so one material covers steel, polymer and glowing sight dots.
 */
function surfMaterial(tex, normalScale) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 1, roughness: 1,
    map: tex.map, roughnessMap: tex.rough, normalMap: tex.normal, normalScale: new THREE.Vector2(normalScale, normalScale),
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor * vSurf.y, 0.05, 1.0 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurf.x;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.z;');
  };
  m.customProgramCacheKey = () => 'weapon-surf';
  return m;
}

/** Materials shared by all weapons in hand. flashTex: the muzzle flash sprite of the effects layer. */
export function weaponMaterials(flashTex) {
  const tex = detailTextures();
  return {
    hard: surfMaterial(tex.hard, 0.12),
    soft: surfMaterial(tex.soft, 0.45),     // gloves
    cloth: surfMaterial(tex.cloth, 0.8),    // sleeves
    glass: new THREE.MeshStandardMaterial({ color: 0x3a5a66, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false }),
    flash: new THREE.MeshBasicMaterial({
      map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
    textures: [tex.hard.map, tex.hard.rough, tex.hard.normal, tex.soft.map, tex.soft.rough, tex.soft.normal, tex.cloth.map],
  };
}
