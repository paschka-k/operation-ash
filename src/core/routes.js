// core/routes: the closed loops riders follow along the streets. Pure data and geometry, no three.js.
//
// A loop is a closed polyline of street points; buildRoute rounds every corner with a circular
// fillet and turns it into a chain of straight and arc pieces that can be walked by distance:
//
//   const r = buildRoute(ROUTES[0]);
//   r.sample(s)      -> {x, z, heading, curvature}   s in metres along the loop, taken modulo r.length
//   r.nearest(x, z)  -> {s, dist}                    closest point of the loop to (x, z)
//
// heading follows the yaw convention of the game, atan2(dx, dz). curvature is 1 / radius, positive
// where the loop turns from +x towards +z, which lowers the heading (from +z it turns towards -x), zero
// on the straights.
//
// The loops are data, not a path search: the bots' grid of 0.5 m cells is made for people on foot.
// Every loop keeps at least 0.8 m from the solid colliders of the level that are taller than 0.42 m;
// tests/core/routes.test.mjs checks that against a snapshot of the level's colliders taken in the game
// (tests/core/fixtures/street-colliders.json). Crates and barrels are not placed near the loops (onRoute).

const TAU = Math.PI * 2;

/**
 * The loops of the level. points are [x, z] or [x, z, cornerRadius]; radius rounds the other corners
 * (each corner takes as much of it as its two sides allow); width is the lane a vehicle keeps clear for
 * itself. The street along x is
 * |z| < 6, the street along z is |x| < 6; the narrowest spots are named next to each loop.
 *
 *   main   the whole street along x, one way round: east through the crossroads between its concrete
 *          blocks (north of the hedgehog at (-13, -0.8), south of the one at (13, 0.8)), back west along
 *          the northern kerb (z -5.85) past the cars at (9.5, -3.2) and (-20, -4); turns before the fence
 *          at x = 38 and in front of the perimeter wall in the west. Tightest: the rubble at (22, -8.5).
 *   north  a racetrack in the street along z north of the crossroads, between the rubble at (-8, -26)
 *          and the wrecked bus, south end clear of the hedgehog at (0, -17).
 *   south  a racetrack round the covered car at (0, 24) and the hedgehog at (-1, 28), between the car at
 *          (2.6, 12.5) and the player's start at (0, 36).
 */
export const ROUTES = [
  {
    id: 'main', closed: true, width: 1.6, radius: 4,
    points: [
      [-40.5, 0.6], [-26, 0.6, 40], [-14, 0.95, 40], [-3, 0.95, 25], [7, -1.1, 25], [34.6, -1.1],
      [34.6, -5.85], [-24, -5.85, 12], [-27, -4.4, 12], [-40.5, -4.4],
    ],
  },
  {
    id: 'north', closed: true, width: 1.6, radius: 2.4,
    points: [[0.35, -20.95], [0.35, -41.8], [-4.4, -41.8], [-4.4, -20.95]],
  },
  {
    id: 'south', closed: true, width: 1.6, radius: 2.6,
    points: [[-3, 15.6], [-3, 31.4], [3.6, 31.4], [3.6, 15.6]],
  },
];

/** Heading of a direction in the yaw convention of the game. */
const headingOf = (dx, dz) => Math.atan2(dx, dz);

/**
 * Build a walkable loop from a definition {id, points, closed, width, radius?}. A point [x, z, r] may
 * carry the radius of its own corner (a slight kink wants a wide one, or the vehicles slow down for it);
 * the others take def.radius (3 m when missing). A corner never takes more than half of either side.
 */
export function buildRoute(def) {
  const pts = def.points.map(([x, z, r]) => ({ x, z, r }));
  const n = pts.length;
  // directions and lengths of the sides; side i runs from point i to point i + 1
  const sides = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    return { dx: (q.x - p.x) / len, dz: (q.z - p.z) / len, len };
  });
  // a fillet at every corner: corner i joins side i - 1 to side i
  const fillets = pts.map((p, i) => {
    const a = sides[(i - 1 + n) % n], b = sides[i];
    const cross = a.dx * b.dz - a.dz * b.dx, dot = a.dx * b.dx + a.dz * b.dz;
    const turn = Math.atan2(cross, dot);              // signed angle from side a to side b
    if (Math.abs(turn) < 1e-9) return { t: 0, turn: 0, p };
    const half = Math.tan(Math.abs(turn) / 2);
    const r = Math.min(p.r ?? def.radius ?? 3, (0.5 * Math.min(a.len, b.len)) / half);
    const t = r * half;                               // how much of each side the fillet takes
    const sx = p.x - a.dx * t, sz = p.z - a.dz * t;   // where the arc starts
    const sign = cross > 0 ? 1 : -1;
    const cx = sx + (sign > 0 ? -a.dz : a.dz) * r, cz = sz + (sign > 0 ? a.dx : -a.dx) * r;
    return { t, turn, r, sign, cx, cz, phi0: Math.atan2(sz - cz, sx - cx), p };
  });

  // the pieces in order: s = 0 is where the straight after the fillet of corner 0 begins
  const segments = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const side = sides[i], f0 = fillets[i], f1 = fillets[(i + 1) % n];
    const len = side.len - f0.t - f1.t;
    if (len > 1e-9) {
      segments.push({ kind: 'line', s0: s, len, ax: pts[i].x + side.dx * f0.t, az: pts[i].z + side.dz * f0.t, dx: side.dx, dz: side.dz });
      s += len;
    }
    if (f1.t > 0) {
      const alen = f1.r * Math.abs(f1.turn);
      segments.push({ kind: 'arc', s0: s, len: alen, cx: f1.cx, cz: f1.cz, r: f1.r, phi0: f1.phi0, sign: f1.sign });
      s += alen;
    }
  }
  const length = s;

  const wrap = (v) => ((v % length) + length) % length;

  function pieceAt(sw) {
    let lo = 0, hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].s0 <= sw) lo = mid; else hi = mid - 1;
    }
    return segments[lo];
  }

  function sample(sIn, out = {}) {
    const sw = wrap(sIn);
    const g = pieceAt(sw);
    const u = Math.min(Math.max(sw - g.s0, 0), g.len);
    if (g.kind === 'line') {
      out.x = g.ax + g.dx * u; out.z = g.az + g.dz * u;
      out.heading = headingOf(g.dx, g.dz);
      out.curvature = 0;
    } else {
      const phi = g.phi0 + (g.sign * u) / g.r;
      out.x = g.cx + Math.cos(phi) * g.r; out.z = g.cz + Math.sin(phi) * g.r;
      out.heading = headingOf(-Math.sin(phi) * g.sign, Math.cos(phi) * g.sign);
      out.curvature = g.sign / g.r;
    }
    return out;
  }

  function nearest(x, z) {
    let best = { s: 0, dist: Infinity };
    for (const g of segments) {
      let u, d;
      if (g.kind === 'line') {
        u = Math.min(Math.max((x - g.ax) * g.dx + (z - g.az) * g.dz, 0), g.len);
        d = Math.hypot(x - (g.ax + g.dx * u), z - (g.az + g.dz * u));
      } else {
        // angle of the point around the centre, measured from the start of the arc in its direction
        const phi = Math.atan2(z - g.cz, x - g.cx);
        let k = ((phi - g.phi0) * g.sign) % TAU;
        if (k < 0) k += TAU;
        const sweep = g.len / g.r;
        if (k > sweep) k = k - sweep < TAU - k ? sweep : 0;   // past the arc: the nearer end
        u = k * g.r;
        const px = g.cx + Math.cos(g.phi0 + g.sign * k) * g.r, pz = g.cz + Math.sin(g.phi0 + g.sign * k) * g.r;
        d = Math.hypot(x - px, z - pz);
      }
      if (d < best.dist) best = { s: wrap(g.s0 + u), dist: d };
    }
    return best;
  }

  return { id: def.id, length, width: def.width ?? 1.6, closed: true, segments, sample, nearest };
}

/** Gap between a point and the footprint of a box on the ground plane (0 inside it). */
function gapToBox(x, z, c) {
  const dx = Math.max(c.minX - x, 0, x - c.maxX), dz = Math.max(c.minZ - z, 0, z - c.maxZ);
  return Math.hypot(dx, dz);
}

/** Does a collider stand in the way of a vehicle: solid and taller than a kerb? */
const blocksVehicles = (c) => c.solid !== false && c.maxY > 0.42;

/**
 * Smallest gap in metres between the loop and the solid colliders taller than 0.42 m, checked every
 * `step` metres along it. Infinity when nothing is near; 0 when a box stands on the loop.
 */
export function routeClearance(route, colliders, step = 0.5) {
  const list = colliders.filter(blocksVehicles);
  let best = Infinity;
  const p = {};
  for (let s = 0; s < route.length; s += step) {
    route.sample(s, p);
    for (const c of list) {
      const g = gapToBox(p.x, p.z, c);
      if (g < best) best = g;
    }
  }
  return best;
}

/** Crates and barrels keep at least this many metres between their edge and a loop. */
export const ROUTE_KEEP_CLEAR = 1.2;

let built = null;
/** The level's loops, built once. */
export function levelRoutes() {
  if (!built) built = ROUTES.map(buildRoute);
  return built;
}

/** True when (x, z) is closer than `margin` to any loop (of the level, or of the given list). */
export function onRoute(x, z, margin, routes = levelRoutes()) {
  for (const r of routes) if (r.nearest(x, z).dist < margin) return true;
  return false;
}
