// core/grenade: how a hand grenade flies. Pure and deterministic: a grenade is a plain object,
// time comes in as `now` (ms) and `dt` (s), the level as its list of box colliders.
//
//   const g = launchGrenade({ eye, dir, vel, now, colliders });   // leaves the hand
//   stepGrenade(g, dt, colliders);    // gravity, bounces off boxes and the ground, rolls to a stop
//   grenadeDue(g, now)                // the fuse has burnt down: blow it up (game layer)
//   const e = launchGrenadeAt({ from, target, now });   // a bot's lob at a spot on the ground (wave 14)
//
// The grenade is a small ball. Every move is swept against the colliders grown by its radius, so a
// fast throw cannot pass through a thin wall. The numbers are in GRENADE (core/rules.js).

import { GRENADE, BOSS } from './rules.js';
import { rayBox } from './collision.js';

const SUBSTEP = 1 / 240;       // seconds; a throw moves about 6 cm per substep
const CONTACT = 0.6;           // m/s: slower than this into a surface is resting contact, not a bounce
const SKIN = 1e-3;             // a ball is kept this far off a surface it touches
const _box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

/**
 * First surface a ball of radius r meets moving from (x, y, z) along the unit vector d, within len.
 * The ground is the plane y = 0. Returns {t, nx, ny, nz} or null.
 */
export function sweepBall(colliders, x, y, z, dx, dy, dz, len, r) {
  let best = null, bestT = len;
  // bounds of the whole move, grown by the radius: boxes outside it cannot be hit
  const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
  const x0 = Math.min(x, ex) - r, x1 = Math.max(x, ex) + r, y0 = Math.min(y, ey) - r, y1 = Math.max(y, ey) + r;
  const z0 = Math.min(z, ez) - r, z1 = Math.max(z, ez) + r;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.solid || c.minX > x1 || c.maxX < x0 || c.minY > y1 || c.maxY < y0 || c.minZ > z1 || c.maxZ < z0) continue;
    _box.minX = c.minX - r; _box.maxX = c.maxX + r;
    _box.minY = c.minY - r; _box.maxY = c.maxY + r;
    _box.minZ = c.minZ - r; _box.maxZ = c.maxZ + r;
    const h = rayBox(x, y, z, dx, dy, dz, _box, bestT);
    // a start inside the grown box gives no normal: the ball is already touching, ignore that box
    if (h && h.t < bestT && (h.nx || h.ny || h.nz)) { bestT = h.t; best = h; }
  }
  if (dy < -1e-9) {
    const t = (r - y) / dy;
    if (t >= 0 && t < bestT) { bestT = t; best = { t, nx: 0, ny: 1, nz: 0 }; }
  }
  return best;
}

/**
 * A grenade leaving the hand. eye: where the throw starts (the camera), dir: the unit view
 * direction, vel: the thrower's velocity. The grenade starts a little in front of the eye, or
 * where a wall right in front of it stops it.
 */
export function launchGrenade({ eye, dir, vel = { x: 0, y: 0, z: 0 }, now = 0, colliders = [] }) {
  const G = GRENADE;
  let dx = dir.x, dy = dir.y + G.lift, dz = dir.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const g = {
    x: eye.x, y: eye.y, z: eye.z,
    vx: dx * G.speed + vel.x * G.inherit, vy: dy * G.speed + vel.y * G.inherit, vz: dz * G.speed + vel.z * G.inherit,
    born: now, fuseAt: now + G.fuseMs, rest: false, grounded: 0, bounces: 0,
  };
  // from the eye to the hand: GRENADE.reach forward, unless something is in the way
  const h = sweepBall(colliders, g.x, g.y, g.z, dir.x, dir.y, dir.z, G.reach, G.radius);
  const k = h ? Math.max(0, h.t - SKIN * 2) : G.reach;
  g.x += dir.x * k; g.y += dir.y * k; g.z += dir.z * k;
  return g;
}

/**
 * A grenade lobbed by a bot from `from` (its hand, {x, y, z}) at a spot on the ground `target` ({x, z}).
 * The velocity is solved so that, without anything in the way, the ball first touches the ground at the
 * target after BOSS.throwTime (longer for a longer throw). Same object as launchGrenade, same flight
 * (stepGrenade), same fuse; who threw it is for the game layer to note.
 */
export function launchGrenadeAt({ from, target, now = 0 }) {
  const G = GRENADE, T = BOSS.throwTime;
  const dx = target.x - from.x, dz = target.z - from.z;
  const t = Math.min(T.max, Math.max(T.min, T.base + T.perMetre * Math.hypot(dx, dz)));
  // the ball touches the ground when its centre is one radius above it
  const rise = G.radius - from.y;
  return {
    x: from.x, y: from.y, z: from.z,
    vx: dx / t, vy: (rise + 0.5 * G.gravity * t * t) / t, vz: dz / t,
    born: now, fuseAt: now + G.fuseMs, rest: false, grounded: 0, bounces: 0,
  };
}

/** Has the fuse burnt down? */
export function grenadeDue(g, now) { return now >= g.fuseAt; }

/** Speed of the grenade in m/s. */
export function grenadeSpeed(g) { return Math.hypot(g.vx, g.vy, g.vz); }

/**
 * Advance a grenade by dt seconds. Mutates it. Returns events: {type: 'bounce', speed, x, y, z}
 * for every hit hard enough to be heard, and {type: 'rest'} when it stops.
 */
export function stepGrenade(g, dt, colliders) {
  const G = GRENADE, r = G.radius, events = [];
  if (g.rest) {
    // still lying on something? A crate broken under it lets it drop.
    if (sweepBall(colliders, g.x, g.y, g.z, 0, -1, 0, SKIN * 4, r)) return events;
    g.rest = false;
  }
  let left = dt;
  while (left > 1e-9 && !g.rest) {
    const h = Math.min(left, SUBSTEP);
    left -= h;
    g.vy -= G.gravity * h;
    g.grounded = Math.max(0, g.grounded - h);
    // move, bouncing off whatever is hit, a few times within one substep at most
    let move = h;
    for (let k = 0; k < 4 && move > 1e-9; k++) {
      const sp = Math.hypot(g.vx, g.vy, g.vz);
      if (sp < 1e-9) break;
      const ux = g.vx / sp, uy = g.vy / sp, uz = g.vz / sp, dist = sp * move;
      const hit = sweepBall(colliders, g.x, g.y, g.z, ux, uy, uz, dist, r);
      if (!hit) { g.x += ux * dist; g.y += uy * dist; g.z += uz * dist; break; }
      const t = Math.max(0, hit.t - SKIN);
      g.x += ux * t; g.y += uy * t; g.z += uz * t;
      move *= 1 - hit.t / dist;
      // split the velocity into the part into the surface and the part along it
      const vn = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
      if (vn >= 0) continue;
      const tx = g.vx - vn * hit.nx, ty = g.vy - vn * hit.ny, tz = g.vz - vn * hit.nz;
      if (-vn > CONTACT) {
        g.vx = tx * G.slide - vn * G.bounce * hit.nx;
        g.vy = ty * G.slide - vn * G.bounce * hit.ny;
        g.vz = tz * G.slide - vn * G.bounce * hit.nz;
        g.bounces++;
        events.push({ type: 'bounce', speed: -vn, x: g.x, y: g.y, z: g.z });
      } else {
        g.vx = tx; g.vy = ty; g.vz = tz;
      }
      if (hit.ny > 0.7) g.grounded = 0.05;
    }
    // on the ground it rolls and slows down until it lies still
    if (g.grounded > 0) {
      const hs = Math.hypot(g.vx, g.vz);
      if (hs > 0) {
        const k = Math.max(0, hs - G.roll * h) / hs;
        g.vx *= k; g.vz *= k;
      }
      if (Math.hypot(g.vx, g.vz) < G.rest && Math.abs(g.vy) < 0.5) {
        g.vx = g.vy = g.vz = 0;
        g.rest = true;
        events.push({ type: 'rest', x: g.x, y: g.y, z: g.z });
      }
    }
  }
  return events;
}
