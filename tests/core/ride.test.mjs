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
    t += 0.05 / Math.min(V.speed, k > 0 ? Math.sqrt((V.grip ?? RIDE.grip) / k) : Infinity);
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
  slow.speed = RIDE.bumpSpeed - 0.1;
  assert.equal(rideRam(slow, touching(), 1000), null, 'too slow');
  // between bumpSpeed and ramSpeed: a shove with a share of the damage, still out of the lane
  slow.speed = (RIDE.bumpSpeed + V.ramSpeed) / 2;
  const bump = rideRam(slow, touching(), 1000);
  assert.ok(bump, 'a bump');
  assert.equal(bump.damage, Math.round((V.ramDamage * slow.speed) / V.ramSpeed));
  assert.ok(bump.damage > 0 && bump.damage < V.ramDamage);
  near(Math.hypot(bump.pushX, bump.pushZ), Math.max(RIDE.knockMin, slow.speed * RIDE.knockShare), 1e-9, 'shove ');
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

/**
 * A vehicle of `kind` at sStart drives at a player standing still on the loop at sPlayer (the blocker
 * the game passes for him, flagged player), for `secs` seconds, checking for a ram every frame.
 * Returns {ride, hits: [{t, speed, damage}], maxFront, dismountAt}.
 */
function driveAtPlayer(route, kind, sStart, sPlayer, secs, seed = 31) {
  const r = createRide(route, sStart, kind, createRng(seed));
  const at = route.sample(sPlayer);
  const player = { x: at.x, z: at.z, r: 0.34, radius: 0.34, player: true };
  const half = VEHICLES[kind].length / 2;
  const hits = [];
  let t = 0, maxFront = -Infinity, dismountAt = null;
  while (t < secs) {
    const res = stepRide(r, DT, [player]);
    t += DT;
    if (res.dismount && dismountAt === null) dismountAt = t;
    const hit = rideRam(r, player, 10000 + t * 1000);
    if (hit) hits.push({ t, speed: r.speed, damage: hit.damage });
    if (!hits.length) maxFront = Math.max(maxFront, ((r.s - sStart + route.length) % route.length) + half);
  }
  return { ride: r, hits, maxFront, dismountAt };
}

test('stepRide: a motorbike does not brake for the player, it runs him down at ramSpeed and rides on; a scooter and a skate stop', () => {
  const V = VEHICLES.moto;
  const m = driveAtPlayer(BIG, 'moto', 0, 25, 10);
  assert.equal(m.hits.length, 1, 'one ram, not two in a row: ' + m.hits.length);
  assert.ok(m.hits[0].speed >= V.ramSpeed, 'rams at ' + m.hits[0].speed.toFixed(2) + ' m/s');
  assert.equal(m.hits[0].damage, V.ramDamage);
  assert.ok(m.hits[0].t < 25 / V.speed + 0.5, 'drove straight at him: ' + m.hits[0].t.toFixed(2) + ' s');
  // then it rides on along its loop at its cruising speed, held up by nothing
  near(m.ride.speed, V.speed, 1e-9);
  assert.ok(m.ride.s > 25 + 40, 'rode on to ' + m.ride.s.toFixed(1));
  assert.deepEqual([m.ride.mounted, m.ride.blockedT, m.dismountAt], [true, 0, null]);
  for (const kind of ['scooter', 'skate']) {
    const S = driveAtPlayer(BIG, kind, 0, 25, 10);
    assert.equal(S.hits.length, 0, kind + ' never rams');
    near(S.ride.speed, 0, 1e-9);
    assert.ok(S.maxFront <= 25 - 0.34 + 1e-6, kind + ' stops in front of him: front at ' + S.maxFront.toFixed(3));
    assert.ok(S.dismountAt !== null, kind + ': held up by the player, the rider gets off');
  }
  // a blocker that is not the player (a rider, a foot soldier, a wreck): the motorbike stops for it too
  const r = createRide(BIG, 0, 'moto', createRng(31));
  const at = BIG.sample(25), bot = { x: at.x, z: at.z, r: 0.34 };
  let front = -Infinity;
  for (let i = 0; i < 480; i++) { stepRide(r, DT, [bot]); front = Math.max(front, r.s + V.length / 2); }
  near(r.speed, 0, 1e-9);
  assert.ok(front <= 25 - 0.34 + 1e-6, 'front at ' + front.toFixed(3));
});

test('stepRide: on every loop of the level, turns included, a motorbike runs a standing player down at ramSpeed or faster', () => {
  for (const def of ROUTES) {
    const route = buildRoute(def);
    for (const kind of ['moto', 'heavyMoto']) {
      const V = VEHICLES[kind];
      for (let sp = 0; sp < route.length; sp += 2.5) {
        const res = driveAtPlayer(route, kind, sp - 30, sp, 10);
        const where = def.id + ' ' + kind + ' player at s ' + sp.toFixed(1);
        assert.ok(res.hits.length >= 1, where + ': no ram');
        assert.ok(res.hits[0].speed >= V.ramSpeed, where + ': rammed at ' + res.hits[0].speed.toFixed(2) + ' m/s');
        assert.equal(res.dismountAt, null, where + ': the rider got off');
      }
    }
  }
});

test('stepRide: a motorbike starting from a standstill a little behind the player goes for him and shoves him', () => {
  const V = VEHICLES.moto, half = V.length / 2;
  for (const gapM of [0.6, 1.2, 2]) {
    const r = createRide(BIG, 0, 'moto', createRng(32));
    r.speed = 0;
    const at = BIG.sample(half + 0.34 + gapM);                  // gapM in front of its nose
    const player = { x: at.x, z: at.z, r: 0.34, radius: 0.34, player: true };
    let hit = null;
    for (let i = 0; i < 120 && !hit; i++) {
      stepRide(r, DT, [player]);
      hit = rideRam(r, player, 1000 + i * 17);
    }
    assert.ok(hit, gapM + ' m: it hits him instead of stopping');
    assert.ok(hit.damage > 0 && hit.damage < V.ramDamage, gapM + ' m: a share of the damage at a crawl: ' + hit.damage);
    assert.ok(Math.hypot(hit.pushX, hit.pushZ) >= RIDE.knockMin - 1e-9, 'and he is shoved out of the lane');
  }
});

test('stepRide: a motorbike too close to reach bumpSpeed brakes for the player instead of driving through him', () => {
  const r = createRide(BIG, 0, 'moto', createRng(32));
  r.speed = 0;
  const half = VEHICLES.moto.length / 2;
  const gapM = 0.2;
  assert.ok(Math.sqrt(2 * VEHICLES.moto.accel * gapM) < RIDE.bumpSpeed, 'the test is set up too far away');
  const at = BIG.sample(half + 0.34 + gapM);
  const player = { x: at.x, z: at.z, r: 0.34, radius: 0.34, player: true };
  let hit = null, front = -Infinity;
  for (let i = 0; i < 120; i++) {
    stepRide(r, DT, [player]);
    hit = hit || rideRam(r, player, 1000 + i * 17);
    front = Math.max(front, r.s + half);
  }
  assert.equal(hit, null, 'no ram below bumpSpeed');
  assert.ok(front <= half + gapM + 1e-6, 'it did not drive into him: front at ' + front.toFixed(3));
});

test('stepRide: no vehicle takes a turn faster than its grip, a motorbike going for the player neither', () => {
  for (const def of ROUTES) {
    const route = buildRoute(def);
    for (const kind of Object.keys(VEHICLES)) {
      const V = VEHICLES[kind], grip = V.grip ?? RIDE.grip;
      if (Number.isFinite(V.ramSpeed)) assert.ok(Math.sqrt(grip * 2.37) >= V.ramSpeed, kind + ' cannot take the tightest turn at ramSpeed');
      for (let sp = 0; sp < route.length; sp += 2.5) {
        const r = createRide(route, sp - 30, kind, createRng(33));
        const at = route.sample(sp), player = { x: at.x, z: at.z, r: 0.34, radius: 0.34, player: true };
        let worst = 0;
        for (let t = 0; t < 8; t += DT) {
          stepRide(r, DT, [player]);
          worst = Math.max(worst, r.speed * r.speed * Math.abs(r.curvature));
        }
        assert.ok(worst <= grip * 1.001, def.id + ' ' + kind + ' at s ' + sp + ': ' + worst.toFixed(2) + ' m/s² in a turn, grip ' + grip);
      }
    }
  }
});

// ------------------------------------------------------------- swerving round still blockers

/** A wreck or a vehicle left standing on the loop at s (blocker flagged still), `off` metres right of it. */
function stillAt(route, s, kind = 'moto', off = 0) {
  const p = route.sample(s), V = VEHICLES[kind];
  return { x: p.x + Math.cos(p.heading) * off, z: p.z - Math.sin(p.heading) * off, r: V.width / 2, l: V.length / 2, still: true };
}

test('stepRide: a vehicle swerves round a wreck standing in its lane where there is room, and comes back to its loop', () => {
  for (const kind of Object.keys(VEHICLES)) {
    const V = VEHICLES[kind];
    const r = createRide(BIG, 0, kind, createRng(40));
    const wreck = stillAt(BIG, 30);
    const asked = [];
    const room = (off, s0, s1, hw) => { asked.push({ off, s0, s1, hw }); return true; };
    let minGap = Infinity, maxLat = 0, t = 0;
    for (; t < 20 && r.s < 60; t += DT) {
      const res = stepRide(r, DT, [wreck], room);
      assert.equal(res.dismount, false, kind + ': got off');
      // never through it: the boxes of vehicle and wreck do not overlap (2D, both along the straight)
      const along = Math.abs(r.s - 30), side = Math.abs(r.lateral);
      if (along < V.length / 2 + wreck.l) minGap = Math.min(minGap, side - V.width / 2 - wreck.r);
      maxLat = Math.max(maxLat, side);
    }
    assert.ok(r.s >= 60, kind + ' got past: s ' + r.s.toFixed(1));
    assert.ok(minGap > 0, kind + ' passed through the wreck: ' + minGap.toFixed(3));
    assert.ok(maxLat <= RIDE.swerveMax + 1e-9);
    assert.ok(asked.length >= 1 && asked[0].hw === V.width / 2, kind + ': asked the game for room');
    // back on its loop, at its speed, nose along the loop again
    for (let i = 0; i < 120; i++) stepRide(r, DT, [wreck], room);
    near(r.lateral, 0, 1e-9, kind + ' back on the loop ');
    const p = BIG.sample(r.s);
    near(r.heading, p.heading, 0.02, kind + ' heading ');
  }
});

test('stepRide: without room on either side it stops behind the wreck and the rider gets off, as before', () => {
  const r = createRide(BIG, 0, 'scooter', createRng(41));
  const wreck = stillAt(BIG, 20);
  let calls = 0, off = null;
  for (let t = 0; t < 8 && off === null; t += DT) {
    if (stepRide(r, DT, [wreck], () => { calls++; return false; }).dismount) off = t;
  }
  assert.ok(off !== null, 'never got off');
  assert.ok(r.s + VEHICLES.scooter.length / 2 <= 20 - wreck.l + 1e-6, 'stopped in front of it');
  assert.ok(calls > 0 && calls < 60, 'asked for room now and then, not every frame: ' + calls);
});

test('stepRide: it takes the side with room, and never swerves round the player or a soldier on foot', () => {
  for (const side of [-1, 1]) {
    const r = createRide(BIG, 0, 'moto', createRng(42));
    const wreck = stillAt(BIG, 30);
    for (let t = 0; t < 6; t += DT) stepRide(r, DT, [wreck], (o) => Math.sign(o) === side);
    assert.ok(r.s > 31, 'passed: ' + r.s.toFixed(1));
  }
  // a moving blocker (flagged still or not, it is the flag that counts): a soldier is waited for
  const r = createRide(BIG, 0, 'scooter', createRng(43));
  const p = BIG.sample(20), bot = { x: p.x, z: p.z, r: 0.34 };
  let asked = 0;
  for (let t = 0; t < 4; t += DT) stepRide(r, DT, [bot], () => { asked++; return true; });
  assert.equal(asked, 0);
  assert.ok(r.s + VEHICLES.scooter.length / 2 <= 20 - 0.34 + 1e-6);
});

test('stepRide: stopped right behind a vehicle left standing, it edges out sideways and does not get off', () => {
  const V = VEHICLES.scooter;
  const r = createRide(BIG, 0, 'scooter', createRng(44));
  r.speed = 0;
  const wreck = stillAt(BIG, V.length / 2 + VEHICLES.moto.length / 2 + RIDE.gap + 0.01);
  let off = false;
  for (let t = 0; t < 8; t += DT) if (stepRide(r, DT, [wreck], () => true).dismount) off = true;
  assert.equal(off, false, 'the rider got off');
  assert.ok(r.s > wreck.l * 2 + 2, 'it got round: s ' + r.s.toFixed(2));
});

test('crashRide: a vehicle shot out in the middle of a swerve drifts on from where it was', () => {
  const r = createRide(BIG, 0, 'moto', createRng(45));
  const wreck = stillAt(BIG, 25);
  while (Math.abs(r.lateral) < 0.8) stepRide(r, DT, [wreck], () => true);
  const lat = r.lateral;
  crashRide(r, null);
  stepRide(r, DT);
  assert.ok(Math.abs(r.lateral - lat) < RIDE.crashDrift + 1e-9, 'jumped from ' + lat.toFixed(2) + ' to ' + r.lateral.toFixed(2));
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

test('rideAim: the upper body turns to a player beside the road before a shot leaves, and back to the road', () => {
  for (const side of [-1, 1]) {
    const rng = createRng(21);
    const r = createRide(BIG, 0, 'moto', rng);
    const e = rider('biker', 1);
    // 12 m off to one side and a little ahead: about 80 degrees from the heading
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading), rx = fz, rz = -fx;
    const view = { x: r.x + fx * 2 + rx * side * 12, z: r.z + fz * 2 + rz * side * 12, visible: true, alive: true };
    const bearing = Math.atan2(view.x - r.x, view.z - r.z) - r.heading;
    const want = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    assert.ok(Math.abs(want) > 1.2 && Math.abs(want) < RIDE.aimCone, 'off the heading by ' + want.toFixed(2));
    let shots = 0;
    for (let now = 0; now < 4000; now += 16) {
      const out = rideAim(r, e, view, now, rng);
      if (out.fire) {
        shots++;
        assert.ok(Math.abs(e.aimTwist - want) <= RIDE.twistSlack + 1e-9, 'shot with the body turned ' + e.aimTwist.toFixed(2) + ' of ' + want.toFixed(2));
      }
    }
    assert.ok(shots > 0, 'it shoots');
    near(e.aimTwist, want, 1e-6, 'turned to the player: ');
    // he loses sight: the body turns back to the road at twistRate, no faster
    let t = 0;
    for (let now = 4000; Math.abs(e.aimTwist) > 1e-9 && now < 8000; now += 16) { rideAim(r, e, { ...view, visible: false }, now, rng); t += 0.016; }
    near(e.aimTwist, 0, 1e-9, 'back to the road: ');
    assert.ok(t >= Math.abs(want) / RIDE.twistRate - 0.02, 'turned back in ' + t.toFixed(2) + ' s');
  }
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
