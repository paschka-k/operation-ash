// Wave 12: money, the stage reward, the shop phase, armour and enemy health growing with the wave.
import { test, assert, near } from '../harness.mjs';
import {
  createGame, restart, tickGame, enemyKilled, damagePlayer, leaveShop, continueEndless, resultStats,
} from '../../src/core/waves.js';
import {
  ECONOMY, ARMOR, START_WEAPONS, stageReward, stageBreakdown, waveHpMult, absorbDamage, killScore, enemyParams,
} from '../../src/core/rules.js';
import { createEnemy } from '../../src/core/ai.js';
import { buyArmor } from '../../src/core/shop.js';

function advance(g, seconds, clock) {
  const events = [];
  for (let i = 0, n = Math.round(seconds / 0.05); i < n; i++) { clock.now += 50; events.push(...tickGame(g, 0.05, clock.now)); }
  return events;
}
/** Play the current wave to its end; `onSpawn` may hurt the player or count headshots. */
function playWave(g, clock, { head = false, hurt = 0 } = {}) {
  const out = [], due = [];
  for (let i = 0; i < 4000; i++) {
    clock.now += 50;
    const ev = tickGame(g, 0.05, clock.now);
    for (const e of ev) { out.push(e); if (e.type === 'spawn') due.push(clock.now + 800); }
    while (due.length && due[0] <= clock.now) {
      due.shift();
      if (hurt) damagePlayer(g, hurt, clock.now);
      enemyKilled(g, { headshot: head, base: 100 }, clock.now);
    }
    if (ev.some((e) => e.type === 'waveCleared' || e.type === 'victory')) break;
  }
  return out;
}

test('the start loadout is a pistol and an assault rifle; the shotgun is bought', () => {
  assert.deepEqual(START_WEAPONS, ['pistol', 'rifle']);
});

test('a kill pays as much money as it gives points, and money starts at zero', () => {
  const g = createGame(1);
  restart(g, 0);
  assert.equal(g.money, 0);
  g.alive = 2;
  const a = enemyKilled(g, { headshot: false, base: 150 }, 1000);
  const b = enemyKilled(g, { headshot: true, base: 100 }, 2000);
  assert.equal(a.points, killScore({ base: 150, streak: 1 }));
  assert.equal(g.money, a.points + b.points);
  assert.equal(g.money, g.score);
});

test('the stage reward grows with the wave and keeps growing in the endless mode', () => {
  assert.equal(stageReward(1), ECONOMY.rewardBase + ECONOMY.rewardPerWave);
  for (let n = 1; n < 30; n++) assert.ok(stageReward(n + 1) > stageReward(n));
  const s = stageBreakdown(4, { killMoney: 700, headshots: 3, damaged: false });
  assert.equal(s.reward, stageReward(4));
  assert.equal(s.headshots, 3 * ECONOMY.headshotBonus);
  assert.equal(s.flawless, Math.round(stageReward(4) * ECONOMY.flawlessShare));
  assert.equal(s.paid, s.reward + s.headshots + s.flawless);
  assert.equal(s.total, 700 + s.paid);
  assert.equal(stageBreakdown(4, { damaged: true }).flawless, 0);
});

test('a cleared wave pays its reward with a breakdown, and a wave without damage pays the bonus', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  const ev = playWave(g, clock, { head: true });
  const cleared = ev.find((e) => e.type === 'waveCleared');
  assert.equal(cleared.stage.wave, 1);
  assert.equal(cleared.stage.kills, g.score - 250, 'kill money of wave 1 (the score also has the 250 wave bonus)');
  assert.equal(cleared.stage.headshots, 3 * ECONOMY.headshotBonus);
  assert.ok(cleared.stage.flawless > 0);
  assert.equal(g.money, cleared.stage.total);
  // wave 2 with damage: no flawless bonus
  leaveShop(g, clock.now);
  advance(g, 3.2, clock);
  const before = g.money;
  const ev2 = playWave(g, clock, { hurt: 5 });
  const s2 = ev2.find((e) => e.type === 'waveCleared').stage;
  assert.equal(s2.flawless, 0);
  assert.equal(g.money - before, s2.total);
});

test('the shop phase waits without a timer, heals and refills armour; damage cannot hurt there', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  g.player.armorLevel = 1; g.player.armorMax = 50; g.player.armor = 50;
  playWave(g, clock, { hurt: 20 });
  assert.equal(g.phase, 'shop');
  assert.equal(g.player.health, 100);
  assert.equal(g.player.armor, 50);
  assert.deepEqual(damagePlayer(g, 500, clock.now), { health: 100, dead: false });
  assert.deepEqual(advance(g, 120, clock), []);
  assert.equal(leaveShop(g, clock.now), true);
  assert.equal(leaveShop(g, clock.now), false, 'only from the shop');
});

test('spending money never lowers the score', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  playWave(g, clock);
  g.money = 5000;
  const score = g.score;
  assert.equal(buyArmor(g).ok, true);
  assert.equal(g.money, 5000 - ARMOR.prices[1]);
  assert.equal(g.score, score);
});

test('armour takes 60% of a hit until it is used up, then health takes everything', () => {
  near(absorbDamage(50, 10).health, 4);
  near(absorbDamage(50, 10).armor, 44);
  assert.deepEqual(absorbDamage(0, 10), { armor: 0, health: 10, absorbed: 0 });
  const g = createGame(1);
  restart(g, 0);
  g.phase = 'wave';
  Object.assign(g.player, { armorLevel: 1, armorMax: 50, armor: 50 });
  damagePlayer(g, 50, 1000);                 // armour takes 30, health 20
  near(g.player.armor, 20); near(g.player.health, 80);
  damagePlayer(g, 50, 2000);                 // armour has 20 left: it takes 20, health 30
  near(g.player.armor, 0); near(g.player.health, 50);
  damagePlayer(g, 10, 3000);
  near(g.player.health, 40);
});

test('a new game resets money, armour and deaths', () => {
  const g = createGame(1);
  restart(g, 0);
  Object.assign(g, { money: 900, deaths: 2 });
  Object.assign(g.player, { armorLevel: 2, armorMax: 100, armor: 70 });
  restart(g, 100);
  assert.deepEqual([g.money, g.deaths, g.player.armor, g.player.armorMax, g.player.armorLevel], [0, 0, 0, 0, 0]);
});

test('enemy health grows with the wave: 1 at wave 1, rising steadily, still rising in endless waves', () => {
  assert.equal(waveHpMult(1), 1);
  for (let n = 1; n < 40; n++) assert.ok(waveHpMult(n + 1) > waveHpMult(n));
  near(waveHpMult(5), 1.24);
  near(waveHpMult(11) - waveHpMult(10), waveHpMult(2) - waveHpMult(1));
});

test('spawn events carry the multiplier and a bot built with it has more health and a matching full bar', () => {
  const g = createGame(1), clock = { now: 0 };
  restart(g, 0);
  g.wave = 4;
  const spawn = advance(g, 7, clock).find((e) => e.type === 'spawn');
  near(spawn.hpMult, waveHpMult(5));
  const plain = createEnemy({ x: 0, z: 0, type: 'grunt' }, 2, () => 0.5);
  const tough = createEnemy({ x: 0, z: 0, type: 'grunt', hpMult: spawn.hpMult }, 2, () => 0.5);
  near(plain.hp, enemyParams('grunt', 2).hp);
  near(tough.hp, plain.hp * waveHpMult(5));
  near(tough.P.hp, tough.hp);
});

test('after the victory the money of wave 10 is paid and the endless mode opens the shop', () => {
  const g = createGame(2), clock = { now: 0 };
  restart(g, 0);
  for (let w = 1; w <= 10; w++) { playWave(g, clock); if (w < 10) { leaveShop(g, clock.now); advance(g, 3.2, clock); } }
  assert.equal(g.phase, 'victory');
  assert.equal(g.stage.wave, 10);
  const money = g.money;
  assert.equal(continueEndless(g, clock.now), true);
  assert.equal(g.phase, 'shop');
  assert.equal(g.money, money);
  assert.equal(resultStats(g).money, money);
});
