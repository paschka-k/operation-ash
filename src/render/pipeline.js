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

const SUN_ELEVATION = 17;   // degrees, low golden-hour sun
const SUN_AZIMUTH = 250;    // degrees

// Light shafts: bright sky around the sun is smeared along the line to the sun, so buildings
// and the weapon cut visible beams out of the haze. Screen space, HDR, before bloom.
const RAYS_SHADER = {
  defines: { RAY_STEPS: 16 },
  uniforms: {
    tDiffuse: { value: null },
    sunUv: { value: new THREE.Vector2(0.5, 0.5) },
    intensity: { value: 0 },
    aspect: { value: 1 },
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
      vec3 rays = vec3(1.0, 0.8, 0.56) * acc * fall * intensity;
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
      col *= vec3(1.015, 1.0, 0.975);

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

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
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

    this.sunDir = new THREE.Vector3(
      Math.cos(THREE.MathUtils.degToRad(SUN_ELEVATION)) * Math.sin(THREE.MathUtils.degToRad(SUN_AZIMUTH)),
      Math.sin(THREE.MathUtils.degToRad(SUN_ELEVATION)),
      Math.cos(THREE.MathUtils.degToRad(SUN_ELEVATION)) * Math.cos(THREE.MathUtils.degToRad(SUN_AZIMUTH)),
    ).normalize();

    this._buildLights();
    this._buildEnvironment();
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
  }

  _buildEnvironment() {
    const r = this.renderer;
    const skyScene = new THREE.Scene();
    const sky = new Sky();
    sky.scale.setScalar(10000);
    // Clamp the HDR output so the sun disc cannot flood the frame with bloom.
    sky.material.fragmentShader = sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      'gl_FragColor = vec4( min( texColor, vec3( 6.0 ) ), 1.0 );',
    );
    const u = sky.material.uniforms;
    // A compact sun: the glow reaches the clamp only within about 10 degrees. The hazier setting
    // used before saturated a 50 degree band of sky, which washed out the horizon.
    u.turbidity.value = 3.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.95;
    u.cloudCoverage.value = 0.55;
    u.cloudDensity.value = 0.5;
    u.sunPosition.value.copy(this.sunDir);
    skyScene.add(sky);

    // Warm ground bounce so downward facing surfaces are not black.
    const bounce = new THREE.Mesh(
      new THREE.CircleGeometry(4000, 48),
      new THREE.MeshBasicMaterial({ color: 0x7a6650, toneMapped: false }),
    );
    bounce.rotation.x = -Math.PI / 2;
    bounce.position.y = -2.5;
    skyScene.add(bounce);

    const cubeRT = new THREE.WebGLCubeRenderTarget(1024, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const cubeCam = new THREE.CubeCamera(1, 100000, cubeRT);
    cubeCam.update(r, skyScene);
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromCubemap(cubeRT.texture);
    this.scene.background = cubeRT.texture;
    this.scene.environment = env.texture;
    this.scene.environmentIntensity = 1.25;
    this.viewScene.environment = env.texture;
    this.viewScene.environmentIntensity = 0.85;
    pmrem.dispose();
    this.envTexture = env.texture;
    this.skyTexture = cubeRT.texture;
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

  get uniforms() { return this.grade.uniforms; }

  /** Where the sun is on screen and how strong the light shafts are for this view. */
  _updateRays() {
    const rays = this.rays;
    if (!rays) return;
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
    this.grade.uniforms.time.value += dt;
    this.camera.updateMatrixWorld();
    this._updateRays();
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
