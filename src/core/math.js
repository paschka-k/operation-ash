// core/math: vectors, angles and the seeded random generator.
// Pure functions, no three.js and no DOM.

export const DEG = Math.PI / 180;

export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

/** Small vector toolbox on plain {x,y,z} objects. */
export const v3 = {
  add: (a, b) => vec3(a.x + b.x, a.y + b.y, a.z + b.z),
  sub: (a, b) => vec3(a.x - b.x, a.y - b.y, a.z - b.z),
  scale: (a, k) => vec3(a.x * k, a.y * k, a.z * k),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a, b) => vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x),
  len: (a) => Math.hypot(a.x, a.y, a.z),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
  normalize(a) {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    return vec3(a.x / l, a.y / l, a.z / l);
  },
};

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Frame-rate independent exponential smoothing. */
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

/** Shortest signed difference between two angles in radians. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Seeded generator. Returns a function that yields numbers in [0, 1).
 * The same seed always gives the same sequence. The implementation (mulberry32)
 * is hidden behind this one function. range/int/pick are conveniences on it.
 */
export function createRng(seed = 1) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}
export const makeRng = createRng;

/**
 * A random unit vector inside a cone around dir. deg is the half angle of the
 * cone in degrees; points are spread evenly over the disc of the cone.
 */
export function randomCone(dir, deg, rng = Math.random) {
  const d = v3.normalize(dir);
  if (deg <= 0) return d;
  const helper = Math.abs(d.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const right = v3.normalize(v3.cross(d, helper));
  const up = v3.cross(right, d);
  const r = Math.tan(deg * DEG) * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return v3.normalize(vec3(
    d.x + right.x * Math.cos(a) * r + up.x * Math.sin(a) * r,
    d.y + right.y * Math.cos(a) * r + up.y * Math.sin(a) * r,
    d.z + right.z * Math.cos(a) * r + up.z * Math.sin(a) * r,
  ));
}
