// Weather: rain, snow or blowing dust around the camera, one draw call.
//
// Every particle lives in a box that travels with the camera and wraps around: its position is
// worked out in the vertex shader from a fixed random start, the wind and the time, so the CPU
// touches nothing per frame but two uniforms. Rain draws thin streaks along the fall, snow and
// dust draw soft round sprites. The particles take the scene fog, cast no shadow and stay out of
// the ambient occlusion pass.

import * as THREE from 'three';

const MAX = 12000;

/**
 * Per kind: particles at intensity 1, the box around the camera (metres), fall velocity, streak or
 * sprite size, colour, opacity, sideways sway, and the share of big faint puffs (dust clouds).
 */
const KINDS = {
  rain: { count: 12000, box: [24, 14, 24], vel: [1.2, -11, 0.6], size: [0.022, 0.75], color: 0xc4ced8, alpha: 0.42, streak: 1, sway: 0 },
  snow: { count: 9000, box: [24, 14, 24], vel: [0.35, -1.15, 0.2], size: [0.055, 0.055], color: 0xf4f8ff, alpha: 0.95, streak: 0, sway: 0.45 },
  dust: { count: 9000, box: [28, 9, 28], vel: [3.2, 0.05, 1.3], size: [0.045, 0.045], color: 0xe0c090, alpha: 0.85, streak: 0, sway: 0.6, puffs: 0.2 },
};

const VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute vec4 seed;            // xyz: start in the box (0..1), w: random 0..1
  uniform float uTime, uStreak, uSway, uPuffs;
  uniform vec3 uCam, uBox, uVel;
  uniform vec2 uSize;
  varying vec2 vUv;
  varying float vFade, vPuff;
  void main() {
    float r = seed.w;
    vec3 vel = uVel * (0.8 + 0.4 * r);
    vec3 p = seed.xyz * uBox + vel * uTime;
    p.x += uSway * sin(uTime * (0.7 + r) + r * 40.0);
    p.z += uSway * cos(uTime * (0.6 + r * 0.8) + r * 23.0);
    // wrap into the box centred on the camera
    vec3 lo = uCam - 0.5 * uBox;
    p = lo + mod(p - lo, uBox);
    vec3 toCam = uCam - p;
    float dist = length(toCam);
    // fade at the edges of the box and right in front of the eye, so nothing pops
    vec3 e = abs(p - uCam) / (0.5 * uBox);
    vFade = (1.0 - smoothstep(0.75, 1.0, max(e.x, max(e.y, e.z)))) * smoothstep(0.25, 0.9, dist);
    vPuff = step(1.0 - uPuffs, r);
    vec2 size = uSize * mix(vec2(0.7 + 0.6 * r), vec2(26.0, 26.0) * (0.6 + 0.8 * fract(r * 13.0)), vPuff);
    vec3 world;
    if (uStreak > 0.5) {
      // a streak along the fall, turned toward the camera around that axis
      vec3 along = normalize(vel);
      vec3 side = normalize(cross(along, toCam));
      world = p + side * position.x * size.x + along * position.y * size.y;
    } else {
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      world = p + (camRight * position.x + camUp * position.y) * size.x;
    }
    vUv = position.xy;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform float uAlpha, uStreak, uLight;
  varying vec2 vUv;
  varying float vFade, vPuff;
  void main() {
    float a;
    if (uStreak > 0.5) a = (1.0 - abs(vUv.x) * 2.0) * (1.0 - smoothstep(0.2, 0.5, abs(vUv.y)));
    else { float d = length(vUv) * 2.0; a = 1.0 - smoothstep(0.35, 1.0, d); }
    a *= uAlpha * vFade * mix(1.0, 0.18, vPuff);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * uLight, a);
    #include <fog_fragment>
  }`;

/**
 * Weather around the camera of `gr` (the render pipeline). Returns
 * {object, kind, intensity, set(kind, intensity), update(dt, camera), clear(), dispose()}.
 * kind: 'none' | 'rain' | 'snow' | 'dust', intensity 0..1 (share of the particles drawn).
 */
export function createWeather(gr) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  // fixed random starts (own generator: the weather never touches the level's random numbers)
  const seeds = new Float32Array(MAX * 4);
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  quad.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  quad.instanceCount = 0;

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uStreak: { value: 0 }, uSway: { value: 0 }, uPuffs: { value: 0 },
      uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(24, 14, 24) }, uVel: { value: new THREE.Vector3() },
      uSize: { value: new THREE.Vector2(0.02, 0.02) }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uLight: { value: 1 },
    }]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(quad, material);
  mesh.name = 'weather';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.renderOrder = 5;
  gr.scene.add(mesh);
  gr.addNoAO(mesh);

  const u = material.uniforms;
  const tmp = new THREE.Color();
  const api = {
    object: mesh,
    kind: 'none',
    intensity: 0,
    /** Switch the weather. The light of the particles follows the sky fill of the current preset. */
    set(kind, intensity = 1) {
      const k = KINDS[kind];
      api.kind = k ? kind : 'none';
      api.intensity = k ? Math.max(0, Math.min(1, intensity)) : 0;
      if (!k || api.intensity <= 0) { mesh.visible = false; quad.instanceCount = 0; return; }
      quad.instanceCount = Math.round(k.count * api.intensity);
      u.uBox.value.set(k.box[0], k.box[1], k.box[2]);
      u.uVel.value.set(k.vel[0], k.vel[1], k.vel[2]);
      u.uSize.value.set(k.size[0], k.size[1]);
      u.uStreak.value = k.streak;
      u.uSway.value = k.sway;
      u.uPuffs.value = k.puffs || 0;
      u.uColor.value.setHex(k.color);
      u.uAlpha.value = k.alpha;
      // lit by the sky: brighter under a bright overcast, dim at night
      const h = gr.hemi;
      tmp.copy(h.color).multiplyScalar(h.intensity);
      u.uLight.value = Math.min(1.6, 0.25 + (tmp.r * 0.2126 + tmp.g * 0.7152 + tmp.b * 0.0722) * 1.6);
      mesh.visible = true;
    },
    /** Follow the camera and move the particles on. */
    update(dt, camera) {
      if (!mesh.visible) return;
      u.uTime.value = (u.uTime.value + dt) % 3600;
      u.uCam.value.copy(camera.position);
    },
    clear() { api.set('none', 0); },
    dispose() {
      gr.scene.remove(mesh);
      gr.removeNoAO(mesh);
      quad.dispose();
      material.dispose();
    },
  };
  return api;
}
