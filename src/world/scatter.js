// Scatter: thousands of small objects (bricks, chunks of concrete, gravel, paper,
// cans, bottles, glass, planks, cardboard boxes) drawn as GPU instances. They cast
// no shadow and have no collider, so they cost almost nothing, yet they are what
// makes the ground and the corners look lived in and destroyed.
//
//   const scatter = createScatter(scene, level, quality);
//   scatter.setDensity('low' | 'medium' | 'high');   // the one knob quality may turn
//   scatter.count, scatter.group, scatter.dispose()
//
// Density per preset: low draws a quarter, medium all of it, high adds an extra layer.

import * as THREE from 'three';
import { createRng } from '../core/math.js';
import { getMaterial } from '../render/materials.js';
import { getModelGeometry } from '../render/models.js';

const TAU = Math.PI * 2;
const DENSITY = { low: 0.25, medium: 1, high: 1 };

export function createScatter(scene, level, quality = 'medium', seed = 4242) {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = 'scatter';
  scene.add(group);

  const colliders = level.colliders.filter((c) => c.maxY > 0.15);
  const inside = (x, z) => {
    for (const c of colliders) if (x > c.minX - 0.12 && x < c.maxX + 0.12 && z > c.minZ - 0.12 && z < c.maxZ + 0.12) return true;
    return false;
  };
  // positions: part uniform, part around buildings, part around rubble
  const sample = () => {
    const r = rng();
    let x, z;
    if (r < 0.5) { x = (rng() * 2 - 1) * 43.5; z = (rng() * 2 - 1) * 43.5; }
    else if (r < 0.78 && level.footprints.length) {
      const f = level.footprints[Math.floor(rng() * level.footprints.length)];
      x = f.x0 - 3 + rng() * (f.x1 - f.x0 + 6); z = f.z0 - 3 + rng() * (f.z1 - f.z0 + 6);
    } else if (level.rubbleSpots.length) {
      const s = level.rubbleSpots[Math.floor(rng() * level.rubbleSpots.length)];
      const a = rng() * TAU, d = Math.sqrt(rng()) * (s.r * 1.8 + 1.5);
      x = s.x + Math.cos(a) * d; z = s.z + Math.sin(a) * d;
    } else { x = (rng() * 2 - 1) * 43; z = (rng() * 2 - 1) * 43; }
    return [x, z];
  };
  const place = (count) => {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 6) {
      const [x, z] = sample();
      if (Math.abs(x) > 44 || Math.abs(z) > 44 || inside(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  };

  const layers = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const make = (geo, mat, count, setup, tint, opts = {}) => {
    const pts = place(count);
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach(([x, z], i) => {
      if (!opts.highOnly) level.items.push(x, 0.05, z);
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rng() * TAU, 0);
      dummy.scale.set(1, 1, 1);
      setup(dummy, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (tint) { color.copy(tint(i)); mesh.setColorAt(i, color); }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;       // small things never cast shadows
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    layers.push({ mesh, full: pts.length, highOnly: !!opts.highOnly });
    return mesh;
  };
  const scaleUV = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return g; };
  const grey = (v, spread = 0.2) => new THREE.Color().setScalar(v + (rng() - 0.5) * spread);

  const brick = getMaterial('brick', { color: 0xa88f82 });
  const chunk = getMaterial('concrete', { color: 0x8b8782 });
  const stone = getMaterial('concrete');

  // bricks, chunks, gravel
  const brickSetup = (d) => { d.position.y = 0.035 + (rng() < 0.2 ? 0.07 : 0); d.rotation.x = (rng() - 0.5) * 0.3; d.rotation.z = (rng() - 0.5) * 0.3; };
  const chunkSetup = (d) => { const s = 0.5 + rng() * 1.9; d.scale.set(s, s * (0.5 + rng() * 0.5), s * (0.7 + rng() * 0.6)); d.position.y = 0.04 * s; d.rotation.x = rng() * 3; d.rotation.z = rng() * 3; };
  make(scaleUV(new THREE.BoxGeometry(0.22, 0.07, 0.105), 0.25), brick, 1150, brickSetup, () => grey(0.85, 0.35));
  make(scaleUV(new THREE.DodecahedronGeometry(0.1, 0), 0.4), chunk, 1500, chunkSetup, () => grey(0.9, 0.3));
  make(new THREE.IcosahedronGeometry(0.035, 0), stone, 900,
    (d) => { const s = 0.6 + rng() * 1.3; d.scale.setScalar(s); d.position.y = 0.02 * s; d.rotation.x = rng() * 3; }, () => grey(0.8, 0.4));

  // paper litter
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.297); paperGeo.rotateX(-Math.PI / 2);
  make(paperGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }), 650,
    (d) => { d.position.y = 0.012 + rng() * 0.02; d.rotation.x = (rng() - 0.5) * 0.25; d.rotation.z = (rng() - 0.5) * 0.25; },
    () => new THREE.Color().setHSL(0.1 + rng() * 0.05, 0.1 + rng() * 0.2, 0.55 + rng() * 0.35));

  // cans and bottles
  make(new THREE.CylinderGeometry(0.033, 0.033, 0.115, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.85 }), 230,
    (d) => { if (rng() < 0.55) { d.rotation.z = Math.PI / 2; d.position.y = 0.033; } else d.position.y = 0.057; },
    () => [new THREE.Color(0xb23a2e), new THREE.Color(0xc8c8c8), new THREE.Color(0x2e5c9a), new THREE.Color(0x3c8a4a)][Math.floor(rng() * 4)]);
  make(new THREE.CylinderGeometry(0.03, 0.036, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.1 }), 150,
    (d) => { d.rotation.z = Math.PI / 2; d.position.y = 0.036; },
    () => [new THREE.Color(0x2c6a3a), new THREE.Color(0x6a4018), new THREE.Color(0x9ab8c0)][Math.floor(rng() * 3)]);

  // glass shards
  make(new THREE.TetrahedronGeometry(0.04, 0), new THREE.MeshStandardMaterial({ color: 0xdcecf4, roughness: 0.05, metalness: 0.2 }), 460,
    (d) => { const s = 0.5 + rng() * 1.6; d.scale.set(s, s * 0.35, s); d.position.y = 0.01; d.rotation.x = rng() * 3; d.rotation.z = rng() * 3; });

  // wood scraps
  make(new THREE.BoxGeometry(0.9, 0.025, 0.09), new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.9 }), 170,
    (d) => { d.scale.x = 0.4 + rng() * 1.1; d.position.y = 0.013 + (rng() < 0.2 ? 0.03 : 0); d.rotation.z = (rng() - 0.5) * 0.15; },
    () => grey(0.9, 0.5).multiply(new THREE.Color(1.0, 0.8, 0.6)));

  // cardboard boxes from the model pack
  const cb = getModelGeometry('cardboard_box');
  make(cb.geometry, cb.material, 90,
    (d) => { d.rotation.x = rng() < 0.15 ? (rng() - 0.5) * 0.6 : 0; const s = 0.7 + rng() * 0.6; d.scale.setScalar(s); },
    null);

  // the extra layer of the high preset
  make(scaleUV(new THREE.BoxGeometry(0.22, 0.07, 0.105), 0.25), brick, 700, brickSetup, () => grey(0.8, 0.35), { highOnly: true });
  make(scaleUV(new THREE.DodecahedronGeometry(0.1, 0), 0.4), chunk, 700, chunkSetup, () => grey(0.85, 0.3), { highOnly: true });

  const api = {
    group,
    quality,
    get total() { return layers.reduce((n, l) => n + l.full, 0); },
    /** Instances drawn with the current density. */
    get count() { return layers.reduce((n, l) => n + l.mesh.count, 0); },
    setDensity(q) {
      api.quality = q;
      const k = DENSITY[q] ?? 1;
      for (const l of layers) l.mesh.count = l.highOnly && q !== 'high' ? 0 : Math.floor(l.full * k);
    },
    dispose() {
      scene.remove(group);
      for (const l of layers) { l.mesh.geometry.dispose(); l.mesh.dispose(); }
    },
  };
  api.setDensity(quality);
  return api;
}
