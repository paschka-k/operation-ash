// Models of the big props: barrels, crates, cardboard boxes, ammo boxes,
// concrete barriers, a covered car.
//
//   loadModelPack()        -> Promise<{loaded, missing, source}>
//   getModel(id)           -> THREE.Object3D, a fresh clone
//   getModelGeometry(id)   -> {geometry, material, size} for instancing
//   MODEL_IDS, modelPackState()
//
// If a glTF file <id>.glb exists in assets/models/ (or is embedded in
// window.__ASSETS in the single-file build) that model is used, scaled to the
// size the game expects. Otherwise the prop is built from primitives with the
// PBR materials, so a missing file never breaks the game.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getMaterial, findAsset } from './materials.js';

export const MODEL_IDS = ['barrel', 'crate', 'cardboard_box', 'ammo_box', 'concrete_barrier', 'covered_car'];

/** Size in metres each model is fitted to (width x, height y, depth z). */
export const MODEL_SIZES = {
  barrel: { w: 0.6, h: 0.9, d: 0.6 },
  crate: { w: 1, h: 1, d: 1 },
  cardboard_box: { w: 0.6, h: 0.45, d: 0.45 },
  ammo_box: { w: 0.36, h: 0.2, d: 0.24 },
  concrete_barrier: { w: 3, h: 0.8, d: 0.7 },
  covered_car: { w: 4.3, h: 1.5, d: 1.9 },
};

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
    tarp: plain(0x6b7258, 0.95, 0, { side: THREE.DoubleSide }),
    rubber: plain(0x151515, 0.9, 0),
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
  covered_car() {
    const M = shared(), g = new THREE.Group();
    g.add(box(4.3, 0.9, 1.8, M.tarp, 0, 0.7, 0));
    g.add(box(2.4, 0.6, 1.6, M.tarp, -0.2, 1.4, 0));
    for (const x of [-1.4, 1.4]) for (const z of [-0.9, 0.9]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14).rotateX(Math.PI / 2), M.rubber);
      w.position.set(x, 0.32, z);
      g.add(w);
    }
    return g;
  },
};

let STATE = { loaded: [], missing: [...MODEL_IDS], source: 'primitives' };
const LOADED = new Map();

/** Scale a loaded model to the expected size, stand it on y=0 and centre it on x and z. */
function fit(obj, size) {
  const wrap = new THREE.Group();
  wrap.add(obj);
  const bb = new THREE.Box3().setFromObject(obj);
  const s = new THREE.Vector3();
  bb.getSize(s);
  const k = Math.min(size.w / (s.x || 1), size.h / (s.y || 1), size.d / (s.z || 1));
  obj.scale.multiplyScalar(k);
  const bb2 = new THREE.Box3().setFromObject(obj);
  const c = new THREE.Vector3();
  bb2.getCenter(c);
  obj.position.set(-c.x, -bb2.min.y, -c.z);
  wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return wrap;
}

/** Look for model files. Whatever is missing falls back to primitives. */
export async function loadModelPack({ base = 'assets/models/' } = {}) {
  const loaded = [], missing = [];
  LOADED.clear();
  for (const id of MODEL_IDS) {
    try {
      const url = await findAsset(id, ['glb'], base);
      if (!url) { missing.push(id); continue; }
      const gltf = await new GLTFLoader().loadAsync(url);
      LOADED.set(id, fit(gltf.scene, MODEL_SIZES[id]));
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
