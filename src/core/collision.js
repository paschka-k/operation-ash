// core/collision: the world is made of axis-aligned boxes. Bodies are vertical
// capsules approximated by boxes that slide along walls, step over low ledges
// and land on box tops. Rays hit boxes and report the surface normal.
// Pure math, no DOM and no three.js, so it runs under node for tests.

import { clamp } from './math.js';
export * from './math.js';

export const COLLISION_DEFAULTS = {
  gravity: 22,
  stepHeight: 0.45,
  ground: 0,
  iterations: 3,      // push-out passes when a body ends up inside geometry
};

export const EPS = 1e-4;

/** Create a collider from a centre point and full size. */
export function makeBox(cx, cy, cz, w, h, d, props = {}) {
  return {
    minX: cx - w / 2, maxX: cx + w / 2,
    minY: cy - h / 2, maxY: cy + h / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
    kind: 'concrete',
    solid: true,
    ...props,
  };
}

/** Create a collider from min and max corners. */
export function boxFromMinMax(x0, y0, z0, x1, y1, z1, props = {}) {
  return {
    minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
    minY: Math.min(y0, y1), maxY: Math.max(y0, y1),
    minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
    kind: 'concrete',
    solid: true,
    ...props,
  };
}

function bodyOverlaps(b, box) {
  return (
    b.x + b.radius > box.minX + EPS && b.x - b.radius < box.maxX - EPS &&
    b.z + b.radius > box.minZ + EPS && b.z - b.radius < box.maxZ - EPS &&
    b.y + b.height > box.minY + EPS && b.y < box.maxY - EPS
  );
}

/** True if the body overlaps any solid collider. */
export function overlapsAny(body, colliders, ignore = null) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c === ignore || !c.solid) continue;
    if (bodyOverlaps(body, c)) return true;
  }
  return false;
}

/**
 * Move a body (feet position x,y,z; velocity vx,vy,vz) for dt seconds.
 * Resolves each axis separately, steps up small ledges, lands on box tops.
 * body: {x,y,z,vx,vy,vz,radius,height,onGround}
 * opts: {gravity, stepHeight, ground}
 */
export function stepBody(body, dt, colliders, opts = {}) {
  const gravity = opts.gravity ?? COLLISION_DEFAULTS.gravity;
  const stepHeight = opts.stepHeight ?? COLLISION_DEFAULTS.stepHeight;
  const groundY = opts.ground ?? COLLISION_DEFAULTS.ground;

  // horizontal X
  body.x += body.vx * dt;
  resolveHorizontal(body, colliders, 'x', body.vx, stepHeight);
  // horizontal Z
  body.z += body.vz * dt;
  resolveHorizontal(body, colliders, 'z', body.vz, stepHeight);

  // vertical
  const prevY = body.y;
  body.vy -= gravity * dt;
  body.y += body.vy * dt;
  let landed = false;

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.solid) continue;
    if (!bodyOverlaps(body, c)) continue;
    if (body.vy <= 0 && prevY >= c.maxY - 0.06) {
      body.y = c.maxY;
      body.vy = 0;
      landed = true;
    } else if (body.vy > 0 && prevY + body.height <= c.minY + 0.06) {
      body.y = c.minY - body.height;
      body.vy = 0;
    }
  }
  if (body.y <= groundY) {
    body.y = groundY;
    if (body.vy < 0) body.vy = 0;
    landed = true;
  }
  body.onGround = landed;

  // Last resort: a body that ended up inside geometry (spawned there, or boxes
  // appeared around it) is pushed out along the shallowest axis.
  const iterations = opts.iterations ?? COLLISION_DEFAULTS.iterations;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (!c.solid || !bodyOverlaps(body, c)) continue;
      const px0 = body.x + body.radius - c.minX, px1 = c.maxX - (body.x - body.radius);
      const pz0 = body.z + body.radius - c.minZ, pz1 = c.maxZ - (body.z - body.radius);
      const py1 = c.maxY - body.y;
      const m = Math.min(px0, px1, pz0, pz1, py1);
      if (m === py1 && py1 < 0.6) { body.y = c.maxY; body.vy = Math.max(0, body.vy); body.onGround = true; }
      else if (m === px0) body.x = c.minX - body.radius - EPS;
      else if (m === px1) body.x = c.maxX + body.radius + EPS;
      else if (m === pz0) body.z = c.minZ - body.radius - EPS;
      else body.z = c.maxZ + body.radius + EPS;
      moved = true;
    }
    if (!moved) break;
  }
}

function resolveHorizontal(body, colliders, axis, vel, stepHeight) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.solid) continue;
    if (!bodyOverlaps(body, c)) continue;

    // Can we simply step onto it? The ledge may be a stack of low steps (rubble, pallets) that
    // the body touches at the same time, so stand on the highest top that is still within reach.
    const rise = c.maxY - body.y;
    if (body.onGround && rise > 0 && rise <= stepHeight) {
      const saved = body.y;
      const top = reachableTop(body, colliders, c.maxY, saved + stepHeight);
      body.y = top + EPS;
      if (!overlapsAny(body, colliders)) {
        body.y = top;
        body.vy = 0;
        continue;
      }
      body.y = saved;
    }

    if (axis === 'x') {
      if (vel > 0) body.x = c.minX - body.radius - EPS;
      else if (vel < 0) body.x = c.maxX + body.radius + EPS;
      else body.x += pushOutDir(body.x, c.minX, c.maxX) * (body.radius + EPS);
      body.vx = 0;
    } else {
      if (vel > 0) body.z = c.minZ - body.radius - EPS;
      else if (vel < 0) body.z = c.maxZ + body.radius + EPS;
      else body.z += pushOutDir(body.z, c.minZ, c.maxZ) * (body.radius + EPS);
      body.vz = 0;
    }
  }
}

/** Highest box top between `from` and `limit` under the body's footprint. */
function reachableTop(body, colliders, from, limit) {
  let top = from;
  for (let i = 0; i < colliders.length; i++) {
    const d = colliders[i];
    if (!d.solid || d.maxY <= top || d.maxY > limit + EPS) continue;
    if (body.x + body.radius > d.minX + EPS && body.x - body.radius < d.maxX - EPS &&
        body.z + body.radius > d.minZ + EPS && body.z - body.radius < d.maxZ - EPS) top = d.maxY;
  }
  return top;
}

/**
 * Height to stand at for a body placed at (x, z): the top of the highest low box under it
 * (up to `maxStep` above the ground), or the ground. Use it when spawning or teleporting, so
 * nothing ever starts inside a pallet stack or a spill of rubble.
 */
export function standingHeight(x, z, radius, colliders, maxStep = 0.6, ground = 0) {
  let y = ground;
  for (let i = 0; i < colliders.length; i++) {
    const d = colliders[i];
    if (!d.solid || d.minY > ground + EPS || d.maxY <= y || d.maxY > ground + maxStep) continue;
    if (x + radius > d.minX + EPS && x - radius < d.maxX - EPS && z + radius > d.minZ + EPS && z - radius < d.maxZ - EPS) y = d.maxY;
  }
  return y;
}

function pushOutDir(p, lo, hi) {
  return p < (lo + hi) / 2 ? -1 : 1;
}

/**
 * Ray against one box. Returns {t, nx, ny, nz} or null.
 * Direction need not be normalised, t is in units of the direction length.
 */
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxT = Infinity) {
  let tmin = 0;
  let tmax = maxT;
  let nx = 0, ny = 0, nz = 0;

  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.minX || ox > box.maxX) return null;
  } else {
    let t1 = (box.minX - ox) / dx;
    let t2 = (box.maxX - ox) / dx;
    let n = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = n; ny = 0; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (oy < box.minY || oy > box.maxY) return null;
  } else {
    let t1 = (box.minY - oy) / dy;
    let t2 = (box.maxY - oy) / dy;
    let n = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = n; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Z slab
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.minZ || oz > box.maxZ) return null;
  } else {
    let t1 = (box.minZ - oz) / dz;
    let t2 = (box.maxZ - oz) / dz;
    let n = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = n; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin > maxT) return null;
  return { t: tmin, nx, ny, nz };
}

/**
 * Nearest hit of a ray against all solid colliders (and the ground plane).
 * Returns {t, box, nx, ny, nz, x, y, z} or null. dir must be unit length.
 * opts: {skip, bullets (ignore colliders with blocksBullets === false), noGround}
 */
export function raycast(colliders, ox, oy, oz, dx, dy, dz, maxT = 200, opts = {}) {
  let best = null;
  let bestT = maxT;
  const skip = opts.skip;
  const needBullets = opts.bullets === true;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (!c.solid || c === skip) continue;
    if (needBullets && c.blocksBullets === false) continue;
    const h = rayBox(ox, oy, oz, dx, dy, dz, c, bestT);
    if (h && h.t < bestT) {
      bestT = h.t;
      best = { t: h.t, box: c, nx: h.nx, ny: h.ny, nz: h.nz };
    }
  }
  // ground plane y = 0
  if (dy < -1e-9 && !opts.noGround) {
    const t = -oy / dy;
    if (t > 0 && t < bestT) {
      bestT = t;
      best = { t, box: null, nx: 0, ny: 1, nz: 0 };
    }
  }
  if (best) {
    best.x = ox + dx * best.t;
    best.y = oy + dy * best.t;
    best.z = oz + dz * best.t;
  }
  return best;
}

/** True when nothing solid lies between two points. */
export function lineOfSight(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const hit = raycast(colliders, ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, { noGround: true, bullets: true });
  return !hit;
}

/** Ray vs sphere. Returns t or -1. dir must be unit length. */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t1 < 0) return -1;
  return t0 >= 0 ? t0 : t1;
}

/** Ray vs a vertical cylinder clipped to y0..y1. Returns t or -1. */
export function rayVerticalCylinder(ox, oy, oz, dx, dy, dz, cx, y0, y1, cz, r) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return -1;
  const y = oy + dy * t;
  if (y < y0 || y > y1) return -1;
  return t;
}


// ----------------------------------------------------------------- public API

/**
 * A collider from min/max corners ({x,y,z}), an id and tags. tags is either a list
 * of strings or an object of extra properties such as {kind: 'metal', owner}.
 */
export function aabb(min, max, id = null, tags = []) {
  const props = { id, tags: Array.isArray(tags) ? tags : [] };
  if (tags && !Array.isArray(tags)) Object.assign(props, tags);
  return boxFromMinMax(min.x, min.y, min.z, max.x, max.y, max.z, props);
}

/**
 * Move a body for dt seconds without mutating it.
 * body: {pos:{x,y,z}, vel:{x,y,z}, radius, height, grounded}
 * Returns {pos, vel, grounded}.
 */
export function moveBody(body, dt, colliders, opts = {}) {
  const b = {
    x: body.pos.x, y: body.pos.y, z: body.pos.z,
    vx: body.vel.x, vy: body.vel.y, vz: body.vel.z,
    radius: body.radius, height: body.height, onGround: !!body.grounded,
  };
  stepBody(b, dt, colliders, { ...COLLISION_DEFAULTS, ...opts });
  return { pos: { x: b.x, y: b.y, z: b.z }, vel: { x: b.vx, y: b.vy, z: b.vz }, grounded: b.onGround };
}

/**
 * Ray against the colliders. dir must be a unit vector.
 * Returns {t, point, normal, id, collider} or null. Pass opts.ground = true
 * to let the ray hit the ground plane too.
 */
export function rayAABB(origin, dir, maxDist, colliders, opts = {}) {
  const h = raycast(colliders, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, { noGround: !opts.ground, bullets: !!opts.bullets });
  if (!h) return null;
  return {
    t: h.t,
    point: { x: h.x, y: h.y, z: h.z },
    normal: { x: h.nx, y: h.ny, z: h.nz },
    id: h.box ? h.box.id ?? null : 'ground',
    collider: h.box,
  };
}
