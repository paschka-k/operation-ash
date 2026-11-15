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
/**
 * Sprint spends a pool of stamina (0..1, see core/stamina.js). A full pool lasts drainSeconds of
 * sprinting; refillDelay seconds after the last sprint it refills from empty to full in
 * refillSeconds. Run dry and sprint stays locked until the pool is back to unlockAt.
 */
export const STAMINA = { drainSeconds: 3, refillSeconds: 4, refillDelay: 0.8, unlockAt: 0.3 };

/** Enemies on the radar and the big map. 'fired' shows only those that shot within firedSeconds. */
export const MAP_MARKERS = { firedSeconds: 2.2, fadeMin: 0.2, allAlpha: 0.75 };

/**
 * Opacity of an enemy marker on the maps, 0 meaning not shown. mode is settings.radarEnemies:
 * 'fired' (default) shows an enemy for a moment after it fired, fading; 'all' shows every living
 * enemy, the ones that just fired at full strength.
 */
export function enemyMarkerAlpha(mode, sinceFired) {
  const fresh = sinceFired >= 0 && sinceFired <= MAP_MARKERS.firedSeconds;
  if (mode === 'all') return fresh ? 1 : MAP_MARKERS.allAlpha;
  return fresh ? Math.max(MAP_MARKERS.fadeMin, 1 - sinceFired / MAP_MARKERS.firedSeconds) : 0;
}

/**
 * Gamepad feel (core/gamepad.js). Dead zones are radial, on the stick deflection 0..1; the curve
 * is the exponent of the response after the dead zone (1 linear, 2 finer near the centre).
 * Look speeds are radians per second at full deflection with settings.padSens = 1.
 */
export const GAMEPAD = {
  moveDeadzone: 0.16, lookDeadzone: 0.12, outerDeadzone: 0.95,
  moveCurve: 1, lookCurve: 1.8,
  lookYaw: 3.4, lookPitch: 2.3,
  triggerOn: 0.35, triggerOff: 0.2,       // trigger hysteresis on the analog value
  sprintKeep: 0.35,                       // the L3 sprint holds while the stick pushes forward this much
  navOn: 0.5, navOff: 0.3,                // menu navigation with the left stick
  navDelay: 0.38, navRepeat: 0.12,        // a held direction repeats after navDelay, then every navRepeat
  activeDeflection: 0.5,                  // a stick counts as "the player uses the pad" from here (after the dead zone)
};

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
export const START_WEAPONS = ['pistol', 'rifle'];

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

/** Damage multiplier per hit zone. A vehicle (wave 14) is one zone of its own. */
export const ZONE_MULT = { head: 2.5, body: 1, legs: 0.75, vehicle: 1 };

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
  // ---- wave 14: riders and bosses. Fields beyond the ones above:
  //   vehicle       what the bot rides in on (a key of VEHICLES); shot off it, it fights on foot as this type
  //   mountedAcc    multiplies acc while it shoots from the moving vehicle
  //   boss          a boss: announced, its health bar on top of the screen
  //   grenadeEvery  seconds between grenades (core/boss.js)
  // The skater's 'smg' is held like the pistol.
  scooterRider: {
    key: 'e_scooterRider', hp: 75, speed: 4.4, patrol: 2.1, scale: 0.97, dmg: [8, 11], interval: 0.3, burst: [1, 3], pause: [0.4, 1.0],
    acc: 0.52, range: [5, 15], sight: 56, react: [0.3, 0.5], weapon: 'pistol', score: 150, armor: 1, cover: false, magSize: 14,
    uniform: 0x3a4a5c, vest: 0x1d2229, helmet: 0x22262c, skin: 0xb08868,
    vehicle: 'scooter', mountedAcc: 0.55,
  },
  skater: {
    key: 'e_skater', hp: 80, speed: 4.6, patrol: 2.2, scale: 0.96, dmg: [8, 10], interval: 0.085, burst: [3, 7], pause: [0.5, 1.2],
    acc: 0.48, range: [6, 18], sight: 56, react: [0.3, 0.5], weapon: 'smg', score: 175, armor: 1, cover: false, magSize: 30,
    uniform: 0x5c4a3a, vest: 0x2a2622, helmet: 0x2f2a26, skin: 0xa4805f,
    vehicle: 'skate', mountedAcc: 0.5,
  },
  biker: {
    key: 'e_biker', hp: 110, speed: 3.8, patrol: 1.8, scale: 1.0, dmg: [9, 12], interval: 0.11, burst: [3, 6], pause: [0.6, 1.4],
    acc: 0.55, range: [10, 26], sight: 62, react: [0.35, 0.6], weapon: 'rifle', score: 225, armor: 0.9, cover: true, magSize: 30,
    uniform: 0x2b2b2b, vest: 0x141414, helmet: 0x3a1f1a, skin: 0xb3906f,
    vehicle: 'moto', mountedAcc: 0.45,
  },
  bossBiker: {
    key: 'e_bossBiker', hp: 500, speed: 3.4, patrol: 1.8, scale: 1.2, dmg: [10, 12], interval: 0.1, burst: [5, 9], pause: [0.6, 1.3],
    acc: 0.58, range: [10, 26], sight: 70, react: [0.25, 0.45], weapon: 'rifle', score: 1500, armor: 0.65, cover: true, magSize: 40,
    uniform: 0x1f1f22, vest: 0x0d0d0f, helmet: 0x6a1a14, skin: 0xa07a5c,
    vehicle: 'heavyMoto', mountedAcc: 0.5, boss: true,
  },
  bossCommander: {
    key: 'e_bossCommander', hp: 800, speed: 2.2, patrol: 1.3, scale: 1.28, dmg: [10, 12], interval: 0.09, burst: [12, 20], pause: [1.0, 1.8],
    acc: 0.52, range: [12, 30], sight: 72, react: [0.35, 0.6], weapon: 'rifle', score: 2000, armor: 0.6, cover: true, magSize: 120,
    uniform: 0x3f4636, vest: 0x22251d, helmet: 0x2a2d24, skin: 0x9c7a60,
    boss: true, grenadeEvery: 7,
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
/**
 * Money is a wallet of its own: a kill pays as much money as it gives points (killScore),
 * a cleared wave pays a stage reward that grows with the wave number, with bonuses for
 * headshots and for a wave without a scratch. Spending never touches the score.
 */
export const ECONOMY = {
  rewardBase: 300,         // stage reward of wave n: rewardBase + rewardPerWave * n
  rewardPerWave: 150,
  headshotBonus: 25,       // per headshot in the wave, on top of the kill money
  flawlessShare: 0.5,      // a wave without any damage taken: half the stage reward again
  shopDelayMs: 1800,       // from "wave cleared" to the shop: a moment to see the last bot fall
  countdownMs: 3000,       // from leaving the shop to the next wave
  reviveIntroMs: 3500,     // from a revival to the restart of the wave the player died in
};

/** Stage reward for clearing wave n. Keeps growing in the endless mode. */
export function stageReward(n) { return ECONOMY.rewardBase + ECONOMY.rewardPerWave * Math.max(1, n); }

/**
 * What a cleared wave earned. killMoney was already paid kill by kill and is listed for the
 * breakdown; `paid` is what the wave clear adds now, `total` everything the wave earned.
 */
export function stageBreakdown(n, { killMoney = 0, headshots = 0, damaged = true } = {}) {
  const reward = stageReward(n);
  const heads = headshots * ECONOMY.headshotBonus;
  const flawless = damaged ? 0 : Math.round(reward * ECONOMY.flawlessShare);
  const paid = reward + heads + flawless;
  return { wave: n, kills: killMoney, reward, headshots: heads, flawless, paid, total: killMoney + paid };
}

/** Enemy health multiplier of wave n: 1 at wave 1, +6% per wave, no ceiling (endless mode). */
export function waveHpMult(n) { return 1 + 0.06 * (Math.max(1, n) - 1); }

/**
 * Weapon upgrades, levels 0..3. A level makes the weapon hit harder, hold more rounds,
 * reload faster and kick less. Costs follow the shop price of the weapon, or freeBase for
 * the weapons a game starts with (price 0).
 */
export const UPGRADE = {
  maxLevel: 3,
  freeBase: 1000,
  costShare: [0.4, 0.7, 1.1],   // cost of level 1, 2, 3 as a share of the base
  damage: 0.12,                 // per level, multiplies damage
  mag: 0.15,                    // per level, multiplies the magazine (at least one round per level)
  reload: 0.1,                  // per level, shortens the reload
  recoil: 0.08,                 // per level, softens the kick
};

const round50 = (x) => Math.max(50, Math.round(x / 50) * 50);

/** Price of taking a weapon from level - 1 to `level` (1..3). */
export function upgradeCost(spec, level) {
  const share = UPGRADE.costShare[clamp(level, 1, UPGRADE.maxLevel) - 1];
  return round50((spec.price > 0 ? spec.price : UPGRADE.freeBase) * share);
}

/**
 * The numbers of a weapon at an upgrade level. Copies the row and changes only the fields every
 * weapon has (damage, mag, reserve, reloadMs, recoil), so rows with extra fields keep them.
 * Level 0 returns the row itself.
 */
export function upgradedSpec(spec, level) {
  const L = clamp(Math.round(level || 0), 0, UPGRADE.maxLevel);
  if (L === 0) return spec;
  const out = { ...spec, level: L };
  if (Number.isFinite(spec.damage)) out.damage = Math.round(spec.damage * (1 + UPGRADE.damage * L) * 10) / 10;
  if (Number.isFinite(spec.mag)) {
    out.mag = Math.max(spec.mag + L, Math.round(spec.mag * (1 + UPGRADE.mag * L)));
    if (Number.isFinite(spec.reserve)) out.reserve = Math.round(spec.reserve * out.mag / spec.mag);
  }
  if (Number.isFinite(spec.reloadMs)) out.reloadMs = Math.round(spec.reloadMs * (1 - UPGRADE.reload * L));
  if (spec.recoil) out.recoil = { ...spec.recoil, x: spec.recoil.x * (1 - UPGRADE.recoil * L), y: spec.recoil.y * (1 - UPGRADE.recoil * L) };
  return out;
}

/**
 * Body armour. A level sets the armour points; while there are points left the armour takes
 * `absorb` of every hit. It is refilled for free at every visit to the shop.
 */
export const ARMOR = {
  points: [0, 50, 100, 150],    // armour points at level 0..3
  prices: [0, 800, 1200, 1800], // price of reaching level 1, 2, 3
  absorb: 0.6,
};

/** Split a hit between armour and health. Returns {armor (left), health (damage to health), absorbed}. */
export function absorbDamage(armor, amount) {
  const absorbed = Math.min(Math.max(0, armor), Math.max(0, amount) * ARMOR.absorb);
  return { armor: Math.max(0, armor - absorbed), health: Math.max(0, amount - absorbed), absorbed };
}

// ---- wave 14: vehicles and bosses
/**
 * What the riders ride. Speeds are m/s, accel and brake m/s², sizes metres (length along the heading,
 * width across it, height of the vehicle itself). armor multiplies the damage the vehicle takes, hp is
 * its own health (the rider keeps his). stance is the rider's pose: 'stand' on a scooter's deck, 'skate'
 * sideways on a board, 'seat' on a motorbike.
 *
 * seatY: how high the rider's body frame sits above the ground under the vehicle, so the game layer puts
 * the rider at core.y = ride.y + seatY. The body frame is the point under a standing soldier's feet, the
 * one the hit zones (core/combat) and the eye height (core/ai) are measured from. On a deck it is the
 * deck. On a seat the pose keeps the hip bone at its standing height (0.93 × the rider's scale above the
 * frame), so the pelvis rests on the seat and the head and chest stay inside their hit zones: seatY is the
 * seat height minus 0.93 × scale, below zero for a motorbike. The heavy motorbike carries the boss
 * (scale of bossBiker).
 *
 * ramSpeed: from this speed a touch knocks the player down (Infinity: never), ramDamage once per
 * ramCooldown seconds. A vehicle with a finite ramSpeed does not brake for the player in its lane: it
 * goes for him at ramSpeed at least, runs him down and rides on (core/ride stepRide); the others stop
 * for him. wreckSecs: a wreck lies in the street this long (or until the wave is cleared).
 * score: points and money for shooting the vehicle out from under its rider.
 */
export const VEHICLES = {
  scooter: {
    hp: 50, armor: 1, speed: 7, accel: 3, brake: 6, length: 1.15, width: 0.5, height: 1.15, seatY: 0.16, stance: 'stand',
    ramSpeed: Infinity, ramDamage: 0, ramCooldown: 3, wreckSecs: 20, score: 75,
  },
  skate: {
    hp: 35, armor: 1, speed: 5, accel: 2.2, brake: 4, length: 0.82, width: 0.24, height: 0.12, seatY: 0.11, stance: 'skate',
    ramSpeed: Infinity, ramDamage: 0, ramCooldown: 3, wreckSecs: 20, score: 50,
  },
  moto: {
    hp: 140, armor: 0.8, speed: 11, accel: 5, brake: 8, length: 2.05, width: 0.8, height: 1.15, seatY: -0.1, stance: 'seat',
    ramSpeed: 5, ramDamage: 35, ramCooldown: 3, wreckSecs: 20, score: 125,
  },
  heavyMoto: {
    hp: 320, armor: 0.6, speed: 9.5, accel: 4, brake: 7, length: 2.4, width: 0.95, height: 1.3, seatY: -0.25, stance: 'seat',
    ramSpeed: 4, ramDamage: 50, ramCooldown: 3.5, wreckSecs: 20, score: 300,
  },
};

/**
 * How a vehicle drives its loop (core/ride.js).
 *   grip          m/s² of sideways pull a vehicle holds in a turn: the speed in a turn of radius r is sqrt(grip × r)
 *   substep       metres: a move is cut into steps no longer than this
 *   gap           metres kept between a vehicle's nose and a blocker it stops for
 *   lane          metres added to half the vehicle's width and the blocker's radius: closer to the loop, it is in the way
 *   stuckSpeed    m/s: held by a blocker and slower than this, the vehicle counts as blocked
 *   dismountSecs  blocked this long, the rider gets off and fights on foot
 *   touch         metres of slack in the ram test
 *   knockShare    the player is thrown at this share of the vehicle's speed, at most knockMax m/s
 *   crashFriction m/s² a wreck slows down with while it slides along its lane
 *   crashDrift    metres a wreck slides sideways out of the middle of its lane, at most
 *   fallSecs      a wreck lies on its side after this long
 *   aimCone       radians either side of the heading a rider can shoot to
 *   maxLean       radians a vehicle leans into a turn, at most
 *   reloadSecs    seconds a rider takes to reload on the move
 *   dismountReact seconds before a rider who just got onto his feet reacts: thrown off a vehicle shot out
 *                 from under him, or stepping off one held up by a blocker
 *   thrownFlinch  seconds a rider thrown off his vehicle staggers
 */
export const RIDE = {
  grip: 5, substep: 0.25, gap: 0.1, lane: 0.15, stuckSpeed: 0.5, dismountSecs: 3, touch: 0.15,
  knockShare: 0.7, knockMax: 9, crashFriction: 6, crashDrift: 0.4, fallSecs: 0.6, aimCone: 1.9, maxLean: 0.55,
  reloadSecs: 1.8, dismountReact: { thrown: 0.7, held: 0.3 }, thrownFlinch: 0.5,
};

/**
 * The commander's habits (core/boss.js). He throws a grenade at the player he sees between grenadeMin
 * and grenadeMax metres away, at most once per T.grenadeEvery seconds. A boss that has stayed within
 * standRadius metres of one spot for standSecs goes after the player, and for pushSecs he fights in the
 * open instead of waiting in cover. His grenade is lobbed at the spot (core/grenade launchGrenadeAt):
 * its flight to the first touch of the ground takes base + perMetre × distance seconds, within min..max.
 */
export const BOSS = {
  grenadeMin: 6, grenadeMax: 18, standSecs: 4, standRadius: 0.6, pushSecs: 3,
  throwTime: { base: 0.5, perMetre: 1 / 15, min: 0.8, max: 1.7 },
};

/**
 * The first wave of each kind of rider, one new kind a wave in the order of the brief: scooters, skates,
 * motorbikes. The bikers' own wave is 7, but the gang leader of wave 5 (bossForWave) brings two of them as
 * his guard, so a game meets them there, right after the skaters of wave 4. The endless mode has all of them.
 */
export const firstRiderWave = { scooterRider: 3, skater: 4, biker: 7 };

/**
 * How many riders a wave brings: a share of its bots, at least one once riders exist, at most max.
 * The gang leader (bossBiker) brings `guards` bikers on top. Riders and the boss are part of
 * waveCount(n): they take the places of grunts and of a heavy.
 */
export const RIDER_RULES = { share: 0.2, max: 6, guards: 2 };

/**
 * Where riders enter (core/riderlogic pickRiderSpawn). minDist: metres from the player at least; step:
 * metres between the points of a loop looked at; gap: metres along a loop kept from any vehicle or wreck
 * already on it.
 */
export const RIDER_SPAWN = { minDist: 25, step: 2, gap: 12 };

/** A rider on his vehicle is loud: the maps show him at this opacity at least (see MAP_MARKERS). */
export const RIDER_MARKER = { mounted: 0.85 };

/** The boss of wave n, or null: every fifth wave, the gang leader and the commander in turn. */
export function bossForWave(n) {
  if (!(n > 0) || n % 5 !== 0) return null;
  return (n / 5) % 2 === 1 ? 'bossBiker' : 'bossCommander';
}

/** Riders on vehicles at the same time: 3, 4 in the endless mode (waves past MAX_WAVES). */
export function maxRiders(n, endless = false) { return endless || n > MAX_WAVES ? 4 : 3; }

/**
 * The full roster of wave n: {type: count} over grunt, rusher, heavy, the riders and the boss. It sums
 * to waveCount(n): the riders are cut out of the grunts, the boss out of the heavies, and the rushers of
 * waveComposition(n) stay as they are. The newest kind of rider comes first, so a kind is there in the
 * wave it unlocks.
 */
export function waveRoster(n, endless = false) {
  const base = waveComposition(n);
  const roster = { grunt: base.grunt, rusher: base.rusher, heavy: base.heavy };
  const boss = bossForWave(n);
  if (boss) {
    roster[boss] = 1;
    if (roster.heavy > 0) roster.heavy--; else roster.grunt--;
  }
  const kinds = Object.keys(firstRiderWave)
    .filter((k) => endless || n >= firstRiderWave[k])
    .sort((a, b) => firstRiderWave[b] - firstRiderWave[a]);
  const guards = boss === 'bossBiker' ? Math.min(RIDER_RULES.guards, Math.max(0, roster.grunt - 1)) : 0;
  let riders = kinds.length ? clamp(Math.round(waveCount(n) * RIDER_RULES.share), 1, RIDER_RULES.max) : 0;
  if (endless) riders = Math.max(riders, kinds.length);
  riders = Math.max(0, Math.min(riders, roster.grunt - guards - 1));   // a few grunts always stay
  for (let i = 0; i < riders; i++) {
    const k = kinds[i % kinds.length];
    roster[k] = (roster[k] || 0) + 1;
  }
  if (guards) roster.biker = (roster.biker || 0) + guards;
  roster.grunt -= riders + guards;
  return roster;
}


