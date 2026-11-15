import { test, assert, near } from '../harness.mjs';
import { createRide, stepRide, rideRam, rideAim, crashRide, leaveRide } from '../../src/core/ride.js';
import { buildRoute, ROUTES } from '../../src/core/routes.js';
import { VEHICLES, ENEMY_TYPES, RIDE, enemyParams } from '../../src/core/rules.js';
import { createEnemy } from '../../src/core/ai.js';
import { createRng } from '../../src/core/math.js';

// A big loop with gentle corners: no vehicle has to slow down in its turns (radius 25 m).
const BIG = buildRoute({ id: 'big', points: [[-60, -40], [60, -40], [60, 40], [-60, 40]], closed: true, width: 1.6, radius: 25 });
const DT = 1 / 60;

/** Drive until the ride has covered `dist` metres; returns the seconds it took. */
function lapTime(ride, dist, blockers = []) {
  let covered = 0, t = 0, prev = ride.s;
  while (covered < dist && t < 600) {
    stepRide(ride, DT, blockers);
    covered += (ride.s - prev + ride.route.length) % ride.route.length;
    prev = ride.s; t += DT;
  }
  return t;
}

/** Lap time if the vehicle drove every metre at the speed its turns allow, without accelerating or braking. */
function idealLap(route, kind) {
  const V = VEHICLES[kind];
  let t = 0;
  for (let s = 0; s < route.length; s += 0.05) {
    const k = Math.abs(route.sample(s).curvature);
    t += 0.05 / Math.min(V.speed, k > 0 ? Math.sqrt(RIDE.grip / k) : Infinity);
  }
  return t;
}

test('createRide: a vehicle on the loop at s, going at its cruising speed', () => {
  const r = createRide(BIG, 10, 'scooter', createRng(1));
  const p = BIG.sample(10);
  near(r.x, p.x, 1e-9); near(r.z, p.z, 1e-9); near(r.heading, p.heading, 1e-9);
  assert.equal(r.route, BIG); assert.equal(r.s, 10); assert.equal(r.kind, 'scooter');
  assert.equal(r.speed, VEHICLES.scooter.speed);
  assert.deepEqual([r.alive, r.wrecked, r.mounted, r.blockedT, r.y], [true, false, true, 0, 0]);
});

test('stepRide: a free loop takes length / speed when the turns are gentle', () => {
  for (const kind of Object.keys(VEHICLES)) {
    const r = createRide(BIG, 0, kind, createRng(2));
    const t = lapTime(r, BIG.length);
    const expected = BIG.length / VEHICLES[kind].speed;
    assert.ok(t >= expected - 2 * DT && t <= expected * 1.02 + 2 * DT, kind + ': ' + t.toFixed(2) + ' s, expected ' + expected.toFixed(2));
  }
});

test('stepRide: every loop of the level is driven all the way round, slower only in the turns', () => {
  for (const def of ROUTES) {
    const route = buildRoute(def);
    for (const kind of Object.keys(VEHICLES)) {
      const V = VEHICLES[kind];
      const r = createRide(route, 0, kind, createRng(3));
      const t = lapTime(r, route.length);
      const arcs = route.segments.filter((g) => g.kind === 'arc').length;
      const slack = arcs * (V.speed / V.accel + V.speed / V.brake);
      assert.ok(t >= route.length / V.speed - 2 * DT, def.id + ' ' + kind + ' too fast: ' + t.toFixed(2));
      assert.ok(t <= idealLap(route, kind) + slack, def.id + ' ' + kind + ' too slow: ' + t.toFixed(2) + ' s');
      const p = route.sample(r.s);
      near(r.x, p.x, 1e-9); near(r.z, p.z, 1e-9);
    }
  }
});

test('stepRide: brakes to a stop in front of a blocker in its lane and never runs through it', () => {
  const r = createRide(BIG, 0, 'moto', createRng(4));
  const at = BIG.sample(25);
  const player = { x: at.x, z: at.z, r: 0.34 };
  let maxS = 0;
  for (let i = 0; i < 600; i++) { stepRide(r, DT, [player]); maxS = Math.max(maxS, r.s); }
  near(r.speed, 0, 1e-9);
  const front = maxS + VEHICLES.moto.length / 2;
  assert.ok(front <= 25 - 0.34 + 1e-6, 'front at ' + front.toFixed(3));
  assert.ok(front > 25 - 0.34 - 0.5, 'stops close to it, not far away: ' + front.toFixed(3));
});

test('stepRide: a blocker beside the lane does not slow it down', () => {
  const r = createRide(BIG, 0, 'moto', createRng(5));
  const at = BIG.sample(25);
  const aside = { x: at.x, z: at.z + 2.5, r: 0.34 };          // 2.5 m off the straight along z = -40
  for (let i = 0; i < 180; i++) stepRide(r, DT, [aside]);
  near(r.speed, VEHICLES.moto.speed, 1e-9);
  assert.ok(r.s > 25);
});

test('stepRide: blocked for 3 seconds the rider gets off', () => {
  const r = createRide(BIG, 0, 'scooter', createRng(6));
  r.speed = 0;
  const at = BIG.sample(VEHICLES.scooter.length / 2 + 0.34 + 0.05);   // right in front of it
  const wall = [{ x: at.x, z: at.z, r: 0.34 }];
  let t = 0, first = null;
  for (let i = 0; i < 400 && first === null; i++) {
    const res = stepRide(r, 0.01, wall);
    t += 0.01;
    if (res.dismount) first = t;
  }
  assert.ok(first !== null, 'never got off');
  assert.ok(first >= 3 - 1e-6 && first < 3.02, 'got off after ' + first);
  // a free road resets the count
  const r2 = createRide(BIG, 0, 'scooter', createRng(6));
  r2.speed = 0;
  for (let i = 0; i < 200; i++) stepRide(r2, 0.01, wall);
  assert.ok(r2.blockedT > 1.9);
  stepRide(r2, 0.2, []);
  assert.equal(r2.blockedT, 0);
});

test('leaveRide: the rider gets off, the vehicle stays whole and stands upright where it stopped', () => {
  const g = BIG.segments.find((q) => q.kind === 'arc');
  const r = createRide(BIG, g.s0 + 2, 'moto', createRng(16));
  for (let i = 0; i < 20; i++) stepRide(r, DT, []);
  assert.ok(r.speed > 1 && Math.abs(r.lean) > 0.1, 'moving and leaning in the turn');
  leaveRide(r);
  assert.deepEqual([r.mounted, r.wrecked, r.alive], [false, false, true], 'not a wreck');
  const at = { x: r.x, z: r.z, s: r.s };
  for (let i = 0; i < 120; i++) assert.equal(stepRide(r, DT, []).dismount, false);
  near(r.x, at.x, 1e-9); near(r.z, at.z, 1e-9); near(r.s, at.s, 1e-9);
  assert.deepEqual([r.speed, r.lean, r.blockedT], [0, 0, 0]);
  assert.equal(rideRam(r, { x: r.x, z: r.z, radius: 0.34 }, 99999), null, 'an empty vehicle never rams');
});

test('stepRide: at 15 m/s in a 0.1 s frame it does not skip a thin blocker 1 m ahead (substeps)', () => {
  const r = createRide(BIG, 0, 'moto', createRng(7));
  r.speed = 15;
  const front = VEHICLES.moto.length / 2;
  const at = BIG.sample(front + 1);
  const post = { x: at.x, z: at.z, r: 0.05 };
  stepRide(r, 0.1, [post]);
  assert.ok(r.s + front <= front + 1 - 0.05 + 1e-6, 'front ran to ' + (r.s + front).toFixed(3));
  assert.ok(r.s > 0.5, 'it did move up to the post: ' + r.s.toFixed(3));
});

test('rideRam: a motorbike at speed knocks the player down once per cooldown, a scooter never', () => {
  const r = createRide(BIG, 0, 'moto', createRng(8));
  const V = VEHICLES.moto;
  const touching = () => {
    const f = { x: Math.sin(r.heading), z: Math.cos(r.heading) };
    return { x: r.x + f.x * (V.length / 2 + 0.3), z: r.z + f.z * (V.length / 2 + 0.3), radius: 0.34, alive: true };
  };
  r.speed = V.ramSpeed;
  const hit = rideRam(r, touching(), 1000);
  assert.ok(hit, 'rams at ramSpeed');
  assert.equal(hit.damage, V.ramDamage);
  const f = { x: Math.sin(r.heading), z: Math.cos(r.heading) };
  assert.ok(hit.pushX * f.x + hit.pushZ * f.z > 0, 'thrown along its way');
  assert.equal(rideRam(r, touching(), 1000 + V.ramCooldown * 1000 - 1), null, 'not again within the cooldown');
  assert.ok(rideRam(r, touching(), 1000 + V.ramCooldown * 1000), 'again after it');
  const slow = createRide(BIG, 0, 'moto', createRng(8));
  slow.speed = V.ramSpeed - 0.1;
  assert.equal(rideRam(slow, touching(), 1000), null, 'too slow');
  const far = createRide(BIG, 0, 'moto', createRng(8));
  assert.equal(rideRam(far, { x: far.x + 5, z: far.z + 5, radius: 0.34 }, 1000), null, 'not touching');
  const sc = createRide(BIG, 0, 'scooter', createRng(8));
  sc.speed = 30;
  assert.equal(rideRam(sc, { x: sc.x, z: sc.z, radius: 0.34 }, 1000), null, 'a scooter does not ram');
  assert.ok(VEHICLES.moto.ramCooldown >= 3);
});

test('rideRam: hitting the player at speed counts even though the bike stops at him', () => {
  const r = createRide(BIG, 0, 'moto', createRng(9));
  const at = BIG.sample(VEHICLES.moto.length / 2 + 0.34 + 1.5);   // steps into the lane 1.5 m ahead
  const player = { x: at.x, z: at.z, r: 0.34, radius: 0.34 };
  stepRide(r, 0.2, [player]);
  const hit = rideRam(r, player, 5000);
  assert.ok(hit && hit.damage === VEHICLES.moto.ramDamage, 'too close to brake: rammed');
});

function rider(type, tier = 3) {
  const e = createEnemy({ x: 0, z: 0, type }, tier, createRng(11));
  return e;
}

test('rideAim: fires only while it sees the player, with acc × mountedAcc', () => {
  const rng = createRng(12);
  const r = createRide(BIG, 0, 'scooter', rng);
  const e = rider('scooterRider');
  const ahead = { x: r.x + Math.sin(r.heading) * 15, z: r.z + Math.cos(r.heading) * 15 };
  let fired = 0, cue = 0, laser = 0;
  for (let now = 0; now < 8000; now += 16) {
    const out = rideAim(r, e, { ...ahead, visible: false, alive: true }, now, rng);
    if (out.fire) fired++;
  }
  assert.equal(fired, 0, 'never without sight');
  const shots = [];
  for (let now = 8000; now < 16000; now += 16) {
    const out = rideAim(r, e, { ...ahead, visible: true, alive: true }, now, rng);
    if (out.cue) cue++;
    if (out.laser > 0) laser++;
    if (out.fire) shots.push(out.fire);
  }
  assert.ok(shots.length > 2, 'shots: ' + shots.length);
  assert.ok(cue >= 1 && laser > 0, 'warns before it fires');
  const acc = enemyParams('scooterRider', 3).acc * ENEMY_TYPES.scooterRider.mountedAcc;
  for (const s of shots) { near(s.acc, acc, 1e-12); near(s.dist, 15, 1e-9); }
  assert.ok(acc < enemyParams('scooterRider', 3).acc);
});

test('rideAim: the first shot comes only after the reaction and the aim warning', () => {
  const rng = createRng(13);
  const r = createRide(BIG, 0, 'moto', rng);
  const e = rider('biker', 1);
  const ahead = { x: r.x + Math.sin(r.heading) * 10, z: r.z + Math.cos(r.heading) * 10, visible: true, alive: true };
  let first = null;
  for (let now = 0; now < 5000 && first === null; now += 10) if (rideAim(r, e, ahead, now, rng).fire) first = now;
  const P = enemyParams('biker', 1);
  assert.ok(first !== null && first >= (P.react[0] + P.telegraph) * 1000 - 20, 'first shot at ' + first);
});

test('rideAim: an empty magazine reloads in RIDE.reloadSecs (rules.js), not sooner', () => {
  assert.ok(RIDE.reloadSecs > 0, 'the riders\' reload time is a rule: ' + RIDE.reloadSecs);
  const rng = createRng(15);
  const r = createRide(BIG, 0, 'scooter', rng);
  const e = rider('scooterRider');
  const ahead = { x: r.x + Math.sin(r.heading) * 12, z: r.z + Math.cos(r.heading) * 12, visible: true, alive: true };
  e.mag = 0;
  rideAim(r, e, ahead, 1000, rng);
  const done = 1000 + RIDE.reloadSecs * 1000;
  rideAim(r, e, ahead, done - 1, rng);
  assert.equal(e.mag, 0, 'still reloading 1 ms before the end');
  rideAim(r, e, ahead, done, rng);
  assert.equal(e.mag, e.magSize, 'full again after RIDE.reloadSecs');
});

test('crashRide: the vehicle slides on, falls on its side and stays in its lane', () => {
  const r = createRide(BIG, 0, 'moto', createRng(14));
  const v0 = r.speed;
  crashRide(r, { x: 0, z: 1 });
  assert.deepEqual([r.wrecked, r.mounted, r.alive], [true, false, false]);
  let moved = 0, prev = r.s;
  for (let i = 0; i < 300; i++) {
    const res = stepRide(r, DT, []);
    assert.equal(res.dismount, false);
    moved += (r.s - prev + BIG.length) % BIG.length; prev = r.s;
    const n = BIG.nearest(r.x, r.z);
    assert.ok(n.dist <= BIG.width / 2, 'left its lane: ' + n.dist);
  }
  near(r.speed, 0, 1e-9);
  const reach = (v0 * v0) / (2 * RIDE.crashFriction);
  assert.ok(moved > reach * 0.9 && moved < reach * 1.1, 'slid ' + moved.toFixed(2) + ' m, expected about ' + reach.toFixed(2));
  assert.ok(Math.abs(r.lean) > 1.3, 'lies on its side: ' + r.lean);
  // a crash is final: a second call changes nothing and the wreck never rams
  const before = { ...r };
  crashRide(r, { x: 1, z: 0 });
  assert.equal(r.fallSide, before.fallSide);
  r.speed = 20;
  assert.equal(rideRam(r, { x: r.x, z: r.z, radius: 0.34 }, 99999), null);
});

// The view turns a vehicle and its rider by Euler(0, heading, -lean, 'YXZ') (enemies/vehicles.js place,
// enemies/riders.js): their up vector is (sin(lean) cos h, cos(lean), -sin(lean) sin h), so the top tips
// along lean × (cos h, -sin h). Into a turn means towards the centre of the arc.
const BIG_BACK = buildRoute({ id: 'big-back', points: [[-60, 40], [60, 40], [60, -40], [-60, -40]], closed: true, width: 1.6, radius: 25 });

/** The arc piece of `route` under s, or null on a straight (the same piece route.sample reads). */
function arcAt(route, s) {
  const sw = ((s % route.length) + route.length) % route.length;
  let g = route.segments[0];
  for (const q of route.segments) if (q.s0 <= sw) g = q;
  return g.kind === 'arc' ? g : null;
}

/** lean · ((cos h, -sin h) · (centre - pos)): positive when the vehicle leans towards the arc's centre. */
const inward = (r, g) => r.lean * (Math.cos(r.heading) * (g.cx - r.x) - Math.sin(r.heading) * (g.cz - r.z));

test('stepRide: in every turn of every loop the vehicle leans into the turn, towards the arc centre', () => {
  const turns = { left: 0, right: 0 };
  for (const route of [buildRoute(ROUTES[0]), ...ROUTES.slice(1).map(buildRoute), BIG, BIG_BACK]) {
    for (const kind of ['scooter', 'moto']) {
      const r = createRide(route, 0, kind, createRng(21));
      for (let t = 0; t < route.length / VEHICLES[kind].speed * 1.5; t += DT) {
        stepRide(r, DT, []);
        const g = arcAt(route, r.s);
        if (!g || Math.abs(r.lean) < 1e-3) continue;
        const k = inward(r, g);
        assert.ok(k > 0, route.id + ' ' + kind + ' leans out of the turn at s ' + r.s.toFixed(2) + ': ' + k);
        // the drawn up vector itself points to the centre
        const up = { x: Math.sin(r.lean) * Math.cos(r.heading), z: -Math.sin(r.lean) * Math.sin(r.heading) };
        assert.ok(up.x * (g.cx - r.x) + up.z * (g.cz - r.z) > 0, route.id + ' ' + kind + ': up vector away from the centre');
        turns[g.sign > 0 ? 'left' : 'right']++;
      }
    }
  }
  assert.ok(turns.left > 0 && turns.right > 0, 'turns both ways were driven: ' + JSON.stringify(turns));
});

test('crashRide: a wreck without a hit direction falls to the inside of its turn', () => {
  for (const route of [BIG, BIG_BACK]) {
    const g = route.segments.find((q) => q.kind === 'arc');
    const r = createRide(route, g.s0 + g.len / 2 - 2, 'moto', createRng(22));
    stepRide(r, DT, []);
    assert.ok(inward(r, arcAt(route, r.s)) > 0, route.id + ': leans into the turn before the crash');
    crashRide(r);
    for (let i = 0; i < 18; i++) stepRide(r, DT, []);
    const a = arcAt(route, r.s);
    assert.ok(a, route.id + ': still in the turn');
    assert.ok(Math.abs(r.lean) > 0.3, route.id + ': falling over: ' + r.lean);
    assert.ok(inward(r, a) > 0, route.id + ': the wreck falls out of the turn: ' + inward(r, a));
  }
});
