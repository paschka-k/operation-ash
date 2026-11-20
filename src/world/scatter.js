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

/**
 * Materials of the litter that are not texture sets: made once, shared by the scatter of every map
 * (wave 15: each new map builds a new scatter; these never change, so they are never thrown away).
 */
let LOCAL = null;
function localMaterials() {
  if (LOCAL) return LOCAL;
  LOCAL = {
    paper: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }),
    can: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.85 }),
    bottle: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdcecf4, roughness: 0.05, metalness: 0.2 }),
    plank: new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.9 }),
    // wave 15: litter of the generated maps
    snow: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }),
    shrub: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    rebar: new THREE.MeshStandardMaterial({ color: 0x5a3626, roughness: 0.7, metalness: 0.6 }),
  };
  return LOCAL;
}

/**
 * Wave 15: what lies about on each generated map, on top of the theme's amounts (core/mapgen
 * theme.scatter.mix). mix: amounts that replace the theme's (snow takes no paper); tint: linear colour
 * of the bricks, chunks and gravel (sandstone in the desert, frosted on the snow); extra: layers only
 * this map has.
 */
const THEME_LITTER = {
  winter: { mix: { paper: 0, cardboard: 0, cans: 0.25, bottles: 0.25, glass: 0.3, brick: 0.25, rubble: 0.35, pebbles: 0.15 }, tint: [0.92, 0.95, 1.0], extra: ['snow'] },
  desert: { mix: { paper: 0.15, cardboard: 0.2, glass: 0.2, brick: 0.2, cans: 0.4 }, tint: [1.25, 1.0, 0.72], extra: ['stones', 'shrubs'] },
  construction: { mix: { planks: 3.2, brick: 1.6, paper: 0.3 }, extra: ['rebar'] },
  airfield: { extra: ['stones'] },
  railyard: { extra: ['stones'] },
};

export function createScatter(scene, level, quality = 'medium', seed = 4242) {
  const rng = createRng(seed);
  // wave 15: the theme of a generated map scales each kind of litter (core/mapgen, theme.scatter.mix); the block has none
  const theme = level.layout && level.layout.theme;
  const mix = (theme && theme.scatter && theme.scatter.mix) || {};
  const own = (level.layout && THEME_LITTER[level.layout.id]) || {};
  const amount = (kind, n) => {
    const k = own.mix && own.mix[kind] !== undefined ? own.mix[kind] : mix[kind];
    return k === undefined ? n : Math.round(n * k);
  };
  const tinted = (c) => (own.tint ? c.setRGB(c.r * own.tint[0], c.g * own.tint[1], c.b * own.tint[2]) : c);
  const LM = localMaterials();
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
    if (count <= 0) { geo.dispose(); return null; }   // a kind this map has none of (snow and paper)
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
  make(scaleUV(new THREE.BoxGeometry(0.22, 0.07, 0.105), 0.25), brick, amount('brick', 1150), brickSetup, () => tinted(grey(0.85, 0.35)));
  make(scaleUV(new THREE.DodecahedronGeometry(0.1, 0), 0.4), chunk, amount('rubble', 1500), chunkSetup, () => tinted(grey(0.9, 0.3)));
  make(new THREE.IcosahedronGeometry(0.035, 0), stone, amount('pebbles', 900),
    (d) => { const s = 0.6 + rng() * 1.3; d.scale.setScalar(s); d.position.y = 0.02 * s; d.rotation.x = rng() * 3; }, () => tinted(grey(0.8, 0.4)));

  // paper litter
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.297); paperGeo.rotateX(-Math.PI / 2);
  make(paperGeo, LM.paper, amount('paper', 650),
    (d) => { d.position.y = 0.012 + rng() * 0.02; d.rotation.x = (rng() - 0.5) * 0.25; d.rotation.z = (rng() - 0.5) * 0.25; },
    // dirty paper: clean white sheets glowed against the dark road
    () => new THREE.Color().setHSL(0.1 + rng() * 0.05, 0.1 + rng() * 0.2, 0.28 + rng() * 0.22));

  // cans and bottles
  make(new THREE.CylinderGeometry(0.033, 0.033, 0.115, 10), LM.can, amount('cans', 230),
    (d) => { if (rng() < 0.55) { d.rotation.z = Math.PI / 2; d.position.y = 0.033; } else d.position.y = 0.057; },
    () => [new THREE.Color(0xb23a2e), new THREE.Color(0xc8c8c8), new THREE.Color(0x2e5c9a), new THREE.Color(0x3c8a4a)][Math.floor(rng() * 4)]);
  make(new THREE.CylinderGeometry(0.03, 0.036, 0.2, 10), LM.bottle, amount('bottles', 150),
    (d) => { d.rotation.z = Math.PI / 2; d.position.y = 0.036; },
    () => [new THREE.Color(0x2c6a3a), new THREE.Color(0x6a4018), new THREE.Color(0x9ab8c0)][Math.floor(rng() * 3)]);

  // glass shards
  make(new THREE.TetrahedronGeometry(0.04, 0), LM.glass, amount('glass', 460),
    (d) => { const s = 0.5 + rng() * 1.6; d.scale.set(s, s * 0.35, s); d.position.y = 0.01; d.rotation.x = rng() * 3; d.rotation.z = rng() * 3; });

  // wood scraps
  make(new THREE.BoxGeometry(0.9, 0.025, 0.09), LM.plank, amount('planks', 170),
    (d) => { d.scale.x = 0.4 + rng() * 1.1; d.position.y = 0.013 + (rng() < 0.2 ? 0.03 : 0); d.rotation.z = (rng() - 0.5) * 0.15; },
    () => grey(0.9, 0.5).multiply(new THREE.Color(1.0, 0.8, 0.6)));

  // cardboard boxes from the model pack
  const cb = getModelGeometry('cardboard_box');
  make(cb.geometry, cb.material, amount('cardboard', 90),
    (d) => { d.rotation.x = rng() < 0.15 ? (rng() - 0.5) * 0.6 : 0; const s = 0.7 + rng() * 0.6; d.scale.setScalar(s); },
    null);   // getModelGeometry merges a new geometry on every call: this scatter's own

  // wave 15: the litter only some generated maps have
  const extra = new Set(own.extra || []);
  if (extra.has('snow')) {
    // lumps of snow knocked off roofs and kicked up by boots
    make(new THREE.DodecahedronGeometry(0.12, 0), LM.snow, 650,
      (d) => { const s = 0.6 + rng() * 2.2; d.scale.set(s, s * 0.45, s * (0.7 + rng() * 0.6)); d.position.y = 0.02 * s; },
      () => new THREE.Color().setScalar(0.82 + rng() * 0.12));
  }
  if (extra.has('stones')) {
    // loose stones, bigger than the gravel
    make(new THREE.DodecahedronGeometry(0.14, 0), stone, 380,
      (d) => { const s = 0.5 + rng() * 1.8; d.scale.set(s, s * (0.5 + rng() * 0.4), s * (0.7 + rng() * 0.5)); d.position.y = 0.04 * s; d.rotation.x = rng() * 3; },
      () => tinted(grey(0.85, 0.3)));
  }
  if (extra.has('shrubs')) {
    // dry thorn bushes in the sand
    make(new THREE.IcosahedronGeometry(0.28, 0), LM.shrub, 110,
      (d) => { const s = 0.6 + rng() * 1.2; d.scale.set(s, s * 0.6, s); d.position.y = 0.12 * s; },
      () => new THREE.Color(0.32 + rng() * 0.12, 0.3 + rng() * 0.1, 0.17));
  }
  if (extra.has('rebar')) {
    // bent and loose reinforcing bars
    make(new THREE.BoxGeometry(2.2, 0.025, 0.025), LM.rebar, 320,
      (d) => { d.scale.x = 0.4 + rng() * 1.2; d.position.y = 0.014; d.rotation.z = (rng() - 0.5) * 0.06; },
      () => new THREE.Color().setScalar(0.8 + rng() * 0.4));
  }

  // the extra layer of the high preset
  make(scaleUV(new THREE.BoxGeometry(0.22, 0.07, 0.105), 0.25), brick, Math.round(700 * (own.mix && own.mix.brick !== undefined ? Math.min(1, own.mix.brick * 2) : 1)), brickSetup, () => tinted(grey(0.8, 0.35)), { highOnly: true });
  make(scaleUV(new THREE.DodecahedronGeometry(0.1, 0), 0.4), chunk, 700, chunkSetup, () => tinted(grey(0.85, 0.3)), { highOnly: true });

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
      // the geometries made here go (all of them are this scatter's own); the shared materials stay
      for (const l of layers) { l.mesh.geometry.dispose(); l.mesh.dispose(); }
      layers.length = 0;
    },
  };
  api.setDensity(quality);
  return api;
}
