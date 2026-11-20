import fs from 'node:fs';
import { test, assert, near } from '../harness.mjs';
import { ROUTES, buildRoute, routeClearance, onRoute } from '../../src/core/routes.js';

// A 20 x 10 m rectangle, corners rounded with 2 m: four quarter circles replace 4 m of straight each.
const RECT = { id: 'rect', points: [[0, 0], [20, 0], [20, 10], [0, 10]], closed: true, width: 1.6, radius: 2 };
const RECT_LENGTH = 2 * (20 + 10) - 4 * 4 + 4 * (Math.PI * 2 / 2);

/** The colliders of the level as the game had them (static, solid, above 0.42 m), see the fixture's note. */
function streetColliders() {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/street-colliders.json', import.meta.url), 'utf8'));
  return raw.colliders.map(([minX, minY, minZ, maxX, maxY, maxZ]) => ({ minX, minY, minZ, maxX, maxY, maxZ, solid: true }));
}

test('routes: a rounded rectangle has the length of its straights and quarter circles', () => {
  const r = buildRoute(RECT);
  near(r.length, RECT_LENGTH, 1e-6);
  assert.equal(r.id, 'rect');
  assert.equal(r.width, 1.6);
});

test('routes: a point may carry its own corner radius, and a corner never takes more than half a side', () => {
  const own = buildRoute({ ...RECT, points: [[0, 0], [20, 0, 1], [20, 10], [0, 10]] });
  // the corner at (20, 0) has radius 1 instead of 2: 2 m more of straight, a quarter circle of radius 1
  near(own.length, RECT_LENGTH + 2 - (Math.PI * 2 / 2 - Math.PI * 1 / 2), 1e-6);
  near(Math.abs(own.sample(17 + Math.PI / 4).curvature), 1, 1e-9);   // the straight now runs from x = 2 to 19
  // a slight kink keeps a wide radius: 1 degree with radius 40 is no reason to slow down
  const kink = buildRoute({ id: 'k', points: [[0, 0], [30, 0, 40], [60, Math.tan(Math.PI / 180) * 30], [60, 20], [0, 20]], closed: true, width: 1.6, radius: 3 });
  const arcs = kink.segments.filter((g) => g.kind === 'arc').map((g) => g.r);
  assert.ok(arcs.some((r) => Math.abs(r - 40) < 1e-9), 'radii ' + arcs.join(', '));
  // a radius too big for its sides shrinks to fit
  const tight = buildRoute({ ...RECT, radius: 50 });
  for (const g of tight.segments) if (g.kind === 'arc') near(g.r, 5, 1e-9);
});

test('routes: sample walks the loop, wraps around and reports heading and curvature', () => {
  const r = buildRoute(RECT);
  // the first straight starts after the fillet of the corner at (0, 0): x = 2, z = 0, heading +x
  const a = r.sample(0);
  near(a.x, 2, 1e-9); near(a.z, 0, 1e-9);
  near(a.heading, Math.PI / 2, 1e-9);           // yaw convention of the game: atan2(dx, dz)
  near(a.curvature, 0, 1e-12);
  const mid = r.sample(8);                       // halfway along the 16 m straight
  near(mid.x, 10, 1e-9); near(mid.z, 0, 1e-9);
  const arc = r.sample(16 + Math.PI / 2);        // halfway round the first fillet (radius 2)
  near(Math.abs(arc.curvature), 0.5, 1e-9);
  near(Math.hypot(arc.x - 18, arc.z - 2), 2, 1e-9);
  const wrapped = r.sample(5 + 3 * r.length);
  const plain = r.sample(5);
  near(wrapped.x, plain.x, 1e-6); near(wrapped.z, plain.z, 1e-6);
  const back = r.sample(-1);
  const end = r.sample(r.length - 1);
  near(back.x, end.x, 1e-6); near(back.z, end.z, 1e-6);
});

test('routes: the loop is continuous, a 0.25 m step never jumps', () => {
  const r = buildRoute(RECT);
  let prev = r.sample(0);
  for (let s = 0.25; s <= r.length + 1e-9; s += 0.25) {
    const p = r.sample(s);
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) <= 0.2501, 'jump at s = ' + s);
    prev = p;
  }
});

test('routes: nearest finds the distance along the loop and the gap to it', () => {
  const r = buildRoute(RECT);
  const n = r.nearest(10, -1.5);                 // 1.5 m beside the middle of the first straight
  near(n.dist, 1.5, 1e-9);
  near(n.s, 8, 1e-9);
  const c = r.nearest(10, 5);                    // the middle of the rectangle: 5 m to both long sides
  near(c.dist, 5, 1e-9);
});

test('routes: clearance is the smallest gap to a solid box above 0.42 m', () => {
  const r = buildRoute(RECT);
  assert.equal(routeClearance(r, []), Infinity);
  const wall = { minX: 8, maxX: 12, minY: 0, maxY: 2, minZ: -3, maxZ: -1.2, solid: true };
  near(routeClearance(r, [wall]), 1.2, 1e-9);
  const low = { ...wall, maxZ: -0.2, maxY: 0.4 };          // a kerb the wheels roll over
  const ghost = { ...wall, maxZ: -0.2, solid: false };
  assert.equal(routeClearance(r, [low, ghost]), Infinity);
  const onIt = { ...wall, minZ: -0.5, maxZ: 0.5 };
  assert.equal(routeClearance(r, [onIt]), 0);
});

test('routes: onRoute tells whether a point is within a margin of a loop', () => {
  const routes = [buildRoute(RECT)];
  assert.equal(onRoute(10, 0, 0.1, routes), true);
  assert.equal(onRoute(10, -1, 1.2, routes), true);
  assert.equal(onRoute(10, -1.5, 1.2, routes), false);
  assert.equal(onRoute(10, 5, 4.9, routes), false);
});

test('routes: at least two closed loops lie on the streets', () => {
  assert.ok(ROUTES.length >= 2, 'loops: ' + ROUTES.length);
  const ids = new Set();
  for (const def of ROUTES) {
    assert.equal(def.closed, true, def.id);
    assert.ok(def.points.length >= 3, def.id);
    assert.ok(!ids.has(def.id), 'duplicate id ' + def.id);
    ids.add(def.id);
    const r = buildRoute(def);
    assert.ok(r.length > 30, def.id + ' is only ' + r.length.toFixed(1) + ' m long');
    for (let s = 0; s < r.length; s += 0.5) {
      const p = r.sample(s);
      assert.ok(Math.abs(p.x) < 44 && Math.abs(p.z) < 44, def.id + ' leaves the map at s = ' + s);
    }
  }
});

test('routes: every loop keeps 0.8 m from the solid colliders of the level (snapshot from the game)', () => {
  const colliders = streetColliders();
  assert.ok(colliders.length > 500, 'the snapshot holds the whole level: ' + colliders.length);
  for (const def of ROUTES) {
    const gap = routeClearance(buildRoute(def), colliders, 0.5);
    assert.ok(gap >= 0.8, def.id + ': ' + gap.toFixed(3) + ' m');
  }
});

test('routes: onRoute without a list checks the loops of the level', () => {
  const r = buildRoute(ROUTES[0]);
  const p = r.sample(r.length / 3);
  assert.equal(onRoute(p.x, p.z, 0.5), true);
  assert.equal(onRoute(0, 44.9, 0.5), false);
});

// ---- wave 15: the loops of every map
import { routesFor, levelRoutes } from '../../src/core/routes.js';
import { generateLayout } from '../../src/core/mapgen.js';

test('routes: routesFor gives the block its own loops and every generated map the loops of its layout', () => {
  assert.equal(routesFor('block'), levelRoutes(), 'the block keeps the very same built loops');
  for (const id of ['port', 'factory', 'oldtown', 'railyard', 'airfield', 'winter', 'night', 'desert', 'construction']) {
    const defs = generateLayout(id).routes, built = routesFor(id);
    assert.deepEqual(built.map((r) => r.id), defs.map((d) => d.id), id);
    built.forEach((r, i) => assert.equal(r.length, buildRoute(defs[i]).length, id + '/' + r.id));
    assert.equal(routesFor(id), built, id + ': built once');
  }
  assert.throws(() => routesFor('atlantis'));
});

test('routes: onRoute checks the loops it is given, not the block\'s', () => {
  const port = routesFor('port');
  const p = port[0].sample(port[0].length / 4);
  assert.equal(onRoute(p.x, p.z, 0.5, port), true);
  const q = ROUTES.map(buildRoute)[0].sample(3);
  assert.equal(onRoute(q.x, q.z, 0.5, []), false);
});
