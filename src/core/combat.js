// core/combat: hits and damage. Pure functions: a shot is a ray (or several
// pellets) through a cone, stopped by the nearest wall or target. Targets are
// plain objects with a position; hit zones (head, body, legs) are computed here.
//
// A target looks like:
//   {id, x, y, z, scale?, crouch?, alive?, hp, armor?}   x,y,z is the point at the feet.
// A vehicle (wave 14) is a target of its own, one turned box with the single zone 'vehicle':
//   {id, kind: 'vehicle', x, y, z, yaw, length, width, height, alive, hp, armor, view}
//   x,y,z is the ground point under its centre, yaw its heading (atan2 of the forward direction's x and z),
//   length runs along the heading, width across it.

import { raycast, raySphere, rayVerticalCylinder, rayBox, lineOfSight } from './collision.js';
import { randomCone, v3, vec3 } from './math.js';
import { ZONE_MULT, EXPLOSION, damageAtRange, explosionDamage } from './rules.js';

export { damageAtRange };

const isVehicle = (t) => t.kind === 'vehicle';

/** The box of a vehicle in its own frame: x across, z along the heading, y up from the ground. */
function vehicleBox(t) {
  const hx = t.width / 2, hz = t.length / 2;
  return { minX: -hx, maxX: hx, minY: t.y, maxY: t.y + t.height, minZ: -hz, maxZ: hz };
}

/**
 * The hit volumes of a target. A standing or crouching soldier has three: a sphere for the head,
 * a cylinder for the torso, a cylinder for the legs. A vehicle has one box turned by its yaw.
 */
export function targetZones(t) {
  if (isVehicle(t)) {
    return { vehicle: { x: t.x, y: t.y + t.height / 2, z: t.z, yaw: t.yaw, length: t.length, width: t.width, height: t.height } };
  }
  const s = t.scale ?? 1, c = (t.crouch ?? 0) * 0.42 * s;
  return {
    head: { x: t.x, y: t.y + 1.63 * s - c, z: t.z, r: 0.185 * s },
    body: { x: t.x, z: t.z, y0: t.y + 0.85 * s - c * 0.8, y1: t.y + 1.5 * s - c, r: 0.29 * s },
    legs: { x: t.x, z: t.z, y0: t.y, y1: t.y + 0.85 * s - c * 0.8, r: 0.2 * s },
  };
}

/** Distance along a ray to a vehicle's turned box, or -1. The ray is taken into the box's frame. */
function rayVehicle(origin, dir, t) {
  const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
  const ox = origin.x - t.x, oz = origin.z - t.z;
  // world -> box frame: x across the heading, z along it
  const lx = ox * c - oz * s, lz = ox * s + oz * c;
  const dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c;
  const h = rayBox(lx, origin.y, lz, dx, dir.y, dz, vehicleBox(t));
  return h ? h.t : -1;
}

/** Nearest living target on a ray (dir is a unit vector). Returns {t, target, zone} or null. */
export function rayTargets(origin, dir, maxT, targets) {
  let best = null;
  const horiz = Math.hypot(dir.x, dir.z);
  for (const tg of targets) {
    if (tg.alive === false) continue;
    const vehicle = isVehicle(tg);
    // cheap reject: distance from the ray to the target axis in the XZ plane, against 1 m for a
    // soldier and the half diagonal of the box for a vehicle
    if (horiz > 1e-5) {
      const reach = vehicle ? Math.hypot(tg.length, tg.width) / 2 : 1.0;
      const t2 = ((tg.x - origin.x) * dir.x + (tg.z - origin.z) * dir.z) / (horiz * horiz);
      const cx = origin.x + dir.x * t2 - tg.x, cz = origin.z + dir.z * t2 - tg.z;
      if (cx * cx + cz * cz > reach * reach) continue;
    }
    if (vehicle) {
      const t = rayVehicle(origin, dir, tg);
      if (t >= 0 && t <= maxT && (!best || t < best.t)) best = { t, target: tg, zone: 'vehicle' };
      continue;
    }
    const z = targetZones(tg);
    const th = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, z.head.x, z.head.y, z.head.z, z.head.r);
    const tt = rayVerticalCylinder(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, z.body.x, z.body.y0, z.body.y1, z.body.z, z.body.r);
    const tl = rayVerticalCylinder(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, z.legs.x, z.legs.y0, z.legs.y1, z.legs.z, z.legs.r);
    let t = Infinity, zone = null;
    if (th >= 0 && th < t) { t = th; zone = 'head'; }
    if (tt >= 0 && tt < t) { t = tt; zone = 'body'; }
    if (tl >= 0 && tl < t) { t = tl; zone = 'legs'; }
    if (zone && t <= maxT && (!best || t < best.t)) best = { t, target: tg, zone };
  }
  return best;
}

/**
 * Fire `pellets` projectiles from origin around dir inside a cone of spreadDeg.
 * Returns one Hit per pellet, in order:
 *   {pellet, kind:'target', t, point, dir, target, zone}
 *   {pellet, kind:'world',  t, point, dir, normal, collider}
 *   {pellet, kind:'none',   t, point, dir}                      (nothing within maxDist)
 * Walls and cover stop a pellet before it reaches a target behind them.
 */
export function resolveShot({ origin, dir, spreadDeg = 0, pellets = 1, rng = Math.random, colliders = [], targets = [], maxDist = 260 }) {
  const hits = [];
  for (let i = 0; i < pellets; i++) {
    const d = randomCone(dir, spreadDeg, rng);
    const wh = raycast(colliders, origin.x, origin.y, origin.z, d.x, d.y, d.z, maxDist, { bullets: true });
    const th = rayTargets(origin, d, wh ? wh.t : maxDist, targets);
    if (th) {
      hits.push({
        pellet: i, kind: 'target', t: th.t, dir: d, target: th.target, zone: th.zone,
        point: vec3(origin.x + d.x * th.t, origin.y + d.y * th.t, origin.z + d.z * th.t),
      });
    } else if (wh) {
      hits.push({
        pellet: i, kind: 'world', t: wh.t, dir: d, collider: wh.box,
        point: vec3(wh.x, wh.y, wh.z), normal: vec3(wh.nx, wh.ny, wh.nz),
      });
    } else {
      hits.push({ pellet: i, kind: 'none', t: maxDist, dir: d, point: vec3(origin.x + d.x * maxDist, origin.y + d.y * maxDist, origin.z + d.z * maxDist) });
    }
  }
  return hits;
}

/**
 * Apply damage to an entity with hp and optional armor. The hit zone multiplies
 * the damage (head x2.5, legs x0.75). Returns {damage, dead}.
 */
export function applyDamage(entity, amount, zone = 'body') {
  const damage = Math.max(0, amount) * (ZONE_MULT[zone] ?? 1) * (entity.armor ?? 1);
  entity.hp -= damage;
  return { damage, dead: entity.hp <= 0 };
}

/**
 * Area damage with quadratic falloff. Cover in between shields most of it.
 * Does not change anything: returns [{target, dist, damage, shielded}] so the
 * caller can apply it (applyDamage for bots, damagePlayer for the player).
 */
export function explode({ center, radius = EXPLOSION.radius, damage = EXPLOSION.damage, targets = [], colliders = [] }) {
  const out = [];
  for (const t of targets) {
    if (t.alive === false) continue;
    // a soldier is hit at the chest, a vehicle at the centre of its box
    const chest = isVehicle(t) ? vec3(t.x, t.y + t.height / 2, t.z) : vec3(t.x, t.y + 0.95 * (t.scale ?? 1), t.z);
    const dist = v3.dist(center, chest);
    if (dist >= radius) continue;
    let dmg = explosionDamage(dist, radius, damage);
    const clear = lineOfSight(colliders, center.x, center.y + 0.3, center.z, chest.x, chest.y, chest.z);
    if (!clear) dmg *= EXPLOSION.shielded;
    if (dmg > 0.01) out.push({ target: t, dist, damage: dmg, shielded: !clear });
  }
  return out;
}
