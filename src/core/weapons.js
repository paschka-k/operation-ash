// core/weapons: the state of the arsenal and the rules for firing, reloading and
// switching. Pure and time driven: every function takes `now` in milliseconds,
// so it runs under node without a clock. The caller owns input and effects.
//
//   const a = createArsenal();
//   tickWeapons(a, now);                 // finishes reloads, applies switches, cools spread
//   const r = tryFire(a, now);           // {ok, spreadDeg, pellets, recoil} or {ok:false, reason}
//
// The table of numbers is WEAPON_SPECS (core/rules.js). A new weapon is a new row.

import {
  WEAPON_SPECS, WEAPON_ORDER, effectiveSpread, bloomAfterShot, bloomDecay, fireInterval, reserveMax,
} from './rules.js';
import { clamp } from './math.js';

export { WEAPON_SPECS, WEAPON_ORDER };

/** A fresh arsenal: every weapon full, the assault rifle in hand. */
export function createArsenal(start = 'rifle') {
  const weapons = {};
  for (const id of WEAPON_ORDER) weapons[id] = { mag: WEAPON_SPECS[id].mag, reserve: WEAPON_SPECS[id].reserve };
  return {
    current: start,
    previous: WEAPON_ORDER.find((id) => id !== start),
    weapons,
    nextFireAt: 0,
    reload: null,       // {perShell, endsAt | nextShellAt, startedAt}
    switching: null,    // {to, swapAt, endsAt, swapped}
    bloom: 0,           // degrees added by the last shots, cools down over time
    lastTick: 0,
    stance: { ads: 0, speed01: 0, airborne: false, crouched: false },
    shotsFired: 0,
  };
}

/** Tell the arsenal what the player is doing: it changes how wide the cone is. */
export function setStance(a, patch) { Object.assign(a.stance, patch); }

/** Cone half angle in degrees right now. The crosshair and the bullets both use it. */
export function spreadDeg(a) {
  return effectiveSpread(WEAPON_SPECS[a.current], { bloom: a.bloom, ...a.stance });
}

export function currentWeapon(a) { return a.weapons[a.current]; }

export function totalAmmo(a) {
  let n = 0;
  for (const id of WEAPON_ORDER) n += a.weapons[id].mag + a.weapons[id].reserve;
  return n;
}

/** Reload progress 0..1 for the HUD. */
export function reloadProgress(a, now) {
  if (!a.reload) return 0;
  const spec = WEAPON_SPECS[a.current];
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
  const id = a.current, spec = WEAPON_SPECS[id], w = a.weapons[id];
  if (a.switching) return { ok: false, reason: 'switching' };
  if (now < a.nextFireAt) return { ok: false, reason: 'cooldown' };
  if (a.reload && !(a.reload.perShell && w.mag > 0)) return { ok: false, reason: 'reloading' };
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
  const id = a.current, spec = WEAPON_SPECS[id], w = a.weapons[id];
  if (a.switching || a.reload) return false;
  if (w.mag >= spec.mag || w.reserve <= 0) return false;
  a.reload = spec.perShell
    ? { perShell: true, startedAt: now, nextShellAt: now + 300 }
    : { perShell: false, startedAt: now, endsAt: now + spec.reloadMs };
  return true;
}

/**
 * Start switching to another weapon. The model changes halfway, firing is
 * blocked until the switch ends, and a running reload is lost (on purpose).
 */
export function switchTo(a, id, now) {
  if (!WEAPON_SPECS[id] || id === a.current || a.switching) return false;
  const ms = WEAPON_SPECS[id].switchMs;
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

  if (a.switching) {
    if (!a.switching.swapped && now >= a.switching.swapAt) {
      a.switching.swapped = true;
      a.previous = a.current;
      a.current = a.switching.to;
      a.bloom = 0;
      events.push({ type: 'switched', id: a.current });
    }
    if (now >= a.switching.endsAt) a.switching = null;
  }

  if (a.reload) {
    const id = a.current, spec = WEAPON_SPECS[id], w = a.weapons[id];
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
  const spec = WEAPON_SPECS[id], w = a.weapons[id];
  if (!spec || !w) return false;
  const room = reserveMax(spec) - w.reserve;
  if (room <= 0) return false;
  w.reserve += Math.min(room, Math.round(mags * spec.mag));
  return true;
}

/** An ammo box: one magazine for every weapon. */
export function addAmmoAll(a, mags = 1) {
  let any = false;
  for (const id of WEAPON_ORDER) any = addAmmo(a, id, mags) || any;
  return any;
}

/** Back to the starting loadout (a new game). */
export function resetArsenal(a, start = 'rifle') {
  const fresh = createArsenal(start);
  Object.keys(a).forEach((k) => delete a[k]);
  Object.assign(a, fresh);
}
