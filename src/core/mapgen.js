// core/mapgen: the nine generated maps of wave 15 as plain data. Pure: no three.js, no DOM; every map has
// its own seed, so a map comes out the same in every game (and in tests under Node).
//
//   const L = generateLayout('port');     // the whole map: streets, buildings, pieces, loops, spawns...
//   layoutColliders(L)                    // every static collider of it, the only source the game uses
//   mapSchema('port')                     // rectangles and lines for the 2D card in the shop
//
// The arena is the block's: x and z in [-45, 45], walled in by the perimeter. North is -z, east is +x.
//
// Layout = {id, half, theme, atmosphere, playerStart: {x, z, yaw}, ground: {kind}, roads: [rect],
//   buildings: [B], pieces: [P], routes: [routeDef], spawns: [{x, z}], pickups: [{x, z, type}],
//   crates: [{x, z, size}], barrels: [{x, z, explosive}], fires: [{x, z, s}], lamps: [{x, z, y, color}],
//   vantage: [{x, z, y}], menuView: {x, y, z, tx, ty, tz}}
//
// B (a building, the same meaning as the options of World.building in src/world/level.js) =
//   {cx, cz, w, d, storeys, thick, wall, roof, doors: [{side, at, width, height}], partitions, windowEvery,
//    parapet, access: [{side, at, width}]}
//   side 'n' is the wall at z = cz - d/2, 's' at cz + d/2, 'w' at x = cx - w/2, 'e' at cx + w/2; `at` is the
//   world coordinate along that wall (x on n/s, z on w/e). windowEvery 0 means a wall without windows.
//   roof: 'flat' | 'pitched' | null (open to the sky); parapet: height of the low wall round a flat roof,
//   with gaps where stairs arrive (access). buildingOpenings(b) gives the doors and windows of each wall,
//   partitionOf(b) the inner wall; the colliders follow them exactly, so the meshes can too.
//
// P (a piece) = {type, x, z, y, yaw, w, h, d, kind}: centre (x, z), base height y, size w along the local
//   x axis, d along the local z axis, h up; yaw is three.js rotation.y and always a quarter turn, so local
//   +z points to (sin yaw, cos yaw). kind is the look (material) for the world layer. The generator fills
//   every field. PIECE_SHAPES[type](piece) are the colliders of a piece. Water may carry `wall`: the height
//   it is walled off to over its surface (the port's sea), invisible and passed by bullets.
//
// Collider boxes are makeBox boxes (core/collision) plus `part` ('wall' | 'floor' | 'roof' | 'parapet' |
// 'partition' | 'piece' | 'perimeter') and `ref` (index of the building or the piece).

import { makeRng, clamp } from './math.js';
import { makeBox, boxFromMinMax } from './collision.js';
import { NavGrid } from './nav.js';
import { buildRoute, levelRoutes, ROUTE_KEEP_CLEAR } from './routes.js';

const HALF = 45;
/** Everything but the perimeter stays this far inside the arena. */
const LIM = 44.4;
/** Height of one storey, as in src/world/level.js. */
export const STOREY = 3.4;
/** Stairs: no step rises more than this (the body steps up 0.45 m), a tread is this deep. */
const RISE = 0.4, TREAD = 0.5;
const QUARTER = Math.PI / 2;

// ------------------------------------------------------------------------------------------- pieces

/** Every kind of piece a layout may hold. Each one has its collision shape in PIECE_SHAPES. */
export const PIECE_TYPES = [
  'container', 'car', 'bus', 'jersey', 'sandbags', 'hedgehog', 'dumpster', 'crate_stack', 'pallet', 'fence',
  'tree', 'palm', 'lamp', 'crane', 'tank', 'pipe', 'wagon', 'rail', 'platform', 'hangar', 'plane', 'tower',
  'stall', 'fountain', 'scaffold', 'frame', 'rebar', 'stairs', 'wall', 'adobe_wall', 'rubble', 'snowbank',
  'sign', 'neon', 'water', 'quay', 'box',
];

/** Sizes of a piece when the generator gives none: {w, h, d}. */
const SIZES = {
  container: [6.06, 2.6, 2.44], car: [4.3, 1.45, 1.8], bus: [11, 3, 2.5], jersey: [3, 0.8, 0.7], sandbags: [3, 1, 0.7],
  hedgehog: [1.6, 1.2, 1.6], dumpster: [1.9, 1.2, 1.1], crate_stack: [2.2, 2, 1.1], pallet: [1.2, 0.5, 1], fence: [6, 2, 0.1],
  tree: [4, 7, 4], palm: [3, 7, 3], lamp: [0.3, 5.6, 0.3], crane: [12, 16, 9], tank: [6, 7, 6], pipe: [8, 0.9, 0.7],
  wagon: [13, 3.9, 2.9], rail: [88, 0.2, 1.6], platform: [6, 3.4, 3], hangar: [16, 8, 14], plane: [14, 3.4, 12],
  tower: [3.6, 4.4, 3.6], stall: [3, 2.4, 2], fountain: [6, 0.7, 6], scaffold: [8, 3.4, 1.6], frame: [16, 10.2, 12],
  rebar: [6, 0.4, 1.2], stairs: [1.4, 3.4, 4.5], wall: [4, 1, 0.4], adobe_wall: [4, 2.2, 0.4], rubble: [3, 1.2, 2.6],
  snowbank: [3, 0.9, 1.6], sign: [6, 5, 0.4], neon: [2, 1, 0.2], water: [90, 0.1, 10], quay: [88, 1.3, 0.6], box: [1, 1, 1],
};

/** The surface a material kind sounds and splinters like (collider `kind`). */
export function surfaceOf(kind = '') {
  const k = String(kind).toLowerCase();
  if (k.includes('brick')) return 'brick';
  if (k.includes('plaster') || k.includes('adobe') || k.includes('stucco')) return 'plaster';
  if (k.includes('wood') || k.includes('timber') || k.includes('plank')) return 'wood';
  if (k.includes('sand') || k.includes('snow')) return 'sand';
  if (k.includes('metal') || k.includes('container') || k.includes('steel') || k.includes('corrugated')) return 'metal';
  return 'concrete';
}

/** Quarter turns of a yaw, 0..3. */
const quarterOf = (yaw) => (((Math.round((yaw || 0) / QUARTER)) % 4) + 4) % 4;

/**
 * A box in the frame of a piece: centre (lx, lz) and bottom ly in local metres, sizes along the local axes.
 * The piece turns it by its yaw (local x -> (cos, -sin), local z -> (sin, cos)) and moves it into place.
 */
function lbox(p, lx, ly, lz, w, h, d, props = {}) {
  const q = quarterOf(p.yaw), c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
  const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c;
  const ww = q % 2 ? d : w, dd = q % 2 ? w : d;
  return makeBox(x, (p.y || 0) + ly + h / 2, z, ww, h, dd, props);
}
const solidOf = (p, kind) => [lbox(p, 0, 0, 0, p.w, p.h, p.d, { kind })];
/** n positions spread evenly from a to b (both ends included). */
const spread = (a, b, n) => (n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));
/** Corner legs of a deck, plus legs at the quarter points of a long side (the middle stays free for stairs). */
function legsOf(p, size, height, kind) {
  const xs = [-p.w / 2 + size / 2 + 0.1, p.w / 2 - size / 2 - 0.1], zs = [-p.d / 2 + size / 2 + 0.1, p.d / 2 - size / 2 - 0.1];
  if (p.w > 8) xs.push(-p.w / 4, p.w / 4);
  if (p.d > 8) zs.push(-p.d / 4, p.d / 4);
  const out = [];
  for (const lx of xs) for (const lz of zs) out.push(lbox(p, lx, 0, lz, size, height, size, { kind }));
  return out;
}
/** Number of steps of a stair that climbs h metres. */
export const stepsFor = (h) => Math.max(1, Math.ceil(h / RISE - 1e-9));
/** Columns of a concrete frame along one side of length len. */
const frameColumns = (len) => spread(-len / 2 + 0.225, len / 2 - 0.225, Math.ceil(len / 6) + 1);

/** The colliders of every type of piece, from the piece alone (no randomness). */
export const PIECE_SHAPES = {
  container: (p) => solidOf(p, 'metal'),
  car: (p) => [lbox(p, 0, 0, 0, p.w, Math.min(p.h, 0.9), p.d, { kind: 'metal' })],
  bus: (p) => [lbox(p, 0, 0.35, 0, p.w, p.h - 0.35, p.d, { kind: 'metal' })],
  jersey: (p) => solidOf(p, 'concrete'),
  sandbags: (p) => solidOf(p, 'sand'),
  hedgehog: (p) => solidOf(p, 'metal'),
  dumpster: (p) => solidOf(p, 'metal'),
  crate_stack: (p) => [
    lbox(p, 0, 0, 0, p.w, p.h / 2, p.d, { kind: 'wood' }),
    lbox(p, -p.w / 4, p.h / 2, 0, p.w / 2, p.h / 2, p.d, { kind: 'wood' }),
  ],
  pallet: (p) => solidOf(p, 'wood'),
  fence: (p) => [lbox(p, 0, 0, 0, p.w, p.h, p.d, { kind: 'metal', blocksBullets: false })],
  tree: (p) => [lbox(p, 0, 0, 0, 0.5, p.h, 0.5, { kind: 'wood' })],
  palm: (p) => [lbox(p, 0, 0, 0, 0.4, p.h, 0.4, { kind: 'wood' })],
  lamp: (p) => [lbox(p, 0, 0, 0, 0.16, p.h, 0.16, { kind: 'metal', blocksBullets: false })],
  // gantry: four legs (the girder overhead is drawn, not collided); tower crane: the mast
  crane: (p) => (p.kind === 'tower'
    ? [lbox(p, 0, 0, 0, 2, p.h, 2, { kind: 'metal' })]
    : [-1, 1].flatMap((sx) => [-1, 1].map((sz) => lbox(p, sx * (p.w / 2 - 0.5), 0, sz * (p.d / 2 - 0.5), 1, p.h, 1, { kind: 'metal' })))),
  // a round tank as a plus of two boxes
  tank: (p) => [lbox(p, 0, 0, 0, p.w, p.h, p.d * 0.62, { kind: 'metal' }), lbox(p, 0, 0, 0, p.w * 0.62, p.h, p.d, { kind: 'metal' })],
  pipe: (p) => solidOf(p, 'metal'),
  // two bogies under a body that starts 1 m up: bullets pass underneath, people do not
  wagon: (p) => [
    lbox(p, -(p.w / 2 - 1.6), 0, 0, 2.6, 1, p.d * 0.8, { kind: 'metal' }),
    lbox(p, p.w / 2 - 1.6, 0, 0, 2.6, 1, p.d * 0.8, { kind: 'metal' }),
    lbox(p, 0, 1, 0, p.w, p.h - 1, p.d, { kind: 'metal' }),
  ],
  rail: () => [],
  // a deck on legs, its top at y + h; people walk underneath
  platform: (p) => [lbox(p, 0, p.h - 0.25, 0, p.w, 0.25, p.d, { kind: surfaceOf(p.kind) }), ...legsOf(p, 0.3, p.h - 0.25, 'metal')],
  // open towards local +z
  hangar: (p) => [
    lbox(p, 0, 0, -p.d / 2 + 0.2, p.w, p.h, 0.4, { kind: 'metal' }),
    lbox(p, -p.w / 2 + 0.2, 0, 0.2, 0.4, p.h, p.d - 0.4, { kind: 'metal' }),
    lbox(p, p.w / 2 - 0.2, 0, 0.2, 0.4, p.h, p.d - 0.4, { kind: 'metal' }),
    lbox(p, 0, p.h - 0.4, 0, p.w, 0.4, p.d, { kind: 'metal' }),
    lbox(p, 0, p.h - 1.6, p.d / 2 - 0.2, p.w - 0.8, 1.2, 0.4, { kind: 'metal' }),
  ],
  // nose towards local +z, wings along local x; a crouching player fits under the wings
  plane: (p) => [
    lbox(p, 0, 0.6, 0, 2.4, 2.2, p.d, { kind: 'metal' }),
    lbox(p, 0, 1.3, p.d * 0.05, p.w, 0.35, 3, { kind: 'metal' }),
    lbox(p, -p.w * 0.27, 0.7, p.d * 0.08, 1.2, 0.8, 2.6, { kind: 'metal' }),
    lbox(p, p.w * 0.27, 0.7, p.d * 0.08, 1.2, 0.8, 2.6, { kind: 'metal' }),
    lbox(p, 0, 2.6, -p.d / 2 + 1, Math.min(5, p.w), 0.3, 1.8, { kind: 'metal' }),
    lbox(p, 0, 2.9, -p.d / 2 + 1, 0.3, 2, 2, { kind: 'metal' }),
  ],
  // a deck on four legs with a waist-high wall round it, open in the middle of its local -z side
  tower: (p) => {
    const k = surfaceOf(p.kind || 'wood'), top = p.h, gap = 1.6, side = (p.w - gap) / 2;
    return [
      ...legsOf({ ...p, w: Math.min(p.w, 8), d: Math.min(p.d, 8) }, 0.35, top - 0.3, k),
      lbox(p, 0, top - 0.3, 0, p.w, 0.3, p.d, { kind: k }),
      lbox(p, 0, top, p.d / 2 - 0.08, p.w, 1, 0.16, { kind: k }),
      lbox(p, -p.w / 2 + 0.08, top, 0, 0.16, 1, p.d - 0.32, { kind: k }),
      lbox(p, p.w / 2 - 0.08, top, 0, 0.16, 1, p.d - 0.32, { kind: k }),
      lbox(p, -p.w / 2 + side / 2, top, -p.d / 2 + 0.08, side, 1, 0.16, { kind: k }),
      lbox(p, p.w / 2 - side / 2, top, -p.d / 2 + 0.08, side, 1, 0.16, { kind: k }),
    ];
  },
  // a counter at the front (local +z) under a canopy on four thin posts
  stall: (p) => [
    lbox(p, 0, 0, p.d / 2 - 0.35, p.w, 1, 0.7, { kind: 'wood' }),
    ...[-1, 1].map((sx) => lbox(p, sx * (p.w / 2 - 0.1), 0, -p.d / 2 + 0.1, 0.12, p.h, 0.12, { kind: 'wood', blocksBullets: false })),
  ],
  fountain: (p) => [
    lbox(p, 0, 0, -p.d / 2 + 0.2, p.w, p.h, 0.4, { kind: 'concrete' }),
    lbox(p, 0, 0, p.d / 2 - 0.2, p.w, p.h, 0.4, { kind: 'concrete' }),
    lbox(p, -p.w / 2 + 0.2, 0, 0, 0.4, p.h, p.d - 0.8, { kind: 'concrete' }),
    lbox(p, p.w / 2 - 0.2, 0, 0, 0.4, p.h, p.d - 0.8, { kind: 'concrete' }),
    lbox(p, 0, 0, 0, 1, 2.2, 1, { kind: 'concrete' }),
  ],
  // tubes along the wall side (local +z) and at the two outer corners, one plank deck on top
  scaffold: (p) => [
    ...spread(-p.w / 2 + 0.05, p.w / 2 - 0.05, Math.ceil(p.w / 2.6) + 1)
      .map((lx) => lbox(p, lx, 0, p.d / 2 - 0.05, 0.1, p.h, 0.1, { kind: 'metal', blocksBullets: false })),
    ...[-1, 1].map((sx) => lbox(p, sx * (p.w / 2 - 0.05), 0, -p.d / 2 + 0.05, 0.1, p.h, 0.1, { kind: 'metal', blocksBullets: false })),
    lbox(p, 0, p.h - 0.1, 0, p.w, 0.1, p.d, { kind: 'wood' }),
  ],
  // the bare concrete frame of a building: columns and one slab per storey, open sides
  frame: (p) => {
    const out = [];
    for (const lx of frameColumns(p.w)) for (const lz of frameColumns(p.d)) out.push(lbox(p, lx, 0, lz, 0.45, p.h, 0.45, { kind: 'concrete' }));
    for (let s = 1; s * STOREY <= p.h + 1e-6; s++) out.push(lbox(p, 0, s * STOREY - 0.3, 0, p.w, 0.3, p.d, { kind: 'concrete' }));
    return out;
  },
  rebar: (p) => solidOf(p, 'metal'),
  // solid steps climbing towards local +z; the last one is h high
  stairs: (p) => {
    const n = stepsFor(p.h), t = p.d / n, k = surfaceOf(p.kind);
    return Array.from({ length: n }, (_, i) => lbox(p, 0, 0, -p.d / 2 + (i + 0.5) * t, p.w, (p.h * (i + 1)) / n, t, { kind: k }));
  },
  wall: (p) => solidOf(p, surfaceOf(p.kind)),
  adobe_wall: (p) => solidOf(p, 'plaster'),
  // a mound in three tiers, each at most a third of the height: climbable when h <= 1.35
  rubble: (p) => [1, 0.66, 0.33].map((k, i) => lbox(p, 0, 0, 0, p.w * k, (p.h * (i + 1)) / 3, p.d * k, { kind: 'concrete' })),
  snowbank: (p) => [lbox(p, 0, 0, 0, p.w, p.h / 2, p.d, { kind: 'sand' }), lbox(p, 0, 0, 0, p.w * 0.6, p.h, p.d * 0.6, { kind: 'sand' })],
  // a billboard: two posts, the board high above the heads
  sign: (p) => [
    lbox(p, -p.w * 0.35, 0, 0, 0.3, p.h, 0.3, { kind: 'metal' }),
    lbox(p, p.w * 0.35, 0, 0, 0.3, p.h, 0.3, { kind: 'metal' }),
    lbox(p, 0, p.h * 0.55, 0, p.w, p.h * 0.45, 0.25, { kind: 'metal' }),
  ],
  neon: () => [],
  // open water: with p.wall it is walled off over its whole surface up to that height (kept LIM inside the
  // arena like every piece), so nobody jumps down to where the bots cannot follow; bullets fly over it
  water: (p) => {
    if (!(p.wall > 0)) return [];
    const r = pieceRect(p), y = p.y || 0;
    return [boxFromMinMax(Math.max(r.x0, -LIM), y, Math.max(r.z0, -LIM), Math.min(r.x1, LIM), y + p.wall, Math.min(r.z1, LIM),
      { kind: 'concrete', blocksBullets: false })];
  },
  quay: (p) => solidOf(p, 'concrete'),
  box: (p) => solidOf(p, surfaceOf(p.kind)),
};

// ---------------------------------------------------------------------------------------- buildings

const footprint = (b) => ({ x0: b.cx - b.w / 2, x1: b.cx + b.w / 2, z0: b.cz - b.d / 2, z1: b.cz + b.d / 2 });

/** The extent of each wall along its axis: west and east span the depth, north and south fit between. */
function wallSpan(b, side) {
  const f = footprint(b), t = b.thick;
  if (side === 'w' || side === 'e') return [f.z0, f.z1];
  return [f.x0 + t, f.x1 - t];
}

/**
 * Doors and windows of every wall: {n, s, e, w} lists of {from, to, bottom, top, kind}. Windows sit every
 * windowEvery metres on every storey (0.95 to 2.45 m above its floor) and give way to doors.
 */
export function buildingOpenings(b) {
  const out = { n: [], s: [], e: [], w: [] };
  for (const side of ['n', 's', 'e', 'w']) {
    const list = out[side];
    for (const dr of b.doors) {
      if (dr.side === side) list.push({ from: dr.at - dr.width / 2, to: dr.at + dr.width / 2, bottom: 0, top: dr.height, kind: 'door' });
    }
    const spacing = b.windowEvery;
    if (!(spacing > 0)) continue;
    const [a, z] = wallSpan(b, side), len = z - a;
    const count = Math.max(1, Math.floor((len - 2.4) / spacing));
    const pad = (len - (count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      const c = a + pad + i * spacing, from = c - 0.7, to = c + 0.7;
      if (from < a + 0.3 || to > z - 0.3) continue;
      for (let s = 0; s < b.storeys; s++) {
        const bottom = s * STOREY + 0.95, top = s * STOREY + 2.45;
        if (list.some((q) => q.kind === 'door' && q.from < to + 0.3 && q.to > from - 0.3 && q.bottom < top && q.top > bottom)) continue;
        list.push({ from, to, bottom, top, kind: 'window' });
      }
    }
  }
  return out;
}

/**
 * The inner wall of a building with partitions: across the longer side, clear of the outer doors, with a
 * doorway in its middle. {axis: 'x' | 'z', fixed, a0, a1, thick, height, door: {from, to, top}} or null.
 */
export function partitionOf(b) {
  if (!b.partitions) return null;
  const f = footprint(b), t = b.thick, cut = b.w >= b.d ? 'z' : 'x';
  const len = cut === 'z' ? b.w : b.d;
  if (len < 8) return null;
  for (const k of [0, -0.12, 0.12, -0.22, 0.22]) {
    if (cut === 'z') {
      const x = b.cx + k * (b.w - 2 * t);
      if (b.doors.some((dr) => (dr.side === 'n' || dr.side === 's') && Math.abs(dr.at - x) < dr.width / 2 + 1.4)) continue;
      return { axis: 'z', fixed: x, a0: f.z0 + t, a1: f.z1 - t, thick: 0.2, height: STOREY - 0.3, door: { from: b.cz - 1, to: b.cz + 1, top: 2.4 } };
    }
    const z = b.cz + k * (b.d - 2 * t);
    if (b.doors.some((dr) => (dr.side === 'w' || dr.side === 'e') && Math.abs(dr.at - z) < dr.width / 2 + 1.4)) continue;
    return { axis: 'x', fixed: z, a0: f.x0 + t, a1: f.x1 - t, thick: 0.2, height: STOREY - 0.3, door: { from: b.cx - 1, to: b.cx + 1, top: 2.4 } };
  }
  return null;
}

/**
 * Boxes of a wall along `axis` ('x': runs along x at z = fixed) from a0 to a1, y0 to y1, with openings cut
 * out. Neighbouring spans with the same cut-outs merge into one box.
 */
function wallBoxes(axis, fixed, a0, a1, thick, y0, y1, openings, props) {
  const cuts = new Set([a0, a1]);
  for (const o of openings) { cuts.add(clamp(o.from, a0, a1)); cuts.add(clamp(o.to, a0, a1)); }
  const xs = [...cuts].sort((p, q) => p - q);
  const runs = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const s = xs[i], e = xs[i + 1];
    if (e - s < 0.02) continue;
    const mid = (s + e) / 2;
    const holes = openings.filter((o) => o.from <= mid && o.to >= mid).sort((p, q) => p.bottom - q.bottom);
    const solid = [];
    let cur = y0;
    for (const o of holes) {
      const hb = y0 + o.bottom, ht = y0 + o.top;
      if (hb > cur + 0.02) solid.push([cur, Math.min(hb, y1)]);
      cur = Math.max(cur, ht);
      if (cur >= y1) break;
    }
    if (y1 > cur + 0.02) solid.push([cur, y1]);
    const key = solid.map((v) => v.join(':')).join('|');
    const last = runs[runs.length - 1];
    if (last && last.key === key && Math.abs(last.e - s) < 1e-9) last.e = e;
    else runs.push({ s, e, key, solid });
  }
  const out = [];
  for (const r of runs) {
    for (const [lo, hi] of r.solid) {
      if (hi - lo < 0.02) continue;
      if (axis === 'x') out.push(boxFromMinMax(r.s, lo, fixed - thick / 2, r.e, hi, fixed + thick / 2, props));
      else out.push(boxFromMinMax(fixed - thick / 2, lo, r.s, fixed + thick / 2, hi, r.e, props));
    }
  }
  return out;
}

/** All colliders of one building: outer walls with their doors and windows, floors, roof, parapet, inner wall. */
export function buildingColliders(b, ref = 0) {
  const f = footprint(b), t = b.thick, H = b.storeys * STOREY, kind = surfaceOf(b.wall);
  const open = buildingOpenings(b);
  const wall = { kind, part: 'wall', ref };
  const out = [
    ...wallBoxes('z', f.x0 + t / 2, f.z0, f.z1, t, 0, H, open.w, wall),
    ...wallBoxes('z', f.x1 - t / 2, f.z0, f.z1, t, 0, H, open.e, wall),
    ...wallBoxes('x', f.z0 + t / 2, f.x0 + t, f.x1 - t, t, 0, H, open.n, wall),
    ...wallBoxes('x', f.z1 - t / 2, f.x0 + t, f.x1 - t, t, 0, H, open.s, wall),
  ];
  const slab = (y, part) => out.push(boxFromMinMax(f.x0 + t, y - 0.3, f.z0 + t, f.x1 - t, y, f.z1 - t, { kind: 'concrete', part, ref }));
  for (let s = 1; s < b.storeys; s++) slab(s * STOREY, 'floor');
  if (b.roof) slab(H, 'roof');
  if (b.roof === 'flat' && b.parapet > 0) {
    const gaps = (side) => (b.access || []).filter((a) => a.side === side)
      .map((a) => ({ from: a.at - a.width / 2, to: a.at + a.width / 2, bottom: 0, top: b.parapet + 1 }));
    const par = { kind, part: 'parapet', ref };
    out.push(
      ...wallBoxes('z', f.x0 + t / 2, f.z0, f.z1, t, H, H + b.parapet, gaps('w'), par),
      ...wallBoxes('z', f.x1 - t / 2, f.z0, f.z1, t, H, H + b.parapet, gaps('e'), par),
      ...wallBoxes('x', f.z0 + t / 2, f.x0 + t, f.x1 - t, t, H, H + b.parapet, gaps('n'), par),
      ...wallBoxes('x', f.z1 - t / 2, f.x0 + t, f.x1 - t, t, H, H + b.parapet, gaps('s'), par),
    );
  }
  const pt = partitionOf(b);
  if (pt) {
    out.push(...wallBoxes(pt.axis, pt.fixed, pt.a0, pt.a1, pt.thick, 0, pt.height,
      [{ from: pt.door.from, to: pt.door.to, bottom: 0, top: pt.door.top }], { kind: 'plaster', part: 'partition', ref }));
  }
  return out;
}

/** The walls round the arena: their inner faces stand on +-45, as on the block. */
function perimeterColliders() {
  const T = 8, Y = 14, E = HALF;
  const p = { kind: 'concrete', part: 'perimeter', ref: -1 };
  return [
    boxFromMinMax(-E - T, 0, -E - T, E + T, Y, -E, p),
    boxFromMinMax(-E - T, 0, E, E + T, Y, E + T, p),
    boxFromMinMax(-E - T, 0, -E, -E, Y, E, p),
    boxFromMinMax(E, 0, -E, E + T, Y, E, p),
  ];
}

/** Colliders of one piece, tagged with its index. */
function pieceColliders(p, ref) {
  return PIECE_SHAPES[p.type](p).map((c) => Object.assign(c, { part: 'piece', ref }));
}

/**
 * Every static collider of a generated map: perimeter, buildings, pieces. The crates and barrels of the
 * layout are not in it (they are props with an owner), nor the furniture the world layer adds inside.
 * A new list of new boxes on every call.
 */
export function layoutColliders(layout) {
  return [
    ...perimeterColliders(),
    ...layout.buildings.flatMap((b, i) => buildingColliders(b, i)),
    ...layout.pieces.flatMap((p, i) => pieceColliders(p, i)),
  ];
}

// ------------------------------------------------------------------------------------------- schema

/** The block's ten buildings and two streets as rectangles (src/world/level.js, World.build). */
const BLOCK_HOUSES = [
  [-27, -28, 22, 16], [28, -27, 18, 14], [35, -14, 10, 8], [-30, 26, 18, 10], [-38, 16, 8, 10],
  [-15, 20, 8, 8], [29, 28, 20, 14], [14, 16, 8, 7], [-14, -16, 8, 8], [14, -17, 7, 7],
];

/** Points of a built loop every `step` metres, rounded to centimetres. */
function routeLine(route, step = 2) {
  const out = [], p = {};
  for (let s = 0; s < route.length; s += step) { route.sample(s, p); out.push([Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100]); }
  return out;
}

/**
 * What the shop card draws: {half, buildings: [rect], roads: [rect], routes: [[x, z][]]} with rect =
 * {x0, z0, x1, z1}. Hangars and bare frames count as buildings.
 */
export function mapSchema(id) {
  if (id === 'block') {
    return {
      half: HALF,
      buildings: BLOCK_HOUSES.map(([cx, cz, w, d]) => ({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 })),
      roads: [{ x0: -HALF, z0: -6, x1: HALF, z1: 6 }, { x0: -6, z0: -HALF, x1: 6, z1: HALF }],
      routes: levelRoutes().map((r) => routeLine(r)),
    };
  }
  const L = generateLayout(id);
  const big = L.pieces.filter((p) => p.type === 'hangar' || p.type === 'frame').map((p) => {
    const q = quarterOf(p.yaw) % 2, w = q ? p.d : p.w, d = q ? p.w : p.d;
    return { x0: p.x - w / 2, z0: p.z - d / 2, x1: p.x + w / 2, z1: p.z + d / 2 };
  });
  return {
    half: L.half,
    buildings: [...L.buildings.map(footprint), ...big],
    roads: L.roads.map((r) => ({ ...r })),
    routes: L.routes.map((def) => routeLine(buildRoute(def))),
  };
}

// ------------------------------------------------------------------------------------ the generator

const rd = (v) => Math.round(v * 100) / 100;
const rectHit = (a, b, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
const boxRect = (c) => ({ x0: c.minX, x1: c.maxX, z0: c.minZ, z1: c.maxZ });
const gapToRect = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const inRect = (x, z, r, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const rectAt = (x, z, hw, hd = hw) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
const outside = (r) => r.x0 < -LIM || r.x1 > LIM || r.z0 < -LIM || r.z1 > LIM;
/** Footprint of a piece on the ground (turned by its yaw). */
function pieceRect(p) {
  const q = quarterOf(p.yaw) % 2, w = q ? p.d : p.w, d = q ? p.w : p.d;
  return rectAt(p.x, p.z, w / 2, d / 2);
}
/** A point in the frame of a piece, in the world. */
function localPoint(p, lx, lz) {
  const q = quarterOf(p.yaw), c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

/** Lamp light colours. */
const SODIUM = 0xffb46a, WHITE = 0xdfe8ff, WARM = 0xffc890;

/**
 * The look of each map. palette: hex colours the world layer tints its materials with; wallKinds: the
 * wall materials the buildings use (material names of World.m, plus 'corrugated', 'timber', 'adobe');
 * roof and windowEvery: defaults of the buildings; scatter.mix: how much of each kind of small litter
 * (multipliers of the block's amounts); edge: what stands beyond the perimeter on each side.
 */
const THEMES = {
  port: {
    name: 'port', ground: 'asphalt', roof: 'flat', windowEvery: 4.2, wallKinds: ['brick', 'brickDark', 'concrete', 'corrugated'],
    palette: { wall: 0x8a7462, trim: 0x5d6670, roof: 0x4a4f55, ground: 0x55585c, road: 0x3b3d40, accent: 0xc2462e, water: 0x2c4652 },
    scatter: { mix: { brick: 0.5, rubble: 0.6, pebbles: 0.8, paper: 0.8, cans: 1.3, bottles: 1, glass: 0.5, planks: 1.5, cardboard: 1.5 } },
    edge: { n: 'water', s: 'warehouses', e: 'containers', w: 'warehouses' },
  },
  factory: {
    name: 'factory', ground: 'concrete', roof: 'flat', windowEvery: 5, wallKinds: ['concreteDark', 'corrugated', 'brickDark', 'concrete'],
    palette: { wall: 0x6f6a64, trim: 0x8a5a2a, roof: 0x3f4244, ground: 0x5f5d58, road: 0x434446, accent: 0xd8a520, pipe: 0x7a3b2c },
    scatter: { mix: { brick: 0.6, rubble: 1, pebbles: 1, paper: 0.5, cans: 1, bottles: 0.6, glass: 1.2, planks: 1, cardboard: 0.8 } },
    edge: { n: 'chimneys', s: 'warehouses', e: 'tanks', w: 'warehouses' },
  },
  oldtown: {
    name: 'oldtown', ground: 'cobble', roof: 'pitched', windowEvery: 3, wallKinds: ['plaster', 'plasterWarm', 'plasterGreen', 'plasterBlue', 'brick'],
    palette: { wall: 0xc9b69a, trim: 0x8d7a62, roof: 0x8a4a35, ground: 0x7d756a, road: 0x6e675e, accent: 0x3d6b4f },
    scatter: { mix: { brick: 1.3, rubble: 1.2, pebbles: 0.8, paper: 1, cans: 0.8, bottles: 1.2, glass: 1.3, planks: 0.8, cardboard: 0.7 } },
    edge: { n: 'old houses', s: 'old houses', e: 'old houses', w: 'old houses' },
  },
  railyard: {
    name: 'railyard', ground: 'gravel', roof: 'pitched', windowEvery: 3.4, wallKinds: ['brickDark', 'brick', 'corrugated', 'plasterWarm'],
    palette: { wall: 0x7c5a48, trim: 0x4b4e50, roof: 0x3d3a38, ground: 0x6b6258, road: 0x45433f, accent: 0x9c2f22, rail: 0x5a514a },
    scatter: { mix: { brick: 0.8, rubble: 0.8, pebbles: 1.6, paper: 0.6, cans: 0.8, bottles: 0.8, glass: 0.6, planks: 1.3, cardboard: 0.6 } },
    edge: { n: 'depots', s: 'town', e: 'tracks', w: 'tracks' },
  },
  airfield: {
    name: 'airfield', ground: 'grass', roof: 'flat', windowEvery: 3.6, wallKinds: ['concrete', 'plaster', 'concreteWarm', 'corrugated'],
    palette: { wall: 0xa7a59c, trim: 0x55606a, roof: 0x5a5e60, ground: 0x6d7351, road: 0x77777a, accent: 0xe0b020, marking: 0xf2f2ea },
    scatter: { mix: { brick: 0.3, rubble: 0.5, pebbles: 1.2, paper: 0.7, cans: 0.6, bottles: 0.5, glass: 0.4, planks: 0.6, cardboard: 0.8 } },
    edge: { n: 'fence', s: 'hangars', e: 'field', w: 'field' },
  },
  winter: {
    name: 'winter', ground: 'snow', roof: 'pitched', windowEvery: 3, wallKinds: ['timber', 'wood', 'plaster', 'brick'],
    palette: { wall: 0x6b5543, trim: 0xd8d4c8, roof: 0x4a4f58, ground: 0xe8edf2, road: 0xb9bcc0, accent: 0x8a2f2a },
    scatter: { mix: { brick: 0.3, rubble: 0.5, pebbles: 0.2, paper: 0.3, cans: 0.4, bottles: 0.4, glass: 0.4, planks: 1.4, cardboard: 0.3 } },
    edge: { n: 'forest', s: 'forest', e: 'forest', w: 'forest' },
  },
  night: {
    name: 'night', ground: 'asphalt', roof: 'flat', windowEvery: 3.2, wallKinds: ['concrete', 'concreteDark', 'brickDark', 'plasterBlue', 'metalGray'],
    palette: { wall: 0x5c5f66, trim: 0x2b2e33, roof: 0x2a2c30, ground: 0x2f3134, road: 0x252628, accent: 0xff4fa0, neon: 0x4fe0ff },
    scatter: { mix: { brick: 0.8, rubble: 0.8, pebbles: 0.6, paper: 1.5, cans: 1.4, bottles: 1.3, glass: 1.5, planks: 0.5, cardboard: 1.2 } },
    edge: { n: 'towers', s: 'towers', e: 'towers', w: 'towers' },
  },
  desert: {
    name: 'desert', ground: 'sand', roof: 'flat', windowEvery: 4, wallKinds: ['adobe', 'plasterWarm', 'adobe', 'concreteWarm'],
    palette: { wall: 0xc8a57a, trim: 0x8f6a45, roof: 0xb48f63, ground: 0xd6b98c, road: 0xc4a578, accent: 0x2f6f8a },
    scatter: { mix: { brick: 0.4, rubble: 1, pebbles: 1.6, paper: 0.4, cans: 0.6, bottles: 0.6, glass: 0.4, planks: 0.6, cardboard: 0.5 } },
    edge: { n: 'dunes', s: 'dunes', e: 'palms', w: 'dunes' },
  },
  construction: {
    name: 'construction', ground: 'dirt', roof: null, windowEvery: 3.4, wallKinds: ['concrete', 'brick', 'concreteDark', 'corrugated'],
    palette: { wall: 0x9a958c, trim: 0xe0a020, roof: 0x5a5a58, ground: 0x6e5e4c, road: 0x5b5146, accent: 0xff8a1c },
    scatter: { mix: { brick: 1.4, rubble: 1.3, pebbles: 1.2, paper: 0.5, cans: 0.7, bottles: 0.5, glass: 0.6, planks: 1.6, cardboard: 1 } },
    edge: { n: 'site fence', s: 'site fence', e: 'site fence', w: 'site fence' },
  },
};

/** One seed per map: change it and the map changes. */
const SEEDS = {
  port: 15020, factory: 15030, oldtown: 15040, railyard: 15050, airfield: 15060,
  winter: 15070, night: 15080, desert: 15090, construction: 15100,
};

const CONTAINERS = ['containerRed', 'containerBlue', 'containerGreen', 'containerRust'];
const CAR_PAINTS = ['metalChar', 'metalGray', 'metalRed', 'metalYellow'];

/**
 * A map being laid out. Everything is placed through it and checked on the way: nothing leaves the arena,
 * nothing solid comes nearer than 1.6 m to a rider loop, buildings keep alleys between them and the space
 * in front of their doors, pieces keep apart. A placement that does not fit is dropped (or throws when
 * the plan says it must fit, which is a mistake in the plan).
 */
class Plan {
  constructor(id) {
    this.id = id;
    this.theme = THEMES[id];
    this.rng = makeRng(SEEDS[id]);
    this.roads = []; this.buildings = []; this.pieces = []; this.routeDefs = [];
    this.samples = []; this.loopBox = null;
    this.rects = [];       // ground footprints of everything placed: {x0, z0, x1, z1, kind, key}
    this.doorZones = [];   // in front of and behind every door
    this.keep = [];        // spots that stay free: the start, the feet of the stairs
    this.lamps = []; this.vantage = []; this.feet = [];
    this.start = null; this.view = null;
  }

  r(a, b) { return a + (b - a) * this.rng(); }
  ri(a, b) { return Math.floor(a + (b - a + 1) * this.rng()); }
  pick(list) { return list[Math.floor(this.rng() * list.length)]; }
  chance(p) { return this.rng() < p; }
  fail(o, what) { if (o.must) throw new Error(`mapgen ${this.id}: ${what}`); return -1; }

  /** Where the player starts, looking at (tx, tz). */
  startAt(x, z, tx = 0, tz = 0) {
    this.start = { x, z, yaw: rd(Math.atan2(x - tx, z - tz)) };
    this.keep.push(rectAt(x, z, 2));
  }
  /** The camera of the main menu. */
  menu(x, y, z, tx, ty, tz) { this.view = { x, y, z, tx, ty, tz }; }

  road(x0, z0, x1, z1) { this.roads.push({ x0, z0, x1, z1 }); }

  /** A rider loop: points [x, z] or [x, z, cornerRadius], the other corners rounded with `radius`. */
  loop(id, points, radius = 4) {
    const def = { id, closed: true, width: 1.6, radius, points };
    const route = buildRoute(def), p = {};
    for (let s = 0; s < route.length; s += 0.5) {
      route.sample(s, p);
      this.samples.push({ x: p.x, z: p.z });
      const b = this.loopBox || (this.loopBox = { x0: p.x, x1: p.x, z0: p.z, z1: p.z });
      b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z);
    }
    this.routeDefs.push(def);
  }
  /** Smallest gap between a rectangle and the loops (8 when far from all of them). */
  loopGap(r) {
    if (!this.loopBox || !rectHit(r, this.loopBox, 8)) return 8;
    let best = 8;
    for (const p of this.samples) { const g = gapToRect(p.x, p.z, r); if (g < best) best = g; }
    return best;
  }
  pointLoopGap(x, z) { return this.loopGap({ x0: x, x1: x, z0: z, z1: z }); }

  /** Why these boxes cannot stand here, or null. allow: keys of things they may touch. */
  blockedBy(boxes, o) {
    for (const c of boxes) {
      const r = boxRect(c);
      if (outside(r)) return 'outside the arena';
      if (c.solid && c.maxY > 0.42 && this.loopGap(r) < (o.loopGap ?? 1.6)) return 'on a loop';
      if (c.minY >= 2 || c.maxY <= 0.05) continue;
      for (const q of this.rects) {
        const allowed = o.allow && o.allow.includes(q.key);
        const pad = allowed ? 0 : q.kind === 'building' ? 0.8 : (o.spacing ?? 0.6);
        if (rectHit(r, q, pad)) return 'hits ' + q.key;
      }
      for (const zr of this.doorZones) if (rectHit(r, zr)) return 'blocks a door';
      for (const k of this.keep) if (rectHit(r, k)) return 'stands on a kept spot';
    }
    return null;
  }

  /** Default look of a piece. */
  kindFor(type) {
    switch (type) {
      case 'container': return this.pick(CONTAINERS);
      case 'car': case 'bus': return this.pick(CAR_PAINTS);
      case 'wall': return this.pick(this.theme.wallKinds);
      case 'tree': return this.id === 'winter' ? 'spruce' : 'leafy';
      case 'stairs': case 'jersey': case 'fountain': case 'quay': case 'frame': case 'rubble': return 'concrete';
      case 'platform': case 'scaffold': case 'crane': case 'tank': case 'pipe': case 'wagon': case 'hangar': case 'plane': case 'sign': return 'metalGray';
      case 'tower': return 'wood';
      default: return type;
    }
  }

  /** Place a piece; returns its index, or -1 when it does not fit. */
  put(type, x, z, o = {}) {
    const [w, h, d] = SIZES[type];
    const p = {
      type, x: rd(x), z: rd(z), y: o.y ?? 0, yaw: o.yaw ?? 0,
      w: rd(o.w ?? w), h: rd(o.h ?? h), d: rd(o.d ?? d), kind: o.kind ?? this.kindFor(type),
    };
    if (o.wall > 0) p.wall = rd(o.wall);   // water only: how high it is walled off (PIECE_SHAPES.water)
    const boxes = PIECE_SHAPES[type](p);
    const why = this.blockedBy(boxes, o);
    if (why) return this.fail(o, `${type} at ${rd(x)}, ${rd(z)} ${why}`);
    const ref = this.pieces.length;
    this.pieces.push(p);
    for (const c of boxes) if (c.minY < 2 && c.maxY > 0.05) this.rects.push({ ...boxRect(c), kind: 'piece', key: 'p' + ref });
    return ref;
  }

  /** Up to n random pieces of the given types inside a rectangle; options per type in o. */
  scatter(n, x0, z0, x1, z1, types, o = {}) {
    let placed = 0;
    for (let tries = 0; tries < n * 14 && placed < n; tries++) {
      const type = this.pick(types);
      const yaw = this.chance(0.5) ? 0 : QUARTER;
      if (this.put(type, this.r(x0, x1), this.r(z0, z1), { yaw, ...(o[type] || {}) }) >= 0) placed++;
    }
    return placed;
  }

  /** Why a building footprint cannot stand here, or null. */
  houseBlockedBy(f, gap) {
    if (outside(f)) return 'outside the arena';
    for (const r of this.roads) if (rectHit(f, r, 0.5)) return 'on a road';
    if (this.loopGap(f) < 3) return 'near a loop';
    for (const q of this.rects) if (rectHit(f, q, q.kind === 'building' ? gap : 0.8)) return 'hits ' + q.key;
    for (const zr of this.doorZones) if (rectHit(f, zr)) return 'blocks a door';
    for (const k of this.keep) if (rectHit(f, k, 1)) return 'stands on a kept spot';
    return null;
  }

  /** The strips kept free in front of a door (outside) and behind it (inside). */
  doorZonesOf(f, t, side, at, width) {
    const a0 = at - width / 2 - 0.5, a1 = at + width / 2 + 0.5;
    if (side === 'n') return [{ x0: a0, x1: a1, z0: f.z0 - 2.2, z1: f.z0 }, { x0: a0, x1: a1, z0: f.z0, z1: f.z0 + t + 1.5 }];
    if (side === 's') return [{ x0: a0, x1: a1, z0: f.z1, z1: f.z1 + 2.2 }, { x0: a0, x1: a1, z0: f.z1 - t - 1.5, z1: f.z1 }];
    if (side === 'w') return [{ x0: f.x0 - 2.2, x1: f.x0, z0: a0, z1: a1 }, { x0: f.x0, x1: f.x0 + t + 1.5, z0: a0, z1: a1 }];
    return [{ x0: f.x1, x1: f.x1 + 2.2, z0: a0, z1: a1 }, { x0: f.x1 - t - 1.5, x1: f.x1, z0: a0, z1: a1 }];
  }
  /** A door on one side, where the ground in front of it is free; or null. */
  tryDoor(b, f, side) {
    const width = rd(this.r(2.2, 2.6)), t = b.thick;
    const [a, z] = side === 'n' || side === 's' ? [f.x0 + t, f.x1 - t] : [f.z0 + t, f.z1 - t];
    const lo = a + 1.1 + width / 2, hi = z - 1.1 - width / 2;
    if (hi < lo - 1e-9) return null;
    for (let i = 0; i < 5; i++) {
      const at = rd(i === 0 ? (lo + hi) / 2 : this.r(lo, hi));
      const [out] = this.doorZonesOf(f, t, side, at, width);
      if (outside(out)) continue;
      if (this.rects.some((q) => rectHit(out, q)) || this.keep.some((k) => rectHit(out, k))) continue;
      return { side, at, width, height: 2.5 };
    }
    return null;
  }
  /** Distance from the outside of a wall to the nearest street. */
  streetDist(f, side) {
    const p = { n: [(f.x0 + f.x1) / 2, f.z0 - 1], s: [(f.x0 + f.x1) / 2, f.z1 + 1], w: [f.x0 - 1, (f.z0 + f.z1) / 2], e: [f.x1 + 1, (f.z0 + f.z1) / 2] }[side];
    let best = Math.hypot(p[0], p[1]) + 50;
    for (const r of this.roads) best = Math.min(best, gapToRect(p[0], p[1], r));
    return best;
  }

  /**
   * Place a building: o = {cx, cz, w, d, storeys, wall, roof, windowEvery, partitions, parapet, doors?,
   * doorCount?, gap?, must?}. Without doors it gets one on the side nearest a street, often a second one.
   */
  house(o) {
    const b = {
      cx: rd(o.cx), cz: rd(o.cz), w: rd(o.w), d: rd(o.d), storeys: o.storeys ?? 1, thick: o.thick ?? 0.4,
      wall: o.wall ?? this.pick(this.theme.wallKinds), roof: o.roof === undefined ? this.theme.roof : o.roof,
      doors: [], partitions: false, windowEvery: o.windowEvery ?? this.theme.windowEvery, parapet: 0, access: [],
    };
    if (b.w < 5 || b.d < 5) return this.fail(o, 'building too small');
    const f = footprint(b);
    const why = this.houseBlockedBy(f, o.gap ?? 2.4);
    if (why) return this.fail(o, `building at ${b.cx}, ${b.cz} ${why}`);
    if (o.doors) b.doors = o.doors.map((dr) => ({ side: dr.side, at: rd(dr.at), width: dr.width ?? 2.4, height: dr.height ?? 2.5 }));
    else {
      const want = o.doorCount ?? (this.chance(0.6) ? 2 : 1);
      const sides = ['n', 's', 'e', 'w'].map((side) => ({ side, d: this.streetDist(f, side) + this.rng() * 0.5 })).sort((p, q) => p.d - q.d);
      for (const s of sides) {
        if (b.doors.length >= want) break;
        const dr = this.tryDoor(b, f, s.side);
        if (dr) b.doors.push(dr);
      }
    }
    if (!b.doors.length) return this.fail(o, `building at ${b.cx}, ${b.cz} has no room for a door`);
    b.partitions = o.partitions ?? (Math.max(b.w, b.d) >= 12 && this.chance(0.6));
    b.parapet = o.parapet ?? (b.roof === 'flat' ? 0.6 : 0);
    const ref = this.buildings.length;
    this.buildings.push(b);
    this.rects.push({ ...f, kind: 'building', key: 'b' + ref });
    for (const dr of b.doors) this.doorZones.push(...this.doorZonesOf(f, b.thick, dr.side, dr.at, dr.width));
    return ref;
  }

  /**
   * A row of buildings along the longer side of a lot, alleys between them. o = {len, gap, depth,
   * storeys, walls, roof, windowEvery, partitions, along}.
   */
  lot(x0, z0, x1, z1, o = {}) {
    const alongX = o.along ? o.along === 'x' : x1 - x0 >= z1 - z0;
    const [A0, A1, D0, D1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const [lenA, lenB] = o.len ?? [8, 14], [gapA, gapB] = o.gap ?? [2.6, 4.5];
    const room = D1 - D0, [depA, depB] = o.depth ?? [room * 0.7, room];
    const out = [];
    let pos = A0 + this.r(0, 1);
    while (A1 - pos >= lenA) {
      let len = this.r(lenA, lenB);
      if (pos + len > A1) len = A1 - pos;
      const depth = Math.min(room, this.r(depA, depB));
      const across = D0 + this.r(0, room - depth) + depth / 2, c = pos + len / 2;
      const i = this.house({
        cx: alongX ? c : across, cz: alongX ? across : c, w: alongX ? len : depth, d: alongX ? depth : len,
        storeys: this.ri(...(o.storeys ?? [1, 2])), wall: o.walls ? this.pick(o.walls) : undefined, roof: o.roof,
        windowEvery: o.windowEvery, partitions: o.partitions, gap: Math.min(2.4, gapA - 0.1),
      });
      if (i >= 0) out.push(i);
      pos += len + this.r(gapA, gapB);
    }
    return out;
  }

  /** Buildings dropped at random into a rectangle: a village, not a grid. */
  cluster(x0, z0, x1, z1, count, o = {}) {
    const out = [];
    for (let tries = 0; tries < count * 20 && out.length < count; tries++) {
      const w = this.r(...(o.w ?? [6, 10])), d = this.r(...(o.d ?? [6, 10]));
      if (w > x1 - x0 || d > z1 - z0) continue;
      const i = this.house({
        cx: this.r(x0 + w / 2, x1 - w / 2), cz: this.r(z0 + d / 2, z1 - d / 2), w, d,
        storeys: this.ri(...(o.storeys ?? [1, 2])), wall: o.walls ? this.pick(o.walls) : undefined, roof: o.roof,
        windowEvery: o.windowEvery, partitions: o.partitions, gap: o.gap ?? 3,
      });
      if (i >= 0) out.push(i);
    }
    return out;
  }

  /** Is there room for the foot of stairs here? */
  footFree(x, z) {
    const r = rectAt(x, z, 0.8);
    return !outside(r) && !this.rects.some((q) => rectHit(r, q)) && !this.doorZones.some((q) => rectHit(r, q)) && this.loopGap(r) >= 0.8;
  }
  /** Stairs placed and checked: the steps, the free foot in front of them, the vantage point on top. */
  stairs(x, z, yaw, h, allow, vantageAhead, o = {}) {
    const n = stepsFor(h), run = n * TREAD, dx = Math.sin(yaw), dz = Math.cos(yaw);
    const fx = x - dx * (run / 2 + 1.2), fz = z - dz * (run / 2 + 1.2);
    if (!this.footFree(fx, fz)) return this.fail(o, `the foot of the stairs at ${rd(x)}, ${rd(z)} is blocked`);
    const i = this.put('stairs', x, z, { yaw, w: 1.4, h, d: run, kind: o.kind ?? 'concrete', allow, must: o.must });
    if (i < 0) return -1;
    this.keep.push(rectAt(fx, fz, 0.8));
    this.feet.push({ x: fx, z: fz });
    this.vantage.push({ x: rd(x + dx * (run / 2 + vantageAhead)), z: rd(z + dz * (run / 2 + vantageAhead)), y: rd(h) });
    return i;
  }

  /** External stairs up to the flat roof of a one-storey building, on the first side that has room. */
  roofStairs(bi, sides = ['s', 'w', 'e', 'n'], o = {}) {
    const b = this.buildings[bi];
    if (!b || b.storeys !== 1) { this.fail(o, 'roof stairs need a one-storey building'); return false; }
    const f = footprint(b), H = STOREY, run = stepsFor(H) * TREAD;
    for (const side of sides) {
      const ns = side === 'n' || side === 's';
      const [a0, a1] = ns ? [f.x0 + 1.4, f.x1 - 1.4] : [f.z0 + 1.4, f.z1 - 1.4];
      for (const k of [0.5, 0.2, 0.8, 0.35, 0.65]) {
        const at = rd(a0 + (a1 - a0) * k);
        const spot = {
          s: [at, f.z1 + run / 2, Math.PI], n: [at, f.z0 - run / 2, 0],
          e: [f.x1 + run / 2, at, -QUARTER], w: [f.x0 - run / 2, at, QUARTER],
        }[side];
        if (this.stairs(spot[0], spot[1], spot[2], H, ['b' + bi], b.thick + 1.2) < 0) continue;
        b.roof = 'flat';
        b.parapet = Math.max(b.parapet, 0.9);
        b.access.push({ side, at, width: 1.8 });
        return true;
      }
    }
    this.fail(o, `no room for roof stairs at building ${bi}`);
    return false;
  }

  /** Stairs up to the local -z side of a deck (platform, tower, scaffold, frame, container), at local x `ax`. */
  climbTo(pi, ax = 0, o = {}) {
    const p = this.pieces[pi];
    const top = p.y + (p.type === 'frame' ? STOREY : p.h);
    const run = stepsFor(top) * TREAD;
    const c = localPoint(p, ax, -p.d / 2 - run / 2);
    return this.stairs(c.x, c.z, p.yaw, top, ['p' + pi], 1.2, o) >= 0;
  }

  /** A watchtower with its stairs, turned whichever way has room. */
  towerWithStairs(x, z, o = {}) {
    for (const k of [0, 1, 2, 3]) {
      const yaw = ((o.yaw0 ?? 0) + k) * QUARTER;
      const n0 = this.pieces.length, r0 = this.rects.length;
      const ti = this.put('tower', x, z, { yaw, w: o.w ?? 3.6, d: o.d ?? 3.6, h: o.h ?? 4.4, kind: o.kind ?? 'wood' });
      if (ti < 0) continue;
      if (this.climbTo(ti)) return ti;
      this.pieces.length = n0;   // take the tower back and try the next turn
      this.rects.length = r0;
    }
    return this.fail(o, `no room for a tower at ${x}, ${z}`);
  }

  /** A lamp post with its arm towards (fx, fz); its light goes into the layout's lamp list. */
  lamp(x, z, fx, fz, color = SODIUM) {
    const yaw = quarterOf(Math.atan2(fx, fz)) * QUARTER;
    if (this.put('lamp', x, z, { yaw, h: 5.6, kind: 'metalGray' }) < 0) return false;
    this.lamps.push({ x: rd(x + Math.sin(yaw) * 0.6), z: rd(z + Math.cos(yaw) * 0.6), y: 5.4, color });
    return true;
  }
  /** Lamps every `every` metres along a line. */
  lampRow(x0, z0, x1, z1, every, fx, fz, color) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / every));
    for (let i = 0; i <= n; i++) this.lamp(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, fx, fz, typeof color === 'function' ? color(i) : color);
  }

  /** A city block cut into rows of buildings along x, `depth` metres deep, alleys between the rows. */
  rows(x0, z0, x1, z1, depth, o = {}) {
    const n = Math.max(1, Math.round((z1 - z0) / (depth + 2.6))), h = (z1 - z0) / n, out = [];
    for (let i = 0; i < n; i++) {
      out.push(...this.lot(x0, z0 + i * h + (i ? 1.3 : 0), x1, z0 + (i + 1) * h - (i < n - 1 ? 1.3 : 0), { ...o, along: 'x' }));
    }
    return out;
  }

  // ---------------------------------------------------------------------------- the finishing pass

  /** Spawns, supplies, crates, barrels and fires on the finished streets and buildings. */
  finish() {
    if (!this.start) throw new Error(`mapgen ${this.id}: no start`);
    const layout = {
      id: this.id, half: HALF, theme: this.theme, atmosphere: this.id, playerStart: this.start,
      ground: { kind: this.theme.ground }, roads: this.roads, buildings: this.buildings, pieces: this.pieces,
      routes: this.routeDefs, spawns: [], pickups: [], crates: [], barrels: [], fires: [], lamps: this.lamps,
      vantage: this.vantage, menuView: this.view || { x: 32, y: 17, z: 34, tx: 0, ty: 2, tz: 0 },
    };
    const cols = layoutColliders(layout);
    const nav = new NavGrid(HALF, 0.5, 0.4);
    for (const c of cols) nav.addBox(c);
    const s = this.start;
    if (nav.blockedAt(s.x, s.z)) throw new Error(`mapgen ${this.id}: the start is blocked`);
    let reach = nav.reachableFrom(s.x, s.z);
    const cell = (x, z) => nav.idx(nav.toCell(x), nav.toCell(z));
    const free = (x, z) => !nav.blockedAt(x, z) && reach[cell(x, z)] === 1;
    const open = (x, z, m) => [[0, 0], [m, m], [-m, m], [m, -m], [-m, -m]].every(([a, b]) => free(x + a, z + b));
    const indoors = [
      ...this.buildings.map(footprint),
      ...this.pieces.filter((p) => p.type === 'hangar' || p.type === 'frame').map(pieceRect),
    ];
    const isIndoors = (x, z) => indoors.some((r) => inRect(x, z, r, 0.3));
    const fromStart = (p) => Math.hypot(p.x - s.x, p.z - s.z);
    const touches = (x, z, r) => cols.some((c) => {
      if (c.maxY < 0.1) return false;
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
      return (cx - x) ** 2 + (cz - z) ** 2 < (r + 0.12) ** 2;
    });

    /** Farthest-point picks: each next point as far as possible from the start and the points so far. */
    const spreadPick = (cands, n, ok = () => true) => {
      const far = cands.map(fromStart), out = [];
      while (out.length < n) {
        let best = -1;
        for (let i = 0; i < cands.length; i++) if (far[i] > 0 && (best < 0 || far[i] > far[best])) best = i;
        if (best < 0) break;
        const p = cands[best];
        far[best] = 0;
        if (!ok(p)) continue;
        out.push(p);
        for (let i = 0; i < cands.length; i++) far[i] = Math.min(far[i], Math.hypot(cands[i].x - p.x, cands[i].z - p.z));
      }
      return out;
    };

    // enemy spawn points: open ground outdoors, away from the loops and the start
    const spawnCands = [];
    for (let z = -42; z <= 42; z += 1.5) {
      for (let x = -42; x <= 42; x += 1.5) {
        if (Math.hypot(x - s.x, z - s.z) < 8 || isIndoors(x, z) || !open(x, z, 0.6)) continue;
        if (this.pointLoopGap(x, z) < 2.5) continue;
        spawnCands.push({ x, z });
      }
    }
    layout.spawns = spreadPick(spawnCands, 24, (p) => !touches(p.x, p.z, 0.5));

    // ammo and medkits: outdoors, off the loops, not on a spawn point
    const supplyCands = [];
    for (let z = -42; z <= 42; z += 1) {
      for (let x = -42; x <= 42; x += 1) {
        const px = x + 0.25, pz = z + 0.25;
        if (Math.hypot(px - s.x, pz - s.z) < 5 || isIndoors(px, pz) || !open(px, pz, 0.5)) continue;
        if (this.pointLoopGap(px, pz) < ROUTE_KEEP_CLEAR + 0.8) continue;
        if (layout.spawns.some((q) => Math.hypot(q.x - px, q.z - pz) < 3)) continue;
        supplyCands.push({ x: px, z: pz });
      }
    }
    layout.pickups = spreadPick(supplyCands, 10, (p) => !touches(p.x, p.z, 0.45))
      .map((p, i) => ({ x: p.x, z: p.z, type: i % 5 < 3 ? 'ammo' : 'health' }));

    // places that must stay reachable when the crates and barrels stand
    const doorsIn = this.buildings.flatMap((b) => {
      const f = footprint(b);
      return b.doors.map((dr) => ({
        n: { x: dr.at, z: f.z0 + b.thick / 2 + 1.4 }, s: { x: dr.at, z: f.z1 - b.thick / 2 - 1.4 },
        w: { x: f.x0 + b.thick / 2 + 1.4, z: dr.at }, e: { x: f.x1 - b.thick / 2 - 1.4, z: dr.at },
      }[dr.side]));
    });
    const vital = [...layout.spawns, ...layout.pickups, ...doorsIn, ...this.feet].filter((p) => reach[cell(p.x, p.z)]);

    // crates in the corners of rooms and beside the cover, barrels in the leftover spots
    const cands = [];
    for (const b of this.buildings) {
      const f = footprint(b), k = b.thick + 0.75;
      cands.push([f.x0 + k, f.z0 + k], [f.x1 - k, f.z0 + k], [f.x0 + k, f.z1 - k], [f.x1 - k, f.z1 - k]);
      cands.push([f.x0 - 1, f.z0 - 1], [f.x1 + 1, f.z1 + 1], [f.x1 + 1, f.z0 - 1], [f.x0 - 1, f.z1 + 1]);
    }
    const COVER = new Set(['container', 'jersey', 'sandbags', 'car', 'bus', 'wall', 'adobe_wall', 'crate_stack', 'pipe', 'wagon', 'tank', 'hedgehog', 'dumpster', 'rubble', 'snowbank', 'stall', 'pallet', 'rebar']);
    for (const p of this.pieces) {
      if (!COVER.has(p.type) || p.y > 0) continue;
      const r = pieceRect(p);
      cands.push([r.x0 - 0.9, (r.z0 + r.z1) / 2], [r.x1 + 0.9, (r.z0 + r.z1) / 2], [(r.x0 + r.x1) / 2, r.z0 - 0.9], [(r.x0 + r.x1) / 2, r.z1 + 0.9]);
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const placed = layout.pickups.map((p) => ({ x: p.x, z: p.z, r: 0.4 }));
    const fits = (x, z, r) => {
      if (Math.abs(x) > HALF - 1.5 || Math.abs(z) > HALF - 1.5) return false;
      if (Math.hypot(x - s.x, z - s.z) < 4) return false;
      if (this.pointLoopGap(x, z) < r + ROUTE_KEEP_CLEAR + 0.15) return false;
      if (this.doorZones.some((q) => inRect(x, z, q, r))) return false;
      if (this.feet.some((q) => Math.hypot(q.x - x, q.z - z) < r + 1.4)) return false;
      if (layout.spawns.some((q) => Math.hypot(q.x - x, q.z - z) < r + 1.2)) return false;
      if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < r + q.r + 0.3)) return false;
      return !touches(x, z, r);
    };
    /** Stand a box in the nav grid; keep it only when everything vital stays reachable. */
    const stand = (box) => {
      nav.addBox(box);
      let tight = false;
      for (let z = box.minZ - 1.4; z <= box.maxZ + 1.4 && !tight; z += 0.5) {
        for (let x = box.minX - 1.4; x <= box.maxX + 1.4; x += 0.5) {
          if (x > box.minX - 0.5 && x < box.maxX + 0.5 && z > box.minZ - 0.5 && z < box.maxZ + 0.5) continue;
          if (nav.blockedAt(x, z)) { tight = true; break; }
        }
      }
      if (!tight) return true;
      const r2 = nav.reachableFrom(s.x, s.z);
      if (vital.every((p) => r2[cell(p.x, p.z)])) { reach = r2; return true; }
      nav.removeBox(box);
      return false;
    };
    const near = (x, z) => [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8]]
      .some(([a, b]) => free(x + a, z + b));
    let ci = 0;
    for (; ci < cands.length && layout.crates.length < 30; ci++) {
      const [x, z] = cands[ci].map(rd), size = rd(0.85 + this.rng() * 0.3);
      if (!fits(x, z, size * 0.7) || !near(x, z)) continue;
      if (!stand({ minX: x - size / 2, maxX: x + size / 2, minY: 0, maxY: size, minZ: z - size / 2, maxZ: z + size / 2, solid: true })) continue;
      layout.crates.push({ x, z, size });
      placed.push({ x, z, r: size * 0.7 });
    }
    for (; ci < cands.length && layout.barrels.length < 16; ci++) {
      const [x, z] = cands[ci].map(rd);
      if (!fits(x, z, 0.4) || !near(x, z)) continue;
      if (!stand({ minX: x - 0.3, maxX: x + 0.3, minY: 0, maxY: 0.9, minZ: z - 0.3, maxZ: z + 0.3, solid: true })) continue;
      layout.barrels.push({ x, z, explosive: this.rng() < 0.8 });
      placed.push({ x, z, r: 0.4 });
    }

    // fires burn on wrecks
    for (const p of this.pieces) {
      if (layout.fires.length >= 4) break;
      if ((p.type === 'car' || p.type === 'bus') && this.chance(0.6)) layout.fires.push({ x: p.x, z: p.z, s: rd(0.8 + this.rng() * 0.3) });
    }
    if (!layout.fires.length && layout.barrels.length) layout.fires.push({ x: layout.barrels[0].x, z: layout.barrels[0].z, s: 0.7 });
    return layout;
  }
}

// ---------------------------------------------------------------------------------------- the maps
//
// Each plan lays its streets first, then its loops (everything after keeps clear of them), then the
// landmarks that must fit, then the buildings and the cover. Street rectangles are {x0, z0, x1, z1}.

const PLANS = {
  /** Port: a quay with cranes along the north, a container yard, warehouses and offices to the south. */
  port(P) {
    P.startAt(-42, 26);
    P.menu(36, 17, 38, -4, 2, -10);
    P.road(-44.4, -34.4, 44.4, -23);    // the apron along the quay
    P.road(-44.4, -3, 44.4, 5);         // the dock road
    P.road(28, -23, 36, 44.4);          // east road
    P.road(-36, -23, -28, -3);          // west link
    P.road(-44.4, 21, 28, 31);          // south road
    P.loop('dock', [[-32, -28.5], [32, -28.5], [32, 1], [-32, 1]], 5);
    P.loop('south', [[-38, 23.5], [24, 23.5], [24, 28.5], [-38, 28.5]], 2.5);
    // The sea is walled off from the quay's edge up, as high as the perimeter: no one standing on the quay
    // (1.3 m), a bollard (0.6 m) or a crate stack (2 m) jumps onto it (PLAYER.jumpHeight 1.1 m), so nobody
    // drops onto the water where the bots cannot follow. The wall is not drawn and bullets fly over it.
    const SEA_WALL = 14;
    const sea = P.put('water', 0, -40, { w: 90, d: 10, h: 0.1, wall: SEA_WALL, kind: 'water', must: true });
    P.put('quay', 0, -34.7, { w: 88.8, h: 1.3, d: 0.6, must: true, allow: ['p' + sea] });
    for (const x of [-16, 14]) P.put('crane', x, -29.5, { w: 12, h: 16, d: 8.6, kind: 'gantry', must: true });
    for (let x = -40; x <= 40; x += 10) P.put('box', x, -33.5, { w: 0.4, h: 0.6, d: 0.4, kind: 'bollard' });
    // the container yard: one container with stairs to its roof, rows of single and stacked ones
    const look = P.put('container', -1, -18.5, { yaw: Math.PI, kind: 'containerRed', must: true });
    P.climbTo(look, 0, { must: true, kind: 'metalGray' });
    for (const z of [-18.5, -7.5]) {
      let x = -25.5 + P.r(0, 1.5);
      while (x + 6.06 <= 25.5) {
        const cx = x + 3.03;
        if (P.put('container', cx, z) >= 0 && P.chance(0.45)) P.put('container', cx, z, { y: 2.6 });
        x += 6.06 + P.r(2, 4);
      }
    }
    P.scatter(8, -24, -15.5, 24, -10.5, ['crate_stack', 'pallet', 'jersey']);
    // lamps along the dock road
    P.lampRow(-38, -3.5, 38, -3.5, 12.7, 0, 1, SODIUM);
    P.lampRow(-38, 5.4, 24, 5.4, 12.4, 0, -1, SODIUM);
    // warehouses, offices, sheds
    P.lot(-43.5, 6.5, 26, 19.5, { len: [14, 22], gap: [3, 5], depth: [10, 13], storeys: [1, 2], walls: ['brick', 'corrugated', 'brickDark'], windowEvery: 5 });
    const offices = P.lot(-43.5, 32.5, 26, 44, { len: [8, 13], gap: [2.6, 4], depth: [8, 11], storeys: [1, 3] });
    P.lot(37, -22, 44, -3.6, { len: [8, 12], gap: [3, 5], depth: [6, 7], storeys: [1, 2] });
    P.lot(37, 5.6, 44, 44, { len: [8, 12], gap: [3, 5], depth: [6, 7], storeys: [1, 2] });
    P.lot(-44, -22, -36.6, -3.6, { len: [7, 10], gap: [3, 4], depth: [6, 7], storeys: [1, 2] });
    for (const i of offices) if (P.buildings[i].storeys === 1 && P.roofStairs(i, ['n', 'w', 'e'])) break;
    P.scatter(10, -43, -33.5, 43, -23.5, ['jersey', 'sandbags', 'crate_stack', 'car']);
    P.scatter(8, -43, -2.6, 43, 4.6, ['jersey', 'car', 'sandbags', 'hedgehog']);
    P.scatter(6, -43, 21.5, 27, 30.5, ['car', 'jersey', 'dumpster']);
    P.scatter(5, 28.5, 6, 35.5, 43, ['car', 'container', 'pallet']);
  },

  /** Industrial zone: a ring road round the main hall, tank farm, pipe racks, sheds outside the ring. */
  factory(P) {
    P.startAt(-40, 25.5);
    P.menu(34, 18, 36, 0, 2, 0);
    P.road(-44.4, -30, 44.4, -21);
    P.road(-44.4, 21, 44.4, 30);
    P.road(-30, -21, -21, 21);
    P.road(21, -21, 30, 21);
    P.loop('ring', [[-25.5, -25.5], [25.5, -25.5], [25.5, 25.5], [-25.5, 25.5]], 6);
    for (const [x, z, fx, fz] of [[-20.8, -12, -1, 0], [-20.8, 8, -1, 0], [20.8, -6, 1, 0], [20.8, 8, 1, 0], [-8, -20.8, 0, -1], [8, -20.8, 0, -1], [-6, 20.8, 0, 1], [10, 20.8, 0, 1]]) {
      P.lamp(x, z, fx, fz, WARM);
    }
    P.house({ cx: -3, cz: -4, w: 22, d: 15, storeys: 2, wall: 'concreteDark', roof: 'flat', windowEvery: 4.5, partitions: true, must: true });
    const boiler = P.house({ cx: 12, cz: 13, w: 9, d: 7, storeys: 1, wall: 'brick', roof: 'flat', must: true });
    P.roofStairs(boiler, ['w', 'n', 's', 'e'], { must: true });
    P.put('tank', 14, -13, { w: 6, d: 6, h: 8, kind: 'metalRed', must: true });
    P.put('tank', -14, 13, { w: 5.5, d: 5.5, h: 7, must: true });
    const deck = P.put('platform', -12, -16.5, { w: 8, d: 3, h: 3.4, kind: 'metalGray' });
    if (deck >= 0) P.climbTo(deck, 0, { kind: 'metalGray' });
    P.put('pipe', -3, 6.8, { w: 18, h: 0.9, d: 0.7 });
    P.put('pipe', 17, -2, { w: 14, h: 0.9, d: 0.7, yaw: QUARTER });
    P.lot(-44, -44, 44, -30.6, { len: [12, 20], gap: [3, 5], depth: [9, 12.5], storeys: [1, 2], walls: ['corrugated', 'concrete', 'brickDark'] });
    P.lot(-37, 30.6, 44, 44, { len: [10, 16], gap: [3, 5], depth: [8, 12], storeys: [1, 3] });
    P.lot(-44, -20.4, -30.6, 20.4, { len: [10, 14], gap: [3, 5], depth: [8, 12], storeys: [1, 2] });
    for (const z of [-14, -2, 10]) P.put('tank', 37.5, z, { w: 6, d: 6, h: 9, kind: 'metalGray' });
    const junk = ['crate_stack', 'pallet', 'dumpster', 'jersey', 'car', 'pipe'];
    P.scatter(14, -44, -29.5, 44, -21.5, junk);
    P.scatter(12, -44, 21.5, 44, 29.5, junk);
    P.scatter(8, -29.5, -20.5, -21.5, 20.5, junk);
    P.scatter(8, 21.5, -20.5, 29.5, 20.5, junk);
    P.scatter(10, -20, -20, 20, 20, ['crate_stack', 'pallet', 'dumpster', 'rebar']);
    P.scatter(5, 31, -20, 44, 20, ['pipe', 'pallet']);
  },

  /** Old town: a square with a fountain and a market, narrow streets, dense old houses, a boulevard. */
  oldtown(P) {
    P.startAt(-41, 30);
    P.menu(-30, 20, 36, 0, 2, -2);
    P.road(-13, -11, 13, 11);           // the square
    P.road(-44.4, -3, -13, 3);
    P.road(13, -1, 44.4, 5);
    P.road(-5, -44.4, 1, -11);
    P.road(-1, 11, 5, 25);
    P.road(-44.4, 25, 44.4, 35);        // the boulevard
    P.loop('square', [[-8.5, -7], [8.5, -7], [8.5, 7], [-8.5, 7]], 3.5);
    P.loop('boulevard', [[-36, 27.5], [36, 27.5], [36, 32.5], [-36, 32.5]], 2.5);
    P.put('fountain', 0, 0, { w: 6, d: 6, h: 0.7, must: true });
    for (const [x, z, fx] of [[-12.2, -10.2, 1], [12.2, -10.2, -1], [-12.2, 10.2, 1], [12.2, 10.2, -1]]) P.lamp(x, z, fx, 0, SODIUM);
    P.lampRow(-40, 25.6, 40, 25.6, 13.3, 0, 1, SODIUM);
    const roofHouse = P.house({ cx: 9.5, cz: 18, w: 7, d: 8, storeys: 1, wall: 'plasterWarm', roof: 'flat', must: true });
    P.roofStairs(roofHouse, ['e', 's', 'w', 'n'], { must: true });
    P.scatter(5, -12.5, -10.8, 12.5, -8.8, ['stall'], { stall: { yaw: 0 } });
    P.scatter(5, -12.5, 8.8, 12.5, 10.8, ['stall'], { stall: { yaw: Math.PI } });
    const town = { len: [7, 11], gap: [2.6, 3.4], depth: [7, 10], storeys: [2, 3], windowEvery: 3 };
    P.rows(-44, -44, -13.6, -3.6, 11, town);
    P.lot(-12.4, -44, -5.6, -11.6, { ...town, along: 'z', depth: [6, 6.8] });
    P.rows(13.6, -44, 44, -1.6, 11, town);
    P.rows(1.6, -44, 12.4, -11.6, 11, { ...town, len: [7, 10.8] });
    P.rows(-44, 3.6, -13.6, 24.4, 9, town);
    P.lot(-12.4, 11.6, -1.6, 24.4, { ...town, along: 'z' });
    P.rows(13.6, 5.6, 44, 24.4, 8, town);
    P.lot(-44, 35.6, 44, 44, { ...town, along: 'x' });
    const street = ['car', 'sandbags', 'jersey', 'rubble', 'hedgehog'];
    P.scatter(6, -44, -2.6, -13.5, 2.6, street);
    P.scatter(6, 13.5, -0.6, 44, 4.6, street);
    P.scatter(5, -4.6, -44, 0.6, -11.5, street);
    P.scatter(4, -0.6, 11.5, 4.6, 24.5, street);
    P.scatter(8, -44, 25.4, 44, 34.6, ['car', 'jersey', 'sandbags']);
  },

  /** Railyard: four tracks with wagons, a footbridge over them, depots to the north, the station south. */
  railyard(P) {
    P.startAt(-40, 38);
    P.menu(30, 16, -38, 0, 2, 0);
    P.road(-44.4, -24, 44.4, -16);
    P.road(-44.4, 8, 44.4, 16);
    P.road(-40, -16, -34, 8);
    P.road(34, -16, 40, 8);
    P.loop('yard', [[-37, -20], [37, -20], [37, 12], [-37, 12]], 4);
    for (const z of [-12, -6.5, -1, 4.5]) P.put('rail', 0, z, { w: 88.8, d: 1.6, h: 0.2, kind: 'rail' });
    const bridge = P.put('platform', 0, -4, { yaw: QUARTER, w: 24, d: 2.4, h: 4.6, kind: 'metalGray', must: true });
    P.climbTo(bridge, -10, { must: true, kind: 'metalGray' });
    P.lampRow(-30, 8.6, 30, 8.6, 12, 0, 1, WARM);
    P.lampRow(-36, -16.6, 36, -16.6, 12, 0, -1, WARM);
    for (const z of [-12, -6.5, -1, 4.5]) {
      let x = -31 + P.r(0, 4);
      while (x + 11 <= 31) {
        const len = P.r(11, 14);
        if (P.chance(0.75)) P.put('wagon', x + len / 2, z, { w: len, h: 3.9, d: 2.9, kind: P.pick(['wagonRed', 'wagonBrown', 'tanker', 'wagonGray']) });
        x += len + P.r(2.5, 5);
      }
    }
    P.lot(-44, -44, 44, -24.6, { len: [14, 22], gap: [3, 5], depth: [10, 15], storeys: [1, 2], walls: ['brickDark', 'corrugated', 'brick'], windowEvery: 4.5 });
    P.house({ cx: -6, cz: 24, w: 30, d: 11, storeys: 2, wall: 'plasterWarm', roof: 'pitched', partitions: true, windowEvery: 3.2, must: true });
    P.lot(13, 17, 44, 30, { len: [9, 14], depth: [8, 12], storeys: [1, 2] });
    P.lot(-44, 17, -24.5, 30, { len: [8, 12], depth: [8, 12], storeys: [1, 2] });
    P.lot(-34, 32.5, 44, 44, { len: [8, 12], depth: [7, 10], storeys: [1, 2] });
    P.scatter(12, -44, -23.5, 44, -16.5, ['container', 'crate_stack', 'pallet', 'car', 'jersey']);
    P.scatter(10, -44, 8.5, 44, 15.5, ['car', 'pallet', 'crate_stack', 'jersey']);
    P.scatter(6, -30, -15.5, 30, 6, ['pallet', 'crate_stack', 'sandbags']);
  },

  /** Airfield: runway and taxiway with planes, hangars to the north, the terminal and a control tower south. */
  airfield(P) {
    P.startAt(-41, 16);
    P.menu(-36, 18, 34, 0, 2, -10);
    P.road(-44.4, -6, 44.4, 6);         // runway
    P.road(-44.4, -24, 44.4, -13);      // taxiway
    P.road(-6, -13, 6, -6);
    P.road(-36, 9, 36, 22);             // apron
    P.loop('runway', [[-40, -3], [40, -3], [40, 3], [-40, 3]], 3);
    P.loop('taxiway', [[-38, -21], [38, -21], [38, -16], [-38, -16]], 2.5);
    for (const x of [-27, -7, 13]) P.put('hangar', x, -35.5, { w: 16, d: 14, h: 8, kind: 'corrugated', must: true });
    P.put('plane', -7, -36, { yaw: Math.PI, w: 12, d: 10, h: 3.4, kind: 'planeGray' });
    P.put('plane', -22, 15.5, { yaw: QUARTER, w: 14, d: 12, h: 3.4, kind: 'planeGray', must: true });
    P.put('plane', 12, 15.5, { yaw: -QUARTER, w: 14, d: 12, h: 3.4, kind: 'planeGreen', must: true });
    P.towerWithStairs(30, 15, { w: 4, d: 4, h: 4.4, kind: 'concrete', must: true });
    P.lampRow(-30, 9.6, 30, 9.6, 12, 0, -1, WHITE);
    P.lampRow(-36, -12.4, 36, -12.4, 12, 0, 1, WHITE);
    P.rows(-34, 25.5, 44, 44, 7, { len: [10, 16], gap: [3, 5], storeys: [1, 2] });
    P.lot(24, -44, 44, -28.6, { len: [7, 10], depth: [6, 9], storeys: [1, 1] });
    P.lot(-44, 26.5, -37, 44, { along: 'z', len: [8, 11], depth: [6, 7] });
    P.put('tank', -40, -38, { w: 5, d: 5, h: 6, kind: 'metalWhite' });
    P.put('tank', -40, -31.5, { w: 5, d: 5, h: 6, kind: 'metalWhite' });
    P.scatter(10, -44, -24, 44, -13, ['sandbags', 'jersey', 'hedgehog', 'crate_stack']);
    P.scatter(10, -44, -12.5, 44, -6.5, ['sandbags', 'jersey', 'hedgehog']);
    P.scatter(10, -36, 9, 36, 22, ['crate_stack', 'pallet', 'car', 'sandbags']);
    P.scatter(6, -44, 6.5, 44, 8.5, ['jersey', 'sandbags']);
  },

  /** Winter village: a bent village road round the church, timber houses, fir trees, snowbanks, a watchtower. */
  winter(P) {
    P.startAt(38, 38, -4, -4);
    P.menu(36, 16, 38, -6, 2, -4);
    P.road(-38, -31, 31, -23);
    P.road(23, -31, 31, 10);
    P.road(4, 2, 31, 10);
    P.road(4, 2, 12, 34);
    P.road(-38, 26, 12, 34);
    P.road(-38, -31, -30, 34);
    P.loop('village', [[-34, -27], [27, -27], [27, 6], [8, 6], [8, 30], [-34, 30]], 4);
    P.lampRow(-26, -22.4, 19, -22.4, 15, 0, -1, WARM);
    P.lamp(-29.4, 0, -1, 0, WARM);
    P.lamp(-29.4, 16, -1, 0, WARM);
    P.house({ cx: -14, cz: -2, w: 10, d: 14, storeys: 2, wall: 'plaster', roof: 'pitched', partitions: true, must: true });
    P.towerWithStairs(38, -10, { h: 4.4, must: true });
    const village = { w: [6, 9], d: [6, 9], storeys: [1, 2], walls: ['timber', 'wood', 'plaster'] };
    P.cluster(-29.5, -22.5, 3.5, 25.5, 9, village);
    P.cluster(-44, -44, 44, -31.6, 6, village);
    P.cluster(31.6, -30, 44, 44, 4, village);
    P.cluster(12.6, 10.6, 31, 44, 4, village);
    P.cluster(-44, 34.6, 3.5, 44, 4, village);
    P.scatter(14, -38, -31, 31, 34, ['snowbank'], { snowbank: { w: 3.5, h: 0.9, d: 1.4 } });
    P.scatter(6, -44, -44, 44, 44, ['fence'], { fence: { w: 5, h: 1.2, d: 0.1, kind: 'woodFence' } });
    P.scatter(30, -44, -44, 44, 44, ['tree'], { tree: { w: 3, d: 3, h: 8, kind: 'spruce' } });
    P.scatter(5, -38, -31, 31, 34, ['car', 'crate_stack', 'pallet']);
  },

  /** Night centre: a grid of avenues under street lamps, tall blocks with neon, a pavilion on the plaza. */
  night(P) {
    P.startAt(-40, 16);
    P.menu(30, 22, 30, 0, 4, 0);
    P.road(-44.4, -20, 44.4, -12);
    P.road(-44.4, 12, 44.4, 20);
    P.road(-20, -44.4, -12, 44.4);
    P.road(12, -44.4, 20, 44.4);
    P.loop('center', [[-16, -16], [16, -16], [16, 16], [-16, 16]], 4);
    P.loop('avenue', [[24, -18.5], [41, -18.5], [41, -13.5], [24, -13.5]], 2.5);
    const col = (i) => (i % 2 ? WHITE : SODIUM);
    // lamps on the outer kerb of each avenue round the centre, between the crossings
    for (const [a, b] of [[-42, -22], [-10, 10], [22, 42]]) {
      P.lampRow(a, -19.4, b, -19.4, 14, 0, 1, col);
      P.lampRow(a, 19.4, b, 19.4, 14, 0, -1, col);
      P.lampRow(-19.4, a, -19.4, b, 14, 1, 0, col);
      P.lampRow(19.4, a, 19.4, b, 14, -1, 0, col);
    }
    const pav = P.house({ cx: -4, cz: 3, w: 8, d: 6, storeys: 1, wall: 'concrete', roof: 'flat', must: true });
    P.roofStairs(pav, ['s', 'w', 'n', 'e'], { must: true });
    P.put('fountain', 5, -5, { w: 5, d: 5, h: 0.7 });
    const tall = { len: [10, 18], gap: [3, 5], storeys: [3, 4], windowEvery: 3.2 };
    P.rows(-44, -44, -21.5, -21.5, 10, tall);
    P.rows(-10.5, -44, 10.5, -21.5, 10, tall);
    P.rows(21.5, -44, 44, -21.5, 10, tall);
    P.rows(-44, -10.5, -21.5, 10.5, 9, tall);
    P.rows(21.5, -10.5, 44, 10.5, 9, tall);
    P.rows(-10.5, 21.5, 10.5, 44, 10, tall);
    P.lot(21.5, 34, 44, 44, { len: [6, 9], depth: [6, 8], storeys: [1, 1] });
    // a car park in the south west, a little park in the south east
    P.put('sign', -33, 40, { w: 7, h: 6, d: 0.4, kind: 'billboard' });
    P.scatter(12, -44, 21.5, -21.5, 44, ['car'], { car: { kind: 'metalGray' } });
    P.scatter(10, 21.5, 21.5, 44, 33, ['tree'], { tree: { w: 3, d: 3, h: 6 } });
    P.scatter(8, -11, -11, 11, 11, ['box', 'crate_stack'], { box: { w: 2, h: 0.5, d: 0.6, kind: 'bench' } });
    P.scatter(12, -44, -44, 44, 44, ['car', 'jersey', 'dumpster', 'bus']);
    // neon on every other tall building, on the face towards the avenue
    P.buildings.forEach((b, i) => {
      if (b.storeys < 3 || i % 2) return;
      const f = footprint(b);
      const south = Math.abs(f.z1 - 12) < Math.abs(f.z0 + 12) ? f.z1 : f.z0;
      P.put('neon', b.cx, south + (south === f.z1 ? 0.12 : -0.12), {
        yaw: south === f.z1 ? 0 : Math.PI, y: 4.2 + (i % 3) * 1.4, w: Math.min(4, b.w * 0.5), h: 1, d: 0.15, kind: i % 4 ? 'neonPink' : 'neonCyan',
      });
    });
  },

  /** Desert village: a dirt track round the market, adobe compounds, palms, flat roofs to climb. */
  desert(P) {
    P.startAt(-40, 40);
    P.menu(38, 16, 40, -6, 2, -4);
    P.road(-4, -44.4, 4, 44.4);         // the main road
    P.road(4, -40, 38, -32);
    P.road(30, -32, 38, 30);
    P.road(4, 30, 38, 38);
    P.loop('track', [[0, -36], [34, -36], [34, 34], [0, 34]], 5);
    P.lampRow(-3.4, -30, -3.4, 30, 15, 1, 0, SODIUM);
    P.scatter(8, 5, -28, 9, 26, ['stall'], { stall: { yaw: -QUARTER } });
    const adobe = { w: [6, 9], d: [6, 9], storeys: [1, 2], walls: ['adobe', 'plasterWarm'], roof: 'flat' };
    const market = P.cluster(9.5, -31, 29.5, 29, 8, adobe);
    const west = P.cluster(-44, -44, -4.5, 44, 14, { ...adobe, w: [6, 10], d: [6, 10] });
    let climbs = 0;
    for (const i of [...market, ...west]) if (climbs < 2 && P.buildings[i].storeys === 1 && P.roofStairs(i)) climbs++;
    P.put('fountain', -20, 0, { w: 3, d: 3, h: 0.9, kind: 'well' });
    P.scatter(16, -44, -44, -4.5, 44, ['adobe_wall'], { adobe_wall: { w: 5, h: 2.2, d: 0.4, spacing: 2.6 } });
    P.scatter(14, -44, -44, 44, 44, ['palm'], { palm: { h: 7.5 } });
    P.scatter(10, -44, -44, 44, 44, ['car', 'rubble', 'crate_stack', 'sandbags']);
  },

  /** Construction site: a U-shaped site road, a concrete frame with scaffolding, a tower crane, cabins. */
  construction(P) {
    P.startAt(0, 41);
    P.menu(-30, 20, 40, 0, 3, 0);
    P.road(-40, -40, 40, -32);
    P.road(32, -32, 40, 40);
    P.road(10, 32, 32, 40);
    P.road(-40, -32, -32, 40);
    P.road(-32, 32, -10, 40);
    P.road(10, -16, 18, 32);
    P.road(-18, -16, -10, 32);
    P.road(-10, -16, 10, -8);
    P.loop('site', [[-36, -36], [36, -36], [36, 36], [14, 36], [14, -12], [-14, -12], [-14, 36], [-36, 36]], 4);
    for (const [x, z, fx, fz] of [[-31, -31, 1, 0], [31, -31, -1, 0], [-31, 31, 1, 0], [31, 31, -1, 0], [-9, -6, 1, 0], [9, 30, -1, 0]]) P.lamp(x, z, fx, fz, WHITE);
    const cols = frameColumns(14);
    const frame = P.put('frame', 0, 6, { w: 14, d: 12, h: 10.2, must: true });
    P.climbTo(frame, (cols[0] + cols[1]) / 2, { must: true });
    P.put('crane', 3, -4, { kind: 'tower', w: 22, h: 26, d: 2, must: true });
    const scaffold = P.put('scaffold', 0, 12.8, { yaw: Math.PI, w: 12, d: 1.6, h: 3.4, allow: ['p' + frame] });
    if (scaffold >= 0) P.climbTo(scaffold, 0, { kind: 'metalGray' });
    P.lot(-31.5, -31.5, -18.5, 31.5, { along: 'z', len: [8, 11], gap: [3, 6], depth: [5, 6.5], storeys: [1, 1], walls: ['corrugated', 'metalGray'], roof: 'flat', windowEvery: 2.8 });
    P.lot(18.5, -31.5, 31.5, 31.5, { along: 'z', len: [9, 14], gap: [3, 6], depth: [8, 12.5], storeys: [2, 2], walls: ['brick', 'concrete'], roof: null });
    P.scatter(14, -31.5, -31.5, 31.5, -16.5, ['pipe', 'rebar', 'pallet', 'container', 'crate_stack', 'rubble']);
    P.scatter(10, -9.5, 18.5, 9.5, 38, ['rebar', 'pallet', 'crate_stack', 'pipe', 'rubble']);
    P.scatter(8, -44, -44, 44, 44, ['fence'], { fence: { w: 6, h: 2, d: 0.1, kind: 'siteFence' } });
    P.scatter(8, -40, -40, 40, 40, ['car', 'container', 'jersey']);
  },
};

const layouts = new Map();

/**
 * The layout of a generated map, built once per id (the same object on every call: do not change it).
 * Throws for 'block' (built by hand in src/world/level.js) and for unknown ids.
 */
export function generateLayout(id) {
  if (!Object.prototype.hasOwnProperty.call(PLANS, id)) throw new Error(`mapgen: no generated map '${id}'`);
  let L = layouts.get(id);
  if (!L) {
    const plan = new Plan(id);
    PLANS[id](plan);
    L = plan.finish();
    layouts.set(id, L);
  }
  return L;
}
