// The parked vehicles of the maps (wave 15, G05-G14), built from code: the set of core/fleet.js (a tractor,
// three roadsters, four saloons and crossovers, a van and its long bus, three angular customs and a pickup).
//
// A body is lofted: cross sections along the length (bottom, sill, side, shoulder, glass, rail, roof) from a
// handful of key stations, wheel arches cut out of it, the nose and the tail capped. Lamps, seams, handles
// and grilles are strips laid on that surface; wheels are turned (tyre with its sidewall, rim, spokes of the
// model's style, brake disc and calliper). Everything is painted per vertex: colour, metalness, roughness and
// glow (the lamps), so the whole set is ONE material and a map pays one draw call per 30 m chunk for all its
// vehicles. The geometry goes into the world's batches (World._addGeo) before World._flush; the shadow maps
// and the ambient occlusion pass get a low hull of each vehicle instead of its thousands of triangles
// (casterProxies, aoProxies of World._flush). No colliders here: the place sets them (World.car, a layout
// piece, a parking place of the block).
//
// No badges, emblems, lettering or plates: the models are known by their shape.
//
//   buildVehicle(world, id, {x, z, yaw, state: 'parked'|'burnt', paint, tarp, seed})
//   fleetMaterials(world)        -> {body}: the one material of the set, kept in world.m (World.dispose frees it)
//   vehicleGeometry(id, opts)    -> {geometry, proxy, size}: the model in its own frame (cached)
//
// Frame of a model: x along it (the nose at +x), y up from the ground, z across; the middle of its length at 0.

import * as THREE from 'three';
import { vehicleOf, PAINTS, pickPaint } from '../core/fleet.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------------------------------- paints
/** Surface paints: sRGB colour, metalness, roughness, glow (emission in units of the colour). */
const C = {
  under: { color: 0x121314, metal: 0.1, rough: 0.9 },
  well: { color: 0x0b0b0c, metal: 0, rough: 0.95 },
  trim: { color: 0x0c0d0f, metal: 0.35, rough: 0.22 },
  matte: { color: 0x17181a, metal: 0, rough: 0.72 },
  grille: { color: 0x0e0f10, metal: 0.2, rough: 0.55 },
  glass: { color: 0x07090c, metal: 0.6, rough: 0.05 },
  clear: { color: 0x34434d, metal: 0.55, rough: 0.04 },
  tank: { color: 0xa3150f, metal: 0.3, rough: 0.35 },
  chrome: { color: 0xc9ccd0, metal: 1, rough: 0.14 },
  tyre: { color: 0x151515, metal: 0, rough: 0.93 },
  sidewall: { color: 0x1d1d1f, metal: 0, rough: 0.8 },
  rimSilver: { color: 0xa3a8ae, metal: 0.92, rough: 0.28 },
  rimGrey: { color: 0x4a4e54, metal: 0.8, rough: 0.34 },
  rimDark: { color: 0x26282c, metal: 0.65, rough: 0.36 },
  rimBlack: { color: 0x101113, metal: 0.4, rough: 0.42 },
  aero: { color: 0x34373c, metal: 0.35, rough: 0.42 },
  rimWhite: { color: 0xd8dad8, metal: 0.3, rough: 0.4 },
  disc: { color: 0x66686c, metal: 0.9, rough: 0.48 },
  hub: { color: 0x2e3033, metal: 0.7, rough: 0.5 },
  caliperRed: { color: 0xb3141a, metal: 0.2, rough: 0.4 },
  caliperGrey: { color: 0x3c3e42, metal: 0.5, rough: 0.5 },
  head: { color: 0xf6f3ea, metal: 0.1, rough: 0.12, glow: 1.5 },
  lamp: { color: 0x1d2024, metal: 0.7, rough: 0.12 },
  tail: { color: 0xb80d0a, metal: 0.1, rough: 0.2, glow: 1.3 },
  tailDim: { color: 0x5a0605, metal: 0.2, rough: 0.15, glow: 0.35 },
  amber: { color: 0xff8618, metal: 0, rough: 0.3, glow: 0.9 },
  seam: { color: 0x0a0a0b, metal: 0, rough: 0.9 },
  seat: { color: 0x151413, metal: 0, rough: 0.72 },
  seatRed: { color: 0xa0160f, metal: 0, rough: 0.55 },
  seatWhite: { color: 0xd6d3cb, metal: 0, rough: 0.5 },
  tub: { color: 0x0f0f10, metal: 0, rough: 0.85 },
  steel: { color: 0x9a9da1, metal: 0.82, rough: 0.38 },
  rivet: { color: 0x6c6f73, metal: 0.9, rough: 0.3 },
  frame: { color: 0x1a1b1d, metal: 0.5, rough: 0.45 },
  nozzle: { color: 0x2a2b2e, metal: 0.9, rough: 0.3 },
  // the burnt shell
  soot: { color: 0x1b1714, metal: 0.15, rough: 0.9 },
  ash: { color: 0x4f4b47, metal: 0.1, rough: 0.95 },
  rust: { color: 0x43271a, metal: 0.25, rough: 0.85 },
  charInside: { color: 0x0d0b0a, metal: 0, rough: 1 },
  wire: { color: 0x2c2826, metal: 0.2, rough: 0.9 },
};

/** A paint from a name of core/fleet PAINTS or an sRGB number; bodies are glossy, the matte and steel ones less so. */
function bodyPaint(name) {
  const hex = typeof name === 'number' ? name : (PAINTS[name] ?? PAINTS.silver);
  if (name === 'steel') return { color: hex, metal: 0.62, rough: 0.4, brushed: true, body: true };
  if (name === 'matte') return { color: hex, metal: 0.05, rough: 0.62, body: true };
  if (name === 'teal') return { color: hex, metal: 0.55, rough: 0.12, body: true };
  const metallic = name === 'silver' || name === 'grey' || name === 'blue' || name === 'red';
  return { color: hex, metal: metallic ? 0.3 : 0.04, rough: metallic ? 0.16 : 0.1, body: true };
}

// a burnt car is soot, ash and rust in patches; trim and rubber go black and dull, lamps go out
const SOOT = new THREE.Color(0x1b1714);
const burntCache = new WeakMap();
function burnt(p) {
  if (!p || p.burnt) return p;
  let b = burntCache.get(p);
  if (!b) {
    const c = new THREE.Color(p.color).lerp(SOOT, p.metal > 0.8 ? 0.6 : 0.82);
    b = { color: c.getHex(), metal: (p.metal ?? 0) * 0.3, rough: Math.min(1, 0.6 + (p.rough ?? 0.8) * 0.4), glow: 0, burnt: true };
    burntCache.set(p, b);
  }
  return b;
}
/** The mottled shell of a burnt body (colour chosen per vertex in Mesher). */
const CHAR = { color: 0x1b1714, metal: 0.18, rough: 0.9, mottle: true, burnt: true };

// ---------------------------------------------------------------------------------------- noise
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Smooth value noise in 3D, about 0..1. */
function vnoise(x, y, z) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const u = smooth(x - x0), v = smooth(y - y0), w = smooth(z - z0);
  let out = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    out += hash3(x0 + dx, y0 + dy, z0 + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return out;
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _c4 = new THREE.Color();
_c2.setHex(C.ash.color); _c3.setHex(C.rust.color); _c4.setHex(C.soot.color);

// ---------------------------------------------------------------------------------------- mesher
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

/** Triangles with per-vertex colour and surface (metalness, roughness, glow), under a transform. */
class Mesher {
  constructor() {
    this.pos = []; this.nor = []; this.col = []; this.surf = [];
    this.matrix = null; this.flip = false;
  }

  /** Run fn with every vertex it adds moved by m (after any transform already in force). */
  with(m, fn) {
    const prev = this.matrix, prevFlip = this.flip;
    this.matrix = prev ? prev.clone().multiply(m) : m.clone();
    this.flip = this.matrix.determinant() < 0;
    _nm.getNormalMatrix(this.matrix);
    this._nm = _nm.clone();
    fn();
    this.matrix = prev; this.flip = prevFlip;
    if (prev) { _nm.getNormalMatrix(prev); this._nm = _nm.clone(); } else this._nm = null;
  }

  _vert(p, n, paint) {
    _v.set(p[0], p[1], p[2]); _n.set(n[0], n[1], n[2]);
    if (this.matrix) { _v.applyMatrix4(this.matrix); _n.applyMatrix3(this._nm).normalize(); }
    this.pos.push(_v.x, _v.y, _v.z);
    this.nor.push(_n.x, _n.y, _n.z);
    const lin = paint.lin || (paint.lin = new THREE.Color(paint.color));
    if (paint.mottle) {
      // soot with patches of grey ash and rust, by place on the body
      const a = vnoise(_v.x * 2.3 + 11, _v.y * 2.3, _v.z * 2.3), b = vnoise(_v.x * 4.1, _v.y * 4.1 + 7, _v.z * 4.1);
      _c1.copy(_c4).lerp(_c2, clamp((a - 0.5) * 2.6, 0, 0.8)).lerp(_c3, clamp((b - 0.6) * 3, 0, 0.7));
      _c1.multiplyScalar(0.8 + 0.4 * vnoise(_v.x * 9, _v.y * 9, _v.z * 9));
      this.col.push(_c1.r, _c1.g, _c1.b);
    } else if (paint.brushed) {
      const k = 0.94 + 0.1 * vnoise(_v.x * 1.7, _v.y * 6, _v.z * 1.7);
      this.col.push(lin.r * k, lin.g * k, lin.b * k);
    } else this.col.push(lin.r, lin.g, lin.b);
    this.surf.push(paint.metal ?? 0, paint.rough ?? 0.8, paint.glow ?? 0);
  }

  /** One triangle; n: one normal for all three or [na, nb, nc]. */
  tri(a, b, c, paint, na = null, nb = null, nc = null) {
    if (!paint) return;
    if (!na) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) return;
      nx /= l; ny /= l; nz /= l;
      na = nb = nc = [nx, ny, nz];
    }
    if (this.flip) { this._vert(a, na, paint); this._vert(c, nc, paint); this._vert(b, nb, paint); }
    else { this._vert(a, na, paint); this._vert(b, nb, paint); this._vert(c, nc, paint); }
  }

  quad(a, b, c, d, paint) { this.tri(a, b, c, paint); this.tri(a, c, d, paint); }

  /** A three.js geometry, placed by m, in one paint. shape(x, y, z) may move each vertex (local space). */
  geo(g, paint, m = null, shape = null) {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.normal) gg.computeVertexNormals();
    const P = gg.attributes.position, N = gg.attributes.normal;
    const run = () => {
      for (let i = 0; i + 2 < P.count; i += 3) {
        const pts = [], ns = [];
        for (let k = 0; k < 3; k++) {
          let p = [P.getX(i + k), P.getY(i + k), P.getZ(i + k)];
          if (shape) p = shape(p);
          pts.push(p); ns.push([N.getX(i + k), N.getY(i + k), N.getZ(i + k)]);
        }
        this.tri(pts[0], pts[1], pts[2], paint, ns[0], ns[1], ns[2]);
      }
    };
    if (m) this.with(m, run); else run();
    g.dispose(); if (gg !== g) gg.dispose();
  }

  /** A box (sizes along x, y, z) centred at (x, y, z), turned by (rx, ry, rz). */
  box(paint, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
    this.geo(new THREE.BoxGeometry(sx, sy, sz), paint, place(x, y, z, rx, ry, rz));
  }

  /** A cylinder of radius r (r2 at the far end) and length len along 'x', 'y' or 'z', centred at (x, y, z). */
  cyl(paint, r, len, x, y, z, axis = 'y', seg = 10, r2 = r, open = false) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, open);
    if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    this.geo(g, paint);
  }

  /** A tube from point a to point b. */
  tube(paint, a, b, r, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    if (len < 1e-4) return;
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
    this.geo(g, paint, m);
  }

  /**
   * A flat part cut from a side view: outline [[x, y], ...] (any order round), from z0 to z1. Convex or not
   * (three triangulates it).
   */
  plate(paint, outline, z0, z1) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, z0);
    this.geo(g, paint);
  }

  /** Add everything of another mesher, placed by m. */
  merge(other, m = null) {
    const run = () => {
      const P = other.pos, N = other.nor, Cc = other.col, S = other.surf;
      for (let i = 0; i < P.length; i += 9) {
        const order = this.flip ? [0, 2, 1] : [0, 1, 2];
        for (const k of order) {
          const o = i + k * 3;
          _v.set(P[o], P[o + 1], P[o + 2]); _n.set(N[o], N[o + 1], N[o + 2]);
          if (this.matrix) { _v.applyMatrix4(this.matrix); _n.applyMatrix3(this._nm).normalize(); }
          this.pos.push(_v.x, _v.y, _v.z); this.nor.push(_n.x, _n.y, _n.z);
          this.col.push(Cc[o], Cc[o + 1], Cc[o + 2]); this.surf.push(S[o], S[o + 1], S[o + 2]);
        }
      }
    };
    if (m) this.with(m, run); else run();
  }

  get triangles() { return this.pos.length / 9; }

  /** The geometry: position, normal, colour, surf and uv (box projection, in metres times uvScale). */
  geometry(uvScale = 0.8) {
    const n = this.pos.length / 3, P = this.pos, uv = new Float32Array(n * 2);
    for (let t = 0; t + 2 < n; t += 3) {
      const o = t * 3;
      const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
      const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      const ax = Math.abs(uy * vz - uz * vy), ay = Math.abs(uz * vx - ux * vz), az = Math.abs(ux * vy - uy * vx);
      for (let k = 0; k < 3; k++) {
        const i = t + k, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        if (ax >= ay && ax >= az) { uv[i * 2] = z * uvScale; uv[i * 2 + 1] = y * uvScale; }
        else if (ay >= az) { uv[i * 2] = x * uvScale; uv[i * 2 + 1] = z * uvScale; }
        else { uv[i * 2] = x * uvScale; uv[i * 2 + 1] = y * uvScale; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('surf', new THREE.Float32BufferAttribute(this.surf, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
}

/** A placement: position, then rotation (radians, XYZ), then scale. */
function place(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
const MIRROR = new THREE.Matrix4().makeScale(1, 1, -1);

// ---------------------------------------------------------------------------------- interpolation
/** A function of x through the points (xs ascending): monotone cubic when smooth, else straight lines. */
function curve(xs, ys, smoothIt) {
  const n = xs.length;
  const seg = (x) => { let i = 0; while (i < n - 2 && x > xs[i + 1]) i++; return i; };
  if (!smoothIt || n < 3) {
    return (x) => {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      const i = seg(x), t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return lerp(ys[i], ys[i + 1], t);
    };
  }
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    const i = seg(x), h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ------------------------------------------------------------------------------------- sections
// A half section runs from the bottom centre out and up the side to the top centre: eleven points,
//   0 bottom centre, 1 bottom edge, 2 sill, 3 widest, 4 under the shoulder, 5 belt (shoulder top),
//   6 middle of the side glass, 7 foot of the rail, 8 top of the rail, 9 roof, 10 top centre.
// Bands between them: 0 floor, 1 sill, 2-4 lower body, 5-6 side glass, 7 rail or pillar, 8-9 roof.
// st: {yb bottom, yc belt, yt top, hw half width at the widest, ht half width at the top edge}.

/** A rounded body (the saloons, crossovers, roadsters, the tractor's cab). */
function roundSection(st, k = {}) {
  const { yb, yc, yt, hw, ht } = st;
  const side = yc - yb, up = yt - yc;
  const sill = Math.min(k.sill ?? 0.07, side * 0.3), low = k.low ?? 0.55, tuck = k.tuck ?? 0.9;
  const belt = k.belt ?? 0.965, gm = k.glassMid ?? 0.55, bulge = k.bulge ?? 0.015, rail = k.rail ?? 0.05;
  const zb = hw * belt, zr = Math.min(zb, ht + 0.035);
  return [
    [0, yb],
    [hw * tuck, yb],
    [hw * 0.985, yb + sill],
    [hw, yb + side * low],
    [hw * 0.993, yc - Math.min(0.04, side * 0.1)],
    [zb, yc],
    [lerp(zb, zr, gm) + bulge * Math.max(0, Math.sign(up)), yc + up * gm],
    [zr, yt - Math.min(rail, Math.abs(up) * 0.25)],
    [ht, yt - Math.min(0.012, Math.abs(up) * 0.06)],
    [ht * 0.5, yt - Math.min(0.004, Math.abs(up) * 0.02)],
    [0, yt],
  ];
}

/** Flat planes and hard edges (the stainless customs, the van and the bus). */
function flatSection(st, k = {}) {
  const { yb, yc, yt, hw, ht } = st;
  const side = yc - yb, up = yt - yc;
  const chamfer = Math.min(k.chamfer ?? 0.06, side * 0.25), lean = k.lean ?? 0, belt = k.belt ?? 0.99;
  const zb = hw * belt, zr = Math.min(zb, ht + 0.012);
  return [
    [0, yb],
    [hw - chamfer, yb],
    [hw, yb + chamfer],
    [hw - lean * 0.5, yb + side * 0.5],
    [hw - lean, yc - 0.012],
    [zb - lean, yc],
    [lerp(zb - lean, zr, 0.5), yc + up * 0.5],
    [zr, yt - Math.min(0.012, Math.abs(up) * 0.2)],
    [ht, yt],
    [ht * 0.5, yt],
    [0, yt],
  ];
}

// --------------------------------------------------------------------------------------- builder
/**
 * The builder of one model: the hull, the strips on it, the wheels and the parts, then the geometry and
 * the low hull for the shadow and occlusion passes.
 */
class Car {
  constructor(v, o) {
    this.v = v;
    this.burnt = o.state === 'burnt';
    this.paint = this.burnt ? CHAR : bodyPaint(o.paint);
    this.m = new Mesher();          // the body: sinks when the car burnt out
    this.w = new Mesher();          // the wheels
    this.proxyBoxes = [];
    this.axles = [];
    this.L = v.length; this.W = v.width; this.H = v.height;
    this.xF = v.length / 2; this.xR = -v.length / 2;
  }

  /** A paint as this car wears it (burnt: charred, lamps out). */
  p(paint) { return this.burnt ? (paint === this.paint || (paint && paint.body) ? CHAR : burnt(paint)) : paint; }

  // ------------------------------------------------------------------ hull
  /**
   * def: keys [[x, yb, yc, yt, hw, ht], ...] (any order), smooth, section (roundSection/flatSection),
   * shape (its options), step, smoothDeg, zones (see paintAt), arch: 'round'|'trapezoid', archR, wellDepth.
   */
  hull(def) {
    const keys = [...def.keys].sort((a, b) => a[0] - b[0]);
    const xs = keys.map((k) => k[0]);
    const f = [1, 2, 3, 4, 5].map((c) => curve(xs, keys.map((k) => k[c]), def.smooth !== false));
    this.stAt = (x) => ({ x, yb: f[0](x), yc: f[1](x), yt: f[2](x), hw: f[3](x), ht: f[4](x) });
    this.def = def;
    this.section = def.section || roundSection;
    // stations: the keys, an even step, and close pairs at the edges of the wheel arches
    const x0 = xs[0], x1 = xs[xs.length - 1], step = def.step ?? 0.16;
    const set = new Set(xs.map((x) => +x.toFixed(4)));
    for (let x = x0 + step; x < x1 - step * 0.4; x += step) set.add(+x.toFixed(4));
    for (const a of this.axles) {
      const r = a.ra;
      for (const k of [-1.012, -1, -0.92, -0.7, -0.4, 0, 0.4, 0.7, 0.92, 1, 1.012]) set.add(+(a.x + k * r).toFixed(4));
      if (a.trapezoid) for (const k of [-0.55, 0.55]) set.add(+(a.x + k * r).toFixed(4));
    }
    for (const x of def.extra || []) set.add(+x.toFixed(4));
    let stations = [...set].filter((x) => x >= x0 - 1e-6 && x <= x1 + 1e-6).sort((a, b) => a - b);
    stations = stations.filter((x, i) => i === 0 || x - stations[i - 1] > 0.003);
    this.stations = stations;
    const grid = stations.map((x) => this.sectionAt(x));
    this._loft(stations, grid, def);
    // caps: the nose and the tail
    this._cap(stations[stations.length - 1], grid[grid.length - 1], 1, def.capF ?? this.paint);
    this._cap(stations[0], grid[0], -1, def.capR ?? this.paint);
    // wheel wells: a dark wall inside each arch so nobody sees through the car
    for (const a of this.axles) this._well(a);
    // the low hull for the shadow maps and the occlusion pass
    this._proxyHull();
  }

  /** The half section at x with the wheel arches cut out of it. */
  sectionAt(x) {
    const st = this.stAt(x), pts = this.section(st, this.def.shape || {});
    const ay = this.archY(x);
    if (ay > -1) for (const p of pts) if (p[1] < ay) p[1] = ay;
    return pts;
  }

  /** Height of the arch opening at x (or -9 outside every arch). */
  archY(x) {
    let y = -9;
    for (const a of this.axles) {
      const dx = Math.abs(x - a.x);
      if (dx > a.ra + 1e-6) continue;
      let h;
      if (a.trapezoid) h = dx < a.ra * 0.55 ? a.y + a.ra * 0.93 : a.y + a.ra * 0.93 - (dx - a.ra * 0.55) / (a.ra * 0.45) * a.ra * 1.05;
      else h = a.y + Math.sqrt(Math.max(0, a.ra * a.ra - dx * dx)) * (a.rise ?? 1);
      y = Math.max(y, h);
    }
    return y;
  }

  /**
   * Which paint a band of the hull wears at x (null: an opening). See roundSection for the bands.
   * zones: cowl, roofF, roofR, deck (the glasshouse from the foot of the windscreen to the foot of the rear
   * window), sideF/sideR (the side glass), pillars [[x, half width]], side: false (no side glass: open car),
   * roof 'glass'|'body'|'trim', rearGlass, rail, pillar, sill paints, open [x0, x1] (a cockpit without a
   * roof), lower(x, j) and upper(x, j) for paints of their own (return undefined to keep the default).
   */
  paintAt(x, j) {
    const z = this.def.zones || {}, body = this.paint;
    if (j === 0) return C.under;
    if (j < 5) { const q = z.lower && z.lower(x, j); return q !== undefined ? q : j === 1 ? (z.sill ?? body) : body; }
    if (z.open && x > z.open[0] && x < z.open[1]) return null;
    const q = z.upper && z.upper(x, j);
    if (q !== undefined) return q;
    const inHouse = z.cowl !== undefined && x < z.cowl && x > z.deck;
    if (!inHouse) return body;
    if (j <= 6) {
      if (z.side === false) return null;
      if (x > z.sideR && x < z.sideF && !(z.pillars || []).some(([px, ph]) => Math.abs(x - px) < ph)) return z.glass ?? C.glass;
      return z.pillar ?? C.trim;
    }
    if (j === 7) return z.rail ?? C.trim;
    if (x > z.roofF) return z.glass ?? C.glass;                                  // windscreen
    if (x < z.roofR) return z.rearGlass === false ? body : (z.glass ?? C.glass);   // rear window
    return z.roof === 'body' ? body : z.roof === 'trim' ? C.trim : (z.glass ?? C.glass);
  }

  _loft(xs, grid, def) {
    const N = xs.length, K = grid[0].length, cosT = Math.cos(((def.smoothDeg ?? 34) * Math.PI) / 180);
    const P = (i, j) => [xs[i], grid[i][j][1], grid[i][j][0]];
    // face normals of the quads (right half)
    const fn = [];
    for (let i = 0; i < N - 1; i++) {
      fn[i] = [];
      for (let j = 0; j < K - 1; j++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        // sum of the two triangles' cross products
        const n1 = cross(sub(b, a), sub(c, a)), n2 = cross(sub(c, a), sub(d, a));
        const n = [n1[0] + n2[0], n1[1] + n2[1], n1[2] + n2[2]], l = Math.hypot(...n);
        fn[i][j] = l < 1e-10 ? null : [n[0] / l, n[1] / l, n[2] / l];
      }
    }
    // a corner's normal: the faces around it that bend less than smoothDeg from this face
    const vn = (i, j, f) => {
      const s = [0, 0, 0];
      for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) {
        const qi = i + di, qj = j + dj;
        if (qi < 0 || qj < 0 || qi >= N - 1 || qj >= K - 1) continue;
        const g = fn[qi][qj];
        if (!g || g[0] * f[0] + g[1] * f[1] + g[2] * f[2] < cosT) continue;
        s[0] += g[0]; s[1] += g[1]; s[2] += g[2];
      }
      if (grid[i][j][0] < 1e-4) s[2] = 0;   // on the centre line the two halves meet smoothly
      const l = Math.hypot(...s);
      return l < 1e-8 ? f : [s[0] / l, s[1] / l, s[2] / l];
    };
    const inner = def.inner || (() => false);
    for (let i = 0; i < N - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      for (let j = 0; j < K - 1; j++) {
        const f = fn[i][j];
        if (!f) continue;
        let paint = this.paintAt(xm, j);
        const shell = this.burnt || inner(xm, j);
        if ((paint === C.glass || paint === C.clear) && this.burnt) paint = null;            // the glass is gone
        const A = P(i, j), B = P(i + 1, j), Cc = P(i + 1, j + 1), D = P(i, j + 1);
        const nA = vn(i, j, f), nB = vn(i + 1, j, f), nC = vn(i + 1, j + 1, f), nD = vn(i, j + 1, f);
        for (const s of [1, -1]) {
          const m = (p) => [p[0], p[1], p[2] * s], mn = (n) => [n[0], n[1], n[2] * s];
          if (paint) {
            const pp = this.p(paint);
            if (s > 0) { this.m.tri(A, B, Cc, pp, nA, nB, nC); this.m.tri(A, Cc, D, pp, nA, nC, nD); }
            else { this.m.tri(m(A), m(Cc), m(B), pp, mn(nA), mn(nC), mn(nB)); this.m.tri(m(A), m(D), m(Cc), pp, mn(nA), mn(nD), mn(nC)); }
          }
          // the inside of the shell: a burnt car seen through its empty windows, an open car's tub
          if (shell && (j > 0 || !this.burnt)) {
            const ip = this.burnt ? C.charInside : C.tub, k = 0.03;
            const q = (p, n) => [p[0] - n[0] * k, p[1] - n[1] * k, p[2] - n[2] * k];
            const iA = q(A, nA), iB = q(B, nB), iC = q(Cc, nC), iD = q(D, nD);
            const neg = (n) => [-n[0], -n[1], -n[2] * s];
            if (s > 0) { this.m.tri(iA, iC, iB, ip, neg(nA), neg(nC), neg(nB)); this.m.tri(iA, iD, iC, ip, neg(nA), neg(nD), neg(nC)); }
            else { this.m.tri(m(iA), m(iB), m(iC), ip, neg(nA), neg(nB), neg(nC)); this.m.tri(m(iA), m(iC), m(iD), ip, neg(nA), neg(nC), neg(nD)); }
          }
        }
      }
    }
  }

  _cap(x, pts, dir, paint) {
    if (!paint) return;
    const full = [...pts.map(([z, y]) => [x, y, z]), ...pts.slice(1, -1).reverse().map(([z, y]) => [x, y, -z])];
    let cy = 0; for (const p of full) cy += p[1]; cy /= full.length;
    const c = [x, cy, 0], n = [dir, 0, 0];
    for (let i = 0; i < full.length; i++) {
      const a = full[i], b = full[(i + 1) % full.length];
      const t = cross(sub(a, c), sub(b, c));
      if (Math.hypot(...t) < 1e-10) continue;
      if (t[0] * dir > 0) this.m.tri(c, a, b, this.p(paint), n, n, n); else this.m.tri(c, b, a, this.p(paint), n, n, n);
    }
  }

  _well(a) {
    const st = this.stAt(a.x), z = Math.max(0.2, st.hw - (a.wellDepth ?? 0.34)), base = Math.min(st.yb, a.y - 0.05);
    const pts = [];
    for (let k = 0; k <= 10; k++) { const x = a.x - a.ra + (2 * a.ra * k) / 10; pts.push([x, Math.max(base, this.archY(x))]); }
    const c = [a.x, a.y, 0];
    for (const s of [1, -1]) {
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = [pts[k][0], pts[k][1], z * s], p1 = [pts[k + 1][0], pts[k + 1][1], z * s], cc = [c[0], c[1] - a.ra * 0.2, z * s];
        const n = [0, 0, s];
        if (s > 0) this.m.tri(cc, p1, p0, C.well, n, n, n); else this.m.tri(cc, p0, p1, C.well, n, n, n);
      }
    }
  }

  /** Shadow and occlusion hull: the hull at coarse stations, flat sides, plus boxes for the wheels. */
  _proxyHull() {
    const xs = [];
    for (let x = this.stations[0]; x < this.stations[this.stations.length - 1]; x += 0.45) xs.push(x);
    xs.push(this.stations[this.stations.length - 1]);
    const sec = (x) => {
      const s = this.stAt(x), yb = Math.max(s.yb, this.archY(x) > -1 ? this.archY(x) : s.yb);
      return [[0, yb], [s.hw * 0.97, yb], [s.hw, s.yc], [s.ht, s.yt], [0, s.yt]];
    };
    this.proxyLoft = { xs, sec };
  }

  // ------------------------------------------------------------------ queries on the hull
  /** Point and outward normal of the side at station x and height y (right side), or null. */
  sidePoint(x, y) {
    const pts = this.sectionAt(x);
    for (let j = 1; j < pts.length - 1; j++) {
      const [z0, y0] = pts[j], [z1, y1] = pts[j + 1];
      if ((y0 - y) * (y1 - y) <= 0 && y1 !== y0) {
        const t = (y - y0) / (y1 - y0), z = lerp(z0, z1, t);
        const ny = -(z1 - z0), nz = y1 - y0, l = Math.hypot(ny, nz) || 1;
        return { z, ny: ny / l, nz: nz / l };
      }
    }
    return null;
  }

  /** Height and normal of the top at station x and half width z (|z| below the top edge), or null. */
  topPoint(x, z) {
    const pts = this.sectionAt(x);
    for (let j = pts.length - 2; j >= 4; j--) {
      const [z0, y0] = pts[j], [z1, y1] = pts[j + 1];
      if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) {
        const t = (z - z0) / (z1 - z0), y = lerp(y0, y1, t);
        const ny = -(z1 - z0), nz = y1 - y0, l = Math.hypot(ny, nz) || 1;
        return { y, ny: ny / l, nz: nz / l };
      }
    }
    return null;
  }

  /**
   * A strip laid on both sides from x0 to x1, between heights y0 and y1 (each may be a function of x),
   * `out` metres proud of the surface.
   */
  side(paint, x0, x1, y0, y1, o = {}) {
    const out = o.out ?? 0.004, nx = o.nx ?? Math.max(2, Math.ceil(Math.abs(x1 - x0) / 0.1)), ny = o.ny ?? 2;
    const Y0 = typeof y0 === 'function' ? y0 : () => y0, Y1 = typeof y1 === 'function' ? y1 : () => y1;
    const rows = [];
    for (let a = 0; a <= nx; a++) {
      const x = lerp(x0, x1, a / nx), row = [];
      for (let b = 0; b <= ny; b++) {
        const y = lerp(Y0(x), Y1(x), b / ny), sp = this.sidePoint(x, y);
        if (!sp) return;
        row.push([x, y + sp.ny * out, sp.z + sp.nz * out]);
      }
      rows.push(row);
    }
    this._grid(rows, this.p(paint), o.both !== false);
  }

  /** A strip on the top from x0 to x1 between half widths z0 and z1 (z0 may be negative: across the middle). */
  top(paint, x0, x1, z0, z1, o = {}) {
    const out = o.out ?? 0.004, nx = o.nx ?? Math.max(2, Math.ceil(Math.abs(x1 - x0) / 0.1)), nz = o.nz ?? Math.max(1, Math.ceil(Math.abs(z1 - z0) / 0.12));
    const rows = [];
    for (let a = 0; a <= nx; a++) {
      const x = lerp(x0, x1, a / nx), row = [];
      for (let b = 0; b <= nz; b++) {
        const z = lerp(z0, z1, b / nz), tp = this.topPoint(x, Math.abs(z));
        if (!tp) return;
        row.push([x, tp.y + tp.ny * out, z + Math.sign(z || 1) * tp.nz * out]);
      }
      rows.push(row);
    }
    this._grid(rows, this.p(paint), o.both ?? false, true);
  }

  /** A grid of points rows[a][b] as quads facing out (the right side's order), mirrored when both. */
  _grid(rows, paint, both, flip = false) {
    for (let a = 0; a < rows.length - 1; a++) {
      for (let b = 0; b < rows[a].length - 1; b++) {
        let A = rows[a][b], B = rows[a + 1][b], Cc = rows[a + 1][b + 1], D = rows[a][b + 1];
        if (flip) [B, D] = [D, B];
        this.m.quad(A, B, Cc, D, paint);
        if (both) {
          const m = (p) => [p[0], p[1], -p[2]];
          this.m.quad(m(A), m(D), m(Cc), m(B), paint);
        }
      }
    }
  }

  /** Where the nose (end 1) or the tail (end -1) is at height y and |z|: the x of the surface there, or null. */
  endX(end, y, z) {
    const list = end > 0 ? [...this.stations].reverse() : this.stations, az = Math.abs(z);
    let prev = null;
    for (const x of list) {
      const sp = this.sidePoint(x, y), zz = sp ? sp.z : 0;
      if (zz >= az - 1e-6) {
        if (!prev) return x;
        return lerp(prev.x, x, clamp((az - prev.z) / Math.max(1e-6, zz - prev.z), 0, 1));
      }
      prev = { x, z: zz };
    }
    return null;
  }

  /**
   * A patch on the nose (end 1) or the tail (end -1), laid on the surface: z0..z1 across (mirrored when
   * z0 >= 0 unless both: false), y0..y1 up, `out` metres proud of it.
   */
  end(paint, end, z0, z1, y0, y1, o = {}) {
    const out = o.out ?? 0.006, nz = o.nz ?? Math.max(1, Math.ceil(Math.abs(z1 - z0) / 0.12));
    const one = (za, zb) => {
      const rows = [];
      for (let b = 0; b <= nz; b++) {
        const z = lerp(za, zb, b / nz), row = [];
        for (const y of [y0, (y0 + y1) / 2, y1]) {
          const x = this.endX(end, y, z);
          if (x === null) return;
          row.push([x + end * out, y, z]);
        }
        rows.push(row);
      }
      const pp = this.p(paint);
      for (let b = 0; b < rows.length - 1; b++) {
        for (let k = 0; k < 2; k++) {
          const A = rows[b][k], B = rows[b + 1][k], Cc = rows[b + 1][k + 1], D = rows[b][k + 1];
          const t = cross(sub(B, A), sub(D, A));
          if (t[0] * end > 0) this.m.quad(A, B, Cc, D, pp); else this.m.quad(A, D, Cc, B, pp);
        }
      }
    };
    one(z0, z1);
    if (z0 >= 0 && o.both !== false) one(-z1, -z0);
  }

  // ------------------------------------------------------------------ wheels
  /**
   * Axles before the hull: [{x, R, w (tyre width), rim, rimR, style, caliper, dual}], arch radius and shape.
   * Must be called before hull() (the arches are cut where the axles are).
   */
  axle(x, o) {
    const R = o.R ?? this.v.wheelR;
    const flat = this.burnt;
    const y = flat ? R * 0.8 : R;
    this.axles.push({ x, R, y: R, yDrawn: y, ra: o.ra ?? R + 0.055, trapezoid: o.arch === 'trapezoid', rise: o.rise, wellDepth: o.wellDepth, o });
  }

  _wheels() {
    for (const a of this.axles) {
      const o = a.o, st = this.stAt(a.x), w = o.w ?? 0.24;
      const zw = o.z ?? st.hw - w / 2 - (o.inset ?? 0.035);
      const key = [o.style, a.R.toFixed(3), w.toFixed(3), (o.rimR ?? a.R * 0.68).toFixed(3), o.caliper || '', this.burnt ? 'b' : 'p'].join('|');
      const wm = wheelMesher(key, () => buildWheel(a.R, w, o, this.burnt));
      const drop = a.y - a.yDrawn;
      for (const s of [1, -1]) {
        const zs = s * zw;
        const m = place(a.x, a.yDrawn, zs);
        if (s < 0) m.multiply(MIRROR);
        this.w.merge(wm, m);
        if (o.dual) {
          const m2 = place(a.x, a.yDrawn, zs - s * (w + 0.03));
          if (s < 0) m2.multiply(MIRROR);
          this.w.merge(wm, m2);
        }
      }
      a.drop = drop;
    }
  }

  // ------------------------------------------------------------------ small parts
  /** A door mirror on a stalk at (x, y) of the right side, mirrored. */
  mirrors(x, y, o = {}) {
    const sp = this.sidePoint(x, y);
    if (!sp) return;
    const z = sp.z, len = o.len ?? 0.2, h = o.h ?? 0.11, d = o.d ?? 0.07, paint = this.p(o.paint ?? this.paint);
    for (const s of [1, -1]) {
      const m = place(x, y + (o.up ?? 0.03), s * (z + 0.03 + len / 2), 0, s * -0.12, 0);
      this.m.with(m, () => {
        this.m.geo(new THREE.CapsuleGeometry(h / 2, len - h, 3, 8).rotateX(Math.PI / 2).scale(d / h, 1, 1), paint);
        this.m.box(this.p(C.glass), 0.004, h * 0.75, len * 0.8, -d / 2 - 0.001, 0, 0);
      });
      this.m.tube(this.p(o.stalk ?? C.trim), [x + 0.02, y - 0.03, s * (z - 0.01)], [x, y + (o.up ?? 0.03) - 0.02, s * (z + 0.05)], 0.012, 5);
    }
  }

  /** Flush handles: a dark slot with a lip at each x, at height y. */
  handles(xs, y, o = {}) {
    const len = o.len ?? 0.2, h = o.h ?? 0.035;
    for (const x of xs) this.side(o.paint ?? C.trim, x - len / 2, x + len / 2, y - h / 2, y + h / 2, { out: 0.005, nx: 2, ny: 1 });
  }

  /** Door cuts: thin dark lines up the side at each x between heights y0 and y1. */
  seams(xs, y0, y1, o = {}) {
    for (const x of xs) {
      const lean = o.lean ?? 0, w = o.w ?? 0.007;
      this.side(C.seam, x - w / 2, x + w / 2, y0, y1, { out: 0.0025, nx: 1, ny: 3 });
      if (lean) this.side(C.seam, x - w / 2 + lean, x + w / 2 + lean, y1, y1 + 0.001, { out: 0.0025, nx: 1, ny: 1 });
    }
  }

  /** A seat: cushion and back, at (x, z) facing +x, mirrored if z > 0. */
  seats(x, zs, y, paint, o = {}) {
    const wd = o.w ?? 0.5, back = o.back ?? 0.62;
    const pp = this.burnt ? C.wire : paint;
    for (const z of zs) {
      this.m.box(pp, 0.5, 0.12, wd, x, y + 0.06, z, 0, 0, -0.08);
      this.m.box(pp, 0.13, back, wd * 0.92, x - 0.27, y + back / 2 + 0.05, z, 0, 0, 0.22);
      if (!this.burnt) this.m.box(pp, 0.1, 0.16, wd * 0.5, x - 0.36, y + back + 0.08, z, 0, 0, 0.22);
    }
  }

  /** The steering wheel at (x, y, z), its plane leaning back. */
  steering(x, y, z) {
    const g = new THREE.TorusGeometry(0.17, 0.018, 5, 14);
    this.m.geo(g, this.p(C.trim), place(x, y, z, 0, Math.PI / 2, 0).multiply(place(0, 0, 0, -0.45, 0, 0)));
  }

  // ------------------------------------------------------------------ tarpaulin
  /**
   * A tarpaulin thrown over the car from x0 back to the tail: it follows the body a few centimetres out,
   * wrinkled, hangs down the sides to a ragged hem and closes over the tail.
   */
  tarp(x0, paint) {
    const xR = this.stations[0] - 0.05;
    const xs = [];
    for (let x = x0; x > xR; x -= 0.14) xs.push(x);
    xs.push(xR);
    xs.reverse();
    const wr = (x, y, z) => 0.012 * Math.sin(x * 11 + z * 5) + 0.018 * (vnoise(x * 3.1, y * 3.1, z * 3.1) - 0.5);
    const lo = this.stations[0], hi = this.stations[this.stations.length - 1];
    const top = this.tarpTop || (() => 0);
    const rows = xs.map((x, i) => {
      // the last row hangs straight down over the tail, as tall as the body a little ahead of it
      const st = this.stAt(clamp(i === 0 ? lo + 0.18 : x, lo, hi));
      const pts = this.section(st, this.def.shape || {}).slice(3).map(([z, y]) => [z, y > st.yc - 0.05 ? Math.max(y, top(x) - (st.hw - z) * 0.15) : y]);
      const out = [];
      const hem = Math.max(0.28, st.yb + 0.1) + 0.12 * vnoise(x * 2.3, 0, 1);
      out.push([x, hem, st.hw + 0.06 + wr(x, hem, 1)]);
      for (let j = 0; j < pts.length; j++) {
        const p = pts[j], a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
        let nz = b[1] - a[1], ny = -(b[0] - a[0]);
        const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
        const k = 0.05 + wr(x, p[1], p[0]);
        out.push([x, p[1] + ny * k, p[0] < 1e-4 ? 0 : p[0] + nz * k]);
      }
      return out;
    });
    this._grid(rows, paint, true);
    // the cloth falls over the tail
    const last = rows[0], full = [...last, ...last.slice(1, -1).reverse().map((p) => [p[0], p[1], -p[2]])];
    let cy = 0; for (const p of full) cy += p[1]; cy /= full.length;
    const c = [xR - 0.03, cy, 0], n = [-1, 0, 0];
    for (let i = 0; i < full.length; i++) {
      const a = full[i], b = full[(i + 1) % full.length];
      const t = cross(sub(a, c), sub(b, c));
      if (Math.hypot(...t) < 1e-10) continue;
      if (t[0] < 0) this.m.tri(c, a, b, paint, n, n, n); else this.m.tri(c, b, a, paint, n, n, n);
    }
  }

  // ------------------------------------------------------------------ finish
  finish() {
    this._wheels();
    const out = new Mesher();
    const sag = this.burnt ? this.axles.reduce((s, a) => Math.max(s, a.drop || 0), 0) : 0;
    // a burnt car sits down on its rims, a little lopsided
    const lean = this.burnt ? place(0, -sag, 0, 0.012, 0, -0.008) : null;
    out.merge(this.m, lean);
    out.merge(this.w);
    const geometry = out.geometry();
    geometry.computeBoundingBox();
    const proxy = this._proxyGeometry(sag);
    return { geometry, proxy, triangles: out.triangles };
  }

  _proxyGeometry(sag) {
    const pm = new Mesher();
    const { xs, sec } = this.proxyLoft;
    const grid = xs.map(sec);
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < grid[i].length - 1; j++) {
        const A = [xs[i], grid[i][j][1], grid[i][j][0]], B = [xs[i + 1], grid[i + 1][j][1], grid[i + 1][j][0]];
        const Cc = [xs[i + 1], grid[i + 1][j + 1][1], grid[i + 1][j + 1][0]], D = [xs[i], grid[i][j + 1][1], grid[i][j + 1][0]];
        pm.quad(A, B, Cc, D, C.under);
        const m = (p) => [p[0], p[1], -p[2]];
        pm.quad(m(A), m(D), m(Cc), m(B), C.under);
      }
    }
    for (const [i, dir] of [[0, -1], [xs.length - 1, 1]]) {
      const pts = grid[i], full = [...pts.map(([z, y]) => [xs[i], y, z]), ...pts.slice(1, -1).reverse().map(([z, y]) => [xs[i], y, -z])];
      for (let k = 1; k < full.length - 1; k++) {
        const t = cross(sub(full[k], full[0]), sub(full[k + 1], full[0]));
        if (t[0] * dir > 0) pm.tri(full[0], full[k], full[k + 1], C.under); else pm.tri(full[0], full[k + 1], full[k], C.under);
      }
    }
    for (const b of this.proxyBoxes) pm.box(C.under, ...b);
    for (const a of this.axles) {
      const st = this.stAt(a.x), w = a.o.w ?? 0.24, zw = a.o.z ?? st.hw - w / 2 - (a.o.inset ?? 0.035);
      for (const s of [1, -1]) pm.cyl(C.under, a.R, w * (a.o.dual ? 2 : 1), a.x, a.yDrawn + sag, s * zw, 'z', 8);
    }
    const g = new THREE.BufferGeometry();
    const pos = pm.pos.slice();
    if (sag) for (let i = 1; i < pos.length; i += 3) pos[i] -= sag;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pm.nor, 3));
    return g;
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ------------------------------------------------------------------------------------------ wheels
const WHEELS = new Map();
function wheelMesher(key, make) {
  let w = WHEELS.get(key);
  if (!w) { w = make(); WHEELS.set(key, w); }
  return w;
}

/**
 * One wheel at the origin, its axle along z, the outer face towards +z: tyre (tread and sidewall), rim with
 * the spokes of its style, hub, brake disc and calliper. A burnt wheel has a flat, charred tyre.
 */
function buildWheel(R, W, o, isBurnt) {
  const m = new Mesher(), hw = W / 2, rimR = o.rimR ?? R * 0.68;
  const P = (p) => (isBurnt ? burnt(p) : p);
  const flatY = isBurnt ? -R * 0.8 + 0.012 : -9;
  // the tyre: lathe of (r, z) about z; a flat one is pressed against the ground under it
  const prof = [
    [rimR + 0.004, -hw * 0.84], [rimR + (R - rimR) * 0.4, -hw * 1.0], [R - (R - rimR) * 0.22, -hw * 0.98],
    [R - 0.01, -hw * 0.86], [R, -hw * 0.6], [R, hw * 0.6], [R - 0.01, hw * 0.86],
    [R - (R - rimR) * 0.22, hw * 0.98], [rimR + (R - rimR) * 0.4, hw * 1.0], [rimR + 0.004, hw * 0.84],
  ];
  const seg = o.seg ?? 22;
  const ring = (r, z, a) => [r * Math.cos(a), r * Math.sin(a), z];
  const squash = (p) => {
    if (p[1] >= flatY) return p;
    const k = (flatY - p[1]);
    return [p[0], flatY, p[2] + Math.sign(p[2]) * k * 0.35];
  };
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * TAU, a1 = ((s + 1) / seg) * TAU;
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, z0] = prof[k], [r1, z1] = prof[k + 1];
      const tread = k >= 3 && k <= 5;
      const paint = P(tread ? C.tyre : C.sidewall);
      const A = squash(ring(r0, z0, a0)), B = squash(ring(r0, z0, a1)), Cc = squash(ring(r1, z1, a1)), D = squash(ring(r1, z1, a0));
      // smooth normals round the tyre: from the profile's own slope
      const nz0 = -(r1 - r0), nr0 = z1 - z0, l = Math.hypot(nz0, nr0) || 1;
      const nA = [Math.cos(a0) * nr0 / l, Math.sin(a0) * nr0 / l, nz0 / l], nB = [Math.cos(a1) * nr0 / l, Math.sin(a1) * nr0 / l, nz0 / l];
      m.tri(A, B, Cc, paint, nA, nB, nB); m.tri(A, Cc, D, paint, nA, nB, nA);
    }
  }
  // tread blocks: shallow grooves across the crown
  if (!isBurnt && o.tread) {
    const n = Math.round(seg * 2.5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      m.box(C.sidewall, 0.012, 0.004, W * 0.5, Math.cos(a) * (R + 0.0012), Math.sin(a) * (R + 0.0012), (i % 2 ? 0.05 : -0.05) * W, 0, 0, a);
    }
  }
  // the rim barrel, seen through the spokes (facing the axle), and the lip at the face
  const face = hw * 0.78;
  const barrel = [];
  for (let s = 0; s < seg; s++) {
    const a0 = (s / seg) * TAU, a1 = ((s + 1) / seg) * TAU;
    const A = ring(rimR, -hw * 0.8, a0), B = ring(rimR, -hw * 0.8, a1), Cc = ring(rimR, face, a1), D = ring(rimR, face, a0);
    const i0 = [-Math.cos(a0), -Math.sin(a0), 0], i1 = [-Math.cos(a1), -Math.sin(a1), 0];
    m.tri(A, D, Cc, P(C.rimDark), i0, i0, i1);
    m.tri(A, Cc, B, P(C.rimDark), i0, i1, i1);
    // the lip: a ring facing out
    const L0 = ring(rimR - 0.016, face + 0.004, a0), L1 = ring(rimR - 0.016, face + 0.004, a1), L2 = ring(rimR + 0.006, face, a1), L3 = ring(rimR + 0.006, face, a0);
    m.quad(L0, L3, L2, L1, P(o.lip ?? o.rim ?? C.rimSilver));
  }
  // the brake disc and its calliper behind the spokes
  const discR = rimR * 0.82;
  m.cyl(P(C.disc), discR, 0.028, 0, 0, -hw * 0.15, 'z', 18);
  m.cyl(P(C.hub), discR * 0.42, 0.06, 0, 0, -hw * 0.05, 'z', 10);
  const cal = P(o.caliper === 'red' ? C.caliperRed : C.caliperGrey);
  m.box(cal, 0.1, rimR * 0.36, 0.09, 0, 0, 0, 0, 0, 0);
  m.with(place(0, 0, -hw * 0.12, 0, 0, o.caliperAt ?? 2.2), () => m.box(cal, rimR * 0.36, rimR * 0.5, 0.075, discR * 0.86, 0, 0));
  // the face of the rim, by style
  rimFace(m, o.style || 'spoke5', rimR, face, P, o);
  // centre cap
  m.cyl(P(o.cap ?? C.hub), rimR * 0.13, 0.03, 0, 0, face - 0.01, 'z', 10);
  if (isBurnt) {
    // the tyre burnt down to its steel bands in places
    m.cyl(C.wire, R * 0.86, W * 0.5, 0, -0.002, 0, 'z', 14, R * 0.86, true);
  }
  return m;
}

/** A spoke from radius r0 to r1 at angle a, w0/w1 wide, bent by twist (radians from hub to rim), dished. */
function spoke(m, paint, a, r0, r1, w0, w1, z0, z1, th, twist = 0, n = 3) {
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = lerp(r0, r1, t), ang = a + twist * t, w = lerp(w0, w1, t) / 2, z = lerp(z0, z1, t);
    const da = w / r;
    rows.push([[r * Math.cos(ang - da), r * Math.sin(ang - da), z], [r * Math.cos(ang + da), r * Math.sin(ang + da), z]]);
  }
  for (let i = 0; i < n; i++) {
    const [a0, b0] = rows[i], [a1, b1] = rows[i + 1];
    m.quad(a0, a1, b1, b0, paint);                 // face (towards +z)
    const dn = (p) => [p[0], p[1], p[2] - th];
    m.quad(a0, dn(a0), dn(a1), a1, paint);         // one edge
    m.quad(b0, b1, dn(b1), dn(b0), paint);         // the other edge
  }
}

function rimFace(m, style, rimR, face, P, o) {
  const r0 = rimR * 0.2, r1 = rimR - 0.008, dish = o.dish ?? 0.035;
  const main = P(o.rim ?? C.rimSilver);
  const disc = (paint, rA, rB, z, seg = 20) => {
    const prof = [[rA, z], [rB, z]];
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * TAU, a1 = ((s + 1) / seg) * TAU;
      const A = [prof[0][0] * Math.cos(a0), prof[0][0] * Math.sin(a0), z], B = [prof[0][0] * Math.cos(a1), prof[0][0] * Math.sin(a1), z];
      const Cc = [rB * Math.cos(a1), rB * Math.sin(a1), z], D = [rB * Math.cos(a0), rB * Math.sin(a0), z];
      m.quad(A, D, Cc, B, paint);
    }
  };
  // the hub boss
  m.cyl(main, r0, 0.05, 0, 0, face - 0.03 - dish, 'z', 12);
  disc(main, 0, r0, face - 0.005 - dish, 12);
  switch (style) {
    case 'aero': {
      // a flat cover, dark, with five swept blades lighter than it
      disc(P(C.aero), r0, r1, face - 0.012, 22);
      for (let i = 0; i < 5; i++) spoke(m, P(o.blade ?? C.rimGrey), (i / 5) * TAU, r0 * 1.1, r1 * 0.97, 0.05, 0.11, face - 0.004, face - 0.006, 0.01, 0.9, 3);
      break;
    }
    case 'spoke5': {
      for (let i = 0; i < 5; i++) for (const d of [-0.11, 0.11]) spoke(m, main, (i / 5) * TAU + d, r0, r1, 0.045, 0.035, face - dish, face, 0.03, 0, 2);
      break;
    }
    case 'spoke6': {
      for (let i = 0; i < 6; i++) spoke(m, main, (i / 6) * TAU, r0, r1, 0.07, 0.045, face - dish, face, 0.035, 0, 2);
      break;
    }
    case 'spoke10': {
      for (let i = 0; i < 10; i++) spoke(m, main, (i / 10) * TAU, r0, r1, 0.03, 0.028, face - dish, face, 0.03, 0.12, 2);
      break;
    }
    case 'turbine': {
      disc(P(C.rimDark), r0, r1, face - 0.03, 20);
      for (let i = 0; i < 12; i++) spoke(m, main, (i / 12) * TAU, r0, r1, 0.04, 0.05, face - dish * 0.5, face, 0.02, 0.55, 3);
      break;
    }
    case 'blade': {
      for (let i = 0; i < 10; i++) spoke(m, main, (i / 10) * TAU, r0, r1, 0.03, 0.065, face - dish, face, 0.03, 0.75, 3);
      break;
    }
    case 'hex': {
      // the pickup's cover: six flat facets round a hexagonal hub, dark
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
        const A = [r0 * Math.cos(a0), r0 * Math.sin(a0), face], B = [r0 * Math.cos(a1), r0 * Math.sin(a1), face];
        const am = (a0 + a1) / 2;
        const Cc = [r1 * Math.cos(a1), r1 * Math.sin(a1), face - 0.025], D = [r1 * Math.cos(a0), r1 * Math.sin(a0), face - 0.025];
        const M = [r1 * 1.0 * Math.cos(am), r1 * Math.sin(am), face - 0.02];
        m.tri(A, D, M, P(i % 2 ? C.aero : C.rimGrey)); m.tri(A, M, B, P(i % 2 ? C.aero : C.rimGrey)); m.tri(B, M, Cc, P(i % 2 ? C.aero : C.rimGrey));
      }
      disc(P(C.aero), r1 * 0.98, r1, face - 0.025, 24);
      break;
    }
    case 'truck': {
      // a steel disc: dished plate with hand holes and ten nuts
      const ringR = rimR * 0.62;
      disc(main, r0, ringR * 0.8, face - dish, 20);
      disc(main, ringR * 1.25, r1, face - dish * 0.5, 22);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        m.cyl(P(C.rimSilver), 0.016, 0.04, Math.cos(a) * ringR * 0.55, Math.sin(a) * ringR * 0.55, face - dish + 0.01, 'z', 6);
      }
      for (let i = 0; i < 5; i++) spoke(m, main, (i / 5) * TAU + 0.3, ringR * 0.8, ringR * 1.25, 0.12, 0.14, face - dish, face - dish * 0.5, 0.01, 0, 1);
      break;
    }
    default: break;
  }
}

// ------------------------------------------------------------------------------------- the models
/**
 * Builders by look.body. Each sets the axles, lofts the hull and adds its lamps, cuts, handles, mirrors and
 * special parts. Numbers are metres in the model's frame (nose at +x).
 */
const BODIES = {
  model3(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.86, xb = xa - c.v.wheelbase;
    c.axle(xa, { w: 0.235, rimR: 0.229, style: 'aero', ra: R + 0.045 });
    c.axle(xb, { w: 0.235, rimR: 0.229, style: 'aero', ra: R + 0.045 });
    const cowl = xF - 1.62, roofF = xF - 2.62, roofR = xF - 3.35, deck = xF - 4.18;
    c.hull({
      keys: [
        [xF, 0.34, 0.5, 0.52, hw * 0.7, hw * 0.55],
        [xF - 0.05, 0.25, 0.6, 0.62, hw * 0.87, hw * 0.7],
        [xF - 0.16, 0.2, 0.68, 0.69, hw * 0.955, hw * 0.79],
        [xF - 0.45, 0.19, 0.76, 0.765, hw * 0.99, hw * 0.83],
        [xF - 0.86, 0.185, 0.83, 0.82, hw, hw * 0.83],
        [xF - 1.3, 0.18, 0.89, 0.875, hw, hw * 0.8],
        [cowl, 0.18, 0.92, 0.93, hw, hw * 0.76],
        [xF - 2.15, 0.178, 0.95, 1.22, hw, hw * 0.69],
        [roofF, 0.178, 0.965, 1.415, hw, hw * 0.64],
        [xF - 3.0, 0.18, 0.975, 1.44, hw, hw * 0.63],
        [roofR, 0.185, 0.985, 1.4, hw, hw * 0.64],
        [xF - 3.8, 0.2, 0.995, 1.2, hw * 0.995, hw * 0.7],
        [deck, 0.23, 1.0, 1.035, hw * 0.98, hw * 0.76],
        [xF - 4.5, 0.27, 0.985, 1.02, hw * 0.95, hw * 0.77],
        [-xF + 0.07, 0.32, 0.93, 0.975, hw * 0.88, hw * 0.72],
        [-xF, 0.38, 0.8, 0.85, hw * 0.79, hw * 0.62],
      ],
      shape: { glassMid: 0.5, bulge: 0.025, rail: 0.035, low: 0.5 },
      zones: { cowl, roofF, roofR, deck, sideF: cowl - 0.12, sideR: xF - 3.9, pillars: [[xF - 2.95, 0.05]], roof: 'glass' },
    });
    // lamps: slim headlights over the corners, the tail lamps wrapping round
    c.side(C.lamp, xF - 0.42, xF - 0.04, (x) => 0.635 + (xF - x) * 0.11, (x) => 0.675 + (xF - x) * 0.12);
    c.side(C.head, xF - 0.36, xF - 0.08, (x) => 0.647 + (xF - x) * 0.11, (x) => 0.662 + (xF - x) * 0.12, { out: 0.007 });
    c.side(C.tail, -xF + 0.03, -xF + 0.4, 0.87, 0.94, { out: 0.006 });
    c.end(C.tail, -1, hw * 0.42, hw * 0.74, 0.83, 0.89);
    c.end(C.grille, 1, -hw * 0.42, hw * 0.42, 0.37, 0.43, { both: false });
    c.end(C.matte, -1, -hw * 0.62, hw * 0.62, 0.36, 0.46, { both: false });
    c.seams([cowl - 0.05, xF - 2.95, xF - 3.95], 0.27, 0.95);
    c.handles([xF - 2.35, xF - 3.45], 0.89, { len: 0.16 });
    c.mirrors(cowl - 0.12, 0.98, { len: 0.19 });
  },
  modelS(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.95, xb = xa - c.v.wheelbase;
    const wo = { w: 0.245, rimR: 0.241, style: 'spoke10', rim: C.rimGrey, ra: R + 0.045 };
    c.axle(xa, wo); c.axle(xb, wo);
    const cowl = xF - 1.82, roofF = xF - 2.85, roofR = xF - 3.55, deck = xF - 4.42;
    c.hull({
      keys: [
        [xF, 0.33, 0.46, 0.5, hw * 0.68, hw * 0.55],
        [xF - 0.05, 0.24, 0.57, 0.6, hw * 0.86, hw * 0.7],
        [xF - 0.18, 0.2, 0.65, 0.665, hw * 0.95, hw * 0.79],
        [xF - 0.55, 0.19, 0.74, 0.745, hw * 0.99, hw * 0.83],
        [xF - 1.0, 0.185, 0.81, 0.8, hw, hw * 0.83],
        [cowl, 0.18, 0.89, 0.9, hw, hw * 0.77],
        [xF - 2.35, 0.178, 0.92, 1.2, hw, hw * 0.69],
        [roofF, 0.178, 0.94, 1.405, hw, hw * 0.63],
        [xF - 3.15, 0.18, 0.95, 1.43, hw, hw * 0.62],
        [roofR, 0.185, 0.96, 1.36, hw, hw * 0.64],
        [xF - 4.0, 0.2, 0.975, 1.17, hw * 0.995, hw * 0.71],
        [deck, 0.24, 0.985, 1.03, hw * 0.97, hw * 0.77],
        [xF - 4.75, 0.29, 0.97, 1.045, hw * 0.93, hw * 0.77],
        [-xF + 0.06, 0.33, 0.91, 0.99, hw * 0.86, hw * 0.71],
        [-xF, 0.38, 0.78, 0.84, hw * 0.78, hw * 0.62],
      ],
      shape: { glassMid: 0.5, bulge: 0.02, rail: 0.03, low: 0.5 },
      zones: { cowl, roofF, roofR, deck, sideF: cowl - 0.1, sideR: xF - 4.05, pillars: [[xF - 3.12, 0.05]], roof: 'glass' },
    });
    c.side(C.lamp, xF - 0.46, xF - 0.04, (x) => 0.6 + (xF - x) * 0.12, (x) => 0.65 + (xF - x) * 0.12);
    c.side(C.head, xF - 0.42, xF - 0.1, (x) => 0.615 + (xF - x) * 0.12, (x) => 0.628 + (xF - x) * 0.12, { out: 0.007 });
    c.side(C.tail, -xF + 0.03, -xF + 0.45, 0.85, 0.93, { out: 0.006 });
    c.end(C.tail, -1, hw * 0.48, hw * 0.76, 0.84, 0.9);
    c.end(C.grille, 1, -hw * 0.5, hw * 0.5, 0.36, 0.43, { both: false });
    c.end(C.matte, -1, -hw * 0.64, hw * 0.64, 0.35, 0.45, { both: false });
    c.top(C.trim, xF - 4.58, xF - 4.5, -hw * 0.72, hw * 0.72, { out: 0.012 });      // the lip of the tailgate
    c.seams([cowl - 0.05, xF - 3.12, xF - 4.1], 0.27, 0.92);
    c.handles([xF - 2.5, xF - 3.65], 0.86, { len: 0.2, paint: C.chrome });
    c.mirrors(cowl - 0.1, 0.95, { len: 0.2 });
  },

  modelX(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.98, xb = xa - c.v.wheelbase;
    const wo = { w: 0.265, rimR: 0.254, style: 'turbine', rim: C.rimSilver, ra: R + 0.05 };
    c.axle(xa, wo); c.axle(xb, wo);
    const cowl = xF - 1.95, roofF = xF - 3.15, roofR = xF - 4.0, deck = xF - 4.55;
    c.hull({
      keys: [
        [xF, 0.36, 0.52, 0.56, hw * 0.7, hw * 0.56],
        [xF - 0.06, 0.27, 0.64, 0.68, hw * 0.87, hw * 0.71],
        [xF - 0.2, 0.23, 0.74, 0.76, hw * 0.955, hw * 0.8],
        [xF - 0.6, 0.22, 0.85, 0.86, hw * 0.99, hw * 0.83],
        [xF - 1.2, 0.215, 0.95, 0.95, hw, hw * 0.82],
        [cowl, 0.21, 1.03, 1.04, hw, hw * 0.78],
        [xF - 2.5, 0.21, 1.06, 1.42, hw, hw * 0.71],
        [roofF, 0.21, 1.08, 1.665, hw, hw * 0.66],
        [xF - 3.5, 0.215, 1.09, 1.68, hw, hw * 0.66],
        [roofR, 0.22, 1.1, 1.6, hw, hw * 0.68],
        [xF - 4.3, 0.24, 1.11, 1.36, hw * 0.99, hw * 0.73],
        [deck, 0.26, 1.1, 1.17, hw * 0.97, hw * 0.79],
        [xF - 4.85, 0.3, 1.06, 1.14, hw * 0.93, hw * 0.79],
        [-xF + 0.05, 0.35, 0.98, 1.06, hw * 0.86, hw * 0.72],
        [-xF, 0.4, 0.84, 0.9, hw * 0.78, hw * 0.62],
      ],
      shape: { glassMid: 0.5, bulge: 0.02, rail: 0.04, low: 0.5 },
      zones: { cowl, roofF, roofR, deck, sideF: cowl - 0.12, sideR: xF - 4.2, pillars: [[xF - 3.05, 0.05], [xF - 3.95, 0.04]], roof: 'body' },
    });
    c.side(C.lamp, xF - 0.45, xF - 0.05, (x) => 0.66 + (xF - x) * 0.13, (x) => 0.72 + (xF - x) * 0.12);
    c.side(C.head, xF - 0.4, xF - 0.1, (x) => 0.675 + (xF - x) * 0.13, (x) => 0.69 + (xF - x) * 0.12, { out: 0.007 });
    c.side(C.tail, -xF + 0.03, -xF + 0.42, 0.95, 1.03, { out: 0.006 });
    c.end(C.tail, -1, hw * 0.45, hw * 0.75, 0.94, 1.0);
    c.end(C.grille, 1, -hw * 0.5, hw * 0.5, 0.38, 0.46, { both: false });
    c.end(C.matte, -1, -hw * 0.66, hw * 0.66, 0.38, 0.5, { both: false });
    c.top(C.trim, xF - 4.7, xF - 4.6, -hw * 0.72, hw * 0.72, { out: 0.012 });
    // the falcon wings: a seam along the roof each side, the front doors' cut
    c.top(C.seam, xF - 3.95, xF - 3.05, hw * 0.3, hw * 0.32, { out: 0.003, both: true });
    c.seams([cowl - 0.06, xF - 3.05, xF - 4.2], 0.3, 1.06);
    c.handles([xF - 2.6, xF - 3.6], 0.98, { len: 0.18 });
    c.mirrors(cowl - 0.12, 1.1, { len: 0.21 });
  },

  modelY(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.89, xb = xa - c.v.wheelbase;
    const wo = { w: 0.255, rimR: 0.241, style: 'aero', blade: C.rimSilver, ra: R + 0.05 };
    c.axle(xa, wo); c.axle(xb, wo);
    const cowl = xF - 1.56, roofF = xF - 2.62, roofR = xF - 3.62, deck = xF - 4.32;
    c.hull({
      keys: [
        [xF, 0.37, 0.56, 0.6, hw * 0.72, hw * 0.58],
        [xF - 0.05, 0.28, 0.67, 0.71, hw * 0.88, hw * 0.72],
        [xF - 0.18, 0.235, 0.76, 0.77, hw * 0.96, hw * 0.8],
        [xF - 0.55, 0.225, 0.86, 0.855, hw * 0.995, hw * 0.83],
        [xF - 1.05, 0.22, 0.93, 0.925, hw, hw * 0.81],
        [cowl, 0.22, 0.98, 0.99, hw, hw * 0.77],
        [xF - 2.1, 0.22, 1.0, 1.32, hw, hw * 0.7],
        [roofF, 0.22, 1.02, 1.585, hw, hw * 0.65],
        [xF - 3.1, 0.222, 1.03, 1.62, hw, hw * 0.64],
        [roofR, 0.228, 1.045, 1.53, hw, hw * 0.67],
        [xF - 4.0, 0.24, 1.055, 1.29, hw * 0.99, hw * 0.73],
        [deck, 0.27, 1.06, 1.13, hw * 0.97, hw * 0.79],
        [xF - 4.55, 0.31, 1.03, 1.11, hw * 0.93, hw * 0.79],
        [-xF + 0.05, 0.35, 0.95, 1.03, hw * 0.86, hw * 0.72],
        [-xF, 0.41, 0.82, 0.88, hw * 0.78, hw * 0.62],
      ],
      shape: { glassMid: 0.5, bulge: 0.025, rail: 0.035, low: 0.5 },
      zones: { cowl, roofF, roofR, deck, sideF: cowl - 0.1, sideR: xF - 4.1, pillars: [[xF - 2.98, 0.05]], roof: 'glass', sill: C.matte },
    });
    // the 2026 face: a thin light bar right across the nose, the headlamps low in the corners
    c.end(C.head, 1, -hw * 0.66, hw * 0.66, 0.69, 0.705, { both: false, inset: -0.035 });
    c.side(C.head, xF - 0.14, xF - 0.02, 0.715, 0.73, { out: 0.006 });
    c.side(C.lamp, xF - 0.3, xF - 0.03, 0.47, 0.56, { out: 0.006 });
    c.side(C.head, xF - 0.24, xF - 0.06, 0.5, 0.53, { out: 0.008 });
    c.end(C.grille, 1, -hw * 0.5, hw * 0.5, 0.39, 0.46, { both: false });
    // the tail: one light bar across, wrapping into the sides
    c.end(C.tail, -1, -hw * 0.82, hw * 0.82, 0.95, 0.975, { both: false, inset: 0.04 });
    c.side(C.tail, -xF + 0.03, -xF + 0.34, 0.95, 1.0, { out: 0.006 });
    c.end(C.matte, -1, -hw * 0.66, hw * 0.66, 0.38, 0.5, { both: false });
    c.top(C.trim, xF - 4.42, xF - 4.34, -hw * 0.72, hw * 0.72, { out: 0.012 });
    c.seams([cowl - 0.05, xF - 2.98, xF - 4.12], 0.32, 1.0);
    c.handles([xF - 2.32, xF - 3.5], 0.93, { len: 0.16 });
    c.mirrors(cowl - 0.12, 1.06, { len: 0.2 });
  },

  roadster08(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.78, xb = xa - c.v.wheelbase;
    c.axle(xa, { w: 0.195, rimR: 0.205, style: 'spoke5', ra: R + 0.05, R: R - 0.012 });
    c.axle(xb, { w: 0.225, rimR: 0.215, style: 'spoke5', ra: R + 0.05 });
    const cowl = xF - 1.48, roofF = xF - 1.98, open = [xF - 2.82, xF - 2.0];
    c.hull({
      keys: [
        [xF, 0.3, 0.42, 0.44, hw * 0.62, hw * 0.5],
        [xF - 0.06, 0.2, 0.54, 0.56, hw * 0.84, hw * 0.68],
        [xF - 0.25, 0.16, 0.66, 0.66, hw * 0.95, hw * 0.78],
        [xF - 0.75, 0.15, 0.76, 0.72, hw * 0.99, hw * 0.74],
        [cowl, 0.14, 0.8, 0.8, hw * 0.97, hw * 0.74],
        [roofF, 0.14, 0.8, 1.1, hw * 0.96, hw * 0.62],
        [xF - 2.02, 0.14, 0.8, 0.8, hw * 0.96, hw * 0.8],
        [xF - 2.8, 0.145, 0.82, 0.82, hw * 0.98, hw * 0.82],
        [xF - 2.86, 0.15, 0.84, 0.86, hw, hw * 0.84],
        [xF - 3.4, 0.17, 0.87, 0.89, hw, hw * 0.82],
        [-xF + 0.05, 0.25, 0.85, 0.88, hw * 0.92, hw * 0.75],
        [-xF, 0.32, 0.74, 0.8, hw * 0.84, hw * 0.66],
      ],
      shape: { glassMid: 0.5, bulge: 0.0, rail: 0.03, low: 0.55, belt: 0.95 },
      zones: { cowl, roofF, roofR: roofF - 0.1, deck: xF - 2.05, side: false, roof: 'glass', open, rail: C.trim },
      inner: (x) => x > open[0] && x < open[1],
    });
    // the cockpit: dash, seats, wheel, a hoop behind each seat (a tarpaulin rests on the hoops)
    c.tarpTop = (x) => (x > open[0] - 0.25 && x < open[1] + 0.1 ? 1.12 : 0);
    c.m.box(c.p(C.tub), 0.3, 0.26, hw * 1.7, open[1] - 0.05, 0.66, 0);
    c.seats(xF - 2.45, [-0.34, 0.34], 0.2, C.seat, { back: 0.55, w: 0.46 });
    c.steering(open[1] - 0.15, 0.78, 0.34);
    c.m.box(c.p(C.tub), 0.12, 0.3, hw * 1.7, open[0] + 0.05, 0.72, 0);
    for (const z of [-0.34, 0.34]) {
      c.m.tube(c.p(C.trim), [open[0] + 0.08, 0.85, z - 0.2], [open[0] + 0.02, 1.08, z], 0.025, 6);
      c.m.tube(c.p(C.trim), [open[0] + 0.02, 1.08, z], [open[0] + 0.08, 0.85, z + 0.2], 0.025, 6);
    }
    // teardrop headlamps, side intakes, four round tail lamps
    c.side(C.lamp, xF - 0.42, xF - 0.04, (x) => 0.52 + (xF - x) * 0.18, (x) => 0.6 + (xF - x) * 0.11);
    c.side(C.head, xF - 0.36, xF - 0.08, (x) => 0.54 + (xF - x) * 0.18, (x) => 0.585 + (xF - x) * 0.11, { out: 0.008 });
    c.side(C.matte, xF - 3.05, xF - 2.88, 0.38, 0.64, { out: -0.02 });
    for (const z of [hw * 0.45, hw * 0.72]) for (const s of [1, -1]) c.m.cyl(c.p(C.tail), 0.055, 0.03, -xF - 0.005, 0.66, z * s, 'x', 12);
    c.end(C.grille, 1, -hw * 0.45, hw * 0.45, 0.3, 0.38, { both: false });
    c.end(C.matte, -1, -hw * 0.5, hw * 0.5, 0.33, 0.42, { both: false });
    c.seams([cowl - 0.05, xF - 2.85], 0.25, 0.8);
    c.mirrors(cowl - 0.05, 0.85, { len: 0.16, h: 0.08 });
  },

  roadster17(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.72, xb = xa - c.v.wheelbase;
    c.axle(xa, { w: 0.245, rimR: 0.254, style: 'turbine', rim: C.rimDark, ra: R + 0.04, caliper: 'red' });
    c.axle(xb, { w: 0.3, rimR: 0.266, style: 'turbine', rim: C.rimDark, ra: R + 0.045, R: R + 0.01, caliper: 'red' });
    const cowl = xF - 1.62, roofF = xF - 2.42, roofR = xF - 2.75, deck = xF - 3.62;
    c.hull({
      keys: [
        [xF, 0.27, 0.38, 0.4, hw * 0.6, hw * 0.48],
        [xF - 0.07, 0.18, 0.5, 0.52, hw * 0.83, hw * 0.66],
        [xF - 0.3, 0.14, 0.6, 0.6, hw * 0.93, hw * 0.76],
        [xF - 0.75, 0.135, 0.7, 0.66, hw * 0.96, hw * 0.74],
        [cowl, 0.13, 0.76, 0.8, hw * 0.92, hw * 0.66],
        [xF - 2.0, 0.13, 0.77, 1.04, hw * 0.92, hw * 0.56],
        [roofF, 0.13, 0.79, 1.17, hw * 0.93, hw * 0.5],
        [xF - 2.6, 0.13, 0.8, 1.18, hw * 0.95, hw * 0.5],
        [roofR, 0.135, 0.82, 1.15, hw * 0.98, hw * 0.52],
        [xF - 3.2, 0.14, 0.85, 1.0, hw, hw * 0.6],
        [deck, 0.16, 0.86, 0.9, hw * 0.99, hw * 0.74],
        [xF - 4.0, 0.2, 0.86, 0.9, hw * 0.94, hw * 0.78],
        [-xF, 0.3, 0.74, 0.8, hw * 0.84, hw * 0.66],
      ],
      shape: { glassMid: 0.45, bulge: 0.02, rail: 0.03, low: 0.45, belt: 0.93 },
      zones: { cowl, roofF, roofR, deck, sideF: cowl - 0.08, sideR: xF - 3.2, roof: 'glass' },
    });
    c.side(C.lamp, xF - 0.5, xF - 0.05, (x) => 0.43 + (xF - x) * 0.25, (x) => 0.47 + (xF - x) * 0.27);
    c.side(C.head, xF - 0.44, xF - 0.1, (x) => 0.445 + (xF - x) * 0.25, (x) => 0.46 + (xF - x) * 0.27, { out: 0.007 });
    c.side(C.tail, -xF + 0.02, -xF + 0.38, 0.8, 0.84, { out: 0.006 });
    c.end(C.tail, -1, hw * 0.3, hw * 0.75, 0.79, 0.82);
    c.end(C.grille, 1, -hw * 0.5, hw * 0.5, 0.24, 0.32, { both: false });
    c.end(C.matte, -1, -hw * 0.7, hw * 0.7, 0.24, 0.4, { both: false });
    c.side(C.matte, xF - 3.25, xF - 2.95, 0.4, 0.62, { out: -0.015 });
    c.seams([cowl - 0.04, xF - 2.9], 0.22, 0.78);
    c.handles([xF - 2.65], 0.72, { len: 0.12 });
    c.mirrors(cowl - 0.08, 0.84, { len: 0.17, h: 0.08 });
  },

  roadster26(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.74, xb = xa - c.v.wheelbase;
    c.axle(xa, { w: 0.265, rimR: 0.266, style: 'blade', rim: C.rimDark, ra: R + 0.04, caliper: 'red' });
    c.axle(xb, { w: 0.315, rimR: 0.279, style: 'blade', rim: C.rimDark, ra: R + 0.045, R: R + 0.01, caliper: 'red' });
    const cowl = xF - 1.58, roofF = xF - 2.4, roofR = xF - 2.82, deck = xF - 3.55;
    c.hull({
      keys: [
        [xF, 0.24, 0.32, 0.34, hw * 0.66, hw * 0.56],
        [xF - 0.05, 0.16, 0.44, 0.46, hw * 0.88, hw * 0.74],
        [xF - 0.35, 0.13, 0.58, 0.58, hw * 0.96, hw * 0.78],
        [xF - 0.85, 0.125, 0.69, 0.66, hw, hw * 0.76],
        [cowl, 0.12, 0.76, 0.78, hw * 0.95, hw * 0.68],
        [roofF, 0.12, 0.79, 1.14, hw * 0.94, hw * 0.52],
        [xF - 2.62, 0.12, 0.8, 1.16, hw * 0.96, hw * 0.52],
        [roofR, 0.125, 0.82, 1.1, hw * 0.98, hw * 0.55],
        [deck, 0.14, 0.85, 0.9, hw, hw * 0.8],
        [-xF + 0.04, 0.2, 0.85, 0.9, hw * 0.98, hw * 0.84],
        [-xF, 0.26, 0.8, 0.86, hw * 0.94, hw * 0.8],
      ],
      smooth: false, step: 0.12, smoothDeg: 22,
      shape: { glassMid: 0.45, bulge: 0.0, rail: 0.03, low: 0.42, belt: 0.95 },
      zones: { cowl, roofF, roofR, deck, sideF: cowl - 0.06, sideR: xF - 3.0, roof: 'glass' },
    });
    // triangular lamps in the corners of the low nose
    for (const s of [1, -1]) {
      const z0 = hw * 0.62, x0 = xF - 0.36;
      c.m.with(place(0, 0, 0, 0, 0, 0, 1, 1, s), () => {
        c.m.tri([x0, 0.585, z0 + 0.12], [xF - 0.05, 0.47, z0 + 0.14], [x0 + 0.1, 0.6, z0 - 0.18], c.p(C.head));
        c.m.tri([x0 - 0.02, 0.58, z0 + 0.14], [xF - 0.03, 0.455, z0 + 0.16], [x0 + 0.1, 0.594, z0 - 0.21], c.p(C.lamp));
      });
    }
    // a light bar across the tail, the diffuser with four nozzles, the spoiler up
    c.end(C.tail, -1, -hw * 0.92, hw * 0.92, 0.8, 0.82, { both: false, inset: 0.02 });
    c.end(C.matte, -1, -hw * 0.85, hw * 0.85, 0.18, 0.42, { both: false });
    for (let i = 0; i < 4; i++) {
      const z = (i - 1.5) * 0.24;
      c.m.cyl(c.p(C.nozzle), 0.055, 0.12, -xF + 0.02, 0.3, z, 'x', 12, 0.045);
      c.m.cyl(c.p(C.under), 0.04, 0.02, -xF - 0.04, 0.3, z, 'x', 10);
    }
    for (let i = 0; i < 5; i++) c.m.box(c.p(C.matte), 0.4, 0.14, 0.012, -xF + 0.22, 0.2, (i - 2) * 0.3);
    const sx = -xF + 0.28;
    for (const z of [-0.45, 0.45]) c.m.box(c.p(C.trim), 0.12, 0.2, 0.025, sx + 0.02, 0.96, z, 0, 0, 0.25);
    c.m.plate(c.p(C.trim), [[sx - 0.2, 1.04], [sx + 0.2, 1.08], [sx + 0.22, 1.1], [sx - 0.2, 1.08]], -hw * 0.9, hw * 0.9);
    c.end(C.grille, 1, -hw * 0.6, hw * 0.6, 0.19, 0.27, { both: false });
    c.side(C.matte, xF - 3.1, xF - 2.9, 0.36, 0.62, { out: -0.015 });
    c.seams([cowl - 0.03, xF - 2.88], 0.2, 0.78);
    c.mirrors(cowl - 0.06, 0.82, { len: 0.16, h: 0.07 });
  },

  semi(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 1.35, xm = xa - c.v.wheelbase;
    const wf = { w: 0.31, rimR: 0.29, style: 'truck', rim: C.rimSilver, ra: R + 0.06, inset: 0.05 };
    c.axle(xa, wf);
    const back = 0.55;
    // the cab: a bullet nose, the wrap-round screen, the roof rising to the fairing
    c.hull({
      keys: [
        [xF, 0.6, 1.0, 1.15, hw * 0.78, hw * 0.66],
        [xF - 0.08, 0.5, 1.12, 1.35, hw * 0.9, hw * 0.78],
        [xF - 0.3, 0.46, 1.28, 1.62, hw * 0.98, hw * 0.86],
        [xF - 0.6, 0.45, 1.42, 1.98, hw, hw * 0.88],
        [xF - 1.05, 0.45, 1.58, 2.6, hw, hw * 0.83],
        [xF - 1.5, 0.45, 1.72, 3.02, hw, hw * 0.8],
        [xF - 2.1, 0.45, 1.84, 3.5, hw, hw * 0.76],
        [back + 0.12, 0.45, 1.9, 3.95, hw, hw * 0.74],
        [back, 0.52, 1.88, 3.9, hw * 0.98, hw * 0.72],
      ],
      step: 0.2,
      shape: { glassMid: 0.5, bulge: 0.0, rail: 0.06, low: 0.5, sill: 0.1 },
      zones: { cowl: xF - 0.62, roofF: xF - 1.5, roofR: -9, deck: xF - 1.52, side: false, roof: 'body' },
    });
    // side windows of the doors
    c.side(C.trim, xF - 2.05, xF - 1.0, 1.86, (x) => Math.min(2.72, 2.16 + (xF - 1.0 - x) * 0.9));
    c.side(C.glass, xF - 2.0, xF - 1.06, 1.9, (x) => Math.min(2.68, 2.16 + (xF - 1.06 - x) * 0.9), { out: 0.008 });
    // a strip of light across the nose and the lamps under it
    c.end(C.head, 1, -hw * 0.75, hw * 0.75, 1.13, 1.15, { both: false, inset: -0.02 });
    c.side(C.head, xF - 0.32, xF - 0.06, 0.98, 1.02, { out: 0.007 });
    c.end(C.grille, 1, -hw * 0.6, hw * 0.6, 0.62, 0.78, { both: false });
    c.end(C.matte, 1, -hw * 0.78, hw * 0.78, 0.55, 0.62, { both: false });
    c.seams([xF - 2.1, xF - 0.95], 0.5, 1.84);
    c.handles([xF - 1.9], 1.45, { len: 0.22 });
    c.mirrors(xF - 0.8, 2.05, { len: 0.32, h: 0.18, d: 0.08, up: 0.05 });
    // behind the cab: frame rails, battery skirts, the fifth wheel, mud flaps, lamps
    const P = (p) => c.p(p);
    const end = -xF + 0.1;
    for (const z of [-0.45, 0.45]) c.m.box(P(C.frame), back - end, 0.28, 0.1, (back + end) / 2, 0.92, z);
    c.m.box(P(C.frame), 0.1, 0.18, 0.9, end + 0.05, 0.9, 0);
    c.m.box(P(C.under), back - xm - 0.9, 0.55, hw * 1.6, (back + xm + 0.9) / 2, 0.75, 0);
    for (const s of [1, -1]) c.m.box(P(c.paint), back - xm - 1.0, 0.85, 0.04, (back + xm + 1.0) / 2 - 0.02, 0.83, s * (hw - 0.04));
    c.m.cyl(P(C.frame), 0.45, 0.08, xm, 1.2, 0, 'y', 16);
    c.m.box(P(C.frame), 0.5, 0.12, 0.35, xm + 0.55, 1.18, 0, 0, 0, 0.3);
    for (const z of [hw - 0.15, -hw + 0.15]) c.m.box(P(C.matte), 0.02, 0.5, 0.55, end - 0.05, 0.55, z);
    for (const z of [hw - 0.3, -hw + 0.3]) c.m.box(P(C.tail), 0.03, 0.06, 0.25, end - 0.08, 0.9, z);
    c.m.plate(P(C.matte), [[xm - 1.25, R * 2 + 0.08], [xm + 1.25, R * 2 + 0.08], [xm + 1.25, R * 2 + 0.03], [xm - 1.25, R * 2 + 0.03]], -hw + 0.02, hw - 0.02);
    c.proxyBoxes.push([back - end, 0.6, hw * 1.6, (back + end) / 2, 0.8, 0]);
    // the driven pair on dual wheels (no arches: they stand behind the cab)
    c.axle(xm + 0.65, { ...wf, dual: true, z: hw - 0.3, ra: 0 });
    c.axle(xm - 0.65, { ...wf, dual: true, z: hw - 0.3, ra: 0 });
  },

  badger(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.8, xb = xa - c.v.wheelbase;
    const wo = { w: 0.235, rimR: 0.229, style: 'spoke6', rim: C.rimBlack, arch: 'trapezoid', ra: R + 0.1 };
    c.axle(xa, wo); c.axle(xb, wo);
    const cowl = xF - 0.62, roofF = xF - 2.05;
    c.hull({
      keys: [
        [xF, 0.33, 0.74, 0.78, hw * 0.92, hw * 0.88],
        [xF - 0.06, 0.27, 0.84, 0.87, hw * 0.98, hw * 0.93],
        [cowl, 0.25, 0.98, 1.04, hw, hw * 0.93],
        [roofF, 0.25, 1.04, 2.06, hw, hw * 0.88],
        [-xF + 0.06, 0.27, 1.06, 2.1, hw, hw * 0.88],
        [-xF, 0.33, 1.02, 2.06, hw * 0.97, hw * 0.86],
      ],
      section: flatSection, smooth: false, step: 0.2, smoothDeg: 20,
      shape: { chamfer: 0.05, belt: 0.985 },
      zones: { cowl, roofF, roofR: -xF - 1, deck: -xF - 1, sideF: cowl - 0.12, sideR: -xF + 0.2, pillars: [[xF - 1.95, 0.06], [xF - 3.15, 0.06]], roof: 'trim', pillar: C.trim, glass: C.clear },
    });
    // the angled crease from the front arch up to the screen
    c.side(C.seam, xF - 0.95, xF - 0.62, (x) => 0.62 + (x - xF + 0.95), (x) => 0.63 + (x - xF + 0.95), { out: 0.003 });
    // square lamps low in the corners, amber under them, sensors
    for (const z of [hw * 0.55, hw * 0.78]) {
      c.end(C.lamp, 1, z - 0.1, z + 0.1, 0.5, 0.66);
      c.end(C.head, 1, z - 0.08, z + 0.08, 0.52, 0.64, { out: 0.01 });
    }
    c.end(C.amber, 1, hw * 0.78, hw * 0.92, 0.36, 0.44, { out: 0.008 });
    for (const z of [hw * 0.18, hw * 0.4]) c.end(C.grille, 1, z - 0.03, z + 0.03, 0.6, 0.66, { out: 0.008 });
    c.end(C.matte, 1, -hw * 0.95, hw * 0.95, 0.3, 0.36, { both: false });
    c.end(C.tail, -1, hw * 0.75, hw * 0.92, 0.55, 0.85);
    c.end(C.clear, -1, -hw * 0.75, hw * 0.75, 1.15, 1.95, { both: false });
    c.end(C.matte, -1, -hw * 0.95, hw * 0.95, 0.3, 0.38, { both: false });
    c.seams([cowl - 0.08, xF - 1.95, xF - 3.15], 0.3, 1.04);
    c.handles([xF - 1.7, xF - 2.9], 0.93, { len: 0.18 });
    c.mirrors(cowl - 0.1, 1.12, { len: 0.24, h: 0.12, paint: C.trim, d: 0.05 });
  },

  cyberbus(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 1.9, xb = xa - c.v.wheelbase;
    c.axle(xa, { w: 0.3, rimR: 0.25, style: 'hex', arch: 'trapezoid', ra: R + 0.12, inset: 0.06 });
    c.axle(xb, { w: 0.3, rimR: 0.25, style: 'hex', arch: 'trapezoid', ra: R + 0.12, dual: true, inset: 0.06, wellDepth: 0.75 });
    const cowl = xF - 0.75, roofF = xF - 2.25;
    const pillars = [];
    for (let x = roofF - 0.05; x > -xF + 0.6; x -= 1.32) pillars.push([x, 0.07]);
    c.hull({
      keys: [
        [xF, 0.4, 0.92, 0.97, hw * 0.94, hw * 0.9],
        [xF - 0.08, 0.34, 1.05, 1.1, hw * 0.99, hw * 0.95],
        [cowl, 0.32, 1.22, 1.28, hw, hw * 0.95],
        [roofF, 0.32, 1.28, 2.95, hw, hw * 0.9],
        [-xF + 0.08, 0.34, 1.32, 3.0, hw, hw * 0.9],
        [-xF, 0.42, 1.28, 2.95, hw * 0.97, hw * 0.88],
      ],
      section: flatSection, smooth: false, step: 0.4, smoothDeg: 20,
      shape: { chamfer: 0.06, belt: 0.985 },
      zones: { cowl, roofF, roofR: -xF - 1, deck: -xF - 1, sideF: cowl - 0.15, sideR: -xF + 0.4, pillars, roof: 'trim', glass: C.clear },
    });
    // the door on the kerb side
    c.side(C.trim, xF - 2.2, xF - 1.15, 0.35, 1.3, { both: false, out: 0.006 });
    c.side(C.glass, xF - 2.15, xF - 1.2, 0.5, 1.28, { both: false, out: 0.009 });
    c.side(C.seam, xF - 1.69, xF - 1.66, 0.35, 1.3, { both: false, out: 0.011, nx: 1 });
    c.end(C.head, 1, -hw * 0.8, hw * 0.8, 0.94, 0.96, { both: false, inset: -0.02 });
    for (const z of [hw * 0.6, hw * 0.8]) {
      c.end(C.lamp, 1, z - 0.09, z + 0.09, 0.6, 0.76);
      c.end(C.head, 1, z - 0.07, z + 0.07, 0.62, 0.74, { out: 0.01 });
    }
    c.end(C.amber, 1, hw * 0.8, hw * 0.93, 0.44, 0.52, { out: 0.008 });
    c.end(C.matte, 1, -hw * 0.95, hw * 0.95, 0.4, 0.46, { both: false });
    c.end(C.tail, -1, -hw * 0.85, hw * 0.85, 1.25, 1.28, { both: false });
    c.end(C.glass, -1, -hw * 0.8, hw * 0.8, 1.45, 2.75, { both: false });
    c.end(C.matte, -1, -hw * 0.95, hw * 0.95, 0.42, 0.52, { both: false });
    c.mirrors(cowl - 0.15, 1.45, { len: 0.36, h: 0.2, paint: C.trim, d: 0.06, up: 0.1 });
  },

  cyber3(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.86, xb = xa - c.v.wheelbase;
    const wo = { w: 0.245, rimR: 0.241, style: 'hex', arch: 'trapezoid', ra: R + 0.08 };
    c.axle(xa, wo); c.axle(xb, wo);
    const apex = -0.35, cowl = 1.05, deck = -1.45;
    const line = (x) => (x > apex ? 0.8 + ((xF - 0.08 - x) / (xF - 0.08 - apex)) * 0.6 : 1.4 - ((apex - x) / (apex + xF - 0.06)) * 0.42);
    c.hull({
      keys: [
        [xF, 0.3, 0.7, 0.74, hw * 0.92, hw * 0.88],
        [xF - 0.08, 0.22, 0.76, 0.8, hw * 0.99, hw * 0.93],
        [cowl, 0.2, 0.9, line(cowl), hw, hw * 0.84],
        [apex, 0.2, 0.93, 1.4, hw, hw * 0.62],
        [deck, 0.21, 0.95, line(deck), hw, hw * 0.74],
        [-xF + 0.06, 0.24, 0.96, line(-xF + 0.06), hw * 0.99, hw * 0.88],
        [-xF, 0.3, 0.92, 0.95, hw * 0.94, hw * 0.86],
      ],
      section: flatSection, smooth: false, step: 0.16, smoothDeg: 16,
      shape: { chamfer: 0.04, belt: 0.99 },
      zones: { cowl, roofF: apex + 0.02, roofR: apex - 0.02, deck, sideF: cowl - 0.15, sideR: deck + 0.15, pillars: [[-0.25, 0.04]], roof: 'glass', rearGlass: true },
    });
    // light bars across the nose and the tail
    c.end(C.head, 1, -hw * 0.9, hw * 0.9, 0.715, 0.73, { both: false, inset: -0.02 });
    c.end(C.tail, -1, -hw * 0.9, hw * 0.9, 0.925, 0.94, { both: false, inset: 0.015 });
    c.end(C.matte, 1, -hw * 0.9, hw * 0.9, 0.3, 0.42, { both: false });
    c.end(C.matte, -1, -hw * 0.9, hw * 0.9, 0.3, 0.42, { both: false });
    // black cladding along the sill
    c.side(C.matte, xb + R + 0.1, xa - R - 0.1, 0.2, 0.3, { out: 0.006 });
    c.seams([cowl - 0.08, -0.25, deck + 0.12], 0.25, 0.92);
    c.handles([0.6, -0.8], 0.86, { len: 0.16 });
    c.mirrors(cowl - 0.15, 0.98, { len: 0.18, paint: C.trim });
  },

  cybertruck(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.98, xb = xa - c.v.wheelbase;
    const wo = { w: 0.29, rimR: 0.254, style: 'hex', arch: 'trapezoid', ra: R + 0.1 };
    c.axle(xa, wo); c.axle(xb, wo);
    const apex = -0.25, cowl = 1.32, tail = -xF + 0.06;
    const front = (x) => 1.12 + ((xF - 0.04 - x) / (xF - 0.04 - apex)) * 0.67;
    const back = (x) => 1.79 - ((apex - x) / (apex - tail)) * 0.53;
    c.hull({
      keys: [
        [xF, 0.46, 1.0, 1.1, hw * 0.95, hw * 0.91],
        [xF - 0.04, 0.4, 1.06, 1.12, hw * 0.995, hw * 0.95],
        [cowl, 0.37, 1.14, front(cowl), hw, hw * 0.86],
        [apex, 0.37, 1.17, 1.79, hw, hw * 0.6],
        [-0.9, 0.37, 1.18, back(-0.9), hw, hw * 0.8],
        [-1.0, 0.37, 1.18, back(-1.0), hw, hw * 0.94],
        [tail, 0.42, 1.2, back(tail), hw, hw * 0.96],
        [-xF, 0.5, 1.16, 1.24, hw * 0.97, hw * 0.94],
      ],
      section: flatSection, smooth: false, step: 0.18, smoothDeg: 16,
      shape: { chamfer: 0.04, belt: 0.99 },
      zones: { cowl, roofF: apex + 0.02, roofR: apex - 0.02, deck: -0.95, sideF: cowl - 0.12, sideR: -0.9, pillars: [[0.08, 0.05]], roof: 'glass', rearGlass: true, lower: (x, j) => (j === 1 ? C.matte : undefined) },
    });
    // the light bars right across the nose and the tail, the black cladding of the arches
    c.end(C.head, 1, -hw * 0.94, hw * 0.94, 1.085, 1.1, { both: false, inset: -0.03 });
    c.end(C.tail, -1, -hw * 0.94, hw * 0.94, 1.18, 1.2, { both: false, inset: 0.04 });
    c.end(C.matte, 1, -hw * 0.95, hw * 0.95, 0.44, 0.62, { both: false });
    c.end(C.matte, -1, -hw * 0.95, hw * 0.95, 0.48, 0.66, { both: false });
    for (const a of [xa, xb]) c.side(C.matte, a - R - 0.17, a + R + 0.17, (x) => Math.max(0.38, c.archY(x)), (x) => Math.max(0.47, c.archY(x) + 0.09), { out: 0.008, nx: 12 });
    c.side(C.seam, -1.0, -0.97, 1.2, 1.5, { out: 0.003 });
    c.seams([cowl - 0.1, 0.08, -0.95], 0.4, 1.15);
    c.mirrors(cowl - 0.1, 1.24, { len: 0.22, paint: C.trim, d: 0.06 });
  },

  cyberroadster(c) {
    const { L, W } = c, hw = W / 2, xF = L / 2, R = c.v.wheelR;
    const xa = xF - 0.86, xb = xa - c.v.wheelbase;
    c.axle(xa, { w: 0.255, rimR: 0.254, style: 'blade', rim: C.rimBlack, arch: 'trapezoid', ra: R + 0.07, caliper: 'red' });
    c.axle(xb, { w: 0.335, rimR: 0.266, style: 'blade', rim: C.rimBlack, arch: 'trapezoid', ra: R + 0.08, R: R + 0.02, caliper: 'red' });
    const cowl = 0.62, open = [-1.18, -0.02];
    // dark brushed sheet steel, a glossy teal bonnet and a few teal facets
    const teal = bodyPaint('teal'), sheet = { color: 0x6c7074, metal: 0.78, rough: 0.34, brushed: true, body: true };
    c.paint = c.burnt ? c.paint : sheet;
    c.hull({
      keys: [
        [xF, 0.24, 0.29, 0.32, hw * 0.8, hw * 0.74],
        [xF - 0.12, 0.19, 0.42, 0.46, hw * 0.96, hw * 0.86],
        [1.5, 0.19, 0.64, 0.68, hw, hw * 0.86],
        [cowl, 0.19, 0.83, 0.86, hw, hw * 0.82],
        [0.02, 0.19, 0.85, 1.06, hw * 0.98, hw * 0.6],
        [-0.02, 0.19, 0.85, 0.86, hw * 0.98, hw * 0.82],
        [-1.16, 0.2, 0.87, 0.88, hw, hw * 0.84],
        [-1.3, 0.21, 0.9, 0.95, hw, hw * 0.86],
        [-xF + 0.06, 0.28, 0.88, 0.92, hw * 0.98, hw * 0.88],
        [-xF, 0.34, 0.84, 0.88, hw * 0.95, hw * 0.84],
      ],
      section: flatSection, smooth: false, step: 0.14, smoothDeg: 16,
      shape: { chamfer: 0.05, belt: 0.99 },
      zones: {
        cowl, roofF: 0.0, roofR: -1, deck: 0.0, side: false, roof: 'glass', open, rail: C.trim,
        upper: (x) => (x > cowl - 0.02 ? teal : x < -1.32 ? C.frame : undefined),
        lower: (x, j) => (j === 2 && x < xa - 0.45 && x > xa - 1.25 ? teal : undefined),
      },
      capR: C.frame,
      inner: (x) => x > open[0] && x < open[1],
    });
    // the open back: tanks and the motor under the cage
    for (const z of [-0.32, 0.32]) c.m.cyl(c.p(C.tank), 0.11, 0.55, -1.75, 1.0, z, 'z', 12);
    c.m.box(c.p(C.frame), 0.45, 0.22, 0.5, -2.05, 0.98, 0);
    // red seats, a black cage behind them, the wing on its struts (a tarpaulin rests on the cage)
    c.tarpTop = (x) => (x > -1.9 && x < 0.1 ? 1.18 : 0);
    c.m.box(c.p(C.tub), 0.25, 0.25, hw * 1.8, 0.0, 0.7, 0);
    c.seats(-0.6, [-0.38, 0.38], 0.22, C.seatRed, { back: 0.6, w: 0.48 });
    c.steering(-0.18, 0.78, 0.38);
    const cage = c.p(C.trim);
    for (const z of [-0.62, 0.62]) {
      c.m.tube(cage, [-1.15, 0.86, z], [-1.0, 1.16, z * 0.8], 0.028);
      c.m.tube(cage, [-1.0, 1.16, z * 0.8], [-1.8, 0.92, z * 0.7], 0.026);
      c.m.tube(cage, [-1.0, 1.16, z * 0.8], [0.0, 1.05, z * 0.75], 0.024);
    }
    c.m.tube(cage, [-1.0, 1.16, -0.5], [-1.0, 1.16, 0.5], 0.028);
    c.m.tube(cage, [-1.0, 1.16, -0.5], [-1.75, 0.92, 0.45], 0.024);
    const wx = -xF + 0.25;
    for (const z of [-0.35, 0.35]) c.m.box(cage, 0.08, 0.3, 0.02, wx + 0.04, 1.05, z, 0, 0, 0.35);
    c.m.plate(c.p(C.trim), [[wx - 0.28, 1.16], [wx + 0.26, 1.24], [wx + 0.28, 1.27], [wx - 0.28, 1.21]], -hw, hw);
    for (const z of [-hw, hw - 0.02]) c.m.box(c.p(C.trim), 0.62, 0.22, 0.02, wx, 1.17, z);
    // the diffuser: tall black fins under the tail, the lamps in thin strips
    for (let i = 0; i < 7; i++) c.m.plate(c.p(C.trim), [[-xF - 0.18, 0.06], [-xF + 0.5, 0.06], [-xF + 0.5, 0.3], [-xF - 0.18, 0.74]], (i - 3) * 0.24 - 0.007, (i - 3) * 0.24 + 0.007);
    c.end(C.tail, -1, -hw * 0.7, hw * 0.7, 0.8, 0.815, { both: false });
    c.end(C.head, 1, -hw * 0.66, hw * 0.66, 0.295, 0.31, { both: false });
    c.end(C.matte, 1, -hw * 0.76, hw * 0.76, 0.25, 0.285, { both: false });
    // the splitter under the nose
    c.m.plate(c.p(C.trim), [[xF - 0.55, 0.1], [xF + 0.12, 0.1], [xF + 0.12, 0.13], [xF - 0.55, 0.16]], -hw * 0.95, hw * 0.95);
    // rivets along the panel edges
    for (let x = xb + 0.6; x < xa - 0.4; x += 0.22) c.side(C.rivet, x, x + 0.02, 0.7, 0.72, { out: 0.006, nx: 1, ny: 1 });
    c.seams([xa - 0.45, -0.1], 0.22, 0.84, { w: 0.006 });
    c.mirrors(0.55, 0.92, { len: 0.16, paint: C.trim, h: 0.07 });
  },
};

// --------------------------------------------------------------------------------------- the set
const GEOMETRIES = new Map();

/** Tarpaulins: the fabrics of the block's market stalls. */
const TARPS = [{ color: 0x4a6a8a, rough: 0.96 }, { color: 0x8a5a3a, rough: 0.96 }, { color: 0x5a7a4a, rough: 0.96 }, { color: 0x9a8a6a, rough: 0.96 }];

/**
 * The model in its own frame: {geometry, proxy, triangles, size}. Cached per id, state, paint and
 * tarpaulin (o.tarp: false, or 1..4 for its fabric; a tarpaulin covers the car from the middle back).
 */
export function vehicleGeometry(id, o = {}) {
  const v = vehicleOf(id);
  if (!v) throw new Error('no such vehicle: ' + id);
  const state = o.state === 'burnt' ? 'burnt' : 'parked';
  const paint = state === 'burnt' ? 'char' : (o.paint ?? v.look.paints[0]);
  const tarp = o.tarp ? (Math.abs(Math.round(Number(o.tarp) || 1) - 1) % TARPS.length) + 1 : 0;
  const key = id + '|' + state + '|' + paint + '|' + tarp;
  let out = GEOMETRIES.get(key);
  if (!out) {
    const c = new Car(v, { state, paint });
    const make = BODIES[v.look.body] || BODIES.model3;
    make(c);
    if (tarp) c.tarp(v.length * 0.05, TARPS[tarp - 1]);
    out = { ...c.finish(), size: v };
    GEOMETRIES.set(key, out);
  }
  return out;
}

// -------------------------------------------------------------------------------------- material
/** A small tiling grime (colour) and a roughness that goes with it. */
function grime() {
  const N = 128, col = new Uint8Array(N * N * 4), rgh = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = (s, k) => vnoise((x / N) * k + s, (y / N) * k, s) ;
      // tileable enough at this scale: blend the noise with its mirror at the edges
      const n = 0.55 * f(1, 6) + 0.3 * f(2, 14) + 0.15 * f(3, 40);
      const dirt = THREE.MathUtils.smoothstep(n, 0.52, 0.8), fine = f(4, 64);
      const v = 1 - 0.07 * dirt - 0.03 * fine, i = (y * N + x) * 4;
      col[i] = col[i + 1] = Math.round(255 * v); col[i + 2] = Math.round(255 * v * (1 - 0.03 * dirt)); col[i + 3] = 255;
      rgh[i] = 255; rgh[i + 1] = Math.round(255 * (0.86 + 0.14 * dirt - 0.05 * fine)); rgh[i + 2] = 255; rgh[i + 3] = 255;
    }
  }
  const tex = (data) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  return { map: tex(col), rough: tex(rgh) };
}

/** The one material of the set for a renderer: colour per vertex times grime, metalness, roughness and glow from `surf`. */
export function fleetMaterial(gr) {
  const tex = grime();
  tex.map.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, map: tex.map, roughnessMap: tex.rough });
  // shadows and occlusion come from the low hulls (World.casterProxies, World.aoProxies)
  m.userData = { casterProxy: true, aoProxy: true, texWorld: [1.25, 1.25] };
  if (gr && gr.prepareMaterial) gr.prepareMaterial(m);
  const hook = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    if (hook) hook.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor * vSurf.y, 0.04, 1.0 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurf.x;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vSurf.z;');
  };
  m.customProgramCacheKey = () => (key ? key.call(m) : '') + '+fleet';
  m.needsUpdate = true;
  return m;
}

/** The materials of the set in a world (made once, kept in world.m so World.dispose frees them). */
export function fleetMaterials(w) {
  if (!w.m.fleetBody) {
    w.m.fleetBody = fleetMaterial(w.gr);
    w.kindOf.set(w.m.fleetBody, 'metal');
  }
  return { body: w.m.fleetBody };
}

/**
 * Put a model into the world's batches at (x, y, z), its nose turned to yaw (0: nose to +x, PI/2: to -z; the
 * turn of World.box ry). state 'parked' or 'burnt'; paint a name of core/fleet PAINTS (default: from seed);
 * tarp 1..4 throws a tarpaulin over its back half. No colliders. Returns {id, length, width, height}.
 */
export function buildVehicle(w, id, o = {}) {
  const v = vehicleOf(id);
  if (!v) throw new Error('no such vehicle: ' + id);
  const state = o.state === 'burnt' ? 'burnt' : 'parked';
  const paint = o.paint ?? pickPaint(id, o.seed ?? (o.x || 0) * 7.13 + (o.z || 0) * 3.71);
  const model = vehicleGeometry(id, { state, paint, tarp: o.tarp });
  const mat = fleetMaterials(w).body;
  const m = new THREE.Matrix4().makeRotationY(o.yaw || 0).setPosition(o.x || 0, o.y || 0, o.z || 0);
  w._addGeo(mat, model.geometry.clone().applyMatrix4(m));
  const shadow = model.proxy.clone().applyMatrix4(m);
  w.casterProxies.push(shadow);
  if (w.aoProxies) w.aoProxies.push(shadow.clone());
  return { id, length: v.length, width: v.width, height: v.height };
}
