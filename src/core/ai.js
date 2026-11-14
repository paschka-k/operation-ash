// core/ai: the enemy's decisions as a state machine. Pure: no meshes, no audio,
// no effects. Each frame the game calls thinkEnemy and gets an Intent back;
// the squad layer moves the body, draws the aim laser and resolves the shot.
//
// States:   idle -> chase -> search -> combat -> dead
// In combat, bots with cover use phases:
//   seek -> toCover -> covered -> peek -> aim -> fire -> (toCover | seek)
// and fall back to `exposed` (open fight) when there is no cover.
//
// world = {
//   player: {x, y, z, eye: {x,y,z}, alive, speedFrac, sprinting, crouched, airborne},
//   colliders, nav, coverIndex, spawnPoints, rng,
//   budget: {path, cover}          how many path/cover searches may still run this frame
// }
// Intent = {moveX, moveZ, speed, fire: {dist}|null, laser: 0..1, cue, alert}

import { lineOfSight, clamp, damp, angleDiff } from './collision.js';
import { ENEMY_TYPES, enemyParams, botHitChance } from './rules.js';
import { findCover } from './cover.js';

export { ENEMY_TYPES, enemyParams, botHitChance };

let NEXT_ID = 1;
const rr = (rng, a, b) => a + (b - a) * rng();
const ri = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());

/**
 * A new bot at a spawn point ({x, z, type?, state?, lastSeen?, hpMult?}) at a difficulty tier 1..3.
 * hpMult (waveHpMult of the wave) scales its health; P.hp is the full bar the HUD measures against.
 */
export function createEnemy(spawn, tier = 1, rng = Math.random) {
  const type = spawn.type || 'grunt';
  const T = ENEMY_TYPES[type], P = enemyParams(type, tier);
  if (spawn.hpMult > 0) P.hp *= spawn.hpMult;
  return {
    id: NEXT_ID++, type, tier, T, P, alive: true,
    hp: P.hp, armor: T.armor, scale: T.scale, crouch: 0,
    x: spawn.x, y: spawn.y ?? 0, z: spawn.z, yaw: spawn.yaw ?? rng() * Math.PI * 2,
    state: spawn.state || 'idle', phase: 'seek', cover: null,
    t: rng() * 10, senseT: rng() * 0.15, sees: false, seenTime: 0, unseenT: 0, lostT: 0,
    reaction: 0, lastSeen: spawn.lastSeen || null,
    path: null, pathIdx: 0, pathT: rng() * 0.5, idleT: rr(rng, 0.5, 2.5), searchT: 0,
    burstLeft: 0, pauseT: rr(rng, 0.2, 0.8), fireCd: 0, teleT: null, telegraphT: 0,
    coverT: 0, exposeT: 0, exposedT: 0, peekT: 0,
    mag: T.magSize, magSize: T.magSize, reloadT: 0,
    strafeDir: rng() < 0.5 ? -1 : 1, strafeT: rr(rng, 0.8, 2),
    flinch: 0, stuckT: 0, lastX: spawn.x, lastZ: spawn.z, lastFiredAt: -1e9,
    moving: false, speedNow: 0,
  };
}

function newIntent() { return { moveX: 0, moveZ: 0, speed: 0, fire: null, laser: 0, cue: false, alert: 0 }; }

function turn(cur, target, maxStep) { return cur + clamp(angleDiff(cur, target), -maxStep, maxStep); }

function steer(intent, dx, dz, speed) {
  const d = Math.hypot(dx, dz) || 1;
  intent.moveX = dx / d; intent.moveZ = dz / d; intent.speed = speed;
}

function requestPath(e, world, tx, tz) {
  if (!world.budget || world.budget.path <= 0) return false;
  world.budget.path--;
  e.path = world.nav.findPath(e.x, e.z, tx, tz);
  e.pathIdx = 0;
  e.pathT = 0.7 + world.rng() * 0.5;
  return !!e.path;
}

function followPath(e, intent, dt, speed, faceMove = true) {
  if (!e.path || e.pathIdx >= e.path.length) return false;
  const wp = e.path[e.pathIdx];
  const dx = wp.x - e.x, dz = wp.z - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) { e.pathIdx++; return e.pathIdx < e.path.length; }
  steer(intent, dx, dz, speed);
  if (faceMove) e.yaw = turn(e.yaw, Math.atan2(dx, dz), 7 * dt);
  return true;
}

function enterCombat(e, reaction) {
  e.state = 'combat';
  e.phase = 'seek';
  e.cover = null;
  e.reaction = reaction;
  e.seenTime = 0;
  e.unseenT = 0;
  e.path = null;
  e.teleT = null;
}

function sense(e, world, intent) {
  const p = world.player;
  if (!p.alive) { e.sees = false; return; }
  const dx = p.x - e.x, dz = p.z - e.z;
  const dist = Math.hypot(dx, dz);
  let seen = false;
  if (dist < e.T.sight) {
    const diff = Math.abs(angleDiff(e.yaw, Math.atan2(dx, dz)));
    if (diff < 1.2 || dist < 6 || e.state === 'combat') {
      const ey = e.y + (1.55 - 0.5 * e.crouch) * e.scale;
      seen = lineOfSight(world.colliders, e.x, ey, e.z, p.eye.x, p.eye.y - 0.2, p.eye.z);
    }
  }
  e.sees = seen;
  if (seen) {
    e.lastSeen = { x: p.x, z: p.z };
    e.lostT = 0;
    e.unseenT = 0;
    if (e.state !== 'combat') {
      enterCombat(e, rr(world.rng, e.P.react[0], e.P.react[1]));
      intent.alert = 16;
    }
  }
}

/**
 * Decide what the bot wants to do this frame. Updates the bot's own state
 * (timers, phase, facing) and returns an Intent. Dead bots return an empty intent.
 */
export function thinkEnemy(e, world, dt, now) {
  const intent = newIntent();
  if (!e.alive) return intent;
  const rng = world.rng;
  const T = e.T;
  e.t += dt;
  e.flinch = Math.max(0, e.flinch - dt);
  e.senseT -= dt;
  e.pathT -= dt;
  if (e.senseT <= 0) { e.senseT = 0.1 + rng() * 0.06; sense(e, world, intent); }

  let moving = false;
  switch (e.state) {
    case 'idle': {
      if (e.path && followPath(e, intent, dt, T.patrol)) { moving = true; break; }
      e.idleT -= dt;
      if (e.idleT <= 0) {
        const pts = world.spawnPoints;
        const tgt = pts[ri(rng, 0, pts.length - 1)];
        e.idleT = requestPath(e, world, tgt.x, tgt.z) ? rr(rng, 1, 3.5) : 0.4;
      }
      e.yaw += Math.sin(e.t * 0.7 + e.id) * dt * 0.6;
      break;
    }
    case 'chase': {
      const ls = e.lastSeen;
      if (!ls) { e.state = 'idle'; break; }
      if (Math.hypot(ls.x - e.x, ls.z - e.z) < 2.2) { e.state = 'search'; e.searchT = rr(rng, 3, 5.5); e.path = null; break; }
      if (!e.path || e.pathIdx >= e.path.length || e.pathT <= 0) requestPath(e, world, ls.x, ls.z);
      if (followPath(e, intent, dt, T.speed * 0.9)) moving = true;
      break;
    }
    case 'search': {
      e.searchT -= dt;
      e.yaw += Math.sin(e.t * 1.6 + e.id) * dt * 1.8;
      if (e.searchT <= 0) { e.state = 'idle'; e.idleT = 0.3; e.path = null; }
      break;
    }
    case 'combat': {
      const p = world.player;
      const dx = p.x - e.x, dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      const toP = Math.atan2(dx, dz);
      if (e.sees) e.seenTime += dt; else e.unseenT += dt;
      if (e.reaction > 0) e.reaction -= dt;
      let res;
      if (T.cover && world.coverIndex && e.phase !== 'exposed') {
        if (e.unseenT > 14) { e.state = 'chase'; e.path = null; break; }
        res = combatCover(e, world, intent, dt, dist, toP);
      } else {
        res = combatExposed(e, world, intent, dt, dist, toP);
      }
      if (res === 'moving') moving = true;
      break;
    }
    default: break;
  }

  // crouch while hiding or reloading behind cover (also lowers the hit boxes)
  const wantCrouch = e.state === 'combat' && (e.phase === 'covered' || e.reloadT > 0) && !moving;
  e.crouch = damp(e.crouch, wantCrouch ? 1 : 0, 9, dt);

  // stuck detection: repath when the bot hardly moved although it wanted to
  e.stuckT += dt;
  if (e.stuckT > 0.6) {
    const moved = Math.hypot(e.x - e.lastX, e.z - e.lastZ);
    if (moving && moved < 0.15) { e.path = null; e.pathT = 0; e.strafeDir *= -1; }
    e.lastX = e.x; e.lastZ = e.z; e.stuckT = 0;
  }
  e.moving = moving;
  return intent;
}

// -------- combat without cover (rushers, or when no cover exists)
function combatExposed(e, world, intent, dt, dist, toP) {
  const p = world.player, T = e.T;
  if (!e.sees) {
    e.lostT += dt;
    if (e.lostT > 1.1) { e.state = 'chase'; e.path = null; e.phase = 'seek'; return 'still'; }
  }
  if (e.sees || e.lostT < 0.6) e.yaw = turn(e.yaw, toP, 6.5 * dt);
  if (e.phase === 'exposed') {
    e.exposedT -= dt;
    if (e.exposedT <= 0 && T.cover) { e.phase = 'seek'; return 'still'; }
  }
  let res = 'still';
  if (e.sees) {
    const [rmin, rmax] = T.range;
    if (dist > rmax) {
      if (!e.path || e.pathIdx >= e.path.length || e.pathT <= 0) requestPath(e, world, p.x, p.z);
      if (followPath(e, intent, dt, T.speed, false)) res = 'moving';
    } else if (dist < rmin) {
      const ax = -(p.x - e.x) / dist, az = -(p.z - e.z) / dist;
      if (world.nav.walkable(e.x, e.z, e.x + ax * 1.5, e.z + az * 1.5)) {
        steer(intent, ax, az, T.speed * 0.7);
        res = 'moving';
      }
    } else {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeDir *= -1; e.strafeT = rr(world.rng, 1.1, 2.6); }
      const dx = p.x - e.x, dz = p.z - e.z;
      const sx = -dz / dist * e.strafeDir, sz = dx / dist * e.strafeDir;
      if (world.nav.walkable(e.x, e.z, e.x + sx * 1.6, e.z + sz * 1.6)) {
        steer(intent, sx, sz, T.speed * 0.5);
        res = 'moving';
      } else e.strafeDir *= -1;
    }
    combatFire(e, world, intent, dt, dist);
  }
  return res;
}

/** Burst fire with an aim warning (laser and chirp) before every burst. */
function combatFire(e, world, intent, dt, dist) {
  const P = e.P, rng = world.rng;
  if (e.reaction > 0) return;
  if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) e.mag = e.magSize; return; }
  if (e.mag <= 0) { e.reloadT = 1.8; return; }
  if (e.pauseT > 0) { e.pauseT -= dt; return; }
  if (e.burstLeft <= 0) {
    if (e.teleT === null) { e.teleT = P.telegraph; intent.cue = true; }
    e.teleT -= dt;
    intent.laser = Math.max(intent.laser, 1);
    if (e.teleT > 0) return;
    e.teleT = null;
    e.burstLeft = ri(rng, P.burst[0], P.burst[1]);
    e.fireCd = 0;
  }
  fireBurst(e, world, intent, dt, dist);
  if (e.burstLeft <= 0) e.pauseT = rr(rng, P.pause[0], P.pause[1]);
}

/** One step of a burst. Returns true when the burst is over. */
function fireBurst(e, world, intent, dt, dist) {
  e.fireCd -= dt;
  if (e.burstLeft <= 0 || e.mag <= 0) return true;
  const p = world.player;
  const aligned = Math.abs(angleDiff(e.yaw, Math.atan2(p.x - e.x, p.z - e.z))) < 0.18;
  if (e.fireCd <= 0 && aligned) {
    intent.fire = { dist };
    e.burstLeft--;
    e.mag--;
    e.fireCd = e.P.interval;
  }
  intent.laser = Math.max(intent.laser, 0.35);
  return e.burstLeft <= 0;
}

function pickCover(e, world) {
  if (!world.budget || world.budget.cover <= 0) return null;
  world.budget.cover--;
  const p = world.player;
  const c = findCover({
    index: world.coverIndex, colliders: world.colliders, nav: world.nav, rnd: world.rng,
    enemy: { x: e.x, z: e.z }, player: { x: p.x, z: p.z }, eye: p.eye,
    prefer: (e.T.range[0] + e.T.range[1]) / 2,
  });
  if (c) { e.cover = c; return true; }
  return false;
}

// -------- combat with cover: seek, run, hide, peek, aim, fire
function combatCover(e, world, intent, dt, dist, toP) {
  const T = e.T, P = e.P, rng = world.rng;
  switch (e.phase) {
    case 'seek': {
      const r = pickCover(e, world);
      if (r === true) { e.phase = 'toCover'; e.path = null; e.pathT = 0; }
      else if (r === false) { e.phase = 'exposed'; e.exposedT = rr(rng, 3, 5); }
      if (e.sees) e.yaw = turn(e.yaw, toP, 6 * dt);
      return 'still';
    }
    case 'toCover': {
      const c = e.cover;
      if (!c) { e.phase = 'seek'; return 'still'; }
      if (Math.hypot(c.x - e.x, c.z - e.z) < 0.7) {
        e.phase = 'covered';
        e.coverT = rr(rng, P.coverWait[0], P.coverWait[1]);
        e.exposeT = 0;
        return 'still';
      }
      if (!e.path || e.pathIdx >= e.path.length || e.pathT <= 0) {
        if (!requestPath(e, world, c.x, c.z)) steer(intent, c.x - e.x, c.z - e.z, T.speed * 1.05);
      }
      const moved = followPath(e, intent, dt, T.speed * 1.05, !e.sees);
      if (e.sees) e.yaw = turn(e.yaw, toP, 6 * dt);
      return moved || intent.speed > 0 ? 'moving' : 'still';
    }
    case 'covered': {
      e.yaw = turn(e.yaw, toP, 4 * dt);
      if (e.reloadT > 0) {
        e.reloadT -= dt;
        if (e.reloadT <= 0) e.mag = e.magSize;
      } else if (e.mag < e.magSize * 0.34) e.reloadT = 1.7;
      // if the bot can see the player although it hides, the player sees it too: move
      if (e.sees) {
        e.exposeT += dt;
        if (e.exposeT > 0.8) { e.phase = 'seek'; e.cover = null; }
      } else e.exposeT = 0;
      e.coverT -= dt;
      if (e.coverT <= 0 && e.reloadT <= 0) {
        e.peekT = 0;
        if (e.cover && e.cover.peek) e.phase = 'peek';
        else { e.phase = 'exposed'; e.exposedT = rr(rng, 1.5, 2.5); }
      }
      return 'still';
    }
    case 'peek': {
      const pk = e.cover && e.cover.peek;
      if (!pk) { e.phase = 'seek'; return 'still'; }
      e.peekT += dt;
      e.yaw = turn(e.yaw, toP, 7 * dt);
      if (e.sees) {
        e.phase = 'aim';
        e.telegraphT = P.telegraph;
        e.burstLeft = ri(rng, P.burst[0], P.burst[1]);
        e.fireCd = 0;
        intent.cue = true;
        return 'still';
      }
      if (e.peekT > 3) { e.phase = 'seek'; e.cover = null; return 'still'; }
      if (Math.hypot(pk.x - e.x, pk.z - e.z) > 0.35) { steer(intent, pk.x - e.x, pk.z - e.z, T.speed * 0.85); return 'moving'; }
      return 'still';
    }
    case 'aim': {
      e.yaw = turn(e.yaw, toP, 9 * dt);
      intent.laser = Math.max(intent.laser, 1);
      e.telegraphT -= dt;
      if (!e.sees && e.telegraphT < -0.3) { e.phase = 'toCover'; return 'still'; }
      if (e.telegraphT <= 0) e.phase = 'fire';
      return 'still';
    }
    case 'fire': {
      e.yaw = turn(e.yaw, toP, 9 * dt);
      const done = fireBurst(e, world, intent, dt, dist);
      if (done || (!e.sees && e.fireCd < -0.4)) {
        e.phase = rng() < 0.4 ? 'seek' : 'toCover';
        if (e.phase === 'seek') e.cover = null;
        e.path = null; e.pathT = 0;
      }
      return 'still';
    }
    default:
      e.phase = 'seek';
      return 'still';
  }
}

// ----------------------------------------------------------- reacting to the world

/**
 * The bot was hit. Pulls it into combat when it was not fighting yet and makes
 * a bot that is shot in cover look for another spot. Returns {alert} radius.
 */
export function enemyHurt(e, { source = 'player', player, rng = Math.random }) {
  e.flinch = 0.18;
  if (e.state !== 'combat') {
    enterCombat(e, rr(rng, 0.15, 0.35));
    e.seenTime = 0.5;
    e.lastSeen = { x: player.x, z: player.z };
    return { alert: 14 };
  }
  if (e.phase === 'covered' && source === 'player') { e.phase = 'seek'; e.cover = null; }
  return { alert: 0 };
}

/** A sound at x,z: bots within radius that are not fighting go to investigate. */
export function hearNoise(enemies, x, z, radius, rng = Math.random) {
  for (const e of enemies) {
    if (!e.alive || e.state === 'combat') continue;
    if (Math.hypot(e.x - x, e.z - z) < radius) {
      e.state = 'chase';
      e.lastSeen = { x: x + rr(rng, -3, 3), z: z + rr(rng, -3, 3) };
      e.path = null;
      e.pathT = 0;
    }
  }
}

/** One bot spotted the player: its neighbours come looking. */
export function alertNearby(enemies, src, player, radius, rng = Math.random) {
  for (const e of enemies) {
    if (e === src || !e.alive || e.state === 'combat') continue;
    if (Math.hypot(e.x - src.x, e.z - src.z) < radius) {
      e.state = 'chase';
      e.lastSeen = { x: player.x + rr(rng, -4, 4), z: player.z + rr(rng, -4, 4) };
      e.path = null;
      e.pathT = 0;
    }
  }
}
