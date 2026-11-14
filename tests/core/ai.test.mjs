import { test, assert } from '../harness.mjs';
import { createEnemy, thinkEnemy, hearNoise, alertNearby, enemyHurt } from '../../src/core/ai.js';
import { NavGrid } from '../../src/core/nav.js';
import { generateCoverPoints, indexCover } from '../../src/core/cover.js';
import { boxFromMinMax, createRng, lineOfSight } from '../../src/core/collision.js';

function makeWorld({ colliders = [], player = { x: 0, z: 30 }, seed = 1, cover = true } = {}) {
  const nav = new NavGrid(45, 1, 0.45);
  colliders.forEach((c) => nav.addBox(c));
  const pts = cover ? generateCoverPoints(colliders, nav) : [];
  return {
    player: { x: player.x, y: 0, z: player.z, eye: { x: player.x, y: 1.6, z: player.z }, alive: true, speedFrac: 0, sprinting: false, crouched: false, airborne: false },
    colliders, nav, coverIndex: indexCover(pts, 45), spawnPoints: [{ x: 10, z: 10 }, { x: -10, z: 10 }],
    rng: createRng(seed), budget: { path: 3, cover: 2 },
  };
}

/** One frame: think, then move the bot the way the squad layer would. */
function frame(e, w, dt, now) {
  w.budget = { path: 3, cover: 2 };
  const i = thinkEnemy(e, w, dt, now);
  if (i.speed > 0) { e.x += i.moveX * i.speed * dt; e.z += i.moveZ * i.speed * dt; }
  return i;
}
function simulate(e, w, seconds, onFrame) {
  const dt = 1 / 30;
  let now = 0;
  for (let t = 0; t < seconds; t += dt) { now += dt * 1000; const i = frame(e, w, dt, now); if (onFrame) onFrame(i, t, e); }
}

test('a dead bot does nothing', () => {
  const e = createEnemy({ x: 0, z: 0 }, 1, createRng(1));
  e.alive = false;
  const i = thinkEnemy(e, makeWorld(), 0.03, 0);
  assert.deepEqual(i, { moveX: 0, moveZ: 0, speed: 0, fire: null, laser: 0, cue: false, alert: 0 });
});
test('a bot that sees the player turns to combat and alerts its neighbours once', () => {
  const w = makeWorld({ player: { x: 0, z: 20 } });
  const e = createEnemy({ x: 0, z: 0, yaw: 0 }, 2, createRng(2));
  let alerts = 0;
  simulate(e, w, 1, (i) => { if (i.alert) alerts++; });
  assert.equal(e.state, 'combat');
  assert.equal(alerts, 1);
});
test('a wall between bot and player keeps the bot calm', () => {
  const wall = boxFromMinMax(-10, 0, 8, 10, 3, 9);
  const w = makeWorld({ colliders: [wall], player: { x: 0, z: 20 } });
  const e = createEnemy({ x: 0, z: 0, yaw: 0 }, 2, createRng(2));
  simulate(e, w, 2);
  assert.notEqual(e.state, 'combat');
  assert.equal(e.sees, false);
});
test('a bot behind the player does not notice them at distance', () => {
  const w = makeWorld({ player: { x: 0, z: -30 } });
  const e = createEnemy({ x: 0, z: 0, yaw: 0 }, 2, createRng(2));
  e.state = 'idle'; e.idleT = 99;
  simulate(e, w, 0.5);
  assert.notEqual(e.state, 'combat');
});
test('a rusher fights in the open: warns first, then fires a burst, and spends ammo', () => {
  const w = makeWorld({ player: { x: 0, z: 12 } });
  const e = createEnemy({ x: 0, z: 0, yaw: 0, type: 'rusher' }, 3, createRng(3));
  let firstCue = -1, firstFire = -1, shots = 0, laserSeen = false;
  simulate(e, w, 8, (i, t) => {
    if (i.cue && firstCue < 0) firstCue = t;
    if (i.laser > 0) laserSeen = true;
    if (i.fire) { shots++; if (firstFire < 0) firstFire = t; assert.ok(i.fire.dist > 0); }
  });
  assert.ok(firstCue >= 0 && firstFire > firstCue, `cue ${firstCue}, fire ${firstFire}`);
  assert.ok(laserSeen);
  assert.ok(shots >= 2, 'shots ' + shots);
  assert.ok(e.mag < e.magSize || e.reloadT > 0);
});
test('tier 3 bots shoot much more often than tier 1', () => {
  const count = (tier) => {
    const w = makeWorld({ player: { x: 0, z: 14 }, seed: 5 });
    const e = createEnemy({ x: 0, z: 0, yaw: 0, type: 'grunt' }, tier, createRng(5));
    e.T = { ...e.T, cover: false };
    let n = 0;
    simulate(e, w, 30, (i) => { if (i.fire) n++; });
    return n;
  };
  const t1 = count(1), t3 = count(3);
  assert.ok(t3 > t1 * 1.8, `tier1 ${t1}, tier3 ${t3}`);
});
test('a magazine runs dry and the bot reloads before it can shoot again', () => {
  const w = makeWorld({ player: { x: 0, z: 14 } });
  const e = createEnemy({ x: 0, z: 0, yaw: 0, type: 'rusher' }, 3, createRng(8));
  let sawReload = false, shots = 0;
  simulate(e, w, 40, (i, t, en) => { if (i.fire) shots++; if (en.reloadT > 0) sawReload = true; });
  assert.ok(shots > e.magSize, 'fired more than one magazine: ' + shots);
  assert.ok(sawReload);
});
test('a grunt hides behind an obstacle, peeks, aims and only fires with a clear line', () => {
  const wall = boxFromMinMax(-3, 0, 16, 3, 2.4, 17);
  const w = makeWorld({ colliders: [wall], player: { x: 0, z: 30 }, seed: 4 });
  const e = createEnemy({ x: 0, z: 22, yaw: Math.PI }, 3, createRng(4));
  const phases = new Set();
  let shots = 0, hiddenWhileCovered = false, clearOnFire = true;
  simulate(e, w, 60, (i, t, en) => {
    if (en.state === 'combat') phases.add(en.phase);
    if (en.phase === 'covered' && !lineOfSight(w.colliders, en.x, 1.55, en.z, 0, 1.4, 30)) hiddenWhileCovered = true;
    if (i.fire) { shots++; if (!lineOfSight(w.colliders, en.x, 1.55, en.z, 0, 1.4, 30)) clearOnFire = false; }
  });
  for (const p of ['toCover', 'covered', 'peek', 'aim', 'fire']) assert.ok(phases.has(p), 'phase ' + p + ' in ' + [...phases]);
  assert.ok(hiddenWhileCovered, 'was hidden while covered');
  assert.ok(shots > 0, 'fired from the peek position');
  assert.ok(clearOnFire, 'fired only with a clear line of sight');
});
test('with no cover on the map a grunt fights in the open', () => {
  const w = makeWorld({ player: { x: 0, z: 25 }, cover: false });
  const e = createEnemy({ x: 0, z: 0, yaw: 0 }, 3, createRng(6));
  let shots = 0;
  simulate(e, w, 20, (i) => { if (i.fire) shots++; });
  assert.equal(e.phase, 'exposed');
  assert.ok(shots > 0);
});
test('a bot that lost the player for a long time goes looking for them', () => {
  const w = makeWorld({ player: { x: 0, z: 25 } });
  const e = createEnemy({ x: 0, z: 0, yaw: 0 }, 2, createRng(7));
  e.state = 'combat'; e.phase = 'covered'; e.cover = { x: 0, z: 0, peek: null }; e.coverT = 1e9;
  w.player.alive = true;
  e.sees = false; e.unseenT = 15;
  w.colliders.push(boxFromMinMax(-20, 0, 12, 20, 4, 13));
  thinkEnemy(e, w, 0.03, 0);
  assert.equal(e.state, 'chase');
});
test('noise: idle bots in range come to look, fighting and far bots ignore it', () => {
  const near1 = createEnemy({ x: 5, z: 0 }, 1, createRng(1)), far = createEnemy({ x: 80, z: 0 }, 1, createRng(1));
  const fighting = createEnemy({ x: 4, z: 0 }, 1, createRng(1));
  fighting.state = 'combat';
  hearNoise([near1, far, fighting], 0, 0, 20, createRng(2));
  assert.equal(near1.state, 'chase'); assert.ok(near1.lastSeen);
  assert.equal(far.state, 'idle'); assert.equal(fighting.state, 'combat');
});
test('alertNearby sends neighbours to the area where the player is', () => {
  const a = createEnemy({ x: 0, z: 0 }, 1, createRng(1)), b = createEnemy({ x: 6, z: 0 }, 1, createRng(1)), c = createEnemy({ x: 60, z: 0 }, 1, createRng(1));
  alertNearby([a, b, c], a, { x: 10, z: 30 }, 16, createRng(3));
  assert.equal(b.state, 'chase'); assert.equal(c.state, 'idle'); assert.equal(a.state, 'idle');
  assert.ok(Math.abs(b.lastSeen.x - 10) <= 4 && Math.abs(b.lastSeen.z - 30) <= 4);
});
test('a hit pulls a calm bot into combat and makes a hidden bot move', () => {
  const calm = createEnemy({ x: 0, z: 0 }, 1, createRng(1));
  const r = enemyHurt(calm, { source: 'player', player: { x: 5, z: 5 }, rng: createRng(1) });
  assert.equal(calm.state, 'combat'); assert.equal(r.alert, 14); assert.ok(calm.flinch > 0);
  const hidden = createEnemy({ x: 0, z: 0 }, 1, createRng(1));
  hidden.state = 'combat'; hidden.phase = 'covered'; hidden.cover = { x: 1, z: 1 };
  enemyHurt(hidden, { source: 'player', player: { x: 5, z: 5 }, rng: createRng(1) });
  assert.equal(hidden.phase, 'seek'); assert.equal(hidden.cover, null);
  // the player's flamer burns a bot out of its cover too (its damage comes with source 'fire')
  const burning = createEnemy({ x: 0, z: 0 }, 1, createRng(1));
  burning.state = 'combat'; burning.phase = 'covered'; burning.cover = { x: 1, z: 1 };
  enemyHurt(burning, { source: 'fire', player: { x: 5, z: 5 }, rng: createRng(1) });
  assert.equal(burning.phase, 'seek');
  // a barrel going off next to it does not
  const shaken = createEnemy({ x: 0, z: 0 }, 1, createRng(1));
  shaken.state = 'combat'; shaken.phase = 'covered'; shaken.cover = { x: 1, z: 1 };
  enemyHurt(shaken, { source: 'barrel', player: { x: 5, z: 5 }, rng: createRng(1) });
  assert.equal(shaken.phase, 'covered');
});
test('a bot that walks into a wall repaths instead of pushing forever', () => {
  const w = makeWorld({ player: { x: 0, z: 40 } });
  const e = createEnemy({ x: 0, z: 0 }, 1, createRng(1));
  e.state = 'chase'; e.lastSeen = { x: 0, z: 30 };
  let cleared = false;
  const dt = 1 / 30;
  for (let t = 0; t < 3; t += dt) {
    w.budget = { path: 3, cover: 2 };
    thinkEnemy(e, w, dt, t * 1000);   // the body never moves: it is stuck
    if (e.path === null) cleared = true;
  }
  assert.ok(cleared);
});
