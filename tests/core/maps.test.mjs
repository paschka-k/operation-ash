// Wave 15: ten maps, one per wave; the map of the next wave is picked in the shop after wave 5 and in
// the endless mode; the checkpoint remembers the map, so a revival fights on the map of the wave of death.
import { test, assert } from '../harness.mjs';
import {
  MAP_IDS, MAPS, MAP_CHOICE_FROM_WAVE, defaultMapFor, mapChoiceOpen, chooseMap,
} from '../../src/core/maps.js';
import * as rules from '../../src/core/rules.js';
import {
  createGame, restart, tickGame, enemyKilled, damagePlayer, leaveShop, continueEndless, reviveAtCheckpoint,
} from '../../src/core/waves.js';

function advance(g, seconds, clock) {
  const events = [];
  for (let i = 0, n = Math.round(seconds / 0.05); i < n; i++) { clock.now += 50; events.push(...tickGame(g, 0.05, clock.now)); }
  return events;
}
/** Play the current wave to its end; with `dieAfter` kills the player dies instead. */
function playWave(g, clock, dieAfter = Infinity) {
  const due = [];
  let killed = 0;
  for (let i = 0; i < 6000; i++) {
    clock.now += 50;
    const ev = tickGame(g, 0.05, clock.now);
    for (const e of ev) if (e.type === 'spawn') due.push(clock.now + 500);
    while (due.length && due[0] <= clock.now) {
      due.shift();
      if (killed >= dieAfter) { damagePlayer(g, 1000, clock.now); return; }
      enemyKilled(g, { base: 100 }, clock.now);
      killed++;
    }
    if (ev.some((e) => e.type === 'waveCleared' || e.type === 'victory')) return;
  }
}
/** From a fresh game to the shop after wave n. */
function shopAfter(n) {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  advance(g, 5, clock);
  for (;;) {
    playWave(g, clock);
    if (g.wave >= n) break;
    leaveShop(g, clock.now);
    advance(g, 3.2, clock);
  }
  return { g, clock };
}

test('maps: ten maps in the order of the waves, the block first', () => {
  assert.deepEqual(MAP_IDS, ['block', 'port', 'factory', 'oldtown', 'railyard', 'airfield', 'winter', 'night', 'desert', 'construction']);
  assert.equal(MAPS.length, 10);
  MAPS.forEach((m, i) => {
    assert.equal(m.id, MAP_IDS[i]);
    assert.equal(m.order, i + 1);
    assert.equal(m.nameKey, 'map_' + m.id);
    assert.equal(m.themeKey, 'mapTheme_' + m.id);
  });
});

test('maps: the choice opens with wave 6 (the rule lives in rules.js) and always in the endless mode', () => {
  assert.equal(rules.MAP_CHOICE_FROM_WAVE, 6);
  assert.equal(MAP_CHOICE_FROM_WAVE, 6);
  for (let n = 1; n <= 5; n++) assert.equal(mapChoiceOpen(n, false), false, 'wave ' + n);
  for (let n = 6; n <= 10; n++) assert.equal(mapChoiceOpen(n, false), true, 'wave ' + n);
  assert.equal(mapChoiceOpen(2, true), true);
  assert.equal(mapChoiceOpen(11, true), true);
});

test('maps: without a choice wave N plays on map N, the endless mode starts over with the block', () => {
  for (let n = 1; n <= 10; n++) assert.equal(defaultMapFor(n, false), MAP_IDS[n - 1], 'wave ' + n);
  assert.equal(defaultMapFor(11, true), 'block');
  assert.equal(defaultMapFor(12, true), 'port');
  assert.equal(defaultMapFor(20, true), 'construction');
  assert.equal(defaultMapFor(25, true), 'railyard');   // ((25 - 1) mod 10) + 1 = 5
  assert.equal(defaultMapFor(16, true), 'airfield');
});

test('maps: a new game is on the block, every cleared wave offers the next map in order', () => {
  const g = createGame(1), clock = { now: 0 };
  assert.equal(g.map, 'block');
  restart(g, 0);
  assert.equal(g.map, 'block');
  assert.equal(g.checkpoint.map, 'block');
  advance(g, 5, clock);
  for (let n = 1; n <= 4; n++) {
    playWave(g, clock);
    assert.equal(g.phase, 'shop');
    assert.equal(g.shop.map, MAP_IDS[n], 'offer after wave ' + n);
    assert.equal(g.map, MAP_IDS[n - 1], 'still fighting on the map of wave ' + n);
    leaveShop(g, clock.now);
    assert.equal(g.map, MAP_IDS[n], 'the next map comes with "to battle"');
    assert.equal(g.checkpoint.map, MAP_IDS[n]);
    advance(g, 3.2, clock);
    assert.equal(g.wave, n + 1);
    assert.equal(g.checkpoint.map, MAP_IDS[n], 'the wave start keeps the map in the checkpoint');
  }
});

test('maps: chooseMap is closed before the shop of wave 5 and outside the shop', () => {
  const { g } = shopAfter(4);
  assert.deepEqual(chooseMap(g, 'night'), { ok: false, reason: 'closed' });
  assert.equal(g.shop.map, 'railyard');
  leaveShop(g, 0);
  assert.deepEqual(chooseMap(g, 'night'), { ok: false, reason: 'closed' }, 'not in the shop');
});

test('maps: after wave 5 the player picks any of the ten maps, and "to battle" takes it', () => {
  const { g, clock } = shopAfter(5);
  assert.equal(g.shop.map, 'airfield', 'the map in order is offered first');
  assert.deepEqual(chooseMap(g, 'atlantis'), { ok: false, reason: 'unknown' });
  assert.deepEqual(chooseMap(g, 'desert'), { ok: true });
  assert.deepEqual(chooseMap(g, 'block'), { ok: true });
  assert.equal(g.shop.map, 'block');
  leaveShop(g, clock.now);
  assert.equal(g.map, 'block');
  assert.equal(g.checkpoint.map, 'block');
  assert.equal(g.checkpoint.wave, 6);
});

test('maps: a revival goes back to the map of the wave of death, a restart to the block', () => {
  const { g, clock } = shopAfter(5);
  chooseMap(g, 'winter');
  leaveShop(g, clock.now);
  advance(g, 3.2, clock);
  assert.equal(g.wave, 6);
  playWave(g, clock, 2);
  assert.equal(g.phase, 'dead');
  g.map = 'port';                      // whatever the game layer did since, the checkpoint decides
  assert.equal(reviveAtCheckpoint(g, clock.now), true);
  assert.equal(g.map, 'winter');
  restart(g, clock.now);
  assert.equal(g.map, 'block');
  assert.equal(g.checkpoint.map, 'block');
});

test('maps: a checkpoint without a map (an older save) revives on the block', () => {
  const { g, clock } = shopAfter(1);
  leaveShop(g, clock.now);
  advance(g, 3.2, clock);
  playWave(g, clock, 1);
  assert.equal(g.phase, 'dead');
  delete g.checkpoint.map;
  reviveAtCheckpoint(g, clock.now);
  assert.equal(g.map, 'block');
});

test('maps: the endless mode opens the choice at once and offers maps by ((N - 1) mod 10) + 1', () => {
  const { g, clock } = shopAfter(9);
  leaveShop(g, clock.now);
  advance(g, 3.2, clock);
  playWave(g, clock);
  assert.equal(g.phase, 'victory');
  assert.equal(continueEndless(g, clock.now), true);
  assert.equal(g.phase, 'shop');
  assert.equal(g.shop.map, 'block', 'wave 11 is map 1 again');
  assert.deepEqual(chooseMap(g, 'factory'), { ok: true });
  leaveShop(g, clock.now);
  assert.equal(g.map, 'factory');
  advance(g, 3.2, clock);
  playWave(g, clock);
  assert.equal(g.wave, 11);
  assert.equal(g.shop.map, 'port', 'wave 12 is map 2');
  assert.deepEqual(chooseMap(g, 'night'), { ok: true });
});
