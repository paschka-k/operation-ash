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

/** Speed the player is allowed to move at. */
export function moveSpeed({ crouched, sprinting, ads, backwards }) {
  let v = crouched ? PLAYER.crouch : sprinting ? PLAYER.sprint : PLAYER.walk;
  if (ads > 0) v = lerp(v, Math.min(v, PLAYER.ads), clamp(ads, 0, 1));
  if (backwards && !crouched) v *= 0.82;
  return v;
}

// ----------------------------------------------------------------- weapons
/** Every weapon in the game, in slot order: slot N is WEAPON_ORDER[N - 1]. */
export const WEAPON_ORDER = ['pistol', 'rifle', 'shotgun'];

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

};

/** Hand grenades. Wave 13 adds how they fly and explode; the counts and the price are shared. */
export const GRENADE = {
  start: 2,            // carried at the start of a game
  max: 4,              // carrying limit
  price: 300,          // one grenade in the shop
  // ---- wave 13: grenade flight and explosion

};

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


