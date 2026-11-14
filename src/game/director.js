// The director connects the pure game state (core/waves) to the scene: it feeds
// time into the state machine and reacts to its events by spawning bots,
// showing banners and playing sounds. The rules themselves live in core/waves.

import { lineOfSight } from '../core/collision.js';
import {
  createGame, restart, tickGame, enemyKilled, continueEndless, setPaused, resultStats,
} from '../core/waves.js';
import { leaveShop, reviveAtCheckpoint } from '../core/waves.js';
import { MAX_WAVES } from '../core/rules.js';

const rnd = Math.random;
const SHOP_DELAY = 1.8;   // seconds of play between "wave cleared" and the shop screen

export class Director {
  constructor(game, seed = 20261010) {
    this.game = game;
    this.core = createGame(seed);
    this.maxWaves = MAX_WAVES;
  }

  get now() { return this.game.time * 1000; }
  get wave() { return this.core.wave; }
  get endless() { return this.core.endless; }
  get phase() { return this.core.phase; }
  get stats() {
    const c = this.core;
    return { score: c.score, kills: c.player.kills, headshots: c.player.headshots, bestStreak: c.bestStreak, time: c.time };
  }
  remaining() { return this.core.waveEnemiesLeft; }
  result() { return resultStats(this.core); }

  /** New game: full reset, a short intro, then wave 1. */
  start() {
    restart(this.core, this.now);
    this.saveArsenal();
    this.shopIn = 0;
    this.game.hud.banner(this.game.t('wave') + ' 1', '', 2.5);
  }

  continueEndless() {
    if (continueEndless(this.core, this.now)) this.game.props.restoreSpawners();
  }

  // ---- wave 12: the shop and the revival
  /** The arsenal belongs to the checkpoint the core keeps for the wave about to be played. */
  saveArsenal() {
    if (this.core.checkpoint) this.core.checkpoint.arsenal = this.game.weapons.checkpoint();
  }

  /** "To battle": the countdown to the next wave starts; the checkpoint keeps the purchases. */
  leaveShop() {
    if (!leaveShop(this.core, this.now)) return false;
    this.saveArsenal();
    return true;
  }

  /** Back to the checkpoint of the wave the player died in. The caller has cleared the scene. */
  revive() {
    const cp = this.core.checkpoint;
    if (!reviveAtCheckpoint(this.core, this.now)) return false;
    this.game.weapons.restore(cp.arsenal);
    this.shopIn = 0;
    const g = this.game;
    g.hud.banner(g.t('wave') + ' ' + cp.wave, g.t('revived', { n: this.core.deaths + 1 }), 2.6);
    return true;
  }

  setPaused(p) { setPaused(this.core, p); }

  /** Pick a spawn point the player cannot see, not too close, away from other bots. */
  pickSpawn() {
    const g = this.game, p = g.player;
    const pts = g.world.spawnPoints;
    const eye = p.eyePos();
    let best = null, bestScore = -1;
    for (let tries = 0; tries < 14; tries++) {
      const s = pts[Math.floor(rnd() * pts.length)];
      const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
      if (d < 20) continue;
      let score = Math.min(d, 60) + rnd() * 10;
      const visible = lineOfSight(g.world.colliders, s.x, 1.6, s.z, eye.x, eye.y, eye.z);
      if (visible && d < 60) score -= 70;
      for (const e of g.enemies.cores) if (e.alive && Math.hypot(e.x - s.x, e.z - s.z) < 3.5) score -= 40;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best || pts[0];
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'playing') return;
    const now = this.now;
    for (const ev of tickGame(this.core, dt, now)) this.handle(ev);
    // countdown to the next wave
    if (this.core.phase === 'intermission' && this.core.wave > 0) {
      g.hud.setBreak(Math.max(0, Math.ceil((this.core.intermissionUntil - now) / 1000)));
    } else g.hud.setBreak(0);
    // a moment to see the last bot fall, then the shop
    if (this.core.phase === 'shop' && (this.shopIn -= dt) <= 0) g.openShop();
  }

  handle(ev) {
    const g = this.game;
    switch (ev.type) {
      case 'waveStart':
        g.hud.banner(g.t('wave') + ' ' + ev.wave, ev.endless ? g.t('endless') : '', 2.6);
        g.audio.waveStart();
        this.saveArsenal();
        break;
      case 'spawn': {
        const s = this.pickSpawn();
        // newly arrived soldiers know roughly where the player is
        g.enemies.spawn(ev.enemyType, s.x, s.z, ev.tier, {
          state: 'chase',
          lastSeen: { x: g.player.pos.x + (rnd() - 0.5) * 14, z: g.player.pos.z + (rnd() - 0.5) * 14 },
          hpMult: ev.hpMult,
        });
        break;
      }
      case 'waveCleared':
        g.hud.banner(g.t('waveClear'), '', 3);
        g.audio.waveClear();
        g.props.restoreSpawners();   // the break restores every supply point
        this.shopIn = SHOP_DELAY;
        break;
      case 'victory':
        g.onVictory();
        break;
      default: break;
    }
  }

  /** A bot died: points, streak, kill feed. */
  onKill(enemy, zone, source) {
    const g = this.game;
    const r = enemyKilled(this.core, { headshot: zone === 'head', base: enemy.T.score, source }, this.now);
    g.hud.killfeed(g.t(enemy.T.key), zone === 'head', source, r.points, r.streak);
  }
}
