// The map: a ruined city block, about 90 x 90 m. Builds static geometry (merged
// per material for few draw calls), AABB colliders, a navigation grid, spawn
// points and decorative skyline. Dynamic props (crates, barrels, pickups) live
// in props.js and are placed from here.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox, makeRng, clamp, raycast } from '../core/collision.js';
import { addBigProps, addDetails, addInteriors } from './details.js';
import { generateCoverPoints, indexCover } from '../core/cover.js';
import { createProps as createPropsFor } from './props.js';
import { NavGrid } from '../core/nav.js';
import { pbrMaterial } from '../render/materials.js';
import { MAP_HALF } from '../config.js';

const STOREY = 3.4;

function bakeBoxGeometry(w, h, d, cx, cy, cz, rx, ry, rz, texW, texH) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(m);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z / texW; v = y / texH; }
    else if (ay >= az) { u = x / texW; v = z / texH; }
    else { u = x / texW; v = y / texH; }
    uv.setXY(i, u, v);
  }
  g.deleteAttribute('uv1');
  return g;
}

function bakeCylinderGeometry(rt, rb, h, seg, cx, cy, cz, rx, rz, texW, texH) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(m);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / texW, pos.getY(i) / texH);
  return g;
}

export class World {
  constructor(game) {
    this.game = game;
    this.gr = game.gr;
    this.scene = game.gr.scene;
    this.tex = game.textures;
    this.rng = makeRng(20261010);
    this.colliders = [];
    // 0.5 m cells so door openings (2 to 2.6 m wide) stay passable for bots after the agent margin
    this.nav = new NavGrid(MAP_HALF, 0.5, 0.4);
    this.spawnPoints = [];
    this.pickupPoints = [];
    this.fireSpots = [];
    this.batches = new Map();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.playerStart = { x: 0, z: 36, yaw: 0 };
    this._materials();
  }

  // ------------------------------------------------------------ materials
  _materials() {
    const T = this.tex;
    const P = (set, o) => pbrMaterial(set, o);
    const overlay = (m) => {
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      return m;
    };
    this.m = {
      concrete: P(T.concrete),
      concreteDark: P(T.concrete, { color: 0x8b8782 }),
      concreteWarm: P(T.concrete, { color: 0xd8c9b4 }),
      plaster: P(T.plaster),
      plasterWarm: P(T.plaster, { color: 0xe9d3a8 }),
      plasterGreen: P(T.plaster, { color: 0xa9bfa0 }),
      plasterBlue: P(T.plaster, { color: 0x9db0c4 }),
      brick: P(T.brick),
      brickDark: P(T.brick, { color: 0xa88f82 }),
      asphalt: overlay(P(T.asphalt)),
      sidewalk: overlay(P(T.concrete, { color: 0xbab4aa })),
      floor: overlay(P(T.concrete, { color: 0x9c978f })),
      dirt: P(T.dirt),
      wood: P(T.wood),
      woodDark: P(T.wood, { color: 0x7a6858 }),
      sandbag: P(T.sandbag),
      metalGray: P(T.metal, { color: 0x6c7075 }),
      metalGreen: P(T.metal, { color: 0x4a5c45 }),
      metalRed: P(T.metal, { color: 0x9a2a1e }),
      metalChar: P(T.metal, { color: 0x58514a }),
      metalYellow: P(T.metal, { color: 0xb59a2a }),
      containerRed: P(T.container, { color: 0x8c3328 }),
      containerBlue: P(T.container, { color: 0x2f4d73 }),
      containerGreen: P(T.container, { color: 0x4a6a4a }),
      containerRust: P(T.container, { color: 0x9a6a46 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
      window: new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.15, metalness: 0.2 }),
      paintWhite: overlay(new THREE.MeshStandardMaterial({ color: 0xcfcbbf, roughness: 0.75 })),
      paintYellow: overlay(new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.75 })),
      rebar: new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.7, metalness: 0.6 }),
      scorch: overlay(new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 })),
    };
    this.kindOf = new Map([
      [this.m.concrete, 'concrete'], [this.m.concreteDark, 'concrete'], [this.m.concreteWarm, 'concrete'],
      [this.m.plaster, 'plaster'], [this.m.plasterWarm, 'plaster'], [this.m.plasterGreen, 'plaster'], [this.m.plasterBlue, 'plaster'],
      [this.m.brick, 'brick'], [this.m.brickDark, 'brick'], [this.m.wood, 'wood'], [this.m.woodDark, 'wood'],
      [this.m.sandbag, 'sand'], [this.m.metalGray, 'metal'], [this.m.metalGreen, 'metal'], [this.m.metalRed, 'metal'],
      [this.m.metalChar, 'metal'], [this.m.metalYellow, 'metal'], [this.m.containerRed, 'metal'], [this.m.containerBlue, 'metal'],
      [this.m.containerGreen, 'metal'], [this.m.containerRust, 'metal'], [this.m.rubber, 'concrete'],
    ]);
  }

  // ------------------------------------------------------------- batching
  _addGeo(mat, geo) {
    let list = this.batches.get(mat);
    if (!list) { list = []; this.batches.set(mat, list); }
    list.push(geo);
  }

  /**
   * Merge the queued geometry into a few big meshes. One mesh per material AND per map
   * chunk: a single mesh per material spans the whole map and can never be culled, so the
   * main pass, the ambient occlusion pass and every shadow cascade would all draw the
   * entire level. With chunks each pass only draws what its frustum touches.
   */
  _flush() {
    const CHUNK = 30;
    this.chunks = 0;
    for (const [mat, list] of this.batches) {
      if (!list.length) continue;
      const buckets = new Map();
      for (const g of list) {
        g.computeBoundingBox();
        const b = g.boundingBox;
        const key = Math.floor((b.min.x + b.max.x) / 2 / CHUNK) * 1000 + Math.floor((b.min.z + b.max.z) / 2 / CHUNK);
        let arr = buckets.get(key);
        if (!arr) buckets.set(key, (arr = []));
        arr.push(g);
      }
      for (const arr of buckets.values()) {
        const geo = mergeGeometries(arr, false);
        arr.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(geo, mat);
        const overlay = mat.polygonOffset;
        mesh.castShadow = !overlay;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = true;
        this.root.add(mesh);
        this.chunks++;
      }
    }
    this.batches.clear();
  }

  /**
   * Add a box. Visual always, collider unless opts.collide === false.
   * Position is the box centre.
   */
  box(cx, cy, cz, w, h, d, mat, opts = {}) {
    if (this.items && !opts.structural && h > 0.04 && Math.max(w, h, d) <= 2.4) this.items.push(cx, cy, cz);
    const tw = mat.userData.texWorld || [1, 1];
    const g = bakeBoxGeometry(w, h, d, cx, cy, cz, opts.rx || 0, opts.ry || 0, opts.rz || 0, tw[0], tw[1]);
    this._addGeo(mat, g);
    if (opts.collide === false) return null;
    const c = makeBox(cx, cy, cz, w, h, d, { kind: opts.kind || this.kindOf.get(mat) || 'concrete' });
    if (opts.blocksBullets === false) c.blocksBullets = false;
    if (opts.navIgnore) c.navIgnore = true;
    this.addCollider(c);
    return c;
  }

  cylinder(cx, cy, cz, r, h, mat, seg = 14) {
    if (this.items) this.items.push(cx, cy, cz);
    const tw = mat.userData.texWorld || [1, 1];
    this._addGeo(mat, bakeCylinderGeometry(r, r, h, seg, cx, cy, cz, 0, 0, tw[0], tw[1]));
  }

  addCollider(c) {
    this.colliders.push(c);
    this.nav.addBox(c);
  }

  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    this.nav.removeBox(c);
  }

  // ------------------------------------------------------------- walls
  /**
   * Wall along an axis. axis 'x' runs along x at z=fixed, 'z' runs along z at x=fixed.
   * openings: [{from,to,bottom,top}] in world units along the axis.
   */
  wall(axis, fixed, a0, a1, thick, H, openings, mat, opts = {}) {
    const breakage = opts.breakage || 0;
    const rng = this.rng;
    const pts = new Set([a0, a1]);
    for (const o of openings) { pts.add(clamp(o.from, a0, a1)); pts.add(clamp(o.to, a0, a1)); }
    const sorted = [...pts].sort((p, q) => p - q);
    const spans = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const s = sorted[i], e = sorted[i + 1];
      if (e - s < 0.04) continue;
      const n = Math.max(1, Math.ceil((e - s) / 2.6));
      for (let k = 0; k < n; k++) spans.push([s + ((e - s) * k) / n, s + ((e - s) * (k + 1)) / n]);
    }
    const add = (s, e, y0, y1) => {
      if (y1 - y0 < 0.03) return;
      const mid = (s + e) / 2, len = e - s, cy = (y0 + y1) / 2, hh = y1 - y0;
      if (axis === 'x') this.box(mid, cy, fixed, len, hh, thick, mat, { structural: true });
      else this.box(fixed, cy, mid, thick, hh, len, mat, { structural: true });
    };
    for (const [s, e] of spans) {
      const mid = (s + e) / 2;
      const cover = openings.filter((o) => o.from <= mid && o.to >= mid).sort((p, q) => p.bottom - q.bottom);
      let topH = H;
      if (breakage > 0) {
        topH = H * (1 - breakage * rng() * 0.75);
        if (rng() < 0.16 * breakage) topH = Math.max(0.9, H * (0.18 + rng() * 0.2));
      }
      let cursor = 0;
      for (const o of cover) {
        if (o.bottom > cursor + 0.02) add(s, e, cursor, Math.min(o.bottom, topH));
        cursor = Math.max(cursor, o.top);
        if (cursor >= topH) break;
      }
      if (topH > cursor + 0.02) add(s, e, cursor, topH);
    }
  }

  // ----------------------------------------------------------- buildings
  /**
   * A shot-up building. doors: [{side:'n'|'s'|'e'|'w', at, width}] where `at` is the
   * world coordinate along that wall. breaches: [{side, from, to}] full height holes.
   */
  building(o) {
    const rng = this.rng;
    const { cx, cz, w, d } = o;
    const storeys = o.storeys || 2;
    const H = storeys * STOREY;
    const t = o.thick || 0.45;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const mat = o.mat || this.m.brick;
    const breakage = o.breakage ?? 0.5;

    const sideOpenings = (side, a, b) => {
      const list = [];
      const doors = (o.doors || []).filter((q) => q.side === side);
      const breaches = (o.breaches || []).filter((q) => q.side === side);
      for (const dr of doors) list.push({ from: dr.at - dr.width / 2, to: dr.at + dr.width / 2, bottom: 0, top: dr.height || 2.5 });
      for (const br of breaches) list.push({ from: br.from, to: br.to, bottom: 0, top: H + 1 });
      const spacing = o.windowEvery || 3.7;
      const wlen = b - a;
      const count = Math.max(1, Math.floor((wlen - 2.4) / spacing));
      const pad = (wlen - (count - 1) * spacing) / 2;
      for (let i = 0; i < count; i++) {
        const c = a + pad + i * spacing;
        for (let s = 0; s < storeys; s++) {
          const bottom = s * STOREY + 0.95, top = s * STOREY + 2.45;
          const wf = c - 0.7, wt = c + 0.7;
          const clash = list.some((q) => q.from < wt + 0.3 && q.to > wf - 0.3 && q.bottom < top && q.top > bottom);
          if (clash) continue;
          if (rng() < (o.windowSkip ?? 0.12)) continue;
          list.push({ from: wf, to: wt, bottom, top });
          this.windows.push({ side, c, bottom, top, storey: s, x0, x1, z0, z1, storeys });
        }
      }
      return list;
    };

    // West and east walls span the full depth, north and south fit between them.
    this.wall('z', x0 + t / 2, z0, z1, t, H, sideOpenings('w', z0, z1), mat, { breakage });
    this.wall('z', x1 - t / 2, z0, z1, t, H, sideOpenings('e', z0, z1), mat, { breakage });
    this.wall('x', z0 + t / 2, x0 + t, x1 - t, t, H, sideOpenings('n', x0 + t, x1 - t), mat, { breakage });
    this.wall('x', z1 - t / 2, x0 + t, x1 - t, t, H, sideOpenings('s', x0 + t, x1 - t), mat, { breakage });

    // Ground floor slab (visual only) and broken upper floors.
    this.box(cx, 0.015, cz, w - 2 * t, 0.03, d - 2 * t, this.m.floor, { collide: false });
    for (let s = 1; s <= storeys; s++) {
      const y = s * STOREY;
      const present = s === storeys ? (o.roof === 'none' ? 0 : 0.35) : 0.7;
      for (let ix = x0 + t; ix < x1 - t - 0.1; ix += 2) {
        for (let iz = z0 + t; iz < z1 - t - 0.1; iz += 2) {
          if (rng() > present) continue;
          const sx = Math.min(2, x1 - t - ix), sz = Math.min(2, z1 - t - iz);
          this.box(ix + sx / 2, y - 0.15, iz + sz / 2, sx, 0.3, sz, this.m.concrete, { structural: true });
        }
      }
    }

    // Interior partitions with doorways. A partition never lands on an exterior door or
    // breach (it would seal the building), and its own doorway is wide enough for bots.
    const ext = [
      ...(o.doors || []).map((dr) => ({ side: dr.side, from: dr.at - dr.width / 2, to: dr.at + dr.width / 2 })),
      ...(o.breaches || []),
    ];
    const clearOfOpenings = (pos, sides) => !ext.some((q) => sides.includes(q.side) && pos > q.from - 1.4 && pos < q.to + 1.4);
    const parts = o.partitions ?? (w > 14 ? 2 : 1);
    const placed = [];
    for (let i = 0; i < parts; i++) {
      const alongX = w > d ? false : true; // partitions cut the longer side
      for (let attempt = 0; attempt < 10; attempt++) {
        if (!alongX) {
          const xx = clamp(x0 + t + (w - 2 * t) * (0.3 + 0.4 * rng()) + (i ? 4 : 0) * (rng() - 0.5), x0 + 3, x1 - 3);
          const dc = z0 + t + (d - 2 * t) * (0.25 + 0.5 * rng());
          if (!clearOfOpenings(xx, ['n', 's']) || placed.some((q) => Math.abs(q - xx) < 3)) continue;
          this.wall('z', xx, z0 + t, z1 - t, 0.25, STOREY, [{ from: dc - 1.0, to: dc + 1.0, bottom: 0, top: 2.4 }], this.m.plaster, { breakage: 0.35 });
          placed.push(xx);
        } else {
          const zz = clamp(z0 + t + (d - 2 * t) * (0.3 + 0.4 * rng()) + (i ? 3 : 0) * (rng() - 0.5), z0 + 3, z1 - 3);
          const dc = x0 + t + (w - 2 * t) * (0.25 + 0.5 * rng());
          if (!clearOfOpenings(zz, ['w', 'e']) || placed.some((q) => Math.abs(q - zz) < 3)) continue;
          this.wall('x', zz, x0 + t, x1 - t, 0.25, STOREY, [{ from: dc - 1.0, to: dc + 1.0, bottom: 0, top: 2.4 }], this.m.plaster, { breakage: 0.35 });
          placed.push(zz);
        }
        break;
      }
    }

    // Rubble where the walls broke.
    for (const br of o.breaches || []) {
      const mid = (br.from + br.to) / 2;
      if (br.side === 'n') this.rubble(mid, z0 - 0.4, (br.to - br.from) * 0.5, 1.1);
      if (br.side === 's') this.rubble(mid, z1 + 0.4, (br.to - br.from) * 0.5, 1.1);
      if (br.side === 'w') this.rubble(x0 - 0.4, mid, (br.to - br.from) * 0.5, 1.1);
      if (br.side === 'e') this.rubble(x1 + 0.4, mid, (br.to - br.from) * 0.5, 1.1);
    }

    for (const dr of o.doors || []) this.doorList.push({ side: dr.side, at: dr.at, width: dr.width, x0, x1, z0, z1, storeys });
    if (this.openings) {
      for (const dr of o.doors || []) this.openings.push({ side: dr.side, from: dr.at - dr.width / 2, to: dr.at + dr.width / 2, x0, x1, z0, z1 });
      for (const br of o.breaches || []) this.openings.push({ side: br.side, from: br.from, to: br.to, x0, x1, z0, z1 });
    }
    this.footprints.push({ x0, x1, z0, z1 });
    return { x0, x1, z0, z1 };
  }

  // -------------------------------------------------------------- rubble
  /** A stepped mound of debris that can be climbed. */
  rubble(cx, cz, r, h = 1.1) {
    const rng = this.rng;
    if (this.rubbleSpots) this.rubbleSpots.push({ x: cx, z: cz, r });
    const m = rng() < 0.5 ? this.m.concrete : this.m.concreteDark;
    // stepped colliders
    const levels = h > 0.8 ? 3 : 2;
    for (let i = 0; i < levels; i++) {
      const k = 1 - i / levels;
      const rw = r * (0.55 + 0.45 * k) * (0.9 + rng() * 0.2), rd = r * (0.45 + 0.4 * k) * (0.9 + rng() * 0.2);
      const hh = (h * (i + 1)) / levels;
      this.box(cx + (rng() - 0.5) * 0.3 * r, hh / 2, cz + (rng() - 0.5) * 0.3 * r, rw * 2, hh, rd * 2, m, { kind: 'concrete', blocksBullets: true });
    }
    // loose chunks, visual only
    const n = Math.round(10 + r * 5);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * r * 1.15;
      const s = 0.15 + rng() * 0.5;
      this.box(cx + Math.cos(a) * rad, s * 0.35 + rng() * h * (1 - rad / (r * 1.2)) * 0.8, cz + Math.sin(a) * rad * 0.8,
        s * (0.7 + rng()), s * (0.5 + rng() * 0.7), s * (0.7 + rng()), rng() < 0.7 ? m : this.m.brickDark,
        { collide: false, rx: rng() * 3, ry: rng() * 3, rz: rng() * 3 });
    }
    // rebar
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, rad = rng() * r * 0.6;
      this.box(cx + Math.cos(a) * rad, h + 0.2, cz + Math.sin(a) * rad, 0.03, 0.9 + rng() * 0.8, 0.03, this.m.rebar,
        { collide: false, rx: rng() * 0.6 - 0.3, rz: rng() * 0.6 - 0.3 });
    }
  }

  debris(count, x0, x1, z0, z1) {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const x = x0 + (x1 - x0) * rng(), z = z0 + (z1 - z0) * rng();
      const s = 0.06 + rng() * 0.22;
      this.box(x, s * 0.3, z, s * (1 + rng()), s * 0.6, s * (1 + rng()), rng() < 0.6 ? this.m.concreteDark : this.m.brickDark,
        { collide: false, ry: rng() * 3, rx: rng() * 0.5, rz: rng() * 0.5 });
    }
  }

  // --------------------------------------------------------------- props
  jersey(cx, cz, yaw = 0) {
    const horiz = Math.abs(Math.sin(yaw)) < 0.5;
    const w = horiz ? 3 : 0.7, d = horiz ? 0.7 : 3;
    this.box(cx, 0.4, cz, w, 0.8, d, this.m.concrete, { kind: 'concrete' });
    // wedge look: a narrower top block
    this.box(cx, 0.88, cz, horiz ? w - 0.1 : 0.35, 0.16, horiz ? 0.35 : d - 0.1, this.m.concrete, { collide: false });
  }

  sandbags(cx, cz, len = 3, alongX = true) {
    const w = alongX ? len : 0.7, d = alongX ? 0.7 : len;
    this.box(cx, 0.5, cz, w, 1.0, d, this.m.sandbag, { kind: 'sand' });
  }

  car(cx, cz, yaw = 0, paint = this.m.metalChar) {
    const alongX = Math.abs(Math.sin(yaw)) < 0.5;
    const L = 4.3, Wd = 1.8;
    const w = alongX ? L : Wd, d = alongX ? Wd : L;
    // collider covers body and cabin
    const c = this.box(cx, 0.45, cz, w, 0.9, d, paint, { kind: 'metal' });
    // cabin
    const cabW = alongX ? 2.1 : 1.6, cabD = alongX ? 1.6 : 2.1;
    this.box(cx + (alongX ? -0.2 : 0), 1.1, cz + (alongX ? 0 : -0.2), cabW, 0.55, cabD, paint, { collide: false });
    this.box(cx + (alongX ? -0.2 : 0), 1.1, cz + (alongX ? 0 : -0.2), cabW + 0.02, 0.4, cabD + 0.02, this.m.window, { collide: false });
    // wheels
    for (const sx of [-1.4, 1.4]) {
      for (const sz of [-0.9, 0.9]) {
        const wx = cx + (alongX ? sx : sz), wz = cz + (alongX ? sz : sx);
        const g = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
        g.rotateX(Math.PI / 2);
        if (!alongX) g.rotateY(Math.PI / 2);
        g.translate(wx, 0.3, wz);
        this._addGeo(this.m.rubber, this._uvFix(g));
      }
    }
    this.fireSpots.push({ x: cx, z: cz });
    return c;
  }

  _uvFix(g) {
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + pos.getZ(i), pos.getY(i));
    return g;
  }

  container(cx, cz, alongX, mat, y = 0) {
    const L = 6.0, Wd = 2.4, Ht = 2.6;
    const w = alongX ? L : Wd, d = alongX ? Wd : L;
    return this.box(cx, y + Ht / 2, cz, w, Ht, d, mat, { kind: 'metal' });
  }

  dumpster(cx, cz, alongX = true) {
    const w = alongX ? 1.9 : 1.1, d = alongX ? 1.1 : 1.9;
    this.box(cx, 0.6, cz, w, 1.2, d, this.m.metalGreen, { kind: 'metal' });
    this.box(cx, 1.25, cz, w + 0.05, 0.08, d + 0.05, this.m.metalGreen, { collide: false, rz: 0.08 });
  }

  lamp(cx, cz, fallen = false, rot = 0) {
    this.lampList.push({ x: cx, z: cz, fallen });
    if (fallen) {
      this.box(cx, 0.08, cz, 5.5, 0.16, 0.16, this.m.metalGray, { collide: false, ry: rot });
      this.box(cx + Math.cos(rot) * -2.6, 0.18, cz + Math.sin(rot) * 2.6, 0.9, 0.12, 0.3, this.m.metalGray, { collide: false, ry: rot });
    } else {
      this.box(cx, 2.8, cz, 0.16, 5.6, 0.16, this.m.metalGray, { kind: 'metal', blocksBullets: false });
      this.box(cx + 0.6, 5.5, cz, 1.4, 0.1, 0.1, this.m.metalGray, { collide: false });
    }
  }

  // ------------------------------------------------------- facade windows
  _dummyWindows(axis, fixed, a0, a1, y0, rows, face) {
    // dark quads with a sill, drawn on the inner face of the perimeter wall
    for (let a = a0 + 2.2; a < a1 - 1.5; a += 4.2) {
      for (let r = 0; r < rows; r++) {
        if (this.rng() < 0.18) continue;
        const y = y0 + r * STOREY + 1.7;
        if (axis === 'x') {
          this.box(a, y, fixed + face * 0.03, 1.4, 1.5, 0.08, this.m.window, { collide: false });
          this.box(a, y - 0.8, fixed + face * 0.1, 1.7, 0.1, 0.22, this.m.concrete, { collide: false });
        } else {
          this.box(fixed + face * 0.03, y, a, 0.08, 1.5, 1.4, this.m.window, { collide: false });
          this.box(fixed + face * 0.1, y - 0.8, a, 0.22, 0.1, 1.7, this.m.concrete, { collide: false });
        }
      }
    }
  }

  perimeter() {
    const rng = this.rng;
    const E = MAP_HALF, thick = 8;
    const mats = [this.m.brick, this.m.plaster, this.m.brickDark, this.m.plasterWarm, this.m.concrete];
    const side = (axis, sign) => {
      // axis 'x': wall runs along x at z = sign*(E+thick/2)
      const fixed = sign * (E + thick / 2);
      for (let a = -E - thick; a < E + thick; a += 7) {
        const len = Math.min(7, E + thick - a) + 0.02;
        const h = 8 + rng() * 9;
        const mat = mats[Math.floor(rng() * mats.length)];
        const mid = a + len / 2;
        if (axis === 'x') this.box(mid, h / 2, fixed, len, h, thick, mat);
        else this.box(fixed, h / 2, mid, thick, h, len, mat);
      }
      // inner face windows
      const inner = sign * E;
      this._dummyWindows(axis, inner, -E + 1, E - 1, 0, 3, -sign);
    };
    side('x', 1); side('x', -1); side('z', 1); side('z', -1);
  }

  skyline() {
    const rng = this.rng;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    const e = document.createElement('canvas');
    e.width = 128; e.height = 256;
    const ge = e.getContext('2d');
    g.fillStyle = '#36342f'; g.fillRect(0, 0, 128, 256);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 248; y += 16) {
      for (let x = 8; x < 120; x += 16) {
        g.fillStyle = '#16181b'; g.fillRect(x, y, 9, 11);
        if (rng() < 0.12) { ge.fillStyle = rng() < 0.5 ? '#ffb55a' : '#ffd9a0'; ge.fillRect(x, y, 9, 11); }
      }
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const em = new THREE.CanvasTexture(e);
    em.colorSpace = THREE.SRGBColorSpace; em.wrapS = em.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 });
    const geos = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rng() * 0.1;
      const dist = 105 + rng() * 120;
      const w = 12 + rng() * 22, d = 12 + rng() * 22, h = 28 + rng() * 80;
      const g2 = new THREE.BoxGeometry(w, h, d);
      const uv = g2.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 14), uv.getY(k) * (h / 16));
      g2.translate(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
      geos.push(g2);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = false; mesh.receiveShadow = false;
    this.root.add(mesh);
    this.skylineMesh = mesh;
  }

  // ------------------------------------------------------------- ground
  ground() {
    const m = this.m;
    // base dirt, huge
    const base = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), m.dirt);
    base.rotation.x = -Math.PI / 2;
    base.receiveShadow = true;
    // world-space UVs for the plane
    const pos = base.geometry.attributes.position, uv = base.geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, -pos.getY(i) / 3);
    this.root.add(base);

    const E = MAP_HALF;
    // streets
    this.box(0, 0.011, 0, E * 2 + 20, 0.022, 12, m.asphalt, { collide: false });
    this.box(0, 0.012, 0, 12, 0.024, E * 2 + 20, m.asphalt, { collide: false });
    // sidewalks: a 2.5 m strip along each street edge of every quadrant
    const len = E + 5 - 6;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const mid = 6 + len / 2;
      this.box(sx * mid, 0.025, sz * 7.25, len, 0.05, 2.5, m.sidewalk, { collide: false });
      this.box(sx * 7.25, 0.025, sz * mid, 2.5, 0.05, len, m.sidewalk, { collide: false });
    }
    // markings
    for (let x = -E + 2; x < E; x += 5) {
      if (Math.abs(x) < 8) continue;
      this.box(x, 0.026, 0, 2.4, 0.01, 0.14, m.paintWhite, { collide: false });
    }
    for (let z = -E + 2; z < E; z += 5) {
      if (Math.abs(z) < 8) continue;
      this.box(0, 0.027, z, 0.14, 0.01, 2.4, m.paintWhite, { collide: false });
    }
    // crosswalks
    for (let i = -5; i <= 5; i++) {
      const o = i * 1.0;
      for (const s of [-1, 1]) {
        this.box(o, 0.028, s * 7.1, 0.5, 0.01, 1.6, m.paintWhite, { collide: false });
        this.box(s * 7.1, 0.028, o, 1.6, 0.01, 0.5, m.paintWhite, { collide: false });
      }
    }
    // yellow double line along the main street edges near the intersection
    this.box(-25, 0.029, 0.35, 38, 0.01, 0.1, m.paintYellow, { collide: false });
    this.box(25, 0.029, 0.35, 38, 0.01, 0.1, m.paintYellow, { collide: false });
    this.box(-25, 0.029, -0.35, 38, 0.01, 0.1, m.paintYellow, { collide: false });
    this.box(25, 0.029, -0.35, 38, 0.01, 0.1, m.paintYellow, { collide: false });
  }

  crater(cx, cz, r) {
    const g = new THREE.CircleGeometry(r, 28);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0.036, cz);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
    this._addGeo(this.m.scorch, g);
    // ring of chunks
    const rng = this.rng;
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2, rad = r * (0.85 + rng() * 0.5), s = 0.2 + rng() * 0.45;
      this.box(cx + Math.cos(a) * rad, s * 0.3, cz + Math.sin(a) * rad, s * 1.3, s * 0.7, s * 1.1, this.m.concreteDark,
        { collide: false, ry: rng() * 3, rz: rng() * 0.5 });
    }
  }

  // ------------------------------------------------------------- helpers
  /** True if the footprint is free of solid colliders and inside the map. */
  fits(cx, cz, w, d, pad = 0.25) {
    const lim = MAP_HALF - 1;
    if (Math.abs(cx) + w / 2 > lim || Math.abs(cz) + d / 2 > lim) return false;
    const x0 = cx - w / 2 - pad, x1 = cx + w / 2 + pad, z0 = cz - d / 2 - pad, z1 = cz + d / 2 + pad;
    for (const c of this.colliders) {
      if (c.maxY < 0.12) continue;
      if (c.maxX > x0 && c.minX < x1 && c.maxZ > z0 && c.minZ < z1) return false;
    }
    return true;
  }

  /**
   * Find a wall surface by shooting a horizontal ray from (x,y,z) + n*dist toward
   * the wall. Returns {x,y,z,nx,nz} on the wall face or null.
   */
  mountOnWall(x, y, z, nx, nz, dist = 4) {
    const h = raycast(this.colliders, x + nx * dist, y, z + nz * dist, -nx, 0, -nz, dist + 3, { noGround: true });
    if (!h || !h.box || (h.nx === 0 && h.nz === 0)) return null;
    if (Math.abs(h.ny) > 0.5) return null;
    return { x: h.x, y, z: h.z, nx: h.nx, nz: h.nz };
  }

  /** A thin beam between two points, used for cables and rods. */
  segment(mat, ax, ay, az, bx, by, bz, th = 0.03) {
    if (this.items) this.items.push((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 0.01) return;
    const g = new THREE.BoxGeometry(th, th, len);
    const dummy = new THREE.Object3D();
    dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    dummy.lookAt(bx, by, bz);
    dummy.updateMatrix();
    g.applyMatrix4(dummy.matrix);
    this._addGeo(mat, g);
  }

  /** A flat quad (uv 0..1) whose normal points along (sin yaw, cos yaw), tilted by pitch. */
  quad(mat, cx, cy, cz, w, h, yaw, pitch = 0, roll = 0) {
    if (this.items) this.items.push(cx, cy, cz);
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, cy, cz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    this._addGeo(mat, g);
  }

  // names of the level contract
  get coverPoints() { return this.cover; }
  get pickupSpots() { return this.pickupPoints; }
  get group() { return this.root; }

  // -------------------------------------------------------------- build
  build() {
    const m = this.m;
    this.footprints = [];
    this.windows = [];
    this.lampList = [];
    this.doorList = [];
    this.openings = []; // doors and breaches, so furniture never blocks them
    this.rubbleSpots = [];
    this.items = [];
    const rng = this.rng;
    this.ground();
    this.perimeter();

    // ---------- buildings
    this.building({ cx: -27, cz: -28, w: 22, d: 16, storeys: 3, mat: m.brick, breakage: 0.6,
      doors: [{ side: 's', at: -30, width: 2.4 }, { side: 'e', at: -26, width: 2.2 }, { side: 'w', at: -30, width: 2.2 }],
      breaches: [{ side: 'n', from: -29, to: -24 }, { side: 's', from: -21.5, to: -19 }] });
    this.building({ cx: 28, cz: -27, w: 18, d: 14, storeys: 3, mat: m.plasterWarm, breakage: 0.55,
      doors: [{ side: 's', at: 24, width: 2.4 }, { side: 'w', at: -26, width: 2.2 }, { side: 'e', at: -29, width: 2.2 }],
      breaches: [{ side: 'n', from: 25, to: 30 }, { side: 'w', from: -31, to: -29.5 }] });
    this.building({ cx: 35, cz: -14, w: 10, d: 8, storeys: 1, mat: m.brickDark, breakage: 0.4, windowEvery: 3.1, windowSkip: 0.05, partitions: 0,
      doors: [{ side: 's', at: 35, width: 2.4 }, { side: 'w', at: -14, width: 2 }],
      breaches: [{ side: 'e', from: -16, to: -13 }] });
    this.building({ cx: -30, cz: 26, w: 18, d: 10, storeys: 2, mat: m.concrete, breakage: 0.7,
      doors: [{ side: 'n', at: -33, width: 2.6 }, { side: 'e', at: 25, width: 2.2 }],
      breaches: [{ side: 's', from: -34, to: -28 }, { side: 'n', from: -26, to: -23.5 }] });
    this.building({ cx: -38, cz: 16, w: 8, d: 10, storeys: 2, mat: m.plasterBlue, breakage: 0.7, partitions: 1,
      doors: [{ side: 'e', at: 16, width: 2.4 }, { side: 'n', at: -39, width: 2.2 }],
      breaches: [{ side: 'w', from: 13, to: 17 }] });
    this.building({ cx: -15, cz: 20, w: 8, d: 8, storeys: 1, mat: m.plasterGreen, breakage: 0.45, partitions: 0, windowEvery: 3,
      doors: [{ side: 'w', at: 20, width: 2.2 }, { side: 'e', at: 20, width: 2.2 }, { side: 'n', at: -15, width: 2 }],
      breaches: [] });
    this.building({ cx: 29, cz: 28, w: 20, d: 14, storeys: 2, mat: m.plaster, breakage: 0.5, partitions: 2, windowEvery: 4.2,
      doors: [{ side: 'n', at: 24, width: 3.6 }, { side: 'w', at: 28, width: 3.6 }, { side: 'n', at: 33, width: 2.2 }],
      breaches: [{ side: 'e', from: 25, to: 31 }, { side: 's', from: 26, to: 29 }] });
    this.building({ cx: 14, cz: 16, w: 8, d: 7, storeys: 1, mat: m.brick, breakage: 0.4, partitions: 0, windowEvery: 3,
      doors: [{ side: 'n', at: 14, width: 2.2 }, { side: 'w', at: 16, width: 2 }],
      breaches: [{ side: 's', from: 12, to: 14.5 }] });
    this.building({ cx: -14, cz: -16, w: 8, d: 8, storeys: 2, mat: m.concrete, breakage: 0.65, partitions: 1, windowEvery: 3,
      doors: [{ side: 's', at: -14, width: 2.4 }, { side: 'e', at: -16, width: 2 }],
      breaches: [{ side: 'w', from: -19, to: -16 }] });
    this.building({ cx: 14, cz: -17, w: 7, d: 7, storeys: 1, mat: m.plasterWarm, breakage: 0.5, partitions: 0, windowEvery: 3,
      doors: [{ side: 's', at: 14, width: 2.2 }, { side: 'w', at: -17, width: 2 }],
      breaches: [{ side: 'n', from: 12, to: 15 }] });

    // ---------- the intersection: a defensive position
    this.jersey(-3.5, 3.2, 0);
    this.jersey(3.5, 3.2, 0);
    this.jersey(0, -3.5, 0);
    this.jersey(-3.5, -3.5, Math.PI / 2);
    this.sandbags(0, 7.4, 3.4, true);
    this.sandbags(-4.5, 8.4, 2.6, false);
    this.sandbags(4.5, 8.4, 2.6, false);
    this.sandbags(-12, -2.6, 3, true);
    this.sandbags(12, 2.6, 3, true);
    this.car(-9, 3.4, 0, m.metalChar);
    this.car(9.5, -3.2, 0, m.metalGray);
    this.car(2.6, 12.5, Math.PI / 2, m.metalChar);
    this.car(-3.2, -12, Math.PI / 2, m.metalRed);
    this.car(0, 24, Math.PI / 2, m.metalChar);
    this.car(-20, -4, 0, m.metalGray);
    this.car(20, 4.2, 0, m.metalChar);
    this.car(3.4, -30, Math.PI / 2, m.metalYellow);
    this.crater(-2, 0, 3.2);
    this.crater(15, -2, 2.4);
    this.crater(-1.5, 21, 2.0);
    this.crater(-22, 3.5, 2.2);

    // ---------- container yard (south east) with a sniper perch
    this.container(40.2, 14, false, m.containerRed);
    this.container(40.2, 20.6, false, m.containerBlue);
    this.container(40.2, 5, false, m.containerRust);
    // two concrete steps lead up to the roof of the red container
    this.box(37, 0.45, 14.4, 1.4, 0.9, 1.4, m.concrete);
    this.box(37, 0.9, 16, 1.4, 1.8, 1.4, m.concreteDark);
    this.container(24, 41, true, m.containerGreen);
    this.container(31, 41, true, m.containerRed);
    this.container(17, 41, true, m.containerBlue);

    // ---------- other cover and platforms
    this.dumpster(-8.5, 12, true);
    this.dumpster(8.5, -11, false);
    this.dumpster(-36, -9.5, true);
    this.rubble(-9, 30, 2.8, 1.2);
    this.rubble(10, 33, 3.2, 1.3);
    this.rubble(-33, -8, 2.5, 1.0);
    this.rubble(22, -8.5, 2.8, 1.2);
    this.rubble(-8, -26, 3, 1.3);
    this.rubble(-42, 36, 3.5, 1.3);
    this.rubble(40, -38, 3.4, 1.3);
    this.rubble(-20, -42, 2.6, 1.1);
    this.rubble(4.5, 38, 2.2, 1.0);
    // low walls the player can hop over
    this.box(-20, 0.5, 12, 5, 1.0, 0.4, m.brick);
    this.box(-17.7, 0.5, 14.2, 0.4, 1.0, 4.4, m.brick);
    this.box(18, 0.5, -10.5, 4, 1.0, 0.4, m.brickDark);
    this.box(11, 0.5, 30, 6, 1.0, 0.4, m.concrete);
    this.box(-9, 0.5, 38.5, 0.4, 1.0, 5, m.plaster);
    this.box(33, 0.5, 2.4, 0.4, 1.0, 3.6, m.concrete);

    // ---------- lamps
    for (const [x, z, fall, rot] of [[-14, 6.8, false], [14, -6.8, false], [-28, -6.8, false], [30, 6.8, true, 0.4], [6.8, -22, false], [-6.8, 30, true, 1.2], [6.8, 18, false], [-6.8, -34, false]]) {
      this.lamp(x, z, fall, rot);
    }

    // scattered debris
    this.debris(120, -E(), E(), -E(), E());

    // ---------- props, wall details, thousands of small objects, skyline
    addBigProps(this);
    addInteriors(this);
    addDetails(this);
    this.skyline();
    this._flush();

    this._places();
    this._spawns();
    return this;
  }

  /** Dynamic props: crates, barrels, fires, pickups. Called after build(). */
  _places() {
    const props = this.game.props;
    // crates around cover and inside buildings
    const crates = [
      [-5, 5.5], [-5, 6.6], [5.2, -6], [-10.5, 8.3], [2, 15.5], [-2, 17], [8, 21], [19.8, 8], [24, 12], [14, -7], [-14, -9],
      [-22, 8], [-26, 12], [-33.5, 22], [-29, 26.5], [-23, 29], [-16, 20.5], [-39, 14], [-37, 18.5], [26.5, 24], [32, 30.5],
      [35, 25], [22, 32.5], [-26, -26], [-32, -31], [-19, -33], [-14.5, -16.5], [-12, -13.5], [22, -28], [31, -24], [34, -30],
      [34.5, -14.2], [14, -17.5], [12.5, -19], [-36, -22], [-10, -40], [12, -38], [-24, 40], [42, -2],
    ];
    for (const [x, z] of crates) {
      const s = 0.85 + this.rng() * 0.3;
      if (!props.canPlace(x, z, s * 0.7)) continue;
      props.addCrate(x, z, s);
      if (this.rng() < 0.28 && props.canPlace(x + 1.1, z, 0.5)) props.addCrate(x + 1.05, z + 0.2, 0.7);
    }
    // explosive barrels in clusters, grey drums for cover
    const barrels = [
      [-6.5, 9.5, true], [7, 10, true], [-24, 22, true], [-28, -24, true], [-12, -19, true], [30, -26, true], [27, 25, true],
      [36, 26.5, true], [-4, -9, true], [6, -14, true], [-35, 14, true], [18, 6, true], [-17, 6, true], [22, -13, true],
      [-6, 34, true], [2, -38, true], [-40, -30, true], [41, 37, true],
    ];
    for (const [x, z, expl] of barrels) {
      if (!props.canPlace(x, z, 0.4)) continue;
      props.addBarrel(x, z, expl);
      if (this.rng() < 0.4 && props.canPlace(x + 0.8, z + 0.3, 0.4)) props.addBarrel(x + 0.75, z + 0.35, true);
    }
    // fires for atmosphere
    const fires = [[-9, 3.4, 1.2, 0.8], [-3.2, -12, 1.2, 0.8], [27, 25, 1.0, 0.9], [-26, -24, 1.0, 0.9], [20, 4.2, 1.1, 0.9]];
    fires.forEach(([x, z, y, s], i) => {
      this.game.fx.fire(x, y, z, s, -1, i < 2);
    });

    // fixed supply points: ammo comes back after 25 s, medkits after 35 s
    this.pickupPoints = [
      [0, 18], [-8, 6], [8, -7], [-22, 4], [22, 4], [0, -22], [-30, -12], [30, -6], [-12, 30], [20, 20],
    ].map(([x, z]) => ({ x, z }));
    this.pickupPoints = this.pickupPoints.map((pt) => this.nav.nearestFree(pt.x, pt.z, 12) || pt);
    this.pickupPoints.forEach((pt, i) => {
      const type = i % 5 < 3 ? 'ammo' : 'health';
      props.spawnPickup(type, pt.x, pt.z, 0, 0, type === 'ammo' ? 25 : 35);
    });
    if (this.reach) this.rebuildCover();
  }

  _spawns() {
    // candidate enemy spawn points spread across the map, validated against the nav grid
    const cand = [
      [-30, -34], [-24, -24], [-33, -14], [-12, -30], [-44, -2], [-40, 28], [-24, 36], [-12, 12], [-28, 34],
      [12, -30], [24, -36], [38, -26], [40, -8], [20, -14], [8, -36], [0, -42],
      [40, 30], [30, 38], [18, 30], [12, 22], [42, 14], [-12, 40], [-4, 26], [34, 4],
    ];
    // only keep points the player can actually reach on foot
    const reach = this.nav.reachableFrom(this.playerStart.x, this.playerStart.z);
    for (const [x, z] of cand) {
      const p = this.nav.nearestFree(x, z, 8);
      if (!p) continue;
      if (!reach[this.nav.idx(this.nav.toCell(p.x), this.nav.toCell(p.z))]) continue;
      this.spawnPoints.push(p);
    }
    this.reach = reach;
    this.rebuildCover();
  }

  /** Cover points for the bot AI, regenerated whenever props change. */
  rebuildCover() {
    this.cover = generateCoverPoints(this.colliders, this.nav, this.reach || null);
    this.coverIndex = indexCover(this.cover, MAP_HALF);
  }

  update(dt, time) {}
}

function E() { return MAP_HALF - 1.5; }

/**
 * Build the whole level: colliders, spawn points, cover points, player start,
 * pickup spots and the group with all static geometry. `game` supplies the
 * renderer, the texture pack, effects and props that the level places.
 * Returns the level: {colliders, spawnPoints, coverPoints, playerStart, pickupSpots, group, ...}.
 */
export function buildLevel(scene, game) {
  const level = new World(game);
  game.world = level;                                  // props place themselves through the level
  if (!game.props) game.props = createPropsFor(game);
  level.build();
  return level;
}
