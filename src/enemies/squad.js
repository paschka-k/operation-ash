// Enemy soldiers: procedural model and animation, hit zones, and AI that
// sees, hears, finds paths around buildings, hides behind cover, peeks out
// with a short aim warning and shoots in bursts. Accuracy depends on what the
// player is doing, difficulty rises through three tiers.

import * as THREE from 'three';
import { stepBody, raycast, clamp, damp } from '../core/collision.js';
import { createEnemy, thinkEnemy, enemyHurt, hearNoise, alertNearby, ENEMY_TYPES, enemyParams, botHitChance } from '../core/ai.js';
import { applyDamage, rayTargets } from '../core/combat.js';
import { waveComposition, waveTier } from '../core/rules.js';

export { ENEMY_TYPES, enemyParams };

const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();

// ------------------------------------------------------------- model parts
const GEO = {};
function geo() {
  if (GEO.ready) return GEO;
  const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  GEO.torso = box(0.4, 0.5, 0.24, 0, 0.27, 0);
  GEO.vest = box(0.44, 0.34, 0.28, 0, 0.3, 0.005);
  GEO.pack = box(0.3, 0.34, 0.12, 0, 0.3, -0.19);
  GEO.pelvis = box(0.34, 0.2, 0.22, 0, 0, 0);
  GEO.head = new THREE.SphereGeometry(0.105, 14, 10);
  const helmet = new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  helmet.translate(0, 0.012, 0);
  GEO.helmet = helmet;
  GEO.upperArm = box(0.095, 0.3, 0.095, 0, -0.15, 0);
  GEO.foreArm = box(0.085, 0.28, 0.085, 0, -0.14, 0);
  GEO.hand = box(0.08, 0.08, 0.09, 0, -0.3, 0);
  GEO.upperLeg = box(0.16, 0.46, 0.17, 0, -0.23, 0);
  GEO.lowerLeg = box(0.14, 0.46, 0.15, 0, -0.23, 0);
  GEO.boot = box(0.15, 0.1, 0.27, 0, -0.48, 0.04);
  GEO.rifleBody = box(0.06, 0.1, 0.5, 0, 0, 0.1);
  GEO.rifleBarrel = box(0.025, 0.025, 0.3, 0, 0.02, 0.5);
  GEO.rifleStock = box(0.05, 0.1, 0.2, 0, -0.01, -0.22);
  GEO.rifleMag = box(0.04, 0.16, 0.06, 0, -0.12, 0.08);
  GEO.pistolBody = box(0.04, 0.08, 0.2, 0, 0, 0.1);
  GEO.pistolGrip = box(0.04, 0.12, 0.05, 0, -0.08, 0.02);
  GEO.ready = true;
  return GEO;
}

const MAT_CACHE = new Map();
function mats(type) {
  if (MAT_CACHE.has(type)) return MAT_CACHE.get(type);
  const t = ENEMY_TYPES[type];
  const m = {
    uniform: new THREE.MeshStandardMaterial({ color: t.uniform, roughness: 0.92, metalness: 0 }),
    vest: new THREE.MeshStandardMaterial({ color: t.vest, roughness: 0.85, metalness: 0.05 }),
    helmet: new THREE.MeshStandardMaterial({ color: t.helmet, roughness: 0.6, metalness: 0.15 }),
    skin: new THREE.MeshStandardMaterial({ color: t.skin, roughness: 0.7 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.4, metalness: 0.9 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 0.8 }),
  };
  MAT_CACHE.set(type, m);
  return m;
}

function buildSoldier(type) {
  const G = geo(), M = mats(type), T = ENEMY_TYPES[type];
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = false; return o; };
  const root = new THREE.Group();
  root.scale.setScalar(T.scale);
  const hips = new THREE.Group();
  hips.position.y = 0.93;
  root.add(hips);
  hips.add(mesh(G.pelvis, M.uniform));

  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.1, 0, 0);
    hip.add(mesh(G.upperLeg, M.uniform));
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    knee.add(mesh(G.lowerLeg, M.uniform));
    knee.add(mesh(G.boot, M.boot));
    hip.add(knee);
    hips.add(hip);
    legs.push({ hip, knee });
  }

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  torso.add(mesh(G.torso, M.uniform));
  torso.add(mesh(G.vest, M.vest));
  torso.add(mesh(G.pack, M.vest));

  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.01);
  head.add(mesh(G.head, M.skin));
  head.add(mesh(G.helmet, M.helmet));
  torso.add(head);

  const arms = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.255, 0.47, 0);
    shoulder.add(mesh(G.upperArm, M.uniform));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.add(mesh(G.foreArm, M.uniform));
    elbow.add(mesh(G.hand, M.skin));
    shoulder.add(elbow);
    torso.add(shoulder);
    arms.push({ shoulder, elbow });
  }

  const gun = new THREE.Group();
  if (T.weapon === 'rifle') {
    gun.add(mesh(G.rifleBody, M.gun), mesh(G.rifleBarrel, M.gun), mesh(G.rifleStock, M.gun), mesh(G.rifleMag, M.gun));
    gun.position.set(0.1, 0.3, 0.25);
  } else {
    gun.add(mesh(G.pistolBody, M.gun), mesh(G.pistolGrip, M.gun));
    gun.position.set(0.09, 0.33, 0.28);
  }
  torso.add(gun);

  arms[1].shoulder.rotation.set(-1.15, 0.05, 0.12);
  arms[1].elbow.rotation.set(-0.7, 0, 0);
  arms[0].shoulder.rotation.set(-1.25, -0.2, -0.28);
  arms[0].elbow.rotation.set(-0.55, 0, 0);
  if (T.weapon !== 'rifle') {
    arms[0].shoulder.rotation.set(-1.25, 0.1, 0.1);
    arms[0].elbow.rotation.set(-0.5, 0.3, 0);
  }
  return { root, hips, legs, torso, head, arms, gun };
}

// --------------------------------------------------------------------- Enemy
// One bot in the scene. The decisions come from core/ai (thinkEnemy), this class
// moves the body, plays the animation, draws the aim laser and resolves the shot.
class Enemy {
  constructor(game, core) {
    this.game = game;
    this.core = core;
    core.view = this;
    core.vx = core.vz = core.vy = 0;
    core.radius = 0.33 * core.scale;
    core.height = 1.8 * core.scale;
    core.onGround = true;
    this.model = buildSoldier(core.type);
    for (const m of Object.values(mats(core.type))) game.gr.prepareMaterial(m);
    this.model.root.position.set(core.x, 0, core.z);
    game.gr.scene.add(this.model.root);
    this.walkPhase = rnd() * 6;
    this.deathT = 0;
    this.deathDir = rnd() < 0.7 ? -1 : 1;
    this.deathRoll = (rnd() - 0.5) * 0.5;
    this.remove = false;
  }

  // the rest of the game reads bots through these
  get pos() { return this.core; }
  get alive() { return this.core.alive; }
  get hp() { return this.core.hp; }
  get T() { return this.core.T; }
  get P() { return this.core.P; }
  get id() { return this.core.id; }
  get state() { return this.core.state; }
  get crouchK() { return this.core.crouch; }
  get lastFired() { return this.core.lastFiredAt / 1000; }

  // ------------------------------------------------------------------ per frame
  update(dt, world, now) {
    const c = this.core, g = this.game;
    if (!c.alive) { this.updateDeath(dt); return; }
    const intent = thinkEnemy(c, world, dt, now);

    // movement: smooth the velocity toward what the AI wants
    const slow = c.flinch > 0 ? 0.45 : 1;
    if (intent.speed > 0) {
      c.vx = damp(c.vx, intent.moveX * intent.speed * slow, 10, dt);
      c.vz = damp(c.vz, intent.moveZ * intent.speed * slow, 10, dt);
    } else {
      c.vx = damp(c.vx, 0, 12, dt);
      c.vz = damp(c.vz, 0, 12, dt);
    }
    this.separate(dt);
    stepBody(c, dt, g.world.colliders, { gravity: 22, stepHeight: 0.4 });
    c.x = clamp(c.x, -44.3, 44.3);
    c.z = clamp(c.z, -44.3, 44.3);
    c.speedNow = Math.hypot(c.vx, c.vz);

    // effects of the decision
    if (intent.cue) g.audio.telegraph(this.muzzlePos());
    if (intent.laser > 0) this.aimLaser(intent.laser);
    if (intent.alert) alertNearby(g.enemies.cores, c, world.player, intent.alert, rnd);
    if (intent.fire) this.shoot(intent.fire.dist, now);
    this.animate(dt);
  }

  separate(dt) {
    const c = this.core;
    for (const o of this.game.enemies.cores) {
      if (o === c || !o.alive) continue;
      const dx = c.x - o.x, dz = c.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.85 * 0.85 && d2 > 1e-4) {
        const d = Math.sqrt(d2), push = (0.85 - d) * 5;
        c.vx += (dx / d) * push * dt * 8;
        c.vz += (dz / d) * push * dt * 8;
      }
    }
  }

  muzzlePos() {
    const c = this.core, s = c.scale, y = c.yaw;
    const sy = Math.sin(y), cy = Math.cos(y);
    const len = (c.T.weapon === 'rifle' ? 0.82 : 0.5) * s;
    return {
      x: c.x + sy * len + cy * 0.12 * s,
      y: c.y + (1.4 - 0.45 * c.crouch) * s,
      z: c.z + cy * len - sy * 0.12 * s,
    };
  }

  aimLaser(alpha) {
    const g = this.game, m = this.muzzlePos(), eye = g.player.eyePos();
    g.fx.laser(this.core.id % 6, m.x, m.y, m.z, eye.x, eye.y - 0.3, eye.z, alpha);
  }

  /** Resolve one shot at the player. Walls block it, near misses crack past the ear. */
  shoot(dist, now) {
    const g = this.game, p = g.player, c = this.core, T = c.T;
    const m = this.muzzlePos();
    const eye = p.eyePos();
    const tx = p.pos.x, ty = eye.y - 0.35, tz = p.pos.z;

    const chance = botHitChance(c.P.acc, dist, c.seenTime, {
      speedFrac: p.speedFrac, sprinting: p.sprinting, crouched: p.crouchHeld, airborne: !p.pos.onGround,
    });
    const hit = rnd() < chance;

    let px = tx, py = ty, pz = tz;
    if (!hit) {
      const off = rr(0.35, 1.6);
      const a = rnd() * Math.PI * 2;
      px += Math.cos(a) * off; pz += Math.sin(a) * off; py += rr(-0.6, 0.5);
    }
    let dx = px - m.x, dy = py - m.y, dz = pz - m.z;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;

    const wh = raycast(g.world.colliders, m.x, m.y, m.z, dx, dy, dz, hit ? len : 120, { bullets: true });
    const reach = Math.min(len, 90) * (hit ? 1 : 1.5);
    let ex = m.x + dx * reach, ey = m.y + dy * reach, ez = m.z + dz * reach;
    let delivered = hit;
    if (wh && (!hit || wh.t < len - 0.4)) {
      delivered = false;
      ex = wh.x; ey = wh.y; ez = wh.z;
      const kind = wh.box ? wh.box.kind : 'dirt';
      g.fx.impact(kind, wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, true);
      if (Math.hypot(wh.x - p.pos.x, wh.z - p.pos.z) < 22) g.audio.impact(kind, { x: wh.x, y: wh.y, z: wh.z });
      if (wh.box && wh.box.owner) g.props.damageOwner(wh.box.owner, T.dmg[0]);
    }
    if (delivered) {
      p.damage(rr(T.dmg[0], T.dmg[1]), c.x, c.z, 'bullet');
      ex = tx; ey = ty; ez = tz;
    } else {
      const rx = ex - m.x, ry = ey - m.y, rz = ez - m.z;
      const rl2 = rx * rx + ry * ry + rz * rz;
      if (rl2 > 1) {
        const t = clamp(((eye.x - m.x) * rx + (eye.y - m.y) * ry + (eye.z - m.z) * rz) / rl2, 0, 1);
        const cx = m.x + rx * t, cy = m.y + ry * t, cz = m.z + rz * t;
        if (Math.hypot(cx - eye.x, cy - eye.y, cz - eye.z) < 2.6 && t > 0.05 && t < 0.98) g.audio.whiz({ x: cx, y: cy, z: cz });
      }
    }
    g.fx.tracer(m.x, m.y, m.z, ex, ey, ez, 0xffb070, 0.016);
    g.fx.enemyFlash(m.x, m.y, m.z, T.weapon === 'rifle' ? 0.42 : 0.3);
    g.audio.gun(T.weapon === 'rifle' ? 'enemy' : 'enemyPistol', m);
    c.lastFiredAt = now;
    if (dist < 30 && rnd() < 0.4) g.fx.flashLight(m.x, m.y, m.z, 0xffa860, 3, 0.07, 9);
  }

  // -------------------------------------------------------------- animation
  animate(dt) {
    const M = this.model, c = this.core, T = c.T;
    const sp = c.speedNow;
    if (sp > 0.3) this.walkPhase += dt * (3.0 + sp * 1.55);
    const amp = clamp(sp / 3.6, 0, 1.3);
    const ph = this.walkPhase;
    const ck = c.crouch;

    M.legs[0].hip.rotation.x = Math.sin(ph) * 0.75 * amp * (1 - ck) - ck * 1.15;
    M.legs[1].hip.rotation.x = -Math.sin(ph) * 0.75 * amp * (1 - ck) - ck * 1.0;
    M.legs[0].knee.rotation.x = Math.max(0, -Math.sin(ph + 1.2)) * 0.95 * amp * (1 - ck) + ck * 1.95;
    M.legs[1].knee.rotation.x = Math.max(0, Math.sin(ph + 1.2)) * 0.95 * amp * (1 - ck) + ck * 1.8;
    M.hips.position.y = 0.93 + Math.abs(Math.sin(ph)) * 0.035 * amp * (1 - ck) - ck * 0.4 - (c.state === 'combat' && sp < 0.3 ? 0.03 : 0);
    // a hit jolts the torso back for a moment
    M.torso.rotation.x = 0.06 + amp * 0.08 + ck * 0.25 - Math.min(c.flinch, 0.18) * 1.6;
    const sinceShot = (this.game.time * 1000 - c.lastFiredAt) / 1000;
    M.gun.position.z = (T.weapon === 'rifle' ? 0.25 : 0.28) - (sinceShot < 0.08 ? 0.03 : 0);
    M.root.position.set(c.x, c.y, c.z);
    M.root.rotation.y = c.yaw;
  }

  updateDeath(dt) {
    const c = this.core, M = this.model;
    this.deathT += dt;
    const k = clamp(this.deathT / 0.7, 0, 1);
    const fall = k * k;
    M.root.rotation.x = this.deathDir * fall * (Math.PI / 2 - 0.08);
    M.root.rotation.z = this.deathRoll * fall;
    M.root.position.y = c.y + fall * 0.12 * c.scale;
    M.legs[0].hip.rotation.x = damp(M.legs[0].hip.rotation.x, 0.1, 6, dt);
    M.legs[1].hip.rotation.x = damp(M.legs[1].hip.rotation.x, -0.2, 6, dt);
    if (this.deathT > 8) {
      M.root.position.y -= (this.deathT - 8) * 0.12 * dt * 10;
      if (this.deathT > 11) this.remove = true;
    }
  }

  // ------------------------------------------------------------------ damage
  /**
   * amount is the damage of one projectile after range falloff. The zone and the
   * armour are applied by core/combat. Returns {killed, headshot}.
   */
  takeDamage(amount, zone, dir, source = 'player', point = null) {
    const c = this.core, g = this.game;
    if (!c.alive) return { killed: false };
    const r = applyDamage(c, amount, zone);
    const pt = point || { x: c.x, y: c.y + 1.2, z: c.z };
    g.fx.blood(pt.x, pt.y, pt.z, dir.x, dir.y, dir.z, zone === 'head' ? 1.6 : 1);
    g.audio.impact('flesh', pt);
    const pl = { x: g.player.pos.x, z: g.player.pos.z };
    const res = enemyHurt(c, { source, player: pl, rng: rnd });
    if (res.alert) alertNearby(g.enemies.cores, c, pl, res.alert, rnd);
    if (r.dead) {
      this.die(zone, source);
      return { killed: true, headshot: zone === 'head' };
    }
    return { killed: false };
  }

  die(zone, source) {
    const c = this.core, g = this.game;
    c.alive = false;
    c.state = 'dead';
    c.sees = false;
    this.deathT = 0;
    g.audio.enemyDeath({ x: c.x, y: c.y + 1, z: c.z });
    g.director.onKill(this, zone, source);
    const r = rnd();
    if (r < 0.14) g.props.spawnPickup('ammo', c.x, c.z, 0, 40);
    else if (r < 0.22) g.props.spawnPickup('health', c.x, c.z, 0, 40);
  }
}

// ---------------------------------------------------------------------- squad
export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.cores = [];          // the core/ai bots, also the targets for core/combat
    this.budget = { path: 0, cover: 0 };
    this._eye = { x: 0, y: 0, z: 0 };
  }

  /** Targets for core/combat: the living and dead bots (dead ones are skipped there). */
  get targets() { return this.cores; }

  /** Add a bot. opts: {state, lastSeen} for bots that arrive already hunting. */
  spawn(type, x, z, tier = 1, opts = {}) {
    const core = createEnemy({ x, z, type, ...opts }, tier, rnd);
    const e = new Enemy(this.game, core);
    this.list.push(e);
    this.cores.push(core);
    return e;
  }

  aliveCount() { let n = 0; for (const c of this.cores) if (c.alive) n++; return n; }

  /** Put a whole wave into the level at once (the game itself lets bots arrive one by one). */
  spawnWave(n, tier) {
    const pts = this.game.world.spawnPoints;
    let i = 0;
    for (const [type, count] of Object.entries(waveComposition(n))) {
      for (let k = 0; k < count; k++) { const p = pts[i++ % pts.length]; this.spawn(type, p.x, p.z, tier ?? waveTier(n)); }
    }
  }

  /** What the AI needs to know about the world this frame. */
  buildWorld() {
    const g = this.game, p = g.player;
    const eye = p.eyePos();
    this._eye.x = eye.x; this._eye.y = eye.y; this._eye.z = eye.z;
    return {
      player: {
        x: p.pos.x, y: p.pos.y, z: p.pos.z, eye: this._eye, alive: p.alive,
        speedFrac: p.speedFrac, sprinting: p.sprinting, crouched: p.crouchHeld, airborne: !p.pos.onGround,
      },
      colliders: g.world.colliders, nav: g.world.nav, coverIndex: g.world.coverIndex, spawnPoints: g.world.spawnPoints,
      rng: rnd, budget: this.budget,
    };
  }

  update(dt) {
    this.budget.path = 3;
    this.budget.cover = 2;
    const world = this.buildWorld();
    const now = this.game.time * 1000;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.update(dt, world, now);
      if (e.remove) {
        this.game.gr.scene.remove(e.model.root);
        this.list.splice(i, 1);
        const k = this.cores.indexOf(e.core);
        if (k >= 0) this.cores.splice(k, 1);
      }
    }
  }

  /** Enemies within radius hear a sound at x,z and go to investigate. */
  noise(x, z, radius) { hearNoise(this.cores, x, z, radius, rnd); }

  /** Nearest living bot on a ray. Returns {t, enemy, zone} or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    const h = rayTargets({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, maxT, this.cores);
    return h ? { t: h.t, enemy: h.target.view, zone: h.zone } : null;
  }

  clear() {
    for (const e of this.list) this.game.gr.scene.remove(e.model.root);
    this.list.length = 0;
    this.cores.length = 0;
  }
}

/** The enemy squad. Returns {spawnWave(n, tier), update(dt), targets, aliveCount(), clear()}. */
export function createSquad(game) { return new Enemies(game); }
