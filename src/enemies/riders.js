// Riders in the scene (wave 14): soldiers on scooters, skateboards and motorbikes that drive the loops of
// the streets, shoot from the move, run the player down, get shot off their vehicles and fight on foot.
//
// A rider is an ordinary bot of squad.js (one core, one skinned soldier) with a mount: the ride on its loop
// (core/ride), the vehicle as a target of its own for bullets, blasts and flames (core/combat, kind
// 'vehicle'), its copy in the vehicles' pools (vehicles.js) and its engine voice (audio.engine).
//
//   riders.mount(enemy, route, s, hpMult)    put a freshly spawned rider on his vehicle
//   riders.ride(enemy, dt, world, now)       his frame while he rides (Enemy.update calls it)
//   riders.riderKilled(enemy, dir)           killed on the move: one ordinary death, the vehicle crashes
//   riders.update(dt)                        wrecks slide, fall and go away after wreckSecs
//   riders.targets()                         the vehicles, for enemies.targets
//   riders.clearWrecks(), silence(), clear()
//
// A vehicle shot out (hp <= 0) crashes and its rider gets up on the spot and fights on foot with the
// health he has left: the same core, so no kill is counted; the vehicle pays its own score (director).
// A rider held up by a blocker for RIDE.dismountSecs leaves his vehicle lying and fights on foot.
// Wrecks have no collider and are not in anyone's way; they go away after wreckSecs or at the wave's end.

import { createRide, stepRide, rideRam, rideAim, crashRide } from '../core/ride.js';
import { levelRoutes } from '../core/routes.js';
import { VEHICLES } from '../core/rules.js';
import { applyDamage } from '../core/combat.js';
import { lineOfSight, standingHeight } from '../core/collision.js';
import { vehicleHp } from '../core/riderlogic.js';
import { createVehicles } from './vehicles.js';
import { setRidePose } from './soldier.js';

const rnd = Math.random;
const NEAR = 30;                 // metres: foot soldiers further than this from a vehicle cannot be in its way

/** The vehicle as the rest of the game sees a bot: what the enemy health bar and the hits read. */
class VehicleView {
  constructor(riders, mount) {
    this.riders = riders;
    this.mount = mount;
    this.T = { key: 'v_' + mount.kind };
    this.P = { hp: mount.target.hp };
    this.crouchK = 0;
  }
  get alive() { return this.mount.target.alive; }
  get pos() { return this.mount.target; }
  get hp() { return this.mount.target.hp; }
  get id() { return this.mount.target.id; }
  get rider() { return this.mount.enemy; }
  get lastFired() { return this.mount.enemy.lastFired; }
  /** Same signature as Enemy.takeDamage. The zone is always the vehicle's own. Never a kill. */
  takeDamage(amount, zone, dir, source = 'player', point = null) {
    return this.riders.hitVehicle(this.mount, amount, dir, source, point);
  }
}

export class Riders {
  constructor(game, enemies) {
    this.game = game;
    this.enemies = enemies;
    this.vehicles = createVehicles(game);
    this.routes = levelRoutes();
    this.mounts = [];            // {enemy, core, kind, V, ride, target, view, handle, voice, sees}
    this.wrecks = [];            // {ride, handle, kind, V, t}
    this._blockers = [];
    this._pool = [];
  }

  /** Riders on their vehicles right now. */
  get mounted() { return this.mounts.length; }

  /** The living vehicles, targets of kind 'vehicle' for core/combat. */
  targets() { return this.mounts.map((m) => m.target); }

  /** Where the vehicles on the loops are, for pickRiderSpawn. */
  occupied() { return this.mounts.map((m) => ({ route: m.ride.route, s: m.ride.s })); }

  /** Put a freshly spawned rider on his vehicle at s on `route`. hpMult: the wave's health multiplier. */
  mount(enemy, route, s, hpMult = 1) {
    const c = enemy.core, kind = c.T.vehicle, V = VEHICLES[kind];
    const ride = createRide(route, s, kind, rnd);
    const target = {
      id: 'vehicle-' + c.id, kind: 'vehicle', x: ride.x, y: ride.y, z: ride.z, yaw: ride.heading,
      length: V.length, width: V.width, height: V.height, alive: true, hp: vehicleHp(kind, hpMult), armor: V.armor, view: null,
    };
    const m = { enemy, core: c, kind, V, ride, target, view: null, handle: this.vehicles.add(kind), voice: null, sees: false };
    m.view = target.view = new VehicleView(this, m);
    c.mounted = true;
    c.ride = ride;
    c.vehicle = target;
    c.mount = m;
    c.state = 'ride';
    this._sit(m);
    this.mounts.push(m);
    this.enemies.touchTargets();
    return m;
  }

  /** Rider and vehicle where the ride is: core, hit box, the vehicle's copy, the rider's pose. */
  _sit(m) {
    const c = m.core, ride = m.ride, t = m.target;
    c.x = ride.x; c.z = ride.z; c.y = ride.y + m.V.seatY; c.yaw = ride.heading;
    c.vx = Math.sin(ride.heading) * ride.speed; c.vz = Math.cos(ride.heading) * ride.speed; c.vy = 0;
    c.speedNow = ride.speed;
    t.x = ride.x; t.y = ride.y; t.z = ride.z; t.yaw = ride.heading;
    this.vehicles.place(m.handle, ride.x, ride.y, ride.z, ride.heading, ride.lean, 0);
    const M = m.enemy.model;
    setRidePose(M, m.V.stance);
    M.root.rotation.order = 'YXZ';            // the yaw first, then the lean about the rider's own length
    M.root.position.set(c.x, c.y, c.z);
    M.root.rotation.set(0, c.yaw, -ride.lean);
  }

  /** What stands in the lane of `m`: the player, the other vehicles on its loop, foot soldiers near it. */
  _blockersFor(m) {
    const B = this._blockers, pool = this._pool, ride = m.ride, g = this.game;
    let n = 0;
    const add = (x, z, r) => { const b = pool[n] || (pool[n] = { x: 0, z: 0, r: 0 }); b.x = x; b.z = z; b.r = r; B[n++] = b; };
    const p = g.player;
    if (p.alive && p.pos.y < ride.y + 1.2) add(p.pos.x, p.pos.z, p.pos.radius);
    for (const o of this.mounts) if (o !== m && o.ride.route === ride.route) add(o.ride.x, o.ride.z, o.V.length / 2);
    for (const o of this.enemies.cores) {
      if (!o.alive || o.mounted) continue;
      const dx = o.x - ride.x, dz = o.z - ride.z;
      if (dx * dx + dz * dz < NEAR * NEAR) add(o.x, o.z, o.radius);
    }
    B.length = n;
    return B;
  }

  /** One frame of a rider on his vehicle: drive, run the player down, shoot what he sees. */
  ride(enemy, dt, world, now) {
    const c = enemy.core, m = c.mount, g = this.game, p = g.player;
    if (!m) { c.mounted = false; return; }
    const ride = m.ride;
    const res = stepRide(ride, dt, this._blockersFor(m));
    c.flinch = Math.max(0, c.flinch - dt);
    this._sit(m);
    const since = (now - c.lastFiredAt) / 1000;
    enemy.model.gun.position.copy(enemy.model.gunRest).addScaledVector(enemy.model.gunBack, since < 0.08 ? 0.03 : 0);

    // the engine: one looping voice per vehicle (the audio keeps only the nearest few)
    if (!m.voice && g.audio.ready && g.state === 'playing') m.voice = g.audio.engine(m.kind);
    if (m.voice) m.voice.update({ x: ride.x, y: ride.y + 0.5, z: ride.z }, ride.speed);

    // a motorbike at speed runs the player down
    if (p.alive && Math.abs(p.pos.y - ride.y) < 1.2) {
      const hit = rideRam(ride, { x: p.pos.x, z: p.pos.z, radius: p.pos.radius, alive: p.alive }, now);
      if (hit) {
        p.knockBack(hit.pushX, hit.pushZ);
        p.damage(hit.damage, ride.x, ride.z, 'vehicle');
        g.audio.impact('metal', { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
        g.director.onRam(enemy, hit.damage);
      }
    }

    // the gun: he looks for the player a few times a second, rideAim decides the bursts
    c.senseT -= dt;
    if (c.senseT <= 0) {
      c.senseT = 0.1 + rnd() * 0.06;
      const eye = world.player.eye, dx = p.pos.x - c.x, dz = p.pos.z - c.z;
      m.sees = p.alive && dx * dx + dz * dz < c.T.sight * c.T.sight &&
        lineOfSight(g.world.colliders, c.x, c.y + 1.55 * c.scale, c.z, eye.x, eye.y - 0.2, eye.z);
    }
    const aim = rideAim(ride, c, { x: p.pos.x, z: p.pos.z, visible: m.sees, alive: p.alive }, now, rnd);
    if (aim.cue) g.audio.telegraph(enemy.muzzlePos());
    if (aim.laser > 0) enemy.aimLaser(aim.laser);
    if (aim.fire) enemy.shoot(aim.fire.dist, now, aim.fire.acc);

    if (res.dismount && c.alive) this.dismount(enemy);
  }

  /** A bullet, a blast or a flame hits the vehicle. Returns {killed: false}: a vehicle is never a kill. */
  hitVehicle(m, amount, dir, source, point) {
    const t = m.target, g = this.game;
    if (!t.alive) return { killed: false, headshot: false };
    applyDamage(t, amount, 'vehicle');
    if (source !== 'fire') {
      const pt = point || { x: t.x, y: t.y + t.height * 0.5, z: t.z };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      g.fx.impact('metal', pt.x, pt.y, pt.z, -dir.x / len, -dir.y / len, -dir.z / len, false);
      g.audio.impact('metal', pt);
    }
    if (t.hp <= 0) this.shotOut(m, dir);
    return { killed: false, headshot: false };
  }

  /** The vehicle is shot out: it crashes, it pays its score, and its rider gets up and fights on foot. */
  shotOut(m, dir) {
    const enemy = m.enemy, c = m.core, ride = m.ride;
    const x = ride.x, z = ride.z;
    this._wreck(m, dir);
    this.game.director.onVehicleDestroyed(enemy, m.kind);
    if (c.alive) this._onFoot(enemy, ride, x, z, true);
    else { c.mounted = false; c.mount = null; }
  }

  /** Held up too long: the rider leaves his vehicle lying where it stopped and fights on foot. */
  dismount(enemy) {
    const m = enemy.core.mount;
    if (!m) return;
    const ride = m.ride, side = m.V.width / 2 + 0.45;
    // he steps off to the right of his vehicle
    const x = ride.x + Math.cos(ride.heading) * side, z = ride.z - Math.sin(ride.heading) * side;
    this._wreck(m, null);
    this._onFoot(enemy, ride, x, z, false);
  }

  /** The rider was killed on the move: an ordinary death (Enemy.die counts it), the vehicle crashes on. */
  riderKilled(enemy, dir) {
    const c = enemy.core, m = c.mount;
    if (!m) { c.mounted = false; return; }
    this._wreck(m, dir);
    c.mounted = false;
    c.mount = null;
    c.y = standingHeight(c.x, c.z, c.radius, this.game.world.colliders);
    const M = enemy.model;
    M.root.rotation.order = 'XYZ';
    M.root.rotation.set(0, c.yaw, 0);
  }

  /** The vehicle of `m` becomes a wreck: it slides on, falls over and lies there; the voice stops. */
  _wreck(m, dir) {
    const g = this.game, ride = m.ride;
    crashRide(ride, dir ? { x: dir.x, z: dir.z } : null);
    m.target.alive = false;
    this.vehicles.wreck(m.handle);
    if (m.voice) { m.voice.stop(); m.voice = null; }
    g.audio.vehicleCrash({ x: ride.x, y: ride.y + 0.3, z: ride.z });
    for (let i = 0; i < 4; i++) {
      g.fx.impact('metal', ride.x + (rnd() - 0.5) * 0.6, ride.y + 0.25 + rnd() * 0.3, ride.z + (rnd() - 0.5) * 0.6, 0, 1, 0, false);
    }
    const k = this.mounts.indexOf(m);
    if (k >= 0) this.mounts.splice(k, 1);
    this.wrecks.push({ ride, handle: m.handle, kind: m.kind, V: m.V, t: 0 });
    this.enemies.touchTargets();
  }

  /** The rider stands at x, z and from now on fights like any soldier (core/ai), hunting the player. */
  _onFoot(enemy, ride, x, z, thrown) {
    const c = enemy.core, g = this.game, p = g.player;
    c.mounted = false;
    c.mount = null;
    c.x = x; c.z = z;
    c.y = standingHeight(x, z, c.radius, g.world.colliders);
    c.vx = c.vy = c.vz = 0;
    c.onGround = true;
    c.speedNow = 0;
    c.state = 'combat';
    c.phase = 'seek';
    c.cover = null;
    c.path = null;
    c.pathT = 0;
    c.teleT = null;
    c.unseenT = 0;
    c.stuckT = 0;
    c.lastX = x; c.lastZ = z;
    c.reaction = thrown ? 0.7 : 0.3;      // thrown off a crashing vehicle, he needs a moment
    c.flinch = thrown ? 0.5 : 0;
    c.lastSeen = { x: p.pos.x, z: p.pos.z };
    const M = enemy.model;
    M.root.rotation.order = 'XYZ';
    M.root.rotation.set(0, c.yaw, 0);
    M.root.position.set(c.x, c.y, c.z);
  }

  /** Wrecks slide to a stop and fall on their side; after wreckSecs they are gone. */
  update(dt) {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      stepRide(w.ride, dt);
      this.vehicles.place(w.handle, w.ride.x, w.ride.y, w.ride.z, w.ride.heading, w.ride.lean, 0);
      if (w.t >= w.V.wreckSecs) {
        this.vehicles.remove(w.handle);
        this.wrecks.splice(i, 1);
      }
    }
  }

  /** The wave is over: no wreck stays in the streets. */
  clearWrecks() {
    for (const w of this.wrecks) this.vehicles.remove(w.handle);
    this.wrecks.length = 0;
  }

  /** Every engine voice stops (pause, shop, victory). They start again on the next frame of riding. */
  silence() {
    for (const m of this.mounts) if (m.voice) { m.voice.stop(); m.voice = null; }
  }

  /** Nothing of the riders is left: vehicles, wrecks, voices (new game, revival, the menu). */
  clear() {
    this.silence();
    this.vehicles.clear();
    this.mounts.length = 0;
    this.wrecks.length = 0;
  }
}

/** The riders of a squad. Returns {mount, ride, riderKilled, update, targets, clearWrecks, silence, clear}. */
export function createRiders(game, enemies) { return new Riders(game, enemies); }
