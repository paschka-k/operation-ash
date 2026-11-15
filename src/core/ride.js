// core/ride: a rider's vehicle on its loop. Pure: no three.js, time comes in as dt (s) and now (ms).
//
//   const ride = createRide(route, s, 'moto', rng);   // on loop `route` (core/routes buildRoute) at s metres
//   stepRide(ride, dt, blockers)   -> {dismount}       // drive on; brake for whatever stands in the lane,
//                                                      // a motorbike goes for the player instead
//   rideRam(ride, player, now)     -> null | {damage, pushX, pushZ}
//   rideAim(ride, e, view, now, rng) -> {fire: {dist, acc} | null, laser, cue}   // the rider's gun
//   crashRide(ride, dir)                                // shot out or rider killed: it slides and falls
//   leaveRide(ride)                                     // the rider got off: it stands there, whole
//
// Ride = {route, s, kind, speed, x, y, z, heading, lean, curvature, blockedT, ramCdT, impact,
//         alive, wrecked, mounted, phase}
// lean > 0 tips the vehicle's top along (cos heading, -sin heading), as the view draws it with
// Euler(0, heading, -lean, 'YXZ'); in a turn it leans towards the centre of the arc.
// The vehicle follows the loop exactly: the loops are laid out clear of the level's colliders
// (core/routes), so nothing here looks at the level. What can stand in the way is passed in as
// blockers [{x, z, r, player?}]: the player (flagged player), other riders, wrecks, foot soldiers. A
// scooter or a skate stops for the player; a motorbike (a finite ramSpeed) runs him down and rides on
// (stepRide, rideRam); everybody stops for everything else. The numbers are in rules.js
// (VEHICLES for each kind, RIDE for how all of them drive).

import { VEHICLES, RIDE } from './rules.js';
import { clamp, angleDiff } from './math.js';

const rr = (rng, a, b) => a + (b - a) * rng();
const ri = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
const wrap = (s, L) => ((s % L) + L) % L;
const _p = {};

/** A vehicle of `kind` (a key of VEHICLES) on `route` at s, at its cruising speed. */
export function createRide(route, s, kind, rng = Math.random) {
  const ride = {
    route, s: wrap(s, route.length), kind, speed: VEHICLES[kind].speed,
    x: 0, y: 0, z: 0, heading: 0, lean: 0, curvature: 0,
    blockedT: 0, ramCdT: -Infinity, impact: 0,
    alive: true, wrecked: false, mounted: true,
    phase: rng() * Math.PI * 2,      // for the view: wobble, engine pitch, so two riders never move in step
    crashT: 0, fallSide: 1, lateral: 0,
  };
  place(ride);
  return ride;
}

/** Put x, z, heading and curvature where s is, shifted sideways by the wreck's drift. */
function place(ride) {
  const p = ride.route.sample(ride.s, _p);
  const right = ride.lateral || 0;
  // right of the heading (sin h, cos h) is (cos h, -sin h)
  ride.x = p.x + Math.cos(p.heading) * right;
  ride.z = p.z - Math.sin(p.heading) * right;
  ride.heading = p.heading;
  ride.curvature = p.curvature;
}

/** Fastest speed at s that still lets the vehicle take every turn within its braking distance. */
function curveLimit(ride, V, s) {
  const reach = (V.speed * V.speed) / (2 * V.brake) + 1;
  let limit = V.speed;
  for (let d = 0; d <= reach; d += 0.5) {
    const k = Math.abs(ride.route.sample(s + d, _p).curvature);
    if (k < 1e-9) continue;
    const v = Math.sqrt(RIDE.grip / k + 2 * V.brake * d);
    if (v < limit) limit = v;
  }
  return limit;
}

/**
 * The road in front of the vehicle's nose, in metres along the loop: free, before the nearest blocker
 * that stands in its lane, and prey, before its nose touches the player (both Infinity when there is
 * none). The player counts as prey only for a vehicle that rams (a finite ramSpeed, the motorbikes):
 * every other blocker, and the player for the others, is free road's end. Blockers behind it do not
 * count. prey is below zero when the player already stands inside the vehicle's length.
 */
function scanRoad(ride, V, blockers, out) {
  const route = ride.route, L = route.length, half = V.length / 2, rams = Number.isFinite(V.ramSpeed);
  out.free = Infinity;
  out.prey = Infinity;
  for (const b of blockers) {
    const r = b.r || 0;
    const n = route.nearest(b.x, b.z);
    if (n.dist > V.width / 2 + r + RIDE.lane) continue;
    const ahead = wrap(n.s - ride.s, L);
    if (ahead > L / 2) continue;
    if (rams && b.player) { out.prey = Math.min(out.prey, ahead - half - r); continue; }
    const gap = ahead - half - r - RIDE.gap;
    if (gap < out.free) out.free = Math.max(0, gap);
  }
  return out;
}

/**
 * Can the vehicle still touch its prey at ramSpeed: speeding up all the way to him and still able to
 * stop for whatever stands in the lane beyond him? A motorbike that cannot (it stands, or crawls, right
 * behind him) brakes for him like for anyone, and does not drive through him.
 */
function canRam(ride, V, road) {
  const d = Math.max(0, road.prey);
  const v = Math.min(Math.sqrt(ride.speed * ride.speed + 2 * V.accel * d), Math.sqrt(2 * V.brake * Math.max(0, road.free - d)));
  return v >= V.ramSpeed;
}

const _road = { free: Infinity, prey: Infinity };

/**
 * Drive for dt seconds: cruise at the vehicle's speed, slower before turns, brake for blockers in the
 * lane and never run into one. The move is cut into substeps of at most RIDE.substep metres. A ride held
 * still by a blocker counts blockedT up; after RIDE.dismountSecs the rider should get off.
 * blockers [{x, z, r, player?}]: the one flagged player is the player. A vehicle that rams (a finite
 * ramSpeed, the motorbikes) does not brake for him: it goes for him, at least at ramSpeed once he is
 * within its braking reach and even in a turn, runs him down (rideRam) and rides on; only when it is too
 * slow and too close to reach ramSpeed before it touches him does it stop for him as for anyone. A
 * scooter or a skate stops for him; everybody stops for every other blocker.
 * A wreck (crashRide) slides on instead. Returns {dismount}.
 */
export function stepRide(ride, dt, blockers = []) {
  const V = VEHICLES[ride.kind], L = ride.route.length;
  ride.impact = 0;
  if (ride.wrecked) { slide(ride, V, dt); return { dismount: false }; }
  if (!ride.mounted) return { dismount: false };    // left standing by its rider (leaveRide)
  const road = scanRoad(ride, V, blockers, _road);
  const charge = road.prey < Infinity && canRam(ride, V, road);
  const free = charge ? road.free : Math.min(road.free, Math.max(0, road.prey - RIDE.gap));
  const reach = (V.speed * V.speed) / (2 * V.brake) + 1;
  let moved = 0;
  const n = Math.max(1, Math.ceil(((Math.max(ride.speed, V.speed) + V.accel * dt) * dt) / RIDE.substep));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const room = free - moved;
    let target = Math.min(V.speed, curveLimit(ride, V, ride.s));
    if (charge && road.prey - moved <= reach) target = Math.max(target, V.ramSpeed);
    target = Math.min(target, Math.sqrt(2 * V.brake * Math.max(0, room)));
    ride.speed = ride.speed < target ? Math.min(target, ride.speed + V.accel * h) : Math.max(target, ride.speed - V.brake * h);
    let step = ride.speed * h;
    if (step >= room) {
      // could not stop in time: it runs up to the blocker and no further
      step = Math.max(0, room);
      if (ride.speed > ride.impact) ride.impact = ride.speed;
      ride.speed = 0;
    }
    ride.s = wrap(ride.s + step, L);
    moved += step;
  }
  place(ride);
  // Into the turn. The view turns the vehicle by Euler(0, heading, -lean, 'YXZ'), so its top tips along
  // lean × (cos h, -sin h); a positive curvature (core/routes) turns from +x towards +z, which lowers the
  // heading, and puts the centre of the arc on the other side, along -(cos h, -sin h): hence the minus.
  ride.lean = clamp(Math.atan((-ride.speed * ride.speed * ride.curvature) / 9.81), -RIDE.maxLean, RIDE.maxLean);
  const held = free - moved < 0.5 && ride.speed < RIDE.stuckSpeed;
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
  ride.lateral = ride.fallSide * RIDE.crashDrift * k;
  ride.lean = ride.fallSide * (Math.PI / 2 - 0.12) * k * k;
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
  return ride;
}

/**
 * The vehicle runs the player over: it is mounted, at least at ramSpeed (or hit him at that speed this
 * step) and touches him (its box, grown by his radius), and the last ram is ramCooldown seconds ago.
 * player {x, z, radius?, alive?}. Returns null or {damage, pushX, pushZ}: push is a velocity in m/s,
 * forward along the vehicle's way and out of its lane.
 */
export function rideRam(ride, player, now) {
  const V = VEHICLES[ride.kind];
  if (!ride.mounted || ride.wrecked || player.alive === false) return null;
  const v = Math.max(ride.speed, ride.impact || 0);
  if (!(v >= V.ramSpeed) || now < ride.ramCdT) return null;
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
  const k = Math.min(RIDE.knockMax, v * RIDE.knockShare) / Math.hypot(px, pz);
  px *= k; pz *= k;
  return { damage: V.ramDamage, pushX: px, pushZ: pz };
}

/**
 * The rider's gun while he rides. view {x, z, visible, alive?}: where the player is and whether the
 * rider can see him (the game layer casts that ray). He only shoots what he sees within his sight and
 * no further round than RIDE.aimCone from his heading: first his reaction time, then the aim warning
 * (cue, laser), then a burst at his interval, a pause, a reload when the magazine is empty. Each shot
 * carries the accuracy of a moving shooter, P.acc × T.mountedAcc. Returns an intent shaped like
 * thinkEnemy's: {fire: {dist, acc} | null, laser 0..1, cue}.
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
  const facing = Math.abs(angleDiff(ride.heading, Math.atan2(dx, dz))) <= RIDE.aimCone;
  const sees = !!view.visible && view.alive !== false && dist <= T.sight && facing;
  e.sees = sees;
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
      if (now >= a.next && a.left > 0 && e.mag > 0) {
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
