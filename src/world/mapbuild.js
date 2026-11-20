// The nine generated maps of wave 15 in the scene. A layout of core/mapgen goes through the same static
// pipeline as the block: World.box / _addGeo, merged per material and 30 m chunk in World._flush, the
// shadow and occlusion shapes from there. The colliders are exactly layoutColliders(layout); the world adds
// only the crates and barrels of the props pools and the furniture of addInteriors.
//
//   buildGenerated(world, layout)    the whole map into an empty World (level.js buildLevel calls it)
//   placeLayout(world)               crates, barrels, fires and supply points of the layout (World._places)
//   PIECE_DRAW[type](world, p, mat)  how a piece of each type is drawn; a type without a row is drawn as its
//                                    collision boxes (PIECE_SHAPES). Add a row to give a type its own shape.
//   lookMaterial(world, kind)        the world's material for a look name of the layout
//
// The look here is a draft: buildings are drawn from their colliders with facades on top, pieces from
// boxes, look names map to the nearest material the block already has. The layout object is shared by
// every build of the map (core/mapgen caches it): nothing here writes into it.

import * as THREE from 'three';
import { layoutColliders, buildingColliders, buildingOpenings, PIECE_SHAPES, STOREY, surfaceOf } from '../core/mapgen.js';
import { MAP_IDS } from '../core/maps.js';
import { pbrMaterial } from '../render/materials.js';
import { addInteriors, addDetails } from './details.js';

const QUARTER = Math.PI / 2;
const TAU = Math.PI * 2;

/** The seed of world.rng per map (looks only: debris, perimeter, interiors, details, skyline). */
export const MAP_SEEDS = Object.fromEntries(MAP_IDS.map((id, i) => [id, 20261010 + 1511 * (i + 1)]));

// ------------------------------------------------------------------------------------ materials

/** The ground of a map and its roads: texture set and colour multipliers, per ground kind of the layout. */
const GROUNDS = {
  asphalt: { set: 'asphalt', tint: [0.95, 0.95, 0.95], road: { set: 'asphalt', tint: [0.8, 0.8, 0.82] } },
  concrete: { set: 'concrete', tint: [0.85, 0.84, 0.82], road: { set: 'asphalt', tint: [0.9, 0.9, 0.9] } },
  cobble: { set: 'concrete', tint: [0.8, 0.76, 0.7], road: { set: 'concrete', tint: [0.62, 0.6, 0.58] } },
  gravel: { set: 'dirt', tint: [0.82, 0.8, 0.78], road: { set: 'asphalt', tint: [0.9, 0.88, 0.86] } },
  grass: { set: 'dirt', tint: [0.62, 0.78, 0.42], road: { set: 'concrete', tint: [0.78, 0.78, 0.76] } },
  snow: { set: 'plaster', tint: [1.32, 1.36, 1.42], road: { set: 'concrete', tint: [1.0, 1.03, 1.08] } },
  sand: { set: 'dirt', tint: [1.42, 1.2, 0.86], road: { set: 'dirt', tint: [1.2, 1.04, 0.78] } },
  dirt: { set: 'dirt', tint: [1, 1, 1], road: { set: 'dirt', tint: [0.8, 0.76, 0.7] } },
};

/** Look names of the layout -> material names of World.m (the draft: the nearest the block already has). */
const LOOK = {
  corrugated: 'corrugated', timber: 'timber', adobe: 'adobe', adobe_wall: 'adobe', metalWhite: 'metalWhite',
  wagonRed: 'containerRed', wagonBrown: 'containerRust', wagonGray: 'metalGray', tanker: 'metalGray',
  planeGray: 'metalGray', planeGreen: 'metalGreen', gantry: 'metalYellow', tower: 'metalYellow', bollard: 'metalYellow',
  bench: 'woodDark', billboard: 'metalChar', woodFence: 'wood', siteFence: 'metalGray', fence: 'metalGray', well: 'concrete',
  crate_stack: 'wood', pallet: 'wood', dumpster: 'metalGreen', hedgehog: 'metalGray', stall: 'wood', snowbank: 'snow',
  palm: 'wood', spruce: 'needles', leafy: 'leaves', water: 'water', rail: 'rail', neonPink: 'neonPink', neonCyan: 'neonCyan',
};
const SURFACE_MAT = { brick: 'brick', plaster: 'plaster', wood: 'wood', sand: 'sandbag', metal: 'metalGray', concrete: 'concrete' };

/** The world's material for a look name of the layout: its own name, the LOOK table, or by its surface. */
export function lookMaterial(w, kind) {
  if (kind && w.m[kind]) return w.m[kind];
  const k = LOOK[kind];
  if (k && w.m[k]) return w.m[k];
  return w.m[SURFACE_MAT[surfaceOf(kind)]] || w.m.concrete;
}

/** A colour scaled so that its brightest channel is `top`: the hue of a palette entry without its darkness. */
function lifted(hex, top = 1) {
  const c = new THREE.Color(hex);
  const k = top / Math.max(c.r, c.g, c.b, 1e-3);
  return c.multiplyScalar(k);
}

/** Materials of the theme, added to world.m (World.dispose frees them with the rest). */
function themeMaterials(w, L) {
  const T = w.tex, m = w.m, pal = L.theme.palette || {};
  const P = (set, o) => pbrMaterial(set, o);
  const times = (mat, k) => { mat.color.r *= k[0]; mat.color.g *= k[1]; mat.color.b *= k[2]; return mat; };
  const overlay = (mat) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2; return mat; };
  const glow = (color, k) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.4 });
  const G = GROUNDS[L.ground && L.ground.kind] || GROUNDS.dirt;
  // the palette's roof colour, half way to a mid grey: the brick set under it is red already
  const roof = lifted(pal.roof ?? 0x555555, 0.8).lerp(new THREE.Color(0.55, 0.55, 0.55), 0.5);
  const accent = new THREE.Color(pal.accent ?? 0xc2462e);
  const add = {
    ground: times(P(T[G.set]), G.tint),
    road: overlay(times(P(T[G.road.set]), G.road.tint)),
    roof: L.theme.roof === 'pitched' ? P(T.brick, { color: roof.getHex() }) : P(T.concrete, { color: 0x8e8a84 }),
    corrugated: P(T.container, { color: 0x8c9196 }),
    adobe: P(T.plaster, { color: 0xd6b48a, patches: false }),
    timber: P(T.wood, { color: 0x9a7a5c }),
    metalWhite: P(T.metal, { color: 0xd0d2cf }),
    snow: times(P(T.plaster), [1.3, 1.34, 1.4]),
    rail: P(T.metal, { color: 0x6a625a }),
    sleeper: P(T.wood, { color: 0x6a5848 }),
    canopy: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.9, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({ color: pal.water ?? 0x1c3a44, roughness: 0.06, metalness: 0.2 }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x45603a, roughness: 0.92 }),
    needles: new THREE.MeshStandardMaterial({ color: 0x2c4a36, roughness: 0.95 }),
    fronds: new THREE.MeshStandardMaterial({ color: 0x55703a, roughness: 0.9, side: THREE.DoubleSide }),
    lampHead: glow(0xffd8a0, 2.4),
    neonPink: glow(0xff4fa0, 3.2),
    neonCyan: glow(0x4fe0ff, 3.2),
  };
  for (const [k, v] of Object.entries(add)) m[k] = v;
  for (const [k, kind] of [['corrugated', 'metal'], ['adobe', 'plaster'], ['timber', 'wood'], ['metalWhite', 'metal'], ['snow', 'sand'],
    ['rail', 'metal'], ['sleeper', 'wood'], ['roof', 'concrete']]) w.kindOf.set(m[k], kind);
}

// ------------------------------------------------------------------------------------ helpers

const vis = { collide: false, structural: true };
const quarterOf = (yaw) => (((Math.round((yaw || 0) / QUARTER)) % 4) + 4) % 4;

/** Draw a collider box as it is. */
function drawBox(w, c, mat) {
  w.box((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2, c.maxX - c.minX, c.maxY - c.minY, c.maxZ - c.minZ, mat, vis);
}

/**
 * A box in the frame of a piece (as lbox in core/mapgen): centre (lx, lz) and bottom ly in local metres,
 * sizes along the local axes; the piece turns it by its quarter-turn yaw and moves it into place.
 */
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

/** A cylinder lying along the local x (along: true) or z axis of a piece. */
function lyingCylinder(w, p, lx, ly, lz, r, len, alongLocalX, mat) {
  const q = quarterOf(p.yaw), alongX = alongLocalX === (q % 2 === 0);
  const g = new THREE.CylinderGeometry(r, r, len, 14);
  if (alongX) g.rotateZ(QUARTER); else g.rotateX(QUARTER);
  const at = localPoint(p, lx, lz);
  g.translate(at.x, (p.y || 0) + ly, at.z);
  w._addGeo(mat, w._uvFix(g));
}

function wheels(w, p, list, r, width) {
  for (const [lx, lz] of list) lyingCylinder(w, p, lx, r, lz, r, width, false, w.m.rubber);
}

/** Every collision box of a piece drawn in one material: the draft shape of any type. */
export function drawPieceShape(w, p, mat) {
  for (const c of PIECE_SHAPES[p.type](p)) drawBox(w, c, mat);
}

// ------------------------------------------------------------------------------------ pieces

/**
 * How each type of piece is drawn (visual only: the colliders come from layoutColliders). Missing types
 * fall back to drawPieceShape. (w, p, mat, index) -> void; mat is lookMaterial(w, p.kind).
 */
export const PIECE_DRAW = {
  car(w, p, mat, i) {
    // every third car is left under a tarpaulin when the scan is there (as coveredCar on the block)
    if (i % 3 === 0 && w.scan('covered_car', p.x, p.z, quarterOf(p.yaw) % 2 ? QUARTER : 0)) return;
    localBox(w, p, 0, 0.2, 0, p.w, 0.7, p.d, mat);
    localBox(w, p, -0.2, 0.83, 0, 2.1, 0.55, 1.6, mat);
    localBox(w, p, -0.2, 0.9, 0, 2.12, 0.4, 1.62, w.m.window);
    wheels(w, p, [[-1.4, -0.82], [1.4, -0.82], [-1.4, 0.82], [1.4, 0.82]], 0.32, 0.22);
  },
  bus(w, p, mat) {
    localBox(w, p, 0, 0.35, 0, p.w, p.h - 0.35, p.d, mat);
    localBox(w, p, 0, p.h - 1.3, 0, p.w + 0.02, 0.85, p.d + 0.02, w.m.window);
    const ax = p.w / 2 - 2;
    wheels(w, p, [[-ax, -p.d / 2 + 0.25], [ax, -p.d / 2 + 0.25], [-ax, p.d / 2 - 0.25], [ax, p.d / 2 - 0.25]], 0.48, 0.3);
  },
  jersey(w, p, mat) {
    const alongX = quarterOf(p.yaw) % 2 === 0;
    if (w.scan('concrete_barrier', p.x, p.z, alongX ? 0 : QUARTER)) return;
    localBox(w, p, 0, 0, 0, p.w, p.h, p.d, mat);
    localBox(w, p, 0, p.h, 0, p.w - 0.1, 0.16, Math.min(0.35, p.d), mat);
  },
  sandbags(w, p) {
    w.sandbagBags(p.x, p.z, p.w, quarterOf(p.yaw) % 2 === 0);
  },
  hedgehog(w, p, mat) {
    const y = (p.y || 0) + p.h / 2, L = Math.min(p.w, p.d) * 1.35;
    w.box(p.x, y, p.z, L, 0.15, 0.15, mat, { ...vis, rz: 0.785 });
    w.box(p.x, y, p.z, L, 0.15, 0.15, mat, { ...vis, rz: -0.785 });
    w.box(p.x, y, p.z, 0.15, 0.15, L, mat, { ...vis, rx: 0.785 });
  },
  dumpster(w, p, mat) {
    drawPieceShape(w, p, mat);
    localBox(w, p, 0, p.h, 0, p.w + 0.05, 0.08, p.d + 0.05, mat);
  },
  fence(w, p, mat) {
    const n = Math.max(1, Math.round(p.w / 2));
    for (let k = 0; k <= n; k++) localBox(w, p, -p.w / 2 + (p.w * k) / n, 0, 0, 0.08, p.h, 0.08, w.m.metalGray);
    for (const y of [0.15, 0.5, 0.85]) localBox(w, p, 0, p.h * y, 0, p.w, 0.05, Math.min(0.05, p.d), mat);
  },
  tree(w, p, mat) {
    const conifer = p.kind === 'spruce';
    localBox(w, p, 0, 0, 0, 0.32, p.h * (conifer ? 0.35 : 0.6), 0.32, w.m.woodDark);
    if (conifer) {
      // stacked cones; the trunk collider runs up through them
      const base = (p.y || 0) + p.h * 0.2;
      [[1.7, 3.2, 0], [1.3, 2.8, 1.8], [0.85, 2.4, 3.4]].forEach(([r, h, y0]) => {
        const g = new THREE.ConeGeometry(Math.min(r, p.w / 2), h, 9);
        g.translate(p.x, base + y0 + h / 2, p.z);
        w._addGeo(w.m.needles, g);
      });
    } else {
      const r = Math.min(p.w, p.d) * 0.42;
      for (const [dx, dy, dz, k] of [[0, 0, 0, 1], [0.6, -0.5, 0.3, 0.7], [-0.5, -0.4, -0.4, 0.75]]) {
        const g = new THREE.IcosahedronGeometry(r * k, 1);
        g.translate(p.x + dx, (p.y || 0) + p.h * 0.66 + dy, p.z + dz);
        w._addGeo(w.m.leaves, g);
      }
    }
  },
  palm(w, p) {
    localBox(w, p, 0, 0, 0, 0.3, p.h, 0.3, w.m.wood);
    const top = (p.y || 0) + p.h;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.3, droop = -0.45, len = 2.6;
      const dx = Math.cos(droop) * Math.cos(a), dy = Math.sin(droop), dz = -Math.cos(droop) * Math.sin(a);
      w.box(p.x + dx * len * 0.5, top + dy * len * 0.5, p.z + dz * len * 0.5, len, 0.04, 0.5, w.m.fronds, { ...vis, ry: a, rz: droop });
    }
  },
  lamp(w, p, mat) {
    localBox(w, p, 0, 0, 0, 0.16, p.h, 0.16, mat);
    localBox(w, p, 0, p.h - 0.15, 0.35, 0.1, 0.08, 0.8, mat);
    localBox(w, p, 0, p.h - 0.3, 0.6, 0.3, 0.14, 0.5, w.m.lampHead);
    w.lampList.push({ x: p.x, z: p.z, fallen: false });
  },
  crane(w, p) {
    const M = w.m.metalYellow;
    drawPieceShape(w, p, M);
    if (p.kind === 'tower') {
      // the jib and the counter jib on top of the mast, the cab under them
      localBox(w, p, p.w / 2 - 6, p.h, 0, p.w, 0.9, 0.9, M);
      localBox(w, p, -4.5, p.h - 1.4, 0, 2.2, 1.4, 1.6, w.m.concreteDark);
      localBox(w, p, 0.4, p.h - 2, 1.4, 1.6, 1.8, 1.6, M);
      localBox(w, p, 0, p.h + 0.9, 0, 0.4, 3.5, 0.4, M);
      return;
    }
    // gantry: two girders over the legs, cross beams at the ends, the trolley in the middle
    for (const sz of [-1, 1]) localBox(w, p, 0, p.h - 1, sz * (p.d / 2 - 0.5), p.w, 1, 0.8, M);
    for (const sx of [-1, 1]) localBox(w, p, sx * (p.w / 2 - 0.5), p.h - 1, 0, 1, 1, p.d - 1.8, M);
    localBox(w, p, 1.5, p.h - 2.6, 0, 2.4, 1.6, p.d - 2.2, w.m.metalGray);
  },
  tank(w, p, mat) {
    // round, inside the plus of its two collision boxes
    const r = Math.min(p.w, p.d) * 0.44;
    w.cylinder(p.x, (p.y || 0) + p.h / 2, p.z, r, p.h, mat, 20);
    localBox(w, p, 0, p.h, 0, r * 1.2, 0.12, r * 1.2, w.m.metalGray);
  },
  pipe(w, p, mat) {
    const r = Math.min(p.h, p.d) / 2;
    lyingCylinder(w, p, 0, (p.h) / 2, 0, r * 0.9, p.w, true, mat);
    for (const lx of [-p.w / 2 + 0.6, p.w / 2 - 0.6]) localBox(w, p, lx, 0, 0, 0.3, p.h * 0.55, p.d, w.m.concreteDark);
  },
  rail(w, p) {
    // two rails on sleepers; no collider
    for (const lz of [-0.72, 0.72]) localBox(w, p, 0, 0, lz, p.w, 0.15, 0.08, w.m.rail);
    for (let lx = -p.w / 2 + 0.4; lx < p.w / 2; lx += 0.9) localBox(w, p, lx, 0, 0, 0.24, 0.07, 2.4, w.m.sleeper);
  },
  rebar(w, p) {
    for (let k = 0; k < 7; k++) localBox(w, p, 0, (k % 3) * 0.12, -p.d / 2 + 0.1 + (k * (p.d - 0.2)) / 6, p.w, 0.05, 0.05, w.m.rebar);
  },
  rubble(w, p, mat) {
    drawPieceShape(w, p, mat);
    const rng = w.rng, r = Math.max(p.w, p.d) / 2;
    w.rubbleSpots.push({ x: p.x, z: p.z, r });
    for (let k = 0; k < 10; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * r * 1.1, s = 0.15 + rng() * 0.4;
      w.box(p.x + Math.cos(a) * d, s * 0.35, p.z + Math.sin(a) * d, s * (0.7 + rng()), s * 0.6, s * (0.7 + rng()),
        rng() < 0.7 ? w.m.concreteDark : w.m.brickDark, { collide: false, rx: rng() * 3, ry: rng() * 3, rz: rng() * 3 });
    }
  },
  stall(w, p, mat) {
    drawPieceShape(w, p, mat);
    localBox(w, p, 0, p.h, 0, p.w + 0.2, 0.06, p.d + 0.2, w.m.canopy);
  },
  fountain(w, p, mat) {
    drawPieceShape(w, p, mat);
    localBox(w, p, 0, 0, 0, p.w - 0.8, p.h * 0.6, p.d - 0.8, w.m.water);
  },
  water(w, p) {
    localBox(w, p, 0, -0.04, 0, p.w, 0.06, p.d, w.m.water);
  },
  neon(w, p, mat) {
    localBox(w, p, 0, 0, 0, p.w, p.h, p.d, mat);
  },
  sign(w, p, mat) {
    drawPieceShape(w, p, mat);
    localBox(w, p, 0, p.h * 0.58, 0.14, p.w - 0.3, p.h * 0.38, 0.04, w.m.canopy);
  },
};

// ------------------------------------------------------------------------------------ buildings

/**
 * One building of the layout: its walls, floors, roof, parapet and inner wall drawn from its own colliders
 * (buildingColliders: the meshes match them exactly, doors and windows included), a pitched roof over a
 * pitched one, facades (sills, frames, belts, cornices: World._facade), and the lists the details, the
 * interiors, the scatter and the maps read.
 */
function building(w, b, i) {
  const m = w.m, mat = lookMaterial(w, b.wall), t = b.thick, H = b.storeys * STOREY;
  const f = { x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2 };
  for (const c of buildingColliders(b, i)) {
    const cm = c.part === 'floor' ? m.concrete : c.part === 'roof' ? m.roof : c.part === 'partition' ? m.plaster : mat;
    drawBox(w, c, cm);
  }
  w.box(b.cx, 0.015, b.cz, b.w - 2 * t, 0.03, b.d - 2 * t, m.floor, { collide: false });
  if (b.roof === 'pitched') pitchedRoof(w, b, f, H, mat);

  // facades: the wall pieces as they stand (full height, the parapet with its gaps for the stairs)
  const top = b.roof === 'flat' && b.parapet > 0 ? H + b.parapet : H;
  const spansOf = (side, a0, a1) => {
    const gaps = top > H ? (b.access || []).filter((a) => a.side === side).map((a) => [a.at - a.width / 2, a.at + a.width / 2]).sort((p, q) => p[0] - q[0]) : [];
    const out = [];
    let s = a0;
    for (const [g0, g1] of gaps) {
      if (g0 > s + 0.05) out.push({ s, e: g0, top, open: false });
      out.push({ s: Math.max(g0, a0), e: Math.min(g1, a1), top: H, open: false });
      s = g1;
    }
    if (a1 > s + 0.05) out.push({ s, e: a1, top, open: false });
    return out;
  };
  const sides = {
    w: { axis: 'z', face: f.x0, out: -1, a0: f.z0, a1: f.z1, spans: spansOf('w', f.z0, f.z1) },
    e: { axis: 'z', face: f.x1, out: 1, a0: f.z0, a1: f.z1, spans: spansOf('e', f.z0, f.z1) },
    n: { axis: 'x', face: f.z0, out: -1, a0: f.x0 + t, a1: f.x1 - t, spans: spansOf('n', f.x0 + t, f.x1 - t) },
    s: { axis: 'x', face: f.z1, out: 1, a0: f.x0 + t, a1: f.x1 - t, spans: spansOf('s', f.x0 + t, f.x1 - t) },
  };
  const open = buildingOpenings(b), wins = [];
  for (const side of ['n', 's', 'e', 'w']) {
    for (const o of open[side]) {
      if (o.kind !== 'window') continue;
      const r = { side, c: (o.from + o.to) / 2, bottom: o.bottom, top: o.top, storey: Math.round((o.bottom - 0.95) / STOREY), ...f, storeys: b.storeys };
      wins.push(r);
      w.windows.push(r);
    }
  }
  w._facade(sides, wins, top, b.storeys, t, mat);

  for (const dr of b.doors) {
    w.doorList.push({ side: dr.side, at: dr.at, width: dr.width, ...f, storeys: b.storeys });
    w.openings.push({ side: dr.side, from: dr.at - dr.width / 2, to: dr.at + dr.width / 2, ...f });
  }
  w.footprints.push(f);
}

/** A gable roof over the walls (visual only: the collider is the flat slab under it), ridge along the longer side. */
function pitchedRoof(w, b, f, H, wallMat) {
  const alongX = b.w >= b.d, L = (alongX ? b.w : b.d) + 0.5, span = (alongX ? b.d : b.w) / 2 + 0.35;
  const ang = 0.5, rise = Math.tan(ang) * span, slope = span / Math.cos(ang);
  for (const s of [-1, 1]) {
    const y = H + rise / 2 + 0.05, off = (s * span) / 2;
    if (alongX) w.box(b.cx, y, b.cz + off, L, 0.16, slope, w.m.roof, { ...vis, rx: s * ang });
    else w.box(b.cx + off, y, b.cz, slope, 0.16, L, w.m.roof, { ...vis, rz: -s * ang });
  }
  // the gable walls, in steps
  const t = b.thick, inner = (alongX ? b.d : b.w) - 0.1, rr = Math.tan(ang) * (inner / 2), N = 4;
  for (let k = 0; k < N; k++) {
    const h = rr / N, wd = inner * (1 - (k + 0.5) / N), y = H + h * (k + 0.5);
    for (const end of [-1, 1]) {
      if (alongX) w.box(end < 0 ? f.x0 + t / 2 : f.x1 - t / 2, y, b.cz, t, h, wd, wallMat, vis);
      else w.box(b.cx, y, end < 0 ? f.z0 + t / 2 : f.z1 - t / 2, wd, h, t, wallMat, vis);
    }
  }
}

// ------------------------------------------------------------------------------------ ground, edge

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
}

/** The walls round the arena, drawn only (their colliders are in layoutColliders), in the theme's wall materials. */
function perimeter(w, L) {
  const rng = w.rng, E = w.half, thick = 8;
  const mats = (L.theme.wallKinds || ['concrete']).map((k) => lookMaterial(w, k));
  for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const fixed = sign * (E + thick / 2);
    for (let a = -E - thick; a < E + thick; a += 7) {
      const len = Math.min(7, E + thick - a) + 0.02, h = 14 + rng() * 4, mat = mats[Math.floor(rng() * mats.length)], mid = a + len / 2;
      if (axis === 'x') w.box(mid, h / 2, fixed, len, h, thick, mat, vis);
      else w.box(fixed, h / 2, mid, thick, h, len, mat, vis);
    }
    w._dummyWindows(axis, sign * E, -E + 1, E - 1, 0, 3, -sign);
  }
}

/** Themes whose horizon is a dead city (the block's skyline); fields, forest and dunes have none. */
const CITY_EDGE = new Set(['port', 'factory', 'oldtown', 'railyard', 'night', 'construction']);

// ------------------------------------------------------------------------------------ the map

/**
 * Build a generated map into a fresh World (new World(game, {mapId, seed})): ground and roads, the drawn
 * perimeter, buildings, pieces, the colliders of layoutColliders, interiors and wall details, the skyline,
 * the merge (_flush), then crates, barrels, fires, supply points, spawn points and cover. Returns the world.
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
  themeMaterials(w, L);

  // every static collider of the map, first: the interiors and the details look at them
  const cols = layoutColliders(L);
  for (const c of cols) w.addCollider(c);
  w.layoutColliderCount = cols.length;

  ground(w, L);
  perimeter(w, L);
  L.buildings.forEach((b, i) => building(w, b, i));
  L.pieces.forEach((p, i) => (PIECE_DRAW[p.type] || drawPieceShape)(w, p, lookMaterial(w, p.kind), i));
  w.debris(90, -w.half + 1.5, w.half - 1.5, -w.half + 1.5, w.half - 1.5);

  addInteriors(w);
  w.furnitureColliderCount = w.colliders.length - cols.length;
  // the details of the block's walls; its one loose prop with a collider (a leaning lamp post at fixed
  // coordinates) stays on the block: nothing here may add colliders beyond the layout's
  w.fits = () => false;
  try { addDetails(w); } finally { delete w.fits; }
  if (CITY_EDGE.has(L.id)) w.skyline();
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
