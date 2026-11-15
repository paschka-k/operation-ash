// Synthesised audio with the Web Audio API. No sound files. Positional sounds
// use a panner, a shared convolution reverb adds space, wind and distant
// gunfire provide the ambience.

import { VEHICLES } from '../core/rules.js';

const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();

// ---- wave 14: the vehicles' running sound.
// At most this many engines sound at once (the nearest); each one is a fixed graph of nodes.
const ENGINE_CHANNELS = 3;
const ENGINE_STALE_MS = 300;   // a voice not updated for this long counts as gone
const ENGINE_HOLD = 0.3;       // seconds a channel keeps sounding after its last update
// engine: loudness of a combustion engine (0: none); idle and top: its pitch in Hz at idle and at the top
// of a gear; gears; fire: the rate of the firing chop per cycle of the pitch; chop: its depth.
// whine: [loudness, Hz added at full speed] of an electric motor.
// roll: [loudness, band Hz, metres between the joints of the pavement, depth of their knock].
const ENGINE_SOUND = {
  scooter: { engine: 0, idle: 0, top: 0, gears: 0, fire: 1, chop: 0, whine: [0.16, 950], roll: [0.12, 1700, 1.2, 0.2] },
  skate: { engine: 0, idle: 0, top: 0, gears: 0, fire: 1, chop: 0, whine: [0, 0], roll: [0.42, 700, 0.9, 0.55] },
  moto: { engine: 0.36, idle: 34, top: 105, gears: 4, fire: 0.5, chop: 0.35, whine: [0, 0], roll: [0.08, 500, 2, 0.1] },
  heavyMoto: { engine: 0.46, idle: 24, top: 68, gears: 4, fire: 0.5, chop: 0.55, whine: [0, 0], roll: [0.1, 400, 2, 0.1] },
};

// Shots of the wave 13 guns: crack [Hz, s, gain], body [Hz, s, gain, end Hz, rate], thump [Hz, s, gain, end Hz],
// hiss [Hz, s, gain], echo [delay s, s, gain] (a far wall answering), send: share into the reverb.
const GUN13 = {
  smg: { send: 0.28, crack: [4200, 0.06, 0.7], body: [1500, 0.15, 0.55, 220, 0.8], thump: [170, 0.1, 0.6, 50] },
  carbine: { send: 0.34, crack: [3000, 0.11, 0.85], body: [1300, 0.32, 0.85, 150, 0.7], thump: [105, 0.2, 1.0, 36], hiss: [5000, 0.12, 0.2] },
  sniper: { send: 0.7, crack: [2600, 0.14, 1.0], body: [1100, 0.9, 1.2, 70, 0.5], thump: [80, 0.45, 1.2, 26], hiss: [4500, 0.2, 0.3], echo: [0.32, 0.8, 0.35] },
  lmg: { send: 0.36, crack: [3100, 0.1, 0.8], body: [1300, 0.28, 0.8, 160, 0.7], thump: [110, 0.17, 0.95, 40], hiss: [5000, 0.1, 0.16] },
};

export class AudioSys {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.volume = game.settings.volume;
    this.muted = game.settings.sound === false;
    this.ready = false;
    this.ambTimer = 3;
    this.heartTimer = 0;
    this.lowHealth = 0;
    this.lastStep = 0;
    this.engines = new Set();   // live voices from engine(), sounding or waiting for a channel
  }

  // ------------------------------------------------------------- setup
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // white noise buffer, looped slices are used for all noisy sounds
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // simple synthetic room for the reverb send
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.6), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < ch.length; i++) {
        const t = i / ch.length;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (1 - Math.exp(-i / 800));
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.32;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.ready = true;
    this._startAmbience();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  /** Sound on or off (the same switch as the pause menu). */
  setEnabled(b) { this.setMuted(!b); }

  /**
   * Play a named sound. names: pistol, rifle, shotgun, enemy, reload, dry, switch, hit, kill, hurt, step,
   * jump, land, explosion, crate, pickup, death, victory, waveStart, waveClear, telegraph, shell, pump, whiz,
   * vehicleCrash, bossIntro, impact:concrete|metal|wood|flesh. opts: {pan: world position {x,y,z}, volume}.
   */
  play(name, opts = {}) {
    if (!this.ready) return;
    const pos = opts.pan || null;
    const [base, arg] = name.split(':');
    switch (base) {
      case 'pistol': case 'rifle': case 'shotgun': case 'enemy': case 'enemyPistol': this.gun(base, pos); break;
      case 'reload': this.reload(arg || 'rifle', 2); break;
      case 'dry': this.dryFire(); break;
      case 'switch': this.switchWeapon(); break;
      case 'hit': this.hitmarker(false, false); break;
      case 'kill': this.hitmarker(true, false); break;
      case 'hurt': this.hurt(opts.volume ? opts.volume * 20 : 12); break;
      case 'step': this.step(arg || 'concrete', false); break;
      case 'jump': this.jump(); break;
      case 'land': this.land(1); break;
      case 'impact': this.impact(arg || 'concrete', pos); break;
      case 'whiz': this.whiz(pos || { x: 0, y: 1.6, z: 0 }); break;
      case 'explosion': this.explosion(pos ? pos.x : 0, pos ? pos.y : 0, pos ? pos.z : 0); break;
      case 'crate': this.crateBreak(pos ? pos.x : 0, pos ? pos.y : 0, pos ? pos.z : 0); break;
      case 'pickup': this.pickup(); break;
      case 'death': this.death(); break;
      case 'victory': this.victory(); break;
      case 'waveStart': this.waveStart(); break;
      case 'waveClear': this.waveClear(); break;
      case 'telegraph': this.telegraph(pos); break;
      case 'shell': this.shell(); break;
      case 'pump': this.pump(); break;
      case 'vehicleCrash': this.vehicleCrash(pos || { x: 0, y: 0, z: 0 }); break;
      case 'bossIntro': this.bossIntro(); break;
      default: break;
    }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.03);
  }

  /** Sound on/off. The choice is kept for the whole session. */
  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  setListener(p, fwd) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // ----------------------------------------------------------- building blocks
  /** Output node for a sound. With a position it is spatialised. */
  _bus(pos, reverbSend = 0.25) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 6;
      p.rolloffFactor = 1.15;
      p.maxDistance = 200;
      if (p.positionX) {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = reverbSend;
      p.connect(send);
      send.connect(this.reverb);
    } else {
      g.connect(this.master);
      const send = ctx.createGain();
      send.gain.value = reverbSend * 0.6;
      g.connect(send);
      send.connect(this.reverb);
    }
    return g;
  }

  /** Filtered noise burst. */
  _noise(dest, { t = 0, dur = 0.1, type = 'bandpass', f = 1500, f2 = null, q = 1, gain = 0.5, attack = 0.001, rate = 1 }) {
    const ctx = this.ctx, t0 = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate * rr(0.92, 1.08);
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t0);
    if (f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(dest);
    src.start(t0, rnd() * 1.5, dur + 0.05);
  }

  /** Pitched tone with a frequency sweep. */
  _tone(dest, { t = 0, dur = 0.15, type = 'sine', f = 200, f2 = null, gain = 0.5, attack = 0.002 }) {
    const ctx = this.ctx, t0 = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(10, f2), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------- guns
  /** kind: 'pistol' | 'rifle' | 'enemy' | 'enemyPistol'. pos is optional world position. */
  gun(kind, pos = null) {
    if (!this.ready) return;
    if (kind === 'shotgun') { this._shotgun(pos); return; }
    if (GUN13[kind]) { this._gun13(GUN13[kind], pos); return; }
    if (kind === 'minigun' || kind === 'flamer') return;     // continuous sounds: weaponLoops()
    const rifle = kind === 'rifle' || kind === 'enemy';
    const far = pos ? Math.hypot(pos.x - this.game.gr.camera.position.x, pos.z - this.game.gr.camera.position.z) : 0;
    const dest = this._bus(pos, pos ? 0.45 : 0.3);
    const dull = Math.min(1, far / 60);
    const crackF = (rifle ? 3200 : 3800) * (1 - dull * 0.6);
    this._noise(dest, { dur: rifle ? 0.1 : 0.08, type: 'bandpass', f: crackF, f2: 900, q: 0.7, gain: pos ? 0.55 : 0.8, rate: 1.2 });
    this._noise(dest, { dur: rifle ? 0.26 : 0.2, type: 'lowpass', f: 1400, f2: 180, q: 0.6, gain: 0.7, rate: 0.7 });
    this._tone(dest, { dur: rifle ? 0.16 : 0.13, type: 'sine', f: rifle ? 120 : 150, f2: 42, gain: 0.85 });
    if (rifle) this._noise(dest, { t: 0.02, dur: 0.12, type: 'highpass', f: 5000, q: 0.5, gain: 0.18 });
  }

  _shotgun(pos) {
    const dest = this._bus(pos, 0.5);
    this._noise(dest, { dur: 0.09, type: 'bandpass', f: 2600, f2: 700, q: 0.6, gain: 0.9, rate: 1.0 });
    this._noise(dest, { dur: 0.5, type: 'lowpass', f: 1500, f2: 110, q: 0.6, gain: 1.1, rate: 0.5 });
    this._tone(dest, { dur: 0.32, type: 'sine', f: 95, f2: 30, gain: 1.1 });
    this._noise(dest, { t: 0.03, dur: 0.18, type: 'highpass', f: 4000, q: 0.5, gain: 0.25 });
  }

  // ---- wave 13: new weapons, the minigun and the flamer as loops, grenades
  /** A shot of one of the wave 13 guns; p is its row of GUN13. */
  _gun13(p, pos) {
    const far = pos ? Math.hypot(pos.x - this.game.gr.camera.position.x, pos.z - this.game.gr.camera.position.z) : 0;
    const dest = this._bus(pos, p.send);
    const dull = Math.min(1, far / 60);
    this._noise(dest, { dur: p.crack[1], type: 'bandpass', f: p.crack[0] * (1 - dull * 0.6), f2: 900, q: 0.7, gain: p.crack[2], rate: 1.2 });
    this._noise(dest, { dur: p.body[1], type: 'lowpass', f: p.body[0], f2: p.body[3], q: 0.6, gain: p.body[2], rate: p.body[4] });
    this._tone(dest, { dur: p.thump[1], type: 'sine', f: p.thump[0], f2: p.thump[3], gain: p.thump[2] });
    if (p.hiss) this._noise(dest, { t: 0.02, dur: p.hiss[1], type: 'highpass', f: p.hiss[0], q: 0.5, gain: p.hiss[2] });
    if (p.echo) this._noise(dest, { t: p.echo[0], dur: p.echo[1], type: 'lowpass', f: 700, f2: 120, q: 0.6, gain: p.echo[2], attack: 0.05, rate: 0.6 });
  }

  /**
   * Continuous weapon sounds, set every frame by the shooting layer: the whine of the minigun's
   * barrels (spin 0..1), its buzz while it fires, the roar of the flamer. All silent when nothing runs.
   */
  weaponLoops(spin = 0, firing = false, flame = false) {
    if (!this.ready) return;
    if (!this._loops) {
      if (spin <= 0 && !firing && !flame) return;
      this._loops = this._makeLoops();
    }
    const L = this._loops, t = this.ctx.currentTime;
    L.whine.frequency.setTargetAtTime(90 + 640 * spin, t, 0.05);
    L.whine2.frequency.setTargetAtTime(46 + 322 * spin, t, 0.05);
    L.whineGain.gain.setTargetAtTime(spin > 0.01 ? 0.025 + 0.07 * spin : 0, t, 0.05);
    L.buzzGain.gain.setTargetAtTime(firing ? 0.6 : 0, t, firing ? 0.01 : 0.04);
    L.flameGain.gain.setTargetAtTime(flame ? 0.6 : 0, t, flame ? 0.03 : 0.12);
  }

  _makeLoops() {
    const ctx = this.ctx, out = this._bus(null, 0.25);
    const loop = (rate = 1) => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate; return s; };
    const filter = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    // whine: two oscillators through a band, rising with the barrels
    const whine = osc('sawtooth', 90), whine2 = osc('square', 46), wf = filter('bandpass', 900, 0.7), whineGain = gain(0);
    whine.connect(wf); whine2.connect(wf); wf.connect(whineGain); whineGain.connect(out);
    // buzz: noise and a growl chopped thirty times a second, one chop per round
    const buzz = loop(), bf = filter('lowpass', 2400, 0.5), growl = osc('sawtooth', 60), gf = filter('lowpass', 320, 0.7);
    const chop = gain(0.5), lfo = osc('square', 30), depth = gain(0.5), buzzGain = gain(0);
    lfo.connect(depth); depth.connect(chop.gain);
    buzz.connect(bf); bf.connect(chop); growl.connect(gf); gf.connect(chop); chop.connect(buzzGain); buzzGain.connect(out);
    // roar: low rumbling noise with a crackle on top
    const roar = loop(0.6), rf = filter('lowpass', 650, 0.8), crack = loop(1.3), cf = filter('bandpass', 2600, 1.5), crackle = gain(0.22), flameGain = gain(0);
    roar.connect(rf); rf.connect(flameGain); crack.connect(cf); cf.connect(crackle); crackle.connect(flameGain); flameGain.connect(out);
    for (const n of [whine, whine2, buzz, growl, lfo, roar, crack]) n.start();
    return { whine, whine2, whineGain, buzzGain, flameGain };
  }

  /** The sniper's bolt worked after a shot: lift, pull, push, lock. */
  bolt() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.08);
    this._noise(dest, { t: 0.1, dur: 0.04, type: 'bandpass', f: 2400, q: 3, gain: 0.4 });
    this._noise(dest, { t: 0.3, dur: 0.07, type: 'bandpass', f: 1500, q: 2, gain: 0.5 });
    this._tone(dest, { t: 0.3, dur: 0.06, type: 'square', f: 700, f2: 420, gain: 0.04 });
    this._noise(dest, { t: 0.56, dur: 0.06, type: 'bandpass', f: 1900, q: 2.5, gain: 0.5 });
    this._noise(dest, { t: 0.8, dur: 0.05, type: 'bandpass', f: 2800, q: 3, gain: 0.45 });
    this._tone(dest, { t: 0.8, dur: 0.06, type: 'sine', f: 240, f2: 120, gain: 0.18 });
  }

  /** The pin pulled out of a grenade. */
  grenadePin() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.05);
    this._tone(dest, { dur: 0.06, type: 'triangle', f: 2600, f2: 2100, gain: 0.12 });
    this._noise(dest, { t: 0.05, dur: 0.04, type: 'bandpass', f: 3300, q: 4, gain: 0.28 });
  }

  /** The arm swinging and letting go. */
  grenadeThrow() {
    if (!this.ready) return;
    this._noise(this._bus(null, 0.05), { dur: 0.24, type: 'bandpass', f: 450, f2: 1900, q: 1.2, gain: 0.3, attack: 0.07 });
  }

  /** A grenade hitting something: a metal clink and a thud, louder the faster it was. */
  grenadeBounce(pos, speed = 5) {
    if (!this.ready) return;
    const k = Math.min(1, speed / 10), dest = this._bus(pos, 0.15);
    this._tone(dest, { dur: 0.12, type: 'triangle', f: rr(1400, 1900), f2: rr(900, 1200), gain: 0.05 + 0.2 * k });
    this._noise(dest, { dur: 0.06, type: 'lowpass', f: 900, q: 0.7, gain: 0.06 + 0.4 * k });
  }

  /** One shell pushed into a pump gun. */
  shell() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.05);
    this._noise(dest, { dur: 0.045, type: 'bandpass', f: 1700, q: 3, gain: 0.45 });
    this._tone(dest, { dur: 0.06, type: 'triangle', f: 420, f2: 260, gain: 0.12 });
  }

  /** Pump action: forend back and forward. */
  pump() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.15);
    this._noise(dest, { dur: 0.07, type: 'bandpass', f: 1100, q: 2, gain: 0.55 });
    this._tone(dest, { dur: 0.08, type: 'sine', f: 160, f2: 90, gain: 0.25 });
    this._noise(dest, { t: 0.17, dur: 0.07, type: 'bandpass', f: 1900, q: 2.5, gain: 0.6 });
    this._tone(dest, { t: 0.17, dur: 0.08, type: 'sine', f: 200, f2: 110, gain: 0.3 });
  }

  dryFire() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.05);
    this._noise(dest, { dur: 0.03, type: 'bandpass', f: 2800, q: 3, gain: 0.35 });
  }

  reload(kind, duration) {
    if (!this.ready) return;
    const dest = this._bus(null, 0.08);
    const k = kind === 'rifle' ? 1 : 0;
    this._noise(dest, { t: duration * 0.3, dur: 0.05, type: 'bandpass', f: 2600, q: 4, gain: 0.45 });
    this._tone(dest, { t: duration * 0.3, dur: 0.05, type: 'square', f: 900, f2: 500, gain: 0.05 });
    this._noise(dest, { t: duration * 0.62, dur: 0.07, type: 'bandpass', f: 1500, q: 2, gain: 0.55 });
    this._tone(dest, { t: duration * 0.62, dur: 0.08, type: 'sine', f: 180, f2: 90, gain: 0.35 });
    this._noise(dest, { t: duration * 0.84, dur: 0.09, type: 'bandpass', f: 2200 + k * 400, f2: 900, q: 1.5, gain: 0.55 });
    this._noise(dest, { t: duration * 0.88, dur: 0.05, type: 'bandpass', f: 3200, q: 4, gain: 0.4 });
  }

  switchWeapon() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.05);
    this._noise(dest, { dur: 0.12, type: 'lowpass', f: 900, q: 0.5, gain: 0.25 });
    this._noise(dest, { t: 0.14, dur: 0.04, type: 'bandpass', f: 2400, q: 4, gain: 0.35 });
  }

  // ------------------------------------------------------------ feedback
  hitmarker(kill = false, head = false) {
    if (!this.ready) return;
    const dest = this._bus(null, 0);
    if (kill) {
      this._tone(dest, { dur: 0.16, type: 'triangle', f: 520, f2: 260, gain: 0.35 });
      this._noise(dest, { dur: 0.08, type: 'bandpass', f: 1200, q: 1, gain: 0.25 });
    } else {
      this._tone(dest, { dur: 0.05, type: 'triangle', f: head ? 1900 : 1350, gain: 0.28 });
    }
    if (head) this._tone(dest, { t: 0.02, dur: 0.2, type: 'sine', f: 2600, f2: 2200, gain: 0.12 });
  }

  hurt(amount = 10) {
    if (!this.ready) return;
    const dest = this._bus(null, 0.1);
    const g = Math.min(0.9, 0.3 + amount / 50);
    this._tone(dest, { dur: 0.22, type: 'sine', f: 90, f2: 45, gain: g });
    this._noise(dest, { dur: 0.15, type: 'lowpass', f: 700, q: 0.8, gain: g * 0.5 });
  }

  heartbeat() {
    if (!this.ready) return;
    const dest = this._bus(null, 0);
    this._tone(dest, { dur: 0.16, type: 'sine', f: 62, f2: 40, gain: 0.55 });
    this._tone(dest, { t: 0.2, dur: 0.14, type: 'sine', f: 55, f2: 36, gain: 0.4 });
  }

  step(kind = 'concrete', sprint = false) {
    if (!this.ready) return;
    const dest = this._bus(null, 0.04);
    const f = kind === 'dirt' ? 500 : 900;
    this._noise(dest, { dur: 0.07, type: 'lowpass', f: f * rr(0.8, 1.3), f2: 200, q: 0.7, gain: sprint ? 0.18 : 0.12 });
    this._noise(dest, { dur: 0.03, type: 'bandpass', f: 1800, q: 2, gain: sprint ? 0.06 : 0.03 });
  }

  jump() {
    if (!this.ready) return;
    this._noise(this._bus(null, 0), { dur: 0.1, type: 'lowpass', f: 700, q: 0.6, gain: 0.14 });
  }

  land(power = 1) {
    if (!this.ready) return;
    const dest = this._bus(null, 0.08);
    this._noise(dest, { dur: 0.12, type: 'lowpass', f: 600, f2: 150, q: 0.7, gain: Math.min(0.5, 0.18 * power) });
    this._tone(dest, { dur: 0.1, type: 'sine', f: 80, f2: 40, gain: Math.min(0.5, 0.2 * power) });
  }

  // -------------------------------------------------------- world sounds
  impact(kind, pos) {
    if (!this.ready) return;
    const dest = this._bus(pos, 0.2);
    if (kind === 'metal') {
      this._tone(dest, { dur: 0.35, type: 'sine', f: rr(2400, 3600), f2: rr(1800, 2400), gain: 0.18 });
      this._noise(dest, { dur: 0.05, type: 'bandpass', f: 3500, q: 2, gain: 0.3 });
    } else if (kind === 'wood') {
      this._noise(dest, { dur: 0.08, type: 'bandpass', f: 700, q: 1.2, gain: 0.4 });
      this._tone(dest, { dur: 0.07, type: 'sine', f: 240, f2: 150, gain: 0.25 });
    } else if (kind === 'flesh') {
      this._noise(dest, { dur: 0.08, type: 'lowpass', f: 500, q: 0.7, gain: 0.45 });
      this._tone(dest, { dur: 0.1, type: 'sine', f: 120, f2: 60, gain: 0.3 });
    } else {
      this._noise(dest, { dur: 0.07, type: 'bandpass', f: 1800, f2: 800, q: 1, gain: 0.35 });
      this._noise(dest, { t: 0.01, dur: 0.1, type: 'lowpass', f: 600, q: 0.6, gain: 0.25 });
    }
  }

  /** Short rising chirp when a bot starts to aim, so the player is warned. */
  telegraph(pos) {
    if (!this.ready) return;
    const dest = this._bus(pos, 0.1);
    this._tone(dest, { dur: 0.1, type: 'sine', f: 1500, f2: 2300, gain: 0.07 });
  }

  whiz(pos) {
    if (!this.ready) return;
    const dest = this._bus(pos, 0.05);
    this._noise(dest, { dur: 0.18, type: 'bandpass', f: 3600, f2: 1100, q: 4, gain: 0.5, attack: 0.04 });
  }

  explosion(x, y, z) {
    if (!this.ready) return;
    const dest = this._bus({ x, y, z }, 0.9);
    this._noise(dest, { dur: 1.6, type: 'lowpass', f: 900, f2: 60, q: 0.8, gain: 1.5, attack: 0.008, rate: 0.55 });
    this._tone(dest, { dur: 0.9, type: 'sine', f: 70, f2: 24, gain: 1.4 });
    this._noise(dest, { dur: 0.25, type: 'bandpass', f: 2400, f2: 600, q: 0.6, gain: 0.8 });
    this._noise(dest, { t: 0.08, dur: 0.5, type: 'highpass', f: 3000, q: 0.5, gain: 0.25 });
  }

  crateBreak(x, y, z) {
    if (!this.ready) return;
    const dest = this._bus({ x, y, z }, 0.2);
    this._noise(dest, { dur: 0.18, type: 'bandpass', f: 900, f2: 400, q: 0.9, gain: 0.7 });
    for (let i = 0; i < 4; i++) this._noise(dest, { t: 0.04 + i * 0.05 + rnd() * 0.03, dur: 0.05, type: 'bandpass', f: rr(500, 1200), q: 2, gain: 0.3 });
  }

  pickup() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.2);
    this._tone(dest, { dur: 0.12, type: 'triangle', f: 660, gain: 0.28 });
    this._tone(dest, { t: 0.08, dur: 0.2, type: 'triangle', f: 990, gain: 0.28 });
  }

  /** A purchase in the shop: a coin clink and a bright two-note chime. ok=false is a dull refusal. */
  purchase(ok = true) {
    if (!this.ready) return;
    const dest = this._bus(null, 0.18);
    if (!ok) {
      this._tone(dest, { dur: 0.16, type: 'square', f: 180, f2: 140, gain: 0.07 });
      return;
    }
    this._noise(dest, { dur: 0.04, type: 'highpass', f: 5200, q: 0.7, gain: 0.22 });
    this._tone(dest, { dur: 0.08, type: 'triangle', f: 1318.5, gain: 0.2 });
    this._tone(dest, { t: 0.07, dur: 0.32, type: 'triangle', f: 1975.5, gain: 0.24 });
    this._tone(dest, { t: 0.07, dur: 0.26, type: 'sine', f: 3951, gain: 0.05 });
  }

  enemyDeath(pos) {
    if (!this.ready) return;
    const dest = this._bus(pos, 0.2);
    this._tone(dest, { dur: 0.4, type: 'sawtooth', f: rr(150, 190), f2: 60, gain: 0.18 });
    this._noise(dest, { dur: 0.25, type: 'lowpass', f: 800, q: 0.7, gain: 0.25 });
  }

  waveStart() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.5);
    this._tone(dest, { dur: 1.6, type: 'sawtooth', f: 55, f2: 62, gain: 0.22, attack: 0.5 });
    this._tone(dest, { dur: 1.6, type: 'sawtooth', f: 82.4, f2: 92, gain: 0.14, attack: 0.5 });
    this._noise(dest, { dur: 1.2, type: 'lowpass', f: 300, f2: 1400, q: 0.5, gain: 0.2, attack: 0.5 });
  }

  waveClear() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.5);
    [392, 494, 587, 784].forEach((f, i) => this._tone(dest, { t: i * 0.11, dur: 0.6, type: 'triangle', f, gain: 0.2 }));
  }

  death() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.6);
    this._tone(dest, { dur: 2.2, type: 'sawtooth', f: 110, f2: 38, gain: 0.3, attack: 0.1 });
    this._noise(dest, { dur: 1.4, type: 'lowpass', f: 600, f2: 80, q: 0.7, gain: 0.5 });
  }

  victory() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.6);
    [[261.6, 329.6, 392], [293.7, 370, 440], [329.6, 415.3, 493.9], [392, 493.9, 587.3]].forEach((ch, i) => {
      ch.forEach((f) => this._tone(dest, { t: i * 0.32, dur: 1.2, type: 'triangle', f, gain: 0.12, attack: 0.04 }));
    });
  }

  // ---- wave 14: vehicles and bosses
  /**
   * A looping voice for one vehicle of `kind` (a key of VEHICLES). update(pos, speed) moves it and
   * sets its pitch every frame, stop() ends it. At most ENGINE_CHANNELS sound at once, the nearest ones;
   * the rest wait silently until they come near. Before init() and with the sound off nothing is heard.
   * A voice that stops getting updates (the shop, a menu, a rider nobody stopped) fades out by itself.
   */
  engine(kind) {
    const voice = {
      kind, x: 0, y: 0, z: 0, speed: 0, seen: -1, channel: null, detune: rr(0.95, 1.05),
      update: (pos, speed = 0) => {
        if (!voice.live) return;
        voice.x = pos.x; voice.y = pos.y ?? 0; voice.z = pos.z; voice.speed = speed;
        voice.seen = performance.now();
      },
      stop: () => {
        if (!voice.live) return;
        voice.live = false;
        this.engines.delete(voice);
        if (voice.channel) this._release(voice.channel);
      },
      live: true,
    };
    this.engines.add(voice);
    return voice;
  }

  /** Give the nearest fresh voices a channel each and push their sound into it. Every frame. */
  _mixEngines() {
    const now = performance.now(), cam = this.game.gr.camera.position;
    const fresh = [];
    for (const v of this.engines) {
      if (now - v.seen > ENGINE_STALE_MS) { if (v.channel) this._release(v.channel); continue; }
      // a voice already sounding keeps its channel against a slightly nearer newcomer
      v.rank = Math.hypot(v.x - cam.x, v.y - cam.y, v.z - cam.z) * (v.channel ? 0.85 : 1);
      fresh.push(v);
    }
    fresh.sort((a, b) => a.rank - b.rank);
    const keep = this.muted ? [] : fresh.slice(0, ENGINE_CHANNELS);
    for (const v of fresh) if (v.channel && !keep.includes(v)) this._release(v.channel);
    for (const v of keep) {
      if (!v.channel) {
        const ch = this._engineChannels().find((c) => !c.voice);
        if (!ch) continue;
        ch.voice = v; v.channel = ch; ch.fresh = true;
      }
      this._drive(v.channel, v, Math.hypot(v.x - cam.x, v.y - cam.y, v.z - cam.z));
    }
  }

  /** The channels, built on first use: each one can sound like any kind of vehicle. */
  _engineChannels() {
    if (this._channels) return this._channels;
    const ctx = this.ctx;
    const loop = (rate = 1) => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate; return s; };
    const filter = (type, f, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    this._channels = [];
    for (let i = 0; i < ENGINE_CHANNELS; i++) {
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 5;
      panner.rolloffFactor = 1.3;
      panner.maxDistance = 200;
      const send = gain(0.22);
      panner.connect(this.master); panner.connect(send); send.connect(this.reverb);
      // far away only the low end carries
      const air = filter('lowpass', 9000, 0.5), out = gain(0);
      out.connect(air); air.connect(panner);
      // combustion: a sawtooth and its sub-octave through a resonant low-pass, chopped at the firing rate
      const saw = osc('sawtooth', 40), sub = osc('square', 20), engLp = filter('lowpass', 500, 2.2);
      const chop = gain(0.6), fire = osc('sine', 40), depth = gain(0.4), eng = gain(0);
      saw.connect(engLp); sub.connect(engLp); engLp.connect(chop); fire.connect(depth); depth.connect(chop.gain);
      const rasp = loop(0.8), raspBp = filter('bandpass', 900, 0.9), raspGain = gain(0.25);
      rasp.connect(raspBp); raspBp.connect(raspGain); raspGain.connect(chop);
      chop.connect(eng); eng.connect(out);
      // electric motor: a whine and its octave
      const whine = osc('triangle', 300), whine2 = osc('sine', 600), whineBp = filter('bandpass', 900, 1.4), whineGain = gain(0);
      whine.connect(whineBp); whine2.connect(whineBp); whineBp.connect(whineGain); whineGain.connect(out);
      // tyres or wheels on the road, with the knock of the joints in the pavement
      const roll = loop(1.1), rollBp = filter('bandpass', 1200, 0.7), knock = gain(0.7), bump = osc('square', 3), bumpDepth = gain(0.3), rollGain = gain(0);
      roll.connect(rollBp); rollBp.connect(knock); bump.connect(bumpDepth); bumpDepth.connect(knock.gain); knock.connect(rollGain); rollGain.connect(out);
      for (const n of [saw, sub, fire, rasp, whine, whine2, roll, bump]) n.start();
      this._channels.push({ voice: null, fresh: false, panner, air, out, saw, sub, engLp, fire, depth, eng, raspBp, whine, whine2, whineBp, whineGain, rollBp, bump, bumpDepth, rollGain });
    }
    return this._channels;
  }

  /** Set a channel to the sound of its voice: pitch and loudness from the speed, place from the position. */
  _drive(ch, v, dist) {
    const t = this.ctx.currentTime, S = ENGINE_SOUND[v.kind] || ENGINE_SOUND.moto;
    const top = (VEHICLES[v.kind] || VEHICLES.moto).speed;
    const k = Math.max(0, Math.min(1.2, v.speed / top));
    const jump = ch.fresh;
    ch.fresh = false;
    // a value: jumps there for a new voice, glides there for the one already sounding
    const set = (param, value, tau = 0.06) => {
      if (jump) { param.cancelScheduledValues(t); param.setValueAtTime(value, t); } else param.setTargetAtTime(value, t, tau);
    };
    const P = ch.panner;
    if (P.positionX) { set(P.positionX, v.x, 0.03); set(P.positionY, v.y + 0.5, 0.03); set(P.positionZ, v.z, 0.03); } else P.setPosition(v.x, v.y + 0.5, v.z);
    set(ch.air.frequency, 9000 / (1 + dist / 22), 0.1);
    // the engine runs through its gears: revs climb within a gear and drop at each shift
    let rev = 0;
    if (S.gears) {
      const g = Math.min(S.gears - 1, Math.floor(k * S.gears)), within = Math.min(1, k * S.gears - g);
      rev = g === 0 ? 0.2 * Math.min(1, k * 40) + 0.75 * within : 0.45 + 0.55 * within;
    }
    const f = (S.idle + (S.top - S.idle) * rev) * v.detune;
    set(ch.saw.frequency, f, 0.05); set(ch.sub.frequency, f / 2, 0.05); set(ch.fire.frequency, f * S.fire, 0.05);
    set(ch.engLp.frequency, 260 + 1500 * rev * rev + 300 * k, 0.08);
    set(ch.depth.gain, S.chop, 0.1);
    set(ch.raspBp.frequency, 500 + 1400 * rev, 0.08);
    const w = 220 + S.whine[1] * k;
    set(ch.whine.frequency, w * v.detune, 0.05); set(ch.whine2.frequency, w * 2.01 * v.detune, 0.05); set(ch.whineBp.frequency, w * 1.6, 0.08);
    set(ch.rollBp.frequency, S.roll[1] + 900 * k, 0.1);
    set(ch.bump.frequency, Math.max(0.5, v.speed / S.roll[2]), 0.1);
    set(ch.bumpDepth.gain, S.roll[3], 0.1);
    set(ch.eng.gain, S.engine * (S.gears ? 0.55 + 0.45 * rev : 0), 0.08);
    set(ch.whineGain.gain, S.whine[0] * Math.min(1, k * 1.5), 0.08);
    set(ch.rollGain.gain, S.roll[0] * Math.min(1, k * 1.2), 0.08);
    // the channel fades in, and falls silent by itself unless the next frame comes to hold it
    const o = ch.out.gain;
    o.cancelScheduledValues(t);
    if (jump) o.setValueAtTime(0, t);
    o.setTargetAtTime(1, t, jump ? 0.12 : 0.05);
    o.setTargetAtTime(0, t + ENGINE_HOLD, 0.08);
  }

  _release(ch) {
    if (ch.voice) ch.voice.channel = null;
    ch.voice = null;
    const o = ch.out.gain, t = this.ctx.currentTime;
    o.cancelScheduledValues(t);
    o.setTargetAtTime(0, t, 0.05);
  }

  /** A vehicle hits the ground and slides: a thud, crunching metal and plastic, a scrape along the asphalt. */
  vehicleCrash(pos) {
    if (!this.ready) return;
    const dest = this._bus(pos, 0.35);
    this._tone(dest, { dur: 0.4, type: 'sine', f: 80, f2: 34, gain: 0.9 });
    this._noise(dest, { dur: 0.45, type: 'lowpass', f: 700, f2: 110, q: 0.8, gain: 0.9, rate: 0.6 });
    this._noise(dest, { dur: 0.22, type: 'bandpass', f: 1700, f2: 900, q: 1.4, gain: 0.6 });
    for (let i = 0; i < 4; i++) {
      this._tone(dest, { t: 0.03 + i * rr(0.05, 0.11), dur: rr(0.12, 0.25), type: 'triangle', f: rr(700, 1700), f2: rr(400, 700), gain: rr(0.05, 0.12) });
    }
    this._noise(dest, { t: 0.06, dur: 1.1, type: 'bandpass', f: 2600, f2: 900, q: 1.2, gain: 0.32, attack: 0.08, rate: 1.4 });
    for (let i = 0; i < 3; i++) this._noise(dest, { t: rr(0.08, 0.4), dur: 0.05, type: 'highpass', f: 5200, q: 0.8, gain: rr(0.08, 0.16) });
  }

  /** A boss arrives: drums, a low brass chord swelling up and a ring of struck metal. */
  bossIntro() {
    if (!this.ready) return;
    const dest = this._bus(null, 0.7);
    const brass = this.ctx.createBiquadFilter();
    brass.type = 'lowpass'; brass.frequency.value = 900; brass.Q.value = 0.8;
    brass.connect(dest);
    [41.2, 61.7, 82.4, 98].forEach((f, i) => this._tone(brass, { t: 0.05, dur: 2.6, type: 'sawtooth', f, f2: f * 0.985, gain: i < 2 ? 0.22 : 0.1, attack: 0.5 }));
    [0, 0.42, 0.84, 1.05].forEach((t, i) => {
      this._tone(dest, { t, dur: 0.55, type: 'sine', f: i === 3 ? 70 : 92, f2: 38, gain: 0.95 });
      this._noise(dest, { t, dur: 0.18, type: 'lowpass', f: 420, q: 0.7, gain: 0.5 });
    });
    this._noise(dest, { dur: 1.3, type: 'lowpass', f: 180, f2: 2200, q: 0.6, gain: 0.22, attack: 1.0 });
    this._tone(dest, { t: 1.3, dur: 1.2, type: 'triangle', f: 1180, f2: 1130, gain: 0.07 });
    this._tone(dest, { t: 1.3, dur: 0.9, type: 'triangle', f: 1660, f2: 1600, gain: 0.04 });
  }

  // --------------------------------------------------------------- ambience
  _startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.windGain = g;
  }

  update(dt) {
    if (!this.ready) return;
    const cam = this.game.gr.camera;
    this.setListener(cam.position, cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone())));
    if (this._loops && this.game.state !== 'playing') this.weaponLoops(0, false, false);   // a menu or a death screen silences them
    if (this.engines.size || this._channels) this._mixEngines();
    // distant fighting and rumbles
    this.ambTimer -= dt;
    if (this.ambTimer <= 0 && this.game.state === 'playing') {
      this.ambTimer = rr(5, 13);
      const a = rnd() * Math.PI * 2, d = rr(70, 130);
      const pos = { x: cam.position.x + Math.cos(a) * d, y: 3, z: cam.position.z + Math.sin(a) * d };
      if (rnd() < 0.55) {
        const n = 2 + Math.floor(rnd() * 6);
        for (let i = 0; i < n; i++) setTimeout(() => this.ready && this.gun('enemy', pos), i * rr(70, 130));
      } else {
        const dest = this._bus(pos, 0.9);
        this._noise(dest, { dur: 1.4, type: 'lowpass', f: 380, f2: 50, q: 0.8, gain: 0.9, attack: 0.02, rate: 0.5 });
        this._tone(dest, { dur: 0.8, type: 'sine', f: 55, f2: 25, gain: 0.8 });
      }
    }
    // heartbeat when hurt
    if (this.lowHealth > 0.05) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.heartTimer = 1.15 - this.lowHealth * 0.5;
        this.heartbeat();
      }
    }
  }
}

/** Procedural sound. Returns {play(name, {pan, volume}), setEnabled(b), resume()}. */
export function createAudio(game) { return new AudioSys(game); }
