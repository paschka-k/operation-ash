// Models of the big props: barrels, crates, cardboard boxes, ammo boxes,
// concrete barriers. (The scan of a covered car is no longer loaded: since wave 15
// cars and their tarpaulins are built by code in src/world/fleet.js.)
//
//   loadModelPack()        -> Promise<{loaded, missing, source}>
//   getModel(id)           -> THREE.Object3D, a fresh clone
//   getModelGeometry(id)   -> {geometry, material, size} for instancing
//   getScanParts(id)       -> [{geometry, material}] of a scanned model, or null
//   MODEL_IDS, modelPackState()
//
// If a glTF file <id>.glb exists in assets/models/ (or is embedded in
// window.__ASSETS in the single-file build) that model is used, scaled to the
// size the game expects. Otherwise the prop is built from primitives with the
// PBR materials, so a missing file never breaks the game.
//
// A scan arrives with far more triangles than a prop in this game can afford
// (the road barrier has 61 thousand, a cardboard box 17 thousand, and the box
// is drawn ninety times). On load every scan is merged into one mesh per
// material and thinned to a budget; its textures carry the detail.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getMaterial, findAsset } from './materials.js';

export const MODEL_IDS = ['barrel', 'crate', 'cardboard_box', 'ammo_box', 'concrete_barrier'];

/**
 * Size in metres each model is fitted to (width x, height y, depth z). stretch: fill the box
 * on every axis instead of keeping proportions (the barrier must match its 3 m collider).
 * stack: the prop is a pile of [x, y, z] copies of the scan, each filling its share of the box.
 * The scanned crate is a long flat ammunition crate; the crate of the game is a cube, so the
 * cube is four of them, two high and two deep.
 */
export const MODEL_SIZES = {
  barrel: { w: 0.6, h: 0.9, d: 0.6 },
  crate: { w: 1, h: 1, d: 1, stack: [1, 2, 2] },
  cardboard_box: { w: 0.6, h: 0.45, d: 0.45 },
  ammo_box: { w: 0.36, h: 0.2, d: 0.24 },
  concrete_barrier: { w: 3, h: 0.85, d: 0.7, stretch: true },
};

/** Most triangles a scanned model may keep. */
const MODEL_BUDGET = { barrel: 3000, crate: 3200, cardboard_box: 500, concrete_barrier: 2500 };

const plain = (color, rough = 0.8, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    red: getMaterial('metal', { color: 0x9a2a1e }),
    band: plain(0xd8b21e, 0.55, 0.2),
    wood: getMaterial('wood'),
    cardboard: plain(0x9a7b52, 0.92, 0),
    tape: plain(0xc4a878, 0.7, 0),
    olive: plain(0x59633c, 0.7, 0.2),
    yellow: plain(0xd6b020, 0.6, 0),
    concrete: getMaterial('concrete'),
  };
  return SHARED;
}

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

const PRIMITIVES = {
  barrel() {
    const M = shared();
    const body = new THREE.CylinderGeometry(0.29, 0.29, 0.9, 18, 1); body.translate(0, 0.45, 0);
    const parts = [body];
    for (const y of [0.18, 0.45, 0.72]) { const r = new THREE.CylinderGeometry(0.305, 0.305, 0.035, 18, 1); r.translate(0, y, 0); parts.push(r); }
    const lid = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 18, 1); lid.translate(0, 0.9, 0); parts.push(lid);
    const band = new THREE.CylinderGeometry(0.296, 0.296, 0.11, 18, 1); band.translate(0, 0.6, 0);
    return new THREE.Mesh(mergeGeometries([mergeGeometries(parts, false), band], true), [M.red, M.band]);
  },
  crate() { const g = new THREE.Group(); g.add(box(1, 1, 1, shared().wood, 0, 0.5, 0)); return g; },
  cardboard_box() {
    const M = shared(), g = new THREE.Group();
    g.add(box(0.6, 0.45, 0.45, M.cardboard, 0, 0.225, 0));
    g.add(box(0.08, 0.452, 0.452, M.tape, 0, 0.225, 0));
    return g;
  },
  ammo_box() {
    const M = shared(), g = new THREE.Group();
    g.add(box(0.36, 0.2, 0.24, M.olive, 0, 0.1, 0));
    g.add(box(0.1, 0.205, 0.245, M.yellow, 0, 0.1, 0));
    g.add(box(0.37, 0.03, 0.25, M.olive, 0, 0.2, 0));
    return g;
  },
  concrete_barrier() {
    const M = shared(), g = new THREE.Group();
    g.add(box(3, 0.8, 0.7, M.concrete, 0, 0.4, 0));
    g.add(box(2.9, 0.16, 0.35, M.concrete, 0, 0.88, 0));
    return g;
  },
};

let STATE = { loaded: [], missing: [...MODEL_IDS], source: 'primitives' };
const LOADED = new Map();

/** Scale a loaded model to the expected size, stand it on y=0 and centre it on x and z. */
function fit(obj, size) {
  if (size.stack) {
    const [nx, ny, nz] = size.stack;
    const unit = { w: size.w / nx, h: size.h / ny, d: size.d / nz, stretch: true };
    const pile = new THREE.Group();
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
      const one = fit(i + j + k === 0 ? obj : obj.clone(true), unit);
      // not a perfect brick: every other crate is turned end for end and sits a little off
      const odd = (i + j + k) % 2;
      one.rotation.y = odd ? Math.PI : 0;
      one.position.set((i - (nx - 1) / 2) * unit.w + (odd ? 0.012 : -0.008), j * unit.h, (k - (nz - 1) / 2) * unit.d);
      pile.add(one);
    }
    return pile;
  }
  const wrap = new THREE.Group();
  wrap.add(obj);
  const s = new THREE.Vector3();
  new THREE.Box3().setFromObject(obj).getSize(s);
  // the long side of the model goes along the long side of its box
  if ((size.w > size.d && s.z > s.x * 1.1) || (size.d > size.w && s.x > s.z * 1.1)) {
    obj.rotation.y += Math.PI / 2;
    new THREE.Box3().setFromObject(obj).getSize(s);
  }
  if (size.stretch) {
    // the model is turned, so its own axes are scaled: wrap it and scale the wrapper
    const inner = new THREE.Group();
    wrap.remove(obj); inner.add(obj); wrap.add(inner);
    inner.scale.set(size.w / (s.x || 1), size.h / (s.y || 1), size.d / (s.z || 1));
    obj = inner;
  } else {
    obj.scale.multiplyScalar(Math.min(size.w / (s.x || 1), size.h / (s.y || 1), size.d / (s.z || 1)));
  }
  const bb2 = new THREE.Box3().setFromObject(obj);
  const c = new THREE.Vector3();
  bb2.getCenter(c);
  obj.position.set(-c.x, -bb2.min.y, -c.z);
  return wrap;
}

/**
 * Thin a mesh by vertex clustering: vertices that fall into the same cell of a grid become
 * one. Texture seams and hard edges survive, because vertices of one cell stay apart when
 * their texture coordinates or the side they face differ; they still share one position, so
 * no cracks open. Returns an indexed geometry with position, normal and uv.
 */
function cluster(geo, cell) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index;
  const n = pos.count, inv = 1 / cell, UVQ = 24;
  const cellOf = new Int32Array(n), vertOf = new Int32Array(n);
  const cells = new Map(), verts = new Map();
  const cellSum = [];                       // x, y, z, count per cell
  const vCell = [], vNor = [], vUv = [], vCount = [];
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ck = Math.floor(x * inv) + ',' + Math.floor(y * inv) + ',' + Math.floor(z * inv);
    let c = cells.get(ck);
    if (c === undefined) { c = cellSum.length / 4; cells.set(ck, c); cellSum.push(0, 0, 0, 0); }
    cellSum[c * 4] += x; cellSum[c * 4 + 1] += y; cellSum[c * 4 + 2] += z; cellSum[c * 4 + 3]++;
    cellOf[i] = c;
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const facing = ax >= ay && ax >= az ? (nx > 0 ? 0 : 1) : ay >= az ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);
    const u = uv.getX(i), v = uv.getY(i);
    const vk = c + ':' + facing + ':' + Math.floor(u * UVQ) + ',' + Math.floor(v * UVQ);
    let k = verts.get(vk);
    if (k === undefined) { k = vCount.length; verts.set(vk, k); vCount.push(0); vCell.push(c); vNor.push(0, 0, 0); vUv.push(0, 0); }
    vCount[k]++; vNor[k * 3] += nx; vNor[k * 3 + 1] += ny; vNor[k * 3 + 2] += nz; vUv[k * 2] += u; vUv[k * 2 + 1] += v;
    vertOf[i] = k;
  }
  const tris = [], seen = new Set();
  const count = idx ? idx.count : n;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    const ca = cellOf[a], cb = cellOf[b], cc = cellOf[c];
    if (ca === cb || cb === cc || ca === cc) continue;                 // collapsed to a line or a point
    const lo = Math.min(ca, cb, cc), hi = Math.max(ca, cb, cc);
    const key = lo + '_' + (ca + cb + cc - lo - hi) + '_' + hi;
    if (seen.has(key)) continue;                                       // the same triangle twice
    seen.add(key);
    tris.push(vertOf[a], vertOf[b], vertOf[c]);
  }
  const m = vCount.length, P = new Float32Array(m * 3), N = new Float32Array(m * 3), U = new Float32Array(m * 2);
  for (let k = 0; k < m; k++) {
    const c = vCell[k], w = cellSum[c * 4 + 3];
    P[k * 3] = cellSum[c * 4] / w; P[k * 3 + 1] = cellSum[c * 4 + 1] / w; P[k * 3 + 2] = cellSum[c * 4 + 2] / w;
    const len = Math.hypot(vNor[k * 3], vNor[k * 3 + 1], vNor[k * 3 + 2]) || 1;
    N[k * 3] = vNor[k * 3] / len; N[k * 3 + 1] = vNor[k * 3 + 1] / len; N[k * 3 + 2] = vNor[k * 3 + 2] / len;
    U[k * 2] = vUv[k * 2] / vCount[k]; U[k * 2 + 1] = vUv[k * 2 + 1] / vCount[k];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setIndex(tris);
  return out;
}

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/**
 * Turn a fitted scan into one mesh per material, in the space of the prop (standing on y = 0),
 * with at most `budget` triangles in total.
 */
function optimise(wrap, budget) {
  wrap.updateMatrixWorld(true);
  const byMat = new Map();
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.geometry, g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone());
    if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone());
    g.setAttribute('uv', src.attributes.uv ? src.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  });
  const parts = [...byMat].map(([material, geos]) => ({ material, geometry: geos.length === 1 ? geos[0] : mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false) }));
  const total = parts.reduce((t, p) => t + triCount(p.geometry), 0);
  if (total > budget) {
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(wrap).getSize(size);
    // coarser grid until the model fits its budget
    let cell = Math.max(size.x, size.y, size.z) / 96, thin = parts;
    for (let i = 0; i < 24; i++, cell *= 1.18) {
      thin = parts.map((p) => ({ material: p.material, geometry: cluster(p.geometry, cell) }));
      if (thin.reduce((t, p) => t + triCount(p.geometry), 0) <= budget) break;
    }
    parts.length = 0; parts.push(...thin);
  }
  const out = new THREE.Group();
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  out.userData.triangles = [total, parts.reduce((t, p) => t + triCount(p.geometry), 0)];
  return out;
}

/** Look for model files. Whatever is missing falls back to primitives. */
export async function loadModelPack({ base = 'assets/models/', scans = true, onProgress = () => {} } = {}) {
  const loaded = [], missing = [];
  LOADED.clear();
  for (const [i, id] of MODEL_IDS.entries()) {
    onProgress(i / MODEL_IDS.length, id);
    try {
      const url = scans ? await findAsset(id, ['glb'], base) : null;
      if (!url) { missing.push(id); continue; }
      const gltf = await new GLTFLoader().loadAsync(url);
      LOADED.set(id, optimise(fit(gltf.scene, MODEL_SIZES[id]), MODEL_BUDGET[id] ?? Infinity));
      loaded.push(id);
    } catch (e) {
      missing.push(id);
    }
  }
  STATE = { loaded, missing, source: loaded.length === 0 ? 'primitives' : missing.length === 0 ? 'cc0' : 'mixed' };
  return STATE;
}

export function modelPackState() { return { source: STATE.source, loaded: [...STATE.loaded], missing: [...STATE.missing] }; }

/** A fresh copy of a model, standing on y = 0. */
export function getModel(id) {
  if (!PRIMITIVES[id]) throw new Error('unknown model ' + id);
  const obj = LOADED.has(id) ? LOADED.get(id).clone(true) : PRIMITIVES[id]();
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

/**
 * The meshes of a scanned model as plain data, for baking it into the static level:
 * [{geometry, material}] in the space of the prop. null when the model is not a scan, so the
 * caller keeps building the prop from boxes.
 */
export function getScanParts(id) {
  if (!LOADED.has(id)) return null;
  return LOADED.get(id).children.map((o) => ({ geometry: o.geometry, material: o.material }));
}

/**
 * One merged geometry for a model, to draw it many times with an InstancedMesh.
 * Returns {geometry, material, size}. material is an array when the model has several.
 */
export function getModelGeometry(id) {
  const root = getModel(id);
  const holder = new THREE.Group();
  holder.add(root);
  holder.updateMatrixWorld(true);
  const geos = [], mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (Array.isArray(o.material) && o.geometry.groups.length) {
      // multi material mesh: keep one geometry per group
      for (const grp of o.geometry.groups) {
        const part = new THREE.BufferGeometry();
        const ix = o.geometry.index ? o.geometry.index.array.slice(grp.start, grp.start + grp.count) : null;
        for (const name of Object.keys(g.attributes)) part.setAttribute(name, g.attributes[name]);
        if (ix) part.setIndex(Array.from(ix));
        geos.push(part); mats.push(o.material[grp.materialIndex]);
      }
    } else { geos.push(g); mats.push(Array.isArray(o.material) ? o.material[0] : o.material); }
  });
  const single = mats.every((m) => m === mats[0]);
  const geometry = mergeGeometries(geos, !single);
  return { geometry, material: single ? mats[0] : mats, size: MODEL_SIZES[id] };
}
