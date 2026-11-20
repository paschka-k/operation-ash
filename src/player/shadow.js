// The player's shadow. The first person view has no body, so a few simple shapes stand where the
// body would be: legs, torso, head and the arms holding a rifle forward. They exist only in the
// shadow maps (the colour and ambient occlusion passes never see them, see lightOnly in
// world/pool.js), follow the player's position, crouch and heading, and cost one draw call per
// shadow cascade.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lightOnly, writeNothing } from '../world/pool.js';
import { PLAYER } from '../core/rules.js';

function bodyGeometry() {
  const parts = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    parts.push(g.toNonIndexed());
  };
  // local space: feet at y = 0, facing -z (as the camera at yaw 0), standing 1.8 m tall
  add(new THREE.CylinderGeometry(0.075, 0.06, 0.86, 6), -0.11, 0.43, 0.02, 0.06);
  add(new THREE.CylinderGeometry(0.075, 0.06, 0.86, 6), 0.11, 0.43, -0.04, -0.08);
  add(new THREE.CapsuleGeometry(0.17, 0.42, 3, 8), 0, 1.16, 0.02);
  add(new THREE.BoxGeometry(0.44, 0.22, 0.24), 0, 1.36, 0.02);
  add(new THREE.SphereGeometry(0.115, 8, 6), 0, 1.66, 0.0);
  // arms toward the weapon held at the shoulder
  add(new THREE.CylinderGeometry(0.045, 0.04, 0.5, 5), 0.2, 1.3, -0.16, Math.PI / 2 - 0.35, 0, 0.25);
  add(new THREE.CylinderGeometry(0.045, 0.04, 0.55, 5), -0.14, 1.27, -0.27, Math.PI / 2 - 0.25, 0, -0.45);
  // the weapon
  add(new THREE.BoxGeometry(0.06, 0.12, 0.78), 0.1, 1.36, -0.42);
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

/**
 * The shadow of the player in `game` (game.player, game.gr). Returns {mesh, update(), dispose()};
 * update() runs once per frame before drawing.
 */
export function createPlayerShadow(game) {
  const mesh = new THREE.Mesh(bodyGeometry(), writeNothing(THREE.DoubleSide));
  mesh.name = 'playerShadow';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.intersectsFrustum = lightOnly;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  game.gr.scene.add(mesh);
  return {
    mesh,
    update() {
      const p = game.player;
      // no body in the menu (the camera flies around the map) and none once the player has fallen
      const show = !!p && p.alive && game.state !== 'menu' && game.state !== 'loading';
      mesh.visible = show;
      if (!show) return;
      const b = p.body;
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.set(0, p.yaw, 0);
      mesh.scale.set(1, b.height / PLAYER.height, 1);
      mesh.updateMatrix();
      mesh.updateMatrixWorld();
    },
    dispose() {
      game.gr.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
