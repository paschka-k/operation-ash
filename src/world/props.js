// Dynamic props: destructible crates, explosive barrels (chain reactions),
// and health / ammo pickups. Static scenery is built in world.js.

import * as THREE from 'three';
import { makeBox, clamp } from '../core/collision.js';
import { getModel } from '../render/models.js';
import { explode } from '../core/combat.js';
import { MAP_HALF } from '../config.js';
import { CRATE_HP, BARREL_HP, EXPLOSION, PICKUP, applyMedkit } from '../core/rules.js';

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
    this.husk = [this.world.m.metalChar, this.world.m.metalChar];
    this._buildPickupMeshes();
  }

  get world() { return this.game.world; }

  // -------------------------------------------------------- construction
  _buildPickupMeshes() {
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.5 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd22a22, roughness: 0.5, emissive: 0x551008, emissiveIntensity: 0.6 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x59633c, roughness: 0.7, metalness: 0.2 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xd6b020, roughness: 0.6, emissive: 0x443300, emissiveIntensity: 0.5 });
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
    this.pickupMats = { white, red, olive, yellow, beamHealth, beamAmmo };
    for (const m of [white, red, olive, yellow]) this.game.gr.prepareMaterial(m);
    this.beamGeo = new THREE.CylinderGeometry(0.17, 0.17, 2.8, 16, 1, true);
    this.beamGeo.translate(0, 1.4, 0);
  }

  /** Is there room for a prop of radius r at x,z? */
  canPlace(x, z, r) {
    const lim = MAP_HALF - 1.5;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const ps = this.world.playerStart;
    if (Math.hypot(x - ps.x, z - ps.z) < 4) return false;
    for (const c of this.world.colliders) {
      if (c.maxY < 0.1) continue;
      const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
      if ((cx - x) ** 2 + (cz - z) ** 2 < (r + 0.12) ** 2) return false;
    }
    return true;
  }

  addCrate(x, z, size = 1, y = 0) {
    const mesh = getModel('crate');
    mesh.scale.setScalar(size);
    mesh.position.set(x, y, z);
    mesh.rotation.y = (rnd() - 0.5) * 0.08;
    this.root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.traverse((o) => { if (o.isMesh) this.game.gr.prepareMaterial(o.material); });
    const crate = { type: 'crate', hp: CRATE_HP, mesh, size, alive: true };
    const box = makeBox(x, y + size / 2, z, size, size, size, { kind: 'wood', owner: crate });
    crate.box = box;
    this.world.addCollider(box);
    this.crates.push(crate);
    return crate;
  }

  addBarrel(x, z, explosive = true) {
    const mesh = getModel('barrel');
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rnd() * 6.28;
    this.root.add(mesh);
    mesh.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.game.gr.prepareMaterial(m); });
    const barrel = { type: 'barrel', hp: BARREL_HP, mesh, alive: true, explosive, x, z };
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
      owner.mesh.position.x += (rnd() - 0.5) * 0.01;
      if (owner.hp <= 0) this.breakCrate(owner);
    } else if (owner.type === 'barrel') {
      if (owner.hp <= 0) this.blowBarrel(owner);
    }
    return true;
  }

  breakCrate(c, quiet = false) {
    if (!c.alive) return;
    c.alive = false;
    const p = c.mesh.position;           // the model stands on this point
    const cy = p.y + c.size / 2;
    this.world.removeCollider(c.box);
    this.root.remove(c.mesh);
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
      b.mesh.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? this.husk : this.husk[0]; });
      b.mesh.rotation.z = (rnd() < 0.5 ? 1 : -1) * (1.2 + rnd() * 0.3);
      b.mesh.position.y = 0.28;
      b.mesh.position.x += (rnd() - 0.5) * 0.8;
      b.mesh.position.z += (rnd() - 0.5) * 0.8;
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
      const p = c.mesh.position;
      const d = Math.hypot(p.x - x, p.z - z);
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
    const M = this.pickupMats;
    const g = new THREE.Group();
    if (type === 'health') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.28), M.white);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.06), M.red);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.2), M.red);
      c1.position.y = c2.position.y = 0.081;
      g.add(box, c1, c2);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.24), M.olive);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.205, 0.245), M.yellow);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.03, 0.25), M.olive);
      lid.position.y = 0.1;
      g.add(box, stripe, lid);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    const holder = new THREE.Group();
    holder.add(g);
    const beam = new THREE.Mesh(this.beamGeo, type === 'health' ? M.beamHealth : M.beamAmmo);
    beam.renderOrder = 9;
    beam.position.y = -0.4;
    holder.add(beam);
    this.game.gr.addNoAO(beam);
    holder.position.set(x, y + 0.45, z);
    this.root.add(holder);
    const p = { type, holder, inner: g, beam, x, z, y, born: this.time, life, respawn, t0: rnd() * 6, appear: animate ? 0 : 1 };
    if (animate) holder.scale.setScalar(0.01);
    this.pickups.push(p);
    return p;
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

  /** Take a pickup out of the scene and free what it owns (the shared light column geometry stays). */
  _dropPickup(p) {
    this.root.remove(p.holder);
    this.game.gr.removeNoAO(p.beam);
    p.holder.traverse((o) => { if (o.isMesh && o.geometry !== this.beamGeo) o.geometry.dispose(); });
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
      const t = this.time + p.t0;
      p.holder.position.y = p.y + 0.45 + Math.sin(t * 2.2) * 0.06;
      p.inner.rotation.y = t * 1.4;
      // the light column is a far away marker: it narrows to a thread when you get close
      const cdx = cam.position.x - p.x, cdz = cam.position.z - p.z;
      const near = Math.min(1, Math.max(0.12, (Math.hypot(cdx, cdz) - 1.5) / 7));
      p.beam.scale.set(near, 1, near);
      if (p.appear < 1) {
        p.appear = Math.min(1, p.appear + dt * 1.8);
        const e = 1 - (1 - p.appear) ** 3;
        p.holder.scale.setScalar(Math.max(0.01, e * (1 + 0.25 * Math.sin(p.appear * Math.PI))));
      }
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
    // removeCollider is safe to call twice, and a barrel waiting for its chain explosion is already not alive
    // Geometry is freed too: primitive crates and barrels build their own. A shared glTF geometry
    // is simply uploaded again the next time it is drawn.
    const free = (mesh) => mesh.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    for (const c of this.crates) { this.world.removeCollider(c.box); this.root.remove(c.mesh); free(c.mesh); }
    for (const b of this.barrels) { this.world.removeCollider(b.box); this.root.remove(b.mesh); free(b.mesh); }
    for (const p of this.pickups) this._dropPickup(p);
    this.crates.length = 0; this.barrels.length = 0; this.pickups.length = 0; this.timers.length = 0;
  }
}

/** Props: crates, explosive barrels and pickups. Returns {pickups, barrels, update(dt), damageBarrel(b, amount)}. */
export function createProps(game) { return new Props(game); }
