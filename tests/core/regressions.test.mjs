// Bugs found by the independent code review, kept as tests so they stay fixed.
import { test, assert } from '../harness.mjs';
import { createGame, restart, damagePlayer, tickGame } from '../../src/core/waves.js';
import { NavGrid } from '../../src/core/nav.js';
import { makeBox } from '../../src/core/collision.js';

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
