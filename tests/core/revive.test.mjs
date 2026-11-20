// Wave 12: the checkpoint at the start of every wave and the revival at the wave of death (R56).
import { test, assert } from '../harness.mjs';
import {
  createGame, restart, tickGame, enemyKilled, damagePlayer, leaveShop, continueEndless, reviveAtCheckpoint, resultStats,
  recordShots,
} from '../../src/core/waves.js';
import {
  createArsenal, snapshotArsenal, restoreArsenal, setWeaponLevel, giveWeapon, specOf, tryFire, beginReload, START_WEAPONS,
  setTrigger, spinLevel, tickWeapons,
} from '../../src/core/weapons.js';
import { ECONOMY } from '../../src/core/rules.js';
import { buyArmor } from '../../src/core/shop.js';

function advance(g, seconds, clock) {
  const events = [];
  for (let i = 0, n = Math.round(seconds / 0.05); i < n; i++) { clock.now += 50; events.push(...tickGame(g, 0.05, clock.now)); }
  return events;
}
function playWave(g, clock, killsBeforeDeath = Infinity) {
  const out = [], due = [];
  let killed = 0;
  for (let i = 0; i < 4000; i++) {
    clock.now += 50;
    const ev = tickGame(g, 0.05, clock.now);
    for (const e of ev) { out.push(e); if (e.type === 'spawn') due.push(clock.now + 800); }
    while (due.length && due[0] <= clock.now) {
      due.shift();
      if (killed >= killsBeforeDeath) { damagePlayer(g, 1000, clock.now); return out; }
      enemyKilled(g, { headshot: true, base: 100 }, clock.now); recordShots(g, 2, 1);
      killed++;
    }
    if (ev.some((e) => e.type === 'waveCleared' || e.type === 'victory')) break;
  }
  return out;
}
function toWave(g, clock, n) {
  while (g.wave < n) { playWave(g, clock); if (g.phase === 'shop') { leaveShop(g, clock.now); advance(g, 3.2, clock); } }
}

test('a checkpoint is kept from the start, at leaving the shop and at the start of every wave', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  assert.equal(g.checkpoint.wave, 1);
  playWave(g, clock);
  assert.equal(g.checkpoint.wave, 1);
  g.money += 1000;                      // as if the shop got a lot of business
  leaveShop(g, clock.now);
  assert.equal(g.checkpoint.wave, 2);
  assert.equal(g.checkpoint.money, g.money, 'purchases of the shop are in the checkpoint');
  const ev = advance(g, 3.2, clock);
  assert.ok(ev.some((e) => e.type === 'waveStart' && e.wave === 2));
  assert.equal(g.checkpoint.wave, 2);
  assert.equal(g.checkpoint.score, g.score);
});

test('revival restores money, score and counters of the wave start, counts the death and replays the wave', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  toWave(g, clock, 3);
  Object.assign(g.player, { armorLevel: 1, armorMax: 50, armor: 50 });
  g.checkpoint.armor = 50; g.checkpoint.armorMax = 50; g.checkpoint.armorLevel = 1;
  const cp = { ...g.checkpoint };
  const time0 = g.time;
  playWave(g, clock, 3);                 // three kills, then death
  assert.equal(g.phase, 'dead');
  assert.ok(g.score > cp.score && g.money > cp.money && g.player.kills > cp.kills);
  assert.equal(reviveAtCheckpoint(g, clock.now), true);
  assert.deepEqual(
    [g.score, g.money, g.player.kills, g.player.headshots, g.player.shotsFired, g.player.shotsHit, g.bestStreak],
    [cp.score, cp.money, cp.kills, cp.headshots, cp.shotsFired, cp.shotsHit, cp.bestStreak],
  );
  assert.deepEqual([g.player.health, g.player.armor, g.deaths, g.alive, g.queue.length], [100, 50, 1, 0, 0]);
  assert.equal(g.phase, 'intermission');
  assert.ok(g.time > time0, 'play time keeps running');
  assert.ok(!advance(g, ECONOMY.reviveIntroMs / 1000 - 0.2, clock).some((e) => e.type === 'waveStart'));
  const start = advance(g, 0.4, clock).find((e) => e.type === 'waveStart');
  assert.equal(start.wave, 3);
  assert.equal(start.total, 7, 'the whole wave again');
  assert.equal(resultStats(g).deaths, 1);
});

test('the kills of a failed attempt are never counted twice', () => {
  const g = createGame(4), clock = { now: 0 };
  restart(g, 0);
  toWave(g, clock, 2);
  const cp = { ...g.checkpoint };
  playWave(g, clock, 4);
  reviveAtCheckpoint(g, clock.now);
  advance(g, 4, clock);
  playWave(g, clock);                    // the whole wave 2 this time
  assert.equal(g.player.kills, cp.kills + 5);
});

test('revival works only when dead, and a revived game still wins after wave 10 and goes endless', () => {
  const g = createGame(2), clock = { now: 0 };
  restart(g, 0);
  assert.equal(reviveAtCheckpoint(g, 0), false, 'not alive');
  toWave(g, clock, 3);
  playWave(g, clock, 1);
  assert.equal(reviveAtCheckpoint(g, clock.now), true);
  advance(g, 4, clock);
  for (;;) {
    playWave(g, clock);
    if (g.phase === 'victory') break;
    leaveShop(g, clock.now); advance(g, 3.2, clock);
  }
  assert.equal(g.wave, 10);
  assert.equal(continueEndless(g, clock.now), true);
  leaveShop(g, clock.now);
  const ev = advance(g, 3.2, clock);
  assert.ok(ev.some((e) => e.type === 'waveStart' && e.wave === 11 && e.endless));
  // a death in the endless mode revives at the endless wave
  playWave(g, clock, 2);
  assert.equal(reviveAtCheckpoint(g, clock.now), true);
  const again = advance(g, 4, clock).find((e) => e.type === 'waveStart');
  assert.deepEqual([again.wave, again.endless], [11, true]);
  assert.equal(g.deaths, 2);
});

test('a death is counted when it happens: the death screen and the victory screen show the true number', () => {
  const g = createGame(3), clock = { now: 0 };
  restart(g, 0);
  toWave(g, clock, 2);
  playWave(g, clock, 1);
  assert.equal(g.phase, 'dead');
  assert.equal(resultStats(g).deaths, 1, 'the first death screen shows 1');
  damagePlayer(g, 1000, clock.now);
  assert.equal(g.deaths, 1, 'damage to a dead player is no second death');
  reviveAtCheckpoint(g, clock.now);
  assert.equal(g.deaths, 1, 'a revival is not a death');
  advance(g, 4, clock);
  playWave(g, clock, 2);
  assert.equal(resultStats(g).deaths, 2);
  reviveAtCheckpoint(g, clock.now);
  advance(g, 4, clock);
  for (;;) {
    playWave(g, clock);
    if (g.phase === 'victory') break;
    leaveShop(g, clock.now); advance(g, 3.2, clock);
  }
  assert.equal(resultStats(g).deaths, 2, 'the victory screen shows both deaths');
});

test('a death in the countdown after the shop revives at the coming wave, purchases kept', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  playWave(g, clock);
  g.money = 5000;
  buyArmor(g);
  leaveShop(g, clock.now);
  advance(g, 1, clock);
  damagePlayer(g, 1000, clock.now);      // a late barrel
  assert.equal(g.phase, 'dead');
  reviveAtCheckpoint(g, clock.now);
  assert.equal(g.money, 5000 - 800);
  assert.equal(g.player.armorLevel, 1);
  const start = advance(g, 4, clock).find((e) => e.type === 'waveStart');
  assert.equal(start.wave, 2);
});

test('snapshotArsenal is a deep copy and restoreArsenal brings back weapons, levels, ammo and grenades', () => {
  const a = createArsenal('rifle', START_WEAPONS);
  giveWeapon(a, 'shotgun');
  setWeaponLevel(a, 'rifle', 2);
  a.weapons.rifle.mag = 17; a.grenades = 3;
  const snap = snapshotArsenal(a);
  assert.equal(snap.reload, undefined);
  // the live objects of the checkpoint moment are changed in place: a shallow snapshot would see it
  const liveSpec = a.specs.rifle, liveAmmo = a.weapons.rifle;
  liveSpec.mag = 999; liveSpec.recoil.x = 99; liveAmmo.reserve = 0;
  a.levels.rifle = 3; a.owned.push('ghost');
  assert.equal(snap.specs.rifle.mag, 39, 'the spec in the snapshot is its own copy');
  assert.notEqual(snap.specs.rifle.recoil.x, 99);
  assert.equal(snap.weapons.rifle.reserve, 180);
  assert.equal(snap.levels.rifle, 2);
  assert.deepEqual(snap.owned, ['pistol', 'rifle', 'shotgun']);
  a.owned.pop();
  // what happens after the checkpoint
  tryFire(a, 0); tryFire(a, 1000);
  a.grenades = 0;
  giveWeapon(a, 'pistol');
  setWeaponLevel(a, 'rifle', 3);
  a.lastTick = 50000;
  beginReload(a, 50000);
  restoreArsenal(a, snap);
  assert.deepEqual(a.owned, ['pistol', 'rifle', 'shotgun']);
  assert.deepEqual(a.weapons.rifle, { mag: 17, reserve: 180 });
  assert.equal(a.grenades, 3);
  assert.equal(a.levels.rifle, 2);
  assert.equal(specOf(a, 'rifle').mag, 39);
  assert.equal(specOf(a, 'rifle').recoil.x, snap.specs.rifle.recoil.x);
  assert.notEqual(a.specs.rifle, snap.specs.rifle, 'restoring copies again');
  assert.equal(a.reload, null);
  assert.equal(a.lastTick, 50000, 'the clock keeps running');
  // restoring twice gives two independent copies
  a.weapons.rifle.mag = 0;
  restoreArsenal(a, snap);
  assert.equal(a.weapons.rifle.mag, 17);
  assert.equal(snap.weapons.rifle.mag, 17);
});

test('a checkpoint taken with the minigun spinning brings back the weapon, not the turning barrels', () => {
  const a = createArsenal('minigun', ['pistol', 'rifle', 'minigun']);
  a.grenades = 1;
  setTrigger(a, true);
  for (let t = 0; t <= 1000; t += 50) tickWeapons(a, t);
  assert.equal(spinLevel(a), 1, 'the barrels are up to speed');
  const snap = snapshotArsenal(a);
  assert.equal(snap.spin, undefined, 'the spin is no part of a checkpoint');
  assert.equal(snap.trigger, undefined, 'nor the held trigger');
  // after the checkpoint: a grenade thrown, the belt shot down
  a.grenades = 0;
  a.weapons.minigun.mag = 12;
  restoreArsenal(a, snap);
  assert.equal(a.current, 'minigun');
  assert.equal(a.grenades, 1, 'the grenades of the checkpoint come back');
  assert.equal(a.weapons.minigun.mag, specOf(a, 'minigun').mag);
  assert.equal(spinLevel(a), 0, 'the barrels stand still after a revival');
  assert.equal(a.trigger, false);
  assert.equal(tryFire(a, 1100).reason, 'spinning', 'they must spin up again before the first round');
});

// ---- wave 15: the checkpoint keeps the map
test('the checkpoint keeps the map, a revival replays the wave of death on that map', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  assert.equal(g.checkpoint.map, 'block');
  toWave(g, clock, 3);
  assert.equal(g.map, 'factory');
  assert.equal(g.checkpoint.map, 'factory');
  playWave(g, clock, 1);
  assert.equal(g.phase, 'dead');
  g.map = 'block';                      // the game layer may have drawn the menu on another map since
  assert.ok(reviveAtCheckpoint(g, clock.now));
  assert.equal(g.map, 'factory');
});
