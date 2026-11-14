// core/stamina: the sprint stamina pool. Pure; the caller passes the step length in seconds.
//
//   const s = createStamina();
//   const run = stepStamina(s, dt, wantSprint);   // true while the player may sprint this step
//
// The numbers are STAMINA in core/rules.js: 3 s of sprint from full to empty, refill from empty to
// full in 4 s that starts 0.8 s after the last sprint, and after running dry no sprint until 30%.

import { STAMINA } from './rules.js';

const EPS = 1e-9;

/** A full pool. value 0..1, sinceUse seconds since the last sprint, locked after running dry. */
export function createStamina() {
  return { value: 1, sinceUse: 99, locked: false, draining: false };
}

/** Back to a full pool (a new game). */
export function resetStamina(s) { Object.assign(s, createStamina()); }

/** Can a sprint start or go on right now? */
export function canSprint(s) { return !s.locked && s.value > EPS; }

/**
 * Advance the pool by dt seconds. Mutates s. wantSprint: the player asks to sprint (sprint held,
 * moving forward, nothing else forbids it). Returns true when the sprint happens during this step:
 * the pool drains; otherwise it refills after the pause.
 */
export function stepStamina(s, dt, wantSprint) {
  if (wantSprint && canSprint(s)) {
    s.value = Math.max(0, s.value - dt / STAMINA.drainSeconds);
    s.sinceUse = 0;
    s.draining = true;
    if (s.value <= EPS) { s.value = 0; s.locked = true; }
    return true;
  }
  s.draining = false;
  const before = s.sinceUse;
  s.sinceUse = before + dt;
  // only the part of this step that lies after the pause refills
  const refill = Math.max(0, s.sinceUse - Math.max(before, STAMINA.refillDelay));
  if (refill > 0 && s.value < 1) s.value = Math.min(1, s.value + refill / STAMINA.refillSeconds);
  if (s.value > 1 - EPS) s.value = 1;
  if (s.locked && s.value >= STAMINA.unlockAt - EPS) s.locked = false;
  return false;
}
