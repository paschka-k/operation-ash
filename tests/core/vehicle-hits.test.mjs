import { test, assert, near } from '../harness.mjs';
import { resolveShot, applyDamage, explode, rayTargets, targetZones } from '../../src/core/combat.js';
import { makeBox, createRng, v3, vec3 } from '../../src/core/collision.js';
import { explosionDamage } from '../../src/core/rules.js';

// A motorbike as core/combat sees it: yaw follows the heading convention atan2(dx, dz), so yaw = PI/2
// points it along +x. Length runs along the heading, width across it.
const bike = (o = {}) => ({
  id: 'v1', kind: 'vehicle', x: 10, y: 0, z: 0, yaw: Math.PI / 2, length: 2, width: 0.8, height: 1.2,
  alive: true, hp: 140, armor: 0.8, ...o,
});
const ray = (ox, oy, oz, dx, dy, dz) => [vec3(ox, oy, oz), v3.normalize(vec3(dx, dy, dz))];

test('vehicle: a ray across its side hits the turned box, zone "vehicle"', () => {
  const v = bike();
  const h = rayTargets(...ray(10, 0.6, -10, 0, 0, 1), 100, [v]);
  assert.ok(h, 'hit');
  assert.equal(h.target, v);
  assert.equal(h.zone, 'vehicle');
  near(h.t, 10 - 0.4, 1e-9);                       // the side of a 0.8 m wide bike
  assert.equal(targetZones(v).vehicle.length, 2);
});

test('vehicle: the box is turned by yaw: hits along its length, misses beside its width', () => {
  const v = bike();
  // 0.8 m off the centre along the heading: inside the 2 m long bike (an unturned box would be 0.8 m wide here)
  assert.ok(rayTargets(...ray(10.8, 0.6, -10, 0, 0, 1), 100, [v]), 'along the length');
  // 0.7 m off the centre across the heading: outside the 0.8 m wide bike (an unturned box would be 2 m long here)
  assert.equal(rayTargets(...ray(0, 0.6, 0.7, 1, 0, 0), 100, [v]), null, 'beside it');
  // over it and under the ground plane of its box
  assert.equal(rayTargets(...ray(10, 1.4, -10, 0, 0, 1), 100, [v]), null, 'over the top');
});

test('vehicle: a box turned 45 degrees, hit end on along its axis', () => {
  const v = bike({ x: 0, z: 0, yaw: Math.PI / 4 });
  const h = rayTargets(...ray(-5, 0.6, -5, 1, 0, 1), 100, [v]);
  near(h.t, 5 * Math.SQRT2 - 1, 1e-9);             // the back end is half a length before the centre
});

test('vehicle: a long vehicle is not dropped by the 1 m pre-check of a soldier', () => {
  const heavy = bike({ length: 2.4 });
  const h = rayTargets(...ray(11.1, 0.6, -10, 0, 0, 1), 100, [heavy]);
  assert.ok(h && h.zone === 'vehicle', '1.1 m from the centre along the length');
});

test('vehicle: the nearest of a rider and his vehicle takes the bullet', () => {
  const v = bike({ x: 0, z: -10, yaw: 0 });
  const rider = { id: 'r1', x: 0, y: 0.1, z: -10.3, scale: 1, crouch: 0, alive: true, hp: 100, armor: 1 };
  const low = rayTargets(vec3(0, 0.5, 0), vec3(0, 0, -1), 100, [rider, v]);
  assert.equal(low.target, v, 'at wheel height the bike is in front');
  near(low.t, 9, 1e-9);
  const high = rayTargets(vec3(0, 1.6, 0), vec3(0, 0, -1), 100, [v, rider]);
  assert.equal(high.target, rider, 'above the bike the rider is hit');
  assert.equal(rayTargets(vec3(0, 0.5, 0), vec3(0, 0, -1), 100, [bike({ x: 0, z: -10, yaw: 0, alive: false })]), null, 'a wreck takes no bullets');
});

test('vehicle: resolveShot stops at a wall in front of it and hits it in the open', () => {
  const v = bike({ x: 0, z: -10, yaw: 0 });
  const wall = makeBox(0, 1, -5, 4, 2, 0.3);
  const open = resolveShot({ origin: vec3(0, 0.6, 0), dir: vec3(0, 0, -1), rng: createRng(1), targets: [v], colliders: [] });
  assert.equal(open[0].kind, 'target'); assert.equal(open[0].zone, 'vehicle');
  const blocked = resolveShot({ origin: vec3(0, 0.6, 0), dir: vec3(0, 0, -1), rng: createRng(1), targets: [v], colliders: [wall] });
  assert.equal(blocked[0].kind, 'world');
});

test('vehicle: damage goes through its armour, explosions hit it at the centre of its box', () => {
  const v = bike();
  const r = applyDamage(v, 50, 'vehicle');
  near(r.damage, 40, 1e-9);
  near(v.hp, 100, 1e-9);
  const hits = explode({ center: vec3(12, 0.6, 0), radius: 5, damage: 120, targets: [bike()], colliders: [] });
  assert.equal(hits.length, 1);
  near(hits[0].dist, 2, 1e-9);                     // box centre at (10, 0.6, 0)
  near(hits[0].damage, explosionDamage(2, 5, 120), 1e-9);
  assert.equal(explode({ center: vec3(12, 0.6, 0), targets: [bike({ alive: false })] }).length, 0);
});
