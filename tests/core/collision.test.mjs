import { test, assert, near } from '../harness.mjs';
import {
  makeBox, boxFromMinMax, aabb, stepBody, moveBody, rayAABB, raycast, rayBox, lineOfSight, raySphere, rayVerticalCylinder,
  overlapsAny, COLLISION_DEFAULTS,
} from '../../src/core/collision.js';

const body = (o = {}) => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, radius: 0.35, height: 1.8, onGround: false, ...o });
const pbody = (o = {}) => ({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, radius: 0.35, height: 1.8, grounded: false, ...o });

test('a body falls and lands on the ground', () => {
  const b = body({ y: 3 });
  for (let i = 0; i < 240; i++) stepBody(b, 1 / 120, []);
  assert.equal(b.y, 0); assert.equal(b.onGround, true);
});
test('a wall stops horizontal motion', () => {
  const wall = makeBox(3, 2, 0, 1, 4, 10);
  const b = body({ vx: 5 });
  for (let i = 0; i < 240; i++) stepBody(b, 1 / 120, [wall]);
  assert.ok(b.x <= 2.5 - 0.35 + 1e-3 && b.x > 2.0, 'x=' + b.x);
});
test('a low ledge is stepped over, a tall one blocks', () => {
  const ledge = makeBox(2, 0.15, 0, 1, 0.3, 4);
  const b = body({ vx: 3 });
  for (let i = 0; i < 240; i++) stepBody(b, 1 / 120, [ledge]);
  assert.ok(b.x > 2.5, 'x=' + b.x);
  const wall = makeBox(2, 0.6, 0, 1, 1.2, 4);
  const c = body({ vx: 3 });
  for (let i = 0; i < 240; i++) stepBody(c, 1 / 120, [wall]);
  assert.ok(c.x < 1.5, 'x=' + c.x);
});
test('a jump of 1.1 m clears a 1.0 m crate and lands on top', () => {
  const crate = makeBox(2, 0.5, 0, 1, 1, 1);
  const b = body({ x: 0.6 });
  b.vy = Math.sqrt(2 * COLLISION_DEFAULTS.gravity * 1.1); b.vx = 2.2;
  for (let i = 0; i < 80; i++) stepBody(b, 1 / 120, [crate]);
  assert.ok(b.y >= 0.99 && b.y <= 1.01, 'y=' + b.y);
  assert.equal(b.onGround, true);
});
test('a head bump stops upward motion', () => {
  const ceil = makeBox(0, 2.5, 0, 6, 0.5, 6);
  const b = body({ vy: 9 });
  for (let i = 0; i < 30; i++) stepBody(b, 1 / 120, [ceil]);
  assert.ok(b.y + b.height <= 2.25 + 1e-3);
});
test('moveBody does not mutate its input and slides along a wall', () => {
  const wall = makeBox(2, 2, 0, 0.5, 4, 20);
  const input = pbody({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 4, y: 0, z: 4 }, grounded: true });
  const copy = JSON.stringify(input);
  let cur = input;
  for (let i = 0; i < 120; i++) cur = { ...cur, ...moveBody(cur, 1 / 60, [wall]) };
  assert.equal(JSON.stringify(input), copy);
  assert.ok(cur.pos.x < 1.75 - 0.3, 'x=' + cur.pos.x);
  assert.ok(cur.pos.z > 3, 'slid along the wall, z=' + cur.pos.z);
});
test('moving diagonally into a corner does not get stuck or pass through', () => {
  const a = boxFromMinMax(-10, 0, 2, 10, 3, 3), b = boxFromMinMax(2, 0, -10, 3, 3, 10);
  const cols = [a, b];
  let cur = pbody({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 3, y: 0, z: 3 }, grounded: true });
  for (let i = 0; i < 300; i++) { cur = { ...cur, ...moveBody(cur, 1 / 60, cols) }; cur.vel.x = 3; cur.vel.z = 3; }
  assert.ok(cur.pos.x < 2 && cur.pos.z < 2, `inside the corner pocket (${cur.pos.x}, ${cur.pos.z})`);
  assert.equal(overlapsAny({ ...cur.pos, radius: 0.35, height: 1.8 }, cols), false);
});
test('a body that starts inside a box is pushed out of it', () => {
  const box = makeBox(0, 1, 0, 2, 2, 2);
  const b = body({ x: 0.7, z: 0.2, y: 0 });
  stepBody(b, 1 / 60, [box]);
  assert.equal(overlapsAny(b, [box]), false);
});
test('rayAABB reports distance, point, normal and id', () => {
  const box = aabb({ x: -1, y: 0, z: 4 }, { x: 1, y: 2, z: 5 }, 'crate-1', ['cover']);
  const h = rayAABB({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 50, [box]);
  near(h.t, 4); near(h.point.z, 4); assert.equal(h.normal.z, -1); assert.equal(h.id, 'crate-1');
  assert.deepEqual(h.collider.tags, ['cover']);
});
test('rayAABB misses, and only hits the ground when asked', () => {
  const box = makeBox(0, 0, 0, 2, 2, 2);
  assert.equal(rayAABB({ x: -5, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 50, [box]), null);
  assert.equal(rayAABB({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 50, []), null);
  const g = rayAABB({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }, 50, [], { ground: true });
  near(g.t, 2); assert.equal(g.id, 'ground');
});
test('raycast picks the nearest box and rayBox gives the entry normal', () => {
  const a = makeBox(5, 1, 0, 1, 2, 2), b = makeBox(10, 1, 0, 1, 2, 2);
  assert.equal(raycast([b, a], 0, 1, 0, 1, 0, 0, 50).box, a);
  const h = rayBox(-5, 0, 0, 1, 0, 0, makeBox(0, 0, 0, 2, 2, 2));
  near(h.t, 4); assert.equal(h.nx, -1);
});
test('bullets pass through boxes that do not block bullets', () => {
  const fence = makeBox(5, 1, 0, 0.1, 2, 4, { blocksBullets: false });
  assert.equal(raycast([fence], 0, 1, 0, 1, 0, 0, 50, { bullets: true, noGround: true }), null);
  assert.ok(raycast([fence], 0, 1, 0, 1, 0, 0, 50, { noGround: true }));
});
test('lineOfSight is blocked by a wall and free beside it', () => {
  const wall = makeBox(5, 2, 0, 0.5, 4, 8);
  assert.equal(lineOfSight([wall], 0, 1.5, 0, 10, 1.5, 0), false);
  assert.equal(lineOfSight([wall], 0, 1.5, 10, 10, 1.5, 10), true);
});
test('ray against a sphere and a vertical cylinder', () => {
  near(raySphere(0, 0, -5, 0, 0, 1, 0, 0, 0, 1), 4);
  assert.equal(raySphere(0, 3, -5, 0, 0, 1, 0, 0, 0, 1), -1);
  near(rayVerticalCylinder(0, 1, -5, 0, 0, 1, 0, 0, 2, 0, 0.5), 4.5);
  assert.equal(rayVerticalCylinder(0, 3, -5, 0, 0, 1, 0, 0, 2, 0, 0.5), -1);
});
