// Cover points for the bot AI. A cover point is a spot just outside the face
// of a tall obstacle. Bots hide there, then step to a peek position to shoot.
// Pure functions: no DOM and no three.js, so they run under node for tests.

import { lineOfSight, clamp } from './collision.js';

// Distances from the obstacle face to try. The nav grid has 1 m cells, so the first
// free cell next to an obstacle can be up to 1.5 m away.
const OFFSETS = [0.9, 1.25, 1.7];
const BUCKET = 8;      // metres per spatial bucket

/**
 * Build cover points from the collider list.
 * @returns {{x:number,z:number,nx:number,nz:number}[]} nx,nz is the outward face normal.
 */
export function generateCoverPoints(colliders, nav, reach = null) {
  const pts = [];
  for (const c of colliders) {
    if (!c.solid) continue;
    const h = c.maxY - Math.max(0, c.minY);
    if (c.maxY < 1.1 || c.minY > 0.6 || h < 1.0) continue;
    const w = c.maxX - c.minX, d = c.maxZ - c.minZ;
    if (Math.max(w, d) < 0.55 || Math.min(w, d) < 0.12) continue;
    const faces = [
      { nx: 1, nz: 0, edge: c.maxX, sign: 1, a0: c.minZ, a1: c.maxZ, alongX: false },
      { nx: -1, nz: 0, edge: c.minX, sign: -1, a0: c.minZ, a1: c.maxZ, alongX: false },
      { nx: 0, nz: 1, edge: c.maxZ, sign: 1, a0: c.minX, a1: c.maxX, alongX: true },
      { nx: 0, nz: -1, edge: c.minZ, sign: -1, a0: c.minX, a1: c.maxX, alongX: true },
    ];
    for (const f of faces) {
      const len = f.a1 - f.a0;
      if (len < 0.5) continue;
      // points near both corners are the best peek spots, plus spaced ones along long faces
      const along = [f.a0 + Math.min(0.5, len / 2), f.a1 - Math.min(0.5, len / 2)];
      const n = Math.floor(len / 3);
      for (let i = 1; i <= n; i++) along.push(f.a0 + (len * i) / (n + 1));
      for (const a of along) {
        for (const off of OFFSETS) {
          const fixed = f.edge + f.sign * off;
          const x = f.alongX ? a : fixed;
          const z = f.alongX ? fixed : a;
          if (nav.blockedAt(x, z)) continue;
          if (reach && !reach[nav.idx(nav.toCell(x), nav.toCell(z))]) continue;
          pts.push({ x, z, nx: f.nx, nz: f.nz });
          break;
        }
      }
    }
  }
  return pts;
}

/** Spatial index of cover points in coarse buckets. */
export function indexCover(points, half = 45) {
  const n = Math.ceil((half * 2) / BUCKET) + 1;
  const grid = Array.from({ length: n * n }, () => []);
  const cell = (v) => clamp(Math.floor((v + half) / BUCKET), 0, n - 1);
  for (const p of points) grid[cell(p.z) * n + cell(p.x)].push(p);
  return {
    n, half,
    near(x, z, radius) {
      const out = [];
      const r = Math.ceil(radius / BUCKET);
      const cx = cell(x), cz = cell(z);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const gx = cx + dx, gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= n || gz >= n) continue;
          for (const p of grid[gz * n + gx]) if ((p.x - x) ** 2 + (p.z - z) ** 2 <= radius * radius) out.push(p);
        }
      }
      return out;
    },
  };
}

/**
 * Pick a cover point for a bot. The point must be hidden from the player's eye
 * and should have a peek position along the obstacle edge with a clear line of
 * fire. Returns {x,z,nx,nz,peek:{x,z}|null} or null.
 */
export function findCover({ index, colliders, nav, rnd = Math.random, enemy, player, eye, radius = 16, prefer = 18, samples = 14 }) {
  const near = index.near(enemy.x, enemy.z, radius);
  if (!near.length) return null;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < samples && i < near.length; i++) {
    const p = near[Math.floor(rnd() * near.length)];
    const dPlayer = Math.hypot(p.x - player.x, p.z - player.z);
    if (dPlayer < 6 || dPlayer > 48) continue;
    // hidden: the player cannot see a standing bot at this point
    if (lineOfSight(colliders, eye.x, eye.y, eye.z, p.x, 1.45, p.z)) continue;
    // a peek position along the face where the bot can see the player
    const tx = -p.nz, tz = p.nx;
    let peek = null;
    for (const s of [1.4, -1.4, 2.1, -2.1]) {
      const px = p.x + tx * s, pz = p.z + tz * s;
      if (nav.blockedAt(px, pz) || !nav.walkable(p.x, p.z, px, pz)) continue;
      if (lineOfSight(colliders, eye.x, eye.y, eye.z, px, 1.45, pz)) { peek = { x: px, z: pz }; break; }
    }
    const dEnemy = Math.hypot(p.x - enemy.x, p.z - enemy.z);
    const score = dEnemy + Math.abs(dPlayer - prefer) * 0.6 - (peek ? 9 : 0);
    if (score < bestScore) { bestScore = score; best = { ...p, peek }; }
  }
  return best;
}
