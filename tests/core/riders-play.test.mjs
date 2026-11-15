// Wave 14, riders and bosses in play: the rules the game layer uses to bring riders in (core/riderlogic).
import { test, assert, near } from '../harness.mjs';
import {
  RIDER_SPAWN, isRider, deferSpawn, payVehicle, vehicleHp, riderSlotFree, pickRiderSpawn, newRiderKinds, riderMarkerAlpha,
} from '../../src/core/riderlogic.js';
import { createGame, restart, tickGame, enemyKilled, leaveShop } from '../../src/core/waves.js';
import { VEHICLES, waveRoster, waveCount, waveHpMult, maxAlive, enemyMarkerAlpha, MAP_MARKERS } from '../../src/core/rules.js';
import { levelRoutes } from '../../src/core/routes.js';
import { createRng } from '../../src/core/math.js';

test('isRider: the three riders and the gang leader ride in, foot soldiers and the commander do not', () => {
  for (const k of ['scooterRider', 'skater', 'biker', 'bossBiker']) assert.equal(isRider(k), true, k);
  for (const k of ['grunt', 'rusher', 'heavy', 'bossCommander', 'nobody']) assert.equal(isRider(k), false, k);
});

test('deferSpawn: a rider that cannot enter waits in the queue; the wave still spawns its whole roster once', () => {
  const g = createGame(3);
  restart(g, 0);
  let now = 0;
  const live = [];          // types of the bots on the map
  const spawned = {};
  let deferred = 0, cleared = false;
  for (let i = 0; i < 100000 && !cleared; i++) {
    now += 50;
    for (const ev of tickGame(g, 0.05, now)) {
      if (ev.type === 'spawn') {
        const mounted = live.filter(isRider).length;
        // at most one rider at a time in this test: the second one has to wait
        if (isRider(ev.enemyType) && mounted >= 1) {
          const left = g.waveEnemiesLeft;
          deferSpawn(g, ev.enemyType);
          deferred++;
          assert.equal(g.waveEnemiesLeft, left, 'the bots still to fight do not change');
          assert.equal(g.queue[0], ev.enemyType, 'back in the queue, the last to come');
          continue;
        }
        live.push(ev.enemyType);
        if (g.wave === 5) spawned[ev.enemyType] = (spawned[ev.enemyType] || 0) + 1;
        assert.ok(g.alive <= maxAlive(g.wave));
        assert.equal(g.alive, live.length, 'alive counts the bots on the map, not the waiting ones');
      }
      if (ev.type === 'waveCleared' && ev.wave === 5) cleared = true;
    }
    // kill the oldest bot now and then, riders last
    if (i % 90 === 0 && live.length) {
      const k = live.findIndex((t) => !isRider(t));
      live.splice(k >= 0 && live.length > 1 ? k : 0, 1);
      enemyKilled(g, {}, now);
    }
    if (g.phase === 'shop') leaveShop(g, now);
  }
  assert.ok(cleared, 'wave 5 is cleared');
  assert.ok(deferred > 0, 'some riders had to wait');
  const roster = waveRoster(5, false);
  for (const [k, v] of Object.entries(roster)) assert.equal(spawned[k] || 0, v, k + ' spawned once each');
  assert.equal(Object.values(spawned).reduce((a, b) => a + b, 0), waveCount(5));
});

test('deferSpawn next: a rider with no place to enter comes again as the very next spawn, the boss\'s guard stays right behind him', () => {
  const g = createGame(9);
  restart(g, 0);
  let now = 0, guardHeld = false;
  const order = [];
  for (let i = 0; i < 100000 && order.length < 3; i++) {
    now += 50;
    for (const ev of tickGame(g, 0.05, now)) {
      if (ev.type !== 'spawn') continue;
      if (g.wave < 5) { enemyKilled(g, {}, now); continue; }
      // the first guard finds no loop point out of sight once: he has to wait, and comes next
      if (ev.enemyType === 'biker' && !guardHeld) { guardHeld = true; deferSpawn(g, 'biker', true); continue; }
      order.push(ev.enemyType);
    }
    if (g.phase === 'shop') leaveShop(g, now);
  }
  assert.ok(guardHeld);
  assert.deepEqual(order, ['bossBiker', 'biker', 'biker']);
});

test('deferSpawn: a deferred spawn never takes alive below zero', () => {
  const g = createGame(1);
  g.queue = ['grunt']; g.alive = 0;
  deferSpawn(g, 'skater');
  assert.equal(g.alive, 0);
  assert.deepEqual(g.queue, ['skater', 'grunt']);
  assert.equal(g.waveEnemiesLeft, 2);
});

test('payVehicle: a vehicle shot out pays its score in points and money, without a kill or a streak', () => {
  const g = createGame(1);
  restart(g, 0);
  g.score = 500; g.money = 200; g.waveMoney = 100; g.alive = 2; g.streak = 2;
  const pts = payVehicle(g, 'moto');
  assert.equal(pts, VEHICLES.moto.score);
  assert.equal(g.score, 500 + VEHICLES.moto.score);
  assert.equal(g.money, 200 + VEHICLES.moto.score);
  assert.equal(g.waveMoney, 100 + VEHICLES.moto.score, 'listed with the wave money in the shop');
  assert.equal(g.player.kills, 0);
  assert.equal(g.alive, 2);
  assert.equal(g.streak, 2);
});

test('vehicleHp: the wave health multiplier applies to the vehicle as to its rider', () => {
  for (const k of Object.keys(VEHICLES)) {
    near(vehicleHp(k, waveHpMult(1)), VEHICLES[k].hp, 1e-9);
    near(vehicleHp(k, waveHpMult(7)), VEHICLES[k].hp * waveHpMult(7), 1e-9);
    assert.ok(vehicleHp(k, waveHpMult(7)) > VEHICLES[k].hp);
  }
  near(vehicleHp('scooter'), VEHICLES.scooter.hp, 1e-9, 'no multiplier: the plain number');
});

test('riderSlotFree: three riders on the streets at once, four in the endless mode', () => {
  for (let n = 1; n <= 10; n++) {
    assert.equal(riderSlotFree(2, n, false), true);
    assert.equal(riderSlotFree(3, n, false), false);
  }
  assert.equal(riderSlotFree(3, 20, true), true);
  assert.equal(riderSlotFree(4, 20, true), false);
});

test('pickRiderSpawn: on a loop, out of sight and at least 25 m from the player', () => {
  const routes = levelRoutes(), rng = createRng(11);
  const player = { x: 0, z: 36 };
  // the player sees the whole east half of the block
  const visible = (x) => x > 0;
  for (let i = 0; i < 60; i++) {
    const p = pickRiderSpawn(routes, player, visible, { rng });
    assert.ok(p, 'there is room somewhere');
    assert.ok(routes.includes(p.route));
    const q = p.route.sample(p.s);
    near(q.x, p.x, 1e-9); near(q.z, p.z, 1e-9);
    assert.ok(Math.hypot(p.x - player.x, p.z - player.z) >= RIDER_SPAWN.minDist, 'not closer than 25 m');
    assert.equal(visible(p.x, p.z), false, 'out of sight');
  }
});

test('pickRiderSpawn: nothing when every point is seen or too close; keeps its distance to vehicles on the loop', () => {
  const routes = levelRoutes(), rng = createRng(5);
  assert.equal(pickRiderSpawn(routes, { x: 0, z: 0 }, () => true, { rng }), null, 'all in sight');
  const main = routes.find((r) => r.id === 'main');
  // only the main loop is out of sight, and one vehicle is on it already
  const visible = (x, z) => Math.abs(z) > 8;
  const occupied = [{ route: main, s: 20 }];
  for (let i = 0; i < 60; i++) {
    const p = pickRiderSpawn(routes, { x: 0, z: 40 }, visible, { rng, occupied });
    assert.ok(p && p.route === main);
    const ds = Math.abs(((p.s - 20) % main.length + main.length * 1.5) % main.length - main.length / 2);
    assert.ok(ds >= RIDER_SPAWN.gap, 'at least gap metres along the loop from the vehicle there, got ' + ds);
  }
});

test('pickRiderSpawn: finds the one short stretch out of sight, every time', () => {
  const routes = levelRoutes();
  // only 3 m of the main loop, at its western end, are hidden from the player
  const hidden = (x, z) => x < -39.6 && z > -2.5 && z < 0.5;
  let found = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const p = pickRiderSpawn(routes, { x: 10, z: 30 }, (x, z) => !hidden(x, z), { rng: createRng(seed) });
    if (p && hidden(p.x, p.z)) found++;
  }
  assert.equal(found, 20);
});

test('newRiderKinds: each kind of rider is announced the first time a wave brings it', () => {
  const seen = new Set(), got = {};
  for (let n = 1; n <= 10; n++) {
    const kinds = newRiderKinds(waveRoster(n, false), seen);
    for (const k of kinds) seen.add(k.kind);
    if (kinds.length) got[n] = kinds;
  }
  assert.deepEqual(Object.keys(got).map(Number), [3, 5]);
  assert.deepEqual(got[3].map((k) => k.kind), ['scooterRider']);
  // the gang leader's guard brings the bikers two waves before their own wave 7
  assert.deepEqual(got[5].map((k) => k.kind).sort(), ['biker', 'skater']);
  assert.equal(got[5].find((k) => k.kind === 'biker').guard, true);
  assert.equal(got[5].find((k) => k.kind === 'skater').guard, false);
  assert.deepEqual(newRiderKinds(waveRoster(12, true), seen), [], 'the endless mode brings nothing new');
  // a game where no gang leader came first still announces the bikers in their own wave
  const fresh = new Set(['scooterRider', 'skater']);
  const w7 = newRiderKinds(waveRoster(7, false), fresh);
  assert.deepEqual(w7.map((k) => [k.kind, k.guard]), [['biker', false]]);
});

test('riderMarkerAlpha: a rider on a vehicle shows on the maps all the time, on foot by the radar rule', () => {
  for (const mode of ['fired', 'all']) {
    for (const since of [0, 1, MAP_MARKERS.firedSeconds + 5, 1e9]) {
      assert.ok(riderMarkerAlpha(mode, since, true) >= 0.85, 'mounted, ' + mode + ' ' + since);
      near(riderMarkerAlpha(mode, since, false), enemyMarkerAlpha(mode, since), 1e-12);
    }
  }
});
