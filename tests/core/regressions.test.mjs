// Bugs found by the independent code review, kept as tests so they stay fixed.
import { test, assert } from '../harness.mjs';
import { createGame, restart, damagePlayer, tickGame } from '../../src/core/waves.js';
import { NavGrid } from '../../src/core/nav.js';
import { makeBox, stepBody, standingHeight } from '../../src/core/collision.js';

test('damage after the last wave is won cannot kill the player', () => {
  const g = createGame(7);
  restart(g, 0);
  g.phase = 'victory';
  const before = g.player.health;
  const r = damagePlayer(g, 500, 1000);
  assert.equal(r.dead, false);
  assert.equal(g.player.health, before);
  assert.equal(g.phase, 'victory', 'the phase must not flip to dead');
  // the victory phase stays put when the clock runs on
  assert.deepEqual(tickGame(g, 0.05, 1100), []);
  assert.equal(g.phase, 'victory');
});

test('a dead player stays dead and further damage is ignored', () => {
  const g = createGame(7);
  restart(g, 0);
  g.phase = 'wave';
  assert.equal(damagePlayer(g, 500, 10).dead, true);
  assert.equal(g.phase, 'dead');
  assert.deepEqual(damagePlayer(g, 10, 20), { health: 0, dead: true });
});

test('the nav grid blocks anything a bot cannot step over (0.4 m)', () => {
  const nav = new NavGrid(10, 0.5, 0.4);
  nav.addBox(makeBox(0, 0.25, 0, 1, 0.5, 1, { kind: 'wood' }));   // 0.5 m tall: a pallet stack, a cot
  nav.addBox(makeBox(5, 0.15, 0, 1, 0.3, 1, { kind: 'wood' }));   // 0.3 m tall: a kerb, steppable
  assert.equal(nav.blockedAt(0, 0), true);
  assert.equal(nav.blockedAt(5, 0), false);
});

test('restart gives a clean game even after a long previous one', () => {
  const g = createGame(3);
  restart(g, 0);
  tickGame(g, 0.05, 99000);          // the old game ran for 99 s
  restart(g, 0);                     // the clock goes back to zero with it
  let started = false;
  for (let now = 50; now < 6000 && !started; now += 50) started = tickGame(g, 0.05, now).some((e) => e.type === 'waveStart');
  assert.equal(started, true, 'the first wave must start within 6 s of a restart');
});

// Two nested low steps (a spill of rubble) with a long wall close behind the walker.
function spill() {
  return [
    makeBox(5, 0.09, 0, 4, 0.18, 4),          // lower step, 0.18 m
    makeBox(5.02, 0.18, 0, 3.94, 0.36, 3.6),  // upper step, 0.36 m, its edge 5 cm inside the lower one
    makeBox(-1, 2, 0, 0.4, 4, 200),           // a 200 m long wall just behind the start
  ];
}

test('a walker that touches two stacked low steps at once climbs them and is not thrown aside', () => {
  const colliders = spill();
  const b = { x: 2.6, y: 0, z: 0.3, vx: 3.5, vy: 0, vz: 0, radius: 0.33, height: 1.8, onGround: true };
  for (let i = 0; i < 60; i++) { b.vx = 3.5; b.vz = 0; stepBody(b, 1 / 60, colliders, { gravity: 22, stepHeight: 0.4 }); }
  assert.ok(Math.abs(b.z - 0.3) < 0.01, 'stays on its line, z = ' + b.z);
  assert.ok(b.x > 4.5, 'keeps walking, x = ' + b.x);
  assert.ok(Math.abs(b.y - 0.36) < 0.01, 'stands on the upper step, y = ' + b.y);
});

test('a body placed inside a low spill ends up on top of it, not at the far end of a wall', () => {
  const colliders = spill();
  const b = { x: 3.4, y: 0, z: 0.2, vx: 0, vy: 0, vz: 0, radius: 0.33, height: 1.8, onGround: true };
  for (let i = 0; i < 30; i++) { b.vx = 1; b.vz = 0; stepBody(b, 1 / 60, colliders, { gravity: 22, stepHeight: 0.4 }); }
  assert.ok(Math.abs(b.z - 0.2) < 0.05, 'z stays put, got ' + b.z);
  assert.ok(b.x > 3.4 && b.x < 5, 'x moves a little forward, got ' + b.x);
  assert.ok(b.y > 0.17, 'lifted onto the spill, y = ' + b.y);
});

test('standingHeight: the top of the highest low box under the feet, never a wall', () => {
  const colliders = spill();
  assert.equal(standingHeight(-5, 0, 0.33, colliders), 0);            // open ground
  assert.equal(standingHeight(2.7, 0, 0.33, colliders), 0.18);        // the footprint reaches the lower step only
  assert.equal(standingHeight(5, 0, 0.33, colliders), 0.36);          // on both
  assert.equal(standingHeight(-1, 0, 0.33, colliders), 0);            // inside the wall footprint: walls are not floors
});
