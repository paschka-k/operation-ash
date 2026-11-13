// Map density. Passes that make the block feel lived in and destroyed:
//   addBigProps  large obstacles and street furniture with colliders
//   addInteriors furniture and clutter inside every building, clear of doors and breaches
//   addDetails   things on walls and above eye level: soot, curtains, AC units,
//                signs, awnings, posters, cables, rebar

import * as THREE from 'three';
import { makeBox, raycast } from '../core/collision.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------ canvas art
function canvasTexture(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function sootTexture(rng) {
  return canvasTexture(64, 96, (g, w, h) => {
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.45, 'rgba(10,8,6,0.45)');
    grad.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // streaky edges so it does not look like a plain gradient
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = rng() * h, r = 1 + rng() * 5;
      g.fillStyle = 'rgba(0,0,0,' + (0.15 + rng() * 0.35) + ')';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.18, 'rgba(0,0,0,0)');
    side.addColorStop(0.82, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = side; g.fillRect(0, 0, w, h);
  });
}

function stripeTexture(c1, c2) {
  return canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    g.fillStyle = c2; g.fillRect(0, 0, w / 2, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 6);
  }, true);
}

function posterTexture(kind) {
  return canvasTexture(128, 192, (g, w, h) => {
    if (kind === 0) {
      g.fillStyle = '#c9b88a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#9b2a22'; g.fillRect(0, 0, w, 54);
      g.fillStyle = '#f0e6c8'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center';
      g.fillText('ДЕРЖИСЬ', w / 2, 36);
      g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(w / 2, 108, 30, 0, TAU); g.fill();
      g.fillStyle = '#c9b88a'; g.fillRect(w / 2 - 6, 90, 12, 30);
    } else if (kind === 1) {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2c5f8a'); gr.addColorStop(1, '#d58a3a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
      g.fillText('ЛИМОНАД', w / 2, 40);
      g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(w / 2, 112, 34, 0, TAU); g.fill();
    } else {
      g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#222'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
      g.fillText('ИЩЕТ', w / 2, 36);
      g.fillStyle = '#555'; g.fillRect(24, 52, w - 48, 84);
      g.fillStyle = '#222'; g.font = '14px sans-serif'; g.fillText('ВОЗНАГРАЖДЕНИЕ', w / 2, 160);
    }
    // age: stains and tears
    g.fillStyle = 'rgba(40,30,20,0.18)';
    for (let i = 0; i < 24; i++) g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 20, 2 + Math.random() * 10);
    g.clearRect(w - 20, h - 18, 20, 18);
    g.clearRect(0, 0, 14, 12);
  });
}

function stencilTexture(text, color = '#f0e8d0') {
  return canvasTexture(256, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(0,0,0,' + Math.random() * 0.8 + ')'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 2); }
  });
}

function fenceTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(170,175,180,0.95)'; g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
  }, true);
}

function decorMaterials(w) {
  if (w.dm) return w.dm;
  const rng = w.rng;
  const over = (m, f = -3) => { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = f; return m; };
  const decal = (tex) => over(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0 }));
  const fabric = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide });
  const stripes = stripeTexture('#e9e1cc', '#a8352b');
  const stripes2 = stripeTexture('#e9e1cc', '#2c5f8a');
  const dm = {
    soot: over(new THREE.MeshStandardMaterial({ map: sootTexture(rng), transparent: true, depthWrite: false, roughness: 1, metalness: 0 }), -3),
    curtains: [fabric(0x7a6a58), fabric(0x5a6a74), fabric(0x8a4a42), fabric(0x6a6a52)],
    awning: [
      Object.assign(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide }), { userData: { texWorld: [1, 1] } }),
      Object.assign(new THREE.MeshStandardMaterial({ map: stripes2, roughness: 0.9, side: THREE.DoubleSide }), { userData: { texWorld: [1, 1] } }),
    ],
    posters: [decal(posterTexture(0)), decal(posterTexture(1)), decal(posterTexture(2))],
    stencils: [decal(stencilTexture('ЭВАКУАЦИЯ →')), decal(stencilTexture('СЕКТОР 4', '#e8a33a')), decal(stencilTexture('ОПАСНО · МИНЫ', '#d8d0b8'))],
    cable: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7 }),
    signRed: new THREE.MeshStandardMaterial({ color: 0xa8322a, roughness: 0.55, metalness: 0.3 }),
    signBlue: new THREE.MeshStandardMaterial({ color: 0x2c5d8f, roughness: 0.55, metalness: 0.3 }),
    signYellow: new THREE.MeshStandardMaterial({ color: 0xc9a52a, roughness: 0.55, metalness: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x10161c, emissive: 0x7fb8ff, emissiveIntensity: 1.2, roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2630, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 }),
    fenceMesh: new THREE.MeshStandardMaterial({
      map: fenceTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.7,
    }),
    char: new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 1 }),
    tarp: [fabric(0x4a6a8a), fabric(0x8a5a3a), fabric(0x5a7a4a), fabric(0x9a8a6a)],
    busYellow: new THREE.MeshStandardMaterial({ color: 0xb8932a, roughness: 0.6, metalness: 0.3 }),
    vendRed: new THREE.MeshStandardMaterial({ color: 0xa02a24, roughness: 0.4, metalness: 0.4 }),
    vendBlue: new THREE.MeshStandardMaterial({ color: 0x2a4d82, roughness: 0.4, metalness: 0.4 }),
  };
  dm.fenceMesh.userData = { texWorld: [1, 1] };
  w.dm = dm;
  return dm;
}

function horizontalCylinder(w, mat, cx, cy, cz, r, len, alongX) {
  const g = new THREE.CylinderGeometry(r, r, len, 20);
  if (alongX) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
  g.translate(cx, cy, cz);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const tw = (mat.userData.texWorld || [1, 1]);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / tw[0], pos.getY(i) / tw[1]);
  w._addGeo(mat, g);
}

// -------------------------------------------------------------- big props
export function addBigProps(w) {
  const m = w.m, dm = decorMaterials(w), rng = w.rng;
  const tryAt = (cx, cz, sw, sd, fn) => { if (w.fits(cx, cz, sw, sd, 0.3)) { fn(); return true; } return false; };

  // anti-tank hedgehogs, solid cover and obstacles
  for (const [x, z] of [[-6.5, -8.5], [6.5, -8.5], [-10.5, 9.5], [10.5, 9.8], [0, -17], [-1, 28], [13, 0.8], [-13, -0.8], [24, -4], [-24, 4]]) {
    tryAt(x, z, 1.6, 1.6, () => {
      w.box(x, 0.55, z, 2.3, 0.15, 0.15, m.metalGray, { collide: false, rz: 0.785, ry: rng() * 3 });
      w.box(x, 0.55, z, 2.3, 0.15, 0.15, m.metalGray, { collide: false, rz: -0.785, ry: rng() * 3 });
      w.box(x, 0.55, z, 0.15, 0.15, 2.3, m.metalGray, { collide: false, rx: 0.785, ry: rng() * 0.6 });
      w.addCollider(makeBox(x, 0.55, z, 1.5, 1.1, 1.5, { kind: 'metal' }));
    });
  }

  // pallet stacks
  for (const [x, z] of [[-16.5, 8.5], [17.5, -8.8], [-31, -10], [31, 8.5], [9.5, 24], [-22, 36], [37, -20], [-35, 2], [22, 38], [-6, -30]]) {
    const n = 2 + Math.floor(rng() * 3);
    tryAt(x, z, 1.3, 0.9, () => {
      for (let k = 0; k < n; k++) w.box(x + (rng() - 0.5) * 0.08, 0.07 + k * 0.14, z, 1.2, 0.12, 0.8, m.woodDark, { collide: false, ry: (rng() - 0.5) * 0.15 });
      w.addCollider(makeBox(x, (n * 0.14) / 2, z, 1.25, n * 0.14, 0.85, { kind: 'wood' }));
    });
  }

  // tire stacks
  for (const [x, z] of [[-9.5, 7.8], [9, -8], [-21, -9], [21.5, 9], [-31, 33], [34, -9], [12, 36], [-5, 20]]) {
    const n = 2 + Math.floor(rng() * 3);
    tryAt(x, z, 0.8, 0.8, () => {
      for (let k = 0; k < n; k++) w.cylinder(x + (rng() - 0.5) * 0.06, 0.11 + k * 0.22, z + (rng() - 0.5) * 0.06, 0.34, 0.22, m.rubber, 14);
      w.addCollider(makeBox(x, (n * 0.22) / 2, z, 0.7, n * 0.22, 0.7, { kind: 'concrete' }));
    });
  }

  // benches and bins along the sidewalks
  for (const [x, z, alongX] of [[-17, 7.4, true], [17, -7.4, true], [7.4, 14, false], [-7.4, -14, false], [27, 7.4, true], [-27, -7.4, true]]) {
    tryAt(x, z, alongX ? 1.7 : 0.6, alongX ? 0.6 : 1.7, () => {
      const L = 1.6, D = 0.5;
      const sx = alongX ? L : D, sz = alongX ? D : L;
      w.box(x, 0.45, z, sx, 0.06, sz, m.woodDark, { collide: false });
      w.box(x + (alongX ? 0 : -0.22), 0.75, z + (alongX ? -0.22 : 0), alongX ? L : 0.06, 0.4, alongX ? 0.06 : L, m.woodDark, { collide: false });
      for (const s of [-0.65, 0.65]) w.box(x + (alongX ? s : 0), 0.22, z + (alongX ? 0 : s), alongX ? 0.06 : 0.4, 0.44, alongX ? 0.4 : 0.06, m.metalGray, { collide: false });
      w.addCollider(makeBox(x, 0.3, z, sx, 0.6, sz, { kind: 'wood', blocksBullets: false }));
    });
  }
  for (const [x, z] of [[-7.6, 9], [7.6, -9.5], [-7.6, 22], [7.6, 30], [-15, -7.4], [16, 7.4], [-7.7, -26], [7.7, 6]]) {
    tryAt(x, z, 0.6, 0.6, () => {
      w.cylinder(x, 0.42, z, 0.27, 0.84, m.metalGreen, 12);
      w.box(x, 0.86, z, 0.6, 0.05, 0.6, m.metalGreen, { collide: false });
      w.addCollider(makeBox(x, 0.42, z, 0.56, 0.84, 0.56, { kind: 'metal' }));
    });
  }
  // fire hydrants
  for (const [x, z] of [[-7.2, 15], [7.2, -16], [-7.2, -23], [7.2, 25], [16.5, 7.3], [-16.5, -7.3]]) {
    tryAt(x, z, 0.4, 0.4, () => {
      w.cylinder(x, 0.34, z, 0.11, 0.68, m.metalRed, 10);
      w.cylinder(x, 0.72, z, 0.14, 0.08, m.metalRed, 10);
      w.box(x, 0.45, z, 0.34, 0.09, 0.09, m.metalRed, { collide: false });
    });
  }

  // bus shelters
  for (const [x, z, yaw] of [[-20, 7.6, 0], [20.5, -7.6, 0]]) {
    tryAt(x, z, 3.2, 1.4, () => {
      w.box(x, 2.45, z, 3.1, 0.08, 1.4, m.metalGray, { collide: false, rx: 0.04 * (z > 0 ? -1 : 1) });
      for (const s of [-1.45, 1.45]) w.box(x + s, 1.2, z + 0.6 * (z > 0 ? 1 : -1), 0.08, 2.4, 0.08, m.metalGray, { collide: false });
      w.box(x, 1.2, z - 0.62 * (z > 0 ? 1 : -1), 3.0, 2.2, 0.05, dm.glass, { collide: false });
      w.addCollider(makeBox(x, 1.2, z - 0.62 * (z > 0 ? 1 : -1), 3.0, 2.4, 0.12, { kind: 'metal', blocksBullets: false }));
      w.box(x, 0.45, z - 0.35 * (z > 0 ? 1 : -1), 2.2, 0.06, 0.4, m.woodDark, { collide: false });
    });
  }

  // concrete pipes
  for (const [x, z, alongX] of [[-33, 6, true], [36, 36, false], [-26, -40, true], [8, -42, true]]) {
    tryAt(x, z, alongX ? 2.6 : 1.5, alongX ? 1.5 : 2.6, () => {
      horizontalCylinder(w, m.concrete, x, 0.72, z, 0.72, 2.4, alongX);
      w.addCollider(makeBox(x, 0.72, z, alongX ? 2.4 : 1.44, 1.44, alongX ? 1.44 : 2.4, { kind: 'concrete' }));
    });
  }

  // market stalls with tarps
  for (const [x, z, i] of [[-24, 10.5, 0], [25, -10, 1], [-5, 32, 2]]) {
    tryAt(x, z, 2.4, 1.6, () => {
      w.box(x, 0.45, z, 2.0, 0.9, 0.9, m.woodDark, { kind: 'wood' });
      for (const sx of [-1.05, 1.05]) for (const sz of [-0.6, 0.6]) w.box(x + sx, 1.1, z + sz, 0.05, 2.2, 0.05, m.woodDark, { collide: false });
      w.quad(dm.tarp[i % dm.tarp.length], x, 2.2, z, 2.4, 1.6, 0, -Math.PI / 2 + 0.25);
      w.box(x + 0.4, 0.95, z, 0.5, 0.1, 0.4, m.sandbag, { collide: false });
    });
  }

  // generators and transformer boxes
  for (const [x, z] of [[-33, -17], [35, 12], [-10, 42], [11, -27]]) {
    tryAt(x, z, 1.4, 1.0, () => {
      w.box(x, 0.7, z, 1.3, 1.4, 0.8, m.metalGreen, { kind: 'metal' });
      for (let i = 0; i < 4; i++) w.box(x, 0.35 + i * 0.22, z + 0.405, 1.0, 0.07, 0.02, m.black || m.rubber, { collide: false });
      w.box(x + 0.3, 1.5, z, 0.12, 0.2, 0.12, m.metalGray, { collide: false });
      w.cylinder(x - 0.4, 1.55, z, 0.07, 0.3, m.metalGray, 8);
    });
  }

  // vending machines: their lit fronts are small light accents
  for (const [x, z, yaw, i] of [[-8.8, -7.2, 1, 0], [-31.5, 8.8, 0, 1], [10, 38.5, 0, 0]]) {
    tryAt(x, z, 1.0, 0.9, () => {
      const mat = i === 0 ? dm.vendRed : dm.vendBlue;
      w.box(x, 0.95, z, 0.95, 1.9, 0.8, mat, { kind: 'metal' });
      w.box(x, 1.15, z + 0.41, 0.7, 1.1, 0.03, dm.glow, { collide: false });
      w.box(x, 0.28, z + 0.41, 0.6, 0.14, 0.03, m.rubber, { collide: false });
    });
  }

  // a wrecked bus across the north end of the cross street
  tryAt(2.5, -38.5, 3.0, 11, () => {
    const x = 2.5, z = -38.5;
    w.box(x, 1.55, z, 2.6, 2.3, 10.4, dm.busYellow, { kind: 'metal' });
    w.box(x, 0.45, z, 2.55, 0.5, 10.4, m.metalChar, { collide: false });
    for (const sx of [-1.31, 1.31]) {
      w.box(x + sx, 1.95, z, 0.04, 0.75, 9.4, m.window, { collide: false });
      for (const wz of [-3.4, 3.4]) {
        const g = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
        g.rotateZ(Math.PI / 2); g.translate(x + sx * 0.96, 0.5, z + wz);
        w._addGeo(m.rubber, w._uvFix(g));
      }
    }
    w.box(x, 1.95, z + 5.21, 2.3, 0.9, 0.04, m.window, { collide: false });
    w.box(x, 2.78, z, 2.4, 0.08, 10.2, m.metalChar, { collide: false, rx: 0.02 });
    w.fireSpots.push({ x, z });
  });

  // chain-link fences, a few burnt trees
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.5));
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (!w.fits(cx, cz, alongX ? len : 0.3, alongX ? 0.3 : len, 0.2)) return;
    for (let i = 0; i <= n; i++) {
      const px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n;
      w.box(px, 1.0, pz, 0.07, 2.0, 0.07, m.metalGray, { collide: false });
    }
    w.box(cx, 1.98, cz, alongX ? len : 0.05, 0.05, alongX ? 0.05 : len, m.metalGray, { collide: false });
    const g = new THREE.PlaneGeometry(len, 1.9);
    if (!alongX) g.rotateY(Math.PI / 2);
    g.translate(cx, 1.0, cz);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 1.6, uv.getY(i) * 3);
    w._addGeo(dm.fenceMesh, g);
    w.addCollider(makeBox(cx, 1.0, cz, alongX ? len : 0.1, 2.0, alongX ? 0.1 : len, { kind: 'metal', blocksBullets: false }));
  };
  fence(-20, 14, -20, 20);
  fence(14, 22, 20, 22);
  fence(-34, -18, -26, -18);
  fence(38, -4, 38, 2);
  fence(-18, 36, -12, 36);

  for (const [x, z] of [[-24, 16], [12, 12], [-35, -3], [26, -4], [-9, -36], [40, 24], [-40, 40]]) {
    tryAt(x, z, 0.8, 0.8, () => {
      w.box(x, 2.1, z, 0.34, 4.2, 0.34, dm.bark, { kind: 'wood', rx: 0.04, rz: -0.05 });
      for (let i = 0; i < 6; i++) {
        const a = rng() * TAU, y = 2.4 + rng() * 1.8, len = 0.9 + rng() * 1.3;
        w.segment(dm.bark, x, y, z, x + Math.cos(a) * len, y + 0.5 + rng() * 0.7, z + Math.sin(a) * len, 0.09);
      }
    });
  }
}

// --------------------------------------------------------------- details
export function addDetails(w) {
  const m = w.m, dm = decorMaterials(w), rng = w.rng;
  const N = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

  // world position of a window centre on its wall (face coordinate filled by mountOnWall)
  const winPos = (r) => {
    const [nx, nz] = N[r.side];
    const x = nx === 0 ? r.c : (nx < 0 ? r.x0 : r.x1);
    const z = nz === 0 ? r.c : (nz < 0 ? r.z0 : r.z1);
    return { x, z, nx, nz };
  };

  let acCount = 0, curtainCount = 0, sootCount = 0;
  for (const r of w.windows) {
    const p = winPos(r);
    const above = w.mountOnWall(p.x, r.top + 0.7, p.z, p.nx, p.nz);
    if (!above) continue;
    const yaw = Math.atan2(p.nx, p.nz);
    // soot above burnt windows, more on the lower floors where the fire started
    if (rng() < (r.storey === 0 ? 0.65 : 0.4)) {
      w.quad(dm.soot, above.x + p.nx * 0.012, r.top + 0.72, above.z + p.nz * 0.012, 1.9, 1.5, yaw);
      sootCount++;
    }
    // curtains hanging out of upper windows
    if (r.storey >= 1 && rng() < 0.3) {
      const mat = dm.curtains[Math.floor(rng() * dm.curtains.length)];
      w.quad(mat, above.x + p.nx * 0.16, r.top - 0.75, above.z + p.nz * 0.16, 0.9 + rng() * 0.5, 1.4, yaw + (rng() - 0.5) * 0.3, 0.1 + rng() * 0.15, (rng() - 0.5) * 0.3);
      curtainCount++;
    }
    // AC units beside windows
    if (r.storey <= 1 && rng() < 0.22) {
      const off = 1.55 * (rng() < 0.5 ? -1 : 1);
      const ax = p.x + (p.nx === 0 ? off : 0), az = p.z + (p.nz === 0 ? off : 0);
      const wall = w.mountOnWall(ax, r.bottom + 0.4, az, p.nx, p.nz);
      if (wall) {
        const sw = p.nz !== 0 ? 0.85 : 0.45, sd = p.nz !== 0 ? 0.45 : 0.85;
        w.box(wall.x + p.nx * 0.225, r.bottom + 0.4, wall.z + p.nz * 0.225, sw, 0.55, sd, m.metalGray, { collide: false });
        w.box(wall.x + p.nx * 0.465, r.bottom + 0.4, wall.z + p.nz * 0.465, p.nz !== 0 ? 0.55 : 0.04, 0.4, p.nz !== 0 ? 0.04 : 0.55, m.rubber, { collide: false });
        acCount++;
      }
    }
  }

  // signs and awnings over doors
  for (const d of w.doorList) {
    const [nx, nz] = N[d.side];
    const x = nx === 0 ? d.at : 0, z = nz === 0 ? d.at : 0;
    const px = nx === 0 ? x : (nx < 0 ? d.x0 : d.x1), pz = nz === 0 ? z : (nz < 0 ? d.z0 : d.z1);
    const hit = w.mountOnWall(px, 2.85, pz, nx, nz);
    if (!hit) continue;
    const alongZ = nz !== 0;
    if (d.storeys <= 2 && rng() < 0.6) {
      // striped awning above the door
      const aw = dm.awning[Math.floor(rng() * dm.awning.length)];
      const sign = nx + nz; // outward component
      const ww = alongZ ? 2.8 : 1.4, dd = alongZ ? 1.4 : 2.8;
      const tilt = 0.32;
      w.box(hit.x + nx * 0.7, 2.75, hit.z + nz * 0.7, ww, 0.04, dd, aw,
        alongZ ? { collide: false, rx: tilt * (nz > 0 ? 1 : -1) } : { collide: false, rz: -tilt * (nx > 0 ? 1 : -1) });
    } else {
      // hanging sign
      const mats = [dm.signRed, dm.signBlue, dm.signYellow];
      const mat = mats[Math.floor(rng() * mats.length)];
      const sx = alongZ ? 1.3 : 0.07, sz = alongZ ? 0.07 : 1.3;
      w.box(hit.x + nx * 0.75, 3.05, hit.z + nz * 0.75, sx, 0.6, sz, mat, { collide: false });
      w.box(hit.x + nx * 0.4, 3.4, hit.z + nz * 0.4, alongZ ? 0.05 : 0.8, 0.05, alongZ ? 0.8 : 0.05, m.metalGray, { collide: false });
    }
  }

  // posters and stencils at eye level
  const feet = w.footprints;
  let posters = 0;
  for (let tries = 0; tries < 160 && posters < 22; tries++) {
    const f = feet[Math.floor(rng() * feet.length)];
    const side = ['n', 's', 'w', 'e'][Math.floor(rng() * 4)];
    const [nx, nz] = N[side];
    const along = nx === 0 ? f.x0 + 1.5 + rng() * (f.x1 - f.x0 - 3) : f.z0 + 1.5 + rng() * (f.z1 - f.z0 - 3);
    const px = nx === 0 ? along : (nx < 0 ? f.x0 : f.x1), pz = nz === 0 ? along : (nz < 0 ? f.z0 : f.z1);
    const hit = w.mountOnWall(px, 1.55, pz, nx, nz);
    if (!hit) continue;
    // not on top of a window: make sure the wall is also there at the top of the poster
    if (!w.mountOnWall(px, 2.2, pz, nx, nz) || !w.mountOnWall(px, 0.9, pz, nx, nz)) continue;
    const yaw = Math.atan2(nx, nz);
    if (posters % 3 === 2) w.quad(dm.stencils[Math.floor(rng() * 3)], hit.x + nx * 0.014, 1.45, hit.z + nz * 0.014, 1.9, 0.72, yaw, 0, (rng() - 0.5) * 0.08);
    else w.quad(dm.posters[Math.floor(rng() * 3)], hit.x + nx * 0.014, 1.55, hit.z + nz * 0.014, 0.6, 0.9, yaw, 0, (rng() - 0.5) * 0.1);
    posters++;
  }

  // big billboard on the south face of the north-east office
  {
    const hit = w.mountOnWall(28, 5.4, -20, 0, 1, 4);
    if (hit) {
      w.box(hit.x, 5.4, hit.z + 0.12, 5.4, 2.8, 0.14, m.metalChar, { collide: false });
      w.quad(dm.posters[1], hit.x, 5.4, hit.z + 0.2, 5.0, 2.4, 0);
      for (const s of [-2, 2]) w.segment(m.metalGray, hit.x + s, 3.9, hit.z + 0.05, hit.x + s, 5.2, hit.z + 0.5, 0.06);
    }
  }

  // rebar and antennas sticking out of broken wall tops
  let rebar = 0;
  for (const f of feet) {
    for (let tries = 0; tries < 14 && rebar < 70; tries++) {
      const x = f.x0 + rng() * (f.x1 - f.x0), z = rng() < 0.5 ? (rng() < 0.5 ? f.z0 : f.z1) : f.z0 + rng() * (f.z1 - f.z0);
      const xx = rng() < 0.5 ? x : (rng() < 0.5 ? f.x0 : f.x1);
      const h = raycast(w.colliders, xx, 16, z, 0, -1, 0, 20, { noGround: true });
      if (!h || h.ny < 0.5 || h.y < 3) continue;
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const len = 0.7 + rng() * 1.4;
        const a = rng() * TAU, lean = (rng() - 0.5) * 0.5;
        w.segment(m.rebar, h.x + (rng() - 0.5) * 0.4, h.y, h.z + (rng() - 0.5) * 0.4,
          h.x + Math.cos(a) * lean * len, h.y + len, h.z + Math.sin(a) * lean * len, 0.03);
      }
      rebar++;
    }
  }

  // power cables from lamp posts to the nearest wall in each direction
  let cables = 0;
  for (const l of w.lampList || []) {
    if (l.fallen) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (rng() < 0.45 || cables > 26) continue;
      const h = raycast(w.colliders, l.x + dx * 0.3, 5.4, l.z + dz * 0.3, dx, 0, dz, 24, { noGround: true });
      if (!h || h.t < 4 || !h.box) continue;
      const ax = l.x, ay = 5.5, az = l.z, bx = h.x - dx * 0.05, by = 5.0 + rng() * 0.8, bz = h.z - dz * 0.05;
      const segs = 9, sag = 0.7 + h.t * 0.05;
      let px = ax, py = ay, pz = az;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = ay + (by - ay) * t - Math.sin(Math.PI * t) * sag;
        w.segment(dm.cable, px, py, pz, x, y, z, 0.025);
        px = x; py = y; pz = z;
      }
      cables++;
    }
  }

  // a lamp post leaning against a building with a cable hanging to the ground
  {
    const x = -33, z = 2;
    if (w.fits(x, z, 0.5, 0.5, 0.2)) {
      w.box(x, 2.8, z, 0.17, 5.8, 0.17, m.metalGray, { collide: false, rz: 0.3 });
      w.addCollider(makeBox(x, 0.9, z, 0.35, 1.8, 0.35, { kind: 'metal', blocksBullets: false }));
      let px = x - 1.7, py = 5.6, pz = z;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const cx = x - 1.7 - 0.6 * Math.sin(t * 2.2), cy = 5.6 * (1 - t) + 0.05, cz = z + 0.5 * Math.sin(t * 5);
        w.segment(dm.cable, px, py, pz, cx, cy, cz, 0.025);
        px = cx; py = cy; pz = cz;
      }
    }
  }

  w.detailStats = { acCount, curtainCount, sootCount, posters, rebar, cables };
}

// -------------------------------------------------------------- interiors
/**
 * Furniture and clutter inside every building: desks, cabinets, shelves, sofas, cots,
 * crates, benches, safes, trash. Placed along the inner walls, never in front of a door
 * or a breach, so the buildings stay walkable. Solid pieces are cover with colliders.
 */
export function addInteriors(w) {
  const m = w.m, dm = decorMaterials(w), rng = w.rng;
  const FLOOR = 0.03;
  const vis = (x, y, z, sx, sy, sz, mat, o = {}) => w.box(x, y, z, sx, sy, sz, mat, { collide: false, ...o });
  const solid = (x, y, z, sx, sy, sz, kind, o = {}) => w.addCollider(Object.assign(makeBox(x, y, z, sx, sy, sz, { kind }), o));
  const cloth = () => dm.tarp[Math.floor(rng() * dm.tarp.length)];

  function chair(x, z, yaw, tipped) {
    const lift = tipped ? 0.22 : 0;
    vis(x, FLOOR + 0.45 - (tipped ? 0.2 : 0), z, 0.42, 0.05, 0.42, m.woodDark, tipped ? { ry: yaw, rz: 0.5 } : { ry: yaw });
    vis(x, FLOOR + 0.72 - (tipped ? 0.4 : 0), z - (tipped ? 0 : 0.2), 0.42, 0.5, 0.04, m.woodDark, tipped ? { ry: yaw, rz: 1.45 } : { ry: yaw });
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
      vis(x + dx, FLOOR + 0.22 - lift * 0.5, z + dz, 0.04, 0.44, 0.04, m.metalGray, tipped ? { rz: 1.3 } : {});
    }
  }

  const TYPES = [
    { L: 1.5, D: 0.75, draw(x, z, ax) { // desk with papers and a chair
      const sx = ax ? 1.5 : 0.75, sz = ax ? 0.75 : 1.5;
      vis(x, FLOOR + 0.74, z, sx, 0.05, sz, m.woodDark);
      for (const s of [-1, 1]) vis(x + (ax ? s * 0.68 : 0), FLOOR + 0.36, z + (ax ? 0 : s * 0.68), ax ? 0.05 : 0.7, 0.72, ax ? 0.7 : 0.05, m.woodDark);
      vis(x + (rng() - 0.5) * 0.5, FLOOR + 0.775, z + (rng() - 0.5) * 0.25, 0.3, 0.012, 0.22, m.paintWhite, { ry: rng() * 3 });
      vis(x + (rng() - 0.5) * 0.5, FLOOR + 0.84, z + (rng() - 0.5) * 0.25, 0.14, 0.14, 0.14, m.metalChar, { ry: rng() * 3 });
      solid(x, FLOOR + 0.38, z, sx, 0.76, sz, 'wood');
      chair(x + (ax ? (rng() - 0.5) * 0.6 : 0.85), z + (ax ? 0.85 : (rng() - 0.5) * 0.6), rng() * 6, rng() < 0.4);
    } },
    { L: 1.1, D: 0.55, draw(x, z, ax) { // two filing cabinets
      for (const s of [-0.28, 0.28]) {
        const cx = x + (ax ? s : 0), cz = z + (ax ? 0 : s);
        vis(cx, FLOOR + 0.65, cz, ax ? 0.5 : 0.55, 1.3, ax ? 0.55 : 0.5, m.metalGray);
        for (let i = 0; i < 3; i++) vis(cx, FLOOR + 0.3 + i * 0.4, cz, ax ? 0.4 : 0.58, 0.03, ax ? 0.58 : 0.4, m.rubber);
      }
      solid(x, FLOOR + 0.65, z, ax ? 1.1 : 0.55, 1.3, ax ? 0.55 : 1.1, 'metal');
    } },
    { L: 1.7, D: 0.45, draw(x, z, ax) { // shelf unit with boxes
      const sx = ax ? 1.7 : 0.45, sz = ax ? 0.45 : 1.7;
      for (const s of [-0.82, 0.82]) vis(x + (ax ? s : 0), FLOOR + 0.95, z + (ax ? 0 : s), ax ? 0.05 : 0.45, 1.9, ax ? 0.45 : 0.05, m.woodDark);
      for (let i = 0; i < 4; i++) {
        vis(x, FLOOR + 0.1 + i * 0.55, z, sx, 0.04, sz, m.woodDark);
        if (rng() < 0.75) vis(x + (ax ? (rng() - 0.5) * 1.0 : 0), FLOOR + 0.2 + i * 0.55, z + (ax ? 0 : (rng() - 0.5) * 1.0), 0.35, 0.2, 0.3, m.wood, { ry: rng() * 0.5 });
        if (rng() < 0.5) vis(x + (ax ? (rng() - 0.5) * 1.2 : 0), FLOOR + 0.18 + i * 0.55, z + (ax ? 0 : (rng() - 0.5) * 1.2), 0.22, 0.16, 0.22, m.sandbag, { ry: rng() * 3 });
      }
      solid(x, FLOOR + 0.95, z, sx, 1.9, sz, 'wood', { blocksBullets: false });
    } },
    { L: 1.9, D: 0.9, draw(x, z, ax) { // sofa
      const sx = ax ? 1.9 : 0.9, sz = ax ? 0.9 : 1.9, mat = cloth();
      vis(x, FLOOR + 0.25, z, sx, 0.4, sz, mat);
      vis(x + (ax ? 0 : 0.36), FLOOR + 0.62, z + (ax ? 0.36 : 0), ax ? 1.9 : 0.18, 0.5, ax ? 0.18 : 1.9, mat);
      for (const s of [-1, 1]) vis(x + (ax ? s * 0.88 : 0), FLOOR + 0.42, z + (ax ? 0 : s * 0.88), ax ? 0.14 : 0.9, 0.3, ax ? 0.9 : 0.14, mat);
      vis(x + (ax ? (rng() - 0.5) * 0.8 : 0), FLOOR + 0.52, z + (ax ? 0 : (rng() - 0.5) * 0.8), 0.4, 0.12, 0.4, cloth(), { ry: rng() * 3, rz: 0.3 });
      solid(x, FLOOR + 0.3, z, sx, 0.6, sz, 'wood', { blocksBullets: false });
    } },
    { L: 1.9, D: 0.8, draw(x, z, ax) { // army cot
      const sx = ax ? 1.9 : 0.8, sz = ax ? 0.8 : 1.9;
      for (const [dx, dz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) vis(x + (ax ? dx : dz), FLOOR + 0.2, z + (ax ? dz : dx), 0.04, 0.4, 0.04, m.metalGray);
      vis(x, FLOOR + 0.4, z, sx, 0.04, sz, m.metalGray);
      vis(x, FLOOR + 0.46, z, sx - 0.06, 0.1, sz - 0.06, cloth());
      vis(x + (ax ? 0.7 : 0), FLOOR + 0.56, z + (ax ? 0 : 0.7), 0.4, 0.1, 0.34, m.paintWhite, { rz: 0.1 });
      solid(x, FLOOR + 0.25, z, sx, 0.5, sz, 'metal', { blocksBullets: false });
    } },
    { L: 1.1, D: 1.0, draw(x, z) { // stacked crates and a loose box
      vis(x - 0.1, FLOOR + 0.3, z, 0.7, 0.6, 0.7, m.wood, { ry: (rng() - 0.5) * 0.4 });
      vis(x - 0.05, FLOOR + 0.78, z + 0.02, 0.55, 0.36, 0.55, m.woodDark, { ry: (rng() - 0.5) * 0.7 });
      vis(x + 0.4, FLOOR + 0.18, z + 0.1, 0.36, 0.36, 0.36, m.wood, { ry: rng() * 3 });
      solid(x, FLOOR + 0.5, z, 1.0, 1.0, 0.9, 'wood');
    } },
    { L: 0.9, D: 0.7, draw(x, z) { // two oil barrels
      w.cylinder(x - 0.22, FLOOR + 0.45, z, 0.27, 0.9, m.metalGreen, 12);
      w.cylinder(x + 0.25, FLOOR + 0.45, z + 0.08, 0.27, 0.9, m.metalRed, 12);
      vis(x - 0.22, FLOOR + 0.92, z, 0.5, 0.04, 0.5, m.metalGreen);
      solid(x, FLOOR + 0.45, z, 0.95, 0.9, 0.7, 'metal');
    } },
    { L: 1.8, D: 0.65, draw(x, z, ax) { // workbench with tools
      const sx = ax ? 1.8 : 0.65, sz = ax ? 0.65 : 1.8;
      vis(x, FLOOR + 0.9, z, sx, 0.06, sz, m.wood);
      vis(x, FLOOR + 0.25, z, sx - 0.1, 0.04, sz - 0.1, m.woodDark);
      for (const [dx, dz] of [[-0.85, -0.28], [0.85, -0.28], [-0.85, 0.28], [0.85, 0.28]]) vis(x + (ax ? dx : dz), FLOOR + 0.45, z + (ax ? dz : dx), 0.07, 0.9, 0.07, m.metalGray);
      vis(x + (ax ? -0.6 : 0), FLOOR + 1.0, z + (ax ? 0 : -0.6), 0.14, 0.16, 0.14, m.metalChar);
      vis(x + (ax ? 0.2 : 0), FLOOR + 0.95, z + (ax ? 0 : 0.2), 0.34, 0.05, 0.1, m.rebar, { ry: rng() * 3 });
      vis(x + (ax ? 0.55 : 0), FLOOR + 0.36, z + (ax ? 0 : 0.55), 0.3, 0.2, 0.3, m.woodDark, { ry: rng() * 3 });
      solid(x, FLOOR + 0.48, z, sx, 0.96, sz, 'wood', { blocksBullets: false });
    } },
    { L: 0.6, D: 0.6, draw(x, z) { // safe with a dented door
      vis(x, FLOOR + 0.4, z, 0.6, 0.8, 0.6, m.metalGreen);
      vis(x + 0.31, FLOOR + 0.45, z, 0.03, 0.5, 0.5, m.metalChar, { ry: 0.1 });
      solid(x, FLOOR + 0.4, z, 0.6, 0.8, 0.6, 'metal');
    } },
    { L: 1.0, D: 1.0, draw(x, z) { // heap of rubbish
      for (let i = 0; i < 7; i++) {
        const a = rng() * TAU, r = rng() * 0.35, s = 0.16 + rng() * 0.3;
        vis(x + Math.cos(a) * r, FLOOR + s * 0.4, z + Math.sin(a) * r, s, s * 0.8, s * (0.7 + rng() * 0.6),
          i % 3 === 0 ? m.rubber : (i % 3 === 1 ? m.sandbag : m.woodDark), { ry: rng() * 3, rx: rng() * 0.6, rz: rng() * 0.6 });
      }
    } },
    { L: 0.5, D: 0.5, draw(x, z) { // toppled chair
      chair(x, z, rng() * 6, true);
    } },
  ];

  // Like w.fits, but upper floors and ceilings (above head height) do not count.
  const roomFor = (cx, cz, sw, sd, pad) => {
    const x0 = cx - sw / 2 - pad, x1 = cx + sw / 2 + pad, z0 = cz - sd / 2 - pad, z1 = cz + sd / 2 + pad;
    for (const c of w.colliders) {
      if (c.maxY < 0.12 || c.minY > 2.0) continue;
      if (c.maxX > x0 && c.minX < x1 && c.maxZ > z0 && c.minZ < z1) return false;
    }
    return true;
  };

  // The area in front of every door and breach stays free.
  const clear = (fp, x0, x1, z0, z1) => {
    for (const o of w.openings) {
      if (o.x0 !== fp.x0 || o.z0 !== fp.z0) continue;
      let ax0, ax1, az0, az1;
      if (o.side === 'n') { ax0 = o.from - 0.8; ax1 = o.to + 0.8; az0 = fp.z0; az1 = fp.z0 + 2.7; }
      else if (o.side === 's') { ax0 = o.from - 0.8; ax1 = o.to + 0.8; az0 = fp.z1 - 2.7; az1 = fp.z1; }
      else if (o.side === 'w') { az0 = o.from - 0.8; az1 = o.to + 0.8; ax0 = fp.x0; ax1 = fp.x0 + 2.7; }
      else { az0 = o.from - 0.8; az1 = o.to + 0.8; ax0 = fp.x1 - 2.7; ax1 = fp.x1; }
      if (x1 > ax0 && x0 < ax1 && z1 > az0 && z0 < az1) return false;
    }
    return true;
  };

  /**
   * After a tentative piece of furniture was added to the nav grid: is any interior cell that
   * the player could walk to before now cut off? Flood fill inside a window around the building,
   * seeded from every cell outside it that was reachable before.
   */
  const cutsOffInterior = (fp, reachBefore) => {
    const nav = w.nav, n = nav.n;
    const cx0 = Math.max(0, nav.toCell(fp.x0 - 3)), cx1 = Math.min(n - 1, nav.toCell(fp.x1 + 3));
    const cz0 = Math.max(0, nav.toCell(fp.z0 - 3)), cz1 = Math.min(n - 1, nav.toCell(fp.z1 + 3));
    const inside = (cx, cz) => {
      const x = nav.toWorld(cx), z = nav.toWorld(cz);
      return x > fp.x0 + 0.45 && x < fp.x1 - 0.45 && z > fp.z0 + 0.45 && z < fp.z1 - 0.45;
    };
    const seen = new Uint8Array(n * n);
    const queue = [];
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = nav.idx(cx, cz);
        if (reachBefore[i] && !inside(cx, cz) && !nav.blockedCell(cx, cz)) { seen[i] = 1; queue.push(i); }
      }
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi], cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < cx0 || nx > cx1 || nz < cz0 || nz > cz1 || nav.blockedCell(nx, nz)) continue;
          if (dx && dz && (nav.blockedCell(cx + dx, cz) || nav.blockedCell(cx, cz + dz))) continue;
          const ni = nav.idx(nx, nz);
          if (seen[ni]) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
    }
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = nav.idx(cx, cz);
        if (reachBefore[i] && inside(cx, cz) && !nav.blockedCell(cx, cz) && !seen[i]) return true;
      }
    }
    return false;
  };

  const T = 0.5;
  for (const fp of w.footprints) {
    const ix0 = fp.x0 + T, ix1 = fp.x1 - T, iz0 = fp.z0 + T, iz1 = fp.z1 - T;
    if (ix1 - ix0 < 3 || iz1 - iz0 < 3) continue;
    const want = Math.round(((ix1 - ix0) * (iz1 - iz0)) / 5);
    let placed = 0;
    const reachBefore = w.nav.reachableFrom(w.playerStart.x, w.playerStart.z);
    for (let tries = 0; placed < want && tries < want * 14; tries++) {
      const type = TYPES[Math.floor(rng() * TYPES.length)];
      let x, z, ax;
      if (rng() < 0.18) { // free standing in the room
        x = ix0 + 1.2 + rng() * (ix1 - ix0 - 2.4); z = iz0 + 1.2 + rng() * (iz1 - iz0 - 2.4); ax = rng() < 0.5;
      } else {
        const side = Math.floor(rng() * 4);
        ax = side < 2;
        const f = rng();
        const hd = type.D / 2 + 0.06;
        if (side === 0) { x = ix0 + 0.7 + f * (ix1 - ix0 - 1.4); z = iz0 + hd; }
        else if (side === 1) { x = ix0 + 0.7 + f * (ix1 - ix0 - 1.4); z = iz1 - hd; }
        else if (side === 2) { z = iz0 + 0.7 + f * (iz1 - iz0 - 1.4); x = ix0 + hd; }
        else { z = iz0 + 0.7 + f * (iz1 - iz0 - 1.4); x = ix1 - hd; }
      }
      const sw = ax ? type.L : type.D, sd = ax ? type.D : type.L;
      if (!clear(fp, x - sw / 2, x + sw / 2, z - sd / 2, z + sd / 2)) continue;
      if (!roomFor(x, z, sw, sd, 0.4)) continue;
      // try the piece in the nav grid first: it must not cut off any part of the interior
      const trial = makeBox(x, 0.6, z, sw, 1.2, sd, { kind: 'wood' });
      w.nav.addBox(trial);
      const sealed = cutsOffInterior(fp, reachBefore);
      w.nav.removeBox(trial);
      if (sealed) continue;
      type.draw(x, z, ax);
      placed++;
    }
    // loose papers and debris on the floor
    for (let i = 0; i < 14; i++) {
      const x = ix0 + 0.4 + rng() * (ix1 - ix0 - 0.8), z = iz0 + 0.4 + rng() * (iz1 - iz0 - 0.8);
      vis(x, FLOOR + 0.008, z, 0.22 + rng() * 0.12, 0.012, 0.16 + rng() * 0.1, i % 4 === 0 ? m.sandbag : m.paintWhite, { ry: rng() * 3 });
    }
  }
}
