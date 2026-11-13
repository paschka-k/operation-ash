import { test, assert, near } from '../harness.mjs';
import { resolveShot, applyDamage, explode, damageAtRange, targetZones, rayTargets } from '../../src/core/combat.js';
import { makeBox, createRng, v3, vec3, DEG } from '../../src/core/collision.js';
import { WEAPON_SPECS } from '../../src/core/rules.js';

const bot = (o = {}) => ({ id: 'b1', x: 0, y: 0, z: -10, scale: 1, crouch: 0, alive: true, hp: 100, armor: 1, ...o });
const origin = (y = 1.6) => vec3(0, y, 0);
const fwd = vec3(0, 0, -1);

test('a shot at the head, chest and knees reports the zone', () => {
  const b = bot();
  const z = targetZones(b);
  const aim = (y) => { const d = v3.normalize(vec3(0, y - 1.6, -10)); return rayTargets(origin(), d, 100, [b]); };
  assert.equal(aim(z.head.y).zone, 'head');
  assert.equal(aim(1.2).zone, 'body');
  assert.equal(aim(0.4).zone, 'legs');
  assert.equal(aim(2.6), null);
});
test('a crouching bot has its head lower', () => {
  const standing = targetZones(bot()), crouched = targetZones(bot({ crouch: 1 }));
  assert.ok(crouched.head.y < standing.head.y - 0.3);
});
test('resolveShot: a pellet at a bot reports the target, zone and point', () => {
  const b = bot();
  const h = resolveShot({ origin: origin(1.2), dir: fwd, spreadDeg: 0, pellets: 1, rng: createRng(1), targets: [b], colliders: [] });
  assert.equal(h.length, 1);
  assert.equal(h[0].kind, 'target'); assert.equal(h[0].target, b); assert.equal(h[0].zone, 'body');
  near(h[0].t, 10 - 0.29, 0.05);
  near(h[0].point.z, -(10 - 0.29), 0.05);
});
test('resolveShot: cover stops the shot before the target behind it', () => {
  const b = bot();
  const wall = makeBox(0, 1, -5, 4, 2, 0.5);
  const h = resolveShot({ origin: origin(1.2), dir: fwd, spreadDeg: 0, rng: createRng(1), targets: [b], colliders: [wall] });
  assert.equal(h[0].kind, 'world'); assert.equal(h[0].collider, wall);
  near(h[0].t, 4.75); assert.equal(h[0].normal.z, 1);
});
test('resolveShot: a target in front of the wall is still hit', () => {
  const b = bot({ z: -3 });
  const wall = makeBox(0, 1, -5, 4, 2, 0.5);
  const h = resolveShot({ origin: origin(1.2), dir: fwd, spreadDeg: 0, rng: createRng(1), targets: [b], colliders: [wall] });
  assert.equal(h[0].kind, 'target');
});
test('resolveShot: bullets fly through a fence that does not block them', () => {
  const b = bot();
  const fence = makeBox(0, 1, -5, 4, 2, 0.1, { blocksBullets: false });
  const h = resolveShot({ origin: origin(1.2), dir: fwd, spreadDeg: 0, rng: createRng(1), targets: [b], colliders: [fence] });
  assert.equal(h[0].kind, 'target');
});
test('resolveShot: nothing in range gives a miss with the end point', () => {
  const h = resolveShot({ origin: origin(), dir: vec3(0, 0.2, -1), spreadDeg: 0, rng: createRng(1), maxDist: 100 });
  assert.equal(h[0].kind, 'none'); near(h[0].t, 100);
});
test('resolveShot: eight pellets spread inside the cone, the same seed gives the same pattern', () => {
  const run = () => resolveShot({ origin: origin(), dir: fwd, spreadDeg: 5, pellets: 8, rng: createRng(11), maxDist: 50 });
  const a = run(), b = run();
  assert.equal(a.length, 8);
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(a[i].dir, b[i].dir);
    const ang = Math.acos(Math.min(1, v3.dot(a[i].dir, fwd))) / DEG;
    assert.ok(ang <= 5.0001);
  }
  const spread = Math.max(...a.map((h) => Math.abs(h.dir.x))) - Math.min(...a.map((h) => Math.abs(h.dir.x)));
  assert.ok(spread > 0.005, 'pellets are not all on one line');
});
test('resolveShot: a shotgun blast at 5 m hits more pellets than at 20 m', () => {
  const spec = WEAPON_SPECS.shotgun;
  const hitsAt = (dist) => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = bot({ z: -dist });
      n += resolveShot({ origin: origin(1.2), dir: fwd, spreadDeg: spec.spreadBase, pellets: spec.pellets, rng: createRng(seed), targets: [b] }).filter((h) => h.kind === 'target').length;
    }
    return n;
  };
  assert.ok(hitsAt(5) > hitsAt(20) * 1.5);
});
test('applyDamage: head x2.5, legs x0.75, armour reduces, death is reported', () => {
  const e = { hp: 100, armor: 1 };
  near(applyDamage(e, 22, 'body').damage, 22);
  near(applyDamage({ hp: 100, armor: 1 }, 22, 'head').damage, 55);
  near(applyDamage({ hp: 100, armor: 1 }, 20, 'legs').damage, 15);
  near(applyDamage({ hp: 100, armor: 0.78 }, 100, 'body').damage, 78);
  const dying = { hp: 30, armor: 1 };
  const r = applyDamage(dying, 22, 'head');
  assert.equal(r.dead, true); assert.ok(dying.hp < 0);
  assert.equal(applyDamage({ hp: 10, armor: 1 }, -5).damage, 0);
});
test('a rifle needs 2 headshots or 5 body shots to kill a grunt', () => {
  const rifle = WEAPON_SPECS.rifle;
  const shots = (zone) => { const e = { hp: 100, armor: 1 }; let n = 0; while (!applyDamage(e, damageAtRange(rifle, 10), zone).dead) n++; return n + 1; };
  assert.equal(shots('head'), 2);
  assert.equal(shots('body'), 5);
});
test('explode: full damage in the centre, quadratic falloff, nothing outside the radius', () => {
  const near1 = bot({ x: 0.0, z: 0.0 }), mid = bot({ id: 'm', x: 0, z: -2.5 }), far = bot({ id: 'f', x: 0, z: -9 });
  const out = explode({ center: vec3(0, 0.95, 0), targets: [near1, mid, far] });
  const byId = Object.fromEntries(out.map((o) => [o.target.id, o]));
  near(byId.b1.damage, 120, 1);
  near(byId.m.damage, 30, 1);
  assert.equal(byId.f, undefined);
});
test('explode: cover shields most of the blast and dead targets are ignored', () => {
  const t = bot({ x: 0, z: -3 }), dead = bot({ id: 'd', x: 1, z: -1, alive: false });
  const open = explode({ center: vec3(0, 0.95, 0), targets: [t] })[0].damage;
  const wall = makeBox(0, 1, -1.5, 6, 2, 0.4);
  const shielded = explode({ center: vec3(0, 0.95, 0), targets: [t, dead], colliders: [wall] });
  assert.equal(shielded.length, 1);
  near(shielded[0].damage, open * 0.25, 0.01); assert.equal(shielded[0].shielded, true);
});
test('explode does not change the targets', () => {
  const t = bot({ x: 0, z: -1 });
  explode({ center: vec3(0, 0.95, 0), targets: [t] });
  assert.equal(t.hp, 100);
});
