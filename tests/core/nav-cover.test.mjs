import { test, assert } from '../harness.mjs';
import { NavGrid } from '../../src/core/nav.js';
import { generateCoverPoints, indexCover, findCover } from '../../src/core/cover.js';
import { makeBox, boxFromMinMax, createRng } from '../../src/core/collision.js';

test('nav finds a path around a wall, simplified into walkable segments', () => {
  const nav = new NavGrid(20, 1, 0.45);
  nav.addBox(boxFromMinMax(-0.5, 0, -10, 0.5, 3, 10));
  const p = nav.findPath(-8, 0, 8, 0);
  assert.ok(p && p.length >= 1);
  const last = p[p.length - 1];
  assert.ok(Math.hypot(last.x - 8, last.z) < 1.5);
  let ax = -8, az = 0;
  for (const w of p) { assert.ok(nav.walkable(ax, az, w.x, w.z)); ax = w.x; az = w.z; }
});
test('nav adding and removing a box is reversible', () => {
  const nav = new NavGrid(10, 1, 0.45);
  const box = makeBox(0, 1, 0, 2, 2, 2);
  nav.addBox(box); assert.equal(nav.blockedAt(0, 0), true);
  nav.removeBox(box); assert.equal(nav.blockedAt(0, 0), false);
});
test('nav ignores low obstacles and reports unreachable goals', () => {
  const nav = new NavGrid(10, 1, 0.45);
  nav.addBox(makeBox(0, 0.15, 0, 2, 0.3, 2));
  assert.equal(nav.blockedAt(0, 0), false);
  nav.addBox(boxFromMinMax(-10, 0, -0.5, 10, 3, 0.5));
  assert.equal(nav.findPath(0, -5, 0, 5), null);
});
test('nav flood fill marks reachable cells only', () => {
  const nav = new NavGrid(10, 1, 0.45);
  nav.addBox(boxFromMinMax(-10, 0, -0.5, 10, 3, 0.5));
  const mask = nav.reachableFrom(0, -5);
  assert.equal(mask[nav.idx(nav.toCell(0), nav.toCell(-5))], 1);
  assert.equal(mask[nav.idx(nav.toCell(0), nav.toCell(5))], 0);
});

const world = () => {
  const nav = new NavGrid(30, 1, 0.45);
  const wall = boxFromMinMax(-2, 0, -1, 2, 2.4, 0);
  nav.addBox(wall);
  return { nav, colliders: [wall], wall };
};
test('cover points sit just outside tall obstacles and not inside any', () => {
  const { nav, colliders } = world();
  const pts = generateCoverPoints(colliders, nav);
  assert.ok(pts.length >= 6);
  for (const p of pts) assert.equal(nav.blockedAt(p.x, p.z), false);
});
test('low things are not cover', () => {
  const nav = new NavGrid(30, 1, 0.45);
  const low = boxFromMinMax(-2, 0, -1, 2, 0.4, 0);
  assert.equal(generateCoverPoints([low], nav).length, 0);
});
test('findCover returns a point hidden from the player, with a peek position that sees them', () => {
  const { nav, colliders } = world();
  const index = indexCover(generateCoverPoints(colliders, nav), 30);
  const eye = { x: 0, y: 1.6, z: 15 };
  const c = findCover({
    index, colliders, nav, rnd: createRng(3), enemy: { x: 4, z: -6 }, player: { x: 0, z: 15 }, eye, samples: 60,
  });
  assert.ok(c, 'found cover');
  assert.ok(c.z < 0, 'behind the wall from the player (z=' + c.z + ')');
  assert.ok(c.peek, 'has a peek position');
});
test('cover index returns points within the radius only', () => {
  const { nav, colliders } = world();
  const index = indexCover(generateCoverPoints(colliders, nav), 30);
  assert.equal(index.near(25, 25, 4).length, 0);
  assert.ok(index.near(0, 0, 6).length > 0);
});
