// Entry point: loading, game states, the fixed-step loop and wiring of all systems.

import * as THREE from 'three';
import { createPipeline } from './render/pipeline.js';
import { loadSettings, saveSettings, setLang, t, QUALITY, QUALITY_ORDER, PHYSICS_HZ, PLAYER } from './config.js';
import { loadTexturePack, setAnisotropy } from './render/materials.js';
import { loadModelPack } from './render/models.js';
import { createScatter } from './world/scatter.js';
import { createEffects } from './world/effects.js';
import { createAudio } from './audio/sfx.js';
import { buildLevel } from './world/level.js';
import { createPlayer } from './player/controller.js';
import { createInput } from './player/input.js';
import { Shooting } from './game/shooting.js';
import { createSquad } from './enemies/squad.js';
import { Director } from './game/director.js';
import { createGrenades } from './game/grenades.js';
import { createHud } from './ui/hud.js';
import { createShop } from './ui/shop.js';
import { clamp, lerp, lineOfSight } from './core/collision.js';
import { createGamepad } from './player/gamepad.js';
import { createBigMap } from './ui/bigmap.js';
import { createKeyScreen } from './ui/keys.js';

const STEP = 1 / PHYSICS_HZ;

class Game {
  constructor() {
    this.settings = loadSettings();
    setLang(this.settings.lang);
    this.t = t;
    this.state = 'loading';   // loading | menu | playing | paused | dead | victory | shop
    this.time = 0;
    this.godMode = false;
    this.acc = 0;
    this.menuT = Math.random() * 6;
    this.fpsAvg = 60;
    this.lowTime = 0;
    this.qualityCooldown = 0;
    this.deathTimer = null;
    this.last = performance.now();
  }

  async init() {
    const canvas = document.getElementById('game');
    this.canvas = canvas;
    this.hud = createHud(this);
    this.hud.showScreen('loading');
    this.hud.setLoading(0, t('loadTextures'));
    await new Promise((r) => setTimeout(r, 30));

    try {
      this.gr = createPipeline(canvas, this.settings);
      if (!this.gr.renderer.capabilities.isWebGL2) throw new Error('webgl2');
    } catch (e) {
      this.hud.setLoading(0, t('webglFail'));
      console.error(e);
      return;
    }

    const aniso = Math.min(QUALITY[this.settings.quality].aniso, this.gr.renderer.capabilities.getMaxAnisotropy());
    // Photoscans are optional files. The setting and ?noscans in the address leave them out.
    const scans = this.settings.scans !== false && !new URLSearchParams(location.search).has('noscans');
    const pack = await loadTexturePack({ aniso, scans, onProgress: (p, id) => this.hud.setLoading(p * 0.68, t('loadTextures') + ' · ' + id) });
    this.textures = pack.sets;
    this.texturePack = pack;
    this.modelPack = await loadModelPack({ scans, onProgress: (p, id) => this.hud.setLoading(0.68 + p * 0.12, t('loadModels') + ' · ' + id) });
    // the settings screen offers the switch only when there is something to switch
    this.scansFound = !scans || pack.loaded.length + this.modelPack.loaded.length > 0;

    this.hud.setLoading(0.82, t('loadWorld'));
    await new Promise((r) => setTimeout(r, 20));
    this.audio = createAudio(this);
    this.fx = createEffects(this);
    buildLevel(this.gr.scene, this);   // sets this.world and this.props
    this.scatter = createScatter(this.gr.scene, this.world, this.settings.quality);
    this.gr.addNoAO(this.scatter.group); // clutter is too small to matter for ambient occlusion
    this.player = createPlayer(this);
    this.input = createInput(this);
    this.weapons = new Shooting(this);
    this.enemies = createSquad(this);
    this.director = new Director(this);
    this.grenades = createGrenades(this);
    this.shop = createShop(this);      // the shop screen, the inventory overlay, money and armour on the HUD

    this.gr.prepareScene();
    this.hud.setLoading(0.95, t('loadAudio'));
    this.player.reset();
    this.weapons.reset();

    window.addEventListener('resize', () => this.gr.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
    // ---- wave 11: gamepad, big map (M), key binding screen
    this.pad = createGamepad(this);
    this.bigMap = createBigMap(this);
    this.keys = createKeyScreen(this);
    this.hud.refreshBindings();

    // compile shaders now so the first frames of play do not stutter
    this.menuCamera(0);
    this.gr.renderer.compile(this.gr.scene, this.gr.camera);
    this.gr.render(0.016);

    this.hud.setLoading(1, t('loadReady'));
    this.state = 'menu';
    this.hud.showScreen('menu');
    this.ready = true;

    requestAnimationFrame((now) => { this.last = now; this.loop(now); });
    const params = new URLSearchParams(location.search);
    if (params.has('autostart')) this.startGame({ noLock: true });
  }

  // ------------------------------------------------------------ settings
  saveSettings() { saveSettings(this.settings); }

  applyQuality(name, fromUser = false) {
    if (!QUALITY[name]) return;
    this.settings.quality = name;
    this.gr.setQuality(name);
    this.fx.setQuality(QUALITY[name].particles);
    const aniso = Math.min(QUALITY[name].aniso, this.gr.renderer.capabilities.getMaxAnisotropy());
    setAnisotropy(this.textures, aniso);
    if (this.scatter) this.scatter.setDensity(name);
    this.hud.syncSettings();
    if (fromUser) { this.lowTime = 0; this.qualityCooldown = 8; }
  }

  setSound(on) {
    this.settings.sound = !!on;
    this.audio.setMuted(!on);
    this.saveSettings();
    this.hud.syncSettings();
  }

  /** Global keys: F3 toggles the FPS counter, Esc inside the pause menu goes back. */
  onKey(e) {
    if (!this.ready || (this.keys && this.keys.capturing)) return; // a key binding slot takes every key
    if (e.code === 'F3') {
      e.preventDefault();
      this.settings.showFps = !this.settings.showFps;
      this.saveSettings();
      this.hud.syncSettings();
    } else if (e.code === 'Escape' && !e.repeat) {
      // With pointer lock the browser swallows Esc and the lock change pauses the game.
      // Without it (lock refused, test mode) the key itself has to do it.
      if (this.state === 'playing') this.pause();
      else if (this.hud.screen === 'keys') this.keys.back();
      else if (this.state === 'menu' && (this.hud.screen === 'settings' || this.hud.screen === 'controls')) this.hud.showScreen('menu');
      else if (this.state === 'paused' && performance.now() - (this.pausedAt || 0) > 300) {
        if (this.hud.screen === 'pause') this.resume();
        else if (this.hud.screen === 'settings' || this.hud.screen === 'controls') this.hud.showScreen('pause');
      }
    }
  }

  // ---------------------------------------------------------- game states
  startGame(opts = {}) {
    this.audio.init();
    this.audio.resume();
    this.input.releaseAll(); // nothing pressed on a menu screen may leak into the game
    if (this.deathTimer) { clearTimeout(this.deathTimer); this.deathTimer = null; }
    // The clock goes back to zero before anything reads it, so the core rules start from 0 too.
    this.time = 0;
    this.acc = 0;
    this.enemies.clear();
    this.props.clear();
    this.grenades.clear();
    this.fx.clear();
    this.world._places();
    this.player.reset();
    this.weapons.reset();
    this.director.start();
    this.shop.reset();
    this.gr.uniforms.fade.value = 1;
    this.gr.uniforms.damage.value = 0;
    this.gr.uniforms.lowHealth.value = 0;
    this.player.damageFlash = 0;
    this.state = 'playing';
    this.hud.hideScreens();
    this.hud.showHud(true);
    this.gr.viewScene.visible = true;
    this.testMode = !!opts.noLock;
    // a gamepad press is no user gesture: the browser would refuse the lock, so the pad plays without it
    if (!opts.noLock && this.lastDevice !== 'pad') this.input.lock();
  }

  restart() { this.startGame({ noLock: this.testMode }); }

  /** After the victory screen: keep fighting in the endless mode, through the shop. */
  continueEndless() {
    if (this.state !== 'victory') return;
    if (this.deathTimer) { clearTimeout(this.deathTimer); this.deathTimer = null; }
    this.audio.resume();
    this.director.continueEndless();
    this.showShop();
  }

  // ---- wave 12: the shop between waves and the revival at the wave of death
  /** The director calls this a moment after a wave is cleared. The game stands still while the shop is open. */
  openShop() {
    if (this.state !== 'playing') return;
    this.showShop();
  }

  showShop() {
    this.state = 'shop';
    this.input.unlock();
    this.input.releaseAll();
    this.audio.lowHealth = 0;
    this.player.damageFlash = 0;
    this.gr.uniforms.damage.value = 0;
    this.gr.uniforms.lowHealth.value = 0;
    this.shop.open();
  }

  /** "To battle": back into the game; the countdown to the next wave runs. */
  leaveShop() {
    if (this.state !== 'shop') return;
    this.director.leaveShop();
    this.shop.close();
    this.input.releaseAll();
    this.state = 'playing';
    this.hud.hideScreens();
    this.hud.showHud(true);
    this.audio.resume();
    this.last = performance.now();
    if (!this.testMode) this.input.lock();   // a click on the button is a user gesture; a refusal leaves the canvas click
  }

  /** "Revive at wave N": the scene is cleared, the checkpoint of that wave comes back and the wave starts again. */
  revive() {
    if (this.state !== 'dead' || !this.director.core.checkpoint) return;
    if (this.deathTimer) { clearTimeout(this.deathTimer); this.deathTimer = null; }
    this.audio.resume();
    this.input.releaseAll();
    this.acc = 0;
    this.enemies.clear();
    this.props.clear();
    this.fx.clear();
    this.world._places();
    this.player.reset();
    this.director.revive();          // money, score, counters, armour, and the arsenal through weapons.restore()
    this.gr.uniforms.fade.value = 1;
    this.gr.uniforms.damage.value = 0;
    this.gr.uniforms.lowHealth.value = 0;
    this.player.damageFlash = 0;
    this.audio.lowHealth = 0;
    this.shop.closeInventory();
    this.state = 'playing';
    this.hud.hideScreens();
    this.hud.showHud(true);
    this.gr.viewScene.visible = true;
    this.last = performance.now();
    if (!this.testMode && this.lastDevice !== 'pad') this.input.lock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.director.setPaused(true);
    this.input.unlock();
    this.input.releaseAll();
    this.audio.suspend();
    this.hud.showScreen('pause');
    this.shop.closeInventory();
  }

  resume() {
    if (this.state !== 'paused') return;
    const go = () => {
      if (this.state !== 'paused') return;
      this.hud.hideScreens();
      this.state = 'playing';
      this.director.setPaused(false);
      this.audio.resume();
      this.last = performance.now();
    };
    if (this.testMode || this.lastDevice === 'pad') { go(); return; }
    // Back into the fight only when the browser hands the mouse back. A click on the button always
    // does. The Esc key does not count as a user gesture, so there the menu simply stays open.
    this.input.lock().then((ok) => { if (ok) go(); });
  }

  toMenu() {
    if (this.deathTimer) { clearTimeout(this.deathTimer); this.deathTimer = null; }
    this.state = 'menu';
    this.input.unlock();
    this.audio.resume();
    this.enemies.clear();
    this.grenades.clear();
    this.hud.showHud(false);
    this.hud.showScreen('menu');
    this.gr.uniforms.fade.value = 1;
    this.gr.uniforms.damage.value = 0;
    this.gr.uniforms.lowHealth.value = 0;
    this.audio.lowHealth = 0;
  }

  /**
   * Losing the lock pauses the game, and so does a refused lock in mouse play (the pause menu offers
   * the click that can lock). Gamepad play never asks for the lock, so nothing it does pauses here.
   */
  onPointerLockChange(locked, wasLocked = true) {
    if (!locked && (wasLocked || this.lastDevice !== 'pad') && this.state === 'playing' && !this.testMode) this.pause();
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.audio.death();
    this.input.unlock();
    this.shop.closeInventory();
    this.deathTimer = setTimeout(() => {
      if (this.state !== 'dead') return;
      this.hud.showResult('dead', this.resultStats());
    }, 2200);
  }

  onVictory() {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    this.audio.victory();
    this.input.unlock();
    this.deathTimer = setTimeout(() => {
      if (this.state !== 'victory') return;
      this.hud.showResult('victory', this.resultStats());
    }, 1600);
  }

  resultStats() {
    return this.director.result();
  }

  // ------------------------------------------------------------------ loop
  loop(now) {
    requestAnimationFrame((n) => this.loop(n));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) return;
    const raw = dt;
    dt = Math.min(dt, 0.1);
    this.frame(dt, raw);
  }

  menuCamera(dt) {
    this.menuT += dt * 0.07;
    const a = this.menuT;
    const cam = this.gr.camera;
    cam.position.set(Math.cos(a) * 31, 9 + Math.sin(a * 1.7) * 2.2, Math.sin(a) * 31);
    cam.rotation.order = 'YXZ';
    cam.lookAt(0, 2.5, 0);
    this.gr.setFov(58);
  }

  frame(dt, raw = dt) {
    // ---- wave 11: the gamepad feeds input before anything reads it (it may pause or resume);
    // the big map answers its key and closes outside of play
    if (this.pad) this.pad.poll(dt);
    if (this.bigMap) this.bigMap.update(dt);
    const realDt = raw;
    const st = this.state;
    const sim = st === 'playing' || st === 'dead' || st === 'victory';

    if (st === 'playing') {
      const [dx, dy] = this.input.takeMouse();
      this.player.look(dx, dy);
    } else {
      this.input.takeMouse();
    }

    if (sim) {
      this.time += dt;
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.player.step(STEP, st === 'playing' ? this.input : this.idleInput());
        this.acc -= STEP;
        n++;
      }
      if (n === 8) this.acc = 0;
      this.player.updateCamera(dt);
      this.weapons.update(dt, st === 'playing' ? this.input : this.idleInput());
      this.enemies.update(dt);
      this.director.update(dt);
      this.props.update(dt);
      this.grenades.update(dt);
    } else if (st === 'menu') {
      this.menuCamera(dt);
    }

    if (st !== 'paused' && st !== 'shop') {
      this.fx.update(dt);
      this.audio && this.audio.update(dt);
    }

    // screen effects
    const u = this.gr.uniforms;
    if (sim) {
      const p = this.player;
      p.damageFlash = Math.max(0, p.damageFlash - dt * 1.6);
      u.damage.value = p.damageFlash;
      // red vignette below 40 health, heartbeat below 25
      u.lowHealth.value = p.alive ? clamp((PLAYER.lowHealthVignette - p.health) / PLAYER.lowHealthVignette, 0, 1) : 0;
      this.audio.lowHealth = p.alive ? clamp((PLAYER.heartbeatBelow - p.health) / PLAYER.heartbeatBelow, 0, 1) : 0;
      if (!p.alive) u.fade.value = clamp(1 - (p.time - p.deadAt - 0.8) * 0.45, 0.25, 1);
    }

    if (st === 'playing' || st === 'dead' || st === 'victory') {
      this.hud.update(dt, realDt);
      // new materials (spawned props) must join the cascaded shadows before they are drawn
      if ((this.frameNo = (this.frameNo || 0) + 1) % 90 === 0) this.gr.prepareScene();
    }
    this.gr.viewScene.visible = st === 'playing' || st === 'victory';
    if (!this.skipRender) this.gr.render(st === 'paused' || st === 'shop' ? 0 : dt);

    // automatic quality control
    if (st === 'playing' && !document.hidden && raw < 0.2) this.watchPerformance(raw);
  }

  idleInput() {
    return this._idle || (this._idle = {
      action: () => false, actionPressed: () => false, actionRecent: () => false, clearActionRecent() {},
      isDown: () => false, pressed: () => false, takeWheel: () => 0, left: false, right: false,
    });
  }

  watchPerformance(dt) {
    this.fpsAvg = lerp(this.fpsAvg, 1 / dt, 0.04);
    this.qualityCooldown = Math.max(0, this.qualityCooldown - dt);
    if (!this.settings.autoQuality || this.qualityCooldown > 0) return;
    if (this.fpsAvg < 38) this.lowTime += dt; else this.lowTime = Math.max(0, this.lowTime - dt);
    if (this.lowTime > 3.5) {
      const i = QUALITY_ORDER.indexOf(this.settings.quality);
      if (i > 0) {
        const next = QUALITY_ORDER[i - 1];
        this.applyQuality(next);
        this.hud.toast(t('qualityDropped') + ' ' + t('q_' + next));
      }
      this.lowTime = 0;
      this.qualityCooldown = 8;
    }
  }

  // ------------------------------------------------------ test and debug
  /** Run n frames synchronously, for automated checks. render=false skips drawing (fast). */
  stepFrames(n = 1, dt = 1 / 60, render = true) {
    this.skipRender = !render;
    try { for (let i = 0; i < n; i++) this.frame(dt); } finally { this.skipRender = false; }
  }

  /**
   * Count the separate objects (props, details, small clutter) a player would see
   * from a given eye position and heading. Walls, ground and sky do not count.
   */
  countVisibleItems(x, y, z, yaw, pitch = 0) {
    const cam = this.gr.camera;
    cam.position.set(x, y, z);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const v = new THREE.Vector3();
    const colliders = this.world.colliders;
    let n = 0;
    const test = (px, py, pz) => {
      v.set(px, py, pz);
      if (!frustum.containsPoint(v)) return;
      const d = Math.hypot(px - x, py - y, pz - z);
      if (d > 55 || d < 0.5) return;
      const k = 0.5 / d;
      if (lineOfSight(colliders, x, y, z, px + (x - px) * k, py + (y - py) * k, pz + (z - pz) * k)) n++;
    };
    const items = this.world.items;
    for (let i = 0; i < items.length; i += 3) test(items[i], items[i + 1], items[i + 2]);
    for (const c of this.props.crates) if (c.alive) test(c.x, c.y + c.size / 2, c.z);
    for (const b of this.props.barrels) test(b.x, 0.45, b.z);
    for (const p of this.props.pickups) test(p.x, p.y + 0.4, p.z);
    return n;
  }

  /** A plain data view of the game, handy for tests and bug reports. */
  snapshot() {
    const p = this.player, d = this.director, w = this.weapons;
    return {
      state: this.state, time: +this.time.toFixed(2), wave: d.wave, phase: d.phase, endless: d.endless,
      enemiesAlive: this.enemies.aliveCount(), enemiesLeft: d.remaining(),
      player: { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), health: Math.round(p.health), alive: p.alive },
      weapon: { id: w.cur.id, mag: w.cur.mag, reserve: w.cur.reserve },
      score: d.stats.score, kills: d.stats.kills, quality: this.settings.quality,
    };
  }

  /** Dev only: saves the canvas through tools/shot-server.mjs. Needs ?shots in the page address. */
  async shot(name) {
    if (!/[?&]shots(&|$)/.test(location.search)) throw new Error('add ?shots to the page address to use shot()');
    this.gr.render(0);
    const data = this.canvas.toDataURL('image/jpeg', 0.92);
    const r = await fetch('http://127.0.0.1:5175/shot?name=' + name, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } });
    return r.text();
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  const label = document.getElementById('load-label');
  if (label) label.textContent = 'Error: ' + (e && e.message ? e.message : e);
});
