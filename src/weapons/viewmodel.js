// Weapons in the player's hands: procedural models and their animation.
// No game state here; core/weapons keeps the ammo, game/shooting drives this.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, damp } from '../core/collision.js';
import { WEAPON_SPECS, WEAPON_ORDER } from '../core/rules.js';

const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------- viewmodels
function makeMaterials(gameFlashTex) {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.95, roughness: 0.34 }),
    steelLight: new THREE.MeshStandardMaterial({ color: 0x5a5e63, metalness: 0.92, roughness: 0.4 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x1d1e20, metalness: 0.1, roughness: 0.58 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x6b5d45, metalness: 0.05, roughness: 0.7 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x33362c, metalness: 0, roughness: 0.88 }),
    glovePad: new THREE.MeshStandardMaterial({ color: 0x1f211d, metalness: 0, roughness: 0.75 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x4b5136, metalness: 0, roughness: 0.92 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0, roughness: 0.9 }),
    dot: new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false }),
    white: new THREE.MeshBasicMaterial({ color: 0xe8e8d8, toneMapped: false }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2a40, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.4 }),
    flash: new THREE.MeshBasicMaterial({
      map: gameFlashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    }),
  };
}

// Slightly rounded edges catch the light like real machined parts. Tiny boxes stay sharp.
const boxCache = new Map();
function boxGeometry(w, h, d) {
  const r = Math.min(0.0045, Math.min(w, h, d) * 0.28);
  if (r < 0.0008) return new THREE.BoxGeometry(w, h, d);
  const key = w.toFixed(4) + ',' + h.toFixed(4) + ',' + d.toFixed(4);
  let g = boxCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, r); boxCache.set(key, g); }
  return g;
}

function bx(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(boxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function cy(parent, r, len, mat, x, y, z, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Gloved hand made of a few blocks. Fingers curl toward -z by default. */
function glovedHand(M, mirror = 1) {
  const g = new THREE.Group();
  bx(g, 0.05, 0.036, 0.075, M.glove, 0, 0, 0);
  bx(g, 0.052, 0.012, 0.05, M.glovePad, 0, 0.022, 0.0);
  for (let i = 0; i < 4; i++) bx(g, 0.011, 0.012, 0.05, M.glove, -0.017 + i * 0.0115, -0.002, -0.058, 0.2);
  bx(g, 0.014, 0.014, 0.05, M.glove, 0.032 * mirror, 0.006, -0.012, 0, -0.35 * mirror);
  return g;
}

function buildPistol(M) {
  const root = new THREE.Group();
  const parts = {};
  // slide group moves back when firing
  const slide = new THREE.Group();
  bx(slide, 0.034, 0.036, 0.2, M.steel, 0, 0.018, -0.1);
  bx(slide, 0.036, 0.008, 0.2, M.steelLight, 0, 0.03, -0.1);
  for (let i = 0; i < 5; i++) bx(slide, 0.0365, 0.026, 0.004, M.black, 0, 0.018, -0.012 - i * 0.008);
  bx(slide, 0.0022, 0.012, 0.045, M.black, 0.0175, 0.026, -0.07);
  bx(slide, 0.004, 0.009, 0.006, M.steel, 0, 0.0405, -0.188);
  bx(slide, 0.0035, 0.0035, 0.0035, M.white, 0, 0.043, -0.1885);
  bx(slide, 0.007, 0.008, 0.008, M.steel, -0.0095, 0.0405, -0.014);
  bx(slide, 0.007, 0.008, 0.008, M.steel, 0.0095, 0.0405, -0.014);
  bx(slide, 0.0028, 0.0028, 0.0028, M.white, -0.0095, 0.0432, -0.0136);
  bx(slide, 0.0028, 0.0028, 0.0028, M.white, 0.0095, 0.0432, -0.0136);
  root.add(slide);
  parts.slide = slide;
  cy(root, 0.0075, 0.016, M.black, 0, 0.019, -0.205);

  bx(root, 0.03, 0.026, 0.17, M.polymer, 0, -0.012, -0.085);
  bx(root, 0.031, 0.1, 0.05, M.polymer, 0, -0.075, -0.004, 0.2);
  bx(root, 0.033, 0.01, 0.054, M.steel, 0, -0.127, 0.008, 0.2);
  bx(root, 0.022, 0.006, 0.05, M.polymer, 0, -0.04, -0.075);
  bx(root, 0.022, 0.026, 0.006, M.polymer, 0, -0.028, -0.1);
  bx(root, 0.008, 0.02, 0.008, M.steelLight, 0, -0.026, -0.06, 0.2);
  bx(root, 0.006, 0.01, 0.012, M.steelLight, 0.017, -0.004, -0.045);

  // right hand
  const rh = glovedHand(M, 1);
  rh.position.set(0.001, -0.07, 0.02);
  rh.rotation.set(0.2, 0, 0);
  rh.scale.set(1.05, 1.5, 1.05);
  root.add(rh);
  bx(root, 0.062, 0.058, 0.3, M.sleeve, 0.035, -0.135, 0.21, -0.55, 0.12, 0);
  bx(root, 0.064, 0.016, 0.06, M.glovePad, 0.03, -0.105, 0.075, -0.55, 0.12, 0);
  parts.rightHand = rh;
  // left hand supports from below
  const lh = new THREE.Group();
  const lhand = glovedHand(M, -1);
  lhand.rotation.set(0.1, -0.5, 0.3);
  lhand.scale.set(1.0, 1.1, 1.0);
  lh.add(lhand);
  lh.position.set(-0.03, -0.108, -0.012);
  bx(lh, 0.058, 0.055, 0.3, M.sleeve, -0.05, -0.06, 0.19, -0.45, -0.25, 0);
  root.add(lh);
  parts.leftHand = lh;
  parts.leftHandBase = lh.position.clone();

  // spare magazine representation inside the grip (hidden during reload)
  const mag = new THREE.Group();
  bx(mag, 0.028, 0.012, 0.05, M.steel, 0, -0.131, 0.01, 0.2);
  root.add(mag);
  parts.mag = mag;
  parts.muzzle = new THREE.Object3D();
  parts.muzzle.position.set(0, 0.02, -0.215);
  root.add(parts.muzzle);
  parts.slideRest = 0;
  parts.slideBack = 0.04;
  return { root, parts };
}

function buildRifle(M) {
  const root = new THREE.Group();
  const parts = {};
  // receiver
  bx(root, 0.046, 0.052, 0.22, M.steelLight, 0, -0.02, -0.05);
  bx(root, 0.045, 0.046, 0.27, M.steel, 0, 0.024, -0.075);
  bx(root, 0.02, 0.008, 0.3, M.polymer, 0, 0.051, -0.09);
  for (let i = 0; i < 12; i++) bx(root, 0.022, 0.004, 0.006, M.steelLight, 0, 0.0565, -0.2 + i * 0.0225 - 0.01);
  bx(root, 0.0022, 0.02, 0.05, M.black, 0.0235, 0.026, -0.05);
  bx(root, 0.012, 0.014, 0.03, M.steel, 0, 0.056, 0.07);
  // handguard
  bx(root, 0.054, 0.054, 0.27, M.polymer, 0, -0.002, -0.325);
  for (let i = 0; i < 5; i++) {
    bx(root, 0.0555, 0.016, 0.026, M.black, 0, 0.004, -0.225 - i * 0.045);
    bx(root, 0.056, 0.012, 0.022, M.black, 0, -0.022, -0.235 - i * 0.045);
  }
  bx(root, 0.02, 0.008, 0.26, M.steel, 0, 0.0285, -0.325);
  // barrel, gas block, muzzle device
  cy(root, 0.0085, 0.22, M.steel, 0, 0.012, -0.56);
  bx(root, 0.016, 0.05, 0.022, M.steel, 0, 0.042, -0.465);
  bx(root, 0.003, 0.024, 0.003, M.steel, 0, 0.0725, -0.465);
  bx(root, 0.0045, 0.0045, 0.0045, M.white, 0, 0.0865, -0.465);
  const brake = cy(root, 0.0135, 0.07, M.black, 0, 0.012, -0.665);
  for (let i = 0; i < 3; i++) cy(root, 0.0145, 0.006, M.steelLight, 0, 0.012, -0.645 - i * 0.017);
  // grips and magazine
  bx(root, 0.034, 0.09, 0.046, M.polymer, 0, -0.088, 0.05, 0.38);
  bx(root, 0.022, 0.006, 0.06, M.polymer, 0, -0.056, -0.02);
  bx(root, 0.006, 0.02, 0.006, M.steelLight, 0, -0.058, -0.012, 0.2);
  const mag = new THREE.Group();
  bx(mag, 0.031, 0.1, 0.052, M.polymer, 0, -0.095, -0.09, -0.1);
  bx(mag, 0.031, 0.1, 0.052, M.polymer, 0, -0.185, -0.107, -0.22);
  bx(mag, 0.033, 0.012, 0.056, M.steel, 0, -0.238, -0.12, -0.22);
  root.add(mag);
  parts.mag = mag;
  // stock
  bx(root, 0.04, 0.07, 0.2, M.polymer, 0, -0.012, 0.19);
  bx(root, 0.042, 0.09, 0.022, M.glovePad, 0, -0.012, 0.3);
  bx(root, 0.034, 0.03, 0.06, M.polymer, 0, -0.04, 0.11);
  // red dot optic
  bx(root, 0.032, 0.01, 0.058, M.steel, 0, 0.0605, -0.015);
  bx(root, 0.03, 0.03, 0.062, M.steel, 0, 0.082, -0.015);
  bx(root, 0.026, 0.026, 0.02, M.steel, 0, 0.0825, -0.062);
  bx(root, 0.021, 0.021, 0.002, M.glass, 0, 0.0845, -0.0165 + 0.0002);
  bx(root, 0.0036, 0.0036, 0.001, M.dot, 0, 0.0845, -0.0195);
  bx(root, 0.021, 0.021, 0.002, M.glass, 0, 0.0845, 0.0155);
  // hands
  const rh = glovedHand(M, 1);
  rh.position.set(0.0, -0.088, 0.058);
  rh.rotation.set(0.38, 0, 0);
  rh.scale.set(1.0, 1.55, 1.1);
  root.add(rh);
  bx(root, 0.064, 0.06, 0.3, M.sleeve, 0.05, -0.16, 0.2, -0.6, 0.16, 0);
  parts.rightHand = rh;
  const lh = new THREE.Group();
  const lhand = glovedHand(M, -1);
  lhand.rotation.set(0, 0, Math.PI * 0.5 + 0.2);
  lhand.scale.set(1.15, 1.1, 1.6);
  lh.add(lhand);
  lh.position.set(0.0, -0.02, -0.31);
  bx(lh, 0.062, 0.058, 0.34, M.sleeve, -0.07, -0.085, 0.25, -0.35, -0.3, 0);
  root.add(lh);
  parts.leftHand = lh;
  parts.leftHandBase = lh.position.clone();
  parts.muzzle = new THREE.Object3D();
  parts.muzzle.position.set(0, 0.012, -0.7);
  root.add(parts.muzzle);
  return { root, parts };
}

function buildShotgun(M) {
  const root = new THREE.Group();
  const parts = {};
  // receiver and loading port
  bx(root, 0.05, 0.075, 0.3, M.steelLight, 0, -0.012, -0.02);
  bx(root, 0.052, 0.02, 0.12, M.steel, 0, 0.03, -0.05);
  bx(root, 0.0022, 0.03, 0.07, M.black, 0.026, 0.0, -0.04);
  // barrel and magazine tube
  cy(root, 0.0145, 0.66, M.steel, 0, 0.026, -0.52);
  cy(root, 0.0135, 0.52, M.steelLight, 0, -0.012, -0.44);
  for (const z of [-0.32, -0.62]) cy(root, 0.019, 0.02, M.steel, 0, -0.012, z);
  cy(root, 0.017, 0.045, M.black, 0, 0.026, -0.86);
  // sights
  bx(root, 0.0045, 0.0045, 0.0045, M.white, 0, 0.0485, -0.84);
  bx(root, 0.004, 0.012, 0.004, M.steel, 0, 0.0445, -0.83);
  bx(root, 0.004, 0.016, 0.004, M.steel, -0.01, 0.052, 0.0);
  bx(root, 0.004, 0.016, 0.004, M.steel, 0.01, 0.052, 0.0);
  bx(root, 0.024, 0.004, 0.004, M.steel, 0, 0.06, 0.0);
  // pump forend slides back and forth
  const pump = new THREE.Group();
  bx(pump, 0.058, 0.052, 0.22, M.tan, 0, -0.03, -0.38);
  for (let i = 0; i < 6; i++) bx(pump, 0.0595, 0.04, 0.004, M.black, 0, -0.03, -0.3 - i * 0.03);
  root.add(pump);
  parts.pump = pump;
  parts.pumpBack = 0.08;
  // stock and grip
  bx(root, 0.044, 0.09, 0.3, M.tan, 0, -0.03, 0.22);
  bx(root, 0.046, 0.1, 0.022, M.glovePad, 0, -0.03, 0.375);
  bx(root, 0.036, 0.095, 0.05, M.tan, 0, -0.085, 0.07, 0.3);
  bx(root, 0.022, 0.006, 0.06, M.steel, 0, -0.062, -0.02);
  bx(root, 0.006, 0.02, 0.006, M.steelLight, 0, -0.06, -0.01, 0.2);
  // hands
  const rh = glovedHand(M, 1);
  rh.position.set(0.0, -0.092, 0.075);
  rh.rotation.set(0.32, 0, 0);
  rh.scale.set(1.0, 1.55, 1.1);
  root.add(rh);
  bx(root, 0.064, 0.06, 0.3, M.sleeve, 0.05, -0.165, 0.22, -0.6, 0.16, 0);
  parts.rightHand = rh;
  const lh = new THREE.Group();
  const lhand = glovedHand(M, -1);
  lhand.rotation.set(0, 0, Math.PI * 0.5 + 0.2);
  lhand.scale.set(1.15, 1.1, 1.5);
  lh.add(lhand);
  lh.position.set(0.0, -0.045, -0.38);
  bx(lh, 0.062, 0.058, 0.34, M.sleeve, -0.07, -0.085, 0.25, -0.35, -0.3, 0);
  root.add(lh);
  parts.leftHand = lh;
  parts.leftHandBase = lh.position.clone();
  parts.muzzle = new THREE.Object3D();
  parts.muzzle.position.set(0, 0.026, -0.9);
  root.add(parts.muzzle);
  return { root, parts };
}

class ViewModel {
  constructor(spec, view, M) {
    this.spec = spec;
    this.view = view;
    this.group = new THREE.Group();
    const { root, parts } = view.build(M);
    this.root = root;
    this.parts = parts;
    this.group.add(root);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), M.flash);
    this.flash.position.copy(parts.muzzle.position);
    this.flash.position.z -= 0.02;
    this.flash.visible = false;
    this.flash.renderOrder = 20;
    this.root.add(this.flash);
    this.group.visible = false;
  }
}

// Where each weapon sits in the hands. The numbers that decide how it plays are in core/rules.js.
const VIEW = {
  pistol: { build: buildPistol, hip: [0.115, -0.118, -0.30], sightY: 0.041, adsZ: -0.27, flash: 0.85, kick: 0.9 },
  rifle: { build: buildRifle, hip: [0.125, -0.128, -0.34], sightY: 0.083, adsZ: -0.30, flash: 1.0, kick: 1.0 },
  shotgun: { build: buildShotgun, hip: [0.13, -0.13, -0.33], sightY: 0.052, adsZ: -0.30, flash: 1.5, kick: 1.9 },
};

// --------------------------------------------------------------- Viewmodel
/**
 * The weapon in the player's hands: procedural models and their animation.
 * It owns no game state. The shooting controller tells it what happens:
 *   setWeapon(id)   a different weapon is in hand
 *   fire()          a shot: recoil, muzzle flash, pump
 *   shell()         one shell pushed into a pump gun
 *   update(dt, m)   every frame, m describes the player's motion and the reload
 */
export function createViewmodel(game) { return new Viewmodel(game); }

class Viewmodel {
  constructor(game) {
    this.game = game;
    const M = makeMaterials(game.fx.flashTex);
    this.models = {};
    for (const id of WEAPON_ORDER) {
      const vm = new ViewModel(WEAPON_SPECS[id], VIEW[id], M);
      game.gr.viewScene.add(vm.group);
      this.models[id] = vm;
    }
    this.current = 'rifle';
    this.models[this.current].group.visible = true;
    this.kick = 0;
    this.pump = 0;
    this.flashT = 0;
    this.shellPulse = 0;
    this.reloadTilt = 0;
    this.sprintK = 0;
    this.sway = { x: 0, y: 0 };
    this.time = 0;
  }

  /** Group of the weapon in hand. */
  get group() { return this.models[this.current].group; }

  setWeapon(id) {
    if (!this.models[id]) return;
    this.current = id;
    for (const k of Object.keys(this.models)) this.models[k].group.visible = k === id;
    this.endFlash();
  }

  fire() {
    const vm = this.models[this.current], view = VIEW[this.current], spec = WEAPON_SPECS[this.current];
    const g = this.game;
    vm.flash.visible = true;
    vm.flash.rotation.z = Math.random() * 6.28;
    vm.flash.scale.setScalar((0.8 + Math.random() * 0.45) * view.flash);
    this.flashT = 0.05;
    g.gr.muzzleLight.intensity = 9 * view.flash;
    g.gr.viewMuzzleLight.intensity = 1.6 * view.flash;
    this.kick = 1;
    if (spec.perShell) this.pump = 1;
  }

  shell() { this.shellPulse = 1; }
  pumpNow() { this.pump = 1; }

  endFlash() {
    this.flashT = 0;
    for (const vm of Object.values(this.models)) vm.flash.visible = false;
    this.game.gr.muzzleLight.intensity = 0;
    this.game.gr.viewMuzzleLight.intensity = 0;
  }

  /**
   * m = {ads, sprinting, bobPhase, bobAmp, lookDX, lookDY, landDip, lean,
   *      lower, reloading, reloadProgress, perShell, empty}
   */
  update(dt, m) {
    this.time += dt;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.endFlash(); }
    const spec = WEAPON_SPECS[this.current], view = VIEW[this.current];
    const vm = this.models[this.current], parts = vm.parts;
    const adsK = ease(m.ads);

    this.sprintK = damp(this.sprintK, m.sprinting ? 1 : 0, 9, dt);
    const sK = this.sprintK;

    // base pose: hip, or sights lined up with the eye
    let px = lerp(view.hip[0], 0, adsK), py = lerp(view.hip[1], -view.sightY, adsK), pz = lerp(view.hip[2], view.adsZ, adsK);
    let rx = 0, ry = 0, rz = 0;

    // sprint pose: weapon lowered and angled across the body
    px += sK * -0.075; py += sK * -0.045; pz += sK * 0.03;
    rx += sK * -0.32; ry += sK * 0.62; rz += sK * 0.22;

    // movement bob follows the player's walk cycle
    const bob = m.bobAmp * (1 - 0.85 * adsK) * (1 + sK * 0.6);
    px += Math.sin(m.bobPhase) * 0.0085 * bob;
    py += Math.abs(Math.sin(m.bobPhase)) * -0.009 * bob + Math.sin(m.bobPhase * 2) * 0.003 * bob;
    rz += Math.sin(m.bobPhase) * 0.012 * bob;
    py += Math.sin(this.time * 1.7) * 0.0012 * (1 - 0.6 * adsK);

    // the gun lags behind when the view turns
    this.sway.x = damp(this.sway.x, clamp(-m.lookDX * 0.7, -0.045, 0.045), 14, dt);
    this.sway.y = damp(this.sway.y, clamp(m.lookDY * 0.7, -0.035, 0.035), 14, dt);
    const swayK = 1 - 0.75 * adsK;
    px += this.sway.x * swayK; py += this.sway.y * swayK;
    ry += this.sway.x * 1.8 * swayK; rx += this.sway.y * 1.8 * swayK;

    py -= m.landDip * 0.8;
    rz += -m.lean * 0.5;

    // recoil kick
    this.kick = Math.max(0, this.kick - dt * (spec.auto ? 11 : 6));
    const k = this.kick * this.kick;
    pz += k * 0.032 * view.kick * (1 - 0.5 * adsK);
    py += k * 0.006 * view.kick;
    rx += k * 0.075 * view.kick * (1 - 0.4 * adsK);
    if (parts.slide) parts.slide.position.z = m.empty && !m.reloading ? parts.slideBack : k * parts.slideBack;

    // pump action: the forend slides back and forward after a shot
    this.pump = Math.max(0, this.pump - dt * 2.4);
    if (parts.pump) {
      const t = 1 - this.pump;
      const sl = this.pump > 0 ? Math.sin(clamp((t - 0.25) / 0.6, 0, 1) * Math.PI) : 0;
      parts.pump.position.z = sl * parts.pumpBack;
      if (parts.leftHand) parts.leftHand.position.z = parts.leftHandBase.z + sl * parts.pumpBack;
    }

    // switching weapons: lower, swap, raise
    py -= m.lower * 0.24; rx -= m.lower * 0.9; px += m.lower * 0.03;

    // reload motion
    const mag = parts.mag, lh = parts.leftHand;
    if (mag) { mag.position.set(0, 0, 0); mag.rotation.x = 0; mag.visible = true; }
    if (lh && !parts.pump) lh.position.copy(parts.leftHandBase);
    this.shellPulse = Math.max(0, this.shellPulse - dt * 4);
    if (m.reloading && m.perShell) {
      // loading shells one by one: the gun rolls over, the left hand dips to the port
      this.reloadTilt = damp(this.reloadTilt, 1, 10, dt);
      rz += -0.5 * this.reloadTilt; rx += 0.2 * this.reloadTilt; px -= 0.03 * this.reloadTilt;
      if (lh) {
        lh.position.y = parts.leftHandBase.y - 0.05 * this.reloadTilt - 0.03 * Math.sin(this.shellPulse * Math.PI);
        lh.position.z = parts.leftHandBase.z + 0.22 * this.reloadTilt;
      }
    } else if (m.reloading) {
      this.reloadTilt = 0;
      const t = m.reloadProgress;
      const bell = (a, b, c, e) => (t < a ? 0 : t < b ? ease((t - a) / (b - a)) : t < c ? 1 : t < e ? 1 - ease((t - c) / (e - c)) : 0);
      const tilt = bell(0.04, 0.2, 0.78, 0.94);
      rz += -0.5 * tilt; rx += 0.24 * tilt; px -= 0.035 * tilt; py += 0.01 * tilt;
      ry += 0.12 * tilt;
      let mo = 0;
      if (t > 0.22 && t < 0.42) mo = -0.26 * ease((t - 0.22) / 0.2);
      else if (t >= 0.42 && t < 0.56) mo = -0.26;
      else if (t >= 0.56 && t < 0.78) mo = -0.26 * (1 - ease((t - 0.56) / 0.22));
      if (mag) {
        mag.position.y = mo;
        mag.rotation.x = mo * 0.9;
        mag.visible = !(t > 0.42 && t < 0.54);
      }
      if (lh) {
        const grab = bell(0.05, 0.2, 0.8, 0.95);
        lh.position.y = parts.leftHandBase.y - 0.075 * grab + (t > 0.22 && t < 0.78 ? mo * 0.55 : 0);
        lh.position.x = parts.leftHandBase.x - 0.02 * grab;
      }
      if (parts.slide) {
        const sl = t > 0.84 && t < 0.97 ? Math.sin(((t - 0.84) / 0.13) * Math.PI) : 0;
        parts.slide.position.z = Math.max(parts.slide.position.z, sl * parts.slideBack);
      }
    } else {
      this.reloadTilt = damp(this.reloadTilt, 0, 12, dt);
    }

    vm.group.position.set(px, py, pz);
    vm.group.rotation.set(rx, ry, rz);
  }

  dispose() {
    for (const vm of Object.values(this.models)) {
      this.game.gr.viewScene.remove(vm.group);
      vm.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }
}
