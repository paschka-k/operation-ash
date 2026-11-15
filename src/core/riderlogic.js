// core/riderlogic: the rules the game layer follows to bring riders and bosses into play (wave 14).
// Pure: no three.js, no DOM; randomness and the player's line of sight come in as parameters.
//
//   isRider(type)                         a type that rides in on a vehicle (ENEMY_TYPES[type].vehicle)
//   riderSlotFree(mounted, wave, endless) may one more rider take to the streets (maxRiders)
//   deferSpawn(g, type)                   a spawn the game could not place waits in the wave's queue
//   pickRiderSpawn(routes, player, visible, opts) -> {route, s, x, z} | null   where a rider enters
//   payVehicle(g, kind)                   points and money for a vehicle shot out (no kill)
//   vehicleHp(kind, hpMult)               the vehicle's health in a wave
//   newRiderKinds(roster, seen)           the kinds of rider a wave brings for the first time in a game
//   riderMarkerAlpha(mode, sinceFired, mounted)   how a bot shows on the radar and the big map
//
// One spawn event of core/waves is one enemy core and exactly one enemyKilled: a rider shot off his
// vehicle keeps his core and fights on foot, the vehicle pays its own score without a kill.

import { ENEMY_TYPES, VEHICLES, RIDER_SPAWN, RIDER_MARKER, maxRiders, enemyMarkerAlpha } from './rules.js';

// Where riders enter and how loud a mounted rider shows on the maps: numbers of rules.js, re-exported here
// for the code that brings riders into play.
export { RIDER_SPAWN, RIDER_MARKER };

/** A type that rides in on a vehicle (the scooter rider, the skater, the biker, the gang leader). */
export const isRider = (type) => !!(ENEMY_TYPES[type] && ENEMY_TYPES[type].vehicle);

/** May one more rider take to the streets while `mounted` ride already? */
export function riderSlotFree(mounted, wave, endless = false) { return mounted < maxRiders(wave, endless); }

/**
 * The game layer could not place a spawn of `type`: it goes back into the wave's queue and the alive
 * count the spawn made is undone, so the wave still brings it later and counts it once. next = false
 * (all rider slots taken): it comes last, the foot soldiers go first. next = true (no loop point out of
 * sight right now): it is the very next spawn again, so the boss's guard, who follows the boss at the
 * end of the queue (core/waves startWave), stays right behind him. Mutates g; returns it.
 */
export function deferSpawn(g, type, next = false) {
  if (next) g.queue.push(type); else g.queue.unshift(type);
  g.alive = Math.max(0, g.alive - 1);
  g.waveEnemiesLeft = g.queue.length + g.alive;
  return g;
}

/** Points and money for shooting a vehicle of `kind` out from under its rider. No kill, no streak. */
export function payVehicle(g, kind) {
  const points = VEHICLES[kind].score;
  g.score += points;
  g.money += points;
  g.waveMoney += points;       // with the kill money of the wave in the shop's breakdown
  return points;
}

/** Health of a vehicle of `kind` in a wave whose enemies get hpMult (waveHpMult) more health. */
export function vehicleHp(kind, hpMult = 1) { return VEHICLES[kind].hp * (hpMult > 0 ? hpMult : 1); }

/** Distance along a closed loop of length L between two points of it, either way round. */
function loopDistance(a, b, L) {
  const d = (((a - b) % L) + L) % L;
  return Math.min(d, L - d);
}

/**
 * A point where a rider enters: on one of `routes` (core/routes buildRoute), at least RIDER_SPAWN.minDist
 * from the player {x, z}, out of his sight (visible(x, z) -> bool, the game layer casts the ray) and at
 * least RIDER_SPAWN.gap metres along the loop from every vehicle or wreck already on it (occupied: [{route, s}]).
 * Every loop is looked at every RIDER_SPAWN.step metres (from a random start), so a short stretch out of
 * sight is never missed; the points are tried best first (about 38 m away, a little shuffled) and the
 * first one out of sight wins, so few rays are cast. Returns {route, s, x, z} or null.
 */
export function pickRiderSpawn(routes, player, visible, { rng = Math.random, occupied = [] } = {}) {
  const cand = [], p = {};
  for (const route of routes) {
    for (let s = rng() * RIDER_SPAWN.step; s < route.length; s += RIDER_SPAWN.step) {
      route.sample(s, p);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < RIDER_SPAWN.minDist) continue;
      if (occupied.some((o) => o.route === route && loopDistance(o.s, s, route.length) < RIDER_SPAWN.gap)) continue;
      cand.push({ route, s, x: p.x, z: p.z, score: -Math.abs(d - 38) + rng() * 8 });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  for (const c of cand) if (!visible(c.x, c.z)) return { route: c.route, s: c.s, x: c.x, z: c.z };
  return null;
}

/**
 * The kinds of rider (not the bosses) a wave with this roster ({type: count}, rules.waveRoster) brings
 * for the first time in a game, given the kinds already `seen`. guard is true for bikers that come as
 * the gang leader's guard: in wave 5 they show up two waves before their own (firstRiderWave.biker 7),
 * so a game announces them there, as the leader's guard, and wave 7 has nothing new to announce.
 * Returns [{kind, guard}] in the order of the riders' first waves.
 */
export function newRiderKinds(roster, seen) {
  const out = [];
  for (const kind of ['scooterRider', 'skater', 'biker']) {
    if (!(roster[kind] > 0) || seen.has(kind)) continue;
    out.push({ kind, guard: kind === 'biker' && roster.bossBiker > 0 });
  }
  return out;
}

/**
 * Opacity of a bot's marker on the radar and the big map. On foot the radar setting decides
 * (enemyMarkerAlpha); a rider on his vehicle is heard from afar and always shows.
 */
export function riderMarkerAlpha(mode, sinceFired, mounted) {
  const a = enemyMarkerAlpha(mode, sinceFired);
  return mounted ? Math.max(a, RIDER_MARKER.mounted) : a;
}
