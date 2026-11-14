// Hand grenades: the flight, bounces, rolling to a stop, the fuse and the blast numbers.
import { test, assert, near } from '../harness.mjs';
import { launchGrenade, stepGrenade, grenadeDue, grenadeSpeed, sweepBall } from '../../src/core/grenade.js';
import { GRENADE, explosionDamage, EXPLOSION, enemyParams } from '../../src/core/rules.js';
import { makeBox } from '../../src/core/collision.js';
import { explode } from '../../src/core/combat.js';

const DT = 1 / 60;
const eye = { x: 0, y: 1.62, z: 0 };

/** Run a grenade until the fuse, recording the path and the events. */
function fly(g, colliders, ms = GRENADE.fuseMs, dt = DT) {
  const path = [], events = [];
  for (let t = 0; t < ms / 1000; t += dt) {
    events.push(...stepGrenade(g, dt, colliders));
    path.push({ x: g.x, y: g.y, z: g.z, vx: g.vx });
  }
  return { path, events };
}

test('the counts and the fuse are what the shop and the HUD expect', () => {
  assert.deepEqual([GRENADE.start, GRENADE.max, GRENADE.price], [2, 4, 300]);
  assert.equal(GRENADE.fuseMs, 2500);
  assert.ok(GRENADE.releaseMs < GRENADE.throwMs);
});

test('a throw leaves along the view, arcing up, and keeps some of the thrower\'s speed', () => {
  const g = launchGrenade({ eye, dir: { x: 0, y: 0, z: -1 }, now: 1000 });
  assert.ok(g.vz < -13 && g.vy > 2, 'velocity ' + g.vx + ' ' + g.vy + ' ' + g.vz);
  near(grenadeSpeed(g), GRENADE.speed, 1e-9);
  near(g.z, -GRENADE.reach, 1e-9, 'starts in the hand, in front of the eye');
  assert.equal(g.fuseAt, 1000 + GRENADE.fuseMs);
  const run = launchGrenade({ eye, dir: { x: 0, y: 0, z: -1 }, vel: { x: 4, y: 0, z: 0 } });
  near(run.vx, 4 * GRENADE.inherit, 1e-9);
});

test('pressed against a wall, the grenade starts in front of it, not inside it', () => {
  const wall = makeBox(0, 2, -0.5, 4, 4, 0.2);          // face at z = -0.4
  const eyeAtWall = { x: 0, y: 1.62, z: -0.25 };         // 15 cm from the face: closer than the hand reaches
  assert.ok(0.15 < GRENADE.reach - GRENADE.radius, 'the setup only means something when the wall is within reach');
  const open = launchGrenade({ eye: eyeAtWall, dir: { x: 0, y: 0, z: -1 }, colliders: [] });
  assert.ok(open.z < -0.4, 'without the wall it would start beyond the face: ' + open.z);
  const g = launchGrenade({ eye: eyeAtWall, dir: { x: 0, y: 0, z: -1 }, colliders: [wall] });
  assert.ok(g.z > -0.4 + GRENADE.radius - 1e-6 && g.z <= eyeAtWall.z, 'z = ' + g.z);
  // and it does not tunnel on its first step either
  fly(g, [wall], 300);
  assert.ok(g.z > -0.4, 'stayed on this side: ' + g.z);
});

test('it bounces off a wall, never passes it, rolls and comes to rest on the ground', () => {
  const wall = makeBox(6.15, 2, 0, 0.3, 4, 6);           // face at x = 6
  const g = launchGrenade({ eye, dir: { x: 1, y: 0, z: 0 }, colliders: [wall] });
  const { path, events } = fly(g, [wall]);
  const maxX = Math.max(...path.map((p) => p.x));
  assert.ok(maxX <= 6 - GRENADE.radius + 1e-6, 'deepest point ' + maxX);
  assert.ok(maxX > 5.9, 'it reached the wall: ' + maxX);
  const wallHit = events.find((e) => e.type === 'bounce' && e.x > 5.5);
  assert.ok(wallHit && wallHit.speed > 8, 'a loud bounce off the wall');
  assert.ok(path.some((p) => p.vx < -1), 'it came back off the wall');
  assert.ok(events.some((e) => e.type === 'bounce' && e.y < 0.2), 'it bounced on the ground');
  assert.equal(g.rest, true, 'lying still before the fuse');
  near(g.y, GRENADE.radius, 0.005);
  assert.ok(g.x < 6 && g.x > 0, 'rests between the thrower and the wall: ' + g.x);
  assert.ok(events.some((e) => e.type === 'rest'));
});

test('a fast throw does not tunnel through a thin wall', () => {
  const thin = makeBox(3.01, 1.5, 0, 0.02, 3, 4);
  const g = launchGrenade({ eye, dir: { x: 1, y: -0.1, z: 0 } });
  g.vx = 60; g.vy = 0; g.vz = 0;                          // far faster than any throw
  const { path } = fly(g, [thin], 600, 1 / 30);
  assert.ok(Math.max(...path.map((p) => p.x)) < 3, 'stayed on this side');
});

test('it lands on a crate and stays on top of it', () => {
  const crate = makeBox(3, 0.5, 0, 1.6, 1, 1.6);
  const g = launchGrenade({ eye: { x: 2.8, y: 2.4, z: 0 }, dir: { x: 0.1, y: -1, z: 0 }, colliders: [crate] });
  fly(g, [crate]);
  assert.equal(g.rest, true);
  near(g.y, 1 + GRENADE.radius, 0.005);
  assert.ok(Math.abs(g.x - 3) < 0.8);
});

test('a grenade lying on a crate drops when the crate is gone', () => {
  const crate = makeBox(3, 0.5, 0, 1.6, 1, 1.6);
  const g = launchGrenade({ eye: { x: 2.8, y: 2.4, z: 0 }, dir: { x: 0.1, y: -1, z: 0 }, colliders: [crate] });
  fly(g, [crate]);
  assert.equal(g.rest, true);
  fly(g, [], 1500);
  near(g.y, GRENADE.radius, 0.005);
});

test('the flight is deterministic: the same throw lands in the same place', () => {
  const box = makeBox(4, 1, 2, 1, 2, 1);
  const a = launchGrenade({ eye, dir: { x: 0.8, y: 0.1, z: 0.6 }, colliders: [box] });
  const b = launchGrenade({ eye, dir: { x: 0.8, y: 0.1, z: 0.6 }, colliders: [box] });
  fly(a, [box]); fly(b, [box]);
  assert.deepEqual([a.x, a.y, a.z], [b.x, b.y, b.z]);
});

test('the fuse burns 2.5 s from the throw', () => {
  const g = launchGrenade({ eye, dir: { x: 0, y: 0, z: 1 }, now: 4000 });
  assert.equal(grenadeDue(g, 4000), false);
  assert.equal(grenadeDue(g, 4000 + GRENADE.fuseMs - 1), false);
  assert.equal(grenadeDue(g, 4000 + GRENADE.fuseMs), true);
});

test('sweepBall reports the face that is hit and ignores boxes far from the move', () => {
  const box = makeBox(2, 1, 0, 1, 2, 1);                  // x from 1.5 to 2.5
  const h = sweepBall([box], 0, 1, 0, 1, 0, 0, 5, 0.1);
  near(h.t, 1.4, 1e-9); assert.deepEqual([h.nx, h.ny, h.nz], [-1, 0, 0]);
  assert.equal(sweepBall([box], 0, 1, 0, 1, 0, 0, 1, 0.1), null);
  const down = sweepBall([], 0, 1, 0, 0, -1, 0, 5, 0.1);
  near(down.t, 0.9, 1e-9); assert.equal(down.ny, 1);
});

test('the blast: bigger than a barrel, kills a tier 1 grunt lying at its feet, cover shields it', () => {
  assert.ok(GRENADE.blastRadius > EXPLOSION.radius && GRENADE.blastDamage > EXPLOSION.damage);
  const center = { x: 0, y: GRENADE.radius, z: 0 };         // the blast is centred on the grenade lying on the ground
  const hp = enemyParams('grunt', 1).hp;
  const near1 = { x: 1, y: 0, z: 0, alive: true };
  const far = { x: 5, y: 0, z: 0, alive: true };
  const [a] = explode({ center, radius: GRENADE.blastRadius, damage: GRENADE.blastDamage, targets: [near1] });
  assert.ok(a.damage >= hp, 'a grunt 1 m away takes ' + a.damage);
  const [b] = explode({ center, radius: GRENADE.blastRadius, damage: GRENADE.blastDamage, targets: [far] });
  assert.ok(b.damage < 20, 'at 5 m only ' + b.damage);
  const wall = makeBox(0.6, 1, 0, 0.2, 2, 2);
  const [c] = explode({ center, radius: GRENADE.blastRadius, damage: GRENADE.blastDamage, targets: [near1], colliders: [wall] });
  assert.ok(c.shielded && c.damage < hp);
  near(explosionDamage(0, GRENADE.blastRadius, GRENADE.blastDamage), GRENADE.blastDamage);
});
