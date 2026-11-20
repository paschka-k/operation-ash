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
// A rider held up by a blocker for RIDE.dismountSecs steps off and fights on foot; his vehicle stays
// standing where it stopped, whole, without a crash. Wrecks and vehicles left standing have no collider
// and stop nobody on foot, but they are in the riders' way and no rider enters on top of one: once they
// stand still the riders swerve round them where the street has room (_room casts the rays, core/ride
// stepRide steers), and stop behind them where it has none. They go away after wreckSecs or at the
// wave's end.

import { createRide, stepRide, rideRam, rideAim, crashRide, leaveRide } from '../core/ride.js';
import { levelRoutes } from '../core/routes.js';
import { VEHICLES, RIDE } from '../core/rules.js';
import { applyDamage } from '../core/combat.js';
import { lineOfSight, standingHeight, raycast } from '../core/collision.js';
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
    this.mounts = [];            // {enemy, core, kind, V, ride, target, view, handle, voice, sees}
    this.wrecks = [];            // {ride, handle, kind, V, t}: wrecks, and vehicles their riders left standing
    this._blockers = [];
    this._pool = [];
    this._probe = {};
  }

  /** The loops of the map being played (wave 15: every map has its own; read fresh, never kept). */
  get routes() { const w = this.game.world; return (w && w.routes) || levelRoutes(); }

  /** Riders on their vehicles right now. */
  get mounted() { return this.mounts.length; }

  /** The living vehicles, targets of kind 'vehicle' for core/combat. */
  targets() { return this.mounts.map((m) => m.target); }

  /** Where the vehicles and the wrecks on the loops are, for pickRiderSpawn. */
  occupied() {
    const at = (r) => ({ route: r.route, s: r.s });
    return this.mounts.map((m) => at(m.ride)).concat(this.wrecks.map((w) => at(w.ride)));
  }

  /** Put a freshly spawned rider on his vehicle at s on `route`. hpMult: the wave's health multiplier. */
  mount(enemy, route, s, hpMult = 1) {
    const c = enemy.core, kind = c.T.vehicle, V = VEHICLES[kind];
    const ride = createRide(route, s, kind, rnd);
    const target = {
      id: 'vehicle-' + c.id, kind: 'vehicle', x: ride.x, y: ride.y, z: ride.z, yaw: ride.heading,
      length: V.length, width: V.width, height: V.height, alive: true, hp: vehicleHp(kind, hpMult), armor: V.armor, view: null,
    };
    const m = { enemy, core: c, kind, V, ride, target, view: null, handle: this.vehicles.add(kind), voice: null, sees: false, room: null };
    m.view = target.view = new VehicleView(this, m);
    m.room = (off, s0, s1, hw) => this._room(ride.route, off, s0, s1, hw);
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
    setRidePose(M, m.V.stance, 0, c.aimTwist || 0);
    // the yaw first, then the lean about the rider's own length; he tips with the vehicle about the
    // ground under it (the vehicle's own pivot), so his body frame stays on the deck or the seat
    const sl = Math.sin(ride.lean) * m.V.seatY;
    M.root.rotation.order = 'YXZ';
    M.root.position.set(ride.x + sl * Math.cos(ride.heading), ride.y + Math.cos(ride.lean) * m.V.seatY, ride.z - sl * Math.sin(ride.heading));
    M.root.rotation.set(0, c.yaw, -ride.lean);
  }

  /**
   * What stands in the lane of `m`: the player (flagged: a motorbike goes for him instead of braking,
   * core/ride stepRide), the other vehicles on its loop, wrecks and vehicles left standing (flagged still
   * once they stand: the riders swerve round them where there is room), foot soldiers near it.
   * A wreck's footprint is the box it lies in: along the loop half its length, across it half its width,
   * or, fallen on its side, its height reaching out to the side it fell to.
   */
  _blockersFor(m) {
    const B = this._blockers, pool = this._pool, ride = m.ride, g = this.game;
    let n = 0;
    const add = (x, z, r, l = r, player = false, still = false) => {
      const b = pool[n] || (pool[n] = { x: 0, z: 0, r: 0, l: 0, player: false, still: false });
      b.x = x; b.z = z; b.r = r; b.l = l; b.player = player; b.still = still;
      B[n++] = b;
    };
    const near = (x, z) => (x - ride.x) * (x - ride.x) + (z - ride.z) * (z - ride.z) < NEAR * NEAR;
    const p = g.player;
    if (p.alive && p.pos.y < ride.y + 1.2) add(p.pos.x, p.pos.z, p.pos.radius, p.pos.radius, true);
    for (const o of this.mounts) if (o !== m && o.ride.route === ride.route) add(o.ride.x, o.ride.z, o.V.length / 2);
    for (const w of this.wrecks) {
      const wr = w.ride, V = w.V;
      if (!near(wr.x, wr.z)) continue;
      // lean > 0 tips its top to the right of its heading, (cos h, -sin h)
      const tip = Math.sin(wr.lean) * V.height / 2;
      const x = wr.x + Math.cos(wr.heading) * tip, z = wr.z - Math.sin(wr.heading) * tip;
      const across = Math.abs(Math.cos(wr.lean)) * V.width / 2 + Math.abs(tip);
      add(x, z, across, V.length / 2, false, wr.speed === 0);
    }
    for (const o of this.enemies.cores) {
      if (!o.alive || o.mounted) continue;
      if (near(o.x, o.z)) add(o.x, o.z, o.radius);
    }
    B.length = n;
    return B;
  }

  /**
   * Is there room for a vehicle hw metres either side of its middle to drive `off` metres right of its
   * loop (left below zero) from s0 to s1? A ray at the height of the vehicles' bodies goes out every
   * metre from the loop, across the whole swerve and the vehicle's far side, plus a margin; nothing solid
   * may be in its way (walls, cars, concrete blocks, crates and barrels). The loops themselves are clear.
   */
  _room(route, off, s0, s1, hw) {
    const cols = this.game.world.colliders, p = this._probe, side = off < 0 ? -1 : 1;
    const reach = Math.abs(off) + hw + RIDE.passMargin;
    const ARENA = (this.game.world.half ?? 45) - 0.7;   // as squad.js clamps the bots
    for (let s = s0; ; s += 1) {
      const d = Math.min(s, s1);
      route.sample(d, p);
      const dx = Math.cos(p.heading) * side, dz = -Math.sin(p.heading) * side;
      if (raycast(cols, p.x, 0.45, p.z, dx, 0, dz, reach, { noGround: true })) return false;
      const ex = p.x + dx * reach, ez = p.z + dz * reach;
      if (Math.abs(ex) > ARENA || Math.abs(ez) > ARENA) return false;
      if (d >= s1) return true;
    }
  }

  /** One frame of a rider on his vehicle: drive, run the player down, shoot what he sees. */
  ride(enemy, dt, world, now) {
    const c = enemy.core, m = c.mount, g = this.game, p = g.player;
    if (!m) { c.mounted = false; return; }
    const ride = m.ride;
    const res = stepRide(ride, dt, this._blockersFor(m), m.room);
    c.flinch = Math.max(0, c.flinch - dt);

    // the gun: he looks for the player a few times a second, rideAim decides the bursts and turns his
    // upper body towards the player (c.aimTwist), which _sit poses before the muzzle is read
    c.senseT -= dt;
    if (c.senseT <= 0) {
      c.senseT = 0.1 + rnd() * 0.06;
      const eye = world.player.eye, dx = p.pos.x - ride.x, dz = p.pos.z - ride.z;
      m.sees = p.alive && dx * dx + dz * dz < c.T.sight * c.T.sight &&
        lineOfSight(g.world.colliders, ride.x, ride.y + m.V.seatY + 1.55 * c.scale, ride.z, eye.x, eye.y - 0.2, eye.z);
    }
    const aim = rideAim(ride, c, { x: p.pos.x, z: p.pos.z, visible: m.sees, alive: p.alive }, now, rnd);

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

  /**
   * Held up too long: the rider steps off and fights on foot. His vehicle is not shot out: it stays
   * standing where it stopped, whole, without a crash, a sound or sparks, and goes away like a wreck.
   */
  dismount(enemy) {
    const m = enemy.core.mount;
    if (!m) return;
    const ride = m.ride, side = m.V.width / 2 + 0.45;
    // he steps off to the right of his vehicle
    const x = ride.x + Math.cos(ride.heading) * side, z = ride.z - Math.sin(ride.heading) * side;
    leaveRide(ride);
    m.target.alive = false;
    this.vehicles.place(m.handle, ride.x, ride.y, ride.z, ride.heading, ride.lean, 0);
    this._drop(m);
    this._onFoot(enemy, ride, x, z, false);
  }

  /** The rider was killed on the move: an ordinary death (Enemy.die counts it), the vehicle crashes on. */
  riderKilled(enemy, dir) {
    const c = enemy.core, m = c.mount;
    if (!m) { c.mounted = false; return; }
    this._wreck(m, dir);
    c.mounted = false;
    c.mount = null;
    c.aimTwist = 0;
    c.y = standingHeight(c.x, c.z, c.radius, this.game.world.colliders);
    const M = enemy.model;
    M.root.rotation.order = 'XYZ';
    M.root.rotation.set(0, c.yaw, 0);
  }

  /** The vehicle of `m` becomes a wreck: it slides on, falls over and lies there; the voice stops. */
  _wreck(m, dir) {
    const g = this.game, ride = m.ride;
    crashRide(ride, this._fallDir(m, dir));
    m.target.alive = false;
    this.vehicles.wreck(m.handle);
    g.audio.vehicleCrash({ x: ride.x, y: ride.y + 0.3, z: ride.z });
    for (let i = 0; i < 4; i++) {
      g.fx.impact('metal', ride.x + (rnd() - 0.5) * 0.6, ride.y + 0.25 + rnd() * 0.3, ride.z + (rnd() - 0.5) * 0.6, 0, 1, 0, false);
    }
    this._drop(m);
  }

  /** `m` has lost its rider: its voice stops, it is no target, it stays in the street with the wrecks. */
  _drop(m) {
    if (m.voice) { m.voice.stop(); m.voice = null; }
    const k = this.mounts.indexOf(m);
    if (k >= 0) this.mounts.splice(k, 1);
    this.wrecks.push({ ride: m.ride, handle: m.handle, kind: m.kind, V: m.V, t: 0 });
    this.enemies.touchTargets();
  }

  /**
   * Which way a crashing vehicle falls, as the dir of crashRide: the way crashRide would pick (the hit's
   * direction, or the inside of the turn) unless a wall stands on that side of the stretch it slides
   * along while the other side is clear; then the other way, so a fallen motorbike does not stick into a
   * wall the loop clears by less than a metre.
   */
  _fallDir(m, dir) {
    const ride = m.ride, rx = Math.cos(ride.heading), rz = -Math.sin(ride.heading);
    const own = dir ? { x: dir.x, z: dir.z } : null;
    const side = (own ? own.x * rx + own.z * rz : ride.lean) < 0 ? -1 : 1;
    const reach = RIDE.crashDrift + m.V.height, slide = (ride.speed * ride.speed) / (2 * RIDE.crashFriction);
    if (this._clearSide(ride, side, reach, slide) || !this._clearSide(ride, -side, reach, slide)) return own;
    return { x: -side * rx, z: -side * rz };
  }

  /** Nothing solid within `reach` metres on `side` of the loop (1: along (cos h, -sin h)) for `slide` metres on. */
  _clearSide(ride, side, reach, slide) {
    const cols = this.game.world.colliders, p = this._probe;
    for (let d = 0; d < slide + 1; d += 1) {
      ride.route.sample(ride.s + d, p);
      if (raycast(cols, p.x, 0.45, p.z, Math.cos(p.heading) * side, 0, -Math.sin(p.heading) * side, reach, { noGround: true })) return false;
    }
    return true;
  }

  /** The rider stands at x, z and from now on fights like any soldier (core/ai), hunting the player. */
  _onFoot(enemy, ride, x, z, thrown) {
    const c = enemy.core, g = this.game, p = g.player;
    c.mounted = false;
    c.mount = null;
    c.aimTwist = 0;
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
    // thrown off a crashing vehicle, he needs a moment
    c.reaction = thrown ? RIDE.dismountReact.thrown : RIDE.dismountReact.held;
    c.flinch = thrown ? RIDE.thrownFlinch : 0;
    c.lastSeen = { x: p.pos.x, z: p.pos.z };
    const M = enemy.model;
    M.root.rotation.order = 'XYZ';
    M.root.rotation.set(0, c.yaw, 0);
    M.root.position.set(c.x, c.y, c.z);
  }

  /** Wrecks slide to a stop and fall on their side, vehicles left standing stand; after wreckSecs both are gone. */
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
