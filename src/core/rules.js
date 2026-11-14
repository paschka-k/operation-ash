// Game rules as plain data and pure functions. This module knows nothing about
// three.js or the DOM, so every rule can be tested under bare Node. Adding a
// weapon or an enemy type means adding a row here, not changing logic.

import { clamp, lerp } from './math.js';

// ------------------------------------------------------------------ player
export const PLAYER = {
  radius: 0.34,
  height: 1.8,
  crouchHeight: 1.05,
  eye: 1.62,
  crouchEye: 0.92,
  walk: 4.2,           // m/s
  sprint: 6.6,         // forward only
  crouch: 2.2,
  ads: 2.8,            // speed while aiming down sights
  jumpHeight: 1.1,     // metres
  gravity: 22,
  maxHealth: 100,
  regenDelay: 5,       // seconds without damage
  regenRate: 18,       // health per second
  lowHealthVignette: 40,
  heartbeatBelow: 25,
};
PLAYER.jump = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);

// ---- wave 11: sprint stamina


/** Health after regeneration. */
export function regenHealth(health, max, sinceDamage, dt) {
  if (health >= max || sinceDamage < PLAYER.regenDelay) return health;
  return Math.min(max, health + PLAYER.regenRate * dt);
}

/** Speed the player is allowed to move at. weapon: multiplier of the weapon in hand (weaponMoveMul in core/weapons). */
export function moveSpeed({ crouched, sprinting, ads, backwards, weapon = 1 }) {
  let v = crouched ? PLAYER.crouch : sprinting ? PLAYER.sprint : PLAYER.walk;
  if (ads > 0) v = lerp(v, Math.min(v, PLAYER.ads), clamp(ads, 0, 1));
  if (backwards && !crouched) v *= 0.82;
  return v * weapon;
}

// ----------------------------------------------------------------- weapons
/** Every weapon in the game, in slot order: slot N is WEAPON_ORDER[N - 1]. */
export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun', 'smg', 'carbine', 'sniper', 'lmg', 'minigun', 'flamer'];

/** What a new game starts with. The rest is bought in the shop between waves. */
export const START_WEAPONS = ['pistol', 'rifle', 'shotgun'];

/**
 * One row per weapon. Angles are degrees, times are milliseconds.
 * spreadBase..spreadMax is the cone half angle at rest, spreadPerShot is how
 * much each shot widens it. recoil is the camera kick per shot (x up, y sideways).
 * price is in money (the shop's currency); 0 means the weapon is never sold.
 */
export const WEAPON_SPECS = {
  pistol: {
    id: 'pistol', nameKey: 'w_pistol', price: 0, damage: 34, pellets: 1, rpm: 300, auto: false, mag: 12, reserve: 60,
    reloadMs: 1600, perShell: false, spreadBase: 0.4, spreadMax: 1.6, spreadPerShot: 0.35,
    recoil: { x: 1.4, y: 0.5 }, adsSpreadMul: 0.33, switchMs: 300,
    falloff: { full: 22, zero: 65, min: 0.45 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.84, adsMs: 130, noise: 36, tracerEvery: 1, sound: 'pistol',
  },
  rifle: {
    id: 'rifle', nameKey: 'w_rifle', price: 0, damage: 22, pellets: 1, rpm: 700, auto: true, mag: 30, reserve: 180,
    reloadMs: 2300, perShell: false, spreadBase: 0.4, spreadMax: 3.5, spreadPerShot: 0.22,
    recoil: { x: 0.9, y: 0.35 }, adsSpreadMul: 0.4, switchMs: 380,
    falloff: { full: 28, zero: 90, min: 0.6 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.7, adsMs: 200, noise: 46, tracerEvery: 2, sound: 'rifle',
  },
  shotgun: {
    id: 'shotgun', nameKey: 'w_shotgun', price: 1500, damage: 13, pellets: 8, rpm: 75, auto: false, mag: 6, reserve: 36,
    reloadMs: 2800, perShell: true, spreadBase: 4.5, spreadMax: 6.0, spreadPerShot: 0.6,
    recoil: { x: 3.2, y: 1.1 }, adsSpreadMul: 0.6, switchMs: 420,
    falloff: { full: 8, zero: 26, min: 0 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.9, adsMs: 220, noise: 52, tracerEvery: 3, sound: 'shotgun',
  },
  // ---- wave 13: new weapons (rows here, ids appended to WEAPON_ORDER)
  // Fields beyond the ones above (all optional, read through specOf):
  //   moveMul         walking and running speed with this weapon in hand (1 = no change)
  //   spinUpMs        barrels must spin this long before the first shot; spinDownMs to stop again;
  //                   spinMoveMul slows the player further while they spin
  //   noAds           the aim button does not raise the sights (on a spinning weapon it spins the barrels)
  //   scope           aiming looks through a telescopic sight: the HUD draws it and the model is hidden
  //   boltAction      the bolt is worked by hand after every shot (animation only)
  //   flame, range    a stream of fire instead of bullets: rays stop at `range` metres, no tracers,
  //                   holes or casings; the magazine holds fuel units. burn {dps, ms, min} sets bots alight
  //                   for ms, burning dps, when a hit does at least min damage.
  smg: {
    id: 'smg', nameKey: 'w_smg', price: 2000, damage: 17, pellets: 1, rpm: 1000, auto: true, mag: 32, reserve: 192,
    reloadMs: 1900, perShell: false, spreadBase: 0.9, spreadMax: 4.2, spreadPerShot: 0.2,
    recoil: { x: 0.55, y: 0.45 }, adsSpreadMul: 0.55, switchMs: 260,
    falloff: { full: 10, zero: 40, min: 0.35 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.8, adsMs: 140, noise: 40, tracerEvery: 2, sound: 'smg', moveMul: 1.05,
  },
  carbine: {
    id: 'carbine', nameKey: 'w_carbine', price: 3000, damage: 34, pellets: 1, rpm: 520, auto: true, mag: 25, reserve: 125,
    reloadMs: 2600, perShell: false, spreadBase: 0.35, spreadMax: 3.2, spreadPerShot: 0.3,
    recoil: { x: 1.35, y: 0.45 }, adsSpreadMul: 0.32, switchMs: 450,
    falloff: { full: 40, zero: 110, min: 0.7 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.6, adsMs: 240, noise: 50, tracerEvery: 2, sound: 'carbine', moveMul: 0.96,
  },
  sniper: {
    id: 'sniper', nameKey: 'w_sniper', price: 4000, damage: 135, pellets: 1, rpm: 42, auto: false, mag: 5, reserve: 25,
    reloadMs: 3200, perShell: false, spreadBase: 5.0, spreadMax: 7.0, spreadPerShot: 1.5,
    recoil: { x: 5.5, y: 1.0 }, adsSpreadMul: 0.01, switchMs: 550,
    falloff: { full: 90, zero: 180, min: 0.9 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.22, adsMs: 320, noise: 70, tracerEvery: 1, sound: 'sniper', moveMul: 0.94, scope: true, boltAction: true,
  },
  lmg: {
    id: 'lmg', nameKey: 'w_lmg', price: 4500, damage: 26, pellets: 1, rpm: 650, auto: true, mag: 100, reserve: 300,
    reloadMs: 5200, perShell: false, spreadBase: 0.8, spreadMax: 4.5, spreadPerShot: 0.12,
    recoil: { x: 0.8, y: 0.5 }, adsSpreadMul: 0.45, switchMs: 650,
    falloff: { full: 32, zero: 100, min: 0.6 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.72, adsMs: 330, noise: 55, tracerEvery: 3, sound: 'lmg', moveMul: 0.86,
  },
  minigun: {
    id: 'minigun', nameKey: 'w_minigun', price: 7500, damage: 14, pellets: 1, rpm: 1800, auto: true, mag: 300, reserve: 600,
    reloadMs: 6500, perShell: false, spreadBase: 2.2, spreadMax: 4.0, spreadPerShot: 0.05,
    recoil: { x: 0.25, y: 0.35 }, adsSpreadMul: 1, switchMs: 900,
    falloff: { full: 25, zero: 80, min: 0.5 }, headMult: 2.5, legMult: 0.75,
    zoom: 1, adsMs: 400, noise: 60, tracerEvery: 3, sound: 'minigun', moveMul: 0.72,
    spinUpMs: 850, spinDownMs: 1400, spinMoveMul: 0.85, noAds: true,
  },
  flamer: {
    id: 'flamer', nameKey: 'w_flamer', price: 5000, damage: 6, pellets: 3, rpm: 900, auto: true, mag: 100, reserve: 200,
    reloadMs: 3000, perShell: false, spreadBase: 6.0, spreadMax: 8.0, spreadPerShot: 0.1,
    recoil: { x: 0.12, y: 0.15 }, adsSpreadMul: 0.85, switchMs: 500,
    falloff: { full: 3, zero: 10, min: 0 }, headMult: 2.5, legMult: 0.75,
    zoom: 0.95, adsMs: 250, noise: 30, tracerEvery: 0, sound: 'flamer', moveMul: 0.9,
    flame: true, range: 10, burn: { dps: 14, ms: 2000, min: 1 },
  },
};

/** Hand grenades. Wave 13 adds how they fly and explode; the counts and the price are shared. */
export const GRENADE = {
  start: 2,            // carried at the start of a game
  max: 4,              // carrying limit
  price: 300,          // one grenade in the shop
  // ---- wave 13: grenade flight and explosion
  fuseMs: 2500,        // from the throw to the blast
  speed: 15,           // m/s out of the hand, along the view
  lift: 0.22,          // added to the up part of the view direction: a throw arcs upwards
  inherit: 0.5,        // share of the thrower's own velocity the grenade keeps
  gravity: 20,
  radius: 0.05,        // the body, for collisions with the level
  bounce: 0.38,        // share of the speed into a surface that comes back out of it
  slide: 0.72,         // share of the speed along a surface kept at a bounce
  roll: 5,             // rolling friction on a surface, m/s per second
  rest: 0.15,          // slower than this on the ground and it lies still
  throwMs: 650,        // a throw takes this long: the weapon is lowered and cannot fire
  releaseMs: 230,      // the grenade leaves the hand this far into the throw
  reach: 0.3,          // it starts this far in front of the eye (less when a wall is closer)
  handRight: 0.12,     // and from the right hand: this far right of the eye
  handDown: 0.05,      // and this far below it
  blastRadius: 6,      // metres; the barrel blast is 5
  blastDamage: 200,    // in the centre, falling off with the square of the distance; the centre is the grenade itself
};

// ---- wave 13: burning (the flamer sets bots alight)
/** How fire damage reaches a bot: what the flame and the burning pile up is applied every applyMs. */
export const FLAME = { applyMs: 200 };

/**
 * Burn state after a hit of `damage` by a weapon with `burn` at `now` (ms). `burn` may be null.
 * A hit weaker than burn.min (the thin tip of the stream) sets nothing alight. Returns a new object or `burn`.
 */
export function igniteBurn(burn, spec, now, damage = Infinity) {
  const b = spec.burn;
  if (!b || damage < (b.min ?? 0)) return burn;
  const dps = burn && burn.until > now ? Math.max(burn.dps, b.dps) : b.dps;
  return { dps, until: now + b.ms };
}

/** Damage a burn does between two moments (ms). Zero once it has gone out. */
export function burnDamage(burn, from, to) {
  if (!burn) return 0;
  const end = Math.min(to, burn.until);
  return end > from ? (burn.dps * (end - from)) / 1000 : 0;
}

/** Seconds between shots. */
export function fireInterval(spec) { return 60 / spec.rpm; }

/** Largest reserve a weapon can carry. */
export function reserveMax(spec) { return Math.round(spec.reserve * 1.5); }

/** Spread added by moving: grows with the square of the speed fraction. */
export const MOVE_SPREAD_DEG = 1.2;
export const AIR_SPREAD_DEG = 2.0;

/**
 * The one function that decides how wide the cone is. The crosshair and the
 * bullets both use it, so the crosshair never lies.
 * st: {bloom, ads 0..1, speed01 0..1, airborne, crouched}. Returns degrees.
 */
export function effectiveSpread(spec, st) {
  let s = Math.min(spec.spreadBase + (st.bloom || 0), spec.spreadMax);
  const sp = clamp(st.speed01 || 0, 0, 1);
  s += MOVE_SPREAD_DEG * sp * sp;
  if (st.airborne) s += AIR_SPREAD_DEG;
  if (st.crouched) s *= 0.8;
  return s * lerp(1, spec.adsSpreadMul, clamp(st.ads || 0, 0, 1));
}

export function bloomAfterShot(spec, bloom) {
  return Math.min(spec.spreadMax - spec.spreadBase, bloom + spec.spreadPerShot);
}

export function bloomDecay(bloom, dt) { return Math.max(0, bloom - dt * 1.5); }

/** Damage of one projectile at a distance in metres. */
export function damageAtRange(spec, dist) {
  const f = spec.falloff;
  if (!f) return spec.damage;
  return spec.damage * lerp(1, f.min ?? 0, clamp((dist - f.full) / (f.zero - f.full), 0, 1));
}

/** Damage multiplier per hit zone. */
export const ZONE_MULT = { head: 2.5, body: 1, legs: 0.75 };

export function zoneMultiplier(spec, zone) {
  return zone === 'head' ? spec.headMult : zone === 'legs' ? spec.legMult : 1;
}

/** Ammo pickup: one extra magazine per weapon, capped. Mutates and returns whether anything changed. */
export function applyAmmoPickup(weapons) {
  let changed = false;
  for (const w of weapons) {
    const spec = WEAPON_SPECS[w.id], cap = reserveMax(spec);
    if (w.reserve < cap) { w.reserve = Math.min(cap, w.reserve + spec.mag); changed = true; }
  }
  return changed;
}

// --------------------------------------------------------- world and items
export const PICKUP = {
  radius: 1.2,
  ammo: { respawn: 25 },
  health: { heal: 40, respawn: 35 },
};
export const CRATE_HP = 20;
export const BARREL_HP = 30;
export const EXPLOSION = { radius: 5, damage: 120, shielded: 0.25 };

/** Health after taking a medkit; unchanged (used=false) when already full. */
export function applyMedkit(health, max) {
  if (health >= max - 0.5) return { health, used: false };
  return { health: Math.min(max, health + PICKUP.health.heal), used: true };
}

/** Explosion damage: quadratic falloff from the centre to the radius. */
export function explosionDamage(dist, radius = EXPLOSION.radius, max = EXPLOSION.damage) {
  if (dist >= radius) return 0;
  const k = 1 - dist / radius;
  return max * k * k;
}

// ----------------------------------------------------------------- enemies
export const ENEMY_TYPES = {
  grunt: {
    key: 'e_grunt', hp: 100, speed: 3.5, patrol: 1.7, scale: 1.0, dmg: [8, 12], interval: 0.11, burst: [3, 6], pause: [0.5, 1.3],
    acc: 0.58, range: [11, 28], sight: 62, react: [0.35, 0.6], weapon: 'rifle', score: 100, armor: 1, cover: true, magSize: 30,
    uniform: 0x5b5f45, vest: 0x2e3128, helmet: 0x3b4033, skin: 0xc09a7a,
  },
  rusher: {
    key: 'e_rusher', hp: 70, speed: 5.4, patrol: 2.3, scale: 0.97, dmg: [8, 11], interval: 0.3, burst: [1, 3], pause: [0.35, 0.9],
    acc: 0.52, range: [4, 13], sight: 52, react: [0.25, 0.45], weapon: 'pistol', score: 150, armor: 1, cover: false, magSize: 14,
    uniform: 0x2a3140, vest: 0x15181f, helmet: 0x1a1d24, skin: 0xb48a6c,
  },
  heavy: {
    key: 'e_heavy', hp: 240, speed: 2.5, patrol: 1.4, scale: 1.12, dmg: [9, 12], interval: 0.1, burst: [6, 11], pause: [0.9, 1.8],
    acc: 0.5, range: [14, 30], sight: 66, react: [0.45, 0.75], weapon: 'rifle', score: 250, armor: 0.78, cover: true, magSize: 60,
    uniform: 0x4a4038, vest: 0x1c1d1f, helmet: 0x26282b, skin: 0x9c7a60,
  },
};

/** Difficulty tiers: tier 1 is forgiving, tier 3 is the full threat. */
export const TIERS = [
  null,
  { interval: 3.0, acc: 0.7, react: 0.25, burst: 0.6, pause: 1.5, telegraph: 0.32, hp: 1.0, coverWait: [1.8, 3.2] },
  { interval: 1.7, acc: 0.88, react: 0.1, burst: 0.85, pause: 1.15, telegraph: 0.26, hp: 1.0, coverWait: [1.3, 2.4] },
  { interval: 1.0, acc: 1.0, react: 0, burst: 1.0, pause: 1.0, telegraph: 0.2, hp: 1.15, coverWait: [0.9, 1.8] },
];

/** Effective parameters of an enemy type at a difficulty tier. */
export function enemyParams(type, tier) {
  const T = ENEMY_TYPES[type], k = TIERS[clamp(tier, 1, 3)];
  return {
    hp: T.hp * k.hp,
    acc: T.acc * k.acc,
    interval: T.interval * k.interval,
    burst: [Math.max(1, Math.round(T.burst[0] * k.burst)), Math.max(2, Math.round(T.burst[1] * k.burst))],
    pause: [T.pause[0] * k.pause, T.pause[1] * k.pause],
    react: [T.react[0] + k.react, T.react[1] + k.react],
    telegraph: k.telegraph,
    coverWait: k.coverWait,
  };
}

/** Chance that a bot shot hits, from distance, aim time and what the player is doing. */
export function botHitChance(acc, dist, seenTime, { speedFrac = 0, sprinting = false, crouched = false, airborne = false } = {}) {
  const aim = 0.55 + 0.45 * clamp(seenTime / 1.8, 0, 1);
  let move = 1;
  if (speedFrac > 0.15) move = sprinting ? 0.5 : 0.72;
  if (crouched) move *= 0.85;
  if (airborne) move *= 0.7;
  return clamp(acc * (1 - dist / 120) * aim * move, 0.05, 0.9);
}

// -------------------------------------------------------------------- waves
export const MAX_WAVES = 10;
export const MAX_ALIVE = 12;
export const INTERMISSION_SECONDS = 6;

/** Number of bots in wave n: 3 + 2 * (n - 1). */
export function waveCount(n) { return 3 + 2 * (n - 1); }

/** Difficulty tier of wave n. */
export function waveTier(n) { return n <= 3 ? 1 : n <= 6 ? 2 : 3; }

/** Bots fighting at the same time in wave n. */
export function maxAlive(n) { return Math.min(MAX_ALIVE, 4 + n); }

/** Bots of each type in wave n. The counts always sum to waveCount(n). */
export function waveComposition(n) {
  const total = waveCount(n);
  const heavy = n >= 4 ? Math.min(6, Math.round(total * Math.min(0.28, 0.06 + (n - 3) * 0.03))) : 0;
  const rusher = n >= 2 ? Math.round(total * Math.min(0.35, 0.1 + n * 0.025)) : 0;
  return { grunt: total - heavy - rusher, rusher, heavy };
}

/** Points for one kill. */
export function killScore({ base, head = false, streak = 1, source = 'player' }) {
  return base + (head ? 50 : 0) + Math.min(Math.max(streak - 1, 0), 10) * 10 + (source === 'barrel' ? 50 : 0);
}

// ---- wave 12: economy (money, stage reward, shop, upgrades, armour, enemy health growth)


