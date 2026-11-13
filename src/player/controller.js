// Player: first person movement with sprint, crouch, jump and ledge stepping,
// camera effects (bob, lean, landing dip, recoil, shake) and health.

import * as THREE from 'three';
import { stepBody, overlapsAny, clamp, damp, lerp } from '../core/collision.js';
import { PLAYER, MAP_HALF } from '../config.js';
import { moveSpeed } from '../core/rules.js';
import { damagePlayer } from '../core/waves.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.body = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      radius: PLAYER.radius, height: PLAYER.height, onGround: true,
    };
    this.pos = this.body;
    this.yaw = 0;
    this.pitch = 0;
    this.alive = true;
    this.crouch = 0;
    this.crouchHeld = false;
    this.sprinting = false;
    this.moving = false;
    this.speedFrac = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.landDip = 0;
    this.lean = 0;
    this.recoil = { pitch: 0, yaw: 0 };
    this.shakeAmt = 0;
    this.lookDX = 0;
    this.lookDY = 0;
    this.time = 0;
    this.stepAcc = 0;
    this.coyote = 0;
    this.prevVY = 0;
    this.forward = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.damageFlash = 0;
  }

  reset() {
    const s = this.game.world.playerStart;
    Object.assign(this.body, { x: s.x, y: 0, z: s.z, vx: 0, vy: 0, vz: 0, height: PLAYER.height, onGround: true });
    this.yaw = s.yaw;
    this.pitch = 0;
    this.alive = true;
    this.crouch = 0;
    this.crouchHeld = false;
    this.recoil.pitch = this.recoil.yaw = 0;
    this.shakeAmt = 0;
    this.landDip = 0;
    this.damageFlash = 0;
  }

  // names of the controller contract
  get position() { return this.pos; }
  get camera() { return this.game.gr.camera; }
  get isAds() { return this.adsFactor > 0.5; }
  get grounded() { return this.pos.onGround; }
  get speed() { return Math.hypot(this.pos.vx, this.pos.vz); }
  get aim() { return this.forward; }
  teleport(p) { this.pos.x = p.x; this.pos.y = p.y ?? 0; this.pos.z = p.z; this.pos.vx = this.pos.vy = this.pos.vz = 0; }

  // The health lives in the game state (core/waves) together with the score.
  get health() { return this.game.director.core.player.health; }
  set health(v) { this.game.director.core.player.health = v; }
  get maxHealth() { return PLAYER.maxHealth; }

  get adsFactor() { return this.game.weapons ? this.game.weapons.adsAmount() : 0; }

  eyeHeight() { return lerp(PLAYER.eye, PLAYER.crouchEye, this.crouch); }

  eyePos(out = this.eye) {
    return out.set(this.body.x, this.body.y + this.eyeHeight(), this.body.z);
  }

  // ------------------------------------------------------------ look
  /** Apply accumulated mouse movement. Called once per rendered frame. */
  look(dx, dy) {
    const s = this.game.settings;
    const zoom = this.game.weapons ? this.game.weapons.zoomRatio() : 1;
    const k = 0.0022 * s.sens * zoom;
    this.lookDX = dx * k;
    this.lookDY = dy * k * (s.invertY ? -1 : 1);
    this.yaw -= this.lookDX;
    this.pitch -= this.lookDY;
    this.pitch = clamp(this.pitch, -1.48, 1.48);
  }

  addRecoil(pitch, yaw) {
    this.recoil.pitch += pitch;
    this.recoil.yaw += yaw;
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  // ---------------------------------------------------------- physics
  /** Fixed time step update. */
  step(dt, input) {
    this.time += dt; // keeps running when dead: the death camera and the fade depend on it
    if (!this.alive) {
      this.body.vx = damp(this.body.vx, 0, 6, dt);
      this.body.vz = damp(this.body.vz, 0, 6, dt);
      stepBody(this.body, dt, this.game.world.colliders, { gravity: PLAYER.gravity });
      return;
    }
    const b = this.body;
    const g = this.game;

    // input vector in the local frame
    const fwd = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const str = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fwd + cy * str;
    let wz = -cy * fwd - sy * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    this.moving = wl > 0.01;

    // crouch, standing up needs headroom
    const wantCrouch = input.isDown('KeyC') || input.isDown('ControlLeft');
    if (wantCrouch) this.crouchHeld = true;
    else if (this.crouchHeld) {
      const test = { ...b, height: PLAYER.height };
      if (!overlapsAny(test, g.world.colliders)) this.crouchHeld = false;
    }
    this.crouch = damp(this.crouch, this.crouchHeld ? 1 : 0, 12, dt);
    b.height = lerp(PLAYER.height, PLAYER.crouchHeight, this.crouch);

    // speed
    const wantSprint = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && fwd > 0 && !this.crouchHeld && this.adsFactor < 0.3 && !g.weapons.firingLock();
    this.sprinting = wantSprint && b.onGround;
    if (wantSprint && !b.onGround) this.sprinting = this.sprinting || false;
    const speed = moveSpeed({ crouched: this.crouchHeld, sprinting: this.sprinting, ads: this.adsFactor, backwards: fwd < 0 });
    const tx = wx * speed, tz = wz * speed;

    if (b.onGround) {
      const accel = this.moving ? 16 : 11;
      b.vx = damp(b.vx, tx, accel, dt);
      b.vz = damp(b.vz, tz, accel, dt);
      this.coyote = 0.09;
    } else {
      b.vx = damp(b.vx, tx, 2.2, dt);
      b.vz = damp(b.vz, tz, 2.2, dt);
      this.coyote -= dt;
    }

    // jump
    if (input.recent('Space', 130) && (b.onGround || this.coyote > 0) && !this.crouchHeld) {
      b.vy = PLAYER.jump;
      b.onGround = false;
      this.coyote = 0;
      input.clearRecent('Space');
      g.audio.jump();
    }

    this.prevVY = b.vy;
    const wasGround = b.onGround;
    stepBody(b, dt, g.world.colliders, { gravity: PLAYER.gravity, stepHeight: 0.46 });

    // keep inside the map
    const lim = MAP_HALF - 0.7;
    b.x = clamp(b.x, -lim, lim);
    b.z = clamp(b.z, -lim, lim);

    // landing
    if (!wasGround && b.onGround && this.prevVY < -4) {
      const hard = clamp(-this.prevVY / 12, 0.3, 1.6);
      this.landDip = Math.max(this.landDip, 0.06 * hard);
      g.audio.land(hard);
      if (this.prevVY < -15) this.damage((-this.prevVY - 15) * 7, b.x, b.z, 'fall');
      this.shake(0.12 * hard);
    }

    // movement state for camera and weapon
    const hs = Math.hypot(b.vx, b.vz);
    this.speedFrac = clamp(hs / PLAYER.sprint, 0, 1);

    // footsteps
    if (b.onGround && hs > 0.8) {
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 2.5 : this.crouchHeld ? 3.2 : 2.1;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        if (!this.crouchHeld) {
          g.audio.step(this.pos.y > 0.5 ? 'concrete' : (Math.abs(b.x) < 6 || Math.abs(b.z) < 6 ? 'concrete' : 'dirt'), this.sprinting);
          g.enemies.noise(b.x, b.z, this.sprinting ? 16 : 7);
        }
      }
    }

  }

  // ----------------------------------------------------------- camera
  updateCamera(dt) {
    const cam = this.game.gr.camera;
    const b = this.body;
    const ads = this.adsFactor;

    // view bob follows distance walked
    const walking = b.onGround && this.speedFrac > 0.05;
    this.bobAmp = damp(this.bobAmp, walking ? this.speedFrac : 0, 8, dt);
    if (walking) this.bobPhase += dt * (this.sprinting ? 12.5 : this.crouchHeld ? 6.5 : 9.0) * (0.6 + 0.6 * this.speedFrac);
    const bobY = Math.sin(this.bobPhase * 2) * 0.026 * this.bobAmp * (1 - 0.7 * ads);
    const bobX = Math.sin(this.bobPhase) * 0.018 * this.bobAmp * (1 - 0.7 * ads);

    this.landDip = damp(this.landDip, 0, 9, dt);

    // lean into strafing
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const rightSpeed = b.vx * cy - b.vz * sy;
    this.lean = damp(this.lean, clamp(-rightSpeed / PLAYER.sprint, -1, 1) * 0.03, 8, dt);

    // recoil recovers on its own
    const rec = this.recoil;
    rec.pitch = damp(rec.pitch, 0, 7, dt);
    rec.yaw = damp(rec.yaw, 0, 7, dt);

    // explosion shake
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.8);
    const sh = this.shakeAmt * this.shakeAmt;
    const jx = (Math.random() - 0.5) * 0.06 * sh, jy = (Math.random() - 0.5) * 0.06 * sh;

    const eyeY = b.y + this.eyeHeight() + bobY - this.landDip;
    cam.position.set(b.x + bobX * Math.cos(this.yaw) + jx, eyeY + jy, b.z - bobX * Math.sin(this.yaw));
    cam.rotation.order = 'YXZ';
    let death = 0;
    if (!this.alive) death = Math.min(1, (this.time - this.deadAt) * 1.6);
    cam.rotation.set(
      this.pitch + rec.pitch + (Math.random() - 0.5) * 0.04 * sh,
      this.yaw + rec.yaw,
      this.lean + (Math.random() - 0.5) * 0.04 * sh + death * 0.9,
    );
    if (!this.alive) cam.position.y = Math.max(0.35, eyeY - death * 1.1);

    cam.getWorldDirection(this.forward);
    this.game.gr.setFov(this.game.settings.fov * this.game.weapons.zoomRatio());
  }

  // ----------------------------------------------------------- health
  damage(amount, srcX, srcZ, kind = 'bullet') {
    if (!this.alive || amount <= 0) return;
    if (this.game.godMode) return;
    if (this.game.state === 'victory') return; // the fight is won: a late explosion cannot kill
    const r = damagePlayer(this.game.director.core, amount, this.game.time * 1000);
    this.damageFlash = Math.min(1, this.damageFlash + amount / 45);
    const ang = Math.atan2(srcX - this.body.x, srcZ - this.body.z);
    // Angle of the source relative to where we look. The view direction has
    // atan2 angle yaw + PI, so 0 means straight ahead and -PI/2 means to the right.
    const rel = ang - (this.yaw + Math.PI);
    this.game.hud.damageFrom(rel, amount);
    this.game.audio.hurt(amount);
    this.shake(0.12 + amount / 80);
    this.addRecoil((Math.random() - 0.3) * 0.02 * Math.min(amount, 20) / 10, (Math.random() - 0.5) * 0.02);
    if (r.dead) this.die(kind);
  }

  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  die(kind) {
    this.alive = false;
    this.deadAt = this.time;
    this.game.onPlayerDeath(kind);
  }
}

/** The player in the scene: movement, camera, health. */
export function createPlayer(game) { return new Player(game); }
