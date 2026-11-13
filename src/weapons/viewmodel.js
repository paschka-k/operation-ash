// Weapons in the player's hands: how they sit and move. Their shapes are in guns.js.
// No game state here; core/weapons keeps the ammo, game/shooting drives this.

import * as THREE from 'three';
import { clamp, lerp, damp, lineOfSight } from '../core/collision.js';
import { WEAPON_SPECS, WEAPON_ORDER } from '../core/rules.js';
import { weaponMaterials } from './sculpt.js';
import { buildPistol, buildRifle, buildShotgun } from './guns.js';

const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

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
//   hip     its place when carried, cant: its tilt there
//   reach   how far the left hand travels to the magazine during a reload
//   sightY  height of the line of sight: aiming brings that line to the centre of the screen
//   adsZ    how far in front of the eye the weapon sits when aiming
const VIEW = {
  pistol: { build: buildPistol, hip: [0.08, -0.088, -0.33], cant: [0, 0.04, -0.05], reach: [0, -0.07, 0.02], sightY: 0.0462, adsZ: -0.27, flash: 0.85, kick: 0.9 },
  rifle: { build: buildRifle, hip: [0.125, -0.128, -0.34], cant: [0, 0.05, -0.08], reach: [0, -0.173, 0.19], sightY: 0.094, adsZ: -0.24, flash: 1.0, kick: 1.0 },
  // the eye sits forward on the shotgun: further back the stock under the cheek would fill the view
  shotgun: { build: buildShotgun, hip: [0.13, -0.13, -0.33], cant: [0, 0.05, -0.08], reach: [0, 0, 0], sightY: 0.05, adsZ: -0.24, flash: 1.5, kick: 1.9 },
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
    const M = weaponMaterials(game.fx.flashTex);
    this.materials = M;
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
    this.sunK = 1;
    this.skyK = 1;
    this.sunLit = true;
    this.skyOpen = true;
    this.frame = 0;
  }

  /**
   * Is the player standing in direct sun, and under the open sky? Two rays, checked a few times
   * a second; the light on the weapon follows smoothly.
   */
  updateSun(dt) {
    const g = this.game, gr = g.gr;
    if (this.frame++ % 6 === 0 && g.world) {
      const p = gr.camera.position, s = gr.sunDir, c = g.world.colliders;
      this.sunLit = lineOfSight(c, p.x, p.y, p.z, p.x + s.x * 90, p.y + s.y * 90, p.z + s.z * 90);
      this.skyOpen = lineOfSight(c, p.x, p.y, p.z, p.x, p.y + 40, p.z);
    }
    this.sunK = damp(this.sunK, this.sunLit ? 1 : 0, 7, dt);
    this.skyK = damp(this.skyK, this.skyOpen ? 1 : 0, 5, dt);
    gr.weaponSun = this.sunK;
    gr.weaponSky = this.skyK;
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
    this.updateSun(dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.endFlash(); }
    const spec = WEAPON_SPECS[this.current], view = VIEW[this.current];
    const vm = this.models[this.current], parts = vm.parts;
    const adsK = ease(m.ads);

    this.sprintK = damp(this.sprintK, m.sprinting ? 1 : 0, 9, dt);
    const sK = this.sprintK;

    // base pose: hip, or sights lined up with the eye
    let px = lerp(view.hip[0], 0, adsK), py = lerp(view.hip[1], -view.sightY, adsK), pz = lerp(view.hip[2], view.adsZ, adsK);
    // at the hip the weapon is canted a little towards the middle of the screen
    const hipK = 1 - adsK;
    let rx = view.cant[0] * hipK, ry = view.cant[1] * hipK, rz = view.cant[2] * hipK;

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
        // the left hand lets go, takes the magazine out and brings a fresh one back
        const reach = bell(0.04, 0.2, 0.8, 0.96), r = view.reach, base = parts.leftHandBase;
        lh.position.set(base.x + r[0] * reach, base.y + r[1] * reach + mo, base.z + r[2] * reach - mo * 0.19);
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
    const M = this.materials;
    for (const m of [M.hard, M.soft, M.glass, M.flash]) m.dispose();
    for (const t of M.textures) t.dispose();
  }
}
