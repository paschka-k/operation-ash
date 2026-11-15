// The riders' vehicles as the player sees them: an electric scooter, a skateboard, a dirt bike and
// the gang leader's heavy motorbike, all built here from code in the style of the weapons in hand
// (weapons/sculpt.js): parts cut from outlines, turned and rounded, painted per vertex with colour,
// metalness, roughness and glow, poured into one geometry per kind.
//
// Every kind is one pool of copies (world/pool.js): all scooters are one draw call, and the shadow maps
// and the ambient occlusion pass draw a few boxes in place of the model. A shot-out vehicle moves to a
// second pool of its kind that holds the wreck: charred, the front twisted, the lights out, the board
// snapped. The wheels roll with the distance driven (a per-copy attribute turns them in the shader).
//
// Sizes follow VEHICLES (core/rules): length along the heading (+z of the model), width across it,
// height up from the ground. The rider's body frame sits at the middle of the vehicle, so the deck,
// the seat and the footpegs are placed where the riding poses of enemies/soldier.js put the feet and
// the pelvis (seatY in core/rules: deck 0.16 on the scooter, 0.11 on the board; seats under the hips).
//
//   const vehicles = createVehicles(game);
//   const h = vehicles.add('moto');                        // a copy of that kind, or a handle without a copy when the pool is full
//   vehicles.place(h, x, y, z, heading, lean, roll);       // every frame while it moves
//   vehicles.wreck(h);                                     // from now on it is a wreck (lying down comes from lean)
//   vehicles.remove(h); vehicles.clear();

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InstancePool } from '../world/pool.js';
import { VEHICLES } from '../core/rules.js';
import { Sculpt, PAINT, place as at } from '../weapons/sculpt.js';

const CAPACITY = 16;          // per kind: the riders on the streets, and as many wrecks
const UV_SCALE = 3;           // repeats of the grime texture per metre
const SPIN_WRAP = 1000;       // metres: the rolled distance wraps here, so it never loses precision
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// ------------------------------------------------------------------ paints
const C = {
  tyre: { color: 0x171717, metal: 0, rough: 0.93 },
  rim: { color: 0x8c9096, metal: 0.9, rough: 0.34 },
  rimBlack: { color: 0x1e1f22, metal: 0.65, rough: 0.42 },
  chrome: { color: 0xd4d8de, metal: 1, rough: 0.16 },
  alu: { color: 0x9a9ea3, metal: 0.85, rough: 0.42 },
  steel: PAINT.steel,
  frame: { color: 0x1c1d20, metal: 0.45, rough: 0.5 },
  black: { color: 0x18191b, metal: 0.05, rough: 0.6 },
  rubber: PAINT.rubber,
  seat: { color: 0x161412, metal: 0, rough: 0.7 },
  headlight: { color: 0xfff1d6, metal: 0, rough: 0.2, glow: 2.4 },
  tail: { color: 0xff1a0c, metal: 0, rough: 0.3, glow: 1.8 },
  amber: { color: 0xff8a1c, metal: 0, rough: 0.35, glow: 0.6 },
  screen: { color: 0x3cc0ff, metal: 0, rough: 0.3, glow: 0.8 },
  glass: { color: 0x1a262c, metal: 0.5, rough: 0.06 },
  olive: PAINT.olive, oliveDark: PAINT.oliveDark, hazard: PAINT.hazard,
  maple: { color: 0xb38a55, metal: 0, rough: 0.72 },
  grip: { color: 0x131313, metal: 0, rough: 0.98 },
  urethane: { color: 0xd8cdb0, metal: 0, rough: 0.55 },
  bushing: { color: 0xc23a1c, metal: 0, rough: 0.6 },
  graphic: { color: 0x8a1c14, metal: 0, rough: 0.6 },
  tan: { color: 0x8f7a52, metal: 0.05, rough: 0.58 },
  tanDark: { color: 0x66573a, metal: 0.05, rough: 0.66 },
  spring: { color: 0xc09228, metal: 0.6, rough: 0.4 },
  chain: { color: 0x2a2826, metal: 0.8, rough: 0.55 },
  gunmetal: { color: 0x2b2e32, metal: 0.7, rough: 0.36 },
  blood: { color: 0x7e1610, metal: 0.25, rough: 0.42 },
  plate: { color: 0x4d5054, metal: 0.8, rough: 0.52 },
  bolt: { color: 0xa0a3a8, metal: 1, rough: 0.35 },
};

// A wreck is charred: dark, dull, and its lights are out.
const SOOT = new THREE.Color(0x15120f);
const burntCache = new WeakMap();
function burnt(paint) {
  let b = burntCache.get(paint);
  if (!b) {
    const c = new THREE.Color(paint.color).lerp(SOOT, paint.metal > 0.6 ? 0.55 : 0.78);
    b = { color: c.getHex(), metal: (paint.metal ?? 0) * 0.35, rough: Math.min(1, 0.55 + (paint.rough ?? 0.8) * 0.5), glow: 0 };
    burntCache.set(paint, b);
  }
  return b;
}

// ----------------------------------------------------------------- helpers
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const UP = new THREE.Vector3(0, 1, 0);

/** A cylinder from point a to point b. */
function rod(s, part, paint, a, b, r, seg = 8, rb = r) {
  const A = V3(a), B = V3(b), d = B.clone().sub(A), len = d.length();
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), _s);
  return s.add(part, new THREE.CylinderGeometry(r, rb, len, seg), paint, m);
}

/** A bent tube through the given points. */
function pipe(s, part, paint, pts, r, seg = 8) {
  for (let i = 0; i + 1 < pts.length; i++) {
    rod(s, part, paint, pts[i], pts[i + 1], r, seg);
    if (i > 0) s.add(part, new THREE.SphereGeometry(r, seg, 4), paint, at(...pts[i]));
  }
}

/** A round part on an axle along x: profile [[x, r], ...] with x growing, turned about the x axis. */
function spun(s, part, paint, profile, seg = 24, hard = false, matrix = null) {
  const pts = [];
  profile.forEach(([x, r], i) => {
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), x));
    if (hard && i > 0 && i < profile.length - 1) pts.push(new THREE.Vector2(Math.max(r, 1e-4), x));
  });
  const g = new THREE.LatheGeometry(pts, seg).rotateZ(-Math.PI / 2);
  return s.add(part, g, paint, matrix);
}

/** A band along an arc in the side view around (cz, cy): angles from a0 to a1 (0 ahead, PI/2 up), radii r0 to r1. */
function arcBand(s, part, paint, cz, cy, r0, r1, a0, a1, width, { x = 0, n = 10, bevel = 0.004 } = {}) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cz + Math.cos(a) * r1, cy + Math.sin(a) * r1]); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cz + Math.cos(a) * r0, cy + Math.sin(a) * r0]); }
  return s.prism(part, paint, pts, width, { x, bevel });
}

/** Turn by `angle` about the axis through point p with direction d. */
function about(p, d, angle, then = null) {
  const m = new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])
    .multiply(new THREE.Matrix4().makeRotationAxis(V3(d).normalize(), angle))
    .multiply(new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
  return then ? m.multiply(then) : m;
}
const moveTo = (y, z) => new THREE.Matrix4().makeTranslation(0, y, z);

/**
 * A wheel at the origin on an axle along x: tyre, rim, hub, and wire spokes, cast spokes, a brake disc,
 * knobs on the tread as asked. R: outer radius of the tyre, rim: its inner radius, width across.
 */
function wheel(s, part, p, o) {
  const { R, rim, width } = o, hw = width / 2, c = Math.min(hw * 0.75, (R - rim) * 0.5);
  const ox = o.x || 0, shift = new THREE.Matrix4().makeTranslation(ox, 0, 0);
  spun(s, part, p(o.tyre || C.tyre), [
    [-hw * 0.8, rim - 0.004], [-hw, rim + (R - rim) * 0.3], [-hw, R - c], [-hw + c * 0.3, R - c * 0.3], [-hw + c, R],
    [hw - c, R], [hw - c * 0.3, R - c * 0.3], [hw, R - c], [hw, rim + (R - rim) * 0.3], [hw * 0.8, rim - 0.004],
  ], 30, false, shift);
  const rw = hw * 0.84, rin = rim - Math.max(0.012, (R - rim) * 0.25);
  spun(s, part, p(o.rimPaint || C.rim), [[-rw, rin], [-rw, rim + 0.003], [rw, rim + 0.003], [rw, rin], [-rw, rin]], 30, true, shift);
  const hubR = o.hubR || 0.035, hubW = o.hubW || hw * 0.7;
  spun(s, part, p(o.hubPaint || C.alu), [[-hubW, 1e-4], [-hubW, hubR], [hubW, hubR], [hubW, 1e-4]], 16, true, shift);
  if (o.spokes) {
    for (let i = 0; i < o.spokes; i++) {
      const a = (i / o.spokes) * Math.PI * 2, side = i % 2 ? 1 : -1, b = a + side * 0.22;
      rod(s, part, p(o.spokePaint || C.steel), [ox + side * hubW * 0.8, Math.cos(a) * hubR * 0.8, Math.sin(a) * hubR * 0.8],
        [ox + side * rw * 0.25, Math.cos(b) * rin, Math.sin(b) * rin], 0.0032, 4);
    }
  }
  if (o.cast) {
    const len = rin - hubR + 0.01, mid = (rin + hubR) / 2;
    for (let i = 0; i < o.cast; i++) {
      const a = (i / o.cast) * Math.PI * 2;
      const m = shift.clone().multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(0, mid, 0));
      s.add(part, new THREE.BoxGeometry(o.castW || hw * 0.6, len, o.castT || 0.03), p(o.castPaint || o.rimPaint || C.rim), m);
    }
  }
  if (o.disc) {
    s.cyl(part, p(C.steel), o.disc, 0.005, ox + hw * 0.62, 0, 0, 'x', 24);
    s.cyl(part, p(C.black), o.disc * 0.55, 0.007, ox + hw * 0.62, 0, 0, 'x', 12);
  }
  if (o.sprocket) s.cyl(part, p(C.chain), o.sprocket, 0.006, ox + hw * 0.7, 0, 0, 'x', 20);
  if (o.knobs) {
    for (let i = 0; i < o.knobs; i++) {
      for (const row of [-1, 1]) {
        const a = ((i + (row > 0 ? 0.5 : 0)) / o.knobs) * Math.PI * 2;
        const m = shift.clone().multiply(new THREE.Matrix4().makeRotationX(a)).multiply(new THREE.Matrix4().makeTranslation(row * hw * 0.42, R + 0.004, 0));
        s.add(part, new THREE.BoxGeometry(hw * 0.62, 0.014, 0.03), p(C.tyre), m);
      }
    }
  }
}

// ------------------------------------------------------------- the scooter
// An electric scooter in olive paint: deck at 0.16, two small wheels, a hub motor at the back, a tall
// stem with a lamp, a display and a wide bar. The wreck has its stem folded back over the deck.
function scooter(s, p, wreck) {
  const B = 'body', F = 'fork', T = 'stem';
  const R = 0.1, front = [0.1, 0.455], rear = [0.1, -0.43];
  wheel(s, 'wheelF', p, { R, rim: 0.066, width: 0.055, hubR: 0.028, cast: 5, castW: 0.026, castT: 0.018, rimPaint: C.black });
  wheel(s, 'wheelR', p, { R, rim: 0.066, width: 0.058, hubR: 0.056, hubW: 0.026, hubPaint: C.alu, rimPaint: C.black });
  // deck, grip mat, battery underneath, reflective strips
  s.prism(B, p(C.olive), [[-0.345, 0.11], [-0.33, 0.152], [0.27, 0.152], [0.3, 0.13], [0.3, 0.096], [0.27, 0.075], [-0.3, 0.075], [-0.345, 0.095]], 0.205, { bevel: 0.012 });
  s.box(B, p(C.grip), 0.172, 0.008, 0.53, 0, 0.156, -0.03, 0, 0, 0, 0.003);
  s.box(B, p(C.black), 0.15, 0.03, 0.42, 0, 0.068, -0.02, 0, 0, 0, 0.008);
  for (const x of [-1, 1]) s.box(B, p(C.amber), 0.004, 0.012, 0.42, x * 0.1035, 0.128, -0.03, 0, 0, 0, 0);
  // rear: side plates down to the axle, the fender and the tail light
  for (const x of [-1, 1]) s.prism(B, p(C.frame), [[-0.3, 0.13], [-0.44, 0.115], [-0.452, 0.09], [-0.42, 0.083], [-0.3, 0.09]], 0.012, { x: x * 0.042, bevel: 0.003 });
  arcBand(s, B, p(C.black), rear[1], rear[0], 0.112, 0.125, Math.PI * 0.42, Math.PI * 1.06, 0.076);
  s.box(B, p(C.tail), 0.05, 0.016, 0.012, 0, 0.098, -0.562, 0, 0, 0, 0.003);
  // the kickstand folded along the left side
  rod(s, B, p(C.frame), [0.09, 0.085, -0.05], [0.098, 0.075, -0.24], 0.007, 6);
  // front: neck from the deck, the folding latch, crown and fork blades, front fender
  s.prism(F, p(C.olive), [[0.27, 0.152], [0.42, 0.225], [0.445, 0.19], [0.44, 0.165], [0.3, 0.092]], 0.08, { bevel: 0.01 });
  s.box(F, p(C.frame), 0.065, 0.075, 0.06, 0, 0.215, 0.39, 0, 0, 0, 0.01);
  s.box(F, p(C.hazard), 0.07, 0.014, 0.04, 0, 0.255, 0.37, 0.4, 0, 0, 0.003);
  s.box(F, p(C.frame), 0.1, 0.03, 0.045, 0, 0.245, 0.437, 0, 0, 0, 0.008);
  for (const x of [-1, 1]) rod(s, F, p(C.frame), [x * 0.036, 0.245, 0.438], [x * 0.036, 0.1, 0.455], 0.011, 6);
  s.cyl(F, p(C.steel), 0.01, 0.09, 0, 0.1, 0.455, 'x', 8);
  arcBand(s, F, p(C.olive), front[1], front[0], 0.112, 0.124, Math.PI * 0.12, Math.PI * 0.62, 0.07);
  // the stem: olive below, telescopic aluminium above, the lamp, then the bar
  const s0 = [0, 0.25, 0.43], s1 = [0, 1.1, 0.352];
  rod(s, T, p(C.olive), s0, lerp3(s0, s1, 0.45), 0.024, 12);
  rod(s, T, p(C.alu), lerp3(s0, s1, 0.43), s1, 0.019, 12);
  const lamp = lerp3(s0, s1, 0.62);
  s.cyl(T, p(C.black), 0.036, 0.045, 0, lamp[1], lamp[2] + 0.04, 'z', 14);
  s.add(T, new THREE.CircleGeometry(0.03, 14), p(C.headlight), at(0, lamp[1], lamp[2] + 0.0631));
  s.box(T, p(C.black), 0.05, 0.03, 0.04, 0, 1.1, 0.352, 0, 0, 0, 0.008);
  rod(s, T, p(C.black), [-0.24, 1.115, 0.345], [0.24, 1.115, 0.345], 0.012, 10);
  for (const x of [-1, 1]) {
    rod(s, T, p(C.rubber), [x * 0.17, 1.115, 0.345], [x * 0.245, 1.115, 0.345], 0.019, 10);
    rod(s, T, p(C.alu), [x * 0.1, 1.124, 0.352], [x * 0.2, 1.11, 0.39], 0.005, 5);
  }
  s.box(T, p(C.black), 0.075, 0.022, 0.055, 0, 1.135, 0.352, -0.2, 0, 0, 0.006);
  s.box(T, p(C.screen), 0.055, 0.003, 0.034, 0, 1.147, 0.354, -0.2, 0, 0, 0);
  s.box(T, p(C.black), 0.025, 0.03, 0.03, -0.155, 1.12, 0.37, 0, 0, 0, 0.005);
  const twist = about([0, 0.25, 0.43], [0, 1, -0.09], 0.55);
  return [
    { name: B }, { name: F, m: wreck ? twist : null },
    { name: T, m: wreck ? about([0, 0.25, 0.43], [1, 0, 0], -1.15, twist.clone()) : null },
    { name: 'wheelF', m: wreck ? twist.clone().multiply(moveTo(...front)) : moveTo(...front), wheel: wreck ? null : [...front, R] },
    { name: 'wheelR', m: moveTo(...rear), wheel: wreck ? null : [...rear, R] },
  ];
}

function scooterProxy() {
  return [
    new THREE.BoxGeometry(0.19, 0.075, 0.66).translate(0, 0.115, -0.03),
    new THREE.BoxGeometry(0.05, 0.17, 0.17).translate(0, 0.1, 0.455),
    new THREE.BoxGeometry(0.05, 0.17, 0.17).translate(0, 0.1, -0.43),
    new THREE.BoxGeometry(0.04, 0.86, 0.04).rotateX(-0.092).translate(0, 0.675, 0.391),
    new THREE.BoxGeometry(0.46, 0.03, 0.03).translate(0, 1.115, 0.345),
  ];
}

// ---------------------------------------------------------------- the board
/** Outline of a deck seen from above, [x, z] round its edge, length L and width W, the ends round. */
function deckShape(L, W, z0 = -Infinity, z1 = Infinity) {
  const r = W / 2, flat = L / 2 - r, pts = [];
  const push = (x, z) => { if (z >= z0 - 1e-6 && z <= z1 + 1e-6) pts.push([x, z]); };
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; push(Math.cos(a) * r, flat + Math.sin(a) * r); }
  for (let z = flat; z >= -flat; z -= 0.04) push(-r, z);
  for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; push(Math.cos(a) * r, -flat + Math.sin(a) * r); }
  for (let z = -flat; z <= flat; z += 0.04) push(r, z);
  return pts;
}

/** A slab of the deck outline, `t` thick with its top at y, the ends kicked up by `rise`. */
function deckSlab(pts, y, t, rise, scale = 1) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * scale, z * (scale === 1 ? 1 : 0.995))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(Math.PI / 2).translate(0, y, 0);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const k = THREE.MathUtils.smoothstep(Math.abs(P.getZ(i)), 0.27, 0.41);
    P.setY(i, P.getY(i) + rise * k * k);
  }
  g.computeVertexNormals();
  return g;
}

// A skateboard: maple deck with grip tape and a red graphic below, kicked tails, aluminium trucks,
// four urethane wheels. The wreck is snapped in the middle.
function skate(s, p, wreck) {
  const R = 0.027, wz = 0.235, y = 0.11, t = 0.012, rise = 0.012;
  for (const name of ['wheelsF', 'wheelsR']) {
    for (const x of [-1, 1]) wheel(s, name, p, { x: x * 0.099, R, rim: 0.012, width: 0.034, hubR: 0.011, hubW: 0.012, tyre: C.urethane, rimPaint: C.urethane, hubPaint: C.steel });
  }
  const halves = wreck ? [['deckF', 0.012, Infinity], ['deckR', -Infinity, 0.012]] : [['deck', -Infinity, Infinity]];
  for (const [name, z0, z1] of halves) {
    const pts = deckShape(0.82, 0.21, z0, z1);
    s.add(name, deckSlab(pts, y, t, rise), p(C.maple));
    s.add(name, deckSlab(pts, y + 0.0016, 0.0016, rise, 0.985), p(C.grip));
    s.add(name, deckSlab(pts, y - t + 0.0004, 0.0009, rise, 0.97), p(C.graphic));
  }
  // trucks: baseplate, hanger, kingpin bushing, axle
  for (const z of [-wz, wz]) {
    const name = wreck ? (z > 0 ? 'deckF' : 'deckR') : 'deck';
    s.box(name, p(C.alu), 0.055, 0.01, 0.085, 0, y - t - 0.005, z, 0, 0, 0, 0.002);
    s.box(name, p(C.alu), 0.04, 0.044, 0.03, 0, 0.066, z, 0, 0, 0, 0.004);
    s.box(name, p(C.alu), 0.13, 0.022, 0.026, 0, 0.034, z, 0, 0, 0, 0.005);
    s.cyl(name, p(C.bushing), 0.011, 0.016, 0, 0.07, z - Math.sign(z) * 0.016, 'y', 8);
    s.cyl(name, p(C.steel), 0.0042, 0.236, 0, R, z, 'x', 6);
  }
  if (!wreck) {
    return [{ name: 'deck' }, { name: 'wheelsF', m: moveTo(R, wz), wheel: [R, wz, R] }, { name: 'wheelsR', m: moveTo(R, -wz), wheel: [R, -wz, R] }];
  }
  const fold = 0.32;
  return [
    { name: 'deckF', m: about([0, y, 0.012], [1, 0, 0], fold) }, { name: 'deckR', m: about([0, y, 0.012], [1, 0, 0], -fold) },
    { name: 'wheelsF', m: about([0, y, 0.012], [1, 0, 0], fold, moveTo(R, wz)) }, { name: 'wheelsR', m: about([0, y, 0.012], [1, 0, 0], -fold, moveTo(R, -wz)) },
  ];
}

function skateProxy() {
  return [new THREE.BoxGeometry(0.2, 0.085, 0.76).translate(0, 0.065, 0)];
}

// --------------------------------------------------------------- the bike
// A dirt bike in desert tan: knobby wheels on wire spokes, a single-cylinder engine, the exhaust high on
// the right, a long flat seat at the rider's hips, footpegs under the balls of his feet, a number plate
// with the lamp up front. The wreck has its front twisted round the steering head, mirrors gone.
function moto(s, p, wreck) {
  const B = 'body', F = 'fork';
  const front = [0.33, 0.68], rear = [0.33, -0.66], R = 0.33;
  wheel(s, 'wheelF', p, { R, rim: 0.245, width: 0.09, hubR: 0.04, spokes: 18, knobs: 26, disc: 0.12, rimPaint: C.alu });
  wheel(s, 'wheelR', p, { R, rim: 0.24, width: 0.12, hubR: 0.045, spokes: 18, knobs: 26, sprocket: 0.09, rimPaint: C.alu });
  // fork along the steering axis, from the top clamp to the axle
  const top = [0, 0.985, 0.372], axle = [0, ...front], on = (t) => lerp3(top, axle, t);
  for (const x of [-1, 1]) {
    const q = (pt) => [x * 0.075, pt[1], pt[2]];
    rod(s, F, p(C.spring), q(on(0)), q(on(0.55)), 0.025, 12);
    rod(s, F, p(C.black), q(on(0.45)), q(on(0.98)), 0.032, 12);
  }
  s.cyl(F, p(C.steel), 0.012, 0.2, 0, front[0], front[1], 'x', 8);
  s.box(F, p(C.alu), 0.2, 0.035, 0.07, ...on(0), 0, 0, 0, 0.01);
  s.box(F, p(C.alu), 0.2, 0.035, 0.07, ...on(0.19), 0, 0, 0, 0.01);
  s.box(F, p(C.black), 0.06, 0.1, 0.05, 0.06, 0.42, 0.63, -0.44, 0, 0, 0.01);
  // bar on risers, grips, levers, hand guards, mirrors
  const bar = [[-0.385, 1.045, 0.315], [-0.18, 1.027, 0.352], [0.18, 1.027, 0.352], [0.385, 1.045, 0.315]];
  pipe(s, F, p(C.black), bar, 0.012, 10);
  for (const x of [-1, 1]) {
    rod(s, F, p(C.alu), [x * 0.05, 0.995, 0.37], [x * 0.05, 1.03, 0.355], 0.014, 8);
    rod(s, F, p(C.rubber), [x * 0.29, 1.038, 0.328], [x * 0.39, 1.046, 0.313], 0.018, 10);
    rod(s, F, p(C.alu), [x * 0.2, 1.035, 0.36], [x * 0.33, 1.03, 0.4], 0.005, 5);
    s.prism(F, p(C.tan), [[0.31, 1.0], [0.36, 1.06], [0.42, 1.07], [0.45, 1.03], [0.4, 1.0]], 0.08, { x: x * 0.33, bevel: 0.008 });
    if (!wreck) {
      rod(s, F, p(C.black), [x * 0.23, 1.035, 0.355], [x * 0.27, 1.11, 0.37], 0.006, 5);
      s.box(F, p(C.black), 0.085, 0.05, 0.015, x * 0.275, 1.124, 0.372, 0, 0, 0, 0.006);
    }
  }
  // number plate with the lamp, front fender under the lower clamp
  const plate = new THREE.Matrix4().compose(V3([0, 0.82, 0.505]), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.44, 0, 0)), _s);
  s.add(F, new THREE.BoxGeometry(0.2, 0.24, 0.028), p(C.tan), plate);
  s.add(F, new THREE.BoxGeometry(0.11, 0.055, 0.012), p(C.headlight), plate.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.04, 0.018)));
  if (!wreck) s.prism(F, p(C.tan), [[0.44, 0.785], [0.62, 0.795], [0.85, 0.765], [1.0, 0.705], [1.02, 0.69], [0.99, 0.718], [0.85, 0.748], [0.62, 0.77], [0.44, 0.758]], 0.13, { bevel: 0.01 });
  // frame: steering head, spars to the swingarm pivot, the cradle under the engine, the subframe
  rod(s, B, p(C.frame), [0, 0.99, 0.37], [0, 0.85, 0.435], 0.036, 12);
  for (const x of [-1, 1]) {
    pipe(s, B, p(C.frame), [[x * 0.05, 0.93, 0.39], [x * 0.06, 0.66, 0.06], [x * 0.08, 0.42, -0.1]], 0.02);
    pipe(s, B, p(C.frame), [[x * 0.08, 0.7, -0.08], [x * 0.07, 0.73, -0.6]], 0.012);
    pipe(s, B, p(C.frame), [[x * 0.08, 0.42, -0.1], [x * 0.07, 0.7, -0.45]], 0.012);
  }
  pipe(s, B, p(C.frame), [[0, 0.86, 0.43], [0, 0.3, 0.37], [0, 0.18, 0.15], [0, 0.2, -0.06], [0, 0.42, -0.1]], 0.02);
  // tank (narrow where the thighs pass), radiator shrouds, seat, side panels, rear fender and lamp
  s.prism(B, p(C.tan), [[0.06, 0.73], [0.08, 0.85], [0.25, 0.93], [0.26, 0.78], [0.16, 0.72]], 0.12, { bevel: 0.03 });
  s.prism(B, p(C.tan), [[0.24, 0.76], [0.26, 0.92], [0.36, 0.955], [0.45, 0.92], [0.465, 0.86], [0.4, 0.78]], 0.21, { bevel: 0.05 });
  s.box(B, p(C.black), 0.07, 0.012, 0.06, 0, 0.958, 0.35, 0.2, 0, 0, 0.005);
  for (const x of [-1, 1]) s.prism(B, p(C.tan), [[0.25, 0.6], [0.3, 0.87], [0.46, 0.87], [0.51, 0.7], [0.42, 0.54]], 0.02, { x: x * 0.135, bevel: 0.006 });
  s.box(B, p(C.black), 0.24, 0.22, 0.04, 0, 0.69, 0.44, -0.3, 0, 0, 0.01);
  s.prism(B, p(C.seat), [[-0.62, 0.72], [-0.62, 0.762], [-0.3, 0.744], [0.0, 0.727], [0.13, 0.735], [0.2, 0.76], [0.22, 0.745], [0.13, 0.69], [-0.3, 0.68], [-0.6, 0.69]], 0.22, { bevel: 0.03 });
  for (const x of [-1, 1]) s.prism(B, p(C.tan), [[-0.56, 0.69], [-0.1, 0.68], [-0.06, 0.56], [-0.33, 0.5], [-0.56, 0.62]], 0.02, { x: x * 0.115, bevel: 0.006 });
  s.prism(B, p(C.tan), [[-0.6, 0.735], [-1.02, 0.865], [-1.03, 0.845], [-0.62, 0.69]], 0.19, { bevel: 0.006 });
  s.box(B, p(C.tail), 0.06, 0.03, 0.02, 0, 0.83, -0.985, -0.3, 0, 0, 0.004);
  // engine: crankcase, side covers, the finned cylinder leaning forward, its head
  s.box(B, p(C.gunmetal), 0.16, 0.27, 0.42, 0, 0.36, 0.1, 0, 0, 0, 0.03);
  s.cyl(B, p(C.alu), 0.09, 0.02, -0.09, 0.34, 0.0, 'x', 20);
  s.cyl(B, p(C.alu), 0.07, 0.02, 0.09, 0.36, 0.0, 'x', 16);
  const cyl = new THREE.Matrix4().compose(V3([0, 0.6, 0.255]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.38, 0, 0)), _s);
  s.add(B, new THREE.BoxGeometry(0.12, 0.2, 0.12), p(C.alu), cyl);
  for (let i = 0; i < 6; i++) s.add(B, new THREE.BoxGeometry(0.16, 0.008, 0.16), p(C.alu), cyl.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.07 + i * 0.026, 0)));
  s.add(B, new THREE.BoxGeometry(0.15, 0.05, 0.14), p(C.black), cyl.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.12, 0)));
  // exhaust: header round the right side, the silencer high under the side panel
  pipe(s, B, p(C.steel), [[-0.03, 0.6, 0.37], [-0.07, 0.45, 0.45], [-0.09, 0.3, 0.41], [-0.1, 0.2, 0.2], [-0.15, 0.42, -0.02], [-0.15, 0.6, -0.3]], 0.021);
  rod(s, B, p(C.alu), [-0.15, 0.6, -0.3], [-0.155, 0.73, -0.83], 0.052, 14);
  s.cyl(B, p(C.black), 0.035, 0.03, -0.155, 0.735, -0.845, 'z', 12);
  // swingarm, shock, chain, footpegs, kickstand
  for (const x of [-1, 1]) s.prism(B, p(C.alu), [[-0.08, 0.425], [-0.67, 0.355], [-0.69, 0.31], [-0.65, 0.295], [-0.08, 0.36]], 0.03, { x: x * 0.085, bevel: 0.008 });
  s.cyl(B, p(C.steel), 0.02, 0.22, 0, 0.4, -0.1, 'x', 10);
  rod(s, B, p(C.spring), [0, 0.7, -0.2], [0, 0.42, -0.3], 0.032, 12);
  rod(s, B, p(C.chain), [0.095, 0.4, -0.02], [0.095, 0.42, -0.66], 0.008, 5);
  rod(s, B, p(C.chain), [0.095, 0.29, -0.02], [0.095, 0.245, -0.66], 0.008, 5);
  for (const x of [-1, 1]) {
    s.box(B, p(C.steel), 0.1, 0.024, 0.05, x * 0.19, 0.25, 0.355, 0, 0, 0, 0.004);
    rod(s, B, p(C.frame), [x * 0.03, 0.29, 0.34], [x * 0.145, 0.25, 0.355], 0.012, 6);
  }
  rod(s, B, p(C.frame), [0.09, 0.3, -0.06], [0.11, 0.34, -0.36], 0.01, 6);
  const twist = about(top, [0, top[1] - axle[1], top[2] - axle[2]], 0.75);
  return [
    { name: B }, { name: F, m: wreck ? twist : null },
    { name: 'wheelF', m: wreck ? twist.clone().multiply(moveTo(...front)).multiply(new THREE.Matrix4().makeRotationZ(0.12)) : moveTo(...front), wheel: wreck ? null : [...front, R] },
    { name: 'wheelR', m: moveTo(...rear), wheel: wreck ? null : [...rear, R] },
  ];
}

function wheelProxy(r, w, y, z) { return new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(0, y, z); }

function motoProxy() {
  return [
    wheelProxy(0.31, 0.09, 0.33, 0.68), wheelProxy(0.31, 0.12, 0.33, -0.66),
    new THREE.BoxGeometry(0.2, 0.42, 0.62).translate(0, 0.42, 0.08),
    new THREE.BoxGeometry(0.2, 0.1, 1.15).translate(0, 0.72, -0.38),
    new THREE.BoxGeometry(0.22, 0.2, 0.42).translate(0, 0.83, 0.26),
    new THREE.BoxGeometry(0.15, 0.7, 0.06).rotateX(-0.44).translate(0, 0.67, 0.53),
    new THREE.BoxGeometry(0.74, 0.03, 0.03).translate(0, 1.03, 0.34),
  ];
}

// ------------------------------------------------------------ the boss bike
// The gang leader's heavy motorbike: gunmetal and blood red, fat tyres on cast wheels, a chromed V-twin,
// twin pipes down the right, a batwing fairing with armour plates bolted on and a tall screen, crash
// bars, armoured saddlebags and a sissy bar. The wreck loses the screen and twists its front.
function heavyMoto(s, p, wreck) {
  const B = 'body', F = 'fork';
  const front = [0.33, 0.86], rear = [0.34, -0.8];
  wheel(s, 'wheelF', p, { R: 0.33, rim: 0.225, width: 0.13, hubR: 0.05, cast: 6, castW: 0.04, castT: 0.04, castPaint: C.rimBlack, rimPaint: C.chrome, disc: 0.15 });
  wheel(s, 'wheelR', p, { R: 0.34, rim: 0.225, width: 0.2, hubR: 0.06, cast: 6, castW: 0.06, castT: 0.045, castPaint: C.rimBlack, rimPaint: C.chrome, sprocket: 0.12 });
  // raked fork: chromed tubes in black sliders
  const top = [0, 1.0, 0.46], axle = [0, ...front], on = (t) => lerp3(top, axle, t);
  for (const x of [-1, 1]) {
    const q = (pt) => [x * 0.12, pt[1], pt[2]];
    rod(s, F, p(C.chrome), q(on(0)), q(on(0.6)), 0.036, 14);
    rod(s, F, p(C.black), q(on(0.5)), q(on(0.98)), 0.048, 14);
  }
  s.cyl(F, p(C.steel), 0.016, 0.3, 0, front[0], front[1], 'x', 8);
  s.box(F, p(C.gunmetal), 0.32, 0.04, 0.09, ...on(0), 0, 0, 0, 0.012);
  s.box(F, p(C.gunmetal), 0.32, 0.04, 0.09, ...on(0.16), 0, 0, 0, 0.012);
  arcBand(s, F, p(C.gunmetal), front[1], front[0], 0.35, 0.366, Math.PI * 0.08, Math.PI * 0.66, 0.17, { n: 14 });
  // batwing fairing, the screen above it, twin lamps, armour plates and a red band across
  const wing = [[-0.43, 0.84], [-0.445, 0.95], [-0.35, 1.08], [-0.15, 1.13], [0.15, 1.13], [0.35, 1.08], [0.445, 0.95], [0.43, 0.84], [0.2, 0.77], [-0.2, 0.77]];
  // (ahead of the boss's knees, which come up to z 0.55)
  const fz = 0.58;
  s.frame(F, p(C.gunmetal), wing, null, 0.12, fz, { bevel: 0.025 });
  if (!wreck) {
    const screen = about([0, 1.1, fz + 0.05], [1, 0, 0], -0.38);
    s.frame(F, p(C.glass), [[-0.28, 1.1], [-0.25, 1.31], [0.25, 1.31], [0.28, 1.1]], null, 0.012, fz + 0.04, { bevel: 0.003, matrix: screen });
  }
  for (const x of [-1, 1]) {
    s.add(F, new THREE.TorusGeometry(0.06, 0.012, 6, 18), p(C.chrome), at(x * 0.11, 0.92, fz + 0.12));
    s.add(F, new THREE.CircleGeometry(0.058, 18), p(C.headlight), at(x * 0.11, 0.92, fz + 0.1205));
    s.box(F, p(C.plate), 0.17, 0.14, 0.016, x * 0.29, 0.95, fz + 0.123, 0, x * 0.12, x * 0.06, 0.004);
    for (const [dx, dy] of [[-0.065, 0.055], [0.065, 0.055], [-0.065, -0.055], [0.065, -0.055]]) {
      s.cyl(F, p(C.bolt), 0.008, 0.012, x * 0.29 + dx, 0.95 + dy, fz + 0.132, 'z', 6);
    }
  }
  s.box(F, p(C.blood), 0.52, 0.03, 0.012, 0, 1.045, fz + 0.123, 0, 0, 0, 0.004);
  // bar pulled back to the rider, grips
  pipe(s, F, p(C.chrome), [[-0.42, 1.09, 0.3], [-0.2, 1.06, 0.4], [0.2, 1.06, 0.4], [0.42, 1.09, 0.3]], 0.014, 10);
  for (const x of [-1, 1]) {
    rod(s, F, p(C.rubber), [x * 0.32, 1.078, 0.33], [x * 0.43, 1.091, 0.298], 0.02, 10);
    rod(s, F, p(C.chrome), [x * 0.06, 1.0, 0.45], [x * 0.06, 1.06, 0.41], 0.016, 8);
  }
  // frame
  rod(s, B, p(C.frame), [0, 1.0, 0.46], [0, 0.88, 0.53], 0.045, 12);
  for (const x of [-1, 1]) {
    pipe(s, B, p(C.frame), [[x * 0.06, 0.95, 0.47], [x * 0.11, 0.62, 0.48], [x * 0.11, 0.2, 0.36], [x * 0.11, 0.18, -0.25], [x * 0.11, 0.38, -0.32]], 0.022);
    pipe(s, B, p(C.frame), [[x * 0.06, 0.95, 0.42], [x * 0.08, 0.76, -0.12], [x * 0.12, 0.7, -0.75]], 0.02);
    pipe(s, B, p(C.frame), [[x * 0.11, 0.38, -0.32], [x * 0.12, rear[0], rear[1]], [x * 0.12, 0.7, -0.75]], 0.02);
  }
  // tank, narrow where the thighs pass, with red stripes
  s.prism(B, p(C.gunmetal), [[0.12, 0.78], [0.14, 0.9], [0.38, 0.99], [0.39, 0.79], [0.2, 0.77]], 0.15, { bevel: 0.04 });
  s.prism(B, p(C.gunmetal), [[0.34, 0.8], [0.36, 0.98], [0.44, 1.015], [0.52, 0.975], [0.545, 0.9], [0.48, 0.82]], 0.3, { bevel: 0.07 });
  for (const x of [-1, 1]) s.box(B, p(C.blood), 0.012, 0.035, 0.13, x * 0.149, 0.93, 0.45, 0, 0, 0, 0.004);
  s.box(B, p(C.blood), 0.05, 0.006, 0.3, 0, 1.0, 0.24, -0.1, 0, 0, 0.002);
  // stepped seat, sissy bar with its pad
  s.prism(B, p(C.seat), [[-0.76, 0.84], [-0.73, 0.865], [-0.43, 0.855], [-0.32, 0.765], [-0.1, 0.732], [0.05, 0.737], [0.1, 0.745], [0.08, 0.7], [-0.3, 0.665], [-0.73, 0.72]], 0.3, { bevel: 0.04 });
  for (const x of [-1, 1]) pipe(s, B, p(C.chrome), [[x * 0.13, 0.78, -0.82], [x * 0.12, 1.12, -0.86], [0, 1.16, -0.87]], 0.012);
  s.box(B, p(C.seat), 0.22, 0.14, 0.05, 0, 1.02, -0.84, -0.12, 0, 0, 0.02);
  // V-twin: crankcase, chromed covers, air filter, two finned cylinders under the tank
  s.box(B, p(C.gunmetal), 0.24, 0.27, 0.46, 0, 0.37, 0.05, 0, 0, 0, 0.04);
  s.cyl(B, p(C.chrome), 0.13, 0.04, 0.14, 0.33, -0.1, 'x', 24);
  s.cyl(B, p(C.chrome), 0.08, 0.035, -0.135, 0.42, 0.16, 'x', 18);
  s.cyl(B, p(C.chrome), 0.1, 0.05, -0.17, 0.6, 0.05, 'x', 24);
  s.cyl(B, p(C.black), 0.075, 0.052, -0.172, 0.6, 0.05, 'x', 18);
  for (const [z, tilt] of [[0.13, 0.45], [-0.03, -0.45]]) {
    const m = new THREE.Matrix4().compose(V3([0, 0.48, z]), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)), _s);
    for (let i = 0; i < 8; i++) s.add(B, new THREE.CylinderGeometry(0.085, 0.085, 0.012, 16).translate(0, 0.03 + i * 0.022, 0), p(i % 2 ? C.black : C.chrome), m);
    s.add(B, new THREE.CylinderGeometry(0.07, 0.07, 0.17, 14).translate(0, 0.1, 0), p(C.black), m);
    s.add(B, new THREE.BoxGeometry(0.15, 0.04, 0.16).translate(0, 0.21, 0), p(C.chrome), m);
  }
  // twin pipes low on the right, long mufflers
  pipe(s, B, p(C.chrome), [[-0.06, 0.58, 0.24], [-0.12, 0.45, 0.1], [-0.2, 0.25, 0.0], [-0.25, 0.25, -0.2], [-0.27, 0.29, -0.35]], 0.026);
  pipe(s, B, p(C.chrome), [[-0.06, 0.58, -0.12], [-0.2, 0.42, -0.2], [-0.29, 0.4, -0.35]], 0.026);
  rod(s, B, p(C.chrome), [-0.27, 0.29, -0.35], [-0.275, 0.33, -1.06], 0.05, 16);
  rod(s, B, p(C.chrome), [-0.29, 0.4, -0.35], [-0.295, 0.44, -1.0], 0.046, 16);
  // crash bars round the engine, footpegs under the balls of the boss's feet
  for (const x of [-1, 1]) {
    pipe(s, B, p(C.chrome), [[x * 0.1, 0.74, 0.5], [x * 0.38, 0.56, 0.5], [x * 0.36, 0.3, 0.6], [x * 0.12, 0.22, 0.6]], 0.016);
    s.box(B, p(C.steel), 0.12, 0.03, 0.065, x * 0.225, 0.157, 0.426, 0, 0, 0, 0.006);
    s.box(B, p(C.rubber), 0.1, 0.008, 0.05, x * 0.225, 0.175, 0.426, 0, 0, 0, 0.002);
    rod(s, B, p(C.frame), [x * 0.08, 0.2, 0.38], [x * 0.17, 0.157, 0.426], 0.014, 6);
  }
  // armoured saddlebags, rear fender, tail lamp
  for (const x of [-1, 1]) {
    s.box(B, p(C.gunmetal), 0.15, 0.32, 0.52, x * 0.395, 0.6, -0.72, 0, 0, 0, 0.04);
    s.box(B, p(C.plate), 0.012, 0.22, 0.4, x * 0.472, 0.6, -0.72, 0, 0, 0, 0.004);
    s.box(B, p(C.blood), 0.008, 0.03, 0.42, x * 0.478, 0.74, -0.72, 0, 0, 0, 0.002);
    for (const dz of [-0.17, 0.17]) s.cyl(B, p(C.bolt), 0.01, 0.012, x * 0.479, 0.6, -0.72 + dz, 'x', 6);
  }
  arcBand(s, B, p(C.gunmetal), rear[1], rear[0], 0.36, 0.38, Math.PI * 0.3, Math.PI * 1.05, 0.25, { n: 14 });
  s.box(B, p(C.tail), 0.12, 0.035, 0.02, 0, 0.6, -1.185, -0.5, 0, 0, 0.006);
  s.box(B, p(C.black), 0.16, 0.1, 0.01, 0, 0.5, -1.17, -0.3, 0, 0, 0.003);
  const twist = about(top, [0, top[1] - axle[1], top[2] - axle[2]], -0.6);
  return [
    { name: B }, { name: F, m: wreck ? twist : null },
    { name: 'wheelF', m: wreck ? twist.clone().multiply(moveTo(...front)) : moveTo(...front), wheel: wreck ? null : [...front, 0.33] },
    { name: 'wheelR', m: moveTo(...rear), wheel: wreck ? null : [...rear, 0.34] },
  ];
}

function heavyProxy() {
  return [
    wheelProxy(0.31, 0.13, 0.33, 0.86), wheelProxy(0.32, 0.2, 0.34, -0.8),
    new THREE.BoxGeometry(0.24, 0.42, 0.75).translate(0, 0.42, 0.04),
    new THREE.BoxGeometry(0.26, 0.12, 0.85).translate(0, 0.74, -0.35),
    new THREE.BoxGeometry(0.3, 0.2, 0.5).translate(0, 0.88, 0.28),
    new THREE.BoxGeometry(0.82, 0.3, 0.1).translate(0, 0.96, 0.64),
    new THREE.BoxGeometry(0.88, 0.28, 0.48).translate(0, 0.6, -0.72),
  ];
}

const BUILD = {
  scooter: { parts: scooter, proxy: scooterProxy },
  skate: { parts: skate, proxy: skateProxy, flip: true },
  moto: { parts: moto, proxy: motoProxy },
  heavyMoto: { parts: heavyMoto, proxy: heavyProxy },
};

// ------------------------------------------------------------------ assembly
/** Pour the parts into one geometry: each part moved by its matrix, the wheels marked to roll. */
function assemble(s, parts) {
  const list = [];
  for (const { name, m, wheel: w } of parts) {
    if (!s.has(name)) continue;
    const g = s.mesh(name, null, UV_SCALE).geometry;
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count, attr = new Float32Array(n * 3);
    if (w) for (let i = 0; i < n; i++) attr.set(w, i * 3);
    g.setAttribute('wheel', new THREE.BufferAttribute(attr, 3));
    list.push(g);
  }
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return out;
}

/**
 * Lowest point of the model under any lean, so a leaning or fallen vehicle rests on the ground and does
 * not sink into it: lift(lean) is how far to raise the copy (0 while it stands on its wheels).
 */
function liftTable(geometry) {
  // the lowest point at a lean is a corner of the outline seen from the front: keep only those
  const P = geometry.attributes.position, pts = [];
  for (let i = 0; i < P.count; i++) pts.push([P.getX(i), P.getY(i)]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.concat(upper);
  const N = 160, table = new Float32Array(N + 1);
  for (let k = 0; k <= N; k++) {
    const a = -Math.PI + (2 * Math.PI * k) / N, sa = Math.sin(a), ca = Math.cos(a);
    let low = Infinity;
    for (const [x, y] of hull) low = Math.min(low, -x * sa + y * ca);   // height after turning by -lean about z
    table[k] = Math.max(0, -low);
  }
  return (lean) => {
    const f = ((THREE.MathUtils.euclideanModulo(lean + Math.PI, 2 * Math.PI)) / (2 * Math.PI)) * N, k = Math.min(N - 1, Math.floor(f));
    return table[k] + (table[k + 1] - table[k]) * (f - k);
  };
}

/**
 * The model of a kind, whole or wrecked: {geometry, proxy, lift(lean), flip}. The live model is stretched
 * a little along and across so that its outline matches VEHICLES[kind] exactly; the wreck and the proxy
 * get the same stretch. The geometry carries per-vertex `color`, `surf` (metalness, roughness, glow) and
 * `wheel` (axle height, axle z, radius; zero off the wheels) and a per-copy `spin`.
 */
export function buildVehicleModel(kind, wrecked = false) {
  const V = VEHICLES[kind], def = BUILD[kind];
  const s = new Sculpt();
  const geometry = assemble(s, def.parts(s, wrecked ? burnt : (x) => x, wrecked));
  if (!wrecked && !FITS.has(kind)) {
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    FITS.set(kind, [V.width / (b.max.x - b.min.x), V.length / (b.max.z - b.min.z)]);
  }
  if (!FITS.has(kind)) buildVehicleModel(kind, false);
  const fit = FITS.get(kind);
  geometry.scale(fit[0], 1, fit[1]);
  geometry.setAttribute('spin', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const proxy = mergeGeometries(def.proxy(), false).scale(fit[0], 1, fit[1]);
  return { geometry, proxy, lift: liftTable(geometry), flip: wrecked && def.flip ? Math.PI / (Math.PI / 2 - 0.12) : 1, size: V, fit };
}

const FITS = new Map();   // kind -> [stretch across, stretch along] of its whole model

// ------------------------------------------------------------------ material
/** A small tiling grime texture (colour) and a roughness texture that goes with it. */
function grimeTextures() {
  const N = 128, col = new Uint8Array(N * N * 4), rgh = new Uint8Array(N * N * 4);
  const hash = (x, y, s) => {
    let h = Math.imul(x ^ Math.imul(y, 668265263) ^ Math.imul(s, 374761393), 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, cells, s) => {
    const k = cells / N, fx = x * k, fy = y * k, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const u = fx - x0, v = fy - y0, sm = (t) => t * t * (3 - 2 * t), su = sm(u), sv = sm(v);
    const w = (i) => ((i % cells) + cells) % cells;
    const a = hash(w(x0), w(y0), s), b = hash(w(x0 + 1), w(y0), s), c = hash(w(x0), w(y0 + 1), s), d = hash(w(x0 + 1), w(y0 + 1), s);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = 0.55 * noise(x, y, 6, 1) + 0.3 * noise(x, y, 14, 2) + 0.15 * noise(x, y, 40, 3);
      const dirt = THREE.MathUtils.smoothstep(n, 0.5, 0.78);
      const fine = noise(x, y, 64, 4);
      const v = 1 - 0.24 * dirt - 0.06 * fine;
      const i = (y * N + x) * 4;
      col[i] = col[i + 1] = Math.round(255 * v); col[i + 2] = Math.round(255 * v * (1 - 0.04 * dirt)); col[i + 3] = 255;
      rgh[i] = 255; rgh[i + 1] = Math.round(255 * (0.82 + 0.18 * dirt - 0.06 * fine)); rgh[i + 2] = 255; rgh[i + 3] = 255;
    }
  }
  const tex = (data) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(col), rough: tex(rgh) };
}

/**
 * The one material of every vehicle: colour from the vertices times the grime texture, metalness,
 * roughness and glow from `surf`, the wheels turned by `spin` about their axles. It goes through the
 * renderer's prepareMaterial (cascaded shadows) and adds its own lines after that.
 */
function vehicleMaterial(gr) {
  const tex = grimeTextures();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1, map: tex.map, roughnessMap: tex.rough });
  gr.prepareMaterial(m);
  const hook = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    if (hook) hook.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nattribute vec3 wheel;\nattribute float spin;\nvarying vec3 vSurf;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float wheelA = wheel.z > 0.0 ? spin / wheel.z : 0.0;
        float wheelC = cos( wheelA ), wheelS = sin( wheelA );
        objectNormal.yz = vec2( wheelC * objectNormal.y - wheelS * objectNormal.z, wheelS * objectNormal.y + wheelC * objectNormal.z );`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSurf = surf;
        if ( wheel.z > 0.0 ) {
          vec2 wd = transformed.yz - wheel.xy;
          transformed.yz = wheel.xy + vec2( wheelC * wd.x - wheelS * wd.y, wheelS * wd.x + wheelC * wd.y );
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor * vSurf.y, 0.05, 1.0 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurf.x;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.z;');
  };
  m.customProgramCacheKey = () => (key ? key.call(m) : '') + '+vehicle';
  m.needsUpdate = true;
  return m;
}

// ------------------------------------------------------------------- pools
export class Vehicles {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'vehicles';
    game.gr.scene.add(this.root);
    this.handles = new Set();
    this.material = vehicleMaterial(game.gr);
    this.pools = {};     // kind -> pool of the vehicles on the move
    this.wrecks = {};    // kind -> pool of the wrecks of that kind
    this.models = {};    // pool -> its model ({geometry, proxy, lift, flip})
    for (const kind of Object.keys(VEHICLES)) {
      for (const wrecked of [false, true]) {
        const model = buildVehicleModel(kind, wrecked);
        const pool = new InstancePool({ geometry: model.geometry, material: this.material, proxy: model.proxy, gr: game.gr, capacity: CAPACITY });
        pool.group.name = 'vehicles-' + kind + (wrecked ? '-wrecks' : '');
        pool.group.visible = false;
        this.models[pool.group.name] = model;
        (wrecked ? this.wrecks : this.pools)[kind] = pool;
        this.root.add(pool.group);
      }
    }
  }

  _sync(pool) { pool.group.visible = pool.count > 0; }   // an empty pool costs no draw call

  _pool(handle) { return (handle.wrecked ? this.wrecks : this.pools)[handle.kind]; }

  /** A new copy of `kind`, out of sight until it is placed. Returns its handle {kind, copy, wrecked}. */
  add(kind) {
    const pool = this.pools[kind];
    if (!pool) throw new Error('unknown vehicle ' + kind);
    const copy = pool.add(_m.makeScale(0, 0, 0));
    const handle = { kind, copy, wrecked: false, rolled: 0, px: null, pz: 0 };
    this.handles.add(handle);
    this._sync(pool);
    return handle;
  }

  /**
   * Put a copy at x, y, z (the ground under its centre) facing heading (the yaw of the game,
   * atan2(dx, dz)), leaning by `lean` about its length (into a turn, or onto its side as a wreck) and
   * pitched by `roll` about its width (nose up when positive). However it leans, it rests on the ground
   * instead of sinking into it; a wrecked board turns over as it falls. The wheels roll with the way made.
   */
  place(handle, x, y, z, heading = 0, lean = 0, roll = 0) {
    if (!handle || !handle.copy) return;
    const pool = this._pool(handle), model = this.models[pool.group.name];
    const l = lean * model.flip;
    _q.setFromEuler(_e.set(-roll, heading, -l, 'YXZ'));
    pool.set(handle.copy, _m.compose(_p.set(x, y + model.lift(l), z), _q, _s));
    if (handle.wrecked) return;
    if (handle.px !== null) {
      handle.rolled = (handle.rolled + (x - handle.px) * Math.sin(heading) + (z - handle.pz) * Math.cos(heading)) % SPIN_WRAP;
    }
    handle.px = x; handle.pz = z;
    const spin = model.geometry.attributes.spin;
    spin.array[handle.copy.i] = handle.rolled;
    spin.needsUpdate = true;
  }

  /** The vehicle is shot out: from now on it is drawn as a wreck, where it stood. */
  wreck(handle) {
    if (!handle || handle.wrecked) return;
    if (!this.handles.has(handle)) { handle.wrecked = true; return; }
    const live = this.pools[handle.kind], dead = this.wrecks[handle.kind];
    if (handle.copy) {
      live.detail.getMatrixAt(handle.copy.i, _m);
      live.remove(handle.copy);
      handle.copy = dead.add(_m);
    }
    handle.wrecked = true;
    this._sync(live); this._sync(dead);
  }

  remove(handle) {
    if (!handle || !this.handles.has(handle)) return;
    this.handles.delete(handle);
    const pool = this._pool(handle);
    if (handle.copy) pool.remove(handle.copy);
    handle.copy = null;
    this._sync(pool);
  }

  /** Remove every vehicle and wreck (new game, revival, the shop). */
  clear() {
    for (const h of this.handles) h.copy = null;
    this.handles.clear();
    for (const pool of [...Object.values(this.pools), ...Object.values(this.wrecks)]) { pool.clear(); this._sync(pool); }
  }

  /** Copies in use, wrecks included. */
  get count() { return this.handles.size; }
}

/** The pools of the riders' vehicles. Returns {add, place, wreck, remove, clear, pools, wrecks, count}. */
export function createVehicles(game) { return new Vehicles(game); }
