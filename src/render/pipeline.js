// Renderer: WebGL2, golden-hour sky and image based lighting, soft sun shadows,
// post processing (GTAO, bloom, tone mapping, SMAA, film grade), and a
// separate pass for the first-person weapon so it never clips into walls.

import * as THREE from 'three';
import { ShaderChunk } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { makeDetailNormal, makeMacroNoise } from './materials.js';
import { QUALITY } from '../config.js';
import { gpuInfo } from '../core/gpu.js';
import { ATMOSPHERES, atmosphereFor, sunDirection } from '../core/atmosphere.js';

/**
 * The graphics a WebGL context runs on. The unmasked name comes from WEBGL_debug_renderer_info where
 * the browser still offers it, otherwise from RENDERER (current Chrome reports the real device there).
 */
function readGpu(gl) {
  let raw = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    raw = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '';
  } catch (e) { /* a lost context answers nothing */ }
  return gpuInfo(raw);
}

// Light shafts: bright sky around the sun is smeared along the line to the sun, so buildings
// and the weapon cut visible beams out of the haze. Screen space, HDR, before bloom.
const RAYS_SHADER = {
  defines: { RAY_STEPS: 16 },
  uniforms: {
    tDiffuse: { value: null },
    sunUv: { value: new THREE.Vector2(0.5, 0.5) },
    intensity: { value: 0 },
    aspect: { value: 1 },
    color: { value: new THREE.Vector3(1.0, 0.8, 0.56) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 sunUv;
    uniform float intensity, aspect;
    uniform vec3 color;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 delta = sunUv - vUv;
      float dist = length(delta * vec2(aspect, 1.0));
      vec2 stepv = delta * (0.92 / float(RAY_STEPS));
      vec2 uv = vUv + stepv * hash(gl_FragCoord.xy);
      float acc = 0.0, w = 1.0, wsum = 0.0;
      for (int i = 0; i < RAY_STEPS; i++) {
        vec3 s = texture2D(tDiffuse, uv).rgb;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        acc += smoothstep(3.2, 5.8, l) * w * inside; // only the glow around the sun counts (sky is clamped at 6)
        wsum += w;
        w *= 0.95;
        uv += stepv;
      }
      acc /= wsum;
      float fall = smoothstep(0.03, 0.3, dist) / (1.0 + dist * dist * 3.0);
      vec3 rays = color * acc * fall * intensity;
      gl_FragColor = vec4(base.rgb + rays, base.a);
    }`,
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.55 },
    grain: { value: 0.035 },
    saturation: { value: 0.98 },
    contrast: { value: 1.12 },
    damage: { value: 0 },
    lowHealth: { value: 0 },
    caAmount: { value: 0.012 },
    fade: { value: 1 },
    flash: { value: 0 },
    tint: { value: new THREE.Vector3(1.015, 1.0, 0.975) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, saturation, contrast, damage, lowHealth, caAmount, fade, flash;
    uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * caAmount;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;

      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = saturation * (1.0 - lowHealth * 0.55);
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * contrast + 0.5;
      col *= tint;

      float vig = smoothstep(0.12, 0.62, r2 * 2.0);
      col *= 1.0 - vignette * vig;
      col = mix(col, vec3(0.55, 0.02, 0.02), clamp(damage, 0.0, 1.0) * (0.25 + 0.75 * vig));
      col = mix(col, vec3(0.45, 0.02, 0.02), lowHealth * vig * 0.55);
      col += vec3(1.0, 0.85, 0.6) * flash;

      float g = hash(gl_FragCoord.xy + fract(time) * 61.0) - 0.5;
      col += g * grain * (1.0 - 0.5 * l);
      col *= fade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// The night sky for the probe that bakes the background and the image based light: a dark
// gradient, the orange glow of the city at the horizon, stars and the moon. Linear HDR values.
const NIGHT_SKY_SHADER = {
  uniforms: {
    moonDir: { value: new THREE.Vector3(0, 1, 0) },
    moonColor: { value: new THREE.Color(0xc8d4ff) },
    horizon: { value: new THREE.Color(0x1d2840) },
    zenith: { value: new THREE.Color(0x03050c) },
    glow: { value: new THREE.Color(0x3a2414) },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 moonDir, moonColor, horizon, zenith, glow;
    varying vec3 vDir;
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    void main() {
      vec3 d = normalize(vDir);
      float h = max(d.y, 0.0);
      vec3 col = mix(horizon, zenith, pow(h, 0.4));
      col += glow * exp(-h * 14.0);
      vec3 cell = floor(d * 380.0);
      float s = hash(cell);
      float star = step(0.9965, s) * smoothstep(0.02, 0.3, h);
      col += vec3(0.75, 0.82, 1.0) * star * (0.15 + 0.6 * fract(s * 117.0));
      float m = dot(d, normalize(moonDir));
      col += moonColor * (smoothstep(0.99955, 0.9997, m) * 3.0 + pow(max(m, 0.0), 600.0) * 0.12 + pow(max(m, 0.0), 24.0) * 0.012);
      if (d.y < 0.0) col = horizon * 0.35;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** sRGB components 0..1 of a hex colour (no colour management: shader tints are written in display values). */
const hexRgb = (hex, out) => out.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/** Candela of the point light at a street lamp at night (decay 2, reach 24 m). */
const LAMP_INTENSITY = 70;

export class GameRenderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.qualityName = settings.quality;
    this.q = QUALITY[this.qualityName];
    this.noAO = new Set();
    this.aoSwaps = [];
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Always ask for the fastest graphics card (G01). A browser that refuses a context with that hint
    // gets a second try with its default, and the game runs instead of stopping at the loading screen.
    const contextOptions = { canvas, antialias: false, stencil: false };
    try {
      this.renderer = new THREE.WebGLRenderer({ ...contextOptions, powerPreference: 'high-performance' });
      this.powerPreference = 'high-performance';
    } catch (e) {
      console.warn('[gpu] the browser refused a WebGL context with powerPreference "high-performance", retrying with its default:', e && e.message ? e.message : e);
      this.renderer = new THREE.WebGLRenderer(contextOptions);
      this.powerPreference = 'default';
    }
    /** Which graphics the context runs on: {raw, name, kind, hint} (core/gpu). */
    this.gpu = readGpu(this.renderer.getContext());
    console.info(`[gpu] ${this.gpu.name || 'unknown graphics'} (${this.gpu.kind}), powerPreference ${this.powerPreference}`);
    this.webgl2 = this.renderer.capabilities.isWebGL2 !== false;
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.72;
    r.shadowMap.enabled = true;
    // Every scene render would redraw all cascades (the ambient occlusion pass renders the scene
    // too). The shadow maps are refreshed once per frame instead, by the first scene render.
    r.shadowMap.autoUpdate = false;
    r.shadowMap.type = this.q.shadowType === 'basic' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    r.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.viewScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, this.width / this.height, 0.05, 420);
    this.viewCamera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.01, 8);
    this.scene.add(this.camera);
    this.viewScene.add(this.viewCamera);

    // Sun, sky, fog, exposure and grade come from an atmosphere preset (core/atmosphere.js).
    // The game applies one with applyAtmosphere(); render() applies the block's if none was.
    const d = sunDirection(ATMOSPHERES.block);
    this.sunDir = new THREE.Vector3(d.x, d.y, d.z).normalize();
    /** The applied preset and its id; null until applyAtmosphere(). */
    this.atm = null;
    this.atmosphereId = null;
    /** Particles around the camera (world/weather.js), attached by the game: {set, update, clear, dispose}. */
    this.weather = null;
    this.lampLights = [];   // point lights kept at the nearest street lamps (night)
    this.lampList = [];     // the street lamps of the map: [{x, y, z, color}]
    this._lampTimer = 0;
    this._lampTmp = [];

    this._buildLights();
    this.scene.fog = new THREE.FogExp2(0xa39d97, 0.0072);

    this._buildComposer();
  }

  // ------------------------------------------------------------ lighting
  _buildLights() {
    // Sun with three cascaded shadow maps: sharp and soft shadows near the player,
    // coarser ones further away, with smooth fades between them.
    // CSM swaps two shader chunks for the whole renderer and its version has no plain
    // directional light path, so everything outside the cascades (the weapon in hand,
    // particles) would lose the sun. Keep the stock chunks and splice the CSM ones into
    // the materials that are prepared for cascades.
    const stockBegin = ShaderChunk.lights_fragment_begin, stockPars = ShaderChunk.lights_pars_begin;
    this.csm = new CSM({
      camera: this.camera,
      parent: this.scene,
      cascades: 3,
      maxFar: 110,
      mode: 'practical',
      shadowMapSize: this.q.shadow,
      shadowBias: -0.0003,
      lightDirection: this.sunDir.clone().negate(),
      lightIntensity: 4.2,
      lightNear: 1,
      lightFar: 500,
      lightMargin: 100,
    });
    this._csmBegin = ShaderChunk.lights_fragment_begin;
    this._csmPars = ShaderChunk.lights_pars_begin;
    ShaderChunk.lights_fragment_begin = stockBegin;
    ShaderChunk.lights_pars_begin = stockPars;
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.color.setHex(0xffc896);
      l.shadow.normalBias = 0.04;
      l.shadow.radius = 2.4;
    }
    // Cool sky fill so shadowed areas keep colour and detail instead of going black.
    this.hemi = new THREE.HemisphereLight(0xa8bcd8, 0x6b5a48, 0.9);
    this.scene.add(this.hemi);
    this._prepared = new WeakSet();
    this.detailTex = makeDetailNormal();
    this.macroTex = makeMacroNoise();
    this._sunNdc = new THREE.Vector3();
    this._fwd = new THREE.Vector3();

    // Muzzle flash lights: one lights the world, one lights the weapon in hand.
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 16, 2);
    this.muzzleLight.position.set(0.12, -0.08, -0.9);
    this.camera.add(this.muzzleLight);
    this.viewMuzzleLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.viewMuzzleLight.position.set(0.05, 0.03, -0.55);
    this.viewScene.add(this.viewMuzzleLight);

    // Viewmodel scene gets its own, shadowless, lights that mimic the sun.
    const vSun = new THREE.DirectionalLight(0xffd2a6, 3.0);
    vSun.position.copy(this.sunDir).multiplyScalar(10);
    this.viewScene.add(vSun);
    this.viewSun = vSun;
    const vHemi = new THREE.HemisphereLight(0xb8c8e0, 0x4a3a2a, 0.9);
    this.viewScene.add(vHemi);
    this.viewHemi = vHemi;
    // A weak light from behind the camera: the faces of the weapon that look at the player
    // would otherwise be lit by nothing and go black.
    const vFill = new THREE.DirectionalLight(0xc8d4e6, 0.8);
    vFill.position.set(0.15, 0.35, 1);
    this.viewScene.add(vFill);
    this.viewFill = vFill;
    /** How much direct sun reaches the weapon in hand, and how much open sky is above it, 0..1. The weapon layer sets both. */
    this.weaponSun = 1;
    this.weaponSky = 1;
    this._viewQ = new THREE.Quaternion();
  }

  /**
   * The weapon is drawn in the space of the camera, so its light has to be brought there: the
   * sun and the reflected sky turn against the view, and the sun fades when the player is in shade.
   */
  _updateViewLight() {
    const v = (this.atm || ATMOSPHERES.block).view;
    const q = this._viewQ.copy(this.camera.quaternion).invert();
    this.viewSun.position.copy(this.sunDir).applyQuaternion(q).multiplyScalar(10);
    this.viewSun.intensity = v.sun * (0.1 + 0.9 * this.weaponSun);
    // under a roof the sky light is mostly gone as well
    const sky = 0.5 + 0.5 * this.weaponSky;
    this.viewHemi.intensity = v.sky * sky;
    this.viewFill.intensity = v.fill * sky;
    this.viewHemi.position.set(0, 1, 0).applyQuaternion(q);
    // the sky seen from the space of the camera is the sky turned by the inverse of the view
    // (three r186 looks the reflection up with the inverse of this rotation; checked with a mirror ball)
    this.viewScene.environmentRotation.setFromQuaternion(q);
    // the reflected sky follows the strength of the map's sky light (1 for the block)
    const envK = this.atm ? this.atm.env.intensity / ATMOSPHERES.block.env.intensity : 1;
    this.viewScene.environmentIntensity = (0.36 + 0.24 * this.weaponSky + 0.25 * this.weaponSun) * envK;
  }

  /**
   * Bake the sky of a preset into the background cube and the image based light. The sky scene,
   * the cube target, the PMREM generator and its target are made once and reused, so changing the
   * preset any number of times allocates nothing new on the GPU.
   */
  _buildEnvironment(atm) {
    const r = this.renderer;
    if (!this._skyScene) {
      const skyScene = new THREE.Scene();
      const sky = new Sky();
      sky.scale.setScalar(10000);
      // Clamp the HDR output at 6 so the sun disc cannot flood the frame with bloom. Away from the
      // sun (beyond about two degrees) the sky may be held lower (skyClamp): below the bloom
      // threshold the glow around a low sun stops blooming over the buildings in front of it, and
      // only the sun itself glows and casts light shafts. skyGain dims the sky of an overcast
      // preset, which the scattering model alone draws far too bright.
      sky.material.uniforms.skyGain = { value: 1 };
      sky.material.uniforms.skyClamp = { value: 6 };
      sky.material.fragmentShader = 'uniform float skyGain, skyClamp;\n' + sky.material.fragmentShader.replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        `float sunCore = smoothstep( 0.99905, 0.99985, dot( direction, vSunDirection ) );
         gl_FragColor = vec4( min( texColor * skyGain, vec3( mix( skyClamp, 6.0, sunCore ) ) ), 1.0 );`,
      );
      skyScene.add(sky);
      const night = new THREE.Mesh(
        new THREE.SphereGeometry(5000, 48, 24),
        new THREE.ShaderMaterial({ ...NIGHT_SKY_SHADER, uniforms: THREE.UniformsUtils.clone(NIGHT_SKY_SHADER.uniforms), side: THREE.BackSide, depthWrite: false }),
      );
      skyScene.add(night);
      // Ground bounce so downward facing surfaces are not black.
      const bounce = new THREE.Mesh(
        new THREE.CircleGeometry(4000, 48),
        new THREE.MeshBasicMaterial({ color: 0x7a6650, toneMapped: false }),
      );
      bounce.rotation.x = -Math.PI / 2;
      bounce.position.y = -2.5;
      skyScene.add(bounce);
      this._skyScene = skyScene;
      this._sky = sky;
      this._nightSky = night;
      this._bounce = bounce;
      this._cubeRT = new THREE.WebGLCubeRenderTarget(1024, {
        type: THREE.HalfFloatType,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
      });
      this._cubeCam = new THREE.CubeCamera(1, 100000, this._cubeRT);
      this._pmrem = new THREE.PMREMGenerator(r);
      this._envRT = null;
    }
    const u = this._sky.material.uniforms;
    // A compact sun on the block: the glow reaches the clamp only within about 10 degrees. A hazier
    // setting saturated a 50 degree band of sky, which washed out the horizon.
    u.turbidity.value = atm.sky.turbidity;
    u.rayleigh.value = atm.sky.rayleigh;
    u.mieCoefficient.value = atm.sky.mie;
    u.mieDirectionalG.value = atm.sky.mieG;
    u.cloudCoverage.value = atm.sky.clouds;
    u.cloudDensity.value = atm.sky.cloudDensity;
    u.skyGain.value = atm.sky.gain ?? 1;
    u.skyClamp.value = atm.sky.clamp ?? 6;
    u.sunPosition.value.copy(this.sunDir);
    this._sky.visible = !atm.night;
    this._nightSky.visible = !!atm.night;
    this._nightSky.material.uniforms.moonDir.value.copy(this.sunDir);
    this._bounce.material.color.setHex(atm.bounce);

    this._cubeCam.update(r, this._skyScene);
    this._envRT = this._pmrem.fromCubemap(this._cubeRT.texture, this._envRT);
    this.scene.background = this._cubeRT.texture;
    this.scene.environment = this._envRT.texture;
    this.viewScene.environment = this._envRT.texture;
    this.envTexture = this._envRT.texture;
    this.skyTexture = this._cubeRT.texture;
  }

  // ---------------------------------------------------------- atmosphere
  /**
   * Light the scene with the atmosphere preset of a map (core/atmosphere.js): sun direction,
   * colour and strength of the cascades, sky and image based light, sky fill, fog, exposure,
   * film grade, the light on the weapon, weather and the number of street lamp lights.
   * The same id again does nothing and returns false. Changing the number of lamp lights
   * recompiles the lit shaders, so the caller should run renderer.compile afterwards.
   */
  applyAtmosphere(id) {
    const atm = atmosphereFor(id);
    if (this.atm === atm) return false;
    this.atm = atm;
    this.atmosphereId = ATMOSPHERES[id] ? id : 'block';
    const d = sunDirection(atm);
    this.sunDir.set(d.x, d.y, d.z).normalize();
    this.csm.lightDirection.copy(this.sunDir).negate();
    for (const l of this.csm.lights) {
      l.color.setHex(atm.sun.color);
      l.intensity = atm.sun.intensity;
    }
    this.hemi.color.setHex(atm.hemi.sky);
    this.hemi.groundColor.setHex(atm.hemi.ground);
    this.hemi.intensity = atm.hemi.intensity;
    this.scene.fog.color.setHex(atm.fog.color);
    this.scene.fog.density = atm.fog.density;
    this.renderer.toneMappingExposure = atm.exposure;
    const v = atm.view;
    this.viewSun.color.setHex(v.sunColor);
    this.viewHemi.color.setHex(v.skyColor);
    this.viewHemi.groundColor.setHex(v.groundColor);
    this.viewFill.color.setHex(v.fillColor);
    this._buildEnvironment(atm);
    this.scene.environmentIntensity = atm.env.intensity;
    this._applyGrade();
    this._setLampLightCount(atm.lampLights);
    if (this.weather) this.weather.set(atm.weather.kind, atm.weather.intensity);
    return true;
  }

  /** Grade, light shafts and bloom of the preset; again after the composer is rebuilt. */
  _applyGrade() {
    const atm = this.atm;
    if (!atm || !this.grade) return;
    const u = this.grade.uniforms;
    u.saturation.value = atm.grade.saturation;
    u.contrast.value = atm.grade.contrast;
    u.vignette.value = atm.grade.vignette;
    const t = atm.grade.tint || [1.015, 1.0, 0.975];
    u.tint.value.set(t[0], t[1], t[2]);
    if (this.rays) {
      if (atm === ATMOSPHERES.block) this.rays.uniforms.color.value.set(1.0, 0.8, 0.56);
      else hexRgb(atm.sun.color, this.rays.uniforms.color.value);
    }
    // At night nothing but lamps, neon, fire and muzzle flashes is bright: they may glow.
    if (this.bloom) this.bloom.threshold = atm.night ? 1.2 : 3.0;
  }

  _setLampLightCount(n) {
    while (this.lampLights.length > n) {
      const l = this.lampLights.pop();
      this.scene.remove(l);
      l.dispose();
    }
    while (this.lampLights.length < n) {
      const l = new THREE.PointLight(0xffc47a, 0, 24, 2);
      l.castShadow = false;
      l.userData.lamp = null;
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this._lampTimer = 0;
  }

  /**
   * The street lamps of the map, [{x, y, z, color}] (y is the height of the lamp head). The lamp
   * lights of the preset move to the lamps nearest to the camera about four times a second.
   */
  setLampLights(list) {
    this.lampList = (list || []).map((p) => ({ x: p.x, y: p.y ?? 5.4, z: p.z, color: p.color ?? 0xffc47a }));
    for (const l of this.lampLights) { l.userData.lamp = null; l.intensity = 0; }
    this._lampTimer = 0;
  }

  _updateLampLights(dt) {
    const lights = this.lampLights;
    if (!lights.length) return;
    this._lampTimer -= dt;
    if (this._lampTimer > 0) return;
    this._lampTimer = 0.25;
    const c = this.camera.position;
    const near = this._lampTmp;
    near.length = 0;
    for (const p of this.lampList) {
      const d = (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
      if (near.length < lights.length) near.push({ p, d });
      else {
        let worst = 0;
        for (let i = 1; i < near.length; i++) if (near[i].d > near[worst].d) worst = i;
        if (d < near[worst].d) near[worst] = { p, d };
      }
    }
    // a light already standing at one of the nearest lamps stays there, so lamps do not flicker
    const todo = near.map((n) => n.p);
    const free = [];
    for (const l of lights) {
      const i = l.userData.lamp ? todo.indexOf(l.userData.lamp) : -1;
      if (i >= 0) todo.splice(i, 1);
      else free.push(l);
    }
    for (const l of free) {
      const p = todo.shift();
      l.userData.lamp = p || null;
      if (!p) { l.intensity = 0; continue; }
      l.position.set(p.x, p.y - 0.25, p.z);
      l.color.setHex(p.color);
      l.intensity = LAMP_INTENSITY;
    }
  }

  // ----------------------------------------------------------- composer
  _pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(0.5, dpr * this.q.renderScale);
  }

  _buildComposer() {
    if (this.composer) {
      this.composer.passes.forEach((p) => p.dispose && p.dispose());
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    const q = this.q;
    const pr = this._pixelRatio();
    this.pr = pr;
    const r = this.renderer;
    r.setPixelRatio(pr);
    r.setSize(this.width, this.height);

    const rt = new THREE.WebGLRenderTarget(this.width * pr, this.height * pr, {
      type: THREE.HalfFloatType,
      samples: q.msaa,
    });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(pr);
    composer.setSize(this.width, this.height);
    this.composer = composer;

    composer.addPass(new RenderPass(this.scene, this.camera));

    this.gtao = null;
    if (q.ao) {
      const aoScale = q.aoScale || 0.5;
      const gtao = new GTAOPass(this.scene, this.camera, this.width * pr * aoScale, this.height * pr * aoScale);
      const baseSetSize = GTAOPass.prototype.setSize;
      gtao.setSize = (w, h) => baseSetSize.call(gtao, Math.max(2, Math.floor(w * aoScale)), Math.max(2, Math.floor(h * aoScale)));
      gtao.setSize(this.width * pr, this.height * pr);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 1.0;
      gtao.updateGtaoMaterial({
        radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.25,
        samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false,
      });
      gtao.updatePdMaterial({
        lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12,
      });
      const baseRender = gtao.render.bind(gtao);
      gtao.render = (...args) => {
        const hidden = [];
        for (const o of this.noAO) if (o.visible) { o.visible = false; hidden.push(o); }
        for (const s of this.aoSwaps) { s.full.visible = false; s.shape.visible = true; }
        baseRender(...args);
        for (const s of this.aoSwaps) { s.full.visible = true; s.shape.visible = false; }
        for (const o of hidden) o.visible = true;
      };
      composer.addPass(gtao);
      this.gtao = gtao;
    }

    const viewPass = new RenderPass(this.viewScene, this.viewCamera);
    viewPass.clear = false;
    viewPass.clearDepth = true;
    composer.addPass(viewPass);

    // light shafts (HDR, so they sit before bloom and tone mapping)
    this.rays = null;
    if (q.rays) {
      const rays = new ShaderPass({ ...RAYS_SHADER, defines: { RAY_STEPS: q.rays } });
      rays.enabled = false;
      composer.addPass(rays);
      this.rays = rays;
    }

    this.bloom = null;
    if (q.bloom) {
      // Threshold 3: only the sun's own glow (the sky is clamped at 6) and stacked fire or muzzle
      // light bloom. At 1.6 the whole hazy horizon bloomed and a low sun whited out a third of the frame.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width * pr * 0.5, this.height * pr * 0.5), 0.22, 0.45, 3.0);
      composer.addPass(this.bloom);
    }

    composer.addPass(new OutputPass());

    this.smaa = null;
    if (q.smaa) {
      this.smaa = new SMAAPass();
      composer.addPass(this.smaa);
    }

    const grade = new ShaderPass(GRADE_SHADER);
    grade.uniforms.caAmount.value = q.ca;
    // keep a handle to the live uniforms (ShaderPass clones them)
    this.grade = grade;
    composer.addPass(grade);
    this._applyGrade();   // a new composer starts from the shader defaults: bring the map's grade back
  }

  // --------------------------------------------------------------- API
  setQuality(name) {
    if (!QUALITY[name]) return;
    const oldShadow = this.q.shadowType;
    this.qualityName = name;
    this.q = QUALITY[name];
    this.renderer.shadowMap.type = this.q.shadowType === 'basic' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    if (oldShadow !== this.q.shadowType) {
      this.scene.traverse((o) => {
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
        }
      });
    }
    for (const l of this.csm.lights) {
      const sh = l.shadow;
      if (sh.mapSize.x !== this.q.shadow) {
        sh.mapSize.set(this.q.shadow, this.q.shadow);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
    }
    this.csm.shadowMapSize = this.q.shadow;
    this._buildComposer();
  }

  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.csm.updateFrustums();
    }
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = this.width / this.height;
    this.viewCamera.updateProjectionMatrix();
    const pr = this._pixelRatio();
    this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.width, this.height);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.width, this.height);
    this.csm.updateFrustums();
  }

  /**
   * Make a lit material use the cascaded shadows and the close-range detail normal.
   * Call it for every material that lights the main scene, before its first render.
   */
  prepareMaterial(m) {
    if (!m || this._prepared.has(m)) return;
    this._prepared.add(m);
    if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return;
    this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    const withDetail = !!(m.normalMap && m.userData.detail !== false);
    const withMacro = !!(m.map && m.userData.macro === true);
    const withPatches = withMacro && m.userData.patches === true;
    // the hook below is the same function text for every material, so the variants need their own key
    m.customProgramCacheKey = () => 'csm' + (withDetail ? '+detail' : '') + (withMacro ? '+macro' : '') + (withPatches ? '+patches' : '');
    m.onBeforeCompile = (shader, renderer) => {
      csmHook.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <lights_pars_begin>', this._csmPars)
        .replace('#include <lights_fragment_begin>', this._csmBegin);
      if (withDetail) {
        shader.uniforms.uDetail = { value: this.detailTex };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform sampler2D uDetail;`)
          .replace('normal = normalize( tbn * mapN );', `
            {
              vec3 dn = texture2D( uDetail, vNormalMapUv * 9.0 ).xyz * 2.0 - 1.0;
              float nearK = 1.0 - smoothstep( 1.5, 9.0, length( vViewPosition ) );
              mapN.xy += dn.xy * 0.6 * nearK;
            }
            normal = normalize( tbn * mapN );`);
      }
      if (withMacro) {
        // Colour varies slowly in world space (two layers, about 5 m and 25 m), so a wall of
        // repeated tiles no longer reads as a grid from a distance.
        shader.uniforms.uMacro = { value: this.macroTex };
        if (withPatches) shader.fragmentShader = '#define MACRO_PATCHES\n' + shader.fragmentShader;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
varying vec3 vMacroPos;
varying float vMacroUp;`)
          .replace('#include <project_vertex>', `#include <project_vertex>
            {
              vec4 macroWorld = vec4( transformed, 1.0 );
              #ifdef USE_INSTANCING
                macroWorld = instanceMatrix * macroWorld;
              #endif
              vMacroPos = ( modelMatrix * macroWorld ).xyz;
              vMacroUp = abs( normalize( mat3( modelMatrix ) * objectNormal ).y );
            }`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
uniform sampler2D uMacro;
varying vec3 vMacroPos;
varying float vMacroUp;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            {
              vec2 mp = vMacroPos.xz + vMacroPos.y * vec2( 0.37, 0.61 );
              float m1 = texture2D( uMacro, mp * 0.047 ).r;
              float m2 = texture2D( uMacro, mp * 0.0131 + 0.31 ).g;
              float mk = m1 * 0.55 + m2 * 0.45;
              diffuseColor.rgb *= mix( vec3( 0.72, 0.71, 0.69 ), vec3( 1.14, 1.15, 1.16 ), mk );
              // rain streaks: thin across the wall, long down it, only on upright surfaces
              float along = dot( vMacroPos.xz, vec2( 0.7071 ) );
              float streak = texture2D( uMacro, vec2( along * 0.31, vMacroPos.y * 0.035 ) ).g;
              float streak2 = texture2D( uMacro, vec2( along * 0.11 + 0.4, vMacroPos.y * 0.02 + 0.2 ) ).r;
              float wall = 1.0 - smoothstep( 0.2, 0.6, vMacroUp );
              diffuseColor.rgb *= 1.0 - wall * ( smoothstep( 0.55, 0.95, streak ) * 0.2 + smoothstep( 0.6, 1.0, streak2 ) * 0.14 );
              #ifdef MACRO_PATCHES
                // plaster fallen off the wall: two noise layers at unrelated scales, so the patches never line up with the tile
                vec2 pp = vec2( along, vMacroPos.y );   // in the plane of the wall, so patches are blobs, not diagonals
                float pa = texture2D( uMacro, pp * 0.17 + 0.63 ).r;
                float pb = texture2D( uMacro, pp * 0.061 + 0.17 ).g;
                float pk = pa * 0.6 + pb * 0.4;
                float patchK = smoothstep( 0.66, 0.71, pk ) * wall;
                float rim = smoothstep( 0.6, 0.66, pk ) * ( 1.0 - patchK ) * wall;   // dirty edge around a patch
                vec3 brickCol = vec3( 0.2, 0.095, 0.07 ) * ( 0.7 + 0.6 * m1 );
                diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 - rim * 0.22 ), brickCol, patchK * 0.92 );
              #endif
            }`);
      }
    };
    m.needsUpdate = true;
  }

  /** Prepare every material currently in the main scene. */
  prepareScene() {
    this.scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.prepareMaterial(m);
    });
  }

  /** The cascaded sun: one directional light per cascade, all with the same direction. */
  get sun() { return this.csm.lights; }

  /** Register a mesh that must not appear in the ambient occlusion normal pass. */
  addNoAO(obj) { this.noAO.add(obj); }
  removeNoAO(obj) { this.noAO.delete(obj); }

  /**
   * In the ambient occlusion pass draw `shape` in place of `full`. That pass renders depth and
   * normals with a single material, so many meshes can be stood in for by one merged mesh.
   * `shape` is hidden everywhere else.
   */
  swapForAO(full, shape) { shape.visible = false; this.aoSwaps.push({ full, shape }); }

  /** Forget the swap registered for `full` (its map is being thrown away). */
  removeAOSwap(full) { this.aoSwaps = this.aoSwaps.filter((s) => s.full !== full); }

  get uniforms() { return this.grade.uniforms; }

  /**
   * A picture of the arena from straight above for the map screens: orthographic, ±half metres
   * around the origin, north (−z) up, east (+x) right. The map's sun, shadows and sky light, but no
   * fog, sky, post effects, weapon, particles or weather. Returns a 2D canvas size × size, or null
   * when it fails. The cascades are borrowed for the shot and given back to the player's camera.
   */
  renderTopDown(half, size = 1024) {
    const r = this.renderer, scene = this.scene, csm = this.csm;
    if (!this.atm) this.applyAtmosphere('block');
    const fog = scene.fog, density = fog ? fog.density : 0;
    const background = scene.background;
    const exposure = r.toneMappingExposure;
    const target = r.getRenderTarget();
    const hidden = [];
    let rtScene = null, rtOut = null, out = null;
    try {
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 100);
      cam.position.set(0, 80, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld(true);
      // Particles, glows and weather would smear the map; fog density 0 keeps the shaders as they
      // are (no fog at all would recompile every material for one picture).
      if (fog) fog.density = 0;
      scene.background = null;
      const weather = this.weather && this.weather.object;
      scene.traverse((o) => {
        if (!o.visible) return;
        const m = o.material;
        const glow = m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending;
        if (o === weather || o.isPoints || o.isLine || o.isSprite || glow) { o.visible = false; hidden.push(o); }
      });
      // a night map is lit by lamps and the moon: brighter, so the streets still read on the map
      if (this.atm.night) r.toneMappingExposure = exposure * 2.6;
      csm.camera = cam;
      csm.updateFrustums();
      csm.update();
      r.shadowMap.needsUpdate = true;
      rtScene = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, samples: 4 });
      rtOut = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType });
      r.setRenderTarget(rtScene);
      r.clear();
      r.render(scene, cam);
      if (!this._topOutput) this._topOutput = new OutputPass();
      this._topOutput.render(r, rtOut, rtScene);
      const px = new Uint8Array(size * size * 4);
      r.readRenderTargetPixels(rtOut, 0, 0, size, size, px);
      out = document.createElement('canvas');
      out.width = out.height = size;
      const ctx = out.getContext('2d');
      const img = ctx.createImageData(size, size);
      const row = size * 4;
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
      ctx.putImageData(img, 0, 0);
    } catch (e) {
      console.warn('[map] the picture from above failed:', e && e.message ? e.message : e);
      out = null;
    } finally {
      for (const o of hidden) o.visible = true;
      if (fog) fog.density = density;
      scene.background = background;
      r.toneMappingExposure = exposure;
      csm.camera = this.camera;
      csm.updateFrustums();
      r.shadowMap.needsUpdate = true;
      r.setRenderTarget(target);
      if (rtScene) rtScene.dispose();
      if (rtOut) rtOut.dispose();
    }
    return out;
  }

  /** Where the sun is on screen and how strong the light shafts are for this view. */
  _updateRays() {
    const rays = this.rays;
    if (!rays) return;
    if (this.atm && this.atm.night) { rays.enabled = false; return; }
    const cam = this.camera;
    const facing = cam.getWorldDirection(this._fwd).dot(this.sunDir);
    let k = 0;
    if (facing > 0.05) {
      const p = this._sunNdc.copy(this.sunDir).multiplyScalar(300).add(cam.position).project(cam);
      const off = Math.max(Math.abs(p.x), Math.abs(p.y));
      // full strength with the sun in frame, fading out as it leaves the frame
      k = THREE.MathUtils.smoothstep(facing, 0.05, 0.5) * (1 - THREE.MathUtils.smoothstep(off, 1.0, 1.8));
      rays.uniforms.sunUv.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      rays.uniforms.aspect.value = cam.aspect;
    }
    rays.uniforms.intensity.value = k * this.q.raysStrength;
    rays.enabled = k > 0.01;
  }

  render(dt) {
    if (!this.atm) this.applyAtmosphere('block');
    this.grade.uniforms.time.value += dt;
    this.camera.updateMatrixWorld();
    this._updateRays();
    this._updateViewLight();
    this._updateLampLights(dt);
    if (this.weather) this.weather.update(dt, this.camera);
    this.csm.update();
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render(dt);
  }
}

/**
 * The render pipeline: scene, camera, weapon pass, post processing, cascaded shadows.
 * Returns the pipeline object with scene, camera, render(dt), resize(), setQuality(q), sun.
 */
export function createPipeline(canvas, settings) { return new GameRenderer(canvas, settings); }
