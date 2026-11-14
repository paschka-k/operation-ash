// Visual effects: GPU point particles, bullet decals, tracers, shell casings,
// muzzle flashes, explosions, fire, and a fixed pool of dynamic lights.
// Everything is pooled so nothing is allocated during fights.

import * as THREE from 'three';

const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();

// ------------------------------------------------------------ textures
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function puffTexture() {
  return canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * s * 0.28;
      const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d, r = s * (0.1 + rnd() * 0.14);
      const gg = g.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, 'rgba(255,255,255,0.28)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gg;
      g.fillRect(0, 0, s, s);
    }
  });
}

function sparkTexture() {
  return canvasTex(32, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

function holeTexture() {
  return canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    const halo = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    halo.addColorStop(0, 'rgba(10,8,6,0.85)');
    halo.addColorStop(0.35, 'rgba(25,20,16,0.5)');
    halo.addColorStop(1, 'rgba(25,20,16,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(10,8,6,0.55)';
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, l = s * (0.18 + rnd() * 0.3);
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath();
      g.moveTo(s / 2 + Math.cos(a) * 6, s / 2 + Math.sin(a) * 6);
      g.lineTo(s / 2 + Math.cos(a + rr(-0.3, 0.3)) * l, s / 2 + Math.sin(a + rr(-0.3, 0.3)) * l);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,1)';
    g.beginPath();
    g.arc(s / 2, s / 2, 6.5, 0, Math.PI * 2);
    g.fill();
  });
}

function scorchTexture() {
  return canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(8,6,5,0.92)');
    grad.addColorStop(0.55, 'rgba(14,11,9,0.62)');
    grad.addColorStop(1, 'rgba(14,11,9,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * s * 0.42, r = 2 + rnd() * 9;
      g.fillStyle = 'rgba(6,5,4,' + (0.2 + rnd() * 0.4) + ')';
      g.beginPath();
      g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function flashTexture() {
  return canvasTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    const core = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.32);
    core.addColorStop(0, 'rgba(255,255,235,1)');
    core.addColorStop(0.4, 'rgba(255,200,110,0.85)');
    core.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.3, l = s * (0.28 + rnd() * 0.2);
      g.save();
      g.translate(s / 2, s / 2);
      g.rotate(a);
      const gr = g.createLinearGradient(0, 0, l, 0);
      gr.addColorStop(0, 'rgba(255,230,160,0.95)');
      gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -s * 0.035);
      g.lineTo(l, 0);
      g.lineTo(0, s * 0.035);
      g.closePath();
      g.fill();
      g.restore();
    }
  });
}

// ----------------------------------------------------------- particles
const PARTICLE_VS = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 220.0);
    vColor = aColor;
    vAlpha = aAlpha;
  }`;
const PARTICLE_FS = /* glsl */`
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    float a = t.a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * (0.6 + 0.4 * t.r), a);
  }`;

class ParticlePool {
  constructor(scene, capacity, additive, texture) {
    this.n = capacity;
    this.next = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.a0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.bounce = new Float32Array(capacity);
    this.aSize = new Float32Array(capacity);
    this.aAlpha = new Float32Array(capacity);
    this.aColor = new Float32Array(capacity * 3);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    this.sizeAttr = new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.aColor, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setAttribute('aAlpha', this.alphaAttr);
    geo.setAttribute('aColor', this.colorAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uScale: { value: 800 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, alpha, grav = 0, drag = 0, bounce = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = size0; this.s1[i] = size1;
    this.aColor[k] = r; this.aColor[k + 1] = g; this.aColor[k + 2] = b;
    this.a0[i] = alpha; this.grav[i] = grav; this.drag[i] = drag; this.bounce[i] = bounce;
  }

  update(dt) {
    const { pos, vel, life, maxLife, s0, s1, a0, grav, drag, bounce, aSize, aAlpha } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) { aAlpha[i] = 0; continue; }
      life[i] -= dt;
      if (life[i] <= 0) { aAlpha[i] = 0; aSize[i] = 0; continue; }
      const k = i * 3;
      if (drag[i] > 0) {
        const f = Math.exp(-drag[i] * dt);
        vel[k] *= f; vel[k + 1] *= f; vel[k + 2] *= f;
      }
      vel[k + 1] -= grav[i] * dt;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      if (pos[k + 1] < 0.02) {
        if (bounce[i] > 0) {
          pos[k + 1] = 0.02;
          vel[k + 1] = Math.abs(vel[k + 1]) * bounce[i];
          vel[k] *= 0.6; vel[k + 2] *= 0.6;
        } else if (grav[i] > 0) {
          pos[k + 1] = 0.02; vel[k] = vel[k + 1] = vel[k + 2] = 0;
        }
      }
      const t = 1 - life[i] / maxLife[i];
      aSize[i] = s0[i] + (s1[i] - s0[i]) * t;
      const ramp = Math.min(1, 0.35 + t * 12);
      const fall = 1 - t;
      aAlpha[i] = a0[i] * ramp * fall * Math.sqrt(fall);
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.aAlpha.fill(0); }
}

// ---------------------------------------------------------------- FX
const SURFACE = {
  concrete: { dust: [0.62, 0.58, 0.52], chip: [0.34, 0.32, 0.3], decal: 0.9 },
  plaster: { dust: [0.68, 0.64, 0.56], chip: [0.5, 0.46, 0.4], decal: 0.8 },
  brick: { dust: [0.56, 0.42, 0.35], chip: [0.45, 0.2, 0.14], decal: 0.9 },
  metal: { dust: [0.3, 0.3, 0.3], chip: [0.4, 0.4, 0.4], sparks: true, decal: 1.0 },
  wood: { dust: [0.5, 0.4, 0.3], chip: [0.55, 0.38, 0.22], decal: 0.8 },
  dirt: { dust: [0.5, 0.42, 0.33], chip: [0.35, 0.28, 0.2], decal: 0.5 },
  asphalt: { dust: [0.4, 0.38, 0.36], chip: [0.2, 0.2, 0.2], decal: 0.7 },
  sand: { dust: [0.6, 0.52, 0.38], chip: [0.5, 0.42, 0.3], decal: 0.4 },
  flesh: { dust: [0.5, 0.02, 0.02], chip: [0.45, 0.02, 0.02], decal: 0 },
};

export class FX {
  constructor(game) {
    this.game = game;
    const gr = game.gr;
    this.gr = gr;
    this.scene = gr.scene;
    this.quality = gr.q.particles;

    const puff = puffTexture();
    const spark = sparkTexture();
    this.smoke = new ParticlePool(this.scene, 1400, false, puff);
    this.glow = new ParticlePool(this.scene, 1000, true, spark);
    this.flames = new ParticlePool(this.scene, 500, true, puff);

    this._buildDecals();
    this._buildTracers();
    this._buildCasings();
    this._buildFlashes();
    this._buildLights();
    this._buildRings();
    this._buildDust();
    this._buildLasers();

    this.fires = [];
    this.tmpM = new THREE.Matrix4();
    this.tmpQ = new THREE.Quaternion();
    this.tmpQ2 = new THREE.Quaternion();
    this.tmpV = new THREE.Vector3();
    this.tmpS = new THREE.Vector3();
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.time = 0;
  }

  setQuality(q) { this.quality = q; }

  // names of the effects contract
  spawnImpact(point, normal, surface) { this.impact(surface, point.x, point.y, point.z, normal.x, normal.y, normal.z, true); }
  spawnExplosion(center, scale = 1) { this.explosion(center.x, center.y, center.z, scale); }
  spawnTracer(a, b) { this.tracer(a.x, a.y, a.z, b.x, b.y, b.z); }
  dispose() {
    this.clear();
    for (const pool of [this.smoke, this.glow, this.flames]) { this.scene.remove(pool.points); pool.points.geometry.dispose(); }
    this.scene.remove(this.dust);
  }

  // ------------------------------------------------------------ decals
  _buildDecals() {
    const holeTex = holeTexture();
    const scorchTex = scorchTexture();
    const mk = (tex, cap) => {
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      this.gr.prepareMaterial(mat);
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, zero);
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this.gr.addNoAO(mesh);
      return { mesh, cap, next: 0 };
    };
    this.holes = mk(holeTex, 160);
    this.marks = mk(scorchTex, 24);
  }

  decal(pool, x, y, z, nx, ny, nz, size, shade = 1) {
    const q = this.tmpQ, q2 = this.tmpQ2, v = this.tmpV;
    v.set(nx, ny, nz).normalize();
    q.setFromUnitVectors(this.zAxis, v);
    q2.setFromAxisAngle(this.zAxis, rnd() * Math.PI * 2);
    q.multiply(q2);
    this.tmpS.set(size, size, 1);
    this.tmpM.compose(new THREE.Vector3(x + v.x * 0.004, y + v.y * 0.004, z + v.z * 0.004), q, this.tmpS);
    pool.mesh.setMatrixAt(pool.next, this.tmpM);
    pool.mesh.setColorAt(pool.next, new THREE.Color(shade, shade, shade));
    pool.next = (pool.next + 1) % pool.cap;
    pool.mesh.instanceMatrix.needsUpdate = true;
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }

  // ----------------------------------------------------------- tracers
  _buildTracers() {
    this.tracers = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, -0.5); // origin at the start, extends toward -z
    for (let i = 0; i < 32; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, toneMapped: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 13;
      this.scene.add(m);
      this.gr.addNoAO(m);
      this.tracers.push({ mesh: m, life: 0, maxLife: 0.07 });
    }
    this.tracerNext = 0;
  }

  /** Draw a short bright streak from a to b (arrays or objects with x,y,z). */
  tracer(ax, ay, az, bx, by, bz, color = 0xffd9a0, width = 0.014) {
    const t = this.tracers[this.tracerNext];
    this.tracerNext = (this.tracerNext + 1) % this.tracers.length;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    // streak covers only a part of the path, as a fast moving round
    const streak = Math.min(len, 6 + rnd() * 4);
    const off = rnd() * Math.max(0, len - streak) * 0.5;
    const k0 = off / len;
    t.mesh.position.set(ax + dx * k0, ay + dy * k0, az + dz * k0);
    t.mesh.lookAt(bx, by, bz);
    t.mesh.scale.set(width, width, streak);
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 0.95;
    t.mesh.visible = true;
    t.life = t.maxLife = 0.06 + rnd() * 0.03;
  }

  // ----------------------------------------------------------- casings
  _buildCasings() {
    this.casings = [];
    const geo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc09a4a, metalness: 1, roughness: 0.35 });
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.castShadow = false;
      this.scene.add(m);
      this.gr.addNoAO(m);
      this.casings.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
    this.casingNext = 0;
  }

  casing(x, y, z, vx, vy, vz) {
    const c = this.casings[this.casingNext];
    this.casingNext = (this.casingNext + 1) % this.casings.length;
    c.mesh.position.set(x, y, z);
    c.mesh.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    c.vel.set(vx, vy, vz);
    c.spin.set(rr(-30, 30), rr(-30, 30), rr(-30, 30));
    c.life = 3;
    c.mesh.visible = true;
  }

  // ----------------------------------------------------- enemy flashes
  _buildFlashes() {
    this.flashes = [];
    const tex = flashTexture();
    this.flashTex = tex;
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false, toneMapped: false, opacity: 1,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 14;
      this.scene.add(m);
      this.gr.addNoAO(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
    this.flashNext = 0;
  }

  /** Muzzle flash in the world, used for enemies. */
  enemyFlash(x, y, z, size = 0.4) {
    const f = this.flashes[this.flashNext];
    this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.setScalar(size * rr(0.8, 1.2));
    f.mesh.rotation.z = rnd() * 6.28;
    f.mesh.visible = true;
    f.life = 0.055;
    f.mesh.quaternion.copy(this.gr.camera.quaternion);
    f.mesh.rotateZ(rnd() * 6.28);
  }

  // ------------------------------------------------------------ lights
  _buildLights() {
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 18, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.lights.push({ light: l, life: 0, maxLife: 1, peak: 0, hold: false });
    }
  }

  /** Short lived dynamic light. Returns the pool entry. */
  flashLight(x, y, z, color, intensity, duration, distance = 16) {
    let best = this.lights[0];
    for (const l of this.lights) {
      if (l.life <= 0) { best = l; break; }
      if (l.life < best.life) best = l;
    }
    best.light.position.set(x, y, z);
    best.light.color.setHex(color);
    best.light.distance = distance;
    best.peak = intensity;
    best.light.intensity = intensity;
    best.life = best.maxLife = duration;
    best.hold = false;
    return best;
  }

  // -------------------------------------------------------------- rings
  _buildRings() {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.82, 1, 56);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd9b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 13;
      this.scene.add(m);
      this.gr.addNoAO(m);
      this.rings.push({ mesh: m, life: 0, maxLife: 0.4, radius: 6 });
    }
    this.ringNext = 0;
  }

  // ------------------------------------------------- aim warning lasers
  _buildLasers() {
    this.lasers = [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, -0.5);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff2a1a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, toneMapped: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 13;
      this.scene.add(m);
      this.gr.addNoAO(m);
      this.lasers.push({ mesh: m, touched: false });
    }
  }

  /** Thin red beam from a bot to its target, shown while it aims. */
  laser(slot, ax, ay, az, bx, by, bz, alpha = 1) {
    const l = this.lasers[slot % this.lasers.length];
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    l.mesh.position.set(ax, ay, az);
    l.mesh.lookAt(bx, by, bz);
    l.mesh.scale.set(0.012, 0.012, Math.min(len, 70));
    l.mesh.material.opacity = 0.55 * alpha;
    l.mesh.visible = true;
    l.touched = true;
  }

  // -------------------------------------------------------- floating dust
  _buildDust() {
    const n = 260;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rnd() * 40; pos[i * 3 + 1] = rnd() * 12; pos[i * 3 + 2] = rnd() * 40;
      seed[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uScale: { value: 800 }, uMap: { value: sparkTexture() } },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform vec3 uCam; uniform float uTime; uniform float uScale;
        varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.15 + aSeed * 40.0) * 1.5, uTime * 0.05 * (0.3 + aSeed), cos(uTime * 0.12 + aSeed * 31.0) * 1.5);
          vec3 rel = mod(p - uCam + vec3(20.0, 6.0, 20.0), vec3(40.0, 12.0, 40.0)) - vec3(20.0, 6.0, 20.0);
          vec3 wp = uCam + rel;
          wp.y = max(wp.y, 0.1) ;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp((0.022 + aSeed * 0.02) * uScale / max(0.2, d), 1.0, 7.0);
          vA = smoothstep(26.0, 3.0, d) * (0.25 + 0.5 * aSeed) * smoothstep(0.0, 1.5, wp.y);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; varying float vA;
        void main() { float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(1.0, 0.9, 0.72, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 10;
    this.scene.add(this.dust);
  }

  // -------------------------------------------------------- emit helpers
  _n(count) { return Math.max(1, Math.round(count * this.quality)); }

  /** Impact on a surface. kind is a SURFACE key. */
  impact(kind, x, y, z, nx, ny, nz, withDecal = true) {
    const s = SURFACE[kind] || SURFACE.concrete;
    const [dr, dg, db] = s.dust;
    const [cr, cg, cb] = s.chip;
    // dust puffs
    for (let i = 0, n = this._n(kind === 'flesh' ? 5 : 5); i < n; i++) {
      this.smoke.emit(
        x, y, z,
        nx * rr(0.4, 1.4) + rr(-0.5, 0.5), ny * rr(0.4, 1.4) + rr(0, 0.6), nz * rr(0.4, 1.4) + rr(-0.5, 0.5),
        rr(0.5, 1.0), 0.06, rr(0.35, 0.7), dr, dg, db, kind === 'flesh' ? 0.5 : 0.42, -0.1, 2.2,
      );
    }
    // chips
    for (let i = 0, n = this._n(7); i < n; i++) {
      const sp = rr(2, 6);
      this.smoke.emit(
        x, y, z,
        (nx + rr(-0.7, 0.7)) * sp, (ny + rr(-0.2, 0.9)) * sp, (nz + rr(-0.7, 0.7)) * sp,
        rr(0.4, 0.9), 0.028, 0.02, cr, cg, cb, 0.95, 14, 0.4, 0.35,
      );
    }
    if (s.sparks) {
      for (let i = 0, n = this._n(12); i < n; i++) {
        const sp = rr(3, 9);
        this.glow.emit(
          x, y, z,
          (nx + rr(-0.8, 0.8)) * sp, (ny + rr(-0.3, 0.9)) * sp, (nz + rr(-0.8, 0.8)) * sp,
          rr(0.15, 0.45), 0.05, 0.015, 1.0, rr(0.55, 0.85), 0.25, 1, 12, 0.3, 0.4,
        );
      }
      this.glow.emit(x, y, z, 0, 0, 0, 0.06, 0.28, 0.05, 1, 0.85, 0.5, 0.9);
    } else if (kind !== 'flesh') {
      this.glow.emit(x, y, z, 0, 0, 0, 0.05, 0.18, 0.03, 1, 0.8, 0.5, 0.45);
    }
    if (withDecal && s.decal > 0) {
      this.decal(this.holes, x, y, z, nx, ny, nz, rr(0.09, 0.15), 1 - s.decal * 0.0 );
    }
  }

  blood(x, y, z, dx, dy, dz, amount = 1) {
    for (let i = 0, n = this._n(8 * amount); i < n; i++) {
      this.smoke.emit(
        x, y, z, dx * rr(1, 3) + rr(-1.2, 1.2), dy * rr(1, 3) + rr(0, 1.8), dz * rr(1, 3) + rr(-1.2, 1.2),
        rr(0.35, 0.8), 0.04, 0.03, 0.5, 0.02, 0.02, 0.95, 13, 0.3, 0.1,
      );
    }
    for (let i = 0, n = this._n(3 * amount); i < n; i++) {
      this.smoke.emit(x, y, z, dx * 0.6 + rr(-0.3, 0.3), 0.3 + rnd() * 0.4, dz * 0.6 + rr(-0.3, 0.3), rr(0.4, 0.8), 0.1, 0.38, 0.38, 0.02, 0.02, 0.4, 0, 1.8);
    }
  }

  /** Puff of smoke at the muzzle. */
  muzzleSmoke(x, y, z, dx, dy, dz) {
    for (let i = 0, n = this._n(2); i < n; i++) {
      this.smoke.emit(x, y, z, dx * rr(0.6, 1.8) + rr(-0.1, 0.1), dy * rr(0.6, 1.8) + rr(0, 0.25), dz * rr(0.6, 1.8) + rr(-0.1, 0.1), rr(0.5, 0.9), 0.05, 0.28, 0.75, 0.72, 0.68, 0.22, -0.2, 1.5);
    }
  }

  explosion(x, y, z, scale = 1) {
    const g = this.glow, f = this.flames, s = this.smoke;
    for (let i = 0, n = this._n(34); i < n; i++) {
      const a = rnd() * Math.PI * 2, e = rr(-0.1, 1), sp = rr(2, 8) * scale;
      f.emit(x, y + 0.4, z, Math.cos(a) * sp * (1 - e * 0.4), e * sp * 0.9 + 1.2, Math.sin(a) * sp * (1 - e * 0.4),
        rr(0.35, 0.8), 0.7 * scale, 2.8 * scale, 1.0, rr(0.45, 0.75), 0.15, 0.9, -1.0, 2.2);
    }
    for (let i = 0, n = this._n(26); i < n; i++) {
      const a = rnd() * Math.PI * 2, e = rr(0, 1), sp = rr(1.5, 6) * scale;
      s.emit(x, y + 0.5, z, Math.cos(a) * sp, e * sp * 1.3 + 1, Math.sin(a) * sp,
        rr(1.8, 3.4), 0.8 * scale, 3.6 * scale, 0.1, 0.095, 0.09, 0.55, -0.5, 1.1);
    }
    for (let i = 0, n = this._n(40); i < n; i++) {
      const a = rnd() * Math.PI * 2, e = rr(0.1, 1), sp = rr(6, 17) * scale;
      g.emit(x, y + 0.4, z, Math.cos(a) * sp, e * sp, Math.sin(a) * sp, rr(0.5, 1.2), 0.09, 0.02, 1, rr(0.5, 0.85), 0.2, 1, 14, 0.3, 0.45);
    }
    for (let i = 0, n = this._n(16); i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = rr(3, 9) * scale;
      s.emit(x, y + 0.3, z, Math.cos(a) * sp, rr(3, 9) * scale, Math.sin(a) * sp, rr(0.9, 1.7), 0.07, 0.05, 0.12, 0.1, 0.09, 0.95, 16, 0.2, 0.3);
    }
    g.emit(x, y + 0.6, z, 0, 0, 0, 0.16, 3 * scale, 6 * scale, 1, 0.9, 0.65, 0.9);
    this.flashLight(x, y + 1.2, z, 0xffa050, 90 * scale, 0.7, 28);
    const r = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.mesh.position.set(x, 0.2, z);
    r.mesh.visible = true;
    r.life = r.maxLife = 0.45;
    r.radius = 7 * scale;
    this.decal(this.marks, x, 0.01, z, 0, 1, 0, 5.5 * scale, 1);
  }

  /** Continuous fire. duration < 0 means forever. */
  fire(x, y, z, scale = 1, duration = -1, light = false) {
    const f = { x, y, z, scale, until: duration < 0 ? Infinity : this.time + duration, acc: 0, accSmoke: 0, light: null };
    if (light) {
      f.light = this.flashLight(x, y + 0.9, z, 0xff8a30, 7 * scale, 1, 12);
      f.light.hold = true;
    }
    this.fires.push(f);
    return f;
  }

  // ---- wave 13: the flamethrower's stream and things on fire
  /**
   * One tick of a flame stream from the nozzle (x, y, z) along the unit vector d. Puffs slow down
   * by drag and die where `reach` metres are covered, so the fire stops at a wall it hits.
   * vx, vz: the shooter's velocity, carried by the stream.
   */
  flameStream(x, y, z, dx, dy, dz, reach, vx = 0, vz = 0) {
    const f = this.flames, D = 1.6;
    for (let i = 0, n = this._n(11); i < n; i++) {
      const v = rr(15, 19), k = Math.min(0.92, (reach * rr(0.85, 1.05) * D) / v);
      const life = -Math.log(1 - k) / D;                 // time to cover the reach at this speed and drag
      const j = 0.08;
      f.emit(x, y, z,
        dx * v + rr(-j, j) * v + vx * 0.6, dy * v + rr(-j, j) * v + 0.4, dz * v + rr(-j, j) * v + vz * 0.6,
        life, rr(0.08, 0.14), rr(1.0, 1.7), 1.0, rr(0.38, 0.6), rr(0.08, 0.16), rr(0.8, 1.0), -2.2, D);
    }
    // a hot, nearly white core over the first metres and a few sparks
    for (let i = 0; i < 2; i++) {
      const v = rr(10, 14);
      this.glow.emit(x, y, z, dx * v, dy * v, dz * v, rr(0.1, 0.16), 0.1, 0.55, 1, rr(0.75, 0.9), 0.45, 0.85, 0, 3);
    }
    if (rnd() < 0.5 * this.quality) this.glow.emit(x, y, z, dx * 14 + rr(-2, 2), dy * 14 + rr(-1, 2), dz * 14 + rr(-2, 2), rr(0.4, 0.7), 0.04, 0.01, 1, rr(0.5, 0.8), 0.2, 1, 6, 0.6);
    if (rnd() < 0.35 * this.quality) {
      const t = reach * rr(0.6, 1);
      this.smoke.emit(x + dx * t, y + dy * t + 0.3, z + dz * t, rr(-0.3, 0.3), rr(0.8, 1.6), rr(-0.3, 0.3), rr(1.4, 2.4), 0.4, 1.8, 0.09, 0.085, 0.08, 0.32, -0.3, 0.6);
    }
  }

  /** The stream splashing on a surface: flames spreading along it. */
  flameSplash(x, y, z, nx, ny, nz) {
    for (let i = 0, n = this._n(2); i < n; i++) {
      this.flames.emit(x + nx * 0.15, y + ny * 0.15, z + nz * 0.15, nx * 1.2 + rr(-1.5, 1.5), ny * 1.2 + rr(0.2, 1.4), nz * 1.2 + rr(-1.5, 1.5),
        rr(0.3, 0.6), 0.3, 0.7, 1, rr(0.4, 0.6), 0.12, 0.8, -1.5, 1.2);
    }
  }

  /** Flames licking up a burning body standing at (x, y, z). Call every frame it burns. */
  burning(x, y, z, scale = 1, dt = 1 / 60) {
    this._burnAcc = (this._burnAcc || 0) + dt * 30 * this.quality;
    while (this._burnAcc > 1) {
      this._burnAcc -= 1;
      this.flames.emit(x + rr(-0.22, 0.22) * scale, y + rr(0.2, 1.5) * scale, z + rr(-0.22, 0.22) * scale,
        rr(-0.2, 0.2), rr(0.9, 1.9), rr(-0.2, 0.2), rr(0.3, 0.6), 0.26 * scale, 0.06, 1, rr(0.35, 0.6), 0.1, 0.8, -0.6, 0.8);
      if (rnd() < 0.2) this.smoke.emit(x, y + 1.7 * scale, z, rr(-0.2, 0.2), rr(0.8, 1.4), rr(-0.2, 0.2), rr(1.2, 2), 0.3, 1.2, 0.1, 0.095, 0.09, 0.3, -0.3, 0.5);
    }
  }

  clearFires() {
    for (const f of this.fires) if (f.light) { f.light.hold = false; f.light.life = 0; f.light.light.intensity = 0; }
    this.fires.length = 0;
  }

  clear() {
    this.smoke.clear(); this.glow.clear(); this.flames.clear();
    this.clearFires();
    for (const t of this.tracers) { t.mesh.visible = false; t.life = 0; }
    for (const c of this.casings) { c.mesh.visible = false; c.life = 0; }
    for (const f of this.flashes) { f.mesh.visible = false; f.life = 0; }
    for (const r of this.rings) { r.mesh.visible = false; r.life = 0; }
    for (const l of this.lasers) { l.mesh.visible = false; l.touched = false; }
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; l.hold = false; }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of [this.holes, this.marks]) {
      for (let i = 0; i < p.cap; i++) p.mesh.setMatrixAt(i, zero);
      p.mesh.instanceMatrix.needsUpdate = true;
      p.next = 0;
    }
  }

  // ------------------------------------------------------------- update
  update(dt) {
    this.time += dt;
    const cam = this.gr.camera;
    const bufH = this.gr.height * this.gr.pr;
    const scale = bufH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    this.smoke.material.uniforms.uScale.value = scale;
    this.glow.material.uniforms.uScale.value = scale;
    this.flames.material.uniforms.uScale.value = scale;
    this.dustMat.uniforms.uScale.value = scale;
    this.dustMat.uniforms.uCam.value.copy(cam.position);
    this.dustMat.uniforms.uTime.value = this.time;

    this.smoke.update(dt);
    this.glow.update(dt);
    this.flames.update(dt);

    // fires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (this.time > f.until) {
        if (f.light) { f.light.hold = false; f.light.life = 0.3; f.light.maxLife = 0.3; f.light.peak = f.light.light.intensity; }
        this.fires.splice(i, 1);
        continue;
      }
      f.acc += dt * 26 * this.quality * f.scale;
      while (f.acc > 1) {
        f.acc -= 1;
        this.flames.emit(f.x + rr(-0.12, 0.12) * f.scale, f.y, f.z + rr(-0.12, 0.12) * f.scale,
          rr(-0.2, 0.2), rr(1.2, 2.4) * f.scale, rr(-0.2, 0.2), rr(0.4, 0.8), 0.32 * f.scale, 0.08 * f.scale, 1, rr(0.35, 0.6), 0.1, 0.8, -0.4, 0.8);
      }
      f.accSmoke += dt * 5 * this.quality * f.scale;
      while (f.accSmoke > 1) {
        f.accSmoke -= 1;
        this.smoke.emit(f.x + rr(-0.15, 0.15), f.y + 0.5 * f.scale, f.z + rr(-0.15, 0.15),
          rr(-0.2, 0.2) + 0.35, rr(1.0, 1.8), rr(-0.2, 0.2) + 0.2, rr(2.4, 4.0), 0.3 * f.scale, 1.8 * f.scale, 0.1, 0.095, 0.09, 0.38, -0.3, 0.5);
      }
      if (f.light) {
        f.light.light.intensity = f.scale * (6 + Math.sin(this.time * 17 + i) * 1.2 + Math.sin(this.time * 31) * 0.8 + rnd() * 1.2);
      }
    }

    // lights
    for (const l of this.lights) {
      if (l.hold) continue;
      if (l.life > 0) {
        l.life -= dt;
        l.light.intensity = l.life > 0 ? l.peak * (l.life / l.maxLife) ** 1.5 : 0;
      } else if (l.light.intensity !== 0) {
        l.light.intensity = 0;
      }
    }

    // tracers
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = 0.95 * (t.life / t.maxLife);
    }

    // casings
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.mesh.position.y < 0.01) {
        c.mesh.position.y = 0.01;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.5; c.vel.z *= 0.5;
        c.spin.multiplyScalar(0.5);
        if (c.vel.y < 0.4) { c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); }
      }
    }

    // enemy muzzle flashes
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) f.mesh.visible = false;
    }

    // lasers are only visible on frames in which an enemy refreshed them
    for (const l of this.lasers) {
      if (!l.touched) l.mesh.visible = false;
      l.touched = false;
    }

    // shock rings
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const k = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.5 + r.radius * (1 - (1 - k) * (1 - k)));
      r.mesh.material.opacity = 0.7 * (1 - k);
    }
  }
}

/** Impacts, explosions, tracers, dust. Returns the effects object. */
export function createEffects(game) { return new FX(game); }
