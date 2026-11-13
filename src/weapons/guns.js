// The three weapons as the player sees them in hand: a service pistol, a carbine with a
// holographic sight and a pump shotgun. Shapes only; how they move is in viewmodel.js and
// how they shoot is in core/rules.js.
//
// Each builder returns {root, parts}. A weapon is a few meshes: `body` and the right arm stay
// still, `slide`, `mag`, `pump` and the left arm (glove and sleeve) are moved by the animation.
// Axes: the muzzle points to -z, up is +y, the right side is +x. Metres.

import * as THREE from 'three';
import { Sculpt, PAINT, place, roundRect } from './sculpt.js';
import { addArm, handAt, cradleAt, GRIP } from './hands.js';

// which material a part is made of, and how many repeats of its detail texture per metre
const MATERIAL = { rightArm: ['soft', 10], leftArm: ['soft', 10], rightArmSleeve: ['cloth', 10], leftArmSleeve: ['cloth', 10] };

/** Turn everything poured into the sculpt into meshes under one root. */
function assemble(s, M) {
  const root = new THREE.Group(), parts = {};
  for (const name of s.buckets.keys()) {
    const [material, repeats] = MATERIAL[name] || ['hard', 14];
    const mesh = s.mesh(name, M[material], repeats);
    root.add(mesh);
    parts[name] = mesh;
  }
  if (parts.leftArm) {
    // glove and sleeve of the left arm move as one thing
    const arm = new THREE.Group();
    arm.add(parts.leftArm, parts.leftArmSleeve);
    root.add(arm);
    parts.leftHand = arm;
    parts.leftHandBase = arm.position.clone();
  }
  return { root, parts };
}

function muzzleAt(root, parts, x, y, z) {
  parts.muzzle = new THREE.Object3D();
  parts.muzzle.position.set(x, y, z);
  root.add(parts.muzzle);
}

/** An accessory rail along the top: a strip with cross slots. */
function rail(s, part, paint, zFrom, zTo, y) {
  const len = Math.abs(zTo - zFrom), mid = (zFrom + zTo) / 2;
  s.box(part, paint, 0.0155, 0.005, len, 0, y, mid, 0, 0, 0, 0);
  for (let z = Math.min(zFrom, zTo) + 0.004; z < Math.max(zFrom, zTo) - 0.003; z += 0.01) {
    s.box(part, paint, 0.0212, 0.0046, 0.0054, 0, y + 0.0042, z, 0, 0, 0, 0);
  }
}

/** A small glowing disc facing the shooter: a sight dot. */
function dot(s, part, paint, r, x, y, z) {
  s.add(part, new THREE.CircleGeometry(r, 10), paint, place(x, y, z));
}

/** A dark disc at the mouth of a barrel. */
function bore(s, part, r, x, y, z) {
  s.add(part, new THREE.CircleGeometry(r, 12), PAINT.hollow, place(x, y, z, 0, Math.PI, 0));
}

// ------------------------------------------------------------------ pistol
export function buildPistol(M) {
  const s = new Sculpt();
  const B = 'body', S = 'slide';

  // slide: moves back with every shot
  s.prism(S, PAINT.blued, [[0.0, 0.002], [0.0, 0.03], [-0.005, 0.036], [-0.188, 0.036], [-0.198, 0.03], [-0.198, 0.002]], 0.027, { bevel: 0.004 });
  for (let i = 0; i < 6; i++) s.box(S, PAINT.hollow, 0.0282, 0.021, 0.0028, 0, 0.0165, -0.012 - i * 0.0072, 0, 0, 0, 0);
  for (let i = 0; i < 4; i++) s.box(S, PAINT.hollow, 0.0282, 0.019, 0.0028, 0, 0.0165, -0.152 - i * 0.0072, 0, 0, 0, 0);
  s.box(S, PAINT.hollow, 0.015, 0.012, 0.042, 0.0068, 0.0306, -0.09, 0, 0, 0, 0);          // ejection port
  s.box(S, PAINT.steelWorn, 0.0125, 0.004, 0.03, 0.0052, 0.0352, -0.092, 0, 0, 0, 0.001);  // the chamber seen through it
  s.box(S, PAINT.steelWorn, 0.014, 0.022, 0.0016, 0, 0.017, 0.0002, 0, 0, 0, 0.0006);      // cover plate at the back
  // sights: two posts at the back, one at the front, their tops level
  s.box(S, PAINT.blued, 0.022, 0.005, 0.013, 0, 0.0385, -0.012);
  for (const x of [-0.0078, 0.0078]) {
    s.box(S, PAINT.blued, 0.0066, 0.006, 0.011, x, 0.043, -0.012, 0, 0, 0, 0.0012);
    dot(s, S, PAINT.dotWhite, 0.0013, x, 0.0434, -0.0064);
  }
  s.box(S, PAINT.blued, 0.0044, 0.0102, 0.009, 0, 0.0409, -0.186, 0, 0, 0, 0.001);
  dot(s, S, PAINT.dotWhite, 0.0013, 0, 0.0434, -0.1814);

  // barrel and recoil spring guide showing at the front
  s.lathe(B, PAINT.steelWorn, [[-0.206, 0.0046], [-0.206, 0.0074], [-0.18, 0.0074]], { y: 0.02, seg: 14 });
  bore(s, B, 0.0046, 0, 0.02, -0.2062);
  s.cyl(B, PAINT.steel, 0.0038, 0.006, 0, 0.0075, -0.197);

  // frame: dust cover with accessory slots, trigger guard, grip leaning back
  s.prism(B, PAINT.polymer, [[0.004, 0.003], [-0.168, 0.003], [-0.168, -0.02], [-0.108, -0.02], [-0.104, -0.026], [-0.04, -0.026], [0.012, -0.03], [0.022, -0.012], [0.02, -0.002]], 0.028, { bevel: 0.0025 });
  for (const z of [-0.124, -0.139, -0.154]) s.box(B, PAINT.hollow, 0.0286, 0.004, 0.0042, 0, -0.0192, z, 0, 0, 0, 0);
  s.prism(B, PAINT.polymer, [[-0.04, -0.02], [0.014, -0.02], [0.022, -0.06], [0.04, -0.14], [-0.012, -0.136], [-0.036, -0.058]], 0.03, { bevel: 0.006 });
  s.prism(B, PAINT.polymerLight, [[-0.026, -0.062], [0.012, -0.062], [0.03, -0.128], [-0.008, -0.126]], 0.0306, { bevel: 0.0008 });
  s.prism(B, PAINT.polymer, [[-0.108, -0.022], [-0.106, -0.058], [-0.094, -0.068], [-0.044, -0.068], [-0.034, -0.056], [-0.04, -0.052], [-0.048, -0.0625], [-0.091, -0.0625], [-0.1, -0.055], [-0.102, -0.022]], 0.016, { bevel: 0.0015 });
  s.prism(B, PAINT.steel, [[-0.07, -0.026], [-0.062, -0.026], [-0.06, -0.04], [-0.064, -0.05], [-0.068, -0.05], [-0.067, -0.04]], 0.006, { bevel: 0.001 });
  // controls on the left side: slide stop, take-down lever, magazine release
  s.box(B, PAINT.steel, 0.003, 0.0042, 0.024, -0.0148, -0.003, -0.05);
  s.box(B, PAINT.steel, 0.003, 0.005, 0.008, -0.0148, -0.013, -0.078);
  s.cyl(B, PAINT.steel, 0.004, 0.004, -0.0152, -0.034, -0.03, 'x', 10);

  // magazine: inside the grip, only its base plate shows until a reload pulls it out
  s.prism('mag', PAINT.steel, [[-0.03, -0.03], [0.008, -0.03], [0.03, -0.138], [-0.008, -0.134]], 0.02, { bevel: 0.002 });
  s.prism('mag', PAINT.polymerLight, [[-0.016, -0.134], [0.042, -0.141], [0.044, -0.151], [-0.014, -0.146]], 0.031, { bevel: 0.003 });

  // hands: the right one on the grip, the left one wrapped over its fingers
  addArm(s, 'rightArm', {
    at: handAt([0.031, -0.082, 0.03], [0.3, -0.16, -1], [1, 0.12, 0.34]),
    curl: GRIP.trigger,
    thumb: [[-0.55, -0.55, -0.6], [-0.2, -0.5, -0.85], [0, -0.25, -1]],
    arm: [0.3, -0.5, 0.82],
  });
  addArm(s, 'leftArm', {
    left: true,
    at: handAt([-0.036, -0.1, 0.012], [0.25, 0.1, -1], [-1, -0.25, 0.3]),
    curl: GRIP.support,
    thumb: [[-0.6, -0.35, -0.7], [-0.35, -0.3, -0.9], [-0.1, -0.2, -1]],
    arm: [-0.42, -0.5, 0.76],
  });

  const out = assemble(s, M);
  muzzleAt(out.root, out.parts, 0, 0.02, -0.215);
  out.parts.slideRest = 0;
  out.parts.slideBack = 0.04;
  return out;
}

// ------------------------------------------------------------------- rifle
/** Outline of a curved box magazine, from the magazine well down and forward. */
function magazineOutline() {
  const front = [], back = [], h = 0.03, N = 8;
  let end = null;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -0.097 - 0.05 * Math.pow(t, 1.6), y = -0.03 - 0.215 * t;
    const dz = -0.08 * Math.pow(t, 0.6), dy = -0.215, len = Math.hypot(dz, dy);
    const nz = -dy / len, ny = dz / len;         // across the magazine, towards the shooter
    front.push([z - nz * h, y - ny * h]);
    back.push([z + nz * h, y + ny * h]);
    if (i === N) end = { z, y, tilt: -Math.asin(dz / len) };
  }
  return { outline: [...front, ...back.reverse()], end };
}

export function buildRifle(M) {
  const s = new Sculpt();
  const B = 'body';
  const BORE = 0.012;               // height of the barrel axis

  // upper and lower receiver
  s.prism(B, PAINT.anodized, [[0.072, 0.0], [0.072, 0.036], [0.058, 0.05], [-0.205, 0.05], [-0.205, 0.002], [-0.14, 0.0]], 0.04, { bevel: 0.004 });
  s.prism(B, PAINT.anodized, [[0.072, 0.002], [-0.142, 0.002], [-0.142, -0.034], [-0.134, -0.074], [-0.062, -0.068], [-0.058, -0.036], [0.03, -0.036], [0.072, -0.018]], 0.038, { bevel: 0.003 });
  // left side: bolt catch, selector, pins. Right side: ejection port with its cover.
  s.box(B, PAINT.steel, 0.004, 0.024, 0.012, -0.0202, -0.004, -0.078);
  s.cyl(B, PAINT.steel, 0.0055, 0.004, -0.0198, -0.016, 0.036, 'x', 10);
  s.box(B, PAINT.steel, 0.003, 0.005, 0.02, -0.0215, -0.0165, 0.026);
  for (const [y, z] of [[-0.012, -0.132], [-0.008, 0.056]]) s.cyl(B, PAINT.steelWorn, 0.0034, 0.003, -0.019, y, z, 'x', 10);
  s.box(B, PAINT.hollow, 0.002, 0.018, 0.07, 0.0203, 0.022, -0.07, 0, 0, 0, 0);
  s.box(B, PAINT.steel, 0.003, 0.006, 0.076, 0.0208, 0.009, -0.07);
  s.prism(B, PAINT.anodized, [[-0.062, -0.012], [-0.03, -0.012], [-0.026, -0.03], [-0.066, -0.03]], 0.0405, { bevel: 0.001 });  // fence around the magazine catch
  s.box(B, PAINT.steel, 0.003, 0.009, 0.014, -0.0205, -0.021, -0.046);
  s.prism(B, PAINT.anodized, [[0.0, 0.05], [-0.03, 0.05], [-0.04, 0.036], [-0.004, 0.036]], 0.0415, { bevel: 0.001 });          // shell deflector bump
  // charging handle
  s.box(B, PAINT.steel, 0.032, 0.008, 0.018, 0, 0.044, 0.079);

  // handguard: an eight-sided tube around the barrel, with slots
  const hg = [[0.012, 0.05], [-0.012, 0.05], [-0.024, 0.038], [-0.024, -0.012], [-0.012, -0.024], [0.012, -0.024], [0.024, -0.012], [0.024, 0.038]];
  const hole = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; hole.push([Math.cos(a) * 0.0165, BORE + Math.sin(a) * 0.0165]); }
  s.frame(B, PAINT.anodized, hg, hole, 0.295, -0.5, { bevel: 0.0015 });
  for (let i = 0; i < 5; i++) {
    const z = -0.245 - i * 0.052;
    s.box(B, PAINT.hollow, 0.0012, 0.008, 0.034, -0.0242, 0.013, z, 0, 0, 0, 0);
    s.box(B, PAINT.hollow, 0.0012, 0.008, 0.034, 0.0242, 0.013, z, 0, 0, 0, 0);
    s.box(B, PAINT.hollow, 0.0012, 0.0075, 0.034, -0.0182, 0.0442, z, 0, 0, -Math.PI / 4, 0);
    s.box(B, PAINT.hollow, 0.0012, 0.0075, 0.034, 0.0182, 0.0442, z, 0, 0, Math.PI / 4, 0);
    s.box(B, PAINT.hollow, 0.0012, 0.0075, 0.034, -0.0182, -0.0182, z, 0, 0, Math.PI / 4, 0);
  }
  rail(s, B, PAINT.anodized, 0.056, -0.498, 0.0522);

  // barrel with a flash hider
  const MZ = -0.622;                // the muzzle
  s.lathe(B, PAINT.steel, [[MZ, 0.0062], [MZ, 0.0112], [MZ + 0.037, 0.0112], [MZ + 0.041, 0.0098], [MZ + 0.045, 0.0098], [MZ + 0.047, 0.0128], [MZ + 0.052, 0.0128], [MZ + 0.054, 0.0088], [-0.48, 0.0088]], { y: BORE });
  bore(s, B, 0.0062, 0, BORE, MZ - 0.0002);
  s.box(B, PAINT.hollow, 0.0028, 0.0228, 0.02, 0, BORE, MZ + 0.02, 0, 0, 0, 0);
  s.box(B, PAINT.hollow, 0.0228, 0.0028, 0.02, 0, BORE, MZ + 0.02, 0, 0, 0, 0);

  // pistol grip, trigger guard, trigger
  s.prism(B, PAINT.earth, [[0.026, -0.02], [0.07, -0.02], [0.076, -0.05], [0.106, -0.128], [0.066, -0.14], [0.034, -0.068]], 0.03, { bevel: 0.007 });
  s.prism(B, PAINT.anodized, [[-0.06, -0.064], [0.022, -0.064], [0.034, -0.05], [0.03, -0.046], [0.02, -0.059], [-0.06, -0.059]], 0.014, { bevel: 0.0015 });
  s.prism(B, PAINT.steel, [[-0.016, -0.034], [-0.008, -0.034], [-0.005, -0.046], [-0.008, -0.056], [-0.012, -0.056], [-0.012, -0.046]], 0.006, { bevel: 0.001 });

  // magazine
  const mag = magazineOutline();
  s.prism('mag', PAINT.earth, mag.outline, 0.024, { bevel: 0.003 });
  s.box('mag', PAINT.earthDark, 0.028, 0.011, 0.068, 0, mag.end.y - 0.003, mag.end.z, mag.end.tilt, 0, 0, 0.003);

  // stock: buffer tube, castle nut, body, butt pad
  s.cyl(B, PAINT.anodized, 0.0135, 0.2, 0, 0.014, 0.17, 'z', 14);
  s.cyl(B, PAINT.steel, 0.0172, 0.012, 0, 0.014, 0.078, 'z', 12);
  s.prism(B, PAINT.earth, [[0.13, 0.034], [0.3, 0.036], [0.305, -0.07], [0.288, -0.078], [0.235, -0.03], [0.13, -0.008]], 0.034,
    { bevel: 0.005, holes: [[[0.252, 0.016], [0.288, 0.016], [0.288, -0.046], [0.27, -0.036], [0.252, -0.012]]] });
  s.box(B, PAINT.earthDark, 0.035, 0.004, 0.1, 0, 0.0362, 0.21, 0, 0, 0, 0.0015);       // cheek rest
  s.box(B, PAINT.rubber, 0.036, 0.114, 0.012, 0, -0.018, 0.31, 0, 0, 0, 0.004);

  // holographic sight: base, housing, a hood with a window, the reticle on its lens
  const SIGHT = 0.094;
  s.box(B, PAINT.anodized, 0.036, 0.0175, 0.064, 0, 0.0672, -0.02, 0, 0, 0, 0.003);
  s.frame(B, PAINT.anodized, roundRect(0, SIGHT, 0.043, 0.039, 0.007), roundRect(0, SIGHT, 0.035, 0.031, 0.0045), 0.036, -0.046);
  s.cyl(B, PAINT.steel, 0.0062, 0.008, 0.0215, 0.0672, -0.024, 'x', 12);
  s.box(B, PAINT.polymerLight, 0.003, 0.007, 0.02, -0.0185, 0.068, -0.012);
  dot(s, B, PAINT.dotRed, 0.0008, 0, SIGHT, -0.0408);
  s.add(B, new THREE.RingGeometry(0.0054, 0.006, 28), PAINT.dotRed, place(0, SIGHT, -0.0408));
  s.add('glass', new THREE.PlaneGeometry(0.035, 0.031), PAINT.hollow, place(0, SIGHT, -0.0415));
  // folded backup sights
  s.box(B, PAINT.steel, 0.02, 0.007, 0.034, 0, 0.0625, -0.47, 0, 0, 0, 0.002);
  s.box(B, PAINT.steel, 0.02, 0.007, 0.03, 0, 0.0625, 0.038, 0, 0, 0, 0.002);

  // hands: the right one on the grip, the left one cradles the handguard
  addArm(s, 'rightArm', {
    at: handAt([0.032, -0.082, 0.092], [0.3, -0.2, -1], [1, 0.15, 0.36]),
    curl: GRIP.trigger,
    thumb: [[-0.55, -0.55, -0.6], [-0.2, -0.5, -0.85], [0, -0.25, -1]],
    arm: [0.32, -0.5, 0.8],
  });
  addArm(s, 'leftArm', {
    left: true,
    at: cradleAt([-0.027, -0.042, -0.33], 0.3, 0.6),
    curl: GRIP.cradle,
    thumb: [[-0.2, -0.75, -0.6], [-0.5, -0.7, -0.45], [-0.95, -0.25, -0.1]],
    arm: [-0.42, -0.62, 0.66],
  });

  const out = assemble(s, M);
  out.parts.glass.material = M.glass;
  muzzleAt(out.root, out.parts, 0, BORE, -0.632);
  return out;
}

// ----------------------------------------------------------------- shotgun
export function buildShotgun(M) {
  const s = new Sculpt();
  const B = 'body', P = 'pump';
  const BARREL = 0.024, TUBE = -0.014;     // heights of the barrel and of the magazine tube under it

  // receiver with its ports
  // the back of the receiver slopes down to the stock: a square back end would stand as a black
  // wall in front of the eye when aiming
  s.prism(B, PAINT.parkerized, [[0.135, -0.02], [0.135, 0.0], [0.07, 0.04], [-0.17, 0.04], [-0.17, -0.048], [0.03, -0.048], [0.06, -0.036]], 0.042, { bevel: 0.004 });
  s.box(B, PAINT.hollow, 0.002, 0.024, 0.07, 0.0212, 0.014, -0.06, 0, 0, 0, 0);
  s.box(B, PAINT.steelWorn, 0.002, 0.016, 0.05, 0.0216, 0.014, -0.066, 0, 0, 0, 0);
  s.box(B, PAINT.hollow, 0.026, 0.002, 0.09, 0, -0.0482, -0.09, 0, 0, 0, 0);
  // trigger guard and trigger
  s.prism(B, PAINT.polymer, [[0.0, -0.046], [-0.004, -0.076], [0.004, -0.084], [0.055, -0.084], [0.07, -0.06], [0.064, -0.058], [0.052, -0.078], [0.007, -0.078], [0.002, -0.072], [0.006, -0.046]], 0.016, { bevel: 0.0015 });
  s.prism(B, PAINT.steel, [[0.03, -0.046], [0.038, -0.046], [0.04, -0.058], [0.037, -0.068], [0.033, -0.068], [0.034, -0.058]], 0.006, { bevel: 0.001 });

  // shell carrier on the left side: five spare shells, brass up, where the player sees it
  const SADDLE = -0.016;            // height of the middle of the carrier
  s.box(B, PAINT.polymer, 0.0245, 0.012, 0.12, -0.0328, SADDLE, -0.05, 0, 0, 0, 0.003);
  for (let i = 0; i < 5; i++) {
    const z = -0.095 + i * 0.0225;
    s.cyl(B, PAINT.shellRed, 0.0102, 0.044, -0.034, SADDLE - 0.004, z, 'y', 12);
    s.cyl(B, PAINT.brass, 0.0107, 0.014, -0.034, SADDLE + 0.025, z, 'y', 14);
    s.cyl(B, PAINT.steelWorn, 0.0034, 0.0006, -0.034, SADDLE + 0.0322, z, 'y', 10);      // primer
  }

  // barrel, magazine tube with its cap, the clamp that ties them together
  const MZ = -0.71;                 // the muzzle
  s.lathe(B, PAINT.parkerized, [[MZ, 0.0095], [MZ, 0.0125], [-0.17, 0.0125]], { y: BARREL });
  bore(s, B, 0.0095, 0, BARREL, MZ - 0.0002);
  s.lathe(B, PAINT.steel, [[-0.636, 0.0001], [-0.636, 0.008], [-0.63, 0.0128], [-0.61, 0.0128], [-0.608, 0.0118], [-0.17, 0.0118]], { y: TUBE });
  s.cyl(B, PAINT.steel, 0.0148, 0.016, 0, BARREL, -0.575, 'z', 14);
  s.cyl(B, PAINT.steel, 0.0148, 0.016, 0, TUBE, -0.575, 'z', 14);
  s.box(B, PAINT.steel, 0.012, 0.03, 0.016, 0, 0.005, -0.575, 0, 0, 0, 0.002);

  // sights: a ring at the back, a post with a bright bead at the front, level with each other
  const SIGHT = 0.05;
  s.box(B, PAINT.blued, 0.012, 0.004, 0.02, 0, 0.0415, 0.044, 0, 0, 0, 0.001);
  const ring = [];
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; ring.push([Math.cos(a) * 0.0064, SIGHT + Math.sin(a) * 0.0064]); }
  s.frame(B, PAINT.steel, roundRect(0, SIGHT, 0.0176, 0.0176, 0.0082, 6), ring, 0.003, 0.043, { bevel: 0.0006 });
  s.box(B, PAINT.blued, 0.0034, 0.016, 0.007, 0, 0.0445, MZ + 0.015, 0, 0, 0, 0.0008);
  dot(s, B, PAINT.dotWhite, 0.0015, 0, 0.0498, MZ + 0.0187);

  // forend: slides back and forth, the action bars go with it
  const tube = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; tube.push([Math.cos(a) * 0.0125, TUBE + Math.sin(a) * 0.0125]); }
  s.frame(P, PAINT.earth, roundRect(0, -0.018, 0.05, 0.047, 0.015), tube, 0.19, -0.445, { bevel: 0.003 });
  for (let i = 0; i < 7; i++) s.box(P, PAINT.earthDark, 0.0508, 0.03, 0.005, 0, -0.02, -0.428 + i * 0.026, 0, 0, 0, 0);
  for (const x of [-0.0145, 0.0145]) s.box(P, PAINT.steel, 0.003, 0.008, 0.14, x, -0.012, -0.19, 0, 0, 0, 0.001);

  // pistol grip and stock
  s.prism(B, PAINT.earth, [[0.05, -0.04], [0.092, -0.03], [0.128, -0.13], [0.086, -0.142], [0.06, -0.075]], 0.032, { bevel: 0.007 });
  // the comb drops away from the line of sight, or it would fill the view when aiming
  s.prism(B, PAINT.earth, [[0.125, 0.003], [0.37, -0.02], [0.375, -0.112], [0.355, -0.12], [0.25, -0.056], [0.125, -0.03]], 0.038, { bevel: 0.007 });
  s.box(B, PAINT.rubber, 0.04, 0.112, 0.014, 0, -0.064, 0.381, 0, 0, 0, 0.004);

  // hands: the right one on the grip, the left one works the forend
  addArm(s, 'rightArm', {
    at: handAt([0.033, -0.086, 0.112], [0.3, -0.2, -1], [1, 0.15, 0.36]),
    curl: GRIP.trigger,
    thumb: [[-0.55, -0.55, -0.6], [-0.2, -0.5, -0.85], [0, -0.25, -1]],
    arm: [0.32, -0.5, 0.8],
  });
  addArm(s, 'leftArm', {
    left: true,
    at: cradleAt([-0.027, -0.062, -0.345], 0.3, 0.6),
    curl: GRIP.cradle,
    thumb: [[-0.2, -0.75, -0.6], [-0.5, -0.7, -0.45], [-0.95, -0.25, -0.1]],
    arm: [-0.42, -0.62, 0.66],
  });

  const out = assemble(s, M);
  muzzleAt(out.root, out.parts, 0, BARREL, MZ - 0.005);
  out.parts.pumpBack = 0.08;
  return out;
}
