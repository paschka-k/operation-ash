// core/weapons: the state of the arsenal and the rules for firing, reloading and
// switching. Pure and time driven: every function takes `now` in milliseconds,
// so it runs under node without a clock. The caller owns input and effects.
//
//   const a = createArsenal();
//   tickWeapons(a, now);                 // finishes reloads, applies switches, cools spread
//   const r = tryFire(a, now);           // {ok, spreadDeg, pellets, recoil} or {ok:false, reason}
//
// The table of numbers is WEAPON_SPECS (core/rules.js). A new weapon is a new row.
// The player owns some of the weapons (a.owned, in slot order); the rest are bought in the shop.
// Every rule reads a weapon's numbers through specOf(a, id), so upgrades can change them per game.

import {
  WEAPON_SPECS, WEAPON_ORDER, START_WEAPONS, GRENADE, effectiveSpread, bloomAfterShot, bloomDecay, fireInterval, reserveMax,
} from './rules.js';
import { UPGRADE, upgradedSpec } from './rules.js';
import { clamp } from './math.js';

export { WEAPON_SPECS, WEAPON_ORDER, START_WEAPONS };

const sortBySlot = (ids) => WEAPON_ORDER.filter((id) => ids.includes(id));

/**
 * A fresh arsenal with full ammunition. `owned` lists the weapons the player has (all of them
 * by default, which is what the tests use); the game passes START_WEAPONS.
 */
export function createArsenal(start = 'rifle', owned = WEAPON_ORDER) {
  const list = sortBySlot(owned.includes(start) ? owned : [...owned, start]);
  const weapons = {};
  for (const id of list) weapons[id] = { mag: WEAPON_SPECS[id].mag, reserve: WEAPON_SPECS[id].reserve };
  return {
    current: start,
    previous: list.find((id) => id !== start) || null,
    owned: list,
    weapons,
    specs: {},          // id -> spec with upgrades applied; missing means the plain row of WEAPON_SPECS
    levels: {},         // id -> upgrade level 1..3; missing means level 0
    grenades: GRENADE.start,
    nextFireAt: 0,
    reload: null,       // {perShell, endsAt | nextShellAt, startedAt}
    switching: null,    // {to, swapAt, endsAt, swapped}
    bloom: 0,           // degrees added by the last shots, cools down over time
    lastTick: 0,
    stance: { ads: 0, speed01: 0, airborne: false, crouched: false },
    shotsFired: 0,
  };
}

/** The numbers of a weapon in this arsenal: its row of WEAPON_SPECS, with upgrades if any. */
export function specOf(a, id = a.current) { return a.specs[id] || WEAPON_SPECS[id]; }

/** Does the player have this weapon? */
export function owns(a, id) { return !!a.weapons[id]; }

/** Add a weapon with full ammunition. Returns false if it is unknown or already owned. */
export function giveWeapon(a, id) {
  if (!WEAPON_SPECS[id] || owns(a, id)) return false;
  const spec = specOf(a, id);
  a.weapons[id] = { mag: spec.mag, reserve: spec.reserve };
  a.owned = sortBySlot([...a.owned, id]);
  if (!a.previous) a.previous = id;
  return true;
}

/** Owned weapon `step` places away from the current one in slot order (wheel, gamepad). */
export function cycleWeapon(a, step) {
  const list = a.owned, i = list.indexOf(a.current);
  if (list.length < 2) return a.current;
  return list[(i + step + list.length * 4) % list.length];
}

/** Tell the arsenal what the player is doing: it changes how wide the cone is. */
export function setStance(a, patch) { Object.assign(a.stance, patch); }

/** Cone half angle in degrees right now. The crosshair and the bullets both use it. */
export function spreadDeg(a) {
  return effectiveSpread(specOf(a), { bloom: a.bloom, ...a.stance });
}

export function currentWeapon(a) { return a.weapons[a.current]; }

export function totalAmmo(a) {
  let n = 0;
  for (const id of a.owned) n += a.weapons[id].mag + a.weapons[id].reserve;
  return n;
}

/** Reload progress 0..1 for the HUD. */
export function reloadProgress(a, now) {
  if (!a.reload) return 0;
  const spec = specOf(a);
  if (a.reload.perShell) return a.weapons[a.current].mag / spec.mag;
  return clamp(1 - (a.reload.endsAt - now) / spec.reloadMs, 0, 1);
}

/**
 * Pull the trigger. On success one round (or one shell) is spent and the result
 * says how wide the cone was for this shot and how many projectiles to fire.
 * Failure reasons: switching, cooldown, reloading, empty.
 * An empty magazine clicks and starts a reload by itself if there is a reserve.
 */
export function tryFire(a, now) {
  const id = a.current, spec = specOf(a, id), w = a.weapons[id];
  if (a.switching) return { ok: false, reason: 'switching' };
  if (now < a.nextFireAt) return { ok: false, reason: 'cooldown' };
  if (a.reload && !(a.reload.perShell && w.mag > 0)) return { ok: false, reason: 'reloading' };
  if (spec.spinUpMs && (a.spin || 0) < 1) return { ok: false, reason: 'spinning' };
  if (w.mag <= 0) return { ok: false, reason: 'empty', reloading: beginReload(a, now) };
  if (a.reload) a.reload = null;                  // firing interrupts shell loading

  const spread = spreadDeg(a);                    // the cone the crosshair was showing
  w.mag--;
  a.shotsFired++;
  a.bloom = bloomAfterShot(spec, a.bloom);
  const interval = fireInterval(spec) * 1000;
  a.nextFireAt = now - a.nextFireAt > interval ? now + interval : a.nextFireAt + interval;
  return {
    ok: true, id, spec, spreadDeg: spread, pellets: spec.pellets,
    recoil: { x: spec.recoil.x, y: spec.recoil.y },
  };
}

/** Start a reload. Returns true if one started. */
export function beginReload(a, now) {
  const id = a.current, spec = specOf(a, id), w = a.weapons[id];
  if (a.switching || a.reload) return false;
  if (w.mag >= spec.mag || w.reserve <= 0) return false;
  a.reload = spec.perShell
    ? { perShell: true, startedAt: now, nextShellAt: now + 300 }
    : { perShell: false, startedAt: now, endsAt: now + spec.reloadMs };
  return true;
}

/**
 * Start switching to another owned weapon. The model changes halfway, firing is
 * blocked until the switch ends, and a running reload is lost (on purpose).
 */
export function switchTo(a, id, now) {
  if (!WEAPON_SPECS[id] || !owns(a, id) || id === a.current || a.switching) return false;
  const ms = specOf(a, id).switchMs;
  a.reload = null;
  a.switching = { to: id, startedAt: now, swapAt: now + ms / 2, endsAt: now + ms, swapped: false };
  return true;
}

/**
 * Advance time. Returns events: switched, shell, reloadDone.
 * Call it every frame before tryFire.
 */
export function tickWeapons(a, now) {
  const events = [];
  const dt = clamp((now - a.lastTick) / 1000, 0, 0.1);
  a.lastTick = now;
  a.bloom = bloomDecay(a.bloom, dt);
  spinBarrels(a, dt, events);

  if (a.switching) {
    if (!a.switching.swapped && now >= a.switching.swapAt) {
      a.switching.swapped = true;
      a.previous = a.current;
      a.current = a.switching.to;
      a.bloom = 0;
      a.spin = 0;
      events.push({ type: 'switched', id: a.current });
    }
    if (now >= a.switching.endsAt) a.switching = null;
  }

  if (a.reload) {
    const id = a.current, spec = specOf(a, id), w = a.weapons[id];
    if (a.reload.perShell) {
      if (now >= a.reload.nextShellAt) {
        if (w.mag < spec.mag && w.reserve > 0) {
          w.mag++; w.reserve--;
          events.push({ type: 'shell', id });
          a.reload.nextShellAt = now + spec.reloadMs / spec.mag;
        }
        if (w.mag >= spec.mag || w.reserve <= 0) { a.reload = null; events.push({ type: 'reloadDone', id, pump: true }); }
      }
    } else if (now >= a.reload.endsAt) {
      const take = Math.min(spec.mag - w.mag, w.reserve);
      w.mag += take; w.reserve -= take;
      a.reload = null;
      events.push({ type: 'reloadDone', id });
    }
  }
  return events;
}

/** Give magazines to one weapon, up to its carrying limit. Returns true if anything was added. */
export function addAmmo(a, id, mags = 1) {
  const w = a.weapons[id];
  if (!WEAPON_SPECS[id] || !w) return false;
  const spec = specOf(a, id);
  const room = reserveMax(spec) - w.reserve;
  if (room <= 0) return false;
  w.reserve += Math.min(room, Math.round(mags * spec.mag));
  return true;
}

/** An ammo box: one magazine for every owned weapon. */
export function addAmmoAll(a, mags = 1) {
  let any = false;
  for (const id of a.owned) any = addAmmo(a, id, mags) || any;
  return any;
}

/** Add grenades up to the carrying limit. Returns how many were added. */
export function addGrenades(a, n = 1) {
  const add = Math.max(0, Math.min(n, GRENADE.max - a.grenades));
  a.grenades += add;
  return add;
}

/** Take one grenade to throw. Returns false when there is none. */
export function takeGrenade(a) {
  if (a.grenades <= 0) return false;
  a.grenades--;
  return true;
}

/** Back to the starting loadout (a new game). */
export function resetArsenal(a, start = 'rifle', owned = WEAPON_ORDER) {
  const fresh = createArsenal(start, owned);
  Object.keys(a).forEach((k) => delete a[k]);
  Object.assign(a, fresh);
}

// ---- wave 12: upgrades, the shop refill and the checkpoint for revivals

/** Upgrade level of a weapon, 0..UPGRADE.maxLevel. */
export function weaponLevel(a, id) { return (a.levels && a.levels[id]) || 0; }

/**
 * Put a weapon on an upgrade level: a.levels[id] and a.specs[id] (upgradedSpec of its row).
 * The rounds a bigger magazine gains are added to the magazine. Returns false for an unknown id.
 */
export function setWeaponLevel(a, id, level) {
  if (!WEAPON_SPECS[id]) return false;
  if (!a.levels) a.levels = {};
  const L = clamp(Math.round(level), 0, UPGRADE.maxLevel);
  const before = specOf(a, id);
  if (L === 0) { delete a.levels[id]; delete a.specs[id]; } else { a.levels[id] = L; a.specs[id] = upgradedSpec(WEAPON_SPECS[id], L); }
  const after = specOf(a, id), w = a.weapons[id];
  if (w) w.mag = clamp(w.mag + after.mag - before.mag, 0, after.mag);
  return true;
}

/** The shop refill: a full magazine and at least the starting reserve for every owned weapon. True if anything changed. */
export function refillArsenal(a) {
  let any = false;
  for (const id of a.owned) {
    const spec = specOf(a, id), w = a.weapons[id];
    if (w.mag < spec.mag) { w.mag = spec.mag; any = true; }
    if (w.reserve < spec.reserve) { w.reserve = spec.reserve; any = true; }
  }
  return any;
}

// what changes from moment to moment and is not part of a checkpoint (spin and trigger: the minigun's barrels)
const TRANSIENT = ['reload', 'switching', 'nextFireAt', 'lastTick', 'bloom', 'stance', 'shotsFired', 'spin', 'trigger'];
const clone = (v) => (Array.isArray(v) ? v.map(clone)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);

/** A deep copy of what the player carries (weapons, ammo, levels, grenades, the weapon in hand). */
export function snapshotArsenal(a) {
  const out = {};
  for (const [k, v] of Object.entries(a)) if (!TRANSIENT.includes(k)) out[k] = clone(v);
  return out;
}

/** Back to a snapshot. Reloads, switches and turning barrels are dropped, the clock (lastTick) keeps running. */
export function restoreArsenal(a, snap) {
  for (const [k, v] of Object.entries(snap)) if (!TRANSIENT.includes(k)) a[k] = clone(v);
  a.reload = null;
  a.switching = null;
  a.nextFireAt = 0;
  a.bloom = 0;
  a.spin = 0;
  a.trigger = false;
}

// ---- wave 13: spinning barrels and the weight of a weapon
// A weapon with spinUpMs (the minigun) fires only once its barrels turn at full speed. They spin up
// while the trigger is held (setTrigger) and run down when it is let go. a.spin is 0..1; a missing
// a.spin means 0, so arsenals made before this existed need nothing.

/** Tell the arsenal whether the trigger (or a spin button) is held. Call it before tickWeapons. */
export function setTrigger(a, held) { a.trigger = !!held; }

/** How fast the barrels turn, 0..1. */
export function spinLevel(a) { return a.spin || 0; }

/** Advance the barrels by dt seconds (tickWeapons calls it). Pushes 'spunUp' and 'spunDown' events. */
function spinBarrels(a, dt, events) {
  const spec = specOf(a), before = a.spin || 0;
  if (!spec.spinUpMs) { a.spin = 0; return; }
  const up = a.trigger && !a.switching;
  const rate = up ? 1000 / spec.spinUpMs : -1000 / (spec.spinDownMs || spec.spinUpMs);
  a.spin = clamp(before + rate * dt, 0, 1);
  if (before < 1 && a.spin >= 1) events.push({ type: 'spunUp', id: a.current });
  else if (before > 0 && a.spin <= 0) events.push({ type: 'spunDown', id: a.current });
}

/** Multiplier of the player's speed for the weapon in hand: heavy weapons slow you down, spinning barrels more. */
export function weaponMoveMul(a) {
  const spec = specOf(a);
  const spinning = spec.spinMoveMul ? 1 + (spec.spinMoveMul - 1) * spinLevel(a) : 1;
  return (spec.moveMul ?? 1) * spinning;
}
