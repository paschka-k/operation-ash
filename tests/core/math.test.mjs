import { test, assert, near } from '../harness.mjs';
import { createRng, randomCone, clamp, lerp, damp, angleDiff, v3, vec3, DEG } from '../../src/core/math.js';

test('createRng: same seed gives the same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});
test('createRng: different seeds differ and values stay in [0,1)', () => {
  const a = createRng(1), b = createRng(2);
  assert.notEqual(a(), b());
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
test('createRng: range, int and pick helpers', () => {
  const r = createRng(3);
  for (let i = 0; i < 200; i++) {
    const x = r.range(2, 5); assert.ok(x >= 2 && x < 5);
    const n = r.int(1, 6); assert.ok(Number.isInteger(n) && n >= 1 && n <= 6);
  }
  assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
});
test('randomCone: stays inside the cone and is a unit vector', () => {
  const rng = createRng(5);
  const dir = vec3(0.3, -0.2, -1);
  const d0 = v3.normalize(dir);
  for (let i = 0; i < 500; i++) {
    const v = randomCone(dir, 4, rng);
    near(v3.len(v), 1, 1e-9);
    const ang = Math.acos(Math.min(1, v3.dot(v, d0))) / DEG;
    assert.ok(ang <= 4.0001, 'angle ' + ang);
  }
});
test('randomCone: zero spread returns the direction', () => {
  const v = randomCone(vec3(0, 0, -2), 0, createRng(1));
  near(v.z, -1); near(v.x, 0); near(v.y, 0);
});
test('randomCone: wider cone gives wider average error', () => {
  const rng = createRng(9), d = vec3(0, 0, -1);
  const avg = (deg) => { let s = 0; for (let i = 0; i < 400; i++) s += Math.acos(Math.min(1, v3.dot(randomCone(d, deg, rng), d))); return s / 400; };
  assert.ok(avg(5) > avg(1) * 3);
});
test('clamp, lerp and damp behave', () => {
  assert.equal(clamp(5, 0, 3), 3); assert.equal(clamp(-1, 0, 3), 0); assert.equal(clamp(2, 0, 3), 2);
  near(lerp(0, 10, 0.25), 2.5);
  const v = damp(0, 10, 5, 0.1); assert.ok(v > 0 && v < 10);
  near(damp(0, 10, 5, 100), 10, 1e-6);
});
test('angleDiff takes the short way round', () => {
  near(angleDiff(0.1, -0.1), -0.2);
  near(angleDiff(Math.PI - 0.1, -Math.PI + 0.1), 0.2, 1e-9);
  near(angleDiff(-Math.PI + 0.1, Math.PI - 0.1), -0.2, 1e-9);
});
test('vector helpers', () => {
  near(v3.dot(vec3(1, 2, 3), vec3(4, 5, 6)), 32);
  const c = v3.cross(vec3(1, 0, 0), vec3(0, 1, 0)); near(c.z, 1);
  near(v3.len(v3.normalize(vec3(3, 4, 0))), 1);
  near(v3.dist(vec3(0, 0, 0), vec3(3, 4, 0)), 5);
});
