// Wave 15: the nine generated maps. Every map must be playable the way the block is: the player starts
// free, bots appear far enough and can walk to him, riders have loops with room, buildings have doors,
// there is a height to climb on foot, and the supplies stand neither in walls nor on the loops.
import { test, assert } from '../harness.mjs';
import { generateLayout, layoutColliders, PIECE_TYPES, PIECE_SHAPES, mapSchema } from '../../src/core/mapgen.js';
import { MAP_IDS } from '../../src/core/maps.js';
import { NavGrid } from '../../src/core/nav.js';
import { buildRoute, routeClearance, onRoute, ROUTE_KEEP_CLEAR, ROUTES } from '../../src/core/routes.js';
import { stepBody, overlapsAny } from '../../src/core/collision.js';
import { PLAYER } from '../../src/core/rules.js';

const NEW = MAP_IDS.filter((id) => id !== 'block');
const HALF = 45;

/** The nav grid the game builds: 45 m half extent, 0.5 m cells, 0.4 m agent margin. */
function navOf(cols) {
  const nav = new NavGrid(HALF, 0.5, 0.4);
  for (const c of cols) nav.addBox(c);
  return nav;
}
const at = (nav, mask, x, z) => mask[nav.idx(nav.toCell(x), nav.toCell(z))] === 1;
const level = new Map();
/** Layout, colliders, nav grid and the cells reachable from the start, once per map. */
function world(id) {
  if (!level.has(id)) {
    const L = generateLayout(id), cols = layoutColliders(L), nav = navOf(cols);
    level.set(id, { L, cols, nav, reach: nav.reachableFrom(L.playerStart.x, L.playerStart.z), routes: L.routes.map(buildRoute) });
  }
  return level.get(id);
}
/** Does a circle of radius r at (x, z) touch a collider (the rule of Props.canPlace)? */
function inWall(cols, x, z, r) {
  for (const c of cols) {
    if (c.maxY < 0.1) continue;
    const cx = Math.min(Math.max(x, c.minX), c.maxX), cz = Math.min(Math.max(z, c.minZ), c.maxZ);
    if ((cx - x) ** 2 + (cz - z) ** 2 < (r + 0.12) ** 2) return true;
  }
  return false;
}

test('mapgen: nine generated maps with their own themes; the block is not data', () => {
  assert.equal(NEW.length, 9);
  const names = new Set();
  for (const id of NEW) {
    const L = generateLayout(id);
    assert.equal(L.id, id);
    assert.equal(L.half, 45, id);
    assert.equal(L.atmosphere, id, id);
    assert.equal(typeof L.theme.name, 'string');
    assert.ok(L.theme.palette && L.theme.wallKinds.length > 0 && L.theme.scatter && L.theme.scatter.mix, id + ' theme');
    assert.ok(typeof L.ground.kind === 'string', id);
    names.add(L.theme.name);
    for (const k of ['roads', 'buildings', 'pieces', 'routes', 'spawns', 'pickups', 'crates', 'barrels', 'fires', 'lamps', 'vantage']) {
      assert.ok(Array.isArray(L[k]), id + '.' + k);
    }
    for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz']) assert.ok(Number.isFinite(L.menuView[k]), id + ' menuView.' + k);
  }
  assert.equal(names.size, 9, 'one theme per map');
  assert.throws(() => generateLayout('block'));
  assert.throws(() => generateLayout('atlantis'));
});

test('mapgen: the same map comes out the same from a fresh copy of the generator (seeded, no hidden state)', async () => {
  const fresh = await import(new URL('../../src/core/mapgen.js?again', import.meta.url).href);
  for (const id of NEW) {
    const a = generateLayout(id), b = fresh.generateLayout(id);
    assert.notEqual(a, b, 'two module copies, two builds');
    assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)), id);
    assert.deepEqual(fresh.layoutColliders(b), layoutColliders(a), id + ' colliders');
  }
});

test('mapgen: nine different layouts, not one grid in other colours', () => {
  // 1 m occupancy of the building footprints; two maps may share at most a third of their built area
  const grids = NEW.map((id) => {
    const g = new Uint8Array(90 * 90);
    for (const b of generateLayout(id).buildings) {
      for (let z = Math.ceil(b.cz - b.d / 2 + HALF); z < b.cz + b.d / 2 + HALF; z++) {
        for (let x = Math.ceil(b.cx - b.w / 2 + HALF); x < b.cx + b.w / 2 + HALF; x++) g[z * 90 + x] = 1;
      }
    }
    return g;
  });
  for (let i = 0; i < NEW.length; i++) {
    for (let j = i + 1; j < NEW.length; j++) {
      let both = 0, any = 0;
      for (let k = 0; k < grids[i].length; k++) { both += grids[i][k] & grids[j][k]; any += grids[i][k] | grids[j][k]; }
      assert.ok(both / any < 0.34, NEW[i] + ' and ' + NEW[j] + ' share ' + (both / any).toFixed(2) + ' of their buildings');
    }
    const roads = JSON.stringify(generateLayout(NEW[i]).roads);
    for (let j = i + 1; j < NEW.length; j++) assert.notEqual(JSON.stringify(generateLayout(NEW[j]).roads), roads, NEW[i] + '/' + NEW[j]);
  }
});

test('mapgen: every collider is a sane box inside the arena, closed by the perimeter', () => {
  for (const id of NEW) {
    const { cols } = world(id);
    assert.ok(cols.length > 100, id + ': ' + cols.length);
    for (const c of cols) {
      for (const k of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ']) assert.ok(Number.isFinite(c[k]), id + ' ' + k);
      assert.ok(c.maxX > c.minX && c.maxY > c.minY && c.maxZ > c.minZ, id + ' empty box');
      assert.ok(c.minY >= -1e-9, id + ' below ground');
      if (c.part === 'perimeter') continue;
      assert.ok(c.minX >= -HALF && c.maxX <= HALF && c.minZ >= -HALF && c.maxZ <= HALF,
        id + ': box out of the arena ' + JSON.stringify([c.minX, c.minZ, c.maxX, c.maxZ]));
    }
    const inside = (x, z) => cols.some((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && c.minY < 1 && c.maxY > 3);
    for (const [x, z] of [[0, -45.5], [0, 45.5], [-45.5, 0], [45.5, 0], [44, -45.5], [-45.5, 44]]) {
      assert.ok(inside(x, z), id + ': no wall at ' + x + ', ' + z);
    }
  }
});

test('mapgen: the player starts free and looks into the map', () => {
  for (const id of NEW) {
    const { L, cols, nav, reach } = world(id);
    const s = L.playerStart;
    const body = { x: s.x, y: 0, z: s.z, radius: PLAYER.radius, height: PLAYER.height };
    assert.equal(overlapsAny(body, cols), false, id + ': the start is inside something');
    assert.equal(nav.blockedAt(s.x, s.z), false, id);
    let cells = 0;
    for (const v of reach) cells += v;
    assert.ok(cells * 0.25 > 2000, id + ': only ' + cells * 0.25 + ' m2 to walk');
    // forward is (-sin yaw, -cos yaw); the centre of the map is ahead of the player
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), len = Math.hypot(s.x, s.z);
    assert.ok((fx * -s.x + fz * -s.z) / len > 0.5, id + ': the start looks away from the map');
  }
});

test('mapgen: at least 16 spawn points outside the colliders, reachable from the start, 10 of them over 20 m away', () => {
  for (const id of NEW) {
    const { L, cols, nav, reach } = world(id);
    assert.ok(L.spawns.length >= 16, id + ': ' + L.spawns.length + ' spawns');
    let far = 0;
    for (const p of L.spawns) {
      assert.equal(nav.blockedAt(p.x, p.z), false, id + ' spawn in a wall ' + p.x + ', ' + p.z);
      assert.equal(inWall(cols, p.x, p.z, 0.3), false, id + ' spawn touches a collider ' + p.x + ', ' + p.z);
      assert.ok(at(nav, reach, p.x, p.z), id + ' spawn out of reach ' + p.x + ', ' + p.z);
      if (Math.hypot(p.x - L.playerStart.x, p.z - L.playerStart.z) > 20) far++;
    }
    assert.ok(far >= 10, id + ': only ' + far + ' spawns farther than 20 m');
  }
});

test('mapgen: no free ground cut off from the start bigger than 15 m2 (where the player could stand and the bots never come)', () => {
  // the small ones are the basins of the fountains (12, 5 and 5.5 m2): nobody stands in them for long
  for (const id of NEW) {
    const { nav, reach } = world(id);
    const seen = new Uint8Array(nav.n * nav.n);
    for (let z = 0; z < nav.n; z++) {
      for (let x = 0; x < nav.n; x++) {
        const first = nav.idx(x, z);
        if (seen[first] || reach[first] || nav.blockedCell(x, z)) continue;
        // a pocket of free cells, grown over all eight neighbours (never smaller than the bots would see it)
        const stack = [first];
        seen[first] = 1;
        let cells = 0;
        while (stack.length) {
          const c = stack.pop(), cx = c % nav.n, cz = (c / nav.n) | 0;
          cells++;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (nav.blockedCell(cx + dx, cz + dz)) continue;
              const k = nav.idx(cx + dx, cz + dz);
              if (seen[k] || reach[k]) continue;
              seen[k] = 1;
              stack.push(k);
            }
          }
        }
        const area = cells * nav.cell * nav.cell;
        assert.ok(area <= 15, id + ': ' + area + ' m2 of free ground cut off from the start, near ' + nav.toWorld(x) + ', ' + nav.toWorld(z));
      }
    }
  }
});

test('mapgen: on the port nobody gets off the quay onto the water, not even with a jump from a bollard', () => {
  // the worst case: standing on a bollard (0.6 m) right at the quay (1.3 m), running north and jumping
  // whenever the feet touch something, at walking and at sprinting speed (PLAYER, the controller's step 0.46 m)
  const { L, cols } = world('port');
  const bollards = L.pieces.filter((p) => p.type === 'box' && p.kind === 'bollard');
  assert.ok(bollards.length >= 4, 'bollards along the quay: ' + bollards.length);
  for (const speed of [PLAYER.walk, PLAYER.sprint]) {
    for (const b of bollards) {
      const body = { x: b.x, y: b.y + b.h, z: b.z, vx: 0, vy: 0, vz: 0, radius: PLAYER.radius, height: PLAYER.height, onGround: true };
      assert.equal(overlapsAny(body, cols), false, 'standing on the bollard at ' + b.x);
      let north = Infinity;
      for (let i = 0; i < 120 * 5; i++) {
        body.vx = 0; body.vz = -speed;
        if (body.onGround) { body.vy = PLAYER.jump; body.onGround = false; }
        stepBody(body, 1 / 120, cols, { gravity: PLAYER.gravity, stepHeight: 0.46 });
        north = Math.min(north, body.z - body.radius);
      }
      assert.ok(north >= -35 - 1e-6, 'port: from the bollard at ' + b.x + ' at ' + speed + ' m/s the body reached z ' + north.toFixed(2) +
        ' and ended at ' + [body.x, body.y, body.z].map((n) => n.toFixed(2)));
    }
  }
});

test('mapgen: at least 6 buildings with doors that open into a reachable inside', () => {
  for (const id of NEW) {
    const { L, cols, nav, reach } = world(id);
    const withDoors = L.buildings.filter((b) => b.doors.length > 0);
    assert.ok(withDoors.length >= 6, id + ': ' + withDoors.length + ' buildings with doors');
    for (const b of withDoors) {
      const x0 = b.cx - b.w / 2, x1 = b.cx + b.w / 2, z0 = b.cz - b.d / 2, z1 = b.cz + b.d / 2;
      for (const dr of b.doors) {
        assert.ok(dr.width >= 1.8 && dr.height >= 2.2, id + ' door too small');
        // the middle of the doorway at waist height is free, and one step inside is reachable
        const p = { n: [dr.at, z0 + b.thick / 2], s: [dr.at, z1 - b.thick / 2], w: [x0 + b.thick / 2, dr.at], e: [x1 - b.thick / 2, dr.at] }[dr.side];
        const into = { n: [0, 1.4], s: [0, -1.4], w: [1.4, 0], e: [-1.4, 0] }[dr.side];
        const blocked = cols.some((c) => p[0] > c.minX && p[0] < c.maxX && p[1] > c.minZ && p[1] < c.maxZ && c.minY < 1 && c.maxY > 1);
        assert.equal(blocked, false, id + ': the door at ' + p + ' is walled up');
        assert.ok(at(nav, reach, p[0] + into[0], p[1] + into[1]), id + ': cannot walk in through the door at ' + p);
      }
    }
  }
});

test('mapgen: a height on every map, climbed on foot by steps of at most 0.45 m', () => {
  for (const id of NEW) {
    const { L, cols, nav, reach } = world(id);
    const stairs = L.pieces.filter((p) => p.type === 'stairs');
    assert.ok(stairs.length >= 1 && L.vantage.length >= 1, id + ': nothing to climb');
    let climbed = 0;
    for (const st of stairs) {
      const steps = PIECE_SHAPES.stairs(st).sort((a, b) => a.maxY - b.maxY);
      let prev = st.y || 0;
      for (const c of steps) { assert.ok(c.maxY - prev <= 0.45 + 1e-9, id + ': a step of ' + (c.maxY - prev).toFixed(2) + ' m'); prev = c.maxY; }
      const top = prev, dx = Math.sin(st.yaw), dz = Math.cos(st.yaw);
      const v = L.vantage.find((q) => Math.abs(q.y - top) < 0.05 && Math.hypot(q.x - (st.x + dx * st.d / 2), q.z - (st.z + dz * st.d / 2)) < 2.5);
      assert.ok(v, id + ': the stairs at ' + st.x + ', ' + st.z + ' lead to no vantage point');
      // walk from the foot of the stairs straight to the vantage point
      const foot = { x: st.x - dx * (st.d / 2 + 1), z: st.z - dz * (st.d / 2 + 1) };
      assert.ok(at(nav, reach, foot.x, foot.z), id + ': the foot of the stairs is out of reach');
      const body = { x: foot.x, y: 0, z: foot.z, vx: 0, vy: 0, vz: 0, radius: PLAYER.radius, height: PLAYER.height, onGround: true };
      for (let i = 0; i < 600; i++) {
        const ex = v.x - body.x, ez = v.z - body.z, d = Math.hypot(ex, ez);
        if (d < 0.1) break;
        body.vx = (ex / d) * Math.min(PLAYER.walk, d * 60); body.vz = (ez / d) * Math.min(PLAYER.walk, d * 60);
        stepBody(body, 1 / 60, cols);
      }
      assert.ok(Math.hypot(v.x - body.x, v.z - body.z) < 0.3 && Math.abs(body.y - v.y) < 0.05,
        id + ': walking up ended at ' + [body.x, body.y, body.z].map((n) => n.toFixed(2)) + ' instead of ' + [v.x, v.y, v.z]);
      assert.ok(v.y >= 2.4, id + ': a height of ' + v.y);
      climbed++;
    }
    assert.ok(climbed >= 1, id);
  }
});

test('mapgen: one to three rider loops over 30 m, inside 44 m, 0.8 m from every collider above 0.42 m', () => {
  for (const id of NEW) {
    const { L, cols, routes } = world(id);
    assert.ok(L.routes.length >= 1 && L.routes.length <= 3, id + ': ' + L.routes.length + ' loops');
    assert.equal(new Set(L.routes.map((r) => r.id)).size, L.routes.length, id + ' loop ids');
    for (const r of routes) {
      assert.ok(r.length > 30, id + '/' + r.id + ': ' + r.length.toFixed(1) + ' m');
      for (let s = 0; s < r.length; s += 0.5) {
        const p = r.sample(s);
        assert.ok(Math.abs(p.x) < 44 && Math.abs(p.z) < 44, id + '/' + r.id + ' leaves the map at s = ' + s);
      }
      const gap = routeClearance(r, cols, 0.5);
      assert.ok(gap >= 0.8, id + '/' + r.id + ': ' + gap.toFixed(3) + ' m');
    }
  }
});

test('mapgen: crates, barrels and supplies stand neither in walls nor on the loops, and can be reached', () => {
  for (const id of NEW) {
    const { L, cols, nav, reach, routes } = world(id);
    assert.ok(L.crates.length >= 12, id + ': ' + L.crates.length + ' crates');
    assert.ok(L.barrels.length >= 6, id + ': ' + L.barrels.length + ' barrels');
    assert.ok(L.pickups.length >= 8, id + ': ' + L.pickups.length + ' pickups');
    assert.ok(L.pickups.some((p) => p.type === 'ammo') && L.pickups.some((p) => p.type === 'health'), id);
    const things = [
      ...L.crates.map((c) => ({ ...c, r: c.size * 0.7, what: 'crate' })),
      ...L.barrels.map((b) => ({ ...b, r: 0.4, what: 'barrel' })),
      ...L.pickups.map((p) => ({ ...p, r: 0.4, what: 'pickup' })),
    ];
    for (const t of things) {
      const where = id + ' ' + t.what + ' at ' + t.x + ', ' + t.z;
      assert.ok(Math.abs(t.x) <= HALF - 1.5 && Math.abs(t.z) <= HALF - 1.5, where + ' is off the map');
      assert.equal(inWall(cols, t.x, t.z, t.r), false, where + ' is in a wall');
      assert.equal(onRoute(t.x, t.z, t.r + ROUTE_KEEP_CLEAR, routes), false, where + ' is on a loop');
      assert.ok(Math.hypot(t.x - L.playerStart.x, t.z - L.playerStart.z) >= 4, where + ' is on the start');
      assert.ok(at(nav, reach, t.x, t.z) || t.what === 'crate' || t.what === 'barrel', where + ' cannot be reached');
    }
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i], b = things[j];
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r, id + ': ' + a.what + ' and ' + b.what + ' overlap at ' + a.x + ', ' + a.z);
      }
    }
    // with the crates and barrels standing, every spawn point and supply is still reachable
    const all = navOf([
      ...cols,
      ...L.crates.map((c) => ({ minX: c.x - c.size / 2, maxX: c.x + c.size / 2, minY: 0, maxY: c.size, minZ: c.z - c.size / 2, maxZ: c.z + c.size / 2, solid: true })),
      ...L.barrels.map((b) => ({ minX: b.x - 0.3, maxX: b.x + 0.3, minY: 0, maxY: 0.9, minZ: b.z - 0.3, maxZ: b.z + 0.3, solid: true })),
    ]);
    const reach2 = all.reachableFrom(L.playerStart.x, L.playerStart.z);
    for (const p of [...L.spawns, ...L.pickups]) assert.ok(at(all, reach2, p.x, p.z), id + ': crates cut off ' + p.x + ', ' + p.z);
  }
});

test('mapgen: lamps on every map, at least 8 on the night map; fires stand on the map', () => {
  for (const id of NEW) {
    const L = generateLayout(id);
    assert.ok(L.lamps.length >= 2, id + ': ' + L.lamps.length + ' lamps');
    for (const l of L.lamps) {
      assert.ok(Number.isFinite(l.x) && Number.isFinite(l.z) && l.y > 2 && Number.isInteger(l.color), id + ' lamp');
      assert.ok(Math.abs(l.x) < HALF && Math.abs(l.z) < HALF, id + ' lamp off the map');
    }
    for (const f of L.fires) assert.ok(Math.abs(f.x) < HALF && Math.abs(f.z) < HALF && f.s > 0, id + ' fire');
  }
  assert.ok(generateLayout('night').lamps.length >= 8, 'night: ' + generateLayout('night').lamps.length);
});

test('mapgen: every piece has a type from the closed list, and every type has a collision shape', () => {
  for (const type of PIECE_TYPES) {
    assert.equal(typeof PIECE_SHAPES[type], 'function', type);
    const boxes = PIECE_SHAPES[type]({ type, x: 3, z: -2, y: 0, yaw: Math.PI / 2, w: 4, h: 3.4, d: 6 });
    assert.ok(Array.isArray(boxes), type);
    for (const c of boxes) assert.ok(c.maxX > c.minX && c.maxY > c.minY && c.maxZ > c.minZ && c.solid !== undefined, type + ' box');
  }
  for (const id of NEW) {
    for (const p of generateLayout(id).pieces) {
      assert.ok(PIECE_TYPES.includes(p.type), id + ': unknown piece ' + p.type);
      for (const k of ['x', 'z', 'y', 'yaw', 'w', 'h', 'd']) assert.ok(Number.isFinite(p[k]), id + ' ' + p.type + '.' + k);
    }
  }
});

test('mapgen: a quarter turn swaps the footprint of a piece, half a turn keeps it', () => {
  const box = (yaw) => PIECE_SHAPES.container({ type: 'container', x: 10, z: 5, y: 0, yaw, w: 6, h: 2.6, d: 2 })[0];
  const a = box(0), b = box(Math.PI / 2), c = box(Math.PI);
  assert.deepEqual([a.minX, a.maxX, a.minZ, a.maxZ], [7, 13, 4, 6]);
  assert.deepEqual([b.minX, b.maxX, b.minZ, b.maxZ], [9, 11, 2, 8]);
  assert.deepEqual([c.minX, c.maxX, c.minZ, c.maxZ], [7, 13, 4, 6]);
});

test('mapgen: a schema for the shop card of every map, the block from its hand-built table', () => {
  for (const id of MAP_IDS) {
    const s = mapSchema(id);
    assert.equal(s.half, 45, id);
    assert.ok(s.buildings.length >= 6, id + ' buildings');
    assert.ok(s.roads.length >= 1, id + ' roads');
    assert.ok(s.routes.length >= 1, id + ' routes');
    for (const r of [...s.buildings, ...s.roads]) assert.ok(r.x1 > r.x0 && r.z1 > r.z0, id + ' rect');
    for (const line of s.routes) for (const p of line) assert.ok(p.length === 2 && Math.abs(p[0]) < 45 && Math.abs(p[1]) < 45, id + ' route point');
  }
  const block = mapSchema('block');
  assert.equal(block.buildings.length, 10);
  assert.equal(block.roads.length, 2);
  assert.equal(block.routes.length, ROUTES.length);
  assert.ok(block.buildings.some((b) => b.x0 === -38 && b.x1 === -16 && b.z0 === -36 && b.z1 === -20), 'the big house in the north west');
  assert.deepEqual(mapSchema('port').buildings.length >= generateLayout('port').buildings.length, true);
});
