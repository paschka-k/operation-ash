// Hand grenades in the world: thrown by the player, flying by the rules of core/grenade, drawn as
// one pool of copies, blowing up through the same path as a barrel (props.explode).
//
//   const grenades = createGrenades(game);   // after the level, the props and the effects exist
//   grenades.throwFromPlayer();              // shooting calls it when a grenade leaves the hand
//   grenades.launchAt(from, target, {owner: 'enemy'});   // the commander lobs one at a spot (wave 14)
//   grenades.update(dt);                     // every simulated frame
//   grenades.clear();                        // new game, back to the menu
//
// An enemy's grenade flies and blows up like the player's, but its blast reaches only the player, the
// crates and the barrels (and what those barrels set off): no bot, no vehicle, no kill for anyone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InstancePool, placement } from '../world/pool.js';
import { launchGrenade, launchGrenadeAt, stepGrenade, grenadeDue } from '../core/grenade.js';
import { GRENADE } from '../core/rules.js';

const rnd = Math.random;

/** A fragmentation grenade: ribbed olive body, fuse head, spoon and ring, painted per vertex. */
function grenadeGeometry() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  };
  const body = new THREE.SphereGeometry(0.034, 14, 10);
  body.scale(1, 1.22, 1);
  parts.push(paint(body, 0x4d5536));
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.TorusGeometry(0.03 - Math.abs(i - 1) * 0.006, 0.0035, 5, 18).rotateX(Math.PI / 2).translate(0, (i - 1) * 0.018, 0);
    parts.push(paint(rib, 0x3a4129));
  }
  parts.push(paint(new THREE.CylinderGeometry(0.011, 0.013, 0.022, 10).translate(0, 0.047, 0), 0x6b6f73));
  parts.push(paint(new THREE.BoxGeometry(0.008, 0.06, 0.004).translate(0.017, 0.03, 0).rotateZ(-0.12), 0x7a7d80));
  parts.push(paint(new THREE.TorusGeometry(0.009, 0.0016, 5, 12).translate(-0.016, 0.054, 0), 0x9a9da0));
  return mergeGeometries(parts, false);
}

export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.25 });
    game.gr.prepareMaterial(material);
    // small and quick: a ball stands in for it in the shadow maps, and it stays out of the occlusion pass
    this.pool = new InstancePool({
      geometry: grenadeGeometry(), material, proxy: new THREE.SphereGeometry(0.036, 8, 6), gr: game.gr, capacity: 12, occlude: false,
    });
    this.pool.group.name = 'grenades';
    game.gr.scene.add(this.pool.group);
  }

  /** Throw a grenade from the player's eye along the view. Returns the grenade. */
  throwFromPlayer() {
    const g = this.game, cam = g.gr.camera, p = g.player.pos;
    cam.updateMatrixWorld();
    const d = this._dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const r = this._right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    // from the right hand: a little to the right of and below the eye (never further than the body reaches)
    const eye = { x: cam.position.x + r.x * GRENADE.handRight, y: cam.position.y - GRENADE.handDown, z: cam.position.z + r.z * GRENADE.handRight };
    return this.launch(eye, { x: d.x, y: d.y, z: d.z }, { x: p.vx, y: p.vy, z: p.vz });
  }

  /** Add a grenade at `eye` thrown along the unit vector `dir` by someone moving at `vel`. */
  launch(eye, dir, vel = { x: 0, y: 0, z: 0 }) {
    const now = this.game.time * 1000;
    const n = launchGrenade({ eye, dir, vel, now, colliders: this.game.world.colliders });
    n.owner = 'player';
    return this._add(n);
  }

  /**
   * A grenade lobbed from `from` ({x, y, z}, the thrower's hand) at a spot on the ground `target` ({x, z}):
   * core/grenade works out the throw. owner 'enemy' (a bot's grenade) blows up without hurting any bot.
   * Returns the grenade.
   */
  launchAt(from, target, { owner = 'enemy' } = {}) {
    const n = launchGrenadeAt({ from, target, now: this.game.time * 1000 });
    n.owner = owner;
    return this._add(n);
  }

  _add(n) {
    n.rx = rnd() * 6; n.ry = rnd() * 6; n.rz = rnd() * 6;
    n.spin = 8 + rnd() * 6;
    n.handle = this.pool.add(placement(n.x, n.y, n.z, n.rx, n.ry, n.rz));
    this.list.push(n);
    return n;
  }

  update(dt) {
    const g = this.game, now = g.time * 1000, colliders = g.world.colliders;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      for (const ev of stepGrenade(n, dt, colliders)) {
        if (ev.type === 'bounce' && ev.speed > 1.2) {
          g.audio.grenadeBounce(ev, ev.speed);
          n.spin *= 0.6;
        }
      }
      // tumbles in the air; on the ground it lies on its side and skids round
      const down = n.rest || n.grounded > 0;
      if (!down) { n.rx += n.spin * dt; n.rz += n.spin * 0.6 * dt; }
      else if (!n.rest) n.ry += Math.hypot(n.vx, n.vz) * 3 * dt;
      const sink = down ? GRENADE.radius - 0.034 : 0;       // its body is thinner than the ball it collides as
      this.pool.set(n.handle, placement(n.x, n.y - sink, n.z, down ? Math.PI / 2 : n.rx, n.ry, down ? 0 : n.rz));
      if (grenadeDue(n, now)) {
        this.pool.remove(n.handle);
        this.list.splice(i, 1);
        this.blast(n);
      }
    }
  }

  /**
   * The blast: the barrel's explosion, with the grenade's radius and damage, centred on the grenade
   * (combat.explode lifts its own line of sight). Once the player is dead a grenade still goes off, but
   * hurts nobody: kills after death would be credited to a player who is no longer in the fight.
   */
  blast(n) {
    const g = this.game, x = n.x, y = n.y, z = n.z;
    g.fx.explosion(x, Math.max(0, n.y - GRENADE.radius), z, 0.85);
    g.audio.explosion(x, y, z);
    if (!g.player.alive) return;
    if (n.owner === 'enemy') this.harmless(() => g.props.explode(x, y, z, GRENADE.blastRadius, GRENADE.blastDamage, 'enemyGrenade'));
    else g.props.explode(x, y, z, GRENADE.blastRadius, GRENADE.blastDamage, 'grenade');
  }

  /**
   * Run fn (an enemy's blast) with every bot and vehicle out of its reach (enemies.shielded). The barrels
   * it sets off go up a moment later from the props' timers; those timers are wrapped the same way, so a
   * chain of barrels lit by an enemy hurts no bot either and credits the player with nothing.
   */
  harmless(fn) {
    const g = this.game, timers = g.props.timers, from = timers.length;
    g.enemies.shielded(fn);
    for (let i = from; i < timers.length; i++) {
      const t = timers[i];
      if (t.spawner || t.harmless) continue;
      const go = t.fn;
      t.fn = () => this.harmless(go);
      t.harmless = true;
    }
  }

  /** Grenades in flight or on the ground, for tests and the HUD. */
  get active() { return this.list.length; }

  clear() {
    this.list.length = 0;
    this.pool.clear();
  }
}

/** Grenades in the world. Returns {throwFromPlayer(), launch(eye, dir, vel), update(dt), clear()}. */
export function createGrenades(game) { return new Grenades(game); }
