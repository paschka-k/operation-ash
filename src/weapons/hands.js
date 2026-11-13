// A gloved hand with a forearm for the weapons in the player's hands.
//
// The hand is built in its own space and then placed on the weapon:
//   origin    centre of the palm
//   -z        where straight fingers point
//   +y        the back of the hand
//   -x        the thumb side of a right hand (a left hand is the mirror image)
// Fingers are chains of three capsules that curl towards the palm, so a grip is a list of angles.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAINT, place } from './sculpt.js';

// knuckle position on the palm, bone lengths, radius, sideways lean. Index finger first.
const FINGERS = [
  { x: -0.034, z: -0.050, len: [0.044, 0.027, 0.022], r: 0.0098, splay: -0.08 },
  { x: -0.0115, z: -0.054, len: [0.049, 0.030, 0.023], r: 0.0100, splay: -0.025 },
  { x: 0.011, z: -0.051, len: [0.045, 0.028, 0.022], r: 0.0096, splay: 0.03 },
  { x: 0.033, z: -0.045, len: [0.035, 0.022, 0.020], r: 0.0087, splay: 0.1 },
];
const THUMB = { base: [-0.043, -0.006, 0.022], len: [0.042, 0.032, 0.027], r: [0.0148, 0.0122, 0.0106] };
const WRIST = new THREE.Vector3(0, 0, 0.05);

const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);

/**
 * Placement of a hand on a weapon: the palm centre at `pos`, fingers pointing along `fingers`,
 * the back of the hand facing `back` (both in weapon space, need not be unit or square).
 */
export function handAt(pos, fingers, back) {
  const z = new THREE.Vector3(...fingers).normalize().negate();
  const y = new THREE.Vector3(...back);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...pos);
}

// The sides of a finger are darker: the weapon scene has no ambient occlusion, and without
// this four fingers side by side read as one slab.
const fingerShade = (nx) => 1 - 0.72 * nx * nx;

function bone(s, part, paint, M, from, dir, len, r, shade = null) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const mid = from.clone().addScaledVector(dir, len / 2);
  const local = new THREE.Matrix4().compose(mid, q, ONE);
  s.add(part, new THREE.CapsuleGeometry(r, len, 3, 8), paint, M.clone().multiply(local), shade);
  from.addScaledVector(dir, len);
}

/**
 * Add a hand to `part` and its sleeve to `part + 'Sleeve'`.
 *   at      placement from handAt()
 *   left    build the mirror image
 *   curl    four fingers, index first: [knuckle, middle joint, last joint] in radians
 *   thumb   directions of its three bones in hand space (thumb side is -x, palm side is -y)
 *   arm     where the forearm goes from the wrist, in weapon space
 */
export function addArm(s, part, { at, left = false, curl, thumb, arm = [0, 0, 1], armLen = 0.36 }) {
  const M = left ? at.clone().multiply(new THREE.Matrix4().makeScale(-1, 1, 1)) : at;
  const G = PAINT.glove, D = PAINT.gloveDark;

  // palm, the hard guard over the knuckles, a panel and a strap on the back
  s.add(part, new RoundedBoxGeometry(0.094, 0.034, 0.104, 3, 0.015), G, M);
  s.add(part, new RoundedBoxGeometry(0.086, 0.015, 0.026, 2, 0.006), PAINT.guard, M.clone().multiply(place(0, 0.0135, -0.044)));
  s.add(part, new RoundedBoxGeometry(0.062, 0.008, 0.046, 2, 0.003), D, M.clone().multiply(place(0.002, 0.0155, 0.0)));
  s.add(part, new RoundedBoxGeometry(0.074, 0.007, 0.02, 2, 0.003), PAINT.strap, M.clone().multiply(place(0, 0.0165, 0.037)));

  // fingers
  FINGERS.forEach((f, i) => {
    const p = new THREE.Vector3(f.x, -0.002, f.z);
    let a = 0;
    for (let j = 0; j < 3; j++) {
      a += curl[i][j];
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(f.splay), -Math.sin(a), -Math.cos(a) * Math.cos(f.splay)).normalize();
      bone(s, part, G, M, p, dir, f.len[j], f.r * (1 - j * 0.07), fingerShade);
    }
  });

  // thumb
  const tp = new THREE.Vector3(...THUMB.base);
  for (let j = 0; j < 3; j++) bone(s, part, G, M, tp, new THREE.Vector3(...thumb[j]).normalize(), THUMB.len[j], THUMB.r[j]);

  // forearm: wrist joint, glove cuff, sleeve. The arm direction is given in weapon space.
  const inv = new THREE.Matrix3().setFromMatrix4(M).invert();
  const dir = new THREE.Vector3(...arm).normalize().applyMatrix3(inv).normalize();
  // the wrist is flat like the palm: keep the hand's x across the arm
  const ax = new THREE.Vector3(1, 0, 0);
  ax.addScaledVector(dir, -ax.dot(dir)).normalize();
  const az = new THREE.Vector3().crossVectors(ax, dir);
  const sleevePart = part + 'Sleeve';     // the sleeve is its own mesh: it has its own cloth
  const tube = (to, r0, r1, from, len, flat, paint, rows = 1) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 14, rows);
    const c = WRIST.clone().addScaledVector(dir, from + len / 2);
    const local = new THREE.Matrix4().makeBasis(ax, dir, az).setPosition(c).multiply(new THREE.Matrix4().makeScale(1, 1, flat));
    s.add(to, g, paint, M.clone().multiply(local));
  };
  s.add(part, new THREE.SphereGeometry(0.036, 12, 8), G, M.clone().multiply(place(WRIST.x, WRIST.y, WRIST.z - 0.004, 0, 0, 0, 1.1, 0.5, 1)));
  tube(part, 0.04, 0.041, -0.004, 0.044, 0.68, D);                       // cuff of the glove
  tube(part, 0.0425, 0.0425, 0.022, 0.012, 0.7, PAINT.strap);            // its strap
  tube(sleevePart, 0.044, 0.045, 0.036, 0.022, 0.76, PAINT.sleeveDark);  // hem of the sleeve
  // sleeve: a tapered tube with folds of cloth gathered towards the wrist
  const sleeve = new THREE.CylinderGeometry(0.057, 0.042, armLen, 16, 14);
  const sp = sleeve.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const a = Math.atan2(z, x), t = y / armLen + 0.5;               // t: 0 at the wrist, 1 towards the elbow
    const folds = Math.sin(t * 34 + Math.sin(a * 2 + 1.3) * 1.6) * 0.0032 * (1 - t * 0.55)
      + Math.sin(t * 13 + a * 3 + 0.7) * 0.0022 + Math.sin(a * 5 + t * 6) * 0.0012;
    const k = (r + folds) / r;
    sp.setX(i, x * k); sp.setZ(i, z * k);
  }
  sleeve.computeVertexNormals();
  const c = WRIST.clone().addScaledVector(dir, 0.05 + armLen / 2);
  const local = new THREE.Matrix4().makeBasis(ax, dir, az).setPosition(c).multiply(new THREE.Matrix4().makeScale(1, 1, 0.84));
  s.add(sleevePart, sleeve, PAINT.sleeve, M.clone().multiply(local));
}

/**
 * Placement of a support hand under a round part that runs along the barrel: the palm faces
 * up, rolled by `roll` towards the right side, the fingers point across to the right and
 * forward by `yaw`. pos is the centre of the palm.
 */
export function cradleAt(pos, roll, yaw) {
  const cr = Math.cos(roll), sr = Math.sin(roll), cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const fingers = [cr * cyw, -sr, -cr * syw];
  const back = [-sr * cyw, -cr, sr * syw];
  return handAt(pos, fingers, back);
}

/** Grips: finger curls. Each row is one finger, index first. */
export const GRIP = {
  // around a pistol grip, the index finger resting along the frame
  trigger: [[0.5, 0.75, 0.45], [1.25, 1.35, 0.6], [1.3, 1.35, 0.6], [1.35, 1.3, 0.6]],
  // around a handguard or a pump from below
  cradle: [[0.95, 0.95, 0.55], [1.0, 1.0, 0.55], [1.0, 1.0, 0.55], [1.05, 0.95, 0.5]],
  // wrapped over the fingers of the firing hand
  support: [[1.0, 1.2, 0.55], [1.05, 1.2, 0.55], [1.1, 1.2, 0.55], [1.15, 1.15, 0.5]],
};
