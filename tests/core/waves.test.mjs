import { test, assert, near } from '../harness.mjs';
import {
  createGame, restart, tickGame, enemyKilled, damagePlayer, continueEndless, setPaused, recordShots, resultStats,
} from '../../src/core/waves.js';
import { leaveShop } from '../../src/core/waves.js';

/** After a cleared wave: leave the shop and sit through the countdown (wave 12 replaced the 6 s break). */
function nextWave(g, clock) {
  leaveShop(g, clock.now);
  return advance(g, 3.2, clock);
}

/** Run the game for `seconds` of game time in 50 ms steps. Returns all events. */
function advance(g, seconds, clock, onEvent) {
  const events = [];
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    clock.now += 50;
    const ev = tickGame(g, 0.05, clock.now);
    for (const e of ev) { events.push(e); if (onEvent) onEvent(e); }
  }
  return events;
}
/** Play a wave to the end: every spawned bot is killed after a moment. */
function playWave(g, clock) {
  const out = [];
  const alive = [];
  for (let i = 0; i < 4000; i++) {
    clock.now += 50;
    const ev = tickGame(g, 0.05, clock.now);
    for (const e of ev) { out.push(e); if (e.type === 'spawn') alive.push(clock.now + 800); }
    while (alive.length && alive[0] <= clock.now) { alive.shift(); enemyKilled(g, { headshot: false, base: 100 }, clock.now); }
    if (ev.some((e) => e.type === 'waveCleared' || e.type === 'victory')) break;
  }
  return out;
}

test('a new game waits in the menu and does nothing', () => {
  const g = createGame(5);
  assert.equal(g.phase, 'menu');
  assert.deepEqual(tickGame(g, 1, 1000), []);
  assert.equal(g.player.health, 100);
});
test('restart begins with a short intro, then wave 1 with three bots', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  assert.equal(g.phase, 'intermission');
  const ev = advance(g, 5, clock);
  const start = ev.find((e) => e.type === 'waveStart');
  assert.deepEqual([start.wave, start.tier, start.total], [1, 1, 3]);
  assert.equal(g.phase, 'wave');
});
test('bots arrive one by one and never more than the limit at once', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  advance(g, 4.6, clock);
  const spawns = advance(g, 30, clock).filter((e) => e.type === 'spawn');
  assert.equal(spawns.length, 3, 'wave 1 has exactly 3 bots');
  assert.equal(g.alive, 3);
  assert.ok(spawns.every((e) => e.tier === 1));
});
test('clearing a wave opens the shop; leaving it gives a 3 second countdown and the next wave with 5 bots', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  const ev = playWave(g, clock);
  const cleared = ev.find((e) => e.type === 'waveCleared');
  assert.ok(cleared); assert.equal(cleared.wave, 1);
  assert.equal(g.phase, 'shop');
  assert.deepEqual(advance(g, 60, clock), [], 'the shop waits without a timer');
  leaveShop(g, clock.now);
  assert.equal(g.phase, 'intermission');
  assert.ok(!advance(g, 2.9, clock).some((e) => e.type === 'waveStart'), 'not before 3 s');
  const start = advance(g, 0.3, clock).find((e) => e.type === 'waveStart');
  assert.equal(start.wave, 2); assert.equal(start.total, 5);
});
test('the whole spawn budget of a wave matches the formula for every wave', () => {
  const g = createGame(3), clock = { now: 0 };
  restart(g, 0);
  const counts = [];
  for (let w = 1; w <= 10; w++) {
    const ev = playWave(g, clock);
    counts.push(ev.filter((e) => e.type === 'spawn').length);
    if (w < 10) nextWave(g, clock);
  }
  assert.deepEqual(counts, [3, 5, 7, 9, 11, 13, 15, 17, 19, 21]);
});
test('the limit of 12 bots at once holds in the late waves', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  g.wave = 9;
  advance(g, 4.6, clock);
  advance(g, 60, clock);
  assert.ok(g.alive <= 12, 'alive ' + g.alive);
  assert.ok(g.alive >= 5);
});
test('clearing wave 10 is a victory, and endless mode goes on with wave 11 at tier 3', () => {
  const g = createGame(2), clock = { now: 0 };
  restart(g, 0);
  let last = [];
  for (let w = 1; w <= 10; w++) { last = playWave(g, clock); if (w < 10) nextWave(g, clock); }
  assert.ok(last.some((e) => e.type === 'victory'));
  assert.equal(g.phase, 'victory');
  assert.deepEqual(tickGame(g, 1, clock.now + 1), []);
  assert.equal(continueEndless(g, clock.now), true);
  assert.equal(g.phase, 'shop', 'the endless mode goes through the shop');
  const ev = nextWave(g, clock);
  const start = ev.find((e) => e.type === 'waveStart');
  assert.deepEqual([start.wave, start.tier, start.total, start.endless], [11, 3, 23, true]);
});
test('continueEndless only works from the victory screen', () => {
  const g = createGame(1);
  assert.equal(continueEndless(g, 0), false);
});
test('damage and death: health never goes below zero and death ends the game', () => {
  const g = createGame(1);
  restart(g, 0);
  const a = damagePlayer(g, 30, 1000);
  assert.deepEqual(a, { health: 70, dead: false });
  const b = damagePlayer(g, 500, 2000);
  assert.deepEqual(b, { health: 0, dead: true });
  assert.equal(g.phase, 'dead');
  assert.deepEqual(tickGame(g, 1, 3000), []);
});
test('health regenerates 5 seconds after the last damage, at 18 per second', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  clock.now = 10000;
  damagePlayer(g, 50, clock.now);
  advance(g, 4, clock);
  assert.equal(Math.round(g.player.health), 50);
  advance(g, 3, clock);
  assert.ok(g.player.health > 50 + 18 * 1.5, 'regen started: ' + g.player.health);
  advance(g, 10, clock);
  assert.equal(g.player.health, 100);
});
test('damage resets the regeneration timer', () => {
  const g = createGame(1), clock = { now: 20000 };
  restart(g, 0);
  damagePlayer(g, 40, clock.now);
  advance(g, 4.5, clock);
  damagePlayer(g, 10, clock.now);
  const hp = g.player.health;
  advance(g, 4, clock);
  near(g.player.health, hp, 0.001);
});
test('kills give points, headshots more, a streak builds and times out', () => {
  const g = createGame(1);
  restart(g, 0);
  g.alive = 3;
  const k1 = enemyKilled(g, { headshot: false, base: 100 }, 1000);
  const k2 = enemyKilled(g, { headshot: true, base: 100 }, 2000);
  assert.equal(k1.points, 100); assert.equal(k2.points, 100 + 50 + 10);
  assert.equal(g.score, 260); assert.equal(g.player.kills, 2); assert.equal(g.player.headshots, 1);
  assert.equal(g.streak, 2);
  g.phase = 'wave';
  tickGame(g, 0.05, 20000);
  assert.equal(g.streak, 0);
  assert.equal(g.bestStreak, 2);
});
test('restart is a full reset with the same seed', () => {
  const g = createGame(9);
  restart(g, 0);
  g.score = 999; g.player.kills = 7; damagePlayer(g, 99, 100);
  g.wave = 4; g.endless = true;
  restart(g, 5000);
  assert.deepEqual([g.score, g.player.kills, g.player.health, g.wave, g.endless, g.phase, g.seed], [0, 0, 100, 0, false, 'intermission', 9]);
  assert.equal(g.alive, 0); assert.deepEqual(g.queue, []);
});
test('same seed, same game: the order of bots is reproducible', () => {
  const order = (seed) => {
    const g = createGame(seed), clock = { now: 0 };
    restart(g, 0);
    g.wave = 5;
    advance(g, 4.6, clock);
    return advance(g, 40, clock).filter((e) => e.type === 'spawn').map((e) => e.enemyType).join(',');
  };
  assert.equal(order(4), order(4));
  assert.notEqual(order(4), order(5));
});
test('pausing freezes the game and resuming returns to the same phase', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  advance(g, 5, clock);
  assert.equal(g.phase, 'wave');
  setPaused(g, true);
  assert.equal(g.phase, 'paused');
  const t = g.time;
  assert.deepEqual(advance(g, 3, clock), []);
  assert.equal(g.time, t);
  setPaused(g, false);
  assert.equal(g.phase, 'wave');
});
test('result stats report accuracy, kills and time', () => {
  const g = createGame(1);
  restart(g, 0);
  recordShots(g, 10, 4); recordShots(g, 10, 4);
  g.alive = 1; enemyKilled(g, { headshot: true, base: 100 }, 0);
  const s = resultStats(g);
  assert.equal(s.shots, 20); assert.equal(s.hits, 8); near(s.accuracy, 0.4);
  assert.equal(s.kills, 1); assert.equal(s.headshots, 1); assert.equal(s.maxWaves, 10);
});
