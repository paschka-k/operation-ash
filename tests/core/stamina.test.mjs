// Sprint stamina (R41): 3 s of sprint from full to empty, 0.8 s pause then 4 s to full,
// and no sprint after running dry until the pool is back to 30%.
import { test, assert, near } from '../harness.mjs';
import { createStamina, resetStamina, stepStamina, canSprint } from '../../src/core/stamina.js';
import { STAMINA, enemyMarkerAlpha, MAP_MARKERS } from '../../src/core/rules.js';

const DT = 1 / 120; // the physics step of the game

/** Step until `stop(s, ran)` says so; returns the seconds that passed. */
function runUntil(s, want, stop, limit = 20) {
  let t = 0;
  for (;;) {
    const ran = stepStamina(s, DT, want);
    t += DT;
    if (stop(s, ran) || t > limit) return t;
  }
}

test('the numbers are the agreed ones', () => {
  assert.equal(STAMINA.drainSeconds, 3);
  assert.equal(STAMINA.refillSeconds, 4);
  assert.equal(STAMINA.refillDelay, 0.8);
  assert.equal(STAMINA.unlockAt, 0.3);
});

test('a full pool lasts 3 s of sprint, then the sprint stops', () => {
  const s = createStamina();
  let sprinted = 0;
  while (stepStamina(s, DT, true)) { sprinted += DT; if (sprinted > 10) break; }
  near(sprinted, 3, DT * 1.5, 'seconds of sprint');
  assert.equal(s.value, 0);
  assert.equal(s.locked, true);
  assert.equal(canSprint(s), false);
  assert.equal(stepStamina(s, DT, true), false, 'still held: no sprint');
});

test('from empty the pool waits 0.8 s, then is full after 4 s more', () => {
  const s = createStamina();
  runUntil(s, true, (st) => st.locked);
  let t = 0;
  while (t < 0.8 - DT / 2) { stepStamina(s, DT, false); t += DT; }
  assert.equal(s.value, 0, 'nothing comes back during the pause');
  while (t < 0.8 + 3.9) { stepStamina(s, DT, false); t += DT; }
  assert.ok(s.value < 1 && s.value > 0.95, 'almost full at 4.7 s: ' + s.value);
  const total = t + runUntil(s, false, (st) => st.value >= 1);
  near(total, 4.8, DT * 1.5, 'seconds from empty to full');
});

test('after running dry the sprint comes back only at 30%, even with sprint held', () => {
  const s = createStamina();
  runUntil(s, true, (st) => st.locked);
  // keep asking for the sprint the whole time: it refills because it is refused
  const t = runUntil(s, true, (st, ran) => ran);
  near(t, 0.8 + 0.3 * 4, DT * 2, 'seconds until the sprint is back');
  assert.ok(s.value >= STAMINA.unlockAt - 0.01 && s.value < 0.31);
  assert.equal(s.locked, false);
});

test('letting go before the pool is empty does not lock it', () => {
  const s = createStamina();
  runUntil(s, true, (st) => st.value <= 0.5);
  assert.equal(stepStamina(s, DT, false), false);
  assert.equal(s.locked, false);
  assert.equal(stepStamina(s, DT, true), true, 'the sprint starts again at once');
});

test('a short pause does not refill and a sprint restarts the pause', () => {
  const s = createStamina();
  runUntil(s, true, (st) => st.value <= 0.6);
  const v = s.value;
  for (let t = 0; t < 0.7; t += DT) stepStamina(s, DT, false);
  assert.equal(s.value, v);
  stepStamina(s, DT, true);
  for (let t = 0; t < 0.7; t += DT) stepStamina(s, DT, false);
  assert.ok(s.value < v, 'no refill during the second pause either');
});

test('a big step refills only the part after the pause', () => {
  const s = createStamina();
  s.value = 0.5; s.sinceUse = 0;
  stepStamina(s, 1.0, false);            // 0.8 s pause + 0.2 s of refill
  near(s.value, 0.5 + 0.2 / 4, 1e-9);
});

test('reset gives a full pool', () => {
  const s = createStamina();
  runUntil(s, true, (st) => st.locked);
  resetStamina(s);
  assert.equal(s.value, 1);
  assert.equal(s.locked, false);
  assert.equal(canSprint(s), true);
});

// Enemies on the maps (R43)
test('map markers: only enemies that just fired by default, every living one in the other mode', () => {
  assert.equal(enemyMarkerAlpha('fired', 0), 1);
  assert.ok(enemyMarkerAlpha('fired', 1.1) > 0 && enemyMarkerAlpha('fired', 1.1) < 1, 'fades');
  assert.equal(enemyMarkerAlpha('fired', MAP_MARKERS.firedSeconds + 0.01), 0);
  assert.equal(enemyMarkerAlpha('fired', 1e9), 0, 'never fired');
  assert.equal(enemyMarkerAlpha('all', 1e9), MAP_MARKERS.allAlpha);
  assert.equal(enemyMarkerAlpha('all', 0.5), 1, 'just fired stands out');
  assert.equal(enemyMarkerAlpha(undefined, 1e9), 0, 'unknown mode behaves like the default');
});
