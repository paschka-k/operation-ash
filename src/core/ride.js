// core/ride: a rider's vehicle on its loop. Pure: no three.js, time comes in as dt (s) and now (ms).
//
//   const ride = createRide(route, s, 'moto', rng);   // on loop `route` (core/routes buildRoute) at s metres
//   stepRide(ride, dt, blockers, room) -> {dismount}   // drive on; brake for whatever stands in the lane,
//                                                      // swerve round what stands still there,
//                                                      // a motorbike goes for the player instead
//   rideRam(ride, player, now)     -> null | {damage, pushX, pushZ}
//   rideAim(ride, e, view, now, rng) -> {fire: {dist, acc} | null, laser, cue}   // the rider's gun
//   crashRide(ride, dir)                                // shot out or rider killed: it slides and falls
//   leaveRide(ride)                                     // the rider got off: it stands there, whole
//
// Ride = {route, s, kind, speed, x, y, z, heading, lean, curvature, blockedT, ramCdT, impact,
//         alive, wrecked, mounted, phase, lateral, pass, steer}
// lean > 0 tips the vehicle's top along (cos heading, -sin heading), as the view draws it with
// Euler(0, heading, -lean, 'YXZ'); in a turn it leans towards the centre of the arc.
// The vehicle follows its loop, `lateral` metres to the right of it (left when below zero): 0 on the
// loop itself, more while it swerves round something standing in its lane (pass {off, left}: it keeps
// off metres right of the loop for `left` more metres, then comes back), or a wreck's drift. The loops
// are laid out clear of the level's colliders (core/routes), so nothing here looks at the level; whether
// a swerve has room is asked of the game layer (stepRide's room). What can stand in the way is passed in
// as blockers [{x, z, r, l?, player?, still?}]: the player (flagged player), other riders, wrecks and
// vehicles left standing (flagged still), foot soldiers. A scooter or a skate stops for the player; a
// motorbike (a finite ramSpeed) runs him down and rides on (stepRide, rideRam); everybody stops for
// everything else, or swerves round it when it stands still and there is room. The numbers are in
// rules.js (VEHICLES for each kind, RIDE for how all of them drive).

import { VEHICLES, RIDE } from './rules.js';
import { clamp, angleDiff } from './math.js';

const rr = (rng, a, b) => a + (b - a) * rng();
const ri = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
const wrap = (s, L) => ((s % L) + L) % L;
const toward = (a, b, step) => a + clamp(b - a, -step, step);
const _p = {}, _q = {};

/** How hard a vehicle of this kind may take a turn: its own grip, or the common one of RIDE. */
const gripOf = (V) => V.grip ?? RIDE.grip;

/**
 * A vehicle of `kind` (a key of VEHICLES) on `route` at s, at its cruising speed, or slower when a turn
 * just ahead does not allow it.
 */
export function createRide(route, s, kind, rng = Math.random) {
  const ride = {
    route, s: wrap(s, route.length), kind, speed: VEHICLES[kind].speed,
    x: 0, y: 0, z: 0, heading: 0, lean: 0, curvature: 0,
    blockedT: 0, ramCdT: -Infinity, impact: 0,
    alive: true, wrecked: false, mounted: true,
    phase: rng() * Math.PI * 2,      // for the view: wobble, engine pitch, so two riders never move in step
    crashT: 0, fallSide: 1, lateral: 0, lateral0: 0, pass: null, passT: 0, steer: 0,
  };
  ride.speed = Math.min(ride.speed, curveLimit(ride, VEHICLES[kind], ride.s));
  place(ride);
  return ride;
}

/**
 * Put x, z, heading and curvature where s is, `lateral` metres to the right of the loop; the heading
 * turns by the swerve's slope (steer: metres sideways per metre along).
 */
function place(ride) {
  const p = ride.route.sample(ride.s, _p);
  const right = ride.lateral || 0;
  // right of the heading (sin h, cos h) is (cos h, -sin h)
  ride.x = p.x + Math.cos(p.heading) * right;
  ride.z = p.z - Math.sin(p.heading) * right;
  ride.heading = p.heading + Math.atan(ride.steer || 0);
  ride.curvature = p.curvature;
}

/**
 * Fastest speed at s that still lets the vehicle take every turn within its braking distance. The road
 * is looked at every half metre; a turn found at d may begin up to that much nearer, so the braking
 * distance counted is d - 0.5.
 */
function curveLimit(ride, V, s) {
  const reach = (V.speed * V.speed) / (2 * V.brake) + 1;
  let limit = V.speed;
  for (let d = 0; d <= reach; d += 0.5) {
    const k = Math.abs(ride.route.sample(s + d, _p).curvature);
    if (k < 1e-9) continue;
    const v = Math.sqrt(gripOf(V) / k + 2 * V.brake * Math.max(0, d - 0.5));
    if (v < limit) limit = v;
  }
  return limit;
}

/** Where a blocker is next to the loop: s of the loop's nearest point, off metres right of it. */
function locate(route, b, out) {
  const n = route.nearest(b.x, b.z);
  const p = route.sample(n.s, _q);
  out.s = n.s;
  out.off = (b.x - p.x) * Math.cos(p.heading) - (b.z - p.z) * Math.sin(p.heading);
  return out;
}

/** How far right of the loop the vehicle will be d metres further on: on its swerve, or coming back. */
function lateralAt(ride, d) {
  const k = RIDE.swerve, pass = ride.pass;
  let lat = ride.lateral || 0;
  if (pass) {
    const d1 = Math.min(d, Math.max(0, pass.left));
    lat = toward(lat, pass.off, d1 * k);
    d -= d1;
  }
  return toward(lat, 0, d * k);
}

/**
 * The road in front of the vehicle's nose, in metres along the loop: free, before the nearest blocker
 * that stands in its lane, and prey, before its nose touches the player (both Infinity when there is
 * none). The player counts as prey only for a vehicle that rams (a finite ramSpeed, the motorbikes):
 * every other blocker, and the player for the others, is free road's end. A blocker is in the lane when
 * it is closer than half the vehicle's width + its own r + RIDE.lane to where the vehicle will be when it
 * gets there (lateralAt); l is its half length along the loop (r when not given). Blockers behind it do
 * not count. prey is below zero when the player already stands inside the vehicle's length. block is
 * the blocker that ends the free road (null: none), with blockOff and blockAhead where it is.
 */
const _loc = { s: 0, off: 0 };
function scanRoad(ride, V, blockers, out) {
  const route = ride.route, L = route.length, half = V.length / 2, rams = Number.isFinite(V.ramSpeed);
  out.free = Infinity;
  out.prey = Infinity;
  out.block = null;
  for (const b of blockers) {
    const r = b.r || 0, l = b.l ?? r;
    const loc = locate(route, b, _loc);
    const ahead = wrap(loc.s - ride.s, L);
    if (ahead > L / 2) continue;
    if (Math.abs(loc.off - lateralAt(ride, Math.max(0, ahead - half - l))) > V.width / 2 + r + RIDE.lane) continue;
    if (rams && b.player) { out.prey = Math.min(out.prey, ahead - half - r); continue; }
    const gap = ahead - half - l - RIDE.gap;
    if (gap < out.free) {
      out.free = Math.max(0, gap);
      out.block = b; out.blockOff = loc.off; out.blockAhead = ahead;
    }
  }
  return out;
}

/** How far ahead a vehicle of V starts to look for a way round something standing still in its lane. */
const passReach = (V) => (V.speed * V.speed) / (2 * V.brake) + 1 + RIDE.swerveMax / RIDE.swerve;

/**
 * A way round road.block, the still blocker that ends the free road: off metres right of the loop, on the
 * side that needs the smaller swerve, no further out than RIDE.swerveMax, and only where room(off, s0, s1,
 * halfWidth) says the vehicle fits from here until it is back on its loop behind the blocker. Sets
 * ride.pass and returns true, or returns false when neither side has room.
 */
function planPass(ride, V, road, room) {
  const b = road.block, r = b.r || 0, l = b.l ?? r, half = V.length / 2;
  const clear = V.width / 2 + r + RIDE.lane + RIDE.passMargin;
  const left = road.blockAhead + l + half + RIDE.passMargin;   // until its tail is past the blocker's tail
  const lat = ride.lateral || 0;
  const offs = [road.blockOff + clear, road.blockOff - clear].sort((a, c) => Math.abs(a - lat) - Math.abs(c - lat));
  for (const off of offs) {
    if (Math.abs(off) > RIDE.swerveMax) continue;
    if (!room(off, ride.s, ride.s + left + Math.abs(off) / RIDE.swerve, V.width / 2)) continue;
    ride.pass = { off, left };
    return true;
  }
  return false;
}

/**
 * Can the vehicle still touch its prey at RIDE.bumpSpeed at least: speeding up all the way to him and
 * still able to stop for whatever stands in the lane beyond him? A motorbike that cannot (it stands
 * right behind him) brakes for him like for anyone, and does not drive through him.
 */
function canRam(ride, V, road) {
  const d = Math.max(0, road.prey);
  const v = Math.min(Math.sqrt(ride.speed * ride.speed + 2 * V.accel * d), Math.sqrt(2 * V.brake * Math.max(0, road.free - d)));
  return v >= RIDE.bumpSpeed;
}

const _road = { free: Infinity, prey: Infinity, block: null, blockOff: 0, blockAhead: 0 };

/**
 * Drive for dt seconds: cruise at the vehicle's speed, slower before turns, brake for blockers in the
 * lane and never run into one. The move is cut into substeps of at most RIDE.substep metres. A ride held
 * still by a blocker counts blockedT up; after RIDE.dismountSecs the rider should get off.
 * blockers [{x, z, r, l?, player?, still?}]: the one flagged player is the player. A vehicle that rams (a
 * finite ramSpeed, the motorbikes) does not brake for him: it goes for him, at least at ramSpeed once he
 * is within its braking reach (no faster than its grip allows in a turn), runs him down (rideRam) and
 * rides on; only when it is too close to reach RIDE.bumpSpeed before it touches him does it stop for him
 * as for anyone. A scooter or a skate stops for him.
 * A blocker flagged still (a wreck, a vehicle left standing) is passed: room(off, s0, s1, halfWidth) ->
 * bool, from the game layer, says whether the vehicle fits off metres right of its loop from s0 to s1;
 * the vehicle swerves to the side with room at RIDE.swerve metres sideways per metre and comes back to
 * its loop behind it (stopped right behind it, it edges sideways at RIDE.shuffle m/s first). Without
 * room, or for any other blocker, it stops. A wreck (crashRide) slides on instead. Returns {dismount}.
 */
export function stepRide(ride, dt, blockers = [], room = null) {
  const V = VEHICLES[ride.kind], L = ride.route.length;
  ride.impact = 0;
  if (ride.wrecked) { slide(ride, V, dt); return { dismount: false }; }
  if (!ride.mounted) return { dismount: false };    // left standing by its rider (leaveRide)
  let road = scanRoad(ride, V, blockers, _road);
  ride.passT = Math.max(0, (ride.passT || 0) - dt);
  if (room && road.block && road.block.still && road.free < passReach(V) && ride.passT <= 0) {
    if (planPass(ride, V, road, room)) road = scanRoad(ride, V, blockers, _road);
    else ride.passT = RIDE.passRetry;
  }
  const charge = road.prey < Infinity && canRam(ride, V, road);
  const free = charge ? road.free : Math.min(road.free, Math.max(0, road.prey - RIDE.gap));
  const reach = (V.speed * V.speed) / (2 * V.brake) + 1;
  const lat0 = ride.lateral || 0;
  let moved = 0, edged = false;
  const n = Math.max(1, Math.ceil(((Math.max(ride.speed, V.speed) + V.accel * dt) * dt) / RIDE.substep));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const open = free - moved;
    const bend = curveLimit(ride, V, ride.s + ride.speed * h);   // where this substep ends
    let target = Math.min(V.speed, bend);
    if (charge && road.prey - moved <= reach) target = Math.max(target, Math.min(V.ramSpeed, bend));
    target = Math.min(target, Math.sqrt(2 * V.brake * Math.max(0, open)));
    ride.speed = ride.speed < target ? Math.min(target, ride.speed + V.accel * h) : Math.max(target, ride.speed - V.brake * h);
    let step = ride.speed * h;
    if (step >= open) {
      // could not stop in time: it runs up to the blocker and no further
      step = Math.max(0, open);
      if (ride.speed > ride.impact) ride.impact = ride.speed;
      ride.speed = 0;
    }
    ride.s = wrap(ride.s + step, L);
    moved += step;
    // sideways: out to the swerve's offset and back to the loop as it goes; held up at a crawl right
    // behind what it swerves round, it edges sideways on the spot
    const to = ride.pass ? ride.pass.off : 0;
    if (ride.lateral !== to) {
      const edge = ride.pass && ride.speed < RIDE.stuckSpeed ? RIDE.shuffle * h : 0;
      ride.lateral = toward(ride.lateral, to, step * RIDE.swerve + edge);
      if (edge > 0) edged = true;
    }
    if (ride.pass && (ride.pass.left -= step) <= 0) ride.pass = null;
  }
  // the vehicle points where it goes: along the loop, turned by the slope of its swerve
  const slope = moved > 1e-4 ? (ride.lateral - lat0) / moved : 0;
  ride.steer += (clamp(slope, -RIDE.swerve, RIDE.swerve) - ride.steer) * Math.min(1, dt * RIDE.steerRate);
  place(ride);
  // Into the turn. The view turns the vehicle by Euler(0, heading, -lean, 'YXZ'), so its top tips along
  // lean × (cos h, -sin h); a positive curvature (core/routes) turns from +x towards +z, which lowers the
  // heading, and puts the centre of the arc on the other side, along -(cos h, -sin h): hence the minus.
  const maxLean = V.maxLean ?? RIDE.maxLean;
  ride.lean = clamp(Math.atan((-ride.speed * ride.speed * ride.curvature) / 9.81), -maxLean, maxLean);
  const held = free - moved < 0.5 && ride.speed < RIDE.stuckSpeed && !edged;
  ride.blockedT = held ? ride.blockedT + dt : 0;
  return { dismount: ride.blockedT >= RIDE.dismountSecs };
}

/** A wreck slides on along its lane, drifts to the side it falls to and tips over. */
function slide(ride, V, dt) {
  ride.crashT += dt;
  const n = Math.max(1, Math.ceil((ride.speed * dt) / RIDE.substep));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const v0 = ride.speed;
    ride.speed = Math.max(0, v0 - RIDE.crashFriction * h);
    ride.s = wrap(ride.s + ((v0 + ride.speed) / 2) * h, ride.route.length);
  }
  const k = clamp(ride.crashT / RIDE.fallSecs, 0, 1);
  ride.lateral = (ride.lateral0 || 0) + ride.fallSide * RIDE.crashDrift * k;
  ride.lean = ride.fallSide * (Math.PI / 2 - 0.12) * k * k;
  ride.steer *= Math.max(0, 1 - dt * RIDE.steerRate);
  place(ride);
}

/**
 * The vehicle is shot out or its rider is killed on the move: from now on it is a wreck that slides on
 * along its lane with friction and falls onto its side. dir {x, z} is where the hit came from (it falls
 * that way); without it, it falls the way it leans, to the inside of its turn. Calling it again changes
 * nothing.
 */
export function crashRide(ride, dir = null) {
  if (ride.wrecked) return ride;
  ride.wrecked = true;
  ride.mounted = false;
  ride.alive = false;
  ride.crashT = 0;
  ride.blockedT = 0;
  ride.impact = 0;
  ride.lateral0 = ride.lateral || 0;   // it drifts from where it was, swerving or not
  ride.pass = null;
  const side = dir ? dir.x * Math.cos(ride.heading) - dir.z * Math.sin(ride.heading) : ride.lean;
  ride.fallSide = side < 0 ? -1 : 1;
  return ride;
}

/**
 * The rider gets off (held up by a blocker for RIDE.dismountSecs): the vehicle is not a wreck, it stays
 * whole and stands upright where it stopped, for stepRide from now on as well. It never rams.
 */
export function leaveRide(ride) {
  ride.mounted = false;
  ride.speed = 0;
  ride.lean = 0;
  ride.blockedT = 0;
  ride.impact = 0;
  ride.pass = null;
  return ride;
}

/**
 * The vehicle runs the player over: it rams (a finite ramSpeed), is mounted, goes at least
 * RIDE.bumpSpeed (or hit him at that speed this step), touches him (its box, grown by his radius), and
 * the last ram is ramCooldown seconds ago. From ramSpeed on it does ramDamage; slower, a share of it in
 * proportion to its speed. player {x, z, radius?, alive?}. Returns null or {damage, pushX, pushZ}: push
 * is a velocity in m/s (RIDE.knockMin at least), forward along the vehicle's way and out of its lane.
 */
export function rideRam(ride, player, now) {
  const V = VEHICLES[ride.kind];
  if (!Number.isFinite(V.ramSpeed) || !ride.mounted || ride.wrecked || player.alive === false) return null;
  const v = Math.max(ride.speed, ride.impact || 0);
  if (!(v >= RIDE.bumpSpeed) || now < ride.ramCdT) return null;
  const fx = Math.sin(ride.heading), fz = Math.cos(ride.heading);
  const rx = fz, rz = -fx;
  const dx = player.x - ride.x, dz = player.z - ride.z;
  const along = dx * fx + dz * fz, side = dx * rx + dz * rz;
  const r = player.radius ?? player.r ?? 0.34;
  if (Math.abs(along) > V.length / 2 + r + RIDE.touch || Math.abs(side) > V.width / 2 + r + RIDE.touch) return null;
  ride.ramCdT = now + V.ramCooldown * 1000;
  ride.impact = 0;
  const out = side < 0 ? -1 : 1;
  let px = fx * 0.75 + rx * out * 0.66, pz = fz * 0.75 + rz * out * 0.66;
  const k = clamp(v * RIDE.knockShare, RIDE.knockMin, RIDE.knockMax) / Math.hypot(px, pz);
  px *= k; pz *= k;
  const damage = v >= V.ramSpeed ? V.ramDamage : Math.round((V.ramDamage * v) / V.ramSpeed);
  return { damage, pushX: px, pushZ: pz };
}

/**
 * The rider's gun while he rides. view {x, z, visible, alive?}: where the player is and whether the
 * rider can see him (the game layer casts that ray). He only shoots what he sees within his sight and
 * no further round than RIDE.aimCone from his heading: first his reaction time, then the aim warning
 * (cue, laser), then a burst at his interval, a pause, a reload when the magazine is empty. Each shot
 * carries the accuracy of a moving shooter, P.acc × T.mountedAcc. Returns an intent shaped like
 * thinkEnemy's: {fire: {dist, acc} | null, laser 0..1, cue}.
 *
 * His upper body turns with his aim: e.aimTwist (radians from the heading, the yaw convention) goes
 * towards the player he sees at RIDE.twistRate, and back to the road when he sees nobody. A shot waits
 * until the twist is within RIDE.twistSlack of the line to the player, so the gun the view draws points
 * where the bullet goes.
 */
export function rideAim(ride, e, view, now, rng = Math.random) {
  const out = { fire: null, laser: 0, cue: false };
  const a = e.rideAim || (e.rideAim = { phase: 'idle', until: 0, left: 0, next: 0, last: now });
  const dt = clamp((now - a.last) / 1000, 0, 0.25);
  a.last = now;
  if (!e.alive || !ride.mounted) return out;
  const P = e.P, T = e.T;
  const dx = view.x - ride.x, dz = view.z - ride.z;
  const dist = Math.hypot(dx, dz);
  const bearing = angleDiff(ride.heading, Math.atan2(dx, dz));
  const facing = Math.abs(bearing) <= RIDE.aimCone;
  const sees = !!view.visible && view.alive !== false && dist <= T.sight && facing;
  e.sees = sees;
  const twistTo = sees ? bearing : 0, twist = e.aimTwist || 0, turn = RIDE.twistRate * dt;
  e.aimTwist = twist + clamp(twistTo - twist, -turn, turn);
  const onLine = Math.abs(twistTo - e.aimTwist) <= RIDE.twistSlack;
  if (a.phase === 'reload') {
    if (now < a.until) return out;
    e.mag = e.magSize;
    a.phase = 'idle';
  }
  if (!sees) {
    e.seenTime = 0;
    a.phase = 'idle';
    return out;
  }
  e.seenTime += dt;
  e.lastSeen = { x: view.x, z: view.z };
  if (e.mag <= 0) { a.phase = 'reload'; a.until = now + RIDE.reloadSecs * 1000; return out; }
  const warn = () => { a.phase = 'tele'; a.until = now + P.telegraph * 1000; out.cue = true; out.laser = 1; };
  switch (a.phase) {
    case 'idle':
      a.phase = 'react';
      a.until = now + rr(rng, P.react[0], P.react[1]) * 1000;
      return out;
    case 'react':
    case 'pause':
      if (now >= a.until) warn();
      return out;
    case 'tele':
      out.laser = 1;
      if (now < a.until) return out;
      a.phase = 'burst';
      a.left = ri(rng, P.burst[0], P.burst[1]);
      a.next = now;
    // falls through: the burst starts in this very step
    case 'burst':
      out.laser = Math.max(out.laser, 0.35);
      if (now >= a.next && a.left > 0 && e.mag > 0 && onLine) {
        out.fire = { dist, acc: P.acc * (T.mountedAcc ?? 1) };
        a.left--;
        e.mag--;
        a.next = now + P.interval * 1000;
      }
      if (a.left <= 0) { a.phase = 'pause'; a.until = now + rr(rng, P.pause[0], P.pause[1]) * 1000; }
      return out;
    default:
      a.phase = 'idle';
      return out;
  }
}
