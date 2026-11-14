// The riders' vehicles as the player sees them. Every kind of vehicle is one pool of copies
// (world/pool.js): all scooters are one draw call, and the shadow maps and the ambient occlusion pass
// draw a simple box in place of the model.
//
// For now each kind is a grey box of its size from VEHICLES (core/rules): length along the heading,
// width across it, height up from the ground. The modelled vehicles replace the boxes inside this module
// without changing its interface.
//
//   const vehicles = createVehicles(game);
//   const h = vehicles.add('moto');                        // a copy of that kind, or a handle without a copy when the pool is full
//   vehicles.place(h, x, y, z, heading, lean, roll);       // every frame while it moves
//   vehicles.wreck(h);                                     // from now on it is a wreck (lying down is up to place)
//   vehicles.remove(h); vehicles.clear();

import * as THREE from 'three';
import { InstancePool } from '../world/pool.js';
import { VEHICLES } from '../core/rules.js';

const CAPACITY = 16;   // per kind: the riders on the streets and the wrecks still lying there
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'vehicles';
    game.gr.scene.add(this.root);
    this.handles = new Set();
    const material = new THREE.MeshStandardMaterial({ color: 0x6b6e72, roughness: 0.7, metalness: 0.3 });
    game.gr.prepareMaterial(material);
    this.material = material;
    this.pools = {};
    for (const [kind, V] of Object.entries(VEHICLES)) {
      const box = new THREE.BoxGeometry(V.width, V.height, V.length).translate(0, V.height / 2, 0);
      const pool = new InstancePool({ geometry: box, material, proxy: box, gr: game.gr, capacity: CAPACITY });
      pool.group.name = 'vehicles-' + kind;
      pool.group.visible = false;
      this.pools[kind] = pool;
      this.root.add(pool.group);
    }
  }

  _sync(pool) { pool.group.visible = pool.count > 0; }   // an empty pool costs no draw call

  /** A new copy of `kind`, out of sight until it is placed. Returns its handle {kind, copy, wrecked}. */
  add(kind) {
    const pool = this.pools[kind];
    if (!pool) throw new Error('unknown vehicle ' + kind);
    const copy = pool.add(_m.makeScale(0, 0, 0));
    const handle = { kind, copy, wrecked: false };
    this.handles.add(handle);
    this._sync(pool);
    return handle;
  }

  /**
   * Put a copy at x, y, z (the ground under its centre) facing heading (the yaw of the game,
   * atan2(dx, dz)), leaning by `lean` about its length (into a turn, or onto its side as a wreck) and
   * pitched by `roll` about its width (nose up when positive).
   */
  place(handle, x, y, z, heading = 0, lean = 0, roll = 0) {
    if (!handle || !handle.copy) return;
    _q.setFromEuler(_e.set(-roll, heading, -lean, 'YXZ'));
    this.pools[handle.kind].set(handle.copy, _m.compose(_p.set(x, y, z), _q, _s));
  }

  /** The vehicle is shot out: it stays in its pool as a wreck. */
  wreck(handle) { if (handle) handle.wrecked = true; }

  remove(handle) {
    if (!handle || !this.handles.has(handle)) return;
    this.handles.delete(handle);
    const pool = this.pools[handle.kind];
    if (handle.copy) pool.remove(handle.copy);
    handle.copy = null;
    this._sync(pool);
  }

  /** Remove every vehicle and wreck (new game, revival, the shop). */
  clear() {
    for (const h of this.handles) h.copy = null;
    this.handles.clear();
    for (const pool of Object.values(this.pools)) { pool.clear(); this._sync(pool); }
  }

  /** Copies in use, wrecks included. */
  get count() { return this.handles.size; }
}

/** The pools of the riders' vehicles. Returns {add, place, wreck, remove, clear, pools}. */
export function createVehicles(game) { return new Vehicles(game); }
