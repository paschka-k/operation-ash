// The nine generated maps of wave 15 in the scene. A layout of core/mapgen goes through the same static
// pipeline as the block: World.box / _addGeo, merged per material and 30 m chunk in World._flush, the
// shadow and occlusion shapes from there. The colliders are exactly layoutColliders(layout); the world adds
// only the crates and barrels of the props pools and the furniture of addInteriors.
//
//   buildGenerated(world, layout)    the whole map into an empty World (level.js buildLevel calls it)
//   placeLayout(world)               crates, barrels, fires and supply points of the layout (World._places)
//   PIECE_DRAW[type](world, p, mat, i)  how a piece of each type is drawn, inside its collision boxes
//                                    (PIECE_SHAPES); a type without a row is drawn as those boxes
//   lookMaterial(world, kind)        the world's material for a look name of the layout
//
// Every piece is drawn inside its own colliders, so the player neither walks into air nor through what he
// sees; the parts that stand out of them are above any height the player can reach (the slope of a gable
// roof, a crane's girders and boom, a lamp's arm, a stall's awning, a palm's fronds). The looks of a theme
// are many materials of a few texture sets; before the merge, materials that differ only in colour become
// one material with the colour in the vertices (mergeTints), so a map costs no more draw calls than the
// block. The layout object is shared by every build of the map (core/mapgen caches it): nothing here
// writes into it.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { layoutColliders, buildingColliders, buildingOpenings, PIECE_SHAPES, STOREY, surfaceOf } from '../core/mapgen.js';
import { MAP_IDS } from '../core/maps.js';
import { atmosphereFor } from '../core/atmosphere.js';
import { pbrMaterial, themeTextureSet } from '../render/materials.js';
import { addInteriors, addDetails, decorMaterials } from './details.js';

const QUARTER = Math.PI / 2;
const TAU = Math.PI * 2;
const HALF = 45;

/** The seed of world.rng per map (looks only: debris, perimeter, interiors, details, skyline). */
export const MAP_SEEDS = Object.fromEntries(MAP_IDS.map((id, i) => [id, 20261010 + 1511 * (i + 1)]));

// ------------------------------------------------------------------------------------ materials

/** Ground of a map per ground kind of its layout: texture set and linear colour multipliers. */
const GROUNDS = {
  asphalt: { set: 'asphalt', tint: [0.95, 0.95, 0.95] },
  concrete: { set: 'concrete', tint: [0.56, 0.55, 0.54] },
  cobble: { set: 'cobble', tint: [0.95, 0.9, 0.84] },
  gravel: { set: 'gravel', tint: [1, 1, 1] },
  grass: { set: 'grass', tint: [1, 1, 1] },
  snow: { set: 'snow', tint: [1, 1, 1] },
  sand: { set: 'sand', tint: [1, 1, 1] },
  dirt: { set: 'dirt', tint: [0.8, 0.7, 0.6], rough: 0.7 },
};

/** Street surface per map, over its ground: set, linear multipliers, roughness factor (wet below 1). */
const ROADS = {
  port: { set: 'asphalt', tint: [0.82, 0.82, 0.84] },
  factory: { set: 'asphalt', tint: [0.9, 0.9, 0.9] },
  oldtown: { set: 'cobble', tint: [0.72, 0.72, 0.74] },
  railyard: { set: 'asphalt', tint: [0.88, 0.87, 0.86] },
  airfield: { set: 'concrete', tint: [0.92, 0.91, 0.88] },
  winter: { set: 'snow', tint: [0.7, 0.68, 0.66], rough: 0.85 },
  night: { set: 'asphalt', tint: [0.7, 0.7, 0.74], rough: 0.4 },
  desert: { set: 'dirt', tint: [1.45, 1.18, 0.82] },
  construction: { set: 'gravel', tint: [0.78, 0.68, 0.56] },
};

/**
 * Looks of pieces and walls that the block has no material for: [texture set, sRGB colour]. A set named
 * in TEXTURE_SPECS as onDemand comes from themeTextureSet, the others are the shared sets of the pack
 * (the photoscans when they are there: concrete, brick, asphalt, metal, containers).
 */
const LOOKS = {
  corrugated: ['corrugated', 0xaeb0aa], timber: ['timber', 0xffffff], adobe: ['adobe', 0xffffff],
  metalWhite: ['metal', 0xd8dad6], wagonRed: ['container', 0x8a3426], wagonBrown: ['container', 0x6e4c36],
  wagonGray: ['container', 0x7a8084], tanker: ['metal', 0x34363a], planeGray: [null, 0x8e959a, 0.45, 0.35],
  planeGreen: [null, 0x4c5838, 0.6, 0.15], gantry: ['metal', 0xd09a24], tower: ['metal', 0xe0b020], bollard: ['metal', 0x34322f],
  bench: ['wood', 0x9a7a5a], billboard: ['metal', 0x48484c], woodFence: ['timber', 0xf0e4d0], siteFence: ['metal', 0x9aa2a8],
  fence: ['metal', 0x8a9096], well: ['concrete', 0xd8c4a8], crate_stack: ['wood', 0xffffff], pallet: ['wood', 0xe0c8a8],
  dumpster: ['metal', 0x46664a], hedgehog: ['metal', 0x6a5a4c], stall: ['wood', 0xc8a880], snowbank: ['snow', 0xffffff],
  snow: ['snow', 0xffffff], sandDrift: ['sand', 0xffffff], rail: ['metal', 0x6a625a], sleeper: ['wood', 0x6a5848],
  stone: ['concrete', 0xd8ccb8], rock: ['concrete', 0x8a8076], ballast: ['gravel', 0x8a8480], slab: ['concrete', 0xb4b0a8],
  roofTar: ['gravel', 0x8a8a88], roofAdobe: ['adobe', 0xe8d4b8], pipe: ['metal', 0x8a4a34], grating: ['metal', 0x6c7075],
  steel: ['metal', 0x5a5e62], hoarding: ['corrugated', 0x5878a0], blastWall: ['concrete', 0xc4c0b8],
};

/** Texture sets that are made on demand (see materials.js themeTextureSet). */
const ON_DEMAND = new Set(['snow', 'sand', 'adobe', 'corrugated', 'cobble', 'tiles', 'timber', 'grass', 'gravel']);

const linearTimes = (mat, k) => { mat.color.r *= k[0]; mat.color.g *= k[1]; mat.color.b *= k[2]; return mat; };
const overlay = (mat, f = -2) => { mat.polygonOffset = true; mat.polygonOffsetFactor = f; mat.polygonOffsetUnits = f; return mat; };

/** A texture set by name: on-demand sets are made the first time a map wants them. */
function textureSet(w, name) {
  if (ON_DEMAND.has(name)) return themeTextureSet(name, (w.tex.concrete && w.tex.concrete.map.anisotropy) || 4);
  return w.tex[name];
}

/** The world's material for a look name of the layout: its own name, the LOOKS table, or by its surface. */
export function lookMaterial(w, kind) {
  if (kind && w.m[kind]) return w.m[kind];
  const look = LOOKS[kind];
  if (look) {
    // no set: plain paint (an aircraft's skin is smooth, not the rusty plate of the metal set)
    const mat = look[0] ? pbrMaterial(textureSet(w, look[0]), { color: look[1] })
      : new THREE.MeshStandardMaterial({ color: look[1], roughness: look[2] ?? 0.5, metalness: look[3] ?? 0.2 });
    w.m[kind] = mat;
    w.kindOf.set(mat, surfaceOf(kind));
    return mat;
  }
  const SURFACE_MAT = { brick: 'brick', plaster: 'plaster', wood: 'wood', sand: 'sandbag', metal: 'metalGray', concrete: 'concrete' };
  return w.m[SURFACE_MAT[surfaceOf(kind)]] || w.m.concrete;
}

/** A copy of a material in another colour (linear multipliers), kept in world.m so the map frees it. */
function tint(w, mat, k, key) {
  const name = key || ('~' + mat.uuid.slice(0, 8) + k.join(','));
  if (w.m[name]) return w.m[name];
  const t = linearTimes(mat.clone(), k);
  w.m[name] = t;
  return t;
}

/** Plain materials of the theme (no texture), added to world.m. */
function themeMaterials(w, L) {
  const m = w.m, pal = L.theme.palette || {};
  const night = !!atmosphereFor(L.atmosphere).night;
  w.night = night;
  const glow = (color, k) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.4 });
  const plain = (color, roughness, metalness = 0, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...o });
  const G = GROUNDS[L.ground && L.ground.kind] || GROUNDS.dirt, R = ROADS[L.id] || ROADS.port;
  const ground = linearTimes(pbrMaterial(textureSet(w, G.set)), G.tint);
  if (G.rough) ground.roughness = G.rough;
  const road = overlay(linearTimes(pbrMaterial(textureSet(w, R.set)), R.tint));
  if (R.rough) road.roughness = R.rough;
  if (night) ground.roughness = 0.5;
  // open water gets small waves: the sand set's ripples, flattened; a fountain's basin stays smooth
  const water = new THREE.MeshStandardMaterial({ color: pal.water ?? 0x18282a, roughness: 0.14, metalness: 0.05 });
  if (L.pieces.some((p) => p.type === 'water')) {
    water.normalMap = textureSet(w, 'sand').normalMap;
    water.normalScale.set(0.35, 0.35);
  }
  water.userData.texWorld = [6, 6];
  const add = {
    ground, road, water,
    leaves: plain(0x4a6a3a, 0.92), needles: plain(0x2b4632, 0.95), fronds: plain(0x5a7a3a, 0.9, 0, { side: THREE.DoubleSide }),
    trunk: plain(0x5e4c3c, 0.95), palmTrunk: plain(0x7a6650, 0.95),
    canopy: plain(pal.accent ?? 0xc2462e, 0.9, 0, { side: THREE.DoubleSide }),
    lampHousing: plain(0x3a3c3e, 0.5, 0.6),
    lampHead: night ? glow(0xffc890, 5) : plain(0xd8d4c8, 0.2, 0.1),
    neonPink: glow(0xff4fa0, night ? 4.5 : 1.6), neonCyan: glow(0x4fe0ff, night ? 4.5 : 1.6), neonYellow: glow(0xffd24a, night ? 4 : 1.4),
    roomLight: glow(0xffd8a8, 3.2), windowLit: glow(0xffc070, 1.6),
    billboardGlow: night ? glow(0xe8eef8, 1.4) : plain(0xd8d8d4, 0.6),
    puddle: overlay(plain(0x2a3036, 0.03, 0, { envMapIntensity: 1.8 }), -3),
    fruitA: plain(0xd8641e, 0.6), fruitB: plain(0x8a2a24, 0.6), fruitC: plain(0x6a8a2a, 0.6),
    paintedWood: plain(0xe2ded2, 0.7),
    chimneyRed: plain(0x9a3a2e, 0.8), chimneyWhite: plain(0xd8d4cc, 0.8),
    hull: plain(0x2a2c2e, 0.6, 0.3), hullRed: plain(0x7a2a22, 0.7, 0.2), shipWhite: plain(0xd4d6d4, 0.5, 0.2),
    horizon: plain(0xffffff, 1, 0, { vertexColors: true, side: THREE.DoubleSide }),
  };
  if (L.id === 'winter') add.slush = overlay(linearTimes(pbrMaterial(textureSet(w, 'snow')), [0.55, 0.52, 0.5]), -3);
  for (const [k, v] of Object.entries(add)) m[k] = v;
}

// ------------------------------------------------------------------------------------ geometry helpers

const vis = { collide: false, structural: true };
const quarterOf = (yaw) => (((Math.round((yaw || 0) / QUARTER)) % 4) + 4) % 4;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

/** The frame of a piece: its quarter turn about y, then its place. */
function frame(p) {
  return new THREE.Matrix4().makeRotationY(quarterOf(p.yaw) * QUARTER).setPosition(p.x, p.y || 0, p.z);
}

/** Every geometry of a batch must be indexed or none: these are. */
function indexed(g) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}

/** UVs in metres over the material's texWorld, picked per vertex by its normal (as World.box bakes boxes). */
function planarUV(g, mat, swap = false) {
  const tw = mat.userData.texWorld || [1, 1];
  const pos = g.attributes.position, nor = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); g.setAttribute('uv', uv); }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    if (swap) [u, v] = [v, u];
    uv.setXY(i, u / tw[0], v / tw[1]);
  }
  return g;
}

/** UVs of a three.js cylinder or cone in metres: round the side, flat on the caps. */
function cylinderUV(g, r, mat) {
  const tw = mat.userData.texWorld || [1, 1], pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(nor.getY(i)) > 0.8) uv.setXY(i, pos.getX(i) / tw[0], pos.getZ(i) / tw[1]);
    else uv.setXY(i, (uv.getX(i) * TAU * r) / tw[0], pos.getY(i) / tw[1]);
  }
  return g;
}

/** A box in the frame of a piece, quarter turns only: centre (lx, lz), bottom ly, sizes along the local axes. */
function localBox(w, p, lx, ly, lz, sw, sh, sd, mat, o = vis) {
  const q = quarterOf(p.yaw), c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
  const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
  const ww = q % 2 ? sd : sw, dd = q % 2 ? sw : sd;
  w.box(x, (p.y || 0) + ly + sh / 2, z, ww, sh, dd, mat, o);
}

/** A point of the frame of a piece in the world. */
function localPoint(p, lx, lz) {
  const q = quarterOf(p.yaw), c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** Put a geometry made in the frame of a piece into the batches. */
function place(w, p, g, mat) {
  g.applyMatrix4(frame(p));
  w._addGeo(mat, indexed(g));
}

/** Any box in the frame of a piece: centre (cx, cy, cz) above the piece's base, turned by (rx, ry, rz). */
function obox(w, p, cx, cy, cz, sx, sy, sz, mat, rx = 0, ry = 0, rz = 0, swapUV = false) {
  const g = planarUV(new THREE.BoxGeometry(sx, sy, sz), mat, swapUV);
  _m.compose(_p.set(cx, cy, cz), _q.setFromEuler(_e.set(rx, ry, rz)), _one);
  g.applyMatrix4(_m);
  place(w, p, g, mat);
}

/** A cylinder (or a cone frustum) in the frame of a piece, its axis along local 'x', 'y' or 'z'. */
function ocyl(w, p, cx, cy, cz, rTop, rBot, len, mat, seg = 12, axis = 'y', open = false) {
  const g = cylinderUV(new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open), (rTop + rBot) / 2, mat);
  if (axis === 'x') g.rotateZ(-QUARTER); else if (axis === 'z') g.rotateX(QUARTER);
  g.translate(cx, cy, cz);
  place(w, p, g, mat);
}

/** A thin bar between two points of the frame of a piece. */
function obar(w, p, a, b, th, mat) {
  const pa = localPoint(p, a[0], a[2]), pb = localPoint(p, b[0], b[2]), y = p.y || 0;
  w.segment(mat, pa.x, y + a[1], pa.z, pb.x, y + b[1], pb.z, th);
}

/**
 * A prism: the convex polygon `profile` ([[a, y], ...] counter-clockwise, a along local z) extruded along
 * local x from x0 to x1, in the frame of a piece. UVs in metres: along x and round the profile.
 */
function prism(w, p, profile, x0, x1, mat) {
  const tw = mat.userData.texWorld || [1, 1];
  const pos = [], nor = [], uv = [], idx = [];
  const n = profile.length;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const [a0, y0] = profile[i], [a1, y1] = profile[(i + 1) % n];
    const len = Math.hypot(a1 - a0, y1 - y0);
    if (len < 1e-6) continue;
    const ny = -(a1 - a0) / len, na = (y1 - y0) / len, b = pos.length / 3;
    pos.push(x0, y0, a0, x1, y0, a0, x1, y1, a1, x0, y1, a1);
    for (let k = 0; k < 4; k++) nor.push(0, ny, na);
    uv.push(x0 / tw[0], run / tw[1], x1 / tw[0], run / tw[1], x1 / tw[0], (run + len) / tw[1], x0 / tw[0], (run + len) / tw[1]);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    run += len;
  }
  for (const [x, sgn] of [[x0, -1], [x1, 1]]) {
    const b = pos.length / 3;
    for (const [a, y] of profile) { pos.push(x, y, a); nor.push(sgn, 0, 0); uv.push(a / tw[0], y / tw[1]); }
    for (let i = 1; i < n - 1; i++) {
      if (sgn < 0) idx.push(b, b + i, b + i + 1); else idx.push(b, b + i + 1, b + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  place(w, p, g, mat);
}

/** A box with rounded edges (snow, sand), centre (cx, cy, cz) in the frame of a piece. */
function roundBox(w, p, cx, cy, cz, sx, sy, sz, r, mat) {
  const g = planarUV(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2, sy / 2, sz / 2) - 1e-3), mat);
  g.translate(cx, cy, cz);
  place(w, p, g, mat);
}

/** A flat quad in the frame of a piece (the uvs of the texture as they are, 0..1). */
function oquad(w, p, cx, cy, cz, sw, sh, mat, ry = 0, rx = 0) {
  const g = new THREE.PlaneGeometry(sw, sh);
  _m.compose(_p.set(cx, cy, cz), _q.setFromEuler(_e.set(rx, ry, 0, 'YXZ')), _one);
  g.applyMatrix4(_m);
  place(w, p, g, mat);
}

function wheels(w, p, list, r, width) {
  for (const [lx, lz] of list) ocyl(w, p, lx, r, lz, r, r, width, w.m.rubber, 12, 'z');
}

/**
 * Photoscans baked into a generated map, at most as many as the block bakes: a scanned car or barrier is
 * thousands of triangles in the colour, occlusion and every shadow pass. The rest are drawn from boxes.
 */
const SCAN_CAP = { covered_car: 3, concrete_barrier: 4 };
function useScan(w, id) {
  const used = (w.scansUsed = w.scansUsed || {});
  if ((used[id] || 0) >= (SCAN_CAP[id] ?? 0)) return false;
  used[id] = (used[id] || 0) + 1;
  return true;
}

/** Every collision box of a piece drawn in one material: the shape of a type without its own drawing. */
export function drawPieceShape(w, p, mat) {
  for (const c of PIECE_SHAPES[p.type](p)) drawBox(w, c, mat);
}

/** Draw a collider box as it is. */
function drawBox(w, c, mat) {
  w.box((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2, c.maxX - c.minX, c.maxY - c.minY, c.maxZ - c.minZ, mat, vis);
}

/** A thin layer of snow on top of something, on the winter map. */
function snowCap(w, p, lx, ly, lz, sw, sd) {
  if (!w.snowy) return;
  roundBox(w, p, lx, ly + 0.04, lz, Math.max(0.1, sw), 0.1, Math.max(0.1, sd), 0.045, lookMaterial(w, 'snow'));
}

/** A darker or lighter copy of a material for the parts of a piece. */
const shade = (w, mat, k) => tint(w, mat, [k, k, k]);

/**
 * The same material for small trim that casts no shadow of its own (World._flush leaves materials marked
 * casterProxy out of the shadow mesh): sills, frames, shutters and belts of hundreds of windows would
 * otherwise be drawn into every shadow cascade. The occlusion pass still sees them.
 */
function noShadow(w, mat) {
  const key = 'ns~' + mat.uuid;
  if (!w.m[key]) { const c = mat.clone(); c.userData.casterProxy = true; w.m[key] = c; }
  return w.m[key];
}

// ------------------------------------------------------------------------------------ neon letters

/** Strokes of a few letters on a 4 x 6 grid: [x0, y0, x1, y1]. */
const GLYPHS = {
  'Б': [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 4, 3], [4, 3, 4, 0], [0, 0, 4, 0]],
  'А': [[0, 0, 0, 6], [4, 0, 4, 6], [0, 6, 4, 6], [0, 3, 4, 3]],
  'Р': [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [0, 3, 4, 3]],
  'К': [[0, 0, 0, 6], [0, 3, 2, 3], [2, 3, 4, 6], [2, 3, 4, 0]],
  'Ф': [[2, 0, 2, 6], [0, 2, 4, 2], [0, 5, 4, 5], [0, 2, 0, 5], [4, 2, 4, 5]],
  'Е': [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  'О': [[0, 0, 0, 6], [4, 0, 4, 6], [0, 6, 4, 6], [0, 0, 4, 0]],
  'Т': [[0, 6, 4, 6], [2, 0, 2, 6]],
  'Л': [[0, 0, 1, 6], [1, 6, 4, 6], [4, 6, 4, 0]],
  'Ь': [[0, 0, 0, 6], [0, 3, 4, 3], [4, 3, 4, 0], [0, 0, 4, 0]],
  'И': [[0, 0, 0, 6], [4, 0, 4, 6], [0, 0, 4, 6]],
  'Н': [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  'П': [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0]],
  '2': [[0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [0, 0, 4, 0]],
  '4': [[0, 6, 0, 3], [0, 3, 4, 3], [4, 6, 4, 0]],
};
const WORDS = ['БАР', 'КАФЕ', 'ОТЕЛЬ', 'КИНО', '24', 'АПТЕКА', 'НЕОН'];

/** A word of glowing tubes across a board of width `bw`, centred at height cy, at local z. */
function neonWord(w, p, word, bw, bh, cy, z, mat) {
  const cell = Math.min((bh * 0.62) / 6, (bw * 0.9) / (word.length * 5.4)), th = Math.max(0.05, cell * 0.55);
  const total = word.length * 5.4 * cell - 1.4 * cell;
  let x0 = -total / 2;
  for (const ch of word) {
    for (const [a, b, c, d] of GLYPHS[ch] || []) {
      const ax = x0 + a * cell, ay = cy - 3 * cell + b * cell, bx = x0 + c * cell, by = cy - 3 * cell + d * cell;
      const len = Math.hypot(bx - ax, by - ay) + th;
      obox(w, p, (ax + bx) / 2, (ay + by) / 2, z, len, th, th, mat, 0, 0, Math.atan2(by - ay, bx - ax));
    }
    x0 += 5.4 * cell;
  }
}

// ------------------------------------------------------------------------------------ pieces

/**
 * How each type of piece is drawn (visual only: the colliders come from layoutColliders). Missing types
 * fall back to drawPieceShape. (w, p, mat, index) -> void; mat is lookMaterial(w, p.kind).
 */
export const PIECE_DRAW = {
  container(w, p, mat) {
    const W = p.w, H = p.h, D = p.d, edge = shade(w, mat, 0.72);
    localBox(w, p, 0, 0.02, 0, W - 0.06, H - 0.06, D - 0.06, mat);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08), 0.16, H, 0.16, edge);
    for (const sz of [-1, 1]) {
      localBox(w, p, 0, H - 0.13, sz * (D / 2 - 0.06), W - 0.3, 0.13, 0.12, edge);
      localBox(w, p, 0, 0, sz * (D / 2 - 0.06), W - 0.3, 0.16, 0.12, edge);
    }
    // the doors at the +x end: four locking bars and the seam between the leaves
    for (const k of [-0.62, -0.22, 0.22, 0.62]) localBox(w, p, W / 2 - 0.035, 0.18, k * D / 2, 0.05, H - 0.36, 0.05, edge);
    localBox(w, p, W / 2 - 0.03, 0.12, 0, 0.04, H - 0.24, 0.025, w.m.rubber);
    snowCap(w, p, 0, H, 0, W - 0.1, D - 0.1);
  },
  car(w, p, mat, i) {
    // every third car is left under a tarpaulin when the scan is there (as coveredCar on the block)
    if (i % 3 === 0 && useScan(w, 'covered_car') && w.scan('covered_car', p.x, p.z, quarterOf(p.yaw) % 2 ? QUARTER : 0)) return;
    const L = p.w, D = p.d, dark = shade(w, mat, 0.6);
    localBox(w, p, 0, 0.28, 0, L, 0.5, D, mat);                              // body
    localBox(w, p, 1.35, 0.78, 0, 1.6, 0.12, D, mat);                        // bonnet
    localBox(w, p, -1.55, 0.78, 0, 1.2, 0.12, D, mat);                       // boot
    localBox(w, p, -0.15, 0.78, 0, 2.1, 0.58, D - 0.12, mat);                // cabin
    localBox(w, p, -0.15, 0.93, 0, 2.12, 0.34, D - 0.1, w.m.window);         // glass
    for (const sx of [-1, 1]) localBox(w, p, sx * (L / 2 - 0.05), 0.24, 0, 0.1, 0.2, D - 0.1, w.m.rubber);   // bumpers
    localBox(w, p, 0, 0.18, 0, L - 0.5, 0.12, D - 0.3, dark);                // sills
    wheels(w, p, [[-1.35, -(D / 2 - 0.15)], [1.35, -(D / 2 - 0.15)], [-1.35, D / 2 - 0.15], [1.35, D / 2 - 0.15]], 0.33, 0.22);
    snowCap(w, p, -0.15, 1.36, 0, 1.9, D - 0.25);
    snowCap(w, p, 1.35, 0.9, 0, 1.3, D - 0.25);
  },
  bus(w, p, mat) {
    const W = p.w, H = p.h, D = p.d;
    localBox(w, p, 0, 0.35, 0, W - 0.02, H - 0.4, D - 0.02, mat);
    localBox(w, p, 0, H - 1.3, 0, W, 0.85, D, w.m.window);
    localBox(w, p, 0, H - 0.05, 0, W - 0.3, 0.05, D - 0.2, shade(w, mat, 0.8));
    localBox(w, p, W / 2 - 0.15, 1.0, 0, 0.3, 1.2, D - 0.3, w.m.window);
    const ax = W / 2 - 2;
    wheels(w, p, [[-ax, -D / 2 + 0.25], [ax, -D / 2 + 0.25], [-ax, D / 2 - 0.25], [ax, D / 2 - 0.25]], 0.48, 0.3);
    snowCap(w, p, 0, H, 0, W - 0.4, D - 0.3);
  },
  jersey(w, p, mat) {
    if (useScan(w, 'concrete_barrier') && w.scan('concrete_barrier', p.x, p.z, quarterOf(p.yaw) % 2 === 0 ? 0 : QUARTER)) return;
    const hd = p.d / 2, h = p.h;
    prism(w, p, [[-hd, 0], [hd, 0], [hd, 0.08], [0.15, 0.3], [0.12, h], [-0.12, h], [-0.15, 0.3], [-hd, 0.08]], -p.w / 2, p.w / 2, mat);
    snowCap(w, p, 0, h, 0, p.w - 0.1, 0.2);
  },
  sandbags(w, p) {
    sandbagWall(w, p);
    snowCap(w, p, 0, p.h - 0.02, 0, p.w - 0.2, p.d - 0.2);
  },
  hedgehog(w, p, mat) {
    const y = p.h / 2, L = Math.min(p.w, p.d) * 1.35;
    obox(w, p, 0, y, 0, L, 0.16, 0.16, mat, 0, 0.3, 0.785);
    obox(w, p, 0, y, 0, L, 0.16, 0.16, mat, 0, -0.4, -0.785);
    obox(w, p, 0, y, 0, 0.16, 0.16, L, mat, 0.785, 0, 0);
  },
  dumpster(w, p, mat) {
    const W = p.w, H = p.h, D = p.d;
    localBox(w, p, 0, 0.12, 0, W - 0.06, H - 0.22, D - 0.08, mat);
    localBox(w, p, 0, H - 0.12, 0, W, 0.06, D - 0.02, shade(w, mat, 0.85));
    obox(w, p, 0, H - 0.03, -0.05, W - 0.04, 0.05, D - 0.12, shade(w, mat, 0.7), 0.12);
    for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.04), H * 0.45, 0, 0.08, 0.2, D * 0.5, shade(w, mat, 0.6));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ocyl(w, p, sx * (W / 2 - 0.2), 0.06, sz * (D / 2 - 0.15), 0.06, 0.06, 0.05, w.m.rubber, 8, 'z');
    snowCap(w, p, 0, H, 0, W - 0.1, D - 0.15);
  },
  crate_stack(w, p, mat) {
    const W = p.w, H = p.h, D = p.d;
    localBox(w, p, -W / 4, 0, 0, W / 2 - 0.005, H / 2 - 0.01, D, mat);
    localBox(w, p, W / 4, 0, 0, W / 2 - 0.005, H / 2 - 0.01, D, shade(w, mat, 0.88));
    localBox(w, p, -W / 4, H / 2, 0, W / 2 - 0.01, H / 2, D - 0.02, shade(w, mat, 0.94));
    snowCap(w, p, -W / 4, H, 0, W / 2 - 0.15, D - 0.15);
    snowCap(w, p, W / 4, H / 2, 0, W / 2 - 0.15, D - 0.15);
  },
  pallet(w, p, mat, i) {
    // a pallet with its load: cement sacks under a wrap, or boards, up to the top of the collider
    for (const lx of [-p.w / 2 + 0.06, 0, p.w / 2 - 0.06]) localBox(w, p, lx, 0, 0, 0.1, 0.1, p.d, shade(w, mat, 0.8));
    localBox(w, p, 0, 0.1, 0, p.w, 0.04, p.d, mat);
    const top = p.h - 0.14;
    if (i % 2) localBox(w, p, 0, 0.14, 0, p.w - 0.04, top, p.d - 0.04, w.m.sandbag);
    else for (let k = 0, n = Math.max(1, Math.round(top / 0.06)); k < n; k++) localBox(w, p, 0, 0.14 + (k * top) / n, 0, p.w - 0.02, top / n - 0.008, p.d - 0.02, k % 2 ? mat : shade(w, mat, 0.85));
    snowCap(w, p, 0, p.h, 0, p.w - 0.1, p.d - 0.1);
  },
  fence(w, p, mat) {
    const W = p.w, H = p.h;
    if (p.kind === 'woodFence') {
      for (let k = 0, n = Math.max(1, Math.round(W / 2.5)); k <= n; k++) localBox(w, p, -W / 2 + 0.05 + ((W - 0.1) * k) / n, 0, 0, 0.1, H, 0.1, shade(w, mat, 0.7));
      for (let y = 0.12; y + 0.2 <= H + 0.01; y += 0.28) localBox(w, p, 0, y, 0, W, 0.2, 0.035, mat);
      snowCap(w, p, 0, H, 0, W, 0.1);
      return;
    }
    // steel mesh panels between posts, the posts in concrete feet
    const n = Math.max(1, Math.round(W / 3));
    for (let k = 0; k <= n; k++) {
      const lx = -W / 2 + 0.04 + ((W - 0.08) * k) / n;
      ocyl(w, p, lx, H / 2, 0, 0.03, 0.03, H, mat, 6);
      localBox(w, p, lx, 0, 0, 0.5, 0.14, 0.24, w.m.concreteDark);
    }
    for (const y of [0.12, H - 0.04]) ocyl(w, p, 0, y, 0, 0.022, 0.022, W, mat, 6, 'x');
    const g = new THREE.PlaneGeometry(W, H - 0.16);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W * 1.6, uv.getY(i) * 3);
    g.translate(0, H / 2, 0);
    place(w, p, g, decorMaterials(w).fenceMesh);
  },
  tree(w, p) {
    const conifer = p.kind === 'spruce', h = p.h;
    ocyl(w, p, 0, h * 0.4, 0, 0.12, 0.2, h * 0.8, w.m.trunk, 7);
    if (conifer) {
      // tiers of branches from above head height, each with snow on it on the winter map
      const tiers = 5, r0 = Math.min(p.w / 2, 1.6);
      for (let k = 0; k < tiers; k++) {
        const y0 = 2 + (k * (h - 2.6)) / tiers, r = r0 * (1 - k / (tiers + 0.6)), th = (h - 2) / tiers + 0.9;
        const g = new THREE.ConeGeometry(r, th, 9);
        g.translate(0, y0 + th / 2, 0);
        place(w, p, g, w.m.needles);
        if (w.snowy) {
          const s = new THREE.ConeGeometry(r * 0.82, th * 0.5, 9);
          s.translate(0, y0 + th * 0.62, 0);
          place(w, p, s, lookMaterial(w, 'snow'));
        }
      }
      return;
    }
    const r = Math.min(p.w, p.d) * 0.42, rng = w.rng;
    for (let k = 0; k < 3; k++) obar(w, p, [0, h * 0.45, 0], [(rng() - 0.5) * r * 1.4, h * 0.62, (rng() - 0.5) * r * 1.4], 0.09, w.m.trunk);
    for (const [dx, dy, dz, k] of [[0, 0, 0, 1], [0.6, -0.4, 0.3, 0.75], [-0.5, -0.3, -0.4, 0.8], [0.1, 0.5, -0.3, 0.7]]) {
      const g = new THREE.IcosahedronGeometry(r * k, 1);
      g.translate(dx, Math.max(2.6 + r * k * 0.6, h * 0.68 + dy), dz);
      place(w, p, g, w.m.leaves);
    }
  },
  palm(w, p) {
    const h = p.h, segs = 7;
    for (let k = 0; k < segs; k++) {
      const y = (k * h) / segs, sh = h / segs;
      ocyl(w, p, 0, y + sh / 2, 0, 0.13 + (segs - k) * 0.004, 0.17 + (segs - k) * 0.004, sh, w.m.palmTrunk, 8);
    }
    const crown = new THREE.IcosahedronGeometry(0.42, 0);
    crown.translate(0, h + 0.1, 0);
    place(w, p, crown, w.m.trunk);
    // fronds: three bent leaves of a frond each, drooping more towards the tip
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + (w.rng() - 0.5) * 0.4, ca = Math.cos(a), sa = Math.sin(a);
      let x = 0, y = h + 0.15, z = 0, droop = -0.15 - w.rng() * 0.2;
      for (let s = 0; s < 3; s++) {
        const len = 1.1 - s * 0.12, wd = 0.62 - s * 0.16;
        const dx = Math.cos(droop) * ca * len, dy = Math.sin(droop) * len, dz = -Math.cos(droop) * sa * len;
        obox(w, p, x + dx / 2, y + dy / 2, z + dz / 2, len, 0.03, wd, w.m.fronds, 0, a, droop);
        x += dx; y += dy; z += dz; droop -= 0.35;
      }
    }
  },
  lamp(w, p, mat) {
    const h = p.h;
    ocyl(w, p, 0, h / 2, 0, 0.055, 0.075, h, mat, 8);
    localBox(w, p, 0, 0, 0, 0.16, 0.35, 0.16, mat);
    obox(w, p, 0, h - 0.12, 0.33, 0.05, 0.05, 0.72, mat);
    obox(w, p, 0, h - 0.24, 0.66, 0.3, 0.13, 0.5, w.m.lampHousing);
    obox(w, p, 0, h - 0.31, 0.66, 0.24, 0.025, 0.42, w.m.lampHead);
    w.lampList.push({ x: p.x, z: p.z, fallen: false });
  },
  crane(w, p) {
    const M = lookMaterial(w, p.kind === 'tower' ? 'tower' : 'gantry'), dark = w.m.lampHousing, h = p.h;
    if (p.kind === 'tower') { towerCrane(w, p, M, dark); return; }
    // a ship-to-shore crane: box legs on the quay, the portal, a boom out over the water (local -z)
    const lx = p.w / 2 - 0.5, lz = p.d / 2 - 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) localBox(w, p, sx * lx, 0, sz * lz, 1, h, 1, M);
    for (const sz of [-1, 1]) localBox(w, p, 0, h - 1, sz * lz, p.w, 1, 1, M);
    for (const sx of [-1, 1]) {
      localBox(w, p, sx * lx, h - 1, 0, 1, 1, p.d - 2, M);
      obar(w, p, [sx * lx, h - 1, -lz], [sx * lx, h - 7, lz], 0.35, M);
      obar(w, p, [sx * lx, h - 1, lz], [sx * lx, h - 7, -lz], 0.35, M);
    }
    const z0 = -p.d / 2 - 24, z1 = p.d / 2 + 10, zc = (z0 + z1) / 2;
    for (const sx of [-1, 1]) obox(w, p, sx * 1.6, h + 1.0, zc, 0.8, 1.6, z1 - z0, M);
    for (let z = z0 + 1; z < z1; z += 4) obox(w, p, 0, h + 0.3, z, 3.6, 0.3, 0.3, M);
    for (const sx of [-1, 1]) {
      obar(w, p, [sx * lx, h, -lz], [sx * 1.2, h + 10, 0], 0.5, M);
      obar(w, p, [sx * lx, h, lz], [sx * 1.2, h + 10, 0], 0.5, M);
      obar(w, p, [sx * 1.2, h + 10, 0], [sx * 1.6, h + 1.8, z0 + 2], 0.12, dark);
      obar(w, p, [sx * 1.2, h + 10, 0], [sx * 1.6, h + 1.8, z1 - 2], 0.12, dark);
    }
    obox(w, p, 0, h + 3.4, z1 - 4, 4.6, 3, 5, w.m.paintedWood);               // the machinery house
    obox(w, p, 1.8, h - 0.6, -p.d / 2 - 2, 1.8, 1.8, 2, w.m.window);        // the driver's cab
    const tz = -p.d / 2 - 10;
    obox(w, p, 0, h - 0.2, tz, 3, 0.8, 2.4, dark);                           // trolley
    for (const sx of [-1, 1]) obar(w, p, [sx * 1.2, h - 0.6, tz], [sx * 1.2, 9, tz], 0.04, dark);
    obox(w, p, 0, 8.8, tz, 2.6, 0.4, 6.4, M);                               // the spreader
  },
  tank(w, p, mat) {
    const R = 0.47 * Math.min(p.w, p.d), h = p.h;
    ocyl(w, p, 0, h / 2, 0, R, R, h, mat, 24);
    const roof = new THREE.ConeGeometry(R * 1.01, 0.7, 24);
    roof.translate(0, h + 0.35, 0);
    place(w, p, roof, shade(w, mat, 0.85));
    for (const y of [h * 0.33, h * 0.66]) ocyl(w, p, 0, y, 0, R + 0.03, R + 0.03, 0.12, shade(w, mat, 0.8), 24);
    ocyl(w, p, 0, 0.15, 0, R + 0.01, R + 0.01, 0.3, w.m.concreteDark, 24);
    // a ladder up the +z side and a pipe at the foot, both inside the collision boxes
    const lz = R + 0.16, st = w.m.lampHousing;
    for (const sx of [-0.25, 0.25]) obox(w, p, sx, h / 2 + 0.2, lz, 0.05, h + 0.4, 0.05, st);
    for (let y = 0.4; y < h; y += 0.35) obox(w, p, 0, y, lz, 0.5, 0.03, 0.03, st);
    ocyl(w, p, (R + p.w / 2) / 2, 0.55, 0, 0.16, 0.16, p.w / 2 - R, lookMaterial(w, 'pipe'), 10, 'x');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, ca = Math.cos(a) * (R - 0.05), sa = Math.sin(a) * (R - 0.05);
      obar(w, p, [ca, h + 1.0, sa], [ca, h, sa], 0.04, st);
    }
    if (w.snowy) { const s = new THREE.ConeGeometry(R * 0.96, 0.62, 24); s.translate(0, h + 0.42, 0); place(w, p, s, lookMaterial(w, 'snow')); }
  },
  pipe(w, p, mat) {
    const r = Math.min(p.h, p.d) / 2, cy = p.h - r, pm = p.kind === 'metalGray' ? lookMaterial(w, 'pipe') : mat;
    ocyl(w, p, 0, cy, 0, r * 0.96, r * 0.96, p.w - 0.06, pm, 16, 'x');
    for (let lx = -p.w / 2 + 0.5; lx <= p.w / 2 - 0.4; lx += 3) ocyl(w, p, lx, cy, 0, r * 1.06, r * 1.06, 0.1, shade(w, pm, 0.75), 16, 'x');
    for (const lx of [-p.w / 2 + 0.8, p.w / 2 - 0.8]) localBox(w, p, lx, 0, 0, 0.3, cy - r * 0.5, p.d * 0.9, w.m.concreteDark);
  },
  wagon(w, p, mat) {
    const W = p.w, H = p.h, D = p.d, iron = w.m.lampHousing, tankCar = p.kind === 'tanker';
    for (const sx of [-1, 1]) {
      // a bogie: deep side frames over the wheels fill its box (the collider), the bolster on top
      const bx = sx * (W / 2 - 1.6), hz = 0.4 * D;
      for (const sz of [-1, 1]) localBox(w, p, bx, 0.12, sz * (hz - 0.07), 2.56, 0.86, 0.14, iron);
      localBox(w, p, bx, 0.72, 0, 0.7, 0.28, 0.8 * D - 0.04, iron);
      for (const ax of [-0.85, 0.85]) for (const sz of [-1, 1]) ocyl(w, p, bx + ax, 0.42, sz * 0.72, 0.42, 0.42, 0.12, iron, 14, 'z');
      for (const sz of [-1, 1]) ocyl(w, p, sx * (W / 2 + 0.12), 1.12, sz * 0.75, 0.16, 0.16, 0.25, iron, 8, 'x');   // buffers
    }
    localBox(w, p, 0, 1.0, 0, W - 0.04, 0.26, D - 0.1, iron);
    if (tankCar) {
      const r = 1.45, cy = 2.4;
      ocyl(w, p, 0, cy, 0, r, r, W - 1.4, mat, 22, 'x');
      for (const sx of [-1, 1]) ocyl(w, p, sx * (W / 2 - 0.7), cy, 0, r * 0.9, r, 0.12, shade(w, mat, 0.8), 22, 'x');
      localBox(w, p, 0, 1.26, 0, W - 0.3, 0.05, D - 0.02, w.m.grating || lookMaterial(w, 'grating'));
      ocyl(w, p, 0, cy + r + 0.04, 0, 0.42, 0.46, 0.12, shade(w, mat, 0.8), 14);
      snowCap(w, p, 0, cy + r - 0.15, 0, W - 2, 0.8);
      return;
    }
    // a boxcar: ribbed sides, a sliding door each side, a curved roof
    localBox(w, p, 0, 1.26, 0, W - 0.06, H - 1.6, D - 0.08, mat);
    const top = H - 0.34, hd = D / 2;
    const arc = [];
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI; arc.push([Math.cos(a) * hd, top + Math.sin(a) * 0.32]); }
    prism(w, p, [[-hd, top - 0.02], [hd, top - 0.02], ...arc.slice(1, -1)], -W / 2, W / 2, shade(w, mat, 0.82));
    const door = shade(w, mat, 0.9);
    for (const sz of [-1, 1]) {
      localBox(w, p, 0.4, 1.32, sz * (hd - 0.035), 2.4, H - 1.75, 0.07, door);
      localBox(w, p, 0.4, H - 0.48, sz * (hd - 0.03), 5.4, 0.06, 0.06, iron);
    }
    for (const sx of [-1, 1]) for (let y = 1.5; y < H - 0.5; y += 0.4) localBox(w, p, sx * (W / 2 - 0.03), y, hd - 0.3, 0.05, 0.03, 0.4, iron);
    snowCap(w, p, 0, H - 0.04, 0, W - 0.3, 1.0);
  },
  rail(w, p) {
    localBox(w, p, 0, 0, 0, p.w, 0.012, 3.0, overlay(lookMaterial(w, 'ballast'), -2), { collide: false, structural: true });
    for (const lz of [-0.72, 0.72]) {
      localBox(w, p, 0, 0.07, lz, p.w, 0.06, 0.13, w.m.rail || lookMaterial(w, 'rail'));
      localBox(w, p, 0, 0.13, lz, p.w, 0.05, 0.07, lookMaterial(w, 'rail'));
    }
    for (let lx = -p.w / 2 + 0.4; lx < p.w / 2; lx += 0.9) localBox(w, p, lx, 0, 0, 0.24, 0.07, 2.4, lookMaterial(w, 'sleeper'));
  },
  platform(w, p) {
    const h = p.h, deck = lookMaterial(w, 'grating'), steel = lookMaterial(w, 'steel');
    localBox(w, p, 0, h - 0.25, 0, p.w, 0.25, p.d, deck);
    for (const sz of [-1, 1]) localBox(w, p, 0, h - 0.5, sz * (p.d / 2 - 0.06), p.w, 0.25, 0.12, steel);
    const xs = [-p.w / 2 + 0.25, p.w / 2 - 0.25], zs = [-p.d / 2 + 0.25, p.d / 2 - 0.25];
    if (p.w > 8) xs.push(-p.w / 4, p.w / 4);
    if (p.d > 8) zs.push(-p.d / 4, p.d / 4);
    for (const lx of xs) for (const lz of zs) localBox(w, p, lx, 0, lz, 0.3, h - 0.25, 0.3, steel);
    // knee braces at the end legs, over the heads of anyone walking underneath
    if (h > 3) for (const lz of zs) {
      obar(w, p, [xs[0], h - 0.5, lz], [xs[0] + 1.2, 2.3, lz], 0.08, steel);
      obar(w, p, [xs[1], h - 0.5, lz], [xs[1] - 1.2, 2.3, lz], 0.08, steel);
    }
    snowCap(w, p, 0, h, 0, p.w - 0.2, p.d - 0.2);
  },
  hangar(w, p, mat, i) {
    const W = p.w, H = p.h, D = p.d, inner = w.m.lampHousing, steel = lookMaterial(w, 'steel');
    localBox(w, p, 0, 0, -D / 2 + 0.2, W, H, 0.4, mat);
    for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.2), 0, 0.2, 0.4, H, D - 0.4, mat);
    localBox(w, p, 0, H - 0.4, 0, W, 0.4, D, inner);
    localBox(w, p, 0, H - 1.6, D / 2 - 0.2, W - 0.8, 1.2, 0.4, steel);
    localBox(w, p, 0, 0.012, 0, W - 0.8, 0.02, D - 0.4, w.m.floor, { collide: false, structural: true });
    // the arched roof above the slab, out of reach; the ribs of the sheeting run over the arch
    const c = W + 0.3, s = 2.8, R = (c * c / 4 + s * s) / (2 * s), yc = H + s - R, amax = Math.asin(c / 2 / R), N = 10;
    for (let k = 0; k < N; k++) {
      const a0 = -amax + (2 * amax * k) / N, a1 = a0 + (2 * amax) / N, am = (a0 + a1) / 2;
      const len = 2 * R * Math.sin((a1 - a0) / 2) + 0.04;
      obox(w, p, R * Math.sin(am), yc + R * Math.cos(am) - 0.08, 0, len, 0.16, D + 0.3, mat, 0, 0, -am, true);
    }
    // the arch's end walls: the segment of the circle over the slab, at the back and over the door header
    const prof = [[-c / 2 + 0.2, H], [c / 2 - 0.2, H]];
    for (let k = 1; k < N; k++) { const a = amax - (2 * amax * k) / N; prof.push([R * Math.sin(a), yc + R * Math.cos(a) - 0.12]); }
    const turned = { ...p, yaw: (p.yaw || 0) + QUARTER };
    for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) prism(w, turned, prof, -z - 0.15, -z + 0.15, mat);
    for (const lz of [-D / 4, D / 4]) localBox(w, p, 0, H - 0.9, lz, W - 0.8, 0.5, 0.2, steel);
    const dm = decorMaterials(w), front = localPoint(p, 0, D / 2 + 0.005), yaw = (p.yaw || 0);
    w.quad(dm.stencils[1], front.x, (p.y || 0) + H - 1.0, front.z, 3.2, 1.0, yaw);
    if (i % 2 === 0) for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 1.2), 0, D / 2 - 0.6, 0.2, H - 1.6, 0.2, steel);
  },
  plane(w, p, mat, i) {
    const D = p.d, Wd = p.w, wreck = i % 2 === 0, body = wreck ? tint(w, mat, [0.55, 0.52, 0.5]) : mat;
    const char = w.m.metalChar;
    // a transport: the fuselage fills its collider back to the tail, where the cargo door closes it
    const zt = -D / 2 + 0.06, zn = D / 2 - 1.9;
    ocyl(w, p, 0, 1.7, (zt + zn) / 2, 1.1, 1.1, zn - zt, body, 18, 'z');
    ocyl(w, p, 0, 1.68, zt - 0.02, 1.0, 1.0, 0.04, shade(w, body, 0.7), 18, 'z');
    const nose = new THREE.ConeGeometry(1.1, 1.8, 18); nose.rotateX(QUARTER); nose.translate(0, 1.7, zn + 0.9);
    place(w, p, cylinderUV(nose, 0.6, body), body);
    const nacelle = (sx, m, len) => {
      const g = cylinderUV(new THREE.CylinderGeometry(0.4, 0.37, len, 14), 0.4, m);
      g.rotateX(QUARTER); g.scale(1.45, 1, 1); g.translate(sx * Wd * 0.27, 1.1, D * 0.08);
      place(w, p, g, m);
    };
    obox(w, p, 0, 2.6, D / 2 - 1.9, 1.2, 0.26, 0.8, w.m.window, -0.45);
    for (const sx of [-1, 1]) for (let z = -3.5; z < 3.2; z += 1.1) obox(w, p, sx * 1.07, 1.95, z, 0.06, 0.28, 0.32, w.m.window);
    // wings: a full chord in the middle, narrower tips; the engines under them
    obox(w, p, 0, 1.47, D * 0.05, Wd * 0.5, 0.24, 2.9, body);
    for (const sx of [-1, 1]) obox(w, p, sx * Wd * 0.375, 1.47, D * 0.05 - 0.3, Wd * 0.25, 0.18, 2.0, body);
    for (const sx of [-1, 1]) {
      nacelle(sx, shade(w, body, 0.8), 2.5);
      ocyl(w, p, sx * Wd * 0.27, 1.1, D * 0.08 + 1.24, 0.3, 0.3, 0.04, char, 14, 'z');
    }
    obox(w, p, 0, 2.75, -D / 2 + 1, Math.min(5, Wd), 0.18, 1.6, body);
    obox(w, p, 0, 3.4, -D / 2 + 1.05, 0.2, 1.0, 1.85, body);
    obox(w, p, 0, 4.4, -D / 2 + 0.75, 0.2, 1.0, 1.2, body);
    // landing gear in the gap under the body, where nobody fits
    for (const [gx, gz] of [[0, D / 2 - 2.2], [-1.0, 0.2], [1.0, 0.2]]) {
      ocyl(w, p, gx, 0.42, gz, 0.06, 0.06, 0.7, w.m.lampHousing, 6);
      ocyl(w, p, gx, 0.3, gz, 0.3, 0.3, 0.22, w.m.rubber, 12, 'x');
    }
    if (wreck) {
      // burnt: soot over the fuselage and one engine, a scorched ground under it, scraps around
      ocyl(w, p, 0, 1.7, 0.6, 1.12, 1.12, 2.4, char, 18, 'z');
      nacelle(-1, char, 2.52);
      const rng = w.rng;
      for (let k = 0; k < 14; k++) {
        const a = rng() * TAU, d = 3 + rng() * 4, s = 0.2 + rng() * 0.5;
        obox(w, p, Math.cos(a) * d, s * 0.15, Math.sin(a) * d, s, 0.04, s * 0.7, k % 2 ? char : body, rng() * 0.3, rng() * 3, rng() * 0.3);
      }
      const c = localPoint(p, 0, 0);
      w.crater(c.x, c.z, 4.5);
    }
  },
  tower(w, p, mat) {
    const top = p.h, k = surfaceOf(p.kind || 'wood'), wood = k === 'wood';
    const post = wood ? lookMaterial(w, 'timber') : w.m.concreteDark, deck = wood ? lookMaterial(w, 'timber') : w.m.concrete;
    mat = wood ? shade(w, lookMaterial(w, 'timber'), 0.85) : w.m.concrete;
    const lw = Math.min(p.w, 8), ld = Math.min(p.d, 8);
    const xs = [-lw / 2 + 0.275, lw / 2 - 0.275], zs = [-ld / 2 + 0.275, ld / 2 - 0.275];
    for (const lx of xs) for (const lz of zs) localBox(w, p, lx, 0, lz, 0.35, top - 0.3, 0.35, post);
    for (const lz of zs) { obar(w, p, [xs[0], top - 0.4, lz], [xs[0] + 0.9, 2.3, lz], 0.1, post); obar(w, p, [xs[1], top - 0.4, lz], [xs[1] - 0.9, 2.3, lz], 0.1, post); }
    localBox(w, p, 0, top - 0.3, 0, p.w, 0.3, p.d, deck);
    const gap = 1.6, side = (p.w - gap) / 2;
    localBox(w, p, 0, top, p.d / 2 - 0.08, p.w, 1, 0.16, mat);
    for (const sx of [-1, 1]) localBox(w, p, sx * (p.w / 2 - 0.08), top, 0, 0.16, 1, p.d - 0.32, mat);
    for (const sx of [-1, 1]) localBox(w, p, sx * (p.w / 2 - side / 2), top, -p.d / 2 + 0.08, side, 1, 0.16, mat);
    // the roof on four corner posts, standing in the corners of the parapet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) localBox(w, p, sx * (p.w / 2 - 0.08), top + 1, sz * (p.d / 2 - 0.08), 0.12, 1.5, 0.12, post);
    const roof = new THREE.ConeGeometry(Math.max(p.w, p.d) * 0.82, 1.1, 4);
    roof.rotateY(Math.PI / 4); roof.translate(0, top + 2.5 + 0.55, 0);
    const roofMat = w.snowy ? lookMaterial(w, 'snow') : wood ? shade(w, lookMaterial(w, 'timber'), 0.6) : w.m.concreteDark;
    place(w, p, cylinderUV(roof, 1, roofMat), roofMat);
    obox(w, p, p.w / 2 - 0.4, top + 3.4, 0, 0.06, 1.6, 0.06, w.m.lampHousing);
  },
  stall(w, p, mat, i) {
    const W = p.w, D = p.d, h = p.h, cz = D / 2 - 0.35;
    localBox(w, p, 0, 0, cz, W, 0.95, 0.7, mat);
    localBox(w, p, 0, 0.95, cz, W, 0.05, 0.7, shade(w, mat, 0.7));
    for (const sx of [-1, 1]) {
      localBox(w, p, sx * (W / 2 - 0.1), 0, -D / 2 + 0.1, 0.12, h, 0.12, shade(w, mat, 0.65));
      localBox(w, p, sx * (W / 2 - 0.1), 1.0, D / 2 - 0.1, 0.1, h - 1.25, 0.1, shade(w, mat, 0.65));
    }
    const dm = decorMaterials(w);
    obox(w, p, 0, h - 0.1, 0, W + 0.3, 0.04, D + 0.3, dm.awning[i % dm.awning.length], 0.14);
    const goods = [w.m.fruitA, w.m.fruitB, w.m.fruitC];
    for (let k = 0; k < 3; k++) {
      const lx = -W / 2 + 0.55 + (k * (W - 1.1)) / 2;
      localBox(w, p, lx, 1.0, cz, 0.5, 0.12, 0.38, w.m.woodDark);
      localBox(w, p, lx, 1.12, cz, 0.44, 0.08, 0.32, goods[(i + k) % 3]);
    }
  },
  fountain(w, p, mat) {
    const W = p.w, D = p.d, h = p.h, rim = p.kind === 'well' ? lookMaterial(w, 'well') : lookMaterial(w, 'stone');
    localBox(w, p, 0, 0, -D / 2 + 0.2, W, h, 0.4, rim);
    localBox(w, p, 0, 0, D / 2 - 0.2, W, h, 0.4, rim);
    for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.2), 0, 0, 0.4, h, D - 0.8, rim);
    const cap = shade(w, rim, 0.85);
    localBox(w, p, 0, h, -D / 2 + 0.2, W + 0.06, 0.07, 0.48, cap);
    localBox(w, p, 0, h, D / 2 - 0.2, W + 0.06, 0.07, 0.48, cap);
    for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.2), h, 0, 0.48, 0.07, D - 0.86, cap);
    localBox(w, p, 0, 0, 0, W - 0.8, h * 0.6, D - 0.8, w.snowy ? lookMaterial(w, 'snow') : w.m.water);
    localBox(w, p, 0, 0, 0, 1, 0.5, 1, rim);
    ocyl(w, p, 0, 1.15, 0, 0.3, 0.36, 1.3, rim, 12);
    if (p.kind === 'well') {
      // a stone pump-head with its spout and a bucket; a wooden frame with a pulley over the rim
      ocyl(w, p, 0, 1.95, 0, 0.42, 0.34, 0.5, rim, 12);
      obox(w, p, 0.45, 1.5, 0, 0.12, 0.12, 0.3, w.m.metalGray);
      ocyl(w, p, 0, 0.62, 0.32, 0.14, 0.11, 0.24, w.m.woodDark, 8);
      for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.2), h, 0, 0.14, 1.8, 0.14, w.m.woodDark);
      localBox(w, p, 0, h + 1.8, 0, W - 0.25, 0.14, 0.16, w.m.woodDark);
      return;
    }
    ocyl(w, p, 0, 1.92, 0, 0.6, 0.32, 0.26, rim, 16);
    const spout = new THREE.ConeGeometry(0.16, 0.2, 8); spout.translate(0, 2.13, 0);
    place(w, p, spout, rim);
  },
  scaffold(w, p) {
    const W = p.w, D = p.d, h = p.h, tube = lookMaterial(w, 'steel'), plank = lookMaterial(w, 'pallet');
    const xs = [];
    const n = Math.ceil(W / 2.6) + 1;
    for (let k = 0; k < n; k++) xs.push(-W / 2 + 0.05 + ((W - 0.1) * k) / (n - 1));
    for (const lx of xs) ocyl(w, p, lx, h / 2, D / 2 - 0.05, 0.045, 0.045, h, tube, 6);
    for (const sx of [-1, 1]) ocyl(w, p, sx * (W / 2 - 0.05), h / 2, -D / 2 + 0.05, 0.045, 0.045, h, tube, 6);
    for (let k = 0; k < 3; k++) localBox(w, p, 0, h - 0.1, -D / 2 + (D * (k + 0.5)) / 3, W, 0.05, D / 3 - 0.03, plank);
    localBox(w, p, 0, h - 0.05, -D / 2 + 0.02, W, 0.18, 0.03, plank);
    for (const sz of [-1, 1]) ocyl(w, p, 0, h - 0.22, sz * (D / 2 - 0.05), 0.035, 0.035, W, tube, 6, 'x');
    for (const lx of xs) ocyl(w, p, lx, h - 0.24, 0, 0.035, 0.035, D, tube, 6, 'z');
    for (const sx of [-1, 1]) obar(w, p, [sx * (W / 2 - 0.05), 2.1, -D / 2 + 0.05], [sx * (W / 2 - 0.05), h - 0.3, D / 2 - 0.05], 0.06, tube);
  },
  frame(w, p, mat) {
    const conc = w.m.concrete, cols = (len) => {
      const n = Math.ceil(len / 6) + 1, out = [];
      for (let k = 0; k < n; k++) out.push(-len / 2 + 0.225 + ((len - 0.45) * k) / (n - 1));
      return out;
    };
    const cx = cols(p.w), cz = cols(p.d);
    for (const lx of cx) for (const lz of cz) localBox(w, p, lx, 0, lz, 0.45, p.h, 0.45, conc);
    for (let s = 1; s * STOREY <= p.h + 1e-6; s++) {
      const y = s * STOREY;
      localBox(w, p, 0, y - 0.3, 0, p.w, 0.3, p.d, shade(w, conc, 0.92));
      for (const sz of [-1, 1]) localBox(w, p, 0, y - 0.62, sz * (p.d / 2 - 0.15), p.w, 0.32, 0.3, conc);
      for (const sx of [-1, 1]) localBox(w, p, sx * (p.w / 2 - 0.15), y - 0.62, 0, 0.3, 0.32, p.d - 0.6, conc);
    }
    // starter bars out of the columns on top, props under the top slab, out of reach above the first floor
    const top = Math.floor(p.h / STOREY + 1e-6) * STOREY;
    for (const lx of cx) for (const lz of cz) for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
      obox(w, p, lx + dx, top + 0.5, lz + dz, 0.03, 1.0, 0.03, w.m.rebar);
    }
    if (top >= 3 * STOREY) {
      for (let lx = -p.w / 2 + 1.5; lx < p.w / 2 - 1; lx += 2.2) for (let lz = -p.d / 2 + 1.5; lz < p.d / 2 - 1; lz += 2.4) {
        ocyl(w, p, lx, top - STOREY / 2 - 0.15, lz, 0.04, 0.04, STOREY - 0.3, lookMaterial(w, 'steel'), 6);
      }
    }
    for (let k = 0; k < 4; k++) localBox(w, p, -p.w / 2 + 2 + k * 0.7, 2 * STOREY, p.d / 2 - 1.2, 0.5, 0.25, 2.4, lookMaterial(w, 'pallet'));
  },
  rebar(w, p) {
    const W = p.w, D = p.d;
    // a tied bundle of bars on timbers: the bundle solid, loose bars on top of it
    for (const lx of [-W / 2 + 0.8, W / 2 - 0.8, 0]) localBox(w, p, lx, 0, 0, 0.12, 0.12, D, w.m.woodDark);
    localBox(w, p, 0, 0.12, 0, W - 0.1, p.h - 0.16, D - 0.04, w.m.rebar);
    for (const lx of [-W / 3, 0, W / 3]) localBox(w, p, lx, 0.1, 0, 0.05, p.h - 0.1, D, w.m.metalGray);
    for (let k = 0; k < 6; k++) localBox(w, p, (k % 2) * 0.2, p.h - 0.04, -D / 2 + 0.15 + (k * (D - 0.3)) / 5, W - 0.3, 0.035, 0.035, w.m.rebar);
  },
  stairs(w, p, mat) {
    const n = Math.max(1, Math.ceil(p.h / 0.4 - 1e-9)), t = p.d / n;
    const metal = surfaceOf(p.kind) === 'metal', tread = metal ? lookMaterial(w, 'grating') : mat;
    for (let i = 0; i < n; i++) {
      const top = (p.h * (i + 1)) / n, lz = -p.d / 2 + (i + 0.5) * t;
      localBox(w, p, 0, 0, lz, p.w, top - 0.04, t, mat);
      localBox(w, p, 0, top - 0.04, lz, p.w, 0.04, t, tread);
    }
  },
  wall(w, p, mat) {
    localBox(w, p, 0, 0, 0, p.w, p.h, p.d, mat);
    localBox(w, p, 0, p.h, 0, p.w + 0.06, 0.07, p.d + 0.08, w.m.concrete);
    snowCap(w, p, 0, p.h + 0.07, 0, p.w, p.d);
  },
  adobe_wall(w, p) {
    const hd = p.d / 2, h = p.h, mat = lookMaterial(w, 'adobe');
    prism(w, p, [[-hd, 0], [hd, 0], [hd, h - 0.14], [hd * 0.6, h - 0.03], [0, h], [-hd * 0.6, h - 0.03], [-hd, h - 0.14]], -p.w / 2, p.w / 2, mat);
  },
  rubble(w, p, mat) {
    const tiers = [1, 0.66, 0.33];
    tiers.forEach((k, i) => localBox(w, p, 0, 0, 0, p.w * k, (p.h * (i + 1)) / 3, p.d * k, i % 2 ? w.m.concreteDark : mat));
    const rng = w.rng, r = Math.max(p.w, p.d) / 2;
    w.rubbleSpots.push({ x: p.x, z: p.z, r });
    for (let k = 0; k < 12; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * r * 0.9, s = 0.15 + rng() * 0.4;
      const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
      // the tier under the chunk's outer edge, so that no part of it hangs over a lower tier
      const ex = (Math.abs(lx) + s) / (p.w / 2), ez = (Math.abs(lz) + s) / (p.d / 2), tier = Math.max(ex, ez) < 0.33 ? 3 : Math.max(ex, ez) < 0.66 ? 2 : 1;
      // loose chunks lying on the tiers, sunk into them: nothing stands out of the mound by more than a hand
      obox(w, p, lx, (p.h * tier) / 3 - s * 0.12, lz, s * (0.7 + rng()), s * 0.35, s * (0.7 + rng()), rng() < 0.7 ? w.m.concreteDark : w.m.brickDark, rng() * 0.3, rng() * 3, rng() * 0.3);
    }
    for (let k = 0; k < 3; k++) obox(w, p, (rng() - 0.5) * r * 0.5, p.h + 0.3, (rng() - 0.5) * r * 0.5, 0.03, 0.9, 0.03, w.m.rebar, rng() * 0.6 - 0.3, 0, rng() * 0.6 - 0.3);
    snowCap(w, p, 0, p.h, 0, p.w * 0.33, p.d * 0.33);
  },
  snowbank(w, p, mat) {
    const h = p.h;
    roundBox(w, p, 0, (h / 2 + 0.1) / 2 - 0.1, 0, p.w, h / 2 + 0.1, p.d, 0.22, mat);
    roundBox(w, p, 0, h / 2 - 0.25 + (h / 2 + 0.25) / 2, 0, p.w * 0.6, h / 2 + 0.25, p.d * 0.6, 0.24, mat);
  },
  sign(w, p, mat) {
    const W = p.w, h = p.h, steel = lookMaterial(w, 'steel');
    for (const sx of [-1, 1]) localBox(w, p, sx * W * 0.35, 0, 0, 0.3, h, 0.3, steel);
    localBox(w, p, 0, h * 0.55, 0, W, h * 0.45, 0.25, mat);
    const dm = decorMaterials(w), bh = h * 0.45 - 0.3;
    for (const sz of [-1, 1]) {
      oquad(w, p, 0, h * 0.775, sz * 0.13, W - 0.3, bh, w.m.billboardGlow, sz < 0 ? Math.PI : 0);
      oquad(w, p, 0, h * 0.775, sz * 0.135, W - 0.5, bh - 0.2, dm.posters[1], sz < 0 ? Math.PI : 0);
    }
    for (const lx of [-W / 3, 0, W / 3]) {
      obox(w, p, lx, h + 0.15, 0.5, 0.05, 0.05, 0.6, steel);
      obox(w, p, lx, h + 0.1, 0.78, 0.3, 0.1, 0.16, w.m.lampHead);
    }
  },
  neon(w, p, mat, i) {
    const W = p.w, h = p.h, word = WORDS[i % WORDS.length];
    localBox(w, p, 0, 0, -0.09, W, h, 0.06, w.m.lampHousing);
    neonWord(w, p, word, W - 0.2, h, h / 2, -0.03, mat);
    for (const sx of [-1, 1]) localBox(w, p, sx * (W / 2 - 0.1), -0.25, -0.1, 0.05, 0.25, 0.05, w.m.metalGray);
  },
  water(w, p) {
    localBox(w, p, 0, -0.02, 0, p.w, 0.045, p.d, w.m.water);
  },
  quay(w, p, mat) {
    localBox(w, p, 0, 0, 0, p.w, p.h, p.d, mat);
    localBox(w, p, 0, p.h, 0, p.w, 0.08, p.d + 0.1, lookMaterial(w, 'stone'));
    const stripe = w.m.paintYellow;
    localBox(w, p, 0, p.h + 0.08, 0.1, p.w, 0.01, 0.12, stripe, { collide: false, structural: true });
    for (let lx = -p.w / 2 + 3; lx < p.w / 2; lx += 6) ocyl(w, p, lx, p.h * 0.55, -p.d / 2 - 0.13, 0.42, 0.42, 0.26, w.m.rubber, 14, 'z');
  },
  box(w, p, mat) {
    if (p.kind === 'bollard') {
      ocyl(w, p, 0, 0.26, 0, 0.17, 0.19, 0.52, mat, 12);
      ocyl(w, p, 0, 0.56, 0, 0.24, 0.22, 0.08, mat, 12);
      return;
    }
    if (p.kind === 'bench') {
      // a plaza bench: a concrete block with a slatted wooden top
      localBox(w, p, 0, 0, 0, p.w - 0.04, p.h - 0.08, p.d - 0.04, w.m.concrete);
      for (let k = 0; k < 4; k++) localBox(w, p, 0, p.h - 0.08, -p.d / 2 + (p.d * (k + 0.5)) / 4, p.w, 0.08, p.d / 4 - 0.02, mat);
      return;
    }
    localBox(w, p, 0, 0, 0, p.w, p.h, p.d, mat);
  },
};

/**
 * One sandbag, lighter than the block's (World.sandbagBags): five rings along the bag, six sides round it,
 * gathered at the ends; u along the bag and v round it as the sandbag texture expects, the shade in the
 * vertex colours (the creases at the ties darker). Length along local x, centred.
 */
const BAG_RINGS = [0, 0.1, 0.5, 0.9, 1];
const BAG_SIDES = 6;
const BAG_TINTS = [[1, 1, 1], [1.06, 1.02, 0.92], [0.9, 0.95, 0.84], [0.84, 0.83, 0.82], [0.96, 0.9, 0.82]];
function lowBag(L, W, H, tint) {
  const ring = BAG_SIDES + 1, n = BAG_RINGS.length;
  const pos = [], uv = [], col = [], idx = [];
  const sq = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
  for (let i = 0; i < n; i++) {
    const u = BAG_RINGS[i], e = Math.abs(2 * u - 1), s = Math.pow(Math.max(0, 1 - Math.pow(e, 6)), 0.32), k = 0.72 + 0.28 * s;
    for (let j = 0; j < ring; j++) {
      const phi = -Math.PI / 2 + (TAU * j) / BAG_SIDES;
      pos.push((u - 0.5) * L, sq(Math.sin(phi), 0.55) * (H / 2) * Math.max(s, 0.05), sq(Math.cos(phi), 0.7) * (W / 2) * (0.35 + 0.65 * s));
      uv.push(u, j / BAG_SIDES);
      col.push(tint[0] * k, tint[1] * k, tint[2] * k);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < BAG_SIDES; j++) {
    const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A sandbag wall inside its collider (p.w long, 0.7 thick, 1 m high): rows of bags in two lines, every
 * other row shifted by half a bag and closed by a bag laid across at each end; the shadow maps get a
 * plain block (World.casterProxies), as on the block.
 */
function sandbagWall(w, p) {
  const len = p.w, T = p.d, rng = w.rng, mat = w.m.sandbagBag, ROWS = 5, BAG_H = 0.21, PITCH = (p.h - BAG_H) / (ROWS - 1);
  const proxy = new THREE.BoxGeometry(len - 0.16, p.h - 0.1, T - 0.16).toNonIndexed();
  proxy.translate(0, (p.h - 0.1) / 2, 0);
  proxy.applyMatrix4(frame(p));
  for (const k of Object.keys(proxy.attributes)) if (k !== 'position') proxy.deleteAttribute(k);
  w.casterProxies.push(proxy);
  const n = Math.max(2, Math.round(len / 0.6)), step = len / n;
  const bag = (a, y, c, L, Wd, across) => {
    const t = BAG_TINTS[Math.floor(rng() * BAG_TINTS.length)], k = 0.88 + rng() * 0.2;
    const g = lowBag(L * (0.95 + rng() * 0.08), Wd * (0.94 + rng() * 0.1), BAG_H * (0.9 + rng() * 0.15), [t[0] * k, t[1] * k, t[2] * k]);
    g.rotateZ((rng() - 0.5) * 0.08);
    g.rotateY((across ? QUARTER : 0) + (rng() - 0.5) * 0.09 + (rng() < 0.5 ? Math.PI : 0));
    g.translate(a + (rng() - 0.5) * 0.03, y, c + (rng() - 0.5) * 0.03);
    place(w, p, g, mat);
  };
  for (let r = 0; r < ROWS; r++) {
    const y = BAG_H / 2 + r * PITCH;
    if (r % 2 === 0) {
      for (let i = 0; i < n; i++) for (const c of [-T / 4, T / 4]) bag(-len / 2 + step * (i + 0.5), y, c, step + 0.06, T / 2 + 0.02, false);
    } else {
      for (let i = 0; i < n - 1; i++) for (const c of [-T / 4, T / 4]) bag(-len / 2 + step * (i + 1), y, c, step + 0.06, T / 2 + 0.02, false);
      bag(-len / 2 + step / 4, y, 0, T + 0.04, step / 2 + 0.03, true);
      bag(len / 2 - step / 4, y, 0, T + 0.04, step / 2 + 0.03, true);
    }
  }
}

/** A tower crane: a lattice mast (its collider is the 2 m box round it), the jib, the counter jib, the cab. */
function towerCrane(w, p, M, dark) {
  const h = p.h, c = 0.9, step = 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) localBox(w, p, sx * c, 0, sz * c, 0.2, h, 0.2, M);
  for (let y = step; y < h; y += step) {
    for (const [a, b] of [[[-c, -c], [c, -c]], [[c, -c], [c, c]], [[c, c], [-c, c]], [[-c, c], [-c, -c]]]) {
      obar(w, p, [a[0], y, a[1]], [b[0], y, b[1]], 0.08, M);
      obar(w, p, [a[0], y - step, a[1]], [b[0], y, b[1]], 0.07, M);
    }
  }
  // the foot of the mast is boarded up to above head height (its collider is the whole 2 m box)
  localBox(w, p, 0, 0, 0, 2, 0.35, 2, w.m.concreteDark);
  const board = lookMaterial(w, 'hoarding');
  for (const sz of [-1, 1]) localBox(w, p, 0, 0.35, sz * 0.97, 2, 2.3, 0.06, board);
  for (const sx of [-1, 1]) localBox(w, p, sx * 0.97, 0.35, 0, 0.06, 2.3, 1.88, board);
  localBox(w, p, 0, h - 0.6, 0, 2.4, 0.6, 2.4, M);
  // the jib along local +x: two bottom chords and one on top, braced
  const x0 = 1.2, x1 = p.w - 6;
  for (const sz of [-0.45, 0.45]) obox(w, p, (x0 + x1) / 2, h + 0.05, sz, x1 - x0, 0.12, 0.12, M);
  obox(w, p, (x0 + x1) / 2, h + 1.1, 0, x1 - x0, 0.12, 0.12, M);
  for (let x = x0; x < x1 - 0.5; x += 1.5) {
    obar(w, p, [x, h + 0.05, -0.45], [x + 0.75, h + 1.1, 0], 0.06, M);
    obar(w, p, [x + 0.75, h + 1.1, 0], [x + 1.5, h + 0.05, 0.45], 0.06, M);
  }
  // the counter jib with its concrete weights
  obox(w, p, -4.6, h + 0.1, 0, 7, 0.3, 1.4, M);
  obox(w, p, -7.2, h - 0.9, 0, 1.6, 2.0, 1.6, w.m.concreteDark);
  // the top of the mast and its ties
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) obar(w, p, [sx * c, h, sz * c], [0, h + 5, 0], 0.1, M);
  obar(w, p, [0, h + 5, 0], [x1 - 1, h + 1.1, 0], 0.05, dark);
  obar(w, p, [0, h + 5, 0], [-8, h + 0.2, 0], 0.05, dark);
  obox(w, p, 0.4, h - 1.0, 1.5, 1.6, 1.8, 1.4, w.m.window);
  obox(w, p, 0.4, h - 0.05, 1.5, 1.7, 0.12, 1.5, M);
  // the trolley and the hook with a bundle of bars on it, high over the site
  const tx = x1 * 0.55;
  obox(w, p, tx, h - 0.3, 0, 1, 0.4, 1, dark);
  for (const sz of [-0.2, 0.2]) obar(w, p, [tx, h - 0.5, sz], [tx, 13, sz], 0.03, dark);
  obox(w, p, tx, 12.8, 0, 0.5, 0.5, 0.4, M);
  for (let k = 0; k < 6; k++) obox(w, p, tx, 11.6 + (k % 2) * 0.05, -0.15 + k * 0.06, 5, 0.04, 0.04, w.m.rebar);
}

// ------------------------------------------------------------------------------------ buildings

/** Window trim per map: sills and surrounds, frames, belts between storeys, shutters, roof beams. */
const FACADES = {
  port: { trim: 'concrete', frame: 'woodDark', belts: true },
  factory: { trim: 'concreteDark', frame: 'metalGray', belts: true },
  oldtown: { trim: 'stone', frame: 'woodDark', belts: true, shutters: [0x4a6a50, 0x3c5a78, 0x7a5a3a, 0x6a6a5a] },
  railyard: { trim: 'concreteWarm', frame: 'woodDark', belts: true },
  airfield: { trim: 'concrete', frame: 'metalGray', belts: false },
  winter: { trim: 'paintedWood', frame: 'paintedWood', belts: false, shutters: [0x5a7a9a, 0x7a3a2e, 0x4a6a4a], sillSnow: true },
  night: { trim: 'concreteDark', frame: 'metalChar', belts: true },
  desert: { trim: null, frame: 'woodDark', beams: true },
  construction: { trim: null, frame: null, belts: false },
};

/** Roof colours of the pitched roofs per map (tiles), and what flat roofs are covered with. */
const ROOF_TILES = { oldtown: [0xb5643f, 0x9c5236, 0xc07a52, 0x8a4c38], railyard: [0x5a5652, 0x6a5040, 0x4c4a48] };
const FLAT_ROOF = { desert: 'roofAdobe', winter: 'snow' };

/** Small differences of colour between buildings of the same wall look (linear multipliers). */
const WALL_TINTS = [[1, 1, 1], [0.92, 0.95, 0.98], [1.06, 1.02, 0.95], [0.96, 0.92, 0.88]];

function wallMaterial(w, b, i) {
  const base = lookMaterial(w, b.wall);
  return tint(w, base, WALL_TINTS[i % WALL_TINTS.length]);
}

function roofMaterial(w, L, b, i) {
  if (b.roof === 'pitched') {
    if (w.snowy) return lookMaterial(w, 'snow');
    const list = ROOF_TILES[L.id] || [L.theme.palette.roof || 0x6a5a50];
    const key = 'tiles' + (i % list.length);
    if (!w.m[key]) w.m[key] = pbrMaterial(textureSet(w, 'tiles'), { color: list[i % list.length] });
    return w.m[key];
  }
  return lookMaterial(w, FLAT_ROOF[L.id] || 'roofTar');
}

/**
 * One building of the layout: its walls, floors, roof, parapet and inner wall drawn from its own colliders
 * (buildingColliders: the meshes match them exactly, doors and windows included), a gable roof over a
 * pitched one, the trim of its windows and doors, roof plant out of reach, and the lists the details,
 * the interiors, the scatter and the maps read.
 */
function building(w, L, b, i) {
  const m = w.m, mat = wallMaterial(w, b, i), t = b.thick, H = b.storeys * STOREY;
  const f = { x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2 };
  const roof = roofMaterial(w, L, b, i), slab = lookMaterial(w, 'slab');
  const style = FACADES[L.id] || FACADES.port, trimMat = style.trim ? noShadow(w, m[style.trim] || lookMaterial(w, style.trim)) : null;
  for (const c of buildingColliders(b, i)) {
    const cm = c.part === 'floor' ? slab : c.part === 'roof' ? (b.roof === 'pitched' ? slab : roof) : c.part === 'partition' ? m.plaster : mat;
    drawBox(w, c, cm);
    // a coping along the top of the parapet
    if (c.part === 'parapet' && trimMat) {
      w.box((c.minX + c.maxX) / 2, c.maxY + 0.03, (c.minZ + c.maxZ) / 2, c.maxX - c.minX + 0.08, 0.06, c.maxZ - c.minZ + 0.08, trimMat, vis);
    }
  }
  w.box(b.cx, 0.015, b.cz, b.w - 2 * t, 0.03, b.d - 2 * t, m.floor, { collide: false });
  if (b.roof === 'pitched') pitchedRoof(w, L, b, f, H, mat, roof, i);
  else if (b.roof === 'flat' && !(b.access && b.access.length) && b.storeys >= 2) roofPlant(w, b, H, i);

  const open = buildingOpenings(b);
  facade(w, b, f, H, open, style, mat, i);
  if (w.night) roomLights(w, b, i);

  for (const dr of b.doors) {
    w.doorList.push({ side: dr.side, at: dr.at, width: dr.width, ...f, storeys: b.storeys });
    w.openings.push({ side: dr.side, from: dr.at - dr.width / 2, to: dr.at + dr.width / 2, ...f });
  }
  w.footprints.push(f);
}

/**
 * Trim round the windows and doors and along the walls (drawn only: no colliders). Every wall of a
 * generated building stands whole, so all of it has trim. The windows go into world.windows for the
 * details (soot, curtains, air conditioners).
 */
function facade(w, b, f, H, open, style, wallMat, i) {
  const t = b.thick, m = w.m;
  // trim casts no shadow of its own (the walls do): hundreds of windows would otherwise go into every cascade
  const trimMat = style.trim ? noShadow(w, m[style.trim] || lookMaterial(w, style.trim)) : null;
  const frameMat = style.frame ? noShadow(w, m[style.frame] || lookMaterial(w, style.frame)) : null;
  const beam = noShadow(w, m.woodDark);
  const sides = {
    w: { axis: 'z', face: f.x0, out: -1, a0: f.z0, a1: f.z1 },
    e: { axis: 'z', face: f.x1, out: 1, a0: f.z0, a1: f.z1 },
    n: { axis: 'x', face: f.z0, out: -1, a0: f.x0 + t, a1: f.x1 - t },
    s: { axis: 'x', face: f.z1, out: 1, a0: f.x0 + t, a1: f.x1 - t },
  };
  // a box along a side: centred at `a` along it, at height y; from `inn` metres inside the outer face to
  // `outD` metres outside it (negative: set back into the opening)
  const trim = (S, a, y, along, h, outD, innD, mat) => {
    const across = outD + innD;
    if (!mat || across <= 0.001 || along <= 0.001 || h <= 0.001) return;
    const c = S.face + S.out * (outD - innD) / 2;
    if (S.axis === 'x') w.box(a, y, c, along, h, across, mat, vis);
    else w.box(c, y, a, across, h, along, mat, vis);
  };
  const shutterMat = style.shutters ? (() => {
    const key = 'shutter' + (i % style.shutters.length);
    if (!m[key]) { m[key] = pbrMaterial(w.tex.wood, { color: style.shutters[i % style.shutters.length] }); m[key].userData.casterProxy = true; }
    return m[key];
  })() : null;
  const snow = style.sillSnow ? noShadow(w, lookMaterial(w, 'snow')) : null;

  for (const side of ['n', 's', 'e', 'w']) {
    const S = sides[side];
    for (const o of open[side]) {
      const c = (o.from + o.to) / 2, wd = o.to - o.from, hgt = o.top - o.bottom, midY = (o.top + o.bottom) / 2;
      if (o.kind === 'door') {
        trim(S, o.from - 0.08, hgt / 2, 0.16, hgt, 0.05, 0.02, trimMat || frameMat);
        trim(S, o.to + 0.08, hgt / 2, 0.16, hgt, 0.05, 0.02, trimMat || frameMat);
        trim(S, c, o.top + 0.1, wd + 0.32, 0.2, 0.06, 0.02, trimMat || frameMat);
        continue;
      }
      const r = { side, c, bottom: o.bottom, top: o.top, storey: Math.round((o.bottom - 0.95) / STOREY), ...f, storeys: b.storeys };
      w.windows.push(r);
      if (trimMat) {
        trim(S, c, o.bottom - 0.045, wd + 0.26, 0.09, 0.1, t * 0.6, trimMat);        // sill, lining the reveal floor
        trim(S, c - wd / 2 - 0.07, midY, 0.14, hgt, 0.035, 0.02, trimMat);         // surrounds
        trim(S, c + wd / 2 + 0.07, midY, 0.14, hgt, 0.035, 0.02, trimMat);
        trim(S, c, o.top + 0.1, wd + 0.28, 0.2, 0.055, 0.02, trimMat);              // lintel
      } else if (style.beams) {
        trim(S, c, o.top + 0.08, wd + 0.5, 0.14, 0.04, t * 0.7, beam);             // a timber lintel
      }
      if (snow) trim(S, c, o.bottom + 0.035, wd + 0.2, 0.06, 0.09, -0.01, snow);
      if (frameMat) {
        // what is left of the frame, set back against the edges of the opening (the opening itself, a hole
        // in the collider too, stays clear: the sash and the glass are long gone)
        trim(S, c, o.top - 0.035, wd, 0.07, -0.14, 0.22, frameMat);
        trim(S, c - wd / 2 + 0.03, midY, 0.06, hgt, -0.14, 0.22, frameMat);
        trim(S, c + wd / 2 - 0.03, midY, 0.06, hgt, -0.14, 0.22, frameMat);
      }
      if (shutterMat) for (const s of [-1, 1]) trim(S, c + s * (wd / 2 + 0.36), midY, 0.66, hgt - 0.06, 0.05, 0, shutterMat);
    }
    // belts at every floor and a cornice under the top; ends run over the corners
    const ext = S.axis === 'x' ? t + 0.08 : 0.08, a0 = S.a0 - ext, a1 = S.a1 + ext, mid = (a0 + a1) / 2;
    if (trimMat && style.belts) for (let k = 1; k < b.storeys; k++) trim(S, mid, k * STOREY + 0.02, a1 - a0, 0.16, 0.07, 0.02, trimMat);
    if (trimMat && b.roof) trim(S, mid, H - 0.45, a1 - a0, 0.24, 0.12, 0.02, trimMat);
    if (style.beams && b.roof) {
      for (let k = 1; k <= b.storeys; k++) for (let a = S.a0 + 0.6; a < S.a1 - 0.3; a += 1.1) trim(S, a, k * STOREY - 0.22, 0.16, 0.16, 0.42, 0.1, beam);
    }
  }
}

/** A gable roof over the walls (visual only: the collider is the flat slab under it), ridge along the longer side. */
function pitchedRoof(w, L, b, f, H, wallMat, roofMat, i) {
  const alongX = b.w >= b.d, len = alongX ? b.w : b.d, span = (alongX ? b.d : b.w) / 2 + 0.4;
  const ang = L.id === 'winter' ? 0.68 : L.id === 'oldtown' ? 0.6 : 0.5;
  const rise = Math.tan(ang) * span, slope = span / Math.cos(ang);
  // the frame of the roof: local x along the ridge, local z across it
  const p = { x: b.cx, z: b.cz, y: 0, yaw: alongX ? 0 : QUARTER };
  for (const s of [-1, 1]) obox(w, p, 0, H + rise / 2 + 0.06, (s * span) / 2, len + 0.6, 0.16, slope + 0.02, roofMat, s * ang);
  obox(w, p, 0, H + rise + 0.08, 0, len + 0.62, 0.14, 0.3, w.snowy ? roofMat : shade(w, roofMat, 0.7));
  // the gables: triangles of wall from the eaves to the ridge
  const t = b.thick, hw = (alongX ? b.d : b.w) / 2 - 0.02, rr = Math.tan(ang) * hw;
  for (const end of [-1, 1]) {
    const x = end * (len / 2 - t / 2);
    prism(w, p, [[-hw, H], [hw, H], [0, H + rr]], x - t / 2, x + t / 2, wallMat);
  }
  // eaves boards and a chimney or two
  for (const s of [-1, 1]) obox(w, p, 0, H - 0.05, s * (span - 0.05), len + 0.6, 0.2, 0.08, w.m.woodDark);
  const n = len > 9 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const cx = (n === 1 ? 0.2 : k === 0 ? -0.3 : 0.3) * len, cz = (i % 2 ? 1 : -1) * span * 0.35;
    const hb = H + rise * (1 - Math.abs(cz) / span);
    obox(w, p, cx, hb + 0.45, cz, 0.6, 1.4, 0.6, w.m.brickDark);
    obox(w, p, cx, hb + 1.2, cz, 0.72, 0.1, 0.72, w.snowy ? lookMaterial(w, 'snow') : w.m.concreteDark);
  }
}

/** Plant on a flat roof nobody can reach: air handlers, vents, a water tank, an aerial. */
function roofPlant(w, b, H, i) {
  const p = { x: b.cx, z: b.cz, y: H, yaw: 0 }, rng = w.rng, hw = b.w / 2 - b.thick - 1, hd = b.d / 2 - b.thick - 1;
  if (hw < 1 || hd < 1) return;
  const n = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    const x = (rng() * 2 - 1) * hw * 0.8, z = (rng() * 2 - 1) * hd * 0.8;
    if (k === 0 && i % 3 === 0) {
      for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) localBox(w, p, x + sx, 0, z + sz, 0.1, 1.2, 0.1, w.m.metalGray);
      ocyl(w, p, x, 2.0, z, 0.9, 0.9, 1.6, w.m.woodDark, 12);
      continue;
    }
    localBox(w, p, x, 0, z, 1.4, 0.9, 1.0, w.m.metalGray);
    ocyl(w, p, x + 0.3, 1.0, z, 0.3, 0.3, 0.2, w.m.rubber, 10);
  }
  if (i % 2) ocyl(w, p, hw * 0.7, 2.2, -hd * 0.6, 0.04, 0.05, 4.4, w.m.metalGray, 5);
  ocyl(w, p, -hw * 0.5, 0.4, hd * 0.5, 0.15, 0.15, 0.8, w.m.metalGray, 8);
}

/** Lit ceilings in some rooms of the night map: they show as lit windows from the street. */
function roomLights(w, b, i) {
  const rng = w.rng, t = b.thick;
  for (let s = 0; s < b.storeys; s++) {
    if (rng() > 0.65) continue;
    const y = (s + 1) * STOREY - 0.32 - 0.03;
    w.box(b.cx + (rng() - 0.5) * (b.w - 2 * t) * 0.3, y, b.cz + (rng() - 0.5) * (b.d - 2 * t) * 0.3,
      Math.max(0.6, (b.w - 2 * t) * 0.75), 0.04, Math.max(0.6, (b.d - 2 * t) * 0.75), w.m.roomLight, vis);
  }
}

// ------------------------------------------------------------------------------------ ground

function ground(w, L) {
  const m = w.m;
  const base = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), m.ground);
  base.rotation.x = -Math.PI / 2;
  base.receiveShadow = true;
  const tw = m.ground.userData.texWorld || [3, 3];
  const pos = base.geometry.attributes.position, uv = base.geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tw[0], -pos.getY(i) / tw[1]);
  w.root.add(base);
  // roads: overlapping ones a hair apart in height, so they never flicker
  L.roads.forEach((r, i) => {
    w.box((r.x0 + r.x1) / 2, 0.011 + i * 0.0008, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.022, r.z1 - r.z0, m.road, vis);
  });
  markings(w, L);
  if (L.id === 'night' || L.id === 'construction') puddles(w, L, L.id === 'night' ? 30 : 36);
  if (L.id === 'winter') tracks(w, L);
  if (w.night) lightPools(w, L);
}

/**
 * Pools of lamplight on the street at night: a soft glow added on the ground under every lamp of the
 * layout, in its colour. The renderer lights only the few lamps nearest the camera (gr.setLampLights);
 * these keep the far ones from standing in the dark.
 */
function lightPools(w, L) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const groups = new Map();
  for (const l of L.lamps) {
    let mat = groups.get(l.color);
    if (!mat) {
      mat = overlay(new THREE.MeshBasicMaterial({ map: tex, color: l.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), -4);
      groups.set(l.color, mat);
      w.m['pool' + l.color] = mat;
    }
    const q = new THREE.PlaneGeometry(9, 9);
    q.rotateX(-QUARTER);
    q.translate(l.x, 0.045, l.z);
    w._addGeo(mat, indexed(q));
  }
}

/** Paint on the streets: centre lines, crossings, the runway's marks. */
function markings(w, L) {
  const m = w.m, y = 0.03;
  const paint = (x, z, sx, sz, mat) => w.box(x, y, z, sx, 0.008, sz, mat, vis);
  const dashes = (r, mat, len = 2.4, gap = 2.6, th = 0.14) => {
    const ax = r.x1 - r.x0 >= r.z1 - r.z0, a0 = ax ? r.x0 : r.z0, a1 = ax ? r.x1 : r.z1, c = ax ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    for (let a = a0 + 1.5; a + len < a1 - 1; a += len + gap) ax ? paint(a + len / 2, c, len, th, mat) : paint(c, a + len / 2, th, len, mat);
  };
  if (L.id === 'airfield') {
    const run = L.roads[0], taxi = L.roads[1];
    dashes(run, m.paintWhite, 4, 4, 0.5);
    for (const sz of [-1, 1]) paint(0, (run.z0 + run.z1) / 2 + sz * ((run.z1 - run.z0) / 2 - 0.5), run.x1 - run.x0 - 2, 0.25, m.paintWhite);
    for (const ex of [run.x0 + 3, run.x1 - 3]) for (let z = run.z0 + 1.2; z < run.z1 - 1; z += 1.1) paint(ex, z, 3.2, 0.6, m.paintWhite);
    dashes(taxi, m.paintYellow, 30, 0.1, 0.18);
    return;
  }
  if (L.id === 'port' || L.id === 'factory' || L.id === 'railyard' || L.id === 'night') {
    for (const r of L.roads) if (Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 6) dashes(r, L.id === 'port' ? m.paintYellow : m.paintWhite);
  }
  if (L.id === 'night') {
    // zebra crossings where two avenues meet
    for (let i = 0; i < L.roads.length; i++) for (let j = i + 1; j < L.roads.length; j++) {
      const a = L.roads[i], b = L.roads[j];
      const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
      if (x1 - x0 < 4 || z1 - z0 < 4) continue;
      for (const zz of [z0 - 1.2, z1 + 1.2]) for (let x = x0 + 0.5; x < x1 - 0.3; x += 1) paint(x, zz, 0.5, 1.8, m.paintWhite);
      for (const xx of [x0 - 1.2, x1 + 1.2]) for (let z = z0 + 0.5; z < z1 - 0.3; z += 1) paint(xx, z, 1.8, 0.5, m.paintWhite);
    }
  }
}

/** Is (x, z) clear of solid colliders (with a margin)? */
function clearGround(w, x, z, r) {
  for (const c of w.colliders) {
    if (c.maxY < 0.05) continue;
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
  }
  return Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1;
}

/** Rain water in hollows of the street: flat, mirror-like blots. */
function puddles(w, L, n) {
  const rng = w.rng;
  for (let k = 0, tries = 0; k < n && tries < n * 10; tries++) {
    const r = L.roads[Math.floor(rng() * L.roads.length)];
    const x = r.x0 + rng() * (r.x1 - r.x0), z = r.z0 + rng() * (r.z1 - r.z0);
    if (!clearGround(w, x, z, 0.8)) continue;
    const g = new THREE.CircleGeometry(0.6 + rng() * 1.4, 14);
    const pos = g.attributes.position;
    for (let i = 1; i < pos.count; i++) { const s = 0.75 + rng() * 0.5; pos.setXY(i, pos.getX(i) * s * 1.4, pos.getY(i) * s); }
    g.rotateX(-QUARTER); g.rotateY(rng() * TAU); g.translate(x, 0.034, z);
    w._addGeo(w.m.puddle, indexed(planarUV(g, w.m.puddle)));
    k++;
  }
}

/** Wheel ruts of slush along the snowy roads. */
function tracks(w, L) {
  for (const r of L.roads) {
    const ax = r.x1 - r.x0 >= r.z1 - r.z0, len = ax ? r.x1 - r.x0 : r.z1 - r.z0, c = ax ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
    const mid = ax ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
    for (const off of [-1.6, -0.2, 0.2, 1.6]) {
      if (ax) w.box(mid, 0.032, c + off, len - 1, 0.006, 0.35, w.m.slush, vis);
      else w.box(c + off, 0.032, mid, 0.35, 0.006, len - 1, w.m.slush, vis);
    }
  }
}

// ------------------------------------------------------------------------------------ the edge of the arena

/**
 * The walls round the arena, drawn only (their colliders, 8 m thick and 14 m high, are in layoutColliders).
 * Each side is dressed after the theme's `edge`: houses, warehouses, a ship, stacked containers, a rock
 * face under the forest, a fortress wall, blast walls. Whatever stands in the 8 m band is solid from its
 * inner face at 45 m, at least as high as a player standing on the highest roof could jump.
 */
function perimeter(w, L) {
  const edge = L.theme.edge || {};
  for (const side of ['n', 's', 'e', 'w']) {
    const style = edge[side] || 'town';
    const E = new EdgeSide(w, side);
    const draw = EDGES[style] || EDGES.town;
    draw(E, w, L);
  }
}

/**
 * Drawing in the band of one side: a along the side (x on n/s, z on e/w), t outwards from the inner face
 * (0 at 45 m), y up. The north and south sides take the corners.
 */
class EdgeSide {
  constructor(w, side) {
    this.w = w; this.side = side;
    this.a0 = side === 'n' || side === 's' ? -HALF - 8 : -HALF;
    this.a1 = -this.a0;
  }
  xz(a, t) {
    const s = this.side, d = HALF + t;
    return s === 'n' ? [a, -d] : s === 's' ? [a, d] : s === 'w' ? [-d, a] : [d, a];
  }
  /** A box from t0 outwards `thick`, from y0 up `h`, centred at a. */
  box(a, along, y0, h, t0, thick, mat) {
    const [x, z] = this.xz(a, t0 + thick / 2);
    if (this.side === 'n' || this.side === 's') this.w.box(x, y0 + h / 2, z, along, h, thick, mat, vis);
    else this.w.box(x, y0 + h / 2, z, thick, h, along, mat, vis);
  }
  /** A piece frame at (a, t) whose local +z points into the arena and local +x along the side. */
  frame(a, t, y = 0) {
    const [x, z] = this.xz(a, t);
    const yaw = { n: 0, s: Math.PI, w: QUARTER, e: -QUARTER }[this.side];
    return { x, z, y, yaw };
  }
  /** Rows of windows on the inner face between a0 and a1; some lit at night. */
  windows(a0, a1, y0, rows, lit = 0, t = 0) {
    // flat on the wall: no shadow of their own (the band's walls cast it), so they stay out of the cascades
    const w = this.w, rng = w.rng, glass = noShadow(w, w.m.window), sill = noShadow(w, w.m.concrete), lamp = noShadow(w, w.m.windowLit);
    for (let a = a0 + 1.6; a < a1 - 1.2; a += 3.4) {
      for (let r = 0; r < rows; r++) {
        if (rng() < 0.15) continue;
        const y = y0 + r * STOREY + 1.7, on = rng() < lit;
        this.box(a, 1.3, y - 0.7, 1.4, t - 0.03, 0.06, on ? lamp : glass);
        this.box(a, 1.6, y - 0.82, 0.1, t - 0.12, 0.13, sill);
      }
    }
  }
}

/** Segments of buildings 6 to 8 m long: heights, materials and windows by style. */
function townEdge(E, w, L, o) {
  const rng = w.rng, mats = (o.walls || L.theme.wallKinds || ['concrete']).map((k) => lookMaterial(w, k));
  for (let a = E.a0; a < E.a1 - 0.01;) {
    const len = Math.min(o.len[0] + rng() * (o.len[1] - o.len[0]), E.a1 - a), h = o.h[0] + rng() * (o.h[1] - o.h[0]);
    const mat = tint(w, mats[Math.floor(rng() * mats.length)], WALL_TINTS[Math.floor(rng() * WALL_TINTS.length)]);
    E.box(a + len / 2, len + 0.02, 0, h, 0, 8, mat);
    if (Math.abs(a + len / 2) < HALF + 1) E.windows(a, a + len, 0, Math.floor(h / STOREY), o.lit || 0);
    E.box(a + len / 2, len + 0.02, h - 0.4, 0.3, -0.12, 0.2, noShadow(w, w.m.concrete));
    if (o.pitched) {
      const p = E.frame(a + len / 2, 4, 0), roofMat = roofMaterial(w, L, { roof: 'pitched' }, Math.floor(rng() * 4));
      prism(w, p, [[-4.4, h], [4.4, h], [0, h + 3.2]], -len / 2, len / 2, roofMat);
    }
    a += len;
  }
}

/** What stands round each kind of map. */
const EDGES = {
  town: (E, w, L) => townEdge(E, w, L, { len: [6, 8], h: [10, 17] }),
  warehouses: (E, w, L) => townEdge(E, w, L, { len: [9, 14], h: [8, 12], walls: ['brick', 'corrugated', 'brickDark', 'concrete'] }),
  depots: (E, w, L) => townEdge(E, w, L, { len: [10, 16], h: [8, 12], walls: ['brickDark', 'brick', 'corrugated'] }),
  'old houses': (E, w, L) => townEdge(E, w, L, { len: [6, 9], h: [9, 13], pitched: true }),
  towers: (E, w, L) => townEdge(E, w, L, { len: [8, 14], h: [16, 30], lit: 0.3 }),
  chimneys(E, w, L) {
    townEdge(E, w, L, { len: [10, 16], h: [10, 14], walls: ['brickDark', 'concreteDark', 'corrugated'] });
    for (const [a, t, h] of [[-20, 22, 46], [8, 30, 40], [30, 18, 34]]) {
      const p = E.frame(a, t);
      ocyl(w, p, 0, h / 2, 0, 1.3, 2.1, h, w.m.brickDark, 16);
      for (let k = 0; k < 3; k++) ocyl(w, p, 0, h - 2 - k * 4, 0, 1.38, 1.38, 2, k % 2 ? w.m.chimneyWhite : w.m.chimneyRed, 16);
    }
  },
  tanks(E, w, L) {
    townEdge(E, w, L, { len: [12, 18], h: [8, 10], walls: ['concreteDark', 'corrugated'] });
    for (const [a, t, r, h] of [[-26, 16, 7, 15], [-2, 18, 8, 17], [24, 15, 6.5, 13]]) {
      const p = E.frame(a, t);
      ocyl(w, p, 0, h / 2, 0, r, r, h, lookMaterial(w, 'metalWhite'), 28);
      const cap = new THREE.ConeGeometry(r, 1.4, 28); cap.translate(0, h + 0.7, 0); place(w, p, cap, lookMaterial(w, 'metalWhite'));
    }
  },
  water(E, w) {
    // a cargo ship moored along the side: the hull from the water up, containers on deck, the bridge aft
    const m = w.m, len = E.a1 - E.a0;
    E.box(0, len, -1.2, 3.2, 0, 22, m.hullRed);
    E.box(0, len, 2, 8.6, 0, 22, m.hull);
    E.box(0, len, 10.5, 0.25, 0.1, 21.8, m.lampHousing);
    const cols = [lookMaterial(w, 'containerRed'), lookMaterial(w, 'containerBlue'), lookMaterial(w, 'containerGreen'), lookMaterial(w, 'containerRust')];
    const rng = w.rng;
    for (let a = E.a0 + 4; a < 30; a += 6.3) {
      for (let row = 0; row < 7; row++) {
        const n = 1 + Math.floor(rng() * 2);   // two high at most: the cranes' booms pass over them
        for (let k = 0; k < n; k++) E.box(a + 3.03, 6.06, 10.75 + k * 2.6, 2.58, 1.4 + row * 2.6, 2.42, cols[Math.floor(rng() * 4)]);
      }
    }
    E.box(40, 12, 10.75, 14, 3, 14, m.shipWhite);
    E.box(40, 14, 24.75, 2.6, 2, 18, m.shipWhite);
    E.windows(34, 46, 11, 3, 0, 3);
    E.box(42, 3.4, 24.75, 6, 9, 3.4, m.hullRed);
    // mooring lines down to the quay
    for (let a = E.a0 + 8; a < E.a1 - 4; a += 16) {
      const [x0, z0] = E.xz(a, 0.4), [x1, z1] = E.xz(a + 2, -10.4);
      w.segment(m.rubber, x0, 10.5, z0, x1, 1.4, z1, 0.05);
    }
  },
  containers(E, w) {
    const cols = ['containerRed', 'containerBlue', 'containerGreen', 'containerRust'].map((k) => lookMaterial(w, k));
    const rng = w.rng;
    for (let a = E.a0; a < E.a1 - 2; a += 2.46) {
      const n = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) E.box(a + 1.23, 2.44, k * 2.6, 2.58, 0, 6.06, cols[Math.floor(rng() * 4)]);
      E.box(a + 1.23, 2.44, 0, n * 2.6, 6.1, 1.9, cols[Math.floor(rng() * 4)]);
    }
  },
  tracks(E, w, L) {
    townEdge(E, w, L, { len: [10, 14], h: [10, 13], walls: ['brickDark', 'brick'] });
    // closed shed doors where the tracks run into the wall
    for (const z of [-12, -6.5, -1, 4.5]) {
      E.box(z, 4.4, 0, 5.2, -0.1, 0.12, lookMaterial(w, 'corrugated'));
      E.box(z, 5, 5.2, 0.4, -0.2, 0.2, w.m.concrete);
    }
  },
  fence: (E, w) => blastWalls(E, w),
  field: (E, w) => blastWalls(E, w),
  hangars(E, w) {
    blastWalls(E, w);
    for (let a = E.a0 + 10; a < E.a1 - 10; a += 24) {
      E.box(a, 20, 0, 11, 6, 16, lookMaterial(w, 'corrugated'));
      const p = E.frame(a, 14);
      prism(w, { ...p, yaw: p.yaw + QUARTER }, [[-10, 11], [10, 11], [0, 14]], -8, 8, lookMaterial(w, 'corrugated'));
    }
  },
  forest(E, w) {
    // a cut in a snowy rock slope, fir trees above and behind it
    const rng = w.rng, rock = lookMaterial(w, 'rock'), snow = lookMaterial(w, 'snow');
    for (let a = E.a0; a < E.a1 - 0.01;) {
      const len = 3 + rng() * 4, h = 6 + rng() * 3, step = 1.5 + rng() * 2;
      E.box(a + len / 2, len + 0.05, 0, h, 0, 8, rock);
      E.box(a + len / 2, len + 0.05, h, 0.35, -0.15, 8, snow);
      E.box(a + len / 2, len * 0.8, h, step, 2 + rng() * 2, 6, rock);
      a += len;
    }
    for (let k = 0; k < 26; k++) {
      const a = E.a0 + rng() * (E.a1 - E.a0), t = 3 + rng() * 20, hgt = 8 + rng() * 7;
      PIECE_DRAW.tree(w, { ...E.frame(a, t, 7 + rng() * 2), type: 'tree', kind: 'spruce', w: 3.2, d: 3.2, h: hgt });
    }
  },
  dunes(E, w) {
    // an old mud-brick wall with merlons, dunes and palms beyond
    const rng = w.rng, mud = lookMaterial(w, 'adobe'), sand = lookMaterial(w, 'sandDrift');
    E.box(0, E.a1 - E.a0, 0, 6.4, 0, 8, mud);
    for (let a = E.a0 + 0.5; a < E.a1; a += 2.2) E.box(a + 0.6, 1.2, 6.4, 0.9, 0, 1.2, mud);
    for (let a = E.a0 + 12; a < E.a1 - 6; a += 26) E.box(a, 5, 0, 8.5, 0, 6, shade(w, mud, 0.92));
    for (let k = 0; k < 9; k++) {
      const p = E.frame(E.a0 + rng() * (E.a1 - E.a0), 20 + rng() * 30);
      roundBox(w, p, 0, 0, 0, 18 + rng() * 22, 6 + rng() * 5, 12 + rng() * 10, 4, sand);
    }
  },
  palms(E, w) {
    EDGES.dunes(E, w);
    const rng = w.rng;
    for (let k = 0; k < 10; k++) {
      PIECE_DRAW.palm(w, { ...E.frame(E.a0 + 6 + rng() * (E.a1 - E.a0 - 12), 3 + rng() * 6, 0), type: 'palm', w: 3, d: 3, h: 9 + rng() * 3 });
    }
  },
  'site fence'(E, w, L) {
    townEdge(E, w, L, { len: [7, 10], h: [11, 16] });
    const hoard = lookMaterial(w, 'hoarding');
    for (let a = E.a0; a < E.a1 - 0.01; a += 3) E.box(a + 1.5, 3.02, 0, 3.2, -0.12, 0.1, (Math.floor(a / 3) % 2) ? hoard : shade(w, hoard, 0.9));
  },
};

/** Concrete T-walls along an airfield side: 1.2 m segments, 5 m high, on their wide feet. */
function blastWalls(E, w) {
  const mat = lookMaterial(w, 'blastWall'), dark = shade(w, mat, 0.85);
  for (let a = E.a0; a < E.a1 - 0.01; a += 1.22) {
    E.box(a + 0.61, 1.2, 0, 5.2, 0, 0.5, (Math.floor((a - E.a0) / 1.22) % 3) ? mat : dark);
    E.box(a + 0.61, 1.2, 0, 5.2, 0.5, 7.5, dark);
  }
}

/** Hills on the horizon of the open maps: one ring of terrain, coloured in its vertices, no shadow. */
function horizon(w, L) {
  const looks = {
    winter: [[0.82, 0.84, 0.88], [0.32, 0.36, 0.34], 26],
    desert: [[0.78, 0.6, 0.4], [0.6, 0.44, 0.3], 22],
    airfield: [[0.4, 0.44, 0.32], [0.3, 0.33, 0.28], 14],
  };
  const [top, low, H] = looks[L.id] || looks.airfield;
  const rng = w.rng, N = 120, rings = [[130, -2], [175, 1], [260, 0.55], [330, -1]];
  const phase = [rng() * TAU, rng() * TAU, rng() * TAU];
  const height = (a) => H * (0.55 + 0.25 * Math.sin(a * 3 + phase[0]) + 0.15 * Math.sin(a * 7 + phase[1]) + 0.08 * Math.sin(a * 17 + phase[2]));
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, hh = height(a);
    rings.forEach(([r, k], j) => {
      const y = k > 0 ? hh * k : k;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const c = j === 1 || j === 2 ? top : low;
      col.push(...c);
    });
  }
  const R = rings.length;
  for (let i = 0; i < N; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, w.m.horizon);
  mesh.castShadow = false; mesh.receiveShadow = false;
  w.root.add(mesh);
}

/** Themes whose horizon is a dead city (the block's skyline); fields, forest and dunes get hills. */
const CITY_EDGE = new Set(['port', 'factory', 'oldtown', 'railyard', 'night', 'construction']);

// ------------------------------------------------------------------------------------ fewer draw calls

/**
 * Materials that differ only in their colour become one material with the colour in the vertices: the
 * tints of plaster, brick, metal, fabric and the like cost one draw call per chunk instead of one each.
 * Runs on the batches just before World._flush. Transparent, cut-out, scanned and vertex-coloured
 * materials stay as they are; the old materials stay in world.m (freed with the map).
 */
function mergeTints(w) {
  const sig = (m) => [
    m.type, m.map && m.map.uuid, m.normalMap && m.normalMap.uuid, m.roughnessMap && m.roughnessMap.uuid, m.metalnessMap && m.metalnessMap.uuid,
    m.aoMap && m.aoMap.uuid, m.emissiveMap && m.emissiveMap.uuid, m.emissive.getHex(), m.emissiveIntensity, m.roughness, m.metalness,
    m.side, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.normalScale.x, m.normalScale.y, m.aoMapIntensity,
    m.envMapIntensity, m.opacity, m.depthWrite, m.flatShading, m.fog, JSON.stringify(m.userData),
  ].join('|');
  const groups = new Map();
  for (const [mat, list] of w.batches) {
    if (!list.length || !mat.isMeshStandardMaterial || w.sharedMats.has(mat) || mat.vertexColors || mat.transparent) continue;
    if (mat.alphaTest > 0 || mat.alphaMap) continue;   // shadowless ones (casterProxy) merge among themselves
    const key = sig(mat);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(mat);
  }
  let n = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const target = members[0].clone();
    target.vertexColors = true;
    target.color.setRGB(1, 1, 1);
    const out = [];
    for (const mat of members) {
      const list = w.batches.get(mat), keep = [], c = mat.color;
      for (const g of list) {
        if (!g.index) { keep.push(g); continue; }
        const cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
        for (let i = 0; i < cnt; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        out.push(g);
      }
      if (keep.length) w.batches.set(mat, keep); else w.batches.delete(mat);
    }
    w.batches.set(target, out);
    w.m['~merged' + n++] = target;
  }
  w.mergedLooks = n;
}

// ------------------------------------------------------------------------------------ the map

/**
 * Build a generated map into a fresh World (new World(game, {mapId, seed})): ground, roads and their paint,
 * the dressed perimeter, buildings, pieces, the colliders of layoutColliders, interiors and wall details,
 * the skyline or the hills, the merge (_flush), then crates, barrels, fires, supply points, spawn points
 * and cover. Returns the world.
 */
export function buildGenerated(w, L) {
  w.layout = L;
  w.playerStart = { x: L.playerStart.x, z: L.playerStart.z, yaw: L.playerStart.yaw };
  w.menuView = L.menuView ? { ...L.menuView } : null;
  w.vantage = (L.vantage || []).map((v) => ({ ...v }));
  w.footprints = [];
  w.windows = [];
  w.lampList = [];
  w.doorList = [];
  w.openings = [];
  w.rubbleSpots = [];
  w.items = [];
  w.snowy = L.id === 'winter';
  themeMaterials(w, L);

  // every static collider of the map, first: the interiors and the details look at them
  const cols = layoutColliders(L);
  for (const c of cols) w.addCollider(c);
  w.layoutColliderCount = cols.length;

  ground(w, L);
  perimeter(w, L);
  L.buildings.forEach((b, i) => building(w, L, b, i));
  L.pieces.forEach((p, i) => (PIECE_DRAW[p.type] || drawPieceShape)(w, p, lookMaterial(w, p.kind), i));
  w.debris(L.id === 'winter' ? 40 : 90, -w.half + 1.5, w.half - 1.5, -w.half + 1.5, w.half - 1.5);

  addInteriors(w);
  w.furnitureColliderCount = w.colliders.length - cols.length;
  addDetails(w);
  if (CITY_EDGE.has(L.id)) w.skyline(); else horizon(w, L);
  mergeTints(w);
  w._flush();

  w._places();
  spawns(w, L);
  return w;
}

/** Spawn points of the layout the player can reach from the start, then the cover points. */
function spawns(w, L) {
  const ps = w.playerStart, nav = w.nav;
  const reach = nav.reachableFrom(ps.x, ps.z);
  w.spawnPoints.length = 0;
  for (const s of L.spawns) {
    const p = nav.nearestFree(s.x, s.z, 8);
    if (!p || !reach[nav.idx(nav.toCell(p.x), nav.toCell(p.z))]) continue;
    w.spawnPoints.push(p);
  }
  w.reach = reach;
  w.rebuildCover();
}

/**
 * Crates, barrels, fires and the fixed supply points of a generated map (World._places on such a map):
 * where the layout puts them, each one checked by props.canPlace as on the block.
 */
export function placeLayout(w) {
  const L = w.layout, props = w.game.props;
  for (const c of L.crates) if (props.canPlace(c.x, c.z, c.size * 0.7)) props.addCrate(c.x, c.z, c.size);
  for (const b of L.barrels) if (props.canPlace(b.x, b.z, 0.4)) props.addBarrel(b.x, b.z, b.explosive);
  // fires burn on top of whatever stands there (a wreck, a bus, a barrel)
  L.fires.forEach((f, i) => {
    let y = 0;
    for (const c of w.colliders) {
      if (c.solid && c.maxY < 5 && c.maxY > y && f.x > c.minX && f.x < c.maxX && f.z > c.minZ && f.z < c.maxZ) y = c.maxY;
    }
    w.game.fx.fire(f.x, y + 0.15, f.z, f.s, -1, i < 2);
  });
  // ammo comes back after 25 s, medkits after 35 s (as on the block)
  w.pickupPoints = L.pickups.map((p) => ({ ...(w.nav.nearestFree(p.x, p.z, 12) || { x: p.x, z: p.z }), type: p.type }));
  for (const p of w.pickupPoints) props.spawnPickup(p.type, p.x, p.z, 0, 0, p.type === 'ammo' ? 25 : 35);
  if (w.reach) w.rebuildCover();
}
