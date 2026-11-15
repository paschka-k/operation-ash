// The soldier the player sees. One skinned mesh per bot: a bot is one draw call in the colour
// pass and one per shadow cascade, where the old model of separate boxes cost 22 each.
// Parts are bound rigidly to twelve bones. Colour, roughness and metalness come from one small
// atlas per enemy type: sixteen flat swatches for gear and a sheet of camouflage cloth for the
// uniform. The arms are placed on the weapon by a two-bone solver instead of hand-tuned angles.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ENEMY_TYPES, VEHICLES } from '../core/rules.js';

// -------------------------------------------------------------------- atlas
const SLOTS = ['jacket', 'pants', 'vest', 'pouch', 'helmet', 'skin', 'cloth', 'glove', 'boot', 'metal', 'polymer', 'lens', 'strap', 'pad', 'plate', 'spare'];
const SLOT = Object.fromEntries(SLOTS.map((n, i) => [n, i]));
//                 [roughness, metalness]
const SURFACE = {
  jacket: [0.92, 0], pants: [0.92, 0], vest: [0.85, 0.05], pouch: [0.88, 0], helmet: [0.6, 0.15], skin: [0.7, 0],
  cloth: [0.95, 0], glove: [0.8, 0], boot: [0.75, 0], metal: [0.42, 0.85], polymer: [0.6, 0.1], lens: [0.1, 0.6],
  strap: [0.9, 0], pad: [0.7, 0], plate: [0.5, 0.5], spare: [1, 0],
};
// The uniform is cut from the camouflage sheet, trousers a shade darker than the jacket.
const UNIFORM = { jacket: 1, pants: 0.86 };

const ATLAS = 512;                   // pixels per side
const CELL = 32;                     // swatches: a 4 x 4 block of cells in the corner
const SHEET_X = 128;                 // the camouflage sheet starts here and runs to the right edge
const SHEET_M = [0.72, 0.96];        // metres of cloth the sheet covers (about 1.9 mm per pixel)
const swatchUv = (id) => [((id % 4) + 0.5) * CELL / ATLAS, (Math.floor(id / 4) + 0.5) * CELL / ATLAS];

// `accent` (LOOK) paints the spare swatch: a beanie, a stripe on a helmet, the bosses' marks.
function paletteColors(T, accent = 0xffffff) {
  const c = (hex) => new THREE.Color(hex);
  const uniform = c(T.uniform), vest = c(T.vest), helmet = c(T.helmet);
  return {
    jacket: uniform, pants: uniform, vest,
    pouch: vest.clone().lerp(uniform, 0.35).multiplyScalar(1.2), helmet, skin: c(T.skin).multiplyScalar(0.72),
    cloth: vest.clone().multiplyScalar(0.8), glove: c(0x1a1a18), boot: c(0x16130f), metal: c(0x2b2d31),
    polymer: c(0x1a1b1d), lens: c(0x0a0e12), strap: c(0x0e0e0d), pad: vest.clone().multiplyScalar(0.7),
    plate: helmet.clone().multiplyScalar(0.9), spare: c(accent),
  };
}

function hash2(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => noise2(x, y) * 0.6 + noise2(x * 2.3 + 11, y * 2.3 + 5) * 0.4;

// Four-tone disruptive pattern. x, y are metres of cloth; the result multiplies the base colour.
const TONES = { dark: [0.48, 0.54, 0.46], light: [1.36, 1.3, 1.12], earth: [0.86, 0.7, 0.54], base: [1, 1, 1] };
function clothTone(x, y) {
  if (fbm(x * 9, y * 7.5) > 0.6) return TONES.dark;
  if (fbm(x * 13 + 40, y * 11 + 17) > 0.62) return TONES.light;
  if (fbm(x * 22 + 91, y * 19 + 53) > 0.66) return TONES.earth;
  return TONES.base;
}

let surfaceTex = null;
function makeMaterial(T, contrast, accent) {
  const colors = paletteColors(T, accent);
  const rgb = new Uint8Array(ATLAS * ATLAS * 4);
  // the colour texture is sRGB, the numbers here are linear
  const enc = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  const put = (x, y, r, g, b) => {
    const i = (y * ATLAS + x) * 4;
    rgb[i] = enc(Math.min(r, 1)); rgb[i + 1] = enc(Math.min(g, 1)); rgb[i + 2] = enc(Math.min(b, 1)); rgb[i + 3] = 255;
  };
  const u = colors.jacket;
  for (let y = 0; y < ATLAS; y++) {
    for (let x = 0; x < ATLAS; x++) {
      if (x >= SHEET_X) {
        const t = clothTone((x - SHEET_X) / (ATLAS - SHEET_X) * SHEET_M[0], y / ATLAS * SHEET_M[1]);
        const weave = 0.93 + 0.14 * hash2(x, y);
        put(x, y, u.r * (1 + (t[0] - 1) * contrast) * weave, u.g * (1 + (t[1] - 1) * contrast) * weave, u.b * (1 + (t[2] - 1) * contrast) * weave);
      } else {
        const id = Math.min(Math.floor(y / CELL), 3) * 4 + Math.floor(x / CELL);
        const c = colors[SLOTS[id]];
        put(x, y, c.r, c.g, c.b);
      }
    }
  }
  const map = new THREE.DataTexture(rgb, ATLAS, ATLAS, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  if (!surfaceTex) {
    // same layout at a quarter of the size: green is roughness, blue is metalness
    const N = ATLAS / 4, orm = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const id = x * 4 >= SHEET_X ? SLOT.jacket : Math.min(Math.floor(y * 4 / CELL), 3) * 4 + Math.floor(x * 4 / CELL);
        orm.set([255, Math.round(SURFACE[SLOTS[id]][0] * 255), Math.round(SURFACE[SLOTS[id]][1] * 255), 255], (y * N + x) * 4);
      }
    }
    surfaceTex = new THREE.DataTexture(orm, N, N, THREE.RGBAFormat);
    surfaceTex.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({ map, roughnessMap: surfaceTex, metalnessMap: surfaceTex, roughness: 1, metalness: 1, vertexColors: true });
}

// ----------------------------------------------------------------- geometry
/** A limb hanging from the joint at the origin down to -len, round at both ends, tapering r0 to r1. */
function limb(r0, r1, len, radial = 10, rings = 4) {
  const pts = [], CAP = 3;
  for (let i = CAP; i >= 1; i--) { const a = (i / CAP) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(r1 * Math.cos(a), 1e-4), -len - r1 * Math.sin(a))); }
  for (let i = rings; i >= 0; i--) { const k = i / rings; pts.push(new THREE.Vector2(r0 + (r1 - r0) * k, -len * k)); }
  for (let i = 1; i <= CAP; i++) { const a = (i / CAP) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(r0 * Math.cos(a), 1e-4), r0 * Math.sin(a))); }
  return new THREE.LatheGeometry(pts, radial).rotateY(Math.PI);   // texture seam at the back
}

/** A body section: rings of [y, halfWidth, halfDepth] from bottom to top, each a rounded rectangle. */
function loft(rings, seg = 14, exp = 2.6) {
  const pos = [], uv = [], idx = [], n = rings.length, cols = seg + 1;
  const y0 = rings[0][0], y1 = rings[n - 1][0];
  for (const [y, hw, hd] of rings) {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2 - Math.PI / 2, c = Math.cos(a), s = Math.sin(a);   // the seam is at the back
      const k = Math.pow(Math.pow(Math.abs(c), exp) + Math.pow(Math.abs(s), exp), -1 / exp);
      pos.push(c * k * hw, y, s * k * hd);
      uv.push(j / seg, (y - y0) / (y1 - y0));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j, b = a + 1;
      idx.push(a, a + cols, b, b, a + cols, b + cols);
    }
  }
  const bottom = pos.length / 3;
  pos.push(0, y0, 0, 0, y1, 0);
  uv.push(0.5, 0, 0.5, 1);
  for (let j = 0; j < seg; j++) {
    idx.push(bottom, j, j + 1);
    idx.push(bottom + 1, (n - 1) * cols + j + 1, (n - 1) * cols + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const soft = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 1, r);
const tube = (r0, r1, h, seg = 10, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
const tubeZ = (r, len, seg = 8) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

/** Collects parts in the frames of their bones and merges them into one bind-pose geometry. */
class Parts {
  constructor(bones) { this.bones = bones; this.list = []; this.seed = 7; }

  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  /**
   * geo in the local frame of bone, moved to p, turned by r (Euler) and scaled by s.
   * Uniform parts (jacket, pants) pass cloth = [metres around, metres along]: their own texture
   * coordinates are then laid onto the camouflage sheet at that size.
   */
  add(geo, bone, slot, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], cloth = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s),
    );
    g.applyMatrix4(m);
    g.applyMatrix4(bone.matrixWorld);
    const n = g.attributes.position.count, id = SLOT[slot], bi = this.bones.indexOf(bone);
    const uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
    const pos = g.attributes.position, own = g.attributes.uv;
    const flat = swatchUv(id);
    let su = 0, sv = 0, ou = 0, ov = 0;
    if (cloth) {
      su = Math.min(0.96, cloth[0] / SHEET_M[0]); sv = Math.min(0.96, cloth[1] / SHEET_M[1]);
      ou = 0.02 + this.rnd() * (0.96 - su); ov = 0.02 + this.rnd() * (0.96 - sv);
    }
    const tint = UNIFORM[slot] ?? 1;
    for (let i = 0; i < n; i++) {
      if (cloth) {
        uv[i * 2] = (SHEET_X + (ou + own.getX(i) * su) * (ATLAS - SHEET_X)) / ATLAS;
        uv[i * 2 + 1] = ov + own.getY(i) * sv;
      } else { uv[i * 2] = flat[0]; uv[i * 2 + 1] = flat[1]; }
      si[i * 4] = bi; sw[i * 4] = 1;
      // dust and mud build up toward the boots
      const dirt = id === SLOT.pants || id === SLOT.boot ? 0.74 + 0.26 * THREE.MathUtils.smoothstep(pos.getY(i), 0.02, 0.6) : 1;
      col[i * 3] = tint * dirt; col[i * 3 + 1] = tint * dirt; col[i * 3 + 2] = tint * dirt * (dirt < 1 ? 0.95 : 1);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', pos);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.list.push(out);
    return this;
  }

  /** A uniform part: jacket or pants cloth of the given size in metres. */
  cloth(geo, bone, slot, around, along, p, r, s) { return this.add(geo, bone, slot, p, r, s, [around, along]); }

  build() {
    const merged = mergeVertices(mergeGeometries(this.list, false), 1e-5);
    for (const g of this.list) g.dispose();
    return merged;
  }
}

// ----------------------------------------------------------------- skeleton
const UPPER = 0.29, FORE = 0.29;   // shoulder to elbow, elbow to the middle of the hand
const DOWN = new THREE.Vector3(0, -1, 0);

// What each type wears. Balance numbers stay in core/rules, this is appearance only.
const LOOK = {
  grunt: { helmet: true, pack: 'small', pouches: 3, camo: 1 },
  rusher: { headset: true, pack: 'none', pouches: 2, elbowPads: true, camo: 0.55 },
  heavy: { helmet: true, visor: true, pack: 'large', pouches: 3, armor: true, elbowPads: true, camo: 0.8 },
  // ---- wave 14: riders and bosses. Head gear sets them apart at a distance: a cap on the scooter,
  // a beanie on the board, a full-face helmet on the motorbikes. The bosses wear their own armour,
  // all of it parts of the one skinned mesh: plates, pauldrons, a gorget, guards on forearms and shins.
  scooterRider: { cap: true, pack: 'none', pouches: 1, camo: 0.35 },
  skater: { beanie: true, pack: 'small', pouches: 2, elbowPads: true, camo: 0.3, accent: 0x8f6a22 },
  biker: { moto: true, pack: 'none', pouches: 2, elbowPads: true, shinGuards: true, camo: 0.2 },
  bossBiker: {
    moto: true, pack: 'none', pouches: 2, armor: true, elbowPads: true, shinGuards: true, gauntlets: true,
    pauldrons: 'spiked', chestPlate: true, collar: true, camo: 0.15, accent: 0xa3241a,
  },
  bossCommander: {
    helmet: true, visor: true, faceplate: true, pack: 'large', antenna: true, pouches: 4, armor: true, elbowPads: true,
    pauldrons: 'heavy', chestPlate: true, collar: true, gauntlets: true, thighPlates: true, shinGuards: true, camo: 0.9, accent: 0xb8902a,
  },
};

// ------------------------------------------------------------- riding poses
// Leg angles per stance: [hip flexion, hip spread] and [knee bend, knee twist back] for the right leg
// (legs[0]) and the left leg (legs[1]); a positive spread swings a leg out to its own side. `side` turns
// the pelvis across the board, `shift` moves it along the soldier's left (metres, before the turn).
// Measured on the rig so that the feet land where the vehicles (enemies/vehicles.js) have their deck,
// footpegs or board: a standing or skating rider's soles are on his body frame (the deck), a seated
// rider's soles are on the footpegs. There is no ankle: a shin that leans tips the boot with it, so the
// shins stay near upright where the whole sole has to lie flat.
const RIDE_POSE = {
  stand: { side: 0, shift: 0, hips: [[0.06, -0.06], [-0.1, -0.06]], knees: [[0, 0], [0.1, 0]], torso: 0.1 },
  skate: { side: Math.PI / 2, shift: -0.18, hips: [[-0.45, 0.17], [-0.45, 0.17]], knees: [[0.6, 0], [0.6, 0]], torso: 0.22 },
  // on a motorbike the knees grip the tank and the balls of the feet are on the pegs
  seat: { side: 0, shift: 0, hips: [[-1.35, 0.3], [-1.35, 0.3]], knees: [[1.75, -0.12], [1.75, -0.12]], torso: 0.3 },
};
// Where the riders of a stance stand when the rider's own type does not say: the seatY of the first
// vehicle of core/rules VEHICLES with that stance (scooter, skate, moto).
const STANCE_SEAT_Y = {};
for (const V of Object.values(VEHICLES)) if (!(V.stance in STANCE_SEAT_Y)) STANCE_SEAT_Y[V.stance] = V.seatY;
const SOLE = [new THREE.Vector3(0, -0.47, -0.08), new THREE.Vector3(0, -0.47, 0.18)];   // heel and toe, in the knee's frame
const _rm = new THREE.Matrix4(), _rv = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion();
const _rx = new THREE.Vector3(1, 0, 0), _ry = new THREE.Vector3(0, 1, 0);
const poseHips = new Map();   // stance -> height of the hip bone that puts the lowest sole on the frame

function applyLegs(model, P) {
  model.legs.forEach((leg, i) => {
    const out = i === 0 ? -1 : 1;
    leg.hip.rotation.set(P.hips[i][0], 0, out * P.hips[i][1]);
    leg.knee.rotation.set(P.knees[i][0], 0, out * P.knees[i][1]);
  });
}

/** Height of the hip bone that puts the lowest heel or toe of the pose exactly on the body frame. */
function standingHeight(model, stance, P) {
  let y = poseHips.get(stance);
  if (y !== undefined) return y;
  const { hips } = model;
  hips.position.set(0, 0.93, 0);
  hips.rotation.set(0, P.side, 0, 'ZYX');
  applyLegs(model, P);
  let low = Infinity;
  for (const leg of model.legs) {
    hips.updateMatrix(); leg.hip.updateMatrix(); leg.knee.updateMatrix();
    _rm.copy(hips.matrix).multiply(leg.hip.matrix).multiply(leg.knee.matrix);
    for (const p of SOLE) low = Math.min(low, _rv.copy(p).applyMatrix4(_rm).y);
  }
  y = 0.93 - low;
  poseHips.set(stance, y);
  return y;
}

/** Back to the soldier on foot: undoes every channel a riding pose sets beyond the walk's own. */
function footPose(model) {
  model.hips.position.set(0, 0.93, 0);
  model.hips.rotation.set(0, 0, 0, 'XYZ');
  for (const leg of model.legs) {
    leg.hip.rotation.set(leg.hip.rotation.x, 0, 0);
    leg.knee.rotation.set(leg.knee.rotation.x, 0, 0);
  }
  model.torso.rotation.set(0.06, model.torsoYaw, 0, 'XYZ');
  model.ride = null;
}

/**
 * Pose a soldier for riding, on top of the walk: call it every frame after the walk animation while he
 * rides. 'stand' upright on a scooter's deck one foot before the other, 'skate' knees bent, crosswise on
 * the board, 'seat' on a motorbike with the knees out round the tank and the boots on the footpegs.
 * stance null puts him back on foot (also done by itself on the first frame the walk moves his legs
 * again, so a rider who gets off walks normally even if nobody calls it).
 *
 * The chest, the arms and the gun keep the standing aim (MUZZLE stays true). A seated rider's hip bone
 * keeps its standing height, so the hit zones of core/combat stay on him; core/rules VEHICLES.seatY puts
 * his body frame at the deck or under the seat. lean: the vehicle's lean (the same number that goes to
 * vehicles.place); the rider tips with it about the ground under the vehicle.
 */
export function setRidePose(model, stance, lean = 0) {
  if (!stance || !RIDE_POSE[stance]) { if (model.ride) footPose(model); return; }
  const T = ENEMY_TYPES[model.type] || {};
  const P = RIDE_POSE[stance];
  const scale = T.scale || 1;
  const seatY = (T.vehicle && VEHICLES[T.vehicle] ? VEHICLES[T.vehicle].seatY : STANCE_SEAT_Y[stance]);
  const hy = stance === 'seat' ? 0.93 : standingHeight(model, stance, P);
  // lean about the ground under the vehicle, which lies seatY under the body frame
  const g = -seatY / scale, a = P.shift, b = hy - g, c = Math.cos(lean), s = Math.sin(lean);
  model.hips.position.set(a * c + b * s, g - a * s + b * c, 0);
  model.hips.rotation.set(0, P.side, -lean, 'ZYX');
  applyLegs(model, P);
  // the chest turns back from the pelvis to the standing aim: Ry(-side) Rx(lean forward) Ry(stance yaw)
  _rq.setFromAxisAngle(_ry, -P.side).multiply(_rq2.setFromAxisAngle(_rx, P.torso));
  model.torso.quaternion.copy(_rq.multiply(_rq2.setFromAxisAngle(_ry, model.torsoYaw)));
  if (!model.ride) {
    model.ride = { l: 0, r: 0 };
    // the walk only ever writes the legs' x: when it has, the rider is on foot again
    model.mesh.onBeforeRender = () => {
      const m = model.ride;
      if (m && (model.legs[0].hip.rotation.x !== m.r || model.legs[1].hip.rotation.x !== m.l)) footPose(model);
    };
  }
  model.ride.r = model.legs[0].hip.rotation.x;
  model.ride.l = model.legs[1].hip.rotation.x;
}

// Where the weapon sits in the frame of the standing body (x: the soldier's left, z: forward),
// where the hands hold it and how far the upper body turns into the stance.
// The skater's sub-machine gun is held out in front like the pistol, the left hand on its foregrip.
const STANCE = {
  rifle: { gun: [-0.09, 1.4, 0.27], yaw: -0.45, right: [0, -0.085, -0.035], left: [0, -0.05, 0.25], tip: [0, 0.008, 0.61] },
  pistol: { gun: [0, 1.4, 0.5], yaw: 0, right: [-0.012, -0.06, -0.04], left: [0.014, -0.065, -0.035], tip: [0, 0.012, 0.11] },
  smg: { gun: [0, 1.38, 0.36], yaw: 0, right: [-0.012, -0.065, -0.03], left: [0.004, -0.07, 0.125], tip: [0, 0.012, 0.25] },
};

/** Muzzle of each weapon in the body frame, for tracers, the aim laser and sound. */
export const MUZZLE = Object.fromEntries(Object.entries(STANCE).map(([k, s]) => [k, {
  side: s.gun[0] + s.tip[0], up: s.gun[1] + s.tip[1], fwd: s.gun[2] + s.tip[2],
}]));

/** Turn shoulder and elbow so the hand lands on target. Everything is in the torso frame. */
function solveArm(arm, target, pole) {
  const S = arm.shoulder.position;
  const d = target.clone().sub(S);
  const dir = d.clone().normalize();
  const dist = THREE.MathUtils.clamp(d.length(), 0.05, UPPER + FORE - 1e-3);
  const a = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const p = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = S.clone().addScaledVector(dir, a).addScaledVector(p, h);
  const H = S.clone().addScaledVector(dir, dist);
  arm.shoulder.quaternion.setFromUnitVectors(DOWN, E.clone().sub(S).normalize());
  const f = H.sub(E).normalize().applyQuaternion(arm.shoulder.quaternion.clone().invert());
  arm.elbow.quaternion.setFromUnitVectors(DOWN, f);
}

function makeRig(weapon) {
  const st = STANCE[weapon] || STANCE.rifle;
  const B = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent) parent.add(b); return b; };
  const hips = B(null, 0, 0.93, 0);
  const legs = [-1, 1].map((sx) => { const hip = B(hips, sx * 0.1, 0, 0); return { hip, knee: B(hip, 0, -0.46, 0) }; });
  const torso = B(hips, 0, 0.06, 0);
  torso.rotation.y = st.yaw;
  const head = B(torso, 0, 0.62, 0.01);
  head.rotation.set(0.05, -st.yaw * 0.9, st.yaw ? -0.1 : 0);
  // arms[0] is the soldier's right arm (x is the soldier's left)
  const arms = [-1, 1].map((sx) => { const shoulder = B(torso, sx * 0.205, 0.445, 0); return { shoulder, elbow: B(shoulder, 0, -UPPER, 0) }; });
  const gun = B(torso, 0, 0, 0);

  hips.updateMatrixWorld(true);
  const gunInBody = new THREE.Matrix4().makeTranslation(...st.gun);
  const toTorso = torso.matrixWorld.clone().invert();
  toTorso.clone().multiply(gunInBody).decompose(gun.position, gun.quaternion, gun.scale);
  const hand = (grip) => new THREE.Vector3(...grip).applyMatrix4(gunInBody).applyMatrix4(toTorso);
  const pole = (x, y, z) => new THREE.Vector3(x, y, z).transformDirection(toTorso);
  solveArm(arms[0], hand(st.right), pole(-0.55, -1, -0.25));
  solveArm(arms[1], hand(st.left), pole(0.5, -1, -0.1));
  hips.updateMatrixWorld(true);

  return {
    hips, legs, torso, head, arms, gun,
    torsoYaw: st.yaw,
    gunRest: gun.position.clone(),
    gunBack: new THREE.Vector3(0, 0, -1).applyQuaternion(gun.quaternion),   // recoil direction in the torso frame
    bones: [hips, legs[0].hip, legs[0].knee, legs[1].hip, legs[1].knee, torso, head, arms[0].shoulder, arms[0].elbow, arms[1].shoulder, arms[1].elbow, gun],
  };
}

// --------------------------------------------------------------- the figure
function buildGeometry(rig, look, weapon) {
  const P = new Parts(rig.bones);
  const { hips, legs, torso, head, arms, gun } = rig;

  // pelvis, belt
  P.cloth(loft([[-0.13, 0.07, 0.075], [-0.06, 0.15, 0.09], [0.03, 0.165, 0.102], [0.1, 0.16, 0.1]]), hips, 'pants', 0.9, 0.24);
  P.add(loft([[0.03, 0.183, 0.128], [0.09, 0.18, 0.125]]), hips, 'strap');
  P.add(soft(0.05, 0.085, 0.075, 0.012), hips, 'pouch', [0.19, 0.02, 0.0]);
  P.add(soft(0.05, 0.085, 0.075, 0.012), hips, 'pouch', [-0.19, 0.02, -0.02]);
  if (look.armor) P.add(soft(0.17, 0.15, 0.035, 0.012), hips, 'vest', [0, -0.06, 0.112]);

  for (const [i, leg] of legs.entries()) {
    const sx = i === 0 ? -1 : 1;
    P.cloth(limb(0.09, 0.066, 0.46, 10, 5), leg.hip, 'pants', 0.49, 0.62);
    P.cloth(limb(0.064, 0.05, 0.36, 10, 4), leg.knee, 'pants', 0.36, 0.47);
    P.add(soft(0.105, 0.12, 0.05, 0.018), leg.knee, 'pad', [0, -0.01, 0.052]);
    P.add(tube(0.058, 0.064, 0.17), leg.knee, 'boot', [0, -0.355, 0]);
    P.add(soft(0.105, 0.085, 0.265, 0.028), leg.knee, 'boot', [0, -0.4275, 0.05]);
    if (look.armor) P.add(soft(0.03, 0.2, 0.12, 0.01), leg.hip, 'vest', [sx * 0.085, -0.17, 0.0]);
    if (look.thighPlates) P.add(soft(0.15, 0.2, 0.045, 0.014), leg.hip, 'plate', [0, -0.16, 0.08], [0.05, 0, 0]);
    if (look.shinGuards) {
      P.add(soft(0.095, 0.25, 0.04, 0.014), leg.knee, 'plate', [0, -0.18, 0.058], [-0.04, 0, 0]);
      P.add(new THREE.SphereGeometry(0.062, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), leg.knee, 'plate', [0, -0.01, 0.045], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
    }
    if (weapon === 'pistol' && i === 0) P.add(box(0.045, 0.15, 0.075), leg.hip, 'polymer', [-0.1, -0.16, 0.0]);
    if (weapon === 'smg' && i === 0) P.add(soft(0.05, 0.13, 0.07, 0.01), leg.hip, 'pouch', [-0.1, -0.15, 0.0]);
  }

  // chest, plate carrier and what hangs on it
  P.cloth(loft([[-0.02, 0.125, 0.095], [0.07, 0.158, 0.105], [0.3, 0.195, 0.125], [0.43, 0.208, 0.122], [0.5, 0.17, 0.1], [0.545, 0.075, 0.07]]), torso, 'jacket', 1.0, 0.57);
  P.add(loft([[0.09, 0.185, 0.128], [0.15, 0.203, 0.143], [0.4, 0.214, 0.146], [0.465, 0.19, 0.13]], 14, 3.2), torso, 'vest');
  for (const sx of [-1, 1]) P.add(soft(0.085, 0.018, 0.24, 0.006), torso, 'vest', [sx * 0.128, 0.474, 0]);
  // a boss's chest plate takes the place of the pouches up front: they move down to the belly
  const pouchY = look.chestPlate ? 0.075 : 0.2;
  for (let k = 0; k < look.pouches; k++) {
    const x = (k - (look.pouches - 1) / 2) * 0.082;
    P.add(soft(0.072, 0.125, 0.048, 0.012), torso, 'pouch', [x, pouchY, 0.166]);
  }
  if (look.chestPlate) {
    P.add(soft(0.27, 0.2, 0.036, 0.016), torso, 'plate', [0, 0.33, 0.162], [-0.06, 0, 0]);
    P.add(soft(0.25, 0.055, 0.03, 0.012), torso, 'plate', [0, 0.2, 0.158]);
    P.add(soft(0.2, 0.02, 0.012, 0.004), torso, 'spare', [0, 0.36, 0.182], [-0.06, 0, 0]);
    P.add(soft(0.28, 0.3, 0.03, 0.014), torso, 'plate', [0, 0.3, -0.158]);
  } else {
    P.add(soft(0.13, 0.065, 0.03, 0.01), torso, 'pouch', [0, 0.355, 0.153]);
  }
  P.add(box(0.045, 0.1, 0.035), torso, 'polymer', [0.135, 0.39, 0.15]);
  P.add(tube(0.004, 0.004, 0.17, 5), torso, 'polymer', [0.135, 0.525, 0.15]);
  P.add(tube(0.056, 0.062, 0.1), torso, 'cloth', [0, 0.58, 0]);
  if (look.collar) P.add(tube(0.112, 0.132, 0.065, 14, true), torso, 'plate', [0, 0.535, 0.004]);
  if (look.pack === 'small') {
    P.add(soft(0.26, 0.3, 0.1, 0.03), torso, 'vest', [0, 0.3, -0.19]);
    P.add(soft(0.2, 0.08, 0.08, 0.02), torso, 'pouch', [0, 0.46, -0.18]);
  } else if (look.pack === 'large') {
    P.add(soft(0.32, 0.4, 0.17, 0.04), torso, 'vest', [0, 0.3, -0.225]);
    P.add(tube(0.065, 0.065, 0.32).rotateZ(Math.PI / 2), torso, 'pouch', [0, 0.54, -0.21]);
    for (const sx of [-1, 1]) P.add(soft(0.07, 0.16, 0.1, 0.02), torso, 'pouch', [sx * 0.19, 0.22, -0.22]);
    P.add(tube(0.092, 0.1, 0.07, 12), torso, 'vest', [0, 0.545, 0]);
    if (look.antenna) {
      P.add(soft(0.08, 0.13, 0.06, 0.01), torso, 'polymer', [0.11, 0.42, -0.33]);
      P.add(tube(0.006, 0.003, 0.55, 5), torso, 'polymer', [0.13, 0.75, -0.33], [-0.12, 0, 0]);
    }
  } else if (!look.chestPlate) {
    P.add(soft(0.17, 0.24, 0.05, 0.02), torso, 'vest', [0, 0.32, -0.16]);
  }

  // head: balaclava, a strip of skin around the eyes, glasses, then helmet or headset
  const HS = [0.93, 1.1, 1.02];
  P.add(new THREE.SphereGeometry(0.1, 14, 10), head, 'cloth', [0, 0, 0], [0, 0, 0], HS);
  if (look.moto) {
    // full-face helmet: a shell over the whole head, a dark visor, a chin bar; a boss's has a stripe
    const hs = [0.94, 1, 1.06];
    P.add(new THREE.SphereGeometry(0.136, 16, 11), head, 'helmet', [0, 0.012, 0.004], [0, 0, 0], hs);
    P.add(new THREE.SphereGeometry(0.1385, 14, 5, Math.PI / 2 - 0.78, 1.56, 1.12, 0.52), head, 'lens', [0, 0.012, 0.004], [0, 0, 0], hs);
    P.add(soft(0.15, 0.06, 0.06, 0.02), head, 'helmet', [0, -0.098, 0.096], [0.25, 0, 0]);
    P.add(soft(0.06, 0.02, 0.02, 0.006), head, 'polymer', [0, -0.088, 0.13], [0.25, 0, 0]);
    if (look.accent) P.add(new THREE.TorusGeometry(0.137, 0.014, 4, 18, Math.PI).rotateY(Math.PI / 2), head, 'spare', [0, 0.012, 0.004], [0, 0, 0], [0.94, 1.01, 1.07]);
  } else {
    P.add(new THREE.SphereGeometry(0.1012, 10, 4, Math.PI / 2 - 0.7, 1.4, 1.08, 0.66), head, 'skin', [0, 0, 0], [0, 0, 0], HS);
    if (look.visor) {
      P.add(new THREE.SphereGeometry(0.113, 12, 5, Math.PI / 2 - 0.85, 1.7, 1.0, 0.9), head, 'lens', [0, 0, 0], [0, 0, 0], [0.95, 1.1, 1.05]);
      P.add(soft(0.13, 0.05, 0.05, 0.015), head, 'helmet', [0, -0.09, 0.078]);
    } else {
      P.add(new THREE.SphereGeometry(0.1055, 10, 3, Math.PI / 2 - 0.56, 1.12, 1.27, 0.25), head, 'lens', [0, 0, 0], [0, 0, 0], HS);
      P.add(tube(0.0985, 0.0985, 0.02, 14, true), head, 'strap', [0, 0.02, 0], [0, 0, 0], [0.955, 1, 1.05]);
    }
    for (const sx of [-1, 1]) P.add(tube(0.037, 0.037, 0.03).rotateZ(Math.PI / 2), head, 'polymer', [sx * 0.097, -0.012, 0]);
  }
  if (look.faceplate) {
    // the commander's mask under the visor, with a breathing grille
    P.add(soft(0.125, 0.075, 0.035, 0.012), head, 'plate', [0, -0.058, 0.096], [0.15, 0, 0]);
    for (const sx of [-1, 1]) P.add(tube(0.022, 0.026, 0.03, 10).rotateX(Math.PI / 2), head, 'polymer', [sx * 0.042, -0.07, 0.12]);
  }
  if (look.helmet) {
    // tipped back: the brim sits above the eyes in front and covers the neck behind
    const tip = [-0.3, 0, 0], at = [0, 0.022, -0.006], hs = [0.98, 1, 1.09];
    P.add(new THREE.SphereGeometry(0.123, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), head, 'helmet', at, tip, hs);
    P.add(new THREE.TorusGeometry(0.1227, 0.007, 5, 16).rotateX(Math.PI / 2).translate(0, -0.0077, 0), head, 'helmet', at, tip, hs);
    P.add(box(0.045, 0.04, 0.02), head, 'polymer', [0, 0.098, 0.118], [-0.35, 0, 0]);
  } else if (look.cap) {
    // a peaked cap pulled low
    P.add(new THREE.SphereGeometry(0.106, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), head, 'helmet', [0, 0.018, -0.004], [-0.12, 0, 0], [0.96, 0.82, 1.04]);
    P.add(new THREE.CylinderGeometry(0.082, 0.082, 0.007, 14, 1, false, -Math.PI / 2, Math.PI), head, 'helmet', [0, 0.03, 0.06], [0.2, 0, 0], [0.95, 1, 1]);
    P.add(soft(0.03, 0.012, 0.012, 0.004), head, 'helmet', [0, 0.112, 0.0]);
  } else if (look.beanie) {
    // a knitted cap with a turned-up band
    P.add(new THREE.SphereGeometry(0.108, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.56), head, 'spare', [0, 0.012, -0.006], [-0.15, 0, 0], [0.96, 1.12, 1.03]);
    P.add(tube(0.106, 0.108, 0.04, 14), head, 'spare', [0, 0.03, -0.008], [-0.15, 0, 0], [0.96, 1, 1.03]);
  } else if (look.headset) {
    P.add(new THREE.TorusGeometry(0.105, 0.008, 5, 12, Math.PI), head, 'polymer', [0, -0.008, 0]);
  }

  for (const [k, arm] of arms.entries()) {
    const sx = k === 0 ? -1 : 1;
    P.cloth(limb(0.06, 0.047, UPPER, 10, 4), arm.shoulder, 'jacket', 0.34, 0.4);
    P.cloth(limb(0.047, 0.038, FORE - 0.05, 10, 3), arm.elbow, 'jacket', 0.27, 0.33);
    if (look.elbowPads) P.add(soft(0.07, 0.095, 0.03, 0.01), arm.elbow, 'pad', [0, -0.02, -0.047]);
    const cap = (r, y, s) => new THREE.SphereGeometry(r, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(...s).translate(0, y, 0);
    if (look.pauldrons) {
      // layered shoulder plates, the top one wider than the arm; the gang leader's carry studs
      P.add(cap(0.112, 0.006, [1.08, 0.72, 1.12]), arm.shoulder, 'plate', [sx * 0.012, 0, 0]);
      P.add(cap(0.104, -0.048, [1.05, 0.55, 1.08]), arm.shoulder, 'plate', [sx * 0.016, 0, 0]);
      P.add(cap(0.094, -0.094, [1.02, 0.45, 1.04]), arm.shoulder, 'plate', [sx * 0.018, 0, 0]);
      if (look.pauldrons === 'spiked') {
        for (const [dx, dz] of [[0.02, -0.04], [0.035, 0.0], [0.02, 0.04]]) {
          P.add(new THREE.ConeGeometry(0.014, 0.05, 6), arm.shoulder, 'metal', [sx * dx, 0.09, dz], [0, 0, -sx * 0.4]);
        }
      } else {
        P.add(soft(0.03, 0.012, 0.11, 0.004), arm.shoulder, 'spare', [sx * 0.07, 0.07, 0], [0, 0, -sx * 0.6]);
      }
    } else if (look.armor) {
      P.add(new THREE.SphereGeometry(0.086, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), arm.shoulder, 'plate', [0, -0.012, 0], [0, 0, 0], [1, 0.8, 1]);
    }
    if (look.gauntlets) P.add(soft(0.078, 0.16, 0.07, 0.016), arm.elbow, 'plate', [0, -0.13, 0.004]);
    P.add(tube(0.041, 0.043, 0.035, 8), arm.elbow, 'glove', [0, -FORE + 0.055, 0]);
    P.add(new THREE.SphereGeometry(0.044, 8, 6), arm.elbow, 'glove', [0, -FORE, 0], [0, 0, 0], [0.9, 1.3, 1.05]);
  }

  if (weapon === 'pistol') {
    P.add(box(0.028, 0.034, 0.18), gun, 'metal', [0, 0.012, 0.02]);
    P.add(box(0.026, 0.02, 0.12), gun, 'polymer', [0, -0.013, 0.01]);
    P.add(box(0.027, 0.095, 0.04), gun, 'polymer', [0, -0.066, -0.045], [0.2, 0, 0]);
  } else if (weapon === 'smg') {
    // compact sub-machine gun: receiver, short barrel, straight magazine, foregrip, stock folded along the left
    P.add(box(0.04, 0.06, 0.22), gun, 'metal', [0, 0.005, 0.03]);
    P.add(box(0.036, 0.03, 0.12), gun, 'polymer', [0, -0.027, 0.08]);
    P.add(tubeZ(0.011, 0.1), gun, 'metal', [0, 0.012, 0.19]);
    P.add(tubeZ(0.016, 0.03), gun, 'metal', [0, 0.012, 0.235]);
    P.add(box(0.03, 0.09, 0.04), gun, 'polymer', [0, -0.06, -0.03], [0.25, 0, 0]);
    P.add(box(0.026, 0.16, 0.035), gun, 'metal', [0, -0.1, 0.045], [0.12, 0, 0]);
    P.add(box(0.028, 0.07, 0.03), gun, 'polymer', [0, -0.07, 0.13]);
    P.add(box(0.012, 0.03, 0.2), gun, 'metal', [0.027, -0.005, -0.06]);
    P.add(box(0.024, 0.016, 0.05), gun, 'polymer', [0, 0.043, 0.0]);
  } else {
    P.add(box(0.042, 0.072, 0.3), gun, 'metal', [0, 0, 0.06]);
    P.add(box(0.046, 0.056, 0.24), gun, 'polymer', [0, 0.004, 0.33]);
    P.add(tubeZ(0.0095, 0.15), gun, 'metal', [0, 0.008, 0.52]);
    P.add(tubeZ(0.015, 0.045), gun, 'metal', [0, 0.008, 0.5875]);
    P.add(box(0.012, 0.04, 0.014), gun, 'metal', [0, 0.05, 0.43]);
    P.add(box(0.022, 0.01, 0.36), gun, 'metal', [0, 0.041, 0.15]);
    P.add(box(0.032, 0.04, 0.075), gun, 'polymer', [0, 0.066, 0.07]);
    P.add(box(0.024, 0.026, 0.003), gun, 'lens', [0, 0.068, 0.108]);
    P.add(tubeZ(0.016, 0.15), gun, 'metal', [0, 0.008, -0.165]);
    P.add(box(0.036, 0.09, 0.13), gun, 'polymer', [0, -0.01, -0.215]);
    P.add(box(0.03, 0.085, 0.04), gun, 'polymer', [0, -0.075, -0.04], [0.3, 0, 0]);
    P.add(box(0.026, 0.15, 0.052), gun, 'polymer', [0, -0.105, 0.085], [-0.18, 0, 0]);
  }
  return P.build();
}

// Geometry and material are built once per enemy type and shared by every bot of that type.
// Building a type takes a moment (camouflage sheet, a few thousand triangles, a shader), so the
// squad makes one hidden soldier of each type while the level loads.
const KITS = new Map();
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0.1), 1.4);

/**
 * A soldier of the given type. Returns {type, root, mesh, material, hips, legs[{hip, knee}], torso,
 * head, arms, gun, gunRest, gunBack, torsoYaw, dispose()}. Bones are animated by the caller.
 */
export function buildSoldier(type) {
  const T = ENEMY_TYPES[type];
  const rig = makeRig(T.weapon);
  const root = new THREE.Group();
  root.add(rig.hips);
  root.updateMatrixWorld(true);
  let kit = KITS.get(type);
  if (!kit) {
    const look = LOOK[type] || LOOK.grunt;
    KITS.set(type, (kit = { geometry: buildGeometry(rig, look, T.weapon), material: makeMaterial(T, look.camo, look.accent) }));
  }
  const mesh = new THREE.SkinnedMesh(kit.geometry, kit.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.boundingSphere = BOUNDS;   // generous and fixed: the animation never leaves it
  root.add(mesh);
  const skeleton = new THREE.Skeleton(rig.bones);
  mesh.bind(skeleton);
  root.scale.setScalar(T.scale);
  return { type, root, mesh, material: kit.material, ...rig, dispose: () => skeleton.dispose() };
}
