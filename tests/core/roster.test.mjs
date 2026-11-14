import { test, assert } from '../harness.mjs';
import {
  VEHICLES, ENEMY_TYPES, ZONE_MULT, firstRiderWave, waveRoster, bossForWave, maxRiders, waveCount, waveComposition, waveHpMult,
} from '../../src/core/rules.js';
import { createGame, restart, tickGame, enemyKilled, leaveShop } from '../../src/core/waves.js';

const RIDERS = ['scooterRider', 'skater', 'biker'];
const BOSSES = ['bossBiker', 'bossCommander'];
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const count = (o, k) => o[k] || 0;

test('vehicles: four kinds with every number the riders need', () => {
  assert.deepEqual(Object.keys(VEHICLES).sort(), ['heavyMoto', 'moto', 'scooter', 'skate']);
  const fields = ['hp', 'armor', 'speed', 'accel', 'brake', 'length', 'width', 'height', 'seatY', 'stance', 'ramSpeed', 'ramDamage', 'ramCooldown', 'wreckSecs', 'score'];
  for (const [k, v] of Object.entries(VEHICLES)) {
    for (const f of fields) assert.ok(f in v, k + ' has no ' + f);
    assert.ok(v.hp > 0 && v.armor > 0 && v.armor <= 1 && v.speed > 0 && v.accel > 0 && v.brake > 0, k);
    assert.ok(['stand', 'skate', 'seat'].includes(v.stance), k);
    assert.ok(v.ramCooldown >= 3, k + ': a moto does not hit twice within 3 s');
    assert.equal(v.wreckSecs, 20, k + ': wrecks are gone after 20 s');
  }
  assert.deepEqual([VEHICLES.scooter.stance, VEHICLES.skate.stance, VEHICLES.moto.stance], ['stand', 'skate', 'seat']);
  // the skate is slower than the scooter, the motorbike the fastest
  assert.ok(VEHICLES.skate.speed < VEHICLES.scooter.speed && VEHICLES.scooter.speed < VEHICLES.moto.speed);
  // only motorbikes knock the player down
  assert.equal(VEHICLES.scooter.ramSpeed, Infinity);
  assert.equal(VEHICLES.skate.ramSpeed, Infinity);
  assert.ok(Number.isFinite(VEHICLES.moto.ramSpeed) && VEHICLES.moto.ramSpeed < VEHICLES.moto.speed && VEHICLES.moto.ramDamage > 0);
  assert.ok(VEHICLES.heavyMoto.hp > VEHICLES.moto.hp && VEHICLES.heavyMoto.armor < VEHICLES.moto.armor);
  assert.equal(ZONE_MULT.vehicle, 1);
});

test('riders and bosses are enemy types with all the fields of a soldier', () => {
  const fields = Object.keys(ENEMY_TYPES.grunt);
  for (const k of [...RIDERS, ...BOSSES]) {
    assert.ok(ENEMY_TYPES[k], k + ' missing');
    for (const f of fields) assert.ok(f in ENEMY_TYPES[k], k + ' has no ' + f);
    assert.equal(ENEMY_TYPES[k].key, 'e_' + k);
  }
  assert.deepEqual(RIDERS.map((k) => ENEMY_TYPES[k].vehicle), ['scooter', 'skate', 'moto']);
  assert.deepEqual(RIDERS.map((k) => ENEMY_TYPES[k].weapon), ['pistol', 'smg', 'rifle']);
  for (const k of [...RIDERS, 'bossBiker']) {
    const m = ENEMY_TYPES[k].mountedAcc;
    assert.ok(m > 0 && m < 1, k + ' shoots worse on the move: ' + m);
  }
  assert.equal(ENEMY_TYPES.bossBiker.vehicle, 'heavyMoto');
  assert.equal(ENEMY_TYPES.bossBiker.boss, true);
  assert.equal(ENEMY_TYPES.bossCommander.boss, true);
  assert.equal(ENEMY_TYPES.bossCommander.vehicle, undefined);
  assert.ok(ENEMY_TYPES.bossCommander.grenadeEvery > 0);
  for (const k of BOSSES) {
    const T = ENEMY_TYPES[k];
    assert.ok(T.scale > ENEMY_TYPES.heavy.scale, k + ' is bigger than a heavy');
    assert.ok(T.hp > ENEMY_TYPES.heavy.hp * 2 && T.armor < 1, k + ' is tough and armoured');
    assert.ok(T.score > ENEMY_TYPES.heavy.score * 3, k + ' pays big');
  }
  // the commander: slow, long bursts
  assert.ok(ENEMY_TYPES.bossCommander.speed < ENEMY_TYPES.grunt.speed);
  assert.ok(ENEMY_TYPES.bossCommander.burst[1] > ENEMY_TYPES.heavy.burst[1]);
  for (const k of [...RIDERS, ...BOSSES]) assert.equal(ENEMY_TYPES[k].vehicle === undefined && !ENEMY_TYPES[k].boss, false, k);
  for (const k of ['grunt', 'rusher', 'heavy']) assert.equal(ENEMY_TYPES[k].vehicle, undefined);
});

test('riders come in order: scooters from wave 3, skates from 5, motorbikes from 7', () => {
  assert.deepEqual(firstRiderWave, { scooterRider: 3, skater: 5, biker: 7 });
  for (const n of [1, 2]) {
    const r = waveRoster(n, false);
    for (const k of [...RIDERS, ...BOSSES]) assert.equal(count(r, k), 0, k + ' in wave ' + n);
  }
  for (const n of [3, 4]) {
    const r = waveRoster(n, false);
    assert.ok(count(r, 'scooterRider') >= 1, 'scooter in wave ' + n);
    assert.equal(count(r, 'skater') + count(r, 'biker'), 0, 'wave ' + n);
  }
  const w5 = waveRoster(5, false);
  assert.ok(count(w5, 'skater') >= 1, 'a skater in wave 5');
  assert.equal(count(w5, 'biker'), 2, 'wave 5: the two bikers are the boss guard');
  assert.equal(count(waveRoster(6, false), 'biker'), 0);
  for (let n = 7; n <= 10; n++) {
    const r = waveRoster(n, false);
    for (const k of RIDERS) assert.ok(count(r, k) >= 1, k + ' in wave ' + n);
  }
  for (let n = 11; n <= 30; n++) {
    const r = waveRoster(n, true);
    for (const k of RIDERS) assert.ok(count(r, k) >= 1, k + ' in endless wave ' + n);
  }
});

test('the roster of every wave keeps the bot count: riders come out of the grunts, the boss out of the heavies', () => {
  for (let n = 1; n <= 30; n++) {
    for (const endless of n > 10 ? [true, false] : [false]) {
      const r = waveRoster(n, endless), base = waveComposition(n);
      assert.equal(sum(r), waveCount(n), 'wave ' + n + (endless ? ' endless' : ''));
      for (const v of Object.values(r)) assert.ok(Number.isInteger(v) && v >= 0, 'wave ' + n);
      const riders = RIDERS.reduce((a, k) => a + count(r, k), 0);
      const boss = BOSSES.reduce((a, k) => a + count(r, k), 0);
      assert.equal(count(r, 'rusher'), base.rusher, 'rushers stay, wave ' + n);
      assert.equal(count(r, 'heavy') + boss, base.heavy, 'the boss takes the place of a heavy, wave ' + n);
      assert.equal(count(r, 'grunt') + riders, base.grunt, 'riders take the place of grunts, wave ' + n);
      assert.ok(count(r, 'grunt') >= 1, 'some grunts stay, wave ' + n);
    }
  }
});

test('bosses: wave 5 the gang leader on a heavy motorbike, wave 10 the commander, then every fifth wave in turn', () => {
  assert.equal(bossForWave(5), 'bossBiker');
  assert.equal(bossForWave(10), 'bossCommander');
  assert.deepEqual([15, 20, 25, 30].map(bossForWave), ['bossBiker', 'bossCommander', 'bossBiker', 'bossCommander']);
  for (let n = 1; n <= 30; n++) if (n % 5) assert.equal(bossForWave(n), null, 'wave ' + n);
  for (let n = 1; n <= 30; n++) {
    const r = waveRoster(n, n > 10), b = bossForWave(n);
    for (const k of BOSSES) assert.equal(count(r, k), k === b ? 1 : 0, k + ' in wave ' + n);
  }
  assert.equal(count(waveRoster(15, true), 'biker') >= 2, true, 'the gang leader brings his guard');
});

test('at most three riders on the streets at once, four in the endless mode', () => {
  for (let n = 1; n <= 10; n++) assert.equal(maxRiders(n, false), 3);
  assert.equal(maxRiders(20, true), 4);
  assert.equal(maxRiders(11, true), 4);
});

/** Play waves until wave `last` has spawned everything; returns the spawn events per wave. */
function spawnsUpTo(last) {
  const g = createGame(7), clock = { now: 0 };
  restart(g, 0);
  const waves = {};
  for (let i = 0; i < 200000; i++) {
    clock.now += 50;
    for (const ev of tickGame(g, 0.05, clock.now)) {
      if (ev.type === 'spawn') {
        (waves[g.wave] ||= []).push(ev);
        enemyKilled(g, {}, clock.now);
      }
    }
    if (g.phase === 'shop') { if (g.wave >= last) break; leaveShop(g, clock.now); }
  }
  return waves;
}

/** The first `k` spawn events of wave n (endless for n > 10), with seed `seed`. */
function firstSpawns(n, k, seed) {
  const g = createGame(seed), clock = { now: 0 };
  restart(g, 0);
  g.wave = n - 1;
  g.endless = n > 10;
  const out = [];
  for (let i = 0; i < 400 && out.length < k; i++) {
    clock.now += 50;
    for (const ev of tickGame(g, 0.05, clock.now)) if (ev.type === 'spawn') out.push(ev.enemyType);
  }
  assert.equal(g.wave, n);
  return out;
}

test('a boss wave opens with the boss, the gang leader right with his two guards; the rest stays shuffled', () => {
  for (let seed = 1; seed <= 40; seed++) {
    assert.deepEqual(firstSpawns(5, 3, seed), ['bossBiker', 'biker', 'biker'], 'wave 5, seed ' + seed);
    assert.deepEqual(firstSpawns(10, 1, seed), ['bossCommander'], 'wave 10, seed ' + seed);
    assert.deepEqual(firstSpawns(15, 3, seed), ['bossBiker', 'biker', 'biker'], 'wave 15, seed ' + seed);
  }
  // the bots after the boss still come in an order that depends on the seed
  const rest = (seed) => firstSpawns(5, 8, seed).slice(3).join(',');
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(rest)).size > 1, 'the rest of wave 5 is shuffled');
});

test('the waves spawn their roster: a scooter rider in wave 3, the boss and his guard in wave 5', () => {
  const waves = spawnsUpTo(5);
  const types = (n) => waves[n].map((e) => e.enemyType);
  assert.ok(types(3).includes('scooterRider'));
  assert.ok(types(5).includes('bossBiker'));
  assert.equal(types(5).filter((t) => t === 'biker').length, 2);
  for (let n = 1; n <= 5; n++) {
    assert.equal(waves[n].length, waveCount(n), 'wave ' + n);
    const roster = waveRoster(n, false), got = {};
    for (const t of types(n)) got[t] = (got[t] || 0) + 1;
    for (const [k, v] of Object.entries(roster)) assert.equal(got[k] || 0, v, k + ' in wave ' + n);
    for (const e of waves[n]) {
      assert.equal(e.tier, n <= 3 ? 1 : 2);
      assert.equal(e.hpMult, waveHpMult(n));
    }
  }
});
