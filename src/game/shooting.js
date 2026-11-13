// Shooting: the glue between input, the arsenal (core/weapons), hit resolution
// (core/combat) and everything the player sees and hears. It decides nothing
// about the rules: ammo, timing, spread and damage come from the core.
//
//   trigger -> tryFire -> resolveShot from the eye through the crosshair cone
//           -> tracer, decal, damage, brass, camera recoil, noise

import * as THREE from 'three';
import { raycast, clamp, lerp } from '../core/collision.js';
import {
  createArsenal, resetArsenal, tryFire, beginReload, switchTo, tickWeapons, setStance, spreadDeg, totalAmmo,
  addAmmoAll, reloadProgress, WEAPON_SPECS, WEAPON_ORDER,
} from '../core/weapons.js';
import { resolveShot, damageAtRange } from '../core/combat.js';
import { recordShots } from '../core/waves.js';
import { createViewmodel } from '../weapons/viewmodel.js';

const DEG = Math.PI / 180;
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export class Shooting {
  constructor(game) {
    this.game = game;
    this.arsenal = createArsenal();
    this.view = createViewmodel(game);
    this.ads = 0;
    this.fireHeld = false;
    this.dryUntil = 0;
    this.shotCount = 0;
    this.aim = { enemy: null, last: null, t: 0 };
    this.f = new THREE.Vector3();
    this.r = new THREE.Vector3();
    this.u = new THREE.Vector3();
  }

  /** The weapon in hand: {id, mag, reserve}. */
  get cur() { const a = this.arsenal; return { id: a.current, ...a.weapons[a.current] }; }

  reset() {
    resetArsenal(this.arsenal);
    this.view.setWeapon(this.arsenal.current);
    this.ads = 0;
    this.fireHeld = false;
    this.dryUntil = 0;
    this.aim.enemy = null;
    this.aim.last = null;
    this.view.endFlash();
  }

  adsAmount() { return this.ads; }
  zoomRatio() { return lerp(1, WEAPON_SPECS[this.arsenal.current].zoom, ease(this.ads)); }
  totalAmmo() { return totalAmmo(this.arsenal); }
  /** An ammo box: one magazine for every weapon. */
  addAmmo() { return addAmmoAll(this.arsenal, 1); }
  firingLock() {
    const a = this.arsenal;
    return this.game.input.left && a.weapons[a.current].mag > 0 && !a.reload && !a.switching;
  }

  hudInfo() {
    const a = this.arsenal, spec = WEAPON_SPECS[a.current], w = a.weapons[a.current];
    const now = this.game.time * 1000;
    return {
      name: spec.nameKey, id: a.current, mag: w.mag, reserve: w.reserve, magSize: spec.mag,
      reloading: !!a.reload, progress: reloadProgress(a, now),
      spread: spreadDeg(a) * DEG, ads: this.ads,
    };
  }

  startReload() {
    const a = this.arsenal, now = this.game.time * 1000;
    const id = a.current, spec = WEAPON_SPECS[id];
    if (beginReload(a, now) && !spec.perShell) this.game.audio.reload(id, spec.reloadMs / 1000);
  }

  startSwitch(id) {
    if (switchTo(this.arsenal, id, this.game.time * 1000)) this.game.audio.switchWeapon();
  }

  // ----------------------------------------------------------------- per frame
  update(dt, input) {
    const g = this.game, player = g.player, a = this.arsenal;
    const now = g.time * 1000;

    setStance(a, { ads: this.ads, speed01: player.speedFrac, airborne: !player.pos.onGround, crouched: player.crouchHeld });

    // keys: switch weapons, reload
    if (player.alive) {
      WEAPON_ORDER.forEach((id, i) => { if (input.pressed('Digit' + (i + 1))) this.startSwitch(id); });
      if (input.pressed('KeyQ')) this.startSwitch(a.previous);
      const wheel = input.takeWheel();
      if (wheel !== 0) {
        const i = WEAPON_ORDER.indexOf(a.current);
        this.startSwitch(WEAPON_ORDER[(i + (wheel > 0 ? 1 : -1) + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
      }
      if (input.pressed('KeyR')) this.startReload();
    } else input.takeWheel();

    // time passes in the arsenal: reloads finish, switches happen
    for (const ev of tickWeapons(a, now)) {
      if (ev.type === 'switched') { this.view.setWeapon(ev.id); this.ads = 0; }
      else if (ev.type === 'shell') { g.audio.shell(); this.view.shell(); }
      else if (ev.type === 'reloadDone' && ev.pump) { g.audio.pump(); this.view.pumpNow(); }
    }
    const spec = WEAPON_SPECS[a.current], w = a.weapons[a.current];

    // aim down sights
    const wantAds = player.alive && input.right && !player.sprinting && !(a.reload && !spec.perShell) && !a.switching;
    const rate = 1000 / Math.max(50, spec.adsMs);
    this.ads = clamp(this.ads + (wantAds ? 1 : -1) * dt * rate * (wantAds ? 1 : 1.3), 0, 1);

    // trigger
    const can = player.alive && !player.sprinting && g.state === 'playing';
    const want = can && input.left;
    const trigger = spec.auto ? want : want && !this.fireHeld;
    if (want) this.fireHeld = true; else if (!input.left) this.fireHeld = false;
    if (trigger) {
      for (let shots = 0; shots < 3; shots++) {
        const r = tryFire(a, now);
        if (r.ok) { this.fire(r); if (!spec.auto) break; continue; }
        if (r.reason === 'empty') {
          if (now > this.dryUntil) { g.audio.dryFire(); this.dryUntil = now + 250; }
          if (r.reloading && !spec.perShell) g.audio.reload(a.current, spec.reloadMs / 1000);
        }
        break;
      }
    }

    this.aimAtTarget(dt);

    // viewmodel animation
    let lower = 0;
    if (a.switching) {
      const p = clamp((now - a.switching.startedAt) / (a.switching.endsAt - a.switching.startedAt), 0, 1);
      lower = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
    }
    this.view.update(dt, {
      ads: this.ads, sprinting: player.sprinting, bobPhase: player.bobPhase, bobAmp: player.bobAmp,
      lookDX: player.lookDX, lookDY: player.lookDY, landDip: player.landDip, lean: player.lean,
      lower, reloading: !!a.reload, reloadProgress: reloadProgress(a, now), perShell: spec.perShell, empty: w.mag === 0,
    });
    player.lookDX = player.lookDY = 0;
  }

  /** What is under the crosshair: used for the red crosshair and the enemy health bar. */
  aimAtTarget(dt) {
    const g = this.game, cam = g.gr.camera;
    this.aim.t = Math.max(0, this.aim.t - dt);
    if (!g.player.alive || g.state !== 'playing') { this.aim.enemy = null; return; }
    cam.updateMatrixWorld();
    const f = this.f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    const wh = raycast(g.world.colliders, ox, oy, oz, f.x, f.y, f.z, 120, { bullets: true });
    const eh = g.enemies.raycast(ox, oy, oz, f.x, f.y, f.z, wh ? wh.t : 120);
    if (eh) { this.aim.enemy = eh.enemy; this.aim.last = eh.enemy; this.aim.t = 1.5; } else this.aim.enemy = null;
  }

  // ----------------------------------------------------------------------- fire
  /** The core said the shot is on: resolve it and show it. r comes from tryFire. */
  fire(r) {
    const g = this.game, spec = r.spec, player = g.player, cam = g.gr.camera;
    this.shotCount++;
    cam.updateMatrixWorld();
    const f = this.f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = this.r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = this.u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const origin = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const muzzle = {
      x: origin.x + f.x * 0.75 + right.x * 0.1 - up.x * 0.07,
      y: origin.y + f.y * 0.75 + right.y * 0.1 - up.y * 0.07,
      z: origin.z + f.z * 0.75 + right.z * 0.1 - up.z * 0.07,
    };

    // every pellet flies through the same cone the crosshair showed
    const hits = resolveShot({
      origin, dir: { x: f.x, y: f.y, z: f.z }, spreadDeg: r.spreadDeg, pellets: r.pellets,
      rng: rnd, colliders: g.world.colliders, targets: g.enemies.targets, maxDist: 260,
    });
    let anyHit = false, anyKill = false, anyHead = false, propHit = false;
    for (const h of hits) {
      if (h.kind === 'target') {
        const dmg = damageAtRange(spec, h.t);
        if (dmg > 0.01) {
          const res = h.target.view.takeDamage(dmg, h.zone, h.dir, 'player', h.point);
          anyHit = true;
          if (res.killed) anyKill = true;
          if (h.zone === 'head') anyHead = true;
        }
      } else if (h.kind === 'world') {
        const kind = h.collider ? h.collider.kind : (Math.abs(h.point.x) < 6 || Math.abs(h.point.z) < 6 ? 'asphalt' : 'dirt');
        g.fx.impact(kind, h.point.x, h.point.y, h.point.z, h.normal.x, h.normal.y, h.normal.z, true);
        if (h.pellet === 0) g.audio.impact(kind, h.point);
        if (h.collider && h.collider.owner && g.props.damageOwner(h.collider.owner, damageAtRange(spec, h.t))) propHit = true;
      }
      if ((this.shotCount + h.pellet) % spec.tracerEvery === 0) g.fx.tracer(muzzle.x, muzzle.y, muzzle.z, h.point.x, h.point.y, h.point.z);
    }
    recordShots(g.director.core, 1, anyHit || propHit ? 1 : 0);
    if (anyHit) { g.hud.hitmarker(anyKill, anyHead); g.audio.hitmarker(anyKill, anyHead); }
    else if (propHit) g.hud.hitmarker(false, false, true);

    // feedback
    g.audio.gun(spec.sound);
    this.view.fire();
    g.fx.muzzleSmoke(muzzle.x, muzzle.y, muzzle.z, f.x, f.y, f.z);
    if (spec.perShell) setTimeout(() => g.audio.pump(), 330);
    else {
      g.fx.casing(
        origin.x + f.x * 0.35 + right.x * 0.16 - up.x * 0.08, origin.y + f.y * 0.35 + right.y * 0.16 - up.y * 0.08, origin.z + f.z * 0.35 + right.z * 0.16 - up.z * 0.08,
        right.x * rr(1.6, 2.6) + up.x * rr(1, 2) - f.x * 0.3 + player.pos.vx * 0.5,
        right.y * rr(1.6, 2.6) + up.y * rr(1, 2) + rr(0.8, 1.6),
        right.z * rr(1.6, 2.6) + up.z * rr(1, 2) - f.z * 0.3 + player.pos.vz * 0.5,
      );
    }

    // camera recoil, weaker when aiming
    const adsMul = 1 - 0.4 * ease(this.ads);
    player.addRecoil(r.recoil.x * DEG * adsMul * rr(0.8, 1.25), (rnd() - 0.5) * 2 * r.recoil.y * DEG * adsMul);
    g.enemies.noise(player.pos.x, player.pos.z, spec.noise);
  }
}
