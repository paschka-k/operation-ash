// The weapons as the player sees them in hand: a service pistol, a carbine with a
// holographic sight and a pump shotgun, then the six of wave 13 (at the end of the file). Shapes only; how they move is in viewmodel.js and
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

// ======================================================= wave 13: six more weapons
// A submachine gun with the magazine in its grip, a battle rifle with a prism sight, a bolt-action
// sniper rifle, a belt-fed machine gun, a hand-held minigun and a flamethrower. Same toolkit, same
// rules: one mesh per moving part. Extra moving parts: `bolt` (the sniper's bolt, turns on the
// bore axis), `barrels` (the minigun's cluster, turns on its axis), `pilot` (the flamer's pilot flame).

const THUMB_GRIP = [[-0.55, -0.55, -0.6], [-0.2, -0.5, -0.85], [0, -0.25, -1]];
const THUMB_CRADLE = [[-0.2, -0.75, -0.6], [-0.5, -0.7, -0.45], [-0.95, -0.25, -0.1]];
// side view of a pistol grip raked back like the AR-7's, from its top back corner
const GRIP_OUTLINE = [[-0.044, 0], [0, 0], [0.006, -0.03], [0.036, -0.108], [-0.004, -0.12], [-0.036, -0.048]];

/** A pistol grip with its top back corner at (zb, yt). Returns where the palm of a hand on it goes. */
function pistolGrip(s, part, paint, zb, yt, width = 0.03) {
  s.prism(part, paint, GRIP_OUTLINE.map(([z, y]) => [zb + z, yt + y]), width, { bevel: 0.007 });
  return [0.017 + width / 2, yt - 0.062, zb + 0.022];
}

/** Trigger guard and trigger in front of a grip made by pistolGrip(zb, yt). The guard runs `reach` forward. */
function triggerGroup(s, part, zb, yt, reach = 0.13) {
  const g = [[-reach, -0.044], [-0.048, -0.044], [-0.036, -0.03], [-0.04, -0.026], [-0.05, -0.039], [-reach, -0.039]];
  s.prism(part, PAINT.anodized, g.map(([z, y]) => [zb + z, yt + y]), 0.014, { bevel: 0.0015 });
  const tr = [[-0.086, -0.014], [-0.078, -0.014], [-0.075, -0.026], [-0.078, -0.036], [-0.082, -0.036], [-0.082, -0.026]];
  s.prism(part, PAINT.steel, tr.map(([z, y]) => [zb + z, yt + y]), 0.006, { bevel: 0.001 });
}

/** The firing hand on a grip; palm from pistolGrip(). */
function firingHand(s, palm) {
  addArm(s, 'rightArm', { at: handAt(palm, [0.3, -0.2, -1], [1, 0.15, 0.36]), curl: GRIP.trigger, thumb: THUMB_GRIP, arm: [0.32, -0.5, 0.8] });
}

/** The support hand under a handguard or a tank. */
function cradleHand(s, pos, arm = [-0.42, -0.62, 0.66]) {
  addArm(s, 'leftArm', { left: true, at: cradleAt(pos, 0.3, 0.6), curl: GRIP.cradle, thumb: THUMB_CRADLE, arm });
}

/** The support hand round a front grip made by pistolGrip(): the mirror image of the firing hand. */
function frontGripHand(s, palm, arm = [-0.36, -0.62, 0.7]) {
  addArm(s, 'leftArm', {
    left: true, at: handAt([-palm[0], palm[1], palm[2]], [-0.3, -0.2, -1], [-1, 0.15, 0.36]), curl: GRIP.fist, thumb: THUMB_GRIP, arm,
  });
}

/** Outline of a circle, [[x, y], ...]. */
function circle(r, cx = 0, cy = 0, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

/** Outline of a box magazine from the well down, curving forward by `sweep`. half: half its depth. */
function boxMagazine(zTop, yTop, len, sweep, half, N = 8) {
  const front = [], back = [];
  let end = null;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = zTop - sweep * Math.pow(t, 1.6), y = yTop - len * t;
    const dz = -sweep * 1.6 * Math.pow(t, 0.6), dy = -len, l = Math.hypot(dz, dy);
    const nz = -dy / l, ny = dz / l;
    front.push([z - nz * half, y - ny * half]);
    back.push([z + nz * half, y + ny * half]);
    if (i === N) end = { z, y, tilt: -Math.asin(dz / l) };
  }
  return { outline: [...front, ...back.reverse()], end };
}

// ------------------------------------------------------- submachine gun U-4
export function buildSmg(M) {
  const s = new Sculpt();
  const B = 'body', K = 'slide';
  const BORE = 0.024, SIGHT = 0.075;

  // receiver: a stamped box, pressed ribs down the sides, ejection port on the right
  s.prism(B, PAINT.parkerized, [[0.1, 0.0], [0.1, 0.044], [0.088, 0.054], [-0.172, 0.054], [-0.172, 0.0]], 0.042, { bevel: 0.004 });
  for (const x of [-0.0212, 0.0212]) s.box(B, PAINT.steel, 0.002, 0.005, 0.24, x, 0.011, -0.036, 0, 0, 0, 0.001);
  s.box(B, PAINT.steel, 0.002, 0.005, 0.24, -0.0212, 0.04, -0.036, 0, 0, 0, 0.001);
  s.box(B, PAINT.hollow, 0.002, 0.016, 0.044, 0.0211, 0.031, -0.03, 0, 0, 0, 0);
  s.box(B, PAINT.steelWorn, 0.002, 0.01, 0.034, 0.0205, 0.031, -0.032, 0, 0, 0, 0);
  s.box(B, PAINT.hollow, 0.0064, 0.002, 0.1, 0, 0.0541, -0.06, 0, 0, 0, 0);                 // slot of the cocking knob
  s.box(B, PAINT.steel, 0.044, 0.044, 0.008, 0, 0.022, 0.1, 0, 0, 0, 0.003);               // end cap
  s.add(B, new THREE.TorusGeometry(0.008, 0.0016, 6, 14), PAINT.steel, place(-0.024, 0.018, 0.086, 0, Math.PI / 2, 0));

  // cocking knob on top: snaps back with every shot
  s.cyl(K, PAINT.steelWorn, 0.0062, 0.012, 0, 0.06, -0.072, 'y', 12);
  s.cyl(K, PAINT.steel, 0.0075, 0.004, 0, 0.067, -0.072, 'y', 14);

  // sights: a peep at the back, a post between two ears at the front, level with each other
  s.box(B, PAINT.parkerized, 0.026, 0.012, 0.014, 0, 0.06, 0.078, 0, 0, 0, 0.002);
  s.box(B, PAINT.parkerized, 0.006, 0.008, 0.004, 0, 0.068, 0.076, 0, 0, 0, 0);
  s.frame(B, PAINT.steel, roundRect(0, SIGHT, 0.017, 0.017, 0.0075, 5), circle(0.0034, 0, SIGHT, 14), 0.0032, 0.074, { bevel: 0.0006 });
  s.box(B, PAINT.parkerized, 0.022, 0.008, 0.016, 0, 0.058, -0.158, 0, 0, 0, 0.002);
  s.box(B, PAINT.blued, 0.0034, 0.014, 0.004, 0, SIGHT - 0.007, -0.158, 0, 0, 0, 0.0006);
  for (const x of [-0.0095, 0.0095]) s.box(B, PAINT.parkerized, 0.0028, 0.022, 0.012, x, 0.068, -0.158, 0, 0, 0, 0.0008);
  dot(s, B, PAINT.dotWhite, 0.0013, 0, SIGHT - 0.0016, -0.1558);

  // barrel nut and the short barrel
  s.cyl(B, PAINT.steel, 0.0165, 0.02, 0, BORE, -0.182, 'z', 18);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s.box(B, PAINT.steelWorn, 0.003, 0.0022, 0.018, Math.cos(a) * 0.0168, BORE + Math.sin(a) * 0.0168, -0.182, 0, 0, a, 0);
  }
  const MZ = -0.258;
  s.lathe(B, PAINT.blued, [[MZ, 0.0045], [MZ, 0.0085], [MZ + 0.006, 0.0095], [-0.19, 0.0095]], { y: BORE, seg: 14 });
  bore(s, B, 0.0045, 0, BORE, MZ - 0.0002);

  // grip with the magazine inside it, a big trigger guard, a selector on the left
  const palm = pistolGrip(s, B, PAINT.polymer, 0.046, 0.0, 0.036);
  s.prism(B, PAINT.parkerized, [[0.006, 0.0], [-0.098, 0.0], [-0.104, -0.012], [-0.104, -0.042], [-0.094, -0.052], [0.006, -0.052]], 0.012,
    { bevel: 0.0015, holes: [[[-0.004, -0.007], [-0.091, -0.007], [-0.097, -0.014], [-0.097, -0.038], [-0.09, -0.045], [-0.002, -0.045]]] });
  s.prism(B, PAINT.steel, [[-0.03, -0.002], [-0.022, -0.002], [-0.019, -0.016], [-0.022, -0.03], [-0.026, -0.03], [-0.026, -0.016]], 0.006, { bevel: 0.001 });
  s.box(B, PAINT.steel, 0.003, 0.006, 0.016, -0.0195, -0.008, 0.03, 0, 0, 0, 0.001);

  // magazine: up through the grip, along its rake; only the base shows until a reload pulls it
  const ax = [0.316, -0.949], nx = [0.949, 0.316], top = [0.024, -0.01], L = 0.172, h = 0.0135;
  const bot = [top[0] + ax[0] * L, top[1] + ax[1] * L];
  s.prism('mag', PAINT.steel, [[top[0] - nx[0] * h, top[1] - nx[1] * h], [top[0] + nx[0] * h, top[1] + nx[1] * h],
    [bot[0] + nx[0] * h, bot[1] + nx[1] * h], [bot[0] - nx[0] * h, bot[1] - nx[1] * h]], 0.024, { bevel: 0.002 });
  s.box('mag', PAINT.polymerLight, 0.03, 0.009, 0.036, 0, bot[1] - 0.002, bot[0], Math.atan2(ax[0], -ax[1]), 0, 0, 0.003);

  firingHand(s, palm);
  cradleHand(s, [-0.025, -0.019, -0.14]);

  const out = assemble(s, M);
  muzzleAt(out.root, out.parts, 0, BORE, MZ - 0.006);
  out.parts.slideRest = 0;
  out.parts.slideBack = 0.032;
  return out;
}

// --------------------------------------------------------- battle rifle HR-12
export function buildCarbine(M) {
  const s = new Sculpt();
  const B = 'body';
  const BORE = 0.012, SIGHT = 0.102;

  // upper and lower receiver, black; olive furniture
  s.prism(B, PAINT.anodized, [[0.074, 0.0], [0.074, 0.036], [0.06, 0.05], [-0.215, 0.05], [-0.215, 0.002], [-0.152, 0.0]], 0.042, { bevel: 0.004 });
  s.prism(B, PAINT.anodized, [[0.074, 0.002], [-0.154, 0.002], [-0.154, -0.04], [-0.144, -0.08], [-0.062, -0.074], [-0.058, -0.038], [0.03, -0.038], [0.074, -0.018]], 0.04, { bevel: 0.003 });
  s.box(B, PAINT.hollow, 0.002, 0.018, 0.07, 0.0213, 0.022, -0.07, 0, 0, 0, 0);
  s.box(B, PAINT.steel, 0.003, 0.006, 0.076, 0.0218, 0.009, -0.07);
  s.box(B, PAINT.steel, 0.004, 0.024, 0.012, -0.0212, -0.006, -0.08);
  s.cyl(B, PAINT.steel, 0.0055, 0.004, -0.0208, -0.018, 0.034, 'x', 10);
  s.box(B, PAINT.steel, 0.003, 0.005, 0.02, -0.0225, -0.0185, 0.024);
  for (const [y, z] of [[-0.014, -0.134], [-0.01, 0.054]]) s.cyl(B, PAINT.steelWorn, 0.0034, 0.003, -0.02, y, z, 'x', 10);
  s.box(B, PAINT.steel, 0.01, 0.009, 0.016, -0.026, 0.03, -0.18, 0, 0, 0, 0.002);          // charging handle on the left

  // handguard: square with round corners, slots on every side
  s.frame(B, PAINT.olive, roundRect(0, 0.014, 0.054, 0.066, 0.012), circle(0.017, 0, BORE, 14), 0.33, -0.545, { bevel: 0.002 });
  for (let i = 0; i < 5; i++) {
    const z = -0.255 - i * 0.058;
    for (const x of [-0.0272, 0.0272]) s.box(B, PAINT.hollow, 0.0012, 0.01, 0.036, x, 0.014, z, 0, 0, 0, 0);
    s.box(B, PAINT.hollow, 0.03, 0.0012, 0.036, 0, -0.0192, z, 0, 0, 0, 0);
  }
  rail(s, B, PAINT.anodized, 0.058, -0.54, 0.0522);

  // heavy barrel, a muzzle brake with ports
  const MZ = -0.71;
  s.lathe(B, PAINT.steel, [[MZ, 0.0065], [MZ, 0.0148], [MZ + 0.064, 0.0148], [MZ + 0.068, 0.0108], [-0.545, 0.0108]], { y: BORE });
  bore(s, B, 0.0065, 0, BORE, MZ - 0.0002);
  for (let i = 0; i < 3; i++) {
    for (const x of [-0.0148, 0.0148]) s.box(B, PAINT.hollow, 0.002, 0.008, 0.011, x, BORE, MZ + 0.012 + i * 0.017, 0, 0, 0, 0);
  }

  // grip, trigger, a straight thick magazine
  const palm = pistolGrip(s, B, PAINT.olive, 0.074, -0.02);
  triggerGroup(s, B, 0.074, -0.02);
  const mag = boxMagazine(-0.106, -0.036, 0.19, 0.03, 0.036, 6);
  s.prism('mag', PAINT.olive, mag.outline, 0.028, { bevel: 0.003 });
  for (let i = 1; i < 4; i++) s.box('mag', PAINT.oliveDark, 0.0292, 0.004, 0.066, 0, -0.036 - i * 0.045, -0.106 - 0.03 * Math.pow(i / 4.2, 1.6), -0.12 * i / 4, 0, 0, 0.001);
  s.box('mag', PAINT.oliveDark, 0.032, 0.012, 0.078, 0, mag.end.y - 0.004, mag.end.z, mag.end.tilt, 0, 0, 0.003);

  // fixed stock with a sling slot
  s.prism(B, PAINT.olive, [[0.074, 0.04], [0.1, 0.04], [0.33, 0.03], [0.336, -0.086], [0.31, -0.094], [0.2, -0.046], [0.1, -0.024], [0.074, -0.02]], 0.036,
    { bevel: 0.005, holes: [[[0.262, -0.02], [0.3, -0.022], [0.3, -0.062], [0.262, -0.04]]] });
  s.box(B, PAINT.rubber, 0.038, 0.13, 0.012, 0, -0.028, 0.338, 0, 0, 0, 0.004);
  s.box(B, PAINT.oliveDark, 0.0366, 0.004, 0.12, 0, 0.034, 0.2, 0.04, 0, 0, 0.0015);

  // prism sight: a short tube on a mount, an eyepiece, the chevron reticle inside
  s.box(B, PAINT.anodized, 0.034, 0.016, 0.07, 0, 0.0625, -0.045, 0, 0, 0, 0.003);
  s.frame(B, PAINT.anodized, roundRect(0, SIGHT, 0.042, 0.04, 0.012, 5), circle(0.0136, 0, SIGHT, 20), 0.084, -0.1, { bevel: 0.002 });
  s.frame(B, PAINT.anodized, roundRect(0, SIGHT, 0.046, 0.044, 0.014, 5), circle(0.0152, 0, SIGHT, 20), 0.02, -0.118, { bevel: 0.0015 });
  s.frame(B, PAINT.rubber, roundRect(0, SIGHT, 0.04, 0.038, 0.012, 5), circle(0.0136, 0, SIGHT, 20), 0.012, -0.016, { bevel: 0.002 });
  s.cyl(B, PAINT.anodized, 0.0072, 0.008, 0, SIGHT + 0.023, -0.056, 'y', 14);
  s.cyl(B, PAINT.anodized, 0.0062, 0.01, -0.025, SIGHT, -0.056, 'x', 14);
  s.box(B, PAINT.dotRed, 0.0036, 0.0006, 0.0004, -0.00125, SIGHT - 0.00125, -0.07, 0, 0, Math.PI / 4, 0);
  s.box(B, PAINT.dotRed, 0.0036, 0.0006, 0.0004, 0.00125, SIGHT - 0.00125, -0.07, 0, 0, -Math.PI / 4, 0);
  s.box(B, PAINT.hollow, 0.0005, 0.011, 0.0004, 0, SIGHT - 0.0085, -0.07, 0, 0, 0, 0);
  s.box(B, PAINT.hollow, 0.026, 0.0004, 0.0004, 0, SIGHT, -0.071, 0, 0, 0, 0);
  s.add('glass', new THREE.CircleGeometry(0.0136, 20), PAINT.hollow, place(0, SIGHT, -0.099));
  // folded backup sights
  s.box(B, PAINT.steel, 0.02, 0.007, 0.034, 0, 0.0625, -0.51, 0, 0, 0, 0.002);
  s.box(B, PAINT.steel, 0.02, 0.007, 0.03, 0, 0.0625, 0.04, 0, 0, 0, 0.002);

  firingHand(s, palm);
  cradleHand(s, [-0.03, -0.037, -0.37]);

  const out = assemble(s, M);
  out.parts.glass.material = M.glass;
  muzzleAt(out.root, out.parts, 0, BORE, MZ - 0.01);
  return out;
}

// --------------------------------------------------------- sniper rifle LR-4
export function buildSniper(M) {
  const s = new Sculpt();
  const B = 'body', BOLT = 'bolt';
  const BORE = 0.018, SIGHT = 0.088;

  // stock: one piece from the butt to the forend, a cheek riser, a pistol grip
  s.prism(B, PAINT.olive, [[0.385, 0.03], [0.2, 0.026], [0.135, 0.002], [-0.43, 0.002], [-0.44, -0.014], [-0.425, -0.044], [0.05, -0.044], [0.16, -0.054], [0.37, -0.098], [0.385, -0.098]], 0.048, { bevel: 0.006 });
  s.box(B, PAINT.oliveDark, 0.04, 0.022, 0.14, 0, 0.036, 0.27, 0, 0, 0, 0.006);
  s.box(B, PAINT.rubber, 0.05, 0.132, 0.014, 0, -0.034, 0.392, 0, 0, 0, 0.005);
  for (let i = 0; i < 6; i++) s.box(B, PAINT.oliveDark, 0.0492, 0.003, 0.03, 0, -0.03, -0.36 + i * 0.045, 0, 0, 0, 0);   // grip texture on the forend
  const palm = pistolGrip(s, B, PAINT.olive, 0.112, -0.04, 0.032);
  s.prism(B, PAINT.steel, [[0.0, -0.07], [0.082, -0.07], [0.094, -0.056], [0.09, -0.05], [0.08, -0.064], [0.0, -0.064]], 0.012, { bevel: 0.0015 });
  s.box(B, PAINT.steel, 0.012, 0.026, 0.005, 0, -0.056, 0.002, 0, 0, 0, 0.001);
  s.prism(B, PAINT.steel, [[0.044, -0.044], [0.052, -0.044], [0.055, -0.056], [0.052, -0.064], [0.048, -0.064], [0.048, -0.056]], 0.006, { bevel: 0.001 });

  // action: a round receiver with its port, a rail for the scope, the recoil lug
  s.cyl(B, PAINT.blued, 0.0175, 0.24, 0, BORE, -0.045, 'z', 18);
  s.cyl(B, PAINT.blued, 0.019, 0.008, 0, BORE, -0.165, 'z', 18);
  s.box(B, PAINT.hollow, 0.004, 0.014, 0.05, 0.0158, BORE + 0.005, -0.02, 0, 0, 0, 0);
  s.box(B, PAINT.anodized, 0.016, 0.006, 0.21, 0, BORE + 0.0185, -0.05, 0, 0, 0, 0.001);

  // long barrel, fluted, with a brake
  const MZ = -0.86;
  s.lathe(B, PAINT.blued, [[MZ, 0.0055], [MZ, 0.0145], [MZ + 0.062, 0.0145], [MZ + 0.066, 0.0105], [-0.5, 0.0105], [-0.17, 0.0128]], { y: BORE, seg: 16 });
  bore(s, B, 0.0055, 0, BORE, MZ - 0.0002);
  for (let i = 0; i < 2; i++) for (const x of [-0.0146, 0.0146]) s.box(B, PAINT.hollow, 0.002, 0.008, 0.016, x, BORE, MZ + 0.016 + i * 0.026, 0, 0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    s.box(B, PAINT.steel, 0.0022, 0.0034, 0.24, Math.cos(a) * 0.0108, BORE + Math.sin(a) * 0.0108, -0.42, 0, 0, a, 0);
  }

  // bipod folded along the sides of the forend
  s.box(B, PAINT.anodized, 0.06, 0.016, 0.022, 0, -0.04, -0.41, 0, 0, 0, 0.003);
  for (const x of [-0.027, 0.027]) {
    s.cyl(B, PAINT.anodized, 0.0042, 0.2, x, -0.03, -0.3, 'z', 8);
    s.box(B, PAINT.rubber, 0.01, 0.01, 0.016, x, -0.03, -0.196, 0, 0, 0, 0.002);
  }

  // scope: rings on the rail, a long tube with its turrets, a dark eyepiece
  for (const z of [-0.002, -0.13]) {
    s.box(B, PAINT.anodized, 0.02, 0.032, 0.014, 0, 0.055, z, 0, 0, 0, 0.002);
    s.frame(B, PAINT.anodized, circle(0.0188, 0, SIGHT, 18), circle(0.0146, 0, SIGHT, 18), 0.014, z - 0.007, { bevel: 0.0015 });
  }
  s.lathe(B, PAINT.anodized, [[-0.33, 0.0226], [-0.33, 0.0262], [-0.27, 0.0262], [-0.236, 0.0148], [0.028, 0.0148], [0.048, 0.0186], [0.116, 0.0186], [0.116, 0.0162]], { y: SIGHT, seg: 20 });
  s.add(B, new THREE.CircleGeometry(0.0164, 20), PAINT.lens, place(0, SIGHT, 0.1155));
  s.add(B, new THREE.CircleGeometry(0.0228, 20), PAINT.lens, place(0, SIGHT, -0.322, 0, Math.PI, 0));
  s.cyl(B, PAINT.rubber, 0.0192, 0.024, 0, SIGHT, 0.075, 'z', 20);
  s.cyl(B, PAINT.anodized, 0.0098, 0.018, 0, SIGHT + 0.022, -0.066, 'y', 16);
  s.cyl(B, PAINT.steel, 0.0105, 0.004, 0, SIGHT + 0.032, -0.066, 'y', 16);
  s.cyl(B, PAINT.anodized, 0.0088, 0.016, 0.022, SIGHT, -0.066, 'x', 16);
  s.cyl(B, PAINT.anodized, 0.0075, 0.012, -0.02, SIGHT, -0.066, 'x', 14);

  // bolt: built on the bore axis so it can turn on it; shroud, handle, knob
  s.cyl(BOLT, PAINT.blued, 0.0135, 0.024, 0, 0, 0.087, 'z', 16);
  s.cyl(BOLT, PAINT.steel, 0.0072, 0.012, 0, 0, 0.104, 'z', 12);
  s.box(BOLT, PAINT.steelWorn, 0.042, 0.0065, 0.0065, 0.034, -0.007, 0.06, 0, 0, -0.34, 0.002);
  s.add(BOLT, new THREE.SphereGeometry(0.0098, 14, 10), PAINT.blued, place(0.056, -0.0145, 0.06));

  // magazine: a short box under the action
  s.box('mag', PAINT.polymer, 0.03, 0.044, 0.074, 0, -0.05, -0.052, 0, 0, 0, 0.003);
  s.box('mag', PAINT.steel, 0.034, 0.006, 0.08, 0, -0.074, -0.052, 0, 0, 0, 0.002);

  firingHand(s, palm);
  cradleHand(s, [-0.03, -0.063, -0.29]);

  const out = assemble(s, M);
  out.parts.bolt.position.y = BORE;
  muzzleAt(out.root, out.parts, 0, BORE, MZ - 0.01);
  return out;
}

// ---------------------------------------------------------- machine gun LM-6
export function buildLmg(M) {
  const s = new Sculpt();
  const B = 'body';
  const BORE = 0.02, SIGHT = 0.094;

  // receiver, feed cover with ribs, feed port on the left, charging handle on the right
  s.prism(B, PAINT.parkerized, [[0.085, -0.01], [0.085, 0.05], [0.07, 0.062], [-0.245, 0.062], [-0.245, -0.036], [0.02, -0.036], [0.085, -0.028]], 0.052, { bevel: 0.004 });
  s.prism(B, PAINT.anodized, [[0.06, 0.06], [0.06, 0.074], [0.045, 0.081], [-0.2, 0.081], [-0.215, 0.068], [-0.215, 0.06]], 0.048, { bevel: 0.003 });
  for (let i = 0; i < 3; i++) s.box(B, PAINT.anodized, 0.05, 0.004, 0.006, 0, 0.074, -0.05 - i * 0.05, 0, 0, 0, 0.001);
  s.box(B, PAINT.steel, 0.03, 0.008, 0.014, 0, 0.068, 0.066, 0, 0, 0, 0.002);
  s.box(B, PAINT.hollow, 0.002, 0.026, 0.06, -0.0262, 0.034, -0.07, 0, 0, 0, 0);
  s.box(B, PAINT.steelWorn, 0.004, 0.003, 0.064, -0.027, 0.0205, -0.07, 0, 0, 0, 0.001);
  s.box(B, PAINT.hollow, 0.03, 0.002, 0.07, 0, -0.0362, -0.12, 0, 0, 0, 0);
  s.box(B, PAINT.steel, 0.014, 0.01, 0.018, 0.031, 0.03, -0.17, 0, 0, 0, 0.002);
  for (const [y, z] of [[0.0, 0.05], [0.04, -0.23], [-0.02, -0.2]]) for (const x of [-0.0262, 0.0262]) s.cyl(B, PAINT.steelWorn, 0.0036, 0.003, x, y, z, 'x', 10);

  // rear sight on the cover, tall front sight at the muzzle end, level with each other
  s.box(B, PAINT.anodized, 0.026, 0.008, 0.016, 0, 0.084, 0.036, 0, 0, 0, 0.002);
  s.frame(B, PAINT.steel, roundRect(0, SIGHT, 0.017, 0.017, 0.0075, 5), circle(0.0034, 0, SIGHT, 14), 0.003, 0.034, { bevel: 0.0006 });

  // barrel with cooling rings, gas block and tube, flash hider, carry handle
  const MZ = -0.75;
  s.lathe(B, PAINT.steel, [[MZ, 0.006], [MZ, 0.0118], [MZ + 0.05, 0.0118], [MZ + 0.055, 0.0092], [-0.42, 0.0102], [-0.245, 0.0118]], { y: BORE });
  bore(s, B, 0.006, 0, BORE, MZ - 0.0002);
  for (const x of [-0.0118, 0.0118]) s.box(B, PAINT.hollow, 0.002, 0.0035, 0.03, x, BORE, MZ + 0.018, 0, 0, 0, 0);
  for (let i = 0; i < 4; i++) s.cyl(B, PAINT.steelWorn, 0.0148, 0.006, 0, BORE, -0.262 - i * 0.016, 'z', 16);
  s.box(B, PAINT.parkerized, 0.026, 0.046, 0.034, 0, 0.004, -0.5, 0, 0, 0, 0.003);
  s.cyl(B, PAINT.parkerized, 0.0078, 0.255, 0, -0.012, -0.372, 'z', 12);
  s.cyl(B, PAINT.parkerized, 0.0165, 0.022, 0, BORE, -0.35, 'z', 16);
  s.prism(B, PAINT.polymer, [[-0.29, 0.03], [-0.29, 0.062], [-0.31, 0.076], [-0.41, 0.076], [-0.43, 0.062], [-0.43, 0.03], [-0.416, 0.03], [-0.416, 0.058], [-0.405, 0.065], [-0.315, 0.065], [-0.304, 0.058], [-0.304, 0.03]], 0.014, { bevel: 0.003 });
  s.box(B, PAINT.parkerized, 0.016, 0.054, 0.018, 0, 0.056, -0.705, 0, 0, 0, 0.002);
  s.box(B, PAINT.blued, 0.0036, 0.014, 0.005, 0, SIGHT - 0.007, -0.705, 0, 0, 0, 0.0006);
  for (const x of [-0.0105, 0.0105]) s.box(B, PAINT.parkerized, 0.003, 0.026, 0.014, x, SIGHT - 0.01, -0.705, 0, 0, 0, 0.0008);
  dot(s, B, PAINT.dotWhite, 0.0013, 0, SIGHT - 0.0016, -0.7022);

  // handguard under the barrel, ribbed
  s.prism(B, PAINT.polymer, [[-0.245, 0.008], [-0.455, 0.008], [-0.46, -0.004], [-0.452, -0.034], [-0.245, -0.04]], 0.052, { bevel: 0.004 });
  for (let i = 0; i < 6; i++) for (const x of [-0.0262, 0.0262]) s.box(B, PAINT.hollow, 0.0012, 0.022, 0.012, x, -0.014, -0.27 - i * 0.03, 0, 0, 0, 0);

  // bipod folded under the gas tube
  s.box(B, PAINT.parkerized, 0.034, 0.014, 0.02, 0, -0.024, -0.68, 0, 0, 0, 0.002);
  for (const x of [-0.011, 0.011]) s.cyl(B, PAINT.parkerized, 0.0045, 0.19, x, -0.026, -0.58, 'z', 8);

  // grip, trigger, skeleton stock
  const palm = pistolGrip(s, B, PAINT.polymer, 0.092, -0.026, 0.032);
  triggerGroup(s, B, 0.092, -0.026, 0.07);
  s.box(B, PAINT.parkerized, 0.012, 0.03, 0.006, 0, -0.054, 0.02, 0, 0, 0, 0.001);
  s.prism(B, PAINT.polymer, [[0.085, 0.042], [0.12, 0.042], [0.345, 0.034], [0.35, -0.09], [0.325, -0.096], [0.12, -0.03], [0.085, -0.028]], 0.04,
    { bevel: 0.005, holes: [[[0.15, 0.024], [0.31, 0.018], [0.31, -0.062], [0.29, -0.072], [0.16, -0.018]]] });
  s.box(B, PAINT.rubber, 0.042, 0.136, 0.012, 0, -0.028, 0.354, 0, 0, 0, 0.004);

  // ammunition box under the receiver and the belt that climbs into the feed port
  const AMMO = 'mag';
  s.box(AMMO, PAINT.olive, 0.07, 0.106, 0.112, -0.008, -0.091, -0.1, 0, 0, 0, 0.006);
  for (let i = 0; i < 3; i++) s.box(AMMO, PAINT.oliveDark, 0.0716, 0.006, 0.114, -0.008, -0.06 - i * 0.03, -0.1, 0, 0, 0, 0.002);
  s.box(AMMO, PAINT.steel, 0.012, 0.016, 0.004, -0.008, -0.05, -0.0435, 0, 0, 0, 0.001);
  for (let i = 0; i < 5; i++) {
    const t = i / 4, x = -0.034 - Math.sin(t * Math.PI) * 0.008, y = -0.03 + t * 0.06;
    s.cyl(AMMO, PAINT.brass, 0.0048, 0.044, x, y, -0.07, 'z', 10);
    s.cyl(AMMO, PAINT.copper, 0.0034, 0.014, x, y, -0.099, 'z', 10, 0.0012);
    s.box(AMMO, PAINT.steel, 0.012, 0.0045, 0.012, x + 0.002, y, -0.058, 0, 0, 0, 0.001);
  }

  firingHand(s, palm);
  cradleHand(s, [-0.03, -0.058, -0.37]);

  const out = assemble(s, M);
  muzzleAt(out.root, out.parts, 0, BORE, MZ - 0.01);
  return out;
}

// --------------------------------------------------------------- minigun RG-6
export function buildMinigun(M) {
  const s = new Sculpt();
  const B = 'body', R = 'barrels';
  const AXIS = 0.0, RING = 0.026;      // axis of the barrel cluster, radius of the barrels around it

  // housing with the motor, a carry handle on top, the battery on the right
  s.box(B, PAINT.parkerized, 0.104, 0.104, 0.26, 0, AXIS, 0.08, 0, 0, 0, 0.014);
  s.box(B, PAINT.anodized, 0.08, 0.02, 0.2, 0, AXIS + 0.058, 0.08, 0, 0, 0, 0.006);
  s.frame(B, PAINT.steel, circle(0.054, 0, AXIS, 24), circle(0.048, 0, AXIS, 24), 0.02, -0.07, { bevel: 0.002 });
  s.prism(B, PAINT.polymer, [[0.13, 0.064], [0.13, 0.09], [0.115, 0.1], [0.015, 0.1], [0.0, 0.09], [0.0, 0.064], [0.012, 0.064], [0.012, 0.085], [0.02, 0.09], [0.11, 0.09], [0.118, 0.085], [0.118, 0.064]], 0.014, { bevel: 0.003 });
  s.cyl(B, PAINT.olive, 0.024, 0.13, 0.064, AXIS - 0.01, 0.1, 'z', 16);
  s.cyl(B, PAINT.steel, 0.026, 0.008, 0.064, AXIS - 0.01, 0.03, 'z', 16);
  for (let i = 0; i < 4; i++) s.box(B, PAINT.hollow, 0.002, 0.05, 0.006, -0.0525, AXIS + 0.01, 0.02 + i * 0.03, 0, 0, 0, 0);   // cooling slots
  s.box(B, PAINT.steel, 0.07, 0.07, 0.01, 0, AXIS, 0.212, 0, 0, 0, 0.004);

  // the barrel cluster turns: drum, six barrels, two clamps, a ring at the muzzles
  s.cyl(R, PAINT.steel, 0.045, 0.08, 0, 0, -0.1, 'z', 24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * RING, y = Math.sin(a) * RING;
    s.lathe(R, PAINT.blued, [[-0.72, 0.0038], [-0.72, 0.0078], [-0.14, 0.0078]], { x, y, seg: 10 });
    bore(s, R, 0.0038, x, y, -0.7202);
    s.box(R, PAINT.hollow, 0.004, 0.012, 0.07, Math.cos(a + 0.52) * 0.045, Math.sin(a + 0.52) * 0.045, -0.1, 0, 0, a + 0.52, 0);
  }
  for (const z of [-0.33, -0.64]) s.frame(R, PAINT.parkerized, circle(0.037, 0, 0, 24), circle(0.008, 0, 0, 10), 0.018, z - 0.009, { bevel: 0.002 });
  s.frame(R, PAINT.steel, circle(0.036, 0, 0, 24), circle(0.03, 0, 0, 24), 0.012, -0.714, { bevel: 0.0015 });
  s.cyl(R, PAINT.steel, 0.006, 0.58, 0, 0, -0.43, 'z', 10);

  // a fixed collar round the barrels carries the front grip
  s.frame(B, PAINT.anodized, circle(0.052, 0, AXIS, 24), circle(0.045, 0, AXIS, 24), 0.024, -0.31, { bevel: 0.002 });
  s.box(B, PAINT.anodized, 0.022, 0.012, 0.024, 0, AXIS - 0.054, -0.298, 0, 0, 0, 0.002);
  const front = pistolGrip(s, B, PAINT.polymer, -0.266, AXIS - 0.056, 0.03);

  // rear grip with a trigger button, under the back of the housing
  const palm = pistolGrip(s, B, PAINT.polymer, 0.2, AXIS - 0.05, 0.032);
  s.prism(B, PAINT.anodized, [[0.11, -0.052], [0.14, -0.052], [0.14, -0.1], [0.132, -0.1], [0.132, -0.06], [0.11, -0.06]], 0.014, { bevel: 0.0015 });
  s.box(B, PAINT.dotRed, 0.008, 0.012, 0.008, 0, AXIS - 0.066, 0.148, 0, 0, 0, 0.002);

  // ammunition box on the left and the chute that feeds the housing
  const AMMO = 'mag';
  s.box(AMMO, PAINT.olive, 0.07, 0.13, 0.14, -0.105, AXIS - 0.07, 0.07, 0, 0, 0, 0.007);
  for (let i = 0; i < 3; i++) s.box(AMMO, PAINT.oliveDark, 0.0716, 0.006, 0.142, -0.105, AXIS - 0.03 - i * 0.035, 0.07, 0, 0, 0, 0.002);
  for (let i = 0; i < 6; i++) {
    const t = i / 5, x = -0.098 + t * 0.044, y = AXIS + 0.0 + Math.sin(t * Math.PI * 0.5) * 0.04;
    s.box(AMMO, PAINT.steel, 0.022, 0.012, 0.03, x, y, 0.07, 0, 0, -0.9 * t, 0.003);
  }

  firingHand(s, palm);
  frontGripHand(s, front, [-0.32, -0.66, 0.68]);

  const out = assemble(s, M);
  out.parts.barrels.position.y = AXIS;
  muzzleAt(out.root, out.parts, 0, AXIS, -0.73);
  return out;
}

// ------------------------------------------------------------ flamethrower FL-2
export function buildFlamer(M) {
  const s = new Sculpt();
  const B = 'body';
  const BORE = 0.03, SIGHT = 0.068, TANK = -0.046, PILOT = BORE - 0.036;

  // main tube and the block round the trigger
  s.cyl(B, PAINT.parkerized, 0.019, 0.46, 0, BORE, -0.17, 'z', 18);
  s.box(B, PAINT.olive, 0.046, 0.054, 0.13, 0, 0.022, 0.02, 0, 0, 0, 0.006);
  s.cyl(B, PAINT.steel, 0.021, 0.012, 0, BORE, 0.088, 'z', 18);
  for (const z of [-0.12, -0.27]) s.cyl(B, PAINT.steel, 0.0205, 0.01, 0, BORE, z, 'z', 18);

  // nozzle: a vented shroud, the brass jet inside, the igniter under it
  s.frame(B, PAINT.anodized, circle(0.03, 0, BORE, 22), circle(0.025, 0, BORE, 22), 0.16, -0.54, { bevel: 0.002 });
  for (let i = 0; i < 4; i++) {
    for (const a of [0.5, Math.PI - 0.5, Math.PI / 2]) {
      s.box(B, PAINT.hollow, 0.0025, 0.009, 0.022, Math.cos(a) * 0.0302, BORE + Math.sin(a) * 0.0302, -0.43 - i * 0.03, 0, 0, a, 0);
    }
  }
  s.lathe(B, PAINT.brass, [[-0.53, 0.004], [-0.53, 0.0085], [-0.5, 0.012], [-0.4, 0.016]], { y: BORE, seg: 16 });
  bore(s, B, 0.004, 0, BORE, -0.5302);
  s.cyl(B, PAINT.copper, 0.031, 0.008, 0, BORE, -0.536, 'z', 22);
  s.cyl(B, PAINT.steel, 0.0052, 0.13, 0, PILOT, -0.48, 'z', 10);
  s.box(B, PAINT.steel, 0.008, 0.012, 0.01, 0, PILOT + 0.007, -0.43, 0, 0, 0, 0.001);
  s.cyl(B, PAINT.ember, 0.0034, 0.006, 0, PILOT, -0.547, 'z', 10);

  // sights: a notch on the block, a post on the shroud
  for (const x of [-0.0055, 0.0055]) s.box(B, PAINT.steel, 0.004, 0.022, 0.008, x, SIGHT - 0.008, 0.06, 0, 0, 0, 0.0008);
  s.box(B, PAINT.steel, 0.016, 0.006, 0.01, 0, 0.051, 0.06, 0, 0, 0, 0.001);
  s.box(B, PAINT.steel, 0.0034, 0.012, 0.005, 0, SIGHT - 0.006, -0.52, 0, 0, 0, 0.0006);
  dot(s, B, PAINT.dotWhite, 0.0013, 0, SIGHT - 0.0016, -0.5172);

  // grips: one behind the tank, one in front of it; a skeleton stock
  const palm = pistolGrip(s, B, PAINT.polymer, 0.078, -0.004);
  triggerGroup(s, B, 0.078, -0.004, 0.08);
  const front = pistolGrip(s, B, PAINT.polymer, -0.366, BORE - 0.016, 0.03);
  s.cyl(B, PAINT.steel, 0.009, 0.2, 0, 0.03, 0.19, 'z', 10);
  s.cyl(B, PAINT.steel, 0.008, 0.2, 0, -0.06, 0.2, 'z', 10, 0.008);
  s.box(B, PAINT.rubber, 0.042, 0.12, 0.014, 0, -0.016, 0.298, 0, 0, 0, 0.004);
  s.box(B, PAINT.steel, 0.012, 0.012, 0.03, 0, -0.06, 0.1, 0, 0, 0, 0.002);

  // hose from the tank to the block
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.018, TANK + 0.01, -0.012), new THREE.Vector3(0.03, TANK, 0.01), new THREE.Vector3(0.03, 0.0, 0.03), new THREE.Vector3(0.024, 0.016, 0.03),
  ]);
  s.add(B, new THREE.TubeGeometry(hose, 14, 0.0055, 8), PAINT.rubber);
  for (const z of [-0.09, -0.27]) s.box(B, PAINT.steel, 0.014, 0.04, 0.012, 0, -0.005, z, 0, 0, 0, 0.002);

  // fuel tank under the tube: a capsule with hazard bands, a gauge and a valve
  s.lathe('mag', PAINT.fuelRed, [[-0.33, 0.0001], [-0.326, 0.018], [-0.316, 0.03], [-0.302, 0.038], [-0.284, 0.041], [-0.06, 0.041], [-0.042, 0.038], [-0.028, 0.03], [-0.018, 0.018], [-0.014, 0.0001]], { y: TANK, seg: 22 });
  for (const z of [-0.12, -0.25]) s.cyl('mag', PAINT.hazard, 0.0415, 0.012, 0, TANK, z, 'z', 22);
  const gauge = place(-0.03, TANK + 0.03, -0.19, 0, 0, Math.PI / 4);   // its axis leans out to the upper left
  s.add('mag', new THREE.CylinderGeometry(0.011, 0.011, 0.01, 16), PAINT.steel, gauge);
  s.add('mag', new THREE.CircleGeometry(0.0092, 16), PAINT.gauge, gauge.clone().multiply(place(0, 0.0052, 0, -Math.PI / 2, 0, 0)));
  s.add('mag', new THREE.BoxGeometry(0.0012, 0.0012, 0.008), PAINT.hollow, gauge.clone().multiply(place(0, 0.0056, -0.002, 0, 0.6, 0)));
  s.cyl('mag', PAINT.brass, 0.006, 0.014, 0, TANK, -0.006, 'z', 12);

  firingHand(s, palm);
  frontGripHand(s, front, [-0.36, -0.64, 0.68]);

  const out = assemble(s, M);
  muzzleAt(out.root, out.parts, 0, BORE, -0.56);
  // pilot flame: a small flickering sprite at the igniter, with a material of its own (bluish, never hidden with the flash)
  const pilot = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({
    map: M.flash.map, color: 0x7fb4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  pilot.position.set(0, PILOT, -0.556);
  pilot.renderOrder = 19;
  out.root.add(pilot);
  out.parts.pilot = pilot;
  return out;
}
