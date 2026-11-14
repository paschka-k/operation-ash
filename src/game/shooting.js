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
  addAmmoAll, reloadProgress, specOf, giveWeapon, cycleWeapon, WEAPON_ORDER, START_WEAPONS,
  setTrigger, spinLevel, weaponMoveMul, takeGrenade,
} from '../core/weapons.js';
import { snapshotArsenal, restoreArsenal } from '../core/weapons.js';
import { GRENADE, FLAME, igniteBurn, burnDamage, fireInterval } from '../core/rules.js';
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
    this.arsenal = createArsenal('rifle', START_WEAPONS);
    this.view = createViewmodel(game);
    this.ads = 0;
    this.fireHeld = false;
    this.dryUntil = 0;
    this.shotCount = 0;
    this.aim = { enemy: null, last: null, t: 0 };
    this.throwT = 0;          // seconds left of a grenade throw; the weapon is lowered meanwhile
    this.thrown = false;
    this.flaming = 0;         // seconds the flame stream keeps roaring after the last fuel tick
    this.lastShotAt = -1e9;   // game time (ms) of the last shot, for the minigun's buzz
    this.nozzle = new THREE.Vector3();
    this.f = new THREE.Vector3();
    this.r = new THREE.Vector3();
    this.u = new THREE.Vector3();
  }

  /** The weapon in hand: {id, mag, reserve}. */
  get cur() { const a = this.arsenal; return { id: a.current, ...a.weapons[a.current] }; }

  reset() {
    resetArsenal(this.arsenal, 'rifle', START_WEAPONS);
    this.view.setWeapon(this.arsenal.current);
    this.ads = 0;
    this.fireHeld = false;
    this.dryUntil = 0;
    this.aim.enemy = null;
    this.aim.last = null;
    this.throwT = 0;
    this.flaming = 0;
    this.lastShotAt = -1e9;
    this.view.endFlash();
  }

  // ---- wave 12: the checkpoint of a wave start and the revival
  /** A deep copy of what the player carries (core snapshotArsenal). */
  checkpoint() { return snapshotArsenal(this.arsenal); }

  /** Back to a checkpoint: the trigger, the aim and the model in hand start fresh. */
  restore(snap) {
    this.reset();
    if (snap) restoreArsenal(this.arsenal, snap);
    this.view.setWeapon(this.arsenal.current);
  }

  adsAmount() { return this.ads; }
  zoomRatio() { return lerp(1, specOf(this.arsenal).zoom, ease(this.ads)); }
  totalAmmo() { return totalAmmo(this.arsenal); }
  /** An ammo box: one magazine for every owned weapon. */
  addAmmo() { return addAmmoAll(this.arsenal, 1); }
  /** Give the player a weapon with full ammunition (the shop, tests). */
  give(id) { return giveWeapon(this.arsenal, id); }
  /** Debug: every weapon in the game. */
  giveAll() { for (const id of WEAPON_ORDER) giveWeapon(this.arsenal, id); }
  firingLock() {
    const a = this.arsenal;
    if (spinLevel(a) > 0) return true;     // no running with the barrels of a minigun turning
    return this.game.input.left && a.weapons[a.current].mag > 0 && !a.reload && !a.switching;
  }
  /** Speed multiplier of the weapon in hand, for the player's moveSpeed(). */
  moveMul() { return weaponMoveMul(this.arsenal); }

  hudInfo() {
    const a = this.arsenal, spec = specOf(a), w = a.weapons[a.current];
    const now = this.game.time * 1000;
    return {
      name: spec.nameKey, id: a.current, mag: w.mag, reserve: w.reserve, magSize: spec.mag,
      reloading: !!a.reload, progress: reloadProgress(a, now),
      spread: spreadDeg(a) * DEG, ads: this.ads,
      scope: !!spec.scope, fuel: !!spec.flame, spin: spinLevel(a), grenades: a.grenades, throwing: this.throwT > 0,
    };
  }

  startReload() {
    const a = this.arsenal, now = this.game.time * 1000;
    const id = a.current, spec = specOf(a, id);
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

    // actions: switch weapons (slot N is WEAPON_ORDER[N - 1], only owned ones answer), reload
    if (player.alive) {
      WEAPON_ORDER.forEach((id, i) => { if (input.actionPressed('slot' + (i + 1))) this.startSwitch(id); });
      if (input.actionPressed('lastWeapon') && a.previous) this.startSwitch(a.previous);
      const wheel = input.takeWheel();
      if (wheel !== 0) this.startSwitch(cycleWeapon(a, wheel > 0 ? 1 : -1));
      if (input.actionPressed('reload')) this.startReload();
      if (input.actionPressed('grenade')) this.throwGrenade();
    } else input.takeWheel();

    // the barrels of a minigun spin while the trigger (or the aim button, it has no sights) is held
    const held = player.alive && !player.sprinting && g.state === 'playing' && !this.throwT;
    setTrigger(a, held && (input.left || (specOf(a).noAds && input.right)));

    // time passes in the arsenal: reloads finish, switches happen
    for (const ev of tickWeapons(a, now)) {
      if (ev.type === 'switched') { this.view.setWeapon(ev.id); this.ads = 0; }
      else if (ev.type === 'shell') { g.audio.shell(); this.view.shell(); }
      else if (ev.type === 'reloadDone' && ev.pump) { g.audio.pump(); this.view.pumpNow(); }
    }
    const spec = specOf(a), w = a.weapons[a.current];

    // aim down sights
    const wantAds = player.alive && input.right && !player.sprinting && !(a.reload && !spec.perShell) && !a.switching && !spec.noAds && !this.throwT;
    const rate = 1000 / Math.max(50, spec.adsMs);
    this.ads = clamp(this.ads + (wantAds ? 1 : -1) * dt * rate * (wantAds ? 1 : 1.3), 0, 1);

    // trigger
    const can = player.alive && !player.sprinting && g.state === 'playing' && !this.throwT;
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
    this.updateThrow(dt);
    this.updateBurning(dt);
    // the minigun whines and buzzes, the flamer roars: continuous sounds, not one per shot
    this.flaming = Math.max(0, this.flaming - dt);
    // the buzz lasts while rounds keep coming: a shot within the last two intervals, whatever the frame rate
    const buzzing = !!spec.spinUpMs && now - this.lastShotAt < 2 * fireInterval(spec) * 1000;
    g.audio.weaponLoops(spinLevel(a), buzzing, this.flaming > 0);

    // viewmodel animation
    let lower = 0;
    if (a.switching) {
      const p = clamp((now - a.switching.startedAt) / (a.switching.endsAt - a.switching.startedAt), 0, 1);
      lower = p < 0.5 ? ease(p * 2) : 1 - ease((p - 0.5) * 2);
    }
    if (this.throwT > 0) {
      // a grenade throw: the weapon dips out of the way and comes back
      const p = 1 - this.throwT / (GRENADE.throwMs / 1000);
      lower = Math.max(lower, 0.75 * (p < 0.25 ? ease(p / 0.25) : p < 0.65 ? 1 : 1 - ease((p - 0.65) / 0.35)));
    }
    this.view.update(dt, {
      ads: this.ads, sprinting: player.sprinting, bobPhase: player.bobPhase, bobAmp: player.bobAmp,
      lookDX: player.lookDX, lookDY: player.lookDY, landDip: player.landDip, lean: player.lean,
      lower, reloading: !!a.reload, reloadProgress: reloadProgress(a, now), perShell: spec.perShell, empty: w.mag === 0,
      spin: spinLevel(a),
    });
    player.lookDX = player.lookDY = 0;
  }

  // ---- wave 13: grenades and burning
  /** Start a throw if there is a grenade and the hands are free. The grenade leaves the hand a moment later. */
  throwGrenade() {
    const g = this.game, a = this.arsenal;
    if (this.throwT > 0 || a.switching || (a.reload && !specOf(a).perShell) || !g.grenades || g.state !== 'playing') return false;
    if (!takeGrenade(a)) { g.audio.dryFire(); return false; }
    a.reload = null;                    // stops loading shells into the shotgun
    this.throwT = GRENADE.throwMs / 1000;
    this.thrown = false;
    g.audio.grenadePin();
    return true;
  }

  updateThrow(dt) {
    if (this.throwT <= 0) return;
    const g = this.game;
    this.throwT = Math.max(0, this.throwT - dt);
    const elapsed = GRENADE.throwMs / 1000 - this.throwT;
    if (!this.thrown && elapsed >= GRENADE.releaseMs / 1000) {
      this.thrown = true;
      if (g.player.alive) {
        g.grenades.throwFromPlayer();
        g.audio.grenadeThrow();
      }
    }
  }

  /**
   * Bots on fire, and the flame damage that piles up on them: applied a few times a second, so a
   * stream of fire is not a hundred separate hits (each hit sprays blood and makes a sound).
   */
  updateBurning(dt) {
    const g = this.game, now = g.time * 1000, from = now - dt * 1000;
    for (const c of g.enemies.targets) {
      if (!c.burn && !c.flameDamage) continue;
      // a dead player's fire goes out: kills after death would still be credited to them
      if (!c.alive || !g.player.alive) { c.burn = null; c.flameDamage = 0; continue; }
      c.flameDamage = (c.flameDamage || 0) + burnDamage(c.burn, from, now);
      if (c.burn && c.burn.until > now) g.fx.burning(c.x, c.y, c.z, c.scale ?? 1, dt, c);
      else c.burn = null;
      c.flameTick = (c.flameTick || 0) - dt;
      if (c.flameTick > 0 || c.flameDamage < 1) continue;
      c.flameTick = FLAME.applyMs / 1000;
      const amount = c.flameDamage;
      c.flameDamage = 0;
      const res = c.view.takeDamage(amount, 'body', { x: 0, y: 1, z: 0 }, 'player', { x: c.x, y: c.y + 1.1, z: c.z });
      g.hud.hitmarker(res.killed, false);
      if (res.killed) g.audio.hitmarker(true, false);
    }
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
    this.lastShotAt = g.time * 1000;
    if (spec.flame) { this.fireFlame(r); return; }
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
    if (spec.boltAction) g.audio.bolt();
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

  /**
   * One tick of fuel through a flamethrower: its pellets are short rays that stop at spec.range,
   * set bots alight and pile damage on them (updateBurning applies it), burn crates and barrels.
   * No tracers, holes or casings: the stream itself is drawn by the effects layer.
   */
  fireFlame(r) {
    const g = this.game, spec = r.spec, player = g.player, cam = g.gr.camera, now = g.time * 1000;
    cam.updateMatrixWorld();
    const f = this.f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const origin = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const hits = resolveShot({
      origin, dir: { x: f.x, y: f.y, z: f.z }, spreadDeg: r.spreadDeg, pellets: r.pellets,
      rng: rnd, colliders: g.world.colliders, targets: g.enemies.targets, maxDist: spec.range,
    });
    let anyHit = false, propHit = false;
    for (const h of hits) {
      const dmg = damageAtRange(spec, h.t);
      if (dmg <= 0.01) continue;
      if (h.kind === 'target') {
        const c = h.target;
        c.flameDamage = (c.flameDamage || 0) + dmg;
        c.burn = igniteBurn(c.burn, spec, now, dmg);
        anyHit = true;
      } else if (h.kind === 'world' && h.collider && h.collider.owner && g.props.damageOwner(h.collider.owner, dmg)) propHit = true;
    }
    recordShots(g.director.core, 1, anyHit || propHit ? 1 : 0);
    if (propHit && !anyHit) g.hud.hitmarker(false, false, true);

    // the stream: from the nozzle on screen, as far as the first wall or its reach
    const wall = raycast(g.world.colliders, origin.x, origin.y, origin.z, f.x, f.y, f.z, spec.range, { bullets: true });
    const reach = wall ? Math.max(0.6, wall.t) : spec.range;
    const n = this.view.muzzleInWorld(0.55, this.nozzle);
    g.fx.flameStream(n.x, n.y, n.z, f.x, f.y, f.z, reach, player.pos.vx, player.pos.vz);
    if (wall) g.fx.flameSplash(wall.x, wall.y, wall.z, wall.nx, wall.ny, wall.nz);
    this.view.fire();
    this.flaming = 0.12;
    player.addRecoil(r.recoil.x * DEG * rr(0.6, 1.2), (rnd() - 0.5) * 2 * r.recoil.y * DEG);
    g.enemies.noise(player.pos.x, player.pos.z, spec.noise);
  }
}
