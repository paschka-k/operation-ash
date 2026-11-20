// Dynamic props: destructible crates, explosive barrels (chain reactions),
// and health / ammo pickups. Static scenery is built in level.js.
//
// Every kind of prop is one pool of copies (pool.js): all crates are a single draw call,
// and the shadow maps see a box per crate instead of the scanned model.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox, clamp } from '../core/collision.js';
import { getModelGeometry } from '../render/models.js';
import { pbrMaterial } from '../render/materials.js';
import { InstancePool, placement } from './pool.js';
import { explode } from '../core/combat.js';
import { MAP_HALF } from '../config.js';
import { CRATE_HP, BARREL_HP, EXPLOSION, PICKUP, applyMedkit } from '../core/rules.js';
import { onRoute, ROUTE_KEEP_CLEAR } from '../core/routes.js';

const rnd = Math.random;

export class Props {
  constructor(game) {
    this.game = game;
    this.crates = [];
    this.barrels = [];
    this.pickups = [];
    this.timers = [];
    this.time = 0;
    this.root = new THREE.Group();
    game.gr.scene.add(this.root);
    this._buildPools();
    this._buildPickupMeshes();
  }

  get world() { return this.game.world; }

  // -------------------------------------------------------- construction
  /** One pool per kind of prop: crates, barrels, and the burnt husks barrels leave behind. */
  _buildPools() {
    const gr = this.game.gr;
    const prepare = (m) => { for (const one of Array.isArray(m) ? m : [m]) gr.prepareMaterial(one); };
    // shapes for the shadow maps and the ambient occlusion pass, a little inside the models
    const crateShape = new THREE.BoxGeometry(0.96, 0.96, 0.96).translate(0, 0.5, 0);
    const barrelShape = new THREE.CylinderGeometry(0.285, 0.285, 0.88, 12).translate(0, 0.45, 0);
    const crate = getModelGeometry('crate'), barrel = getModelGeometry('barrel');
    // the husks' own material (the block's metalChar), not the map's: the props outlive every map
    const charred = pbrMaterial(this.game.textures.metal, { color: 0x58514a });
    const husk = Array.isArray(barrel.material) ? barrel.material.map(() => charred) : charred;
    prepare(crate.material); prepare(barrel.material); prepare(charred);
    this.pools = {
      crate: new InstancePool({ geometry: crate.geometry, material: crate.material, proxy: crateShape, gr, capacity: 96 }),
      barrel: new InstancePool({ geometry: barrel.geometry, material: barrel.material, proxy: barrelShape, gr, capacity: 64 }),
      husk: new InstancePool({ geometry: barrel.geometry, material: husk, proxy: barrelShape, gr, capacity: 64 }),
    };
    for (const pool of Object.values(this.pools)) this.root.add(pool.group);
  }

  /** A pickup is a few boxes painted per vertex: one geometry and one material for both kinds. */
  _pickupGeometry(parts) {
    const geos = parts.map(([w, h, d, color, y = 0]) => {
      const g = new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
      const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    return mergeGeometries(geos, false);
  }

  _buildPickupMeshes() {
    const gr = this.game.gr;
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
    gr.prepareMaterial(paint);
    const WHITE = 0xe6e6e0, RED = 0xe02a20, OLIVE = 0x59633c, YELLOW = 0xe0b820;
    const shapes = {
      health: this._pickupGeometry([[0.4, 0.15, 0.28, WHITE], [0.2, 0.02, 0.06, RED, 0.081], [0.06, 0.02, 0.2, RED, 0.081]]),
      ammo: this._pickupGeometry([[0.36, 0.2, 0.24, OLIVE], [0.1, 0.205, 0.245, YELLOW], [0.37, 0.03, 0.25, OLIVE, 0.1]]),
    };
    // the light column fades out upwards: a gradient in the alpha of a tiny texture
    const fadeCanvas = document.createElement('canvas');
    fadeCanvas.width = 4; fadeCanvas.height = 64;
    const fg = fadeCanvas.getContext('2d');
    const grad = fg.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = grad; fg.fillRect(0, 0, 4, 64);
    const fade = new THREE.CanvasTexture(fadeCanvas);
    const beam = (color) => new THREE.MeshBasicMaterial({ color, map: fade, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const beamHealth = beam(0xff5a4a);
    const beamAmmo = beam(0xffc94a);
    this.pickupMats = { paint, beamHealth, beamAmmo };
    this.beamGeo = new THREE.CylinderGeometry(0.17, 0.17, 2.8, 16, 1, true);
    this.beamGeo.translate(0, 1.4, 0);
    // small floating things: they cast a shadow but are left out of the ambient occlusion pass
    const item = (geometry) => new InstancePool({ geometry, material: paint, gr, capacity: 48, receiveShadow: false, occlude: false });
    const column = (material) => {
      const pool = new InstancePool({ geometry: this.beamGeo, material, gr, capacity: 48, castShadow: false, receiveShadow: false, occlude: false });
      pool.detail.renderOrder = 9;
      return pool;
    };
    this.pickupPools = {
      health: { item: item(shapes.health), beam: column(beamHealth) },
      ammo: { item: item(shapes.ammo), beam: column(beamAmmo) },
    };
    for (const p of Object.values(this.pickupPools)) this.root.add(p.item.group, p.beam.group);
  }

  /** Is there room for a prop of radius r at x,z? Never on the riders' loops of the map (wave 14, 15). */
  canPlace(x, z, r) {
    const lim = (this.world.half ?? MAP_HALF) - 1.5;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const ps = this.world.playerStart;
    if (Math.hypot(x - ps.x, z - ps.z) < 4) return false;
    if (onRoute(x, z, r + ROUTE_KEEP_CLEAR, this.world.routes || undefined)) return false;
    for (const c of this.world.colliders) {
      if (c.maxY < 0.1) continue;
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
      if ((cx - x) ** 2 + (cz - z) ** 2 < (r + 0.12) ** 2) return false;
    }
    return true;
  }

  addCrate(x, z, size = 1, y = 0) {
    const rot = (rnd() - 0.5) * 0.08;
    const crate = { type: 'crate', hp: CRATE_HP, size, alive: true, x, y, z, rot };
    crate.copy = this.pools.crate.add(placement(x, y, z, 0, rot, 0, size));
    const box = makeBox(x, y + size / 2, z, size, size, size, { kind: 'wood', owner: crate });
    crate.box = box;
    this.world.addCollider(box);
    this.crates.push(crate);
    return crate;
  }

  addBarrel(x, z, explosive = true) {
    const rot = rnd() * 6.28;
    const barrel = { type: 'barrel', hp: BARREL_HP, alive: true, explosive, x, z, rot };
    barrel.copy = this.pools.barrel.add(placement(x, 0, z, 0, rot, 0));
    const box = makeBox(x, 0.45, z, 0.6, 0.9, 0.6, { kind: 'metal', owner: barrel });
    barrel.box = box;
    this.world.addCollider(box);
    this.barrels.push(barrel);
    return barrel;
  }

  /** Damage a barrel (by object) from outside the shooting code, e.g. a script or a test. */
  damageBarrel(barrel, amount) { return this.damageOwner(barrel, amount); }

  // ------------------------------------------------------------- damage
  /** Damage whatever owns a collider. Returns true if something was hit. */
  damageOwner(owner, amount) {
    if (!owner || !owner.alive) return false;
    owner.hp -= amount;
    if (owner.type === 'crate') {
      // visual shake on hit
      this.pools.crate.set(owner.copy, placement(owner.x + (rnd() - 0.5) * 0.012, owner.y, owner.z, 0, owner.rot, 0, owner.size));
      if (owner.hp <= 0) this.breakCrate(owner);
    } else if (owner.type === 'barrel') {
      if (owner.hp <= 0) this.blowBarrel(owner);
    }
    return true;
  }

  breakCrate(c, quiet = false) {
    if (!c.alive) return;
    c.alive = false;
    const p = c;                         // the model stands on this point
    const cy = p.y + c.size / 2;
    this.world.removeCollider(c.box);
    this.pools.crate.remove(c.copy);
    const fx = this.game.fx;
    for (let i = 0; i < 5; i++) {
      fx.impact('wood', p.x + (rnd() - 0.5) * c.size * 0.7, cy + (rnd() - 0.2) * c.size * 0.5, p.z + (rnd() - 0.5) * c.size * 0.7, 0, 1, 0, false);
    }
    if (!quiet) this.game.audio.crateBreak(p.x, cy, p.z);
    // loot
    const r = rnd();
    const floor = p.y;
    if (r < 0.2) this.spawnPickup('ammo', p.x, p.z, floor, 40);
    else if (r < 0.32) this.spawnPickup('health', p.x, p.z, floor, 40);
  }

  blowBarrel(b, delay = 0) {
    if (!b.alive) return;
    b.alive = false;
    const go = () => {
      const g = this.game;
      const x = b.x, z = b.z;
      g.world.removeCollider(b.box);
      g.fx.explosion(x, 0.5, z, 1);
      g.audio.explosion(x, 0.5, z);
      this.explode(x, 0.6, z, EXPLOSION.radius, EXPLOSION.damage, 'barrel');
      // charred husk lying on its side
      this.pools.barrel.remove(b.copy);
      const roll = (rnd() < 0.5 ? 1 : -1) * (1.2 + rnd() * 0.3);
      b.copy = this.pools.husk.add(placement(x + (rnd() - 0.5) * 0.8, 0.28, z + (rnd() - 0.5) * 0.8, 0, b.rot, roll));
      g.fx.fire(x, 0.1, z, 0.7, 6 + rnd() * 5, false);
    };
    if (delay > 0) this.timers.push({ t: delay, fn: go });
    else go();
  }

  /**
   * Area damage. Walls reduce it, linear falloff with distance.
   * source is a label for the kill feed.
   */
  explode(x, y, z, radius, maxDamage, source = 'explosion') {
    const g = this.game;
    const colliders = g.world.colliders;
    // barrels and crates first so chains cascade with a short delay
    for (const b of this.barrels) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < radius) this.blowBarrel(b, 0.08 + d * 0.035);
    }
    for (const c of this.crates) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < radius * 0.8) this.breakCrate(c);
    }
    // bots: core/combat works out who is hurt and how much, here we apply it
    const center = { x, y, z };
    for (const d of explode({ center, radius, damage: maxDamage, targets: g.enemies.targets, colliders })) {
      d.target.view.takeDamage(d.damage, 'body', { x: d.target.x - x, y: 0.4, z: d.target.z - z }, source);
    }
    // the player is hurt by the same rules, a little further out
    const pl = g.player;
    const target = { id: 'player', x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, scale: 1.2, alive: pl.alive };
    for (const d of explode({ center, radius: radius * 1.3, damage: maxDamage * 0.85, targets: [target], colliders })) {
      if (d.damage > 1) pl.damage(d.damage, x, z, source);
    }
    const pd = Math.hypot(pl.pos.x - x, pl.pos.y + 1.0 - y, pl.pos.z - z);
    pl.shake(clamp(1.6 - pd / 12, 0.1, 1.6));
    // blasts are noisy
    g.enemies.noise(x, z, 45);
  }

  // ----------------------------------------------------------- pickups
  /**
   * Pickups. life > 0 makes them time out. respawn > 0 makes a fixed spawner that
   * comes back that many seconds after it was taken.
   */
  spawnPickup(type, x, z, y = 0, life = 0, respawn = 0, animate = false) {
    const pools = this.pickupPools[type === 'health' ? 'health' : 'ammo'];
    const p = { type, x, z, y, born: this.time, life, respawn, t0: rnd() * 6, appear: animate ? 0 : 1, near: 1 };
    p.item = pools.item.add(placement(x, y + 0.45, z));
    p.beam = pools.beam.add(placement(x, y + 0.05, z));
    this._placePickup(p);
    this.pickups.push(p);
    return p;
  }

  /** Where a pickup is right now: it bobs, turns, grows in when it appears, and its light column narrows up close. */
  _placePickup(p) {
    const pools = this.pickupPools[p.type === 'health' ? 'health' : 'ammo'];
    const t = this.time + p.t0;
    const e = 1 - (1 - p.appear) ** 3;
    const s = p.appear < 1 ? Math.max(0.01, e * (1 + 0.25 * Math.sin(p.appear * Math.PI))) : 1;
    const y = p.y + 0.45 + Math.sin(t * 2.2) * 0.06;
    pools.item.set(p.item, placement(p.x, y, p.z, 0, t * 1.4, 0, s));
    pools.beam.set(p.beam, placement(p.x, y - 0.4 * s, p.z, 0, 0, 0, p.near * s, s, p.near * s));
  }

  _collect(p, i) {
    const g = this.game;
    const pl = g.player;
    if (p.type === 'health') {
      const r = applyMedkit(pl.health, pl.maxHealth);
      if (!r.used) return false;
      pl.health = r.health;
      g.hud.toast(g.t('pickupHealth'));
    } else {
      if (!g.weapons.addAmmo()) return false;
      g.hud.toast(g.t('pickupAmmo'));
    }
    g.audio.pickup();
    this._dropPickup(p);
    this.pickups.splice(i, 1);
    if (p.respawn > 0) {
      this.timers.push({ t: p.respawn, spawner: true, fn: () => this.spawnPickup(p.type, p.x, p.z, p.y, 0, p.respawn, true) });
    }
    return true;
  }

  /** Take a pickup out of the scene. */
  _dropPickup(p) {
    const pools = this.pickupPools[p.type === 'health' ? 'health' : 'ammo'];
    pools.item.remove(p.item);
    pools.beam.remove(p.beam);
  }

  /** Bring back every fixed supply point that is still waiting to respawn. */
  restoreSpawners() {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (!this.timers[i].spawner) continue;
      const fn = this.timers[i].fn;
      this.timers.splice(i, 1);
      fn();
    }
  }

  // ------------------------------------------------------------- update
  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn;
        this.timers.splice(i, 1);
        fn();
      }
    }
    const pl = this.game.player;
    const cam = this.game.gr.camera;
    // when the player is completely out of ammo, ammo boxes glow brighter
    const out = this.game.weapons.totalAmmo() === 0;
    this.pickupMats.beamAmmo.opacity = out ? 0.3 + 0.16 * Math.sin(this.time * 6) : 0.14;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      // the light column is a far away marker: it narrows to a thread when you get close
      const cdx = cam.position.x - p.x, cdz = cam.position.z - p.z;
      p.near = Math.min(1, Math.max(0.12, (Math.hypot(cdx, cdz) - 1.5) / 7));
      if (p.appear < 1) p.appear = Math.min(1, p.appear + dt * 1.8);
      this._placePickup(p);
      if (p.life > 0 && this.time - p.born > p.life) {
        this._dropPickup(p);
        this.pickups.splice(i, 1);
        continue;
      }
      if (!pl.alive) continue;
      const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
      if (dx * dx + dz * dz < PICKUP.radius * PICKUP.radius && Math.abs(pl.pos.y - p.y) < 1.6) this._collect(p, i);
    }
  }

  /** Remove everything dynamic. world._places() recreates it. */
  clear() {
    // removeCollider is safe to call twice, and a barrel waiting for its chain explosion is already not alive.
    // The pools keep their geometry: the next game fills them again.
    for (const c of this.crates) this.world.removeCollider(c.box);
    for (const b of this.barrels) this.world.removeCollider(b.box);
    for (const pool of Object.values(this.pools)) pool.clear();
    for (const p of Object.values(this.pickupPools)) { p.item.clear(); p.beam.clear(); }
    this.crates.length = 0; this.barrels.length = 0; this.pickups.length = 0; this.timers.length = 0;
  }
}

/** Props: crates, explosive barrels and pickups. Returns {pickups, barrels, update(dt), damageBarrel(b, amount)}. */
export function createProps(game) { return new Props(game); }
