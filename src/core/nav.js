// Navigation grid and A* path finding on the XZ plane.

export class NavGrid {
  /**
   * @param {number} half  half extent of the map in metres
   * @param {number} cell  cell size in metres
   * @param {number} margin  agent radius added around obstacles
   */
  constructor(half = 45, cell = 1, margin = 0.45) {
    this.half = half;
    this.cell = cell;
    this.margin = margin;
    this.n = Math.ceil((half * 2) / cell);
    this.count = new Uint16Array(this.n * this.n);
    this.boxes = new Set();
  }

  idx(cx, cz) { return cz * this.n + cx; }
  toCell(v) { return Math.floor((v + this.half) / this.cell); }
  toWorld(c) { return -this.half + (c + 0.5) * this.cell; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.n && cz < this.n; }

  /** Does this collider block walking agents? */
  static blocks(box) {
    return box.solid && box.maxY > 0.42 && box.minY < 1.7 && box.navIgnore !== true;
  }

  _range(box) {
    const m = this.margin;
    return [
      Math.max(0, this.toCell(box.minX - m)),
      Math.min(this.n - 1, this.toCell(box.maxX + m - 1e-6)),
      Math.max(0, this.toCell(box.minZ - m)),
      Math.min(this.n - 1, this.toCell(box.maxZ + m - 1e-6)),
    ];
  }

  addBox(box) {
    if (!NavGrid.blocks(box) || this.boxes.has(box)) return;
    this.boxes.add(box);
    const [x0, x1, z0, z1] = this._range(box);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.count[this.idx(x, z)]++;
  }

  removeBox(box) {
    if (!this.boxes.has(box)) return;
    this.boxes.delete(box);
    const [x0, x1, z0, z1] = this._range(box);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = this.idx(x, z);
        if (this.count[i] > 0) this.count[i]--;
      }
    }
  }

  blockedCell(cx, cz) {
    if (!this.inside(cx, cz)) return true;
    return this.count[this.idx(cx, cz)] > 0;
  }

  blockedAt(x, z) { return this.blockedCell(this.toCell(x), this.toCell(z)); }

  /** Nearest free cell to a world position, as world {x,z}. */
  nearestFree(x, z, maxRing = 8) {
    const cx = this.toCell(x), cz = this.toCell(z);
    if (!this.blockedCell(cx, cz)) return { x, z };
    for (let r = 1; r <= maxRing; r++) {
      let best = null, bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const tx = cx + dx, tz = cz + dz;
          if (this.blockedCell(tx, tz)) continue;
          const wx = this.toWorld(tx), wz = this.toWorld(tz);
          const d = (wx - x) ** 2 + (wz - z) ** 2;
          if (d < bestD) { bestD = d; best = { x: wx, z: wz }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Flood fill: Uint8Array mask of cells reachable from a world position. */
  reachableFrom(x, z) {
    const n = this.n;
    const mask = new Uint8Array(n * n);
    const start = this.nearestFree(x, z, Math.ceil(4 / this.cell));
    if (!start) return mask;
    const queue = [this.idx(this.toCell(start.x), this.toCell(start.z))];
    mask[queue[0]] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx, nz = cz + dz;
          if (this.blockedCell(nx, nz)) continue;
          if (dx !== 0 && dz !== 0 && (this.blockedCell(cx + dx, cz) || this.blockedCell(cx, cz + dz))) continue;
          const ni = nz * n + nx;
          if (mask[ni]) continue;
          mask[ni] = 1;
          queue.push(ni);
        }
      }
    }
    return mask;
  }

  /** Straight walk between two world points without touching blocked cells. */
  walkable(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.blockedAt(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  /**
   * A* from world (sx,sz) to (tx,tz). Returns array of {x,z} waypoints
   * (not including the start) or null when unreachable.
   */
  findPath(sx, sz, tx, tz, maxNodes = Math.round(6000 / (this.cell * this.cell))) {
    const start = this.nearestFree(sx, sz, Math.ceil(3 / this.cell));
    const goal = this.nearestFree(tx, tz, Math.ceil(8 / this.cell));
    if (!start || !goal) return null;
    const n = this.n;
    const s = this.idx(this.toCell(start.x), this.toCell(start.z));
    const g = this.idx(this.toCell(goal.x), this.toCell(goal.z));
    if (s === g) return [{ x: goal.x, z: goal.z }];

    const gScore = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = new MinHeap();
    const gx = g % n, gz = (g / n) | 0;
    const h = (i) => {
      const dx = Math.abs((i % n) - gx), dz = Math.abs(((i / n) | 0) - gz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    gScore[s] = 0;
    heap.push(s, h(s));
    let expanded = 0;
    let found = false;

    while (heap.size > 0 && expanded < maxNodes) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      expanded++;
      if (cur === g) { found = true; break; }
      const cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx, nz = cz + dz;
          if (this.blockedCell(nx, nz)) continue;
          if (dx !== 0 && dz !== 0) {
            // no corner cutting
            if (this.blockedCell(cx + dx, cz) || this.blockedCell(cx, cz + dz)) continue;
          }
          const ni = nz * n + nx;
          if (closed[ni]) continue;
          const cost = gScore[cur] + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
          if (cost < gScore[ni]) {
            gScore[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + h(ni));
          }
        }
      }
    }
    if (!found) return null;

    const cells = [];
    for (let c = g; c !== -1 && c !== s; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: this.toWorld(c % n), z: this.toWorld((c / n) | 0) }));
    pts[pts.length - 1] = { x: goal.x, z: goal.z };

    // Simplify with line of sight (string pulling).
    const out = [];
    let ax = start.x, az = start.z;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.walkable(ax, az, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      ax = pts[j].x; az = pts[j].z;
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastItem = a.pop(), lastKey = k.pop();
    if (a.length > 0) {
      a[0] = lastItem; k[0] = lastKey;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < n && k[l] < k[m]) m = l;
        if (r < n && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}
