// Many copies of one prop drawn with a single call.
//
// A crate or a barrel used to be its own mesh: one draw call in the colour pass, one in the
// ambient occlusion pass and one in each of the three shadow cascades, and in the shadow
// passes the whole scanned model (three thousand triangles) went down the pipe every time.
// A pool keeps all copies of a prop in one InstancedMesh. With a `proxy` (a box, a cylinder)
// the shadow maps and the ambient occlusion pass draw that simple shape in place of the model.

import * as THREE from 'three';

/**
 * Frustum test that passes only for the orthographic box of a directional light. Left and
 * right planes of such a box face exactly away from each other; in a perspective frustum
 * they never do. A mesh with this test exists in the shadow maps and nowhere else.
 */
export const lightOnly = (frustum) => frustum.planes[0].normal.dot(frustum.planes[1].normal) < -0.9999;

/** Material for meshes that are only ever drawn by a pass that brings its own material. */
export const writeNothing = (side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** Matrix of a copy: position, rotation (radians, XYZ order), scale. */
export function placement(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

export class InstancePool {
  /**
   * geometry, material   the prop as the colour pass draws it (material may be an array)
   * proxy                simple geometry with normals that stands in for it in the shadow maps and
   *                      in the ambient occlusion pass; without it the prop casts its own shadow
   * gr                   the render pipeline (swapForAO, addNoAO)
   * occlude              false: leave the prop out of the ambient occlusion pass altogether
   */
  constructor({ geometry, material, proxy = null, gr, capacity = 64, castShadow = true, receiveShadow = true, occlude = true }) {
    this.capacity = capacity;
    this.handles = [];
    this.group = new THREE.Group();
    const detail = new THREE.InstancedMesh(geometry, material, capacity);
    detail.receiveShadow = receiveShadow;
    detail.castShadow = castShadow && !proxy;
    this.meshes = [detail];
    if (proxy) {
      const nothing = writeNothing();
      if (castShadow) {
        const shadow = new THREE.InstancedMesh(proxy, nothing, capacity);
        shadow.castShadow = true;
        shadow.intersectsFrustum = lightOnly;
        shadow.name = 'propShadow';
        this.meshes.push(shadow);
      }
      if (occlude) {
        const shape = new THREE.InstancedMesh(proxy, nothing, capacity);
        shape.name = 'propShape';
        this.meshes.push(shape);
        gr.swapForAO(detail, shape);
      }
    }
    if (!occlude) gr.addNoAO(detail);
    for (const mesh of this.meshes) {
      // every mesh of the pool reads the same list of placements
      mesh.instanceMatrix = detail.instanceMatrix;
      mesh.count = 0;
      mesh.matrixAutoUpdate = false;
      // the copies are spread over the whole map: there is nothing to cull (the shadow mesh keeps its own test)
      if (mesh.intersectsFrustum !== lightOnly) mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.detail = detail;
  }

  get count() { return this.detail.count; }

  _touch() { this.detail.instanceMatrix.needsUpdate = true; }

  /** Add a copy. Returns its handle, to move or remove it later. */
  add(matrix) {
    const i = this.detail.count;
    if (i >= this.capacity) return null;            // the pool is full: the prop is simply not drawn
    const handle = { i };
    this.handles[i] = handle;
    this.detail.setMatrixAt(i, matrix);
    for (const mesh of this.meshes) mesh.count = i + 1;
    this._touch();
    return handle;
  }

  /** Move a copy. */
  set(handle, matrix) {
    if (!handle || handle.i < 0) return;
    this.detail.setMatrixAt(handle.i, matrix);
    this._touch();
  }

  /** Remove a copy: the last one takes its slot. */
  remove(handle) {
    if (!handle || handle.i < 0) return;
    const last = this.detail.count - 1;
    if (handle.i !== last) {
      this.detail.getMatrixAt(last, _m);
      this.detail.setMatrixAt(handle.i, _m);
      const moved = this.handles[last];
      moved.i = handle.i;
      this.handles[handle.i] = moved;
    }
    this.handles.length = last;
    handle.i = -1;
    for (const mesh of this.meshes) mesh.count = last;
    this._touch();
  }

  clear() {
    for (const h of this.handles) h.i = -1;
    this.handles.length = 0;
    for (const mesh of this.meshes) mesh.count = 0;
  }
}
