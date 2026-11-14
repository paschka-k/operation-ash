import { test, assert } from '../harness.mjs';
import { thinkBoss } from '../../src/core/boss.js';
import { createEnemy } from '../../src/core/ai.js';
import { ENEMY_TYPES, BOSS } from '../../src/core/rules.js';
import { makeBox, createRng } from '../../src/core/collision.js';

const EVERY = ENEMY_TYPES.bossCommander.grenadeEvery * 1000;

/** A commander at the origin and a world with the player `dist` metres north, a wall between them or not. */
function setup({ dist = 12, wall = false, seed = 1 } = {}) {
  const rng = createRng(seed);
  const e = createEnemy({ x: 0, z: 0, type: 'bossCommander', state: 'combat', lastSeen: { x: 0, z: dist } }, 3, rng);
  const world = {
    player: { x: 0, y: 0, z: dist, eye: { x: 0, y: 1.62, z: dist }, alive: true, speedFrac: 0, sprinting: false, crouched: false, airborne: false },
    colliders: wall ? [makeBox(0, 2, dist / 2, 8, 4, 0.4)] : [],
    nav: { findPath: () => null, walkable: () => true },
    coverIndex: null,
    spawnPoints: [{ x: 0, z: 0 }],
    rng,
    budget: { path: 3, cover: 2 },
  };
  return { e, world };
}

/** Think for `secs` at 60 Hz; the body is moved by `move(e, t)` if given (the game layer's job). */
function run(e, world, secs, move = null, from = 0) {
  const out = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    world.budget.path = 3; world.budget.cover = 2;
    const now = from + t * 1000;
    if (move) move(e, t);
    out.push({ now, intent: thinkBoss(e, world, 1 / 60, now), state: e.state });
  }
  return out;
}

test('thinkBoss: grenades only at the player it sees, never more often than grenadeEvery', () => {
  const { e, world } = setup();
  const log = run(e, world, 30);
  const throws = log.filter((f) => f.intent.grenade);
  assert.ok(throws.length >= 3, 'throws in 30 s: ' + throws.length);
  assert.ok(throws.length <= Math.floor(30000 / EVERY) + 1, 'too many: ' + throws.length);
  for (let i = 1; i < throws.length; i++) assert.ok(throws[i].now - throws[i - 1].now >= EVERY - 1e-6, 'gap ' + (throws[i].now - throws[i - 1].now));
  for (const t of throws) assert.deepEqual(t.intent.grenade, { x: 0, z: 12 });
  // the rest of the intent is thinkEnemy's: it still shoots
  assert.ok(log.some((f) => f.intent.fire), 'fires bursts too');
});

test('thinkBoss: no grenade at a player it cannot see', () => {
  const { e, world } = setup({ wall: true });
  const log = run(e, world, 30);
  assert.equal(log.filter((f) => f.intent.grenade).length, 0);
  const dead = setup();
  dead.world.player.alive = false;
  assert.equal(run(dead.e, dead.world, 20).filter((f) => f.intent.grenade).length, 0);
});

test('thinkBoss: no grenade at point blank or out of throwing range', () => {
  for (const dist of [BOSS.grenadeMin - 1, BOSS.grenadeMax + 4]) {
    const { e, world } = setup({ dist });
    assert.equal(run(e, world, 20).filter((f) => f.intent.grenade).length, 0, 'at ' + dist + ' m');
  }
});

test('thinkBoss: a boss that stands 4 seconds goes after the player', () => {
  const { e, world } = setup();                        // nothing moves its body here: it stands where it is
  const log = run(e, world, 6);
  assert.equal(log.filter((f) => f.now < BOSS.standSecs * 1000 - 20 && f.state === 'chase').length, 0, 'not before 4 s');
  const first = log.find((f) => f.state === 'chase');
  assert.ok(first, 'never moved on');
  assert.ok(first.now >= BOSS.standSecs * 1000 - 20 && first.now <= BOSS.standSecs * 1000 + 50, 'went after it at ' + first.now);
  assert.deepEqual(e.lastSeen && [Math.round(e.lastSeen.x), Math.round(e.lastSeen.z)], [0, 12], 'heads for where the player is');
});

test('thinkBoss: a boss that keeps moving is left alone', () => {
  const { e, world } = setup();
  const log = run(e, world, 8, (b, t) => { b.x = Math.sin(t) * 3; });   // walks back and forth over 6 m
  assert.equal(log.filter((f) => f.state === 'chase').length, 0);
});
