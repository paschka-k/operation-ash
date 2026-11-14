// The commander's grenade: thrown at a point, it flies the same way as the player's (core/grenade).
import { test, assert, near } from '../harness.mjs';
import { launchGrenadeAt, stepGrenade } from '../../src/core/grenade.js';
import { GRENADE, BOSS } from '../../src/core/rules.js';

/** Fly until the grenade first touches the ground; returns where. */
function firstLanding(g) {
  for (let t = 0; t < 4; t += 1 / 120) {
    for (const ev of stepGrenade(g, 1 / 120, [])) if (ev.type === 'bounce') return ev;
    if (g.rest) return { x: g.x, y: g.y, z: g.z };
  }
  return null;
}

test('launchGrenadeAt: a lob from the hand lands on the target, near or far', () => {
  const from = { x: 2, y: 1.9, z: -3 };
  for (const [dx, dz] of [[BOSS.grenadeMin, 0], [0, 10], [-9, 9], [0, -BOSS.grenadeMax]]) {
    const target = { x: from.x + dx, z: from.z + dz };
    const g = launchGrenadeAt({ from, target, now: 500 });
    assert.deepEqual([g.x, g.y, g.z], [from.x, from.y, from.z]);
    assert.equal(g.fuseAt, 500 + GRENADE.fuseMs);
    assert.ok(g.vy > 0, 'thrown upwards in an arc');
    const land = firstLanding(g);
    assert.ok(land, 'it lands');
    near(Math.hypot(land.x - target.x, land.z - target.z), 0, 0.15, 'off the target by');
  }
});

test('launchGrenadeAt: the throw takes longer the further it goes, within limits', () => {
  const from = { x: 0, y: 1.9, z: 0 };
  const speed = (d) => { const g = launchGrenadeAt({ from, target: { x: d, z: 0 } }); return Math.hypot(g.vx, g.vz); };
  const time = (d) => d / speed(d);
  assert.ok(time(18) > time(6), 'a far throw flies longer');
  assert.ok(time(1) >= BOSS.throwTime.min - 1e-9 && time(40) <= BOSS.throwTime.max + 1e-9);
});
