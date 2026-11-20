// The director connects the pure game state (core/waves) to the scene: it feeds
// time into the state machine and reacts to its events by spawning bots,
// showing banners and playing sounds. The rules themselves live in core/waves.

import { lineOfSight } from '../core/collision.js';
import {
  createGame, restart, tickGame, enemyKilled, continueEndless, setPaused, resultStats,
} from '../core/waves.js';
import { leaveShop, reviveAtCheckpoint } from '../core/waves.js';
import { MAX_WAVES } from '../core/rules.js';
import { ECONOMY } from '../core/rules.js';
import { waveRoster } from '../core/rules.js';
import { isRider, riderSlotFree, deferSpawn, pickRiderSpawn, payVehicle, newRiderKinds } from '../core/riderlogic.js';

const rnd = Math.random;

export class Director {
  constructor(game, seed = 20261010) {
    this.game = game;
    this.core = createGame(seed);
    this.maxWaves = MAX_WAVES;
    this.seenRiders = new Set();   // kinds of rider this game has announced (wave 14)
    this.grenadeTipDue = false;    // a new game has not yet shown the grenade tip (wave 1 only)
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
    this.seenRiders.clear();
    this.grenadeTipDue = true;
    this.bossIntro = null;
    this.bannerUntil = 0;
    this.game.hud.bossBar(null);
    this.game.hud.banner(this.game.t('wave') + ' 1', this.mapName(), 2.5);
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
    this.bossIntro = null;
    g.hud.bossBar(null);           // the wave starts again: its boss comes back with full health
    g.hud.banner(g.t('wave') + ' ' + cp.wave, [this.mapName(), g.t('revived', { n: this.core.deaths + 1 })].filter(Boolean).join(' · '), 2.6);
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
    this._bossIntro();
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
      case 'waveStart': {
        const news = this.riderNews(ev.wave, ev.endless);
        const sub = [ev.endless ? g.t('endless') : '', this.mapName(), news].filter(Boolean).join(' · ');
        const secs = news ? 3.6 : 2.6;
        g.hud.banner(g.t('wave') + ' ' + ev.wave, sub, secs);
        this.bannerUntil = this.now + secs * 1000;
        g.audio.waveStart();
        // the grenade tip: only the first wave of a new game; a revive or a later wave finds the flag spent
        if (this.grenadeTipDue) {
          this.grenadeTipDue = false;
          const n = g.weapons && g.weapons.arsenal ? g.weapons.arsenal.grenades : 0;
          const key = (g.hud.prompts && g.hud.prompts.grenade) || '';
          if (ev.wave === 1 && n > 0 && key) g.hud.toast(g.t('grenadeTip', { key, n }), 4.5);
        }
        this.saveArsenal();
        break;
      }
      case 'spawn': {
        // wave 15: a rider rides the loops of the map being played; on a map without loops he comes on
        // foot through a spawn point (the same core, one kill as always), so his wave still ends
        if (isRider(ev.enemyType) && this.hasLoops()) { this.spawnRider(ev); break; }
        const s = this.pickSpawn();
        // newly arrived soldiers know roughly where the player is
        const e = g.enemies.spawn(ev.enemyType, s.x, s.z, ev.tier, {
          state: 'chase',
          lastSeen: { x: g.player.pos.x + (rnd() - 0.5) * 14, z: g.player.pos.z + (rnd() - 0.5) * 14 },
          hpMult: ev.hpMult,
        });
        if (e.T.boss) this.announceBoss(e);
        break;
      }
      case 'waveCleared':
        g.hud.banner(g.t('waveClear'), '', 3);
        g.audio.waveClear();
        g.props.restoreSpawners();   // the break restores every supply point
        g.enemies.riders.clearWrecks();
        g.hud.bossBar(null);
        this.shopIn = ECONOMY.shopDelayMs / 1000;   // seconds of play, counted down in update()
        break;
      case 'victory':
        g.onVictory();
        break;
      default: break;
    }
  }

  // ---- wave 14: riders and bosses
  /** The name of the map this wave is fought on (the second line of the wave banner). */
  mapName() {
    return this.game.t('map_' + (this.core.map || 'block'));
  }

  /**
   * The line under the wave banner that names the kinds of rider this game meets for the first time.
   * It follows the wave's real roster: bikers first ride in on wave 5 as the gang leader's guard, two waves
   * before their own wave 7, so the game names them there, as his guard, and wave 7 brings nothing new.
   */
  riderNews(wave, endless) {
    const g = this.game, fresh = newRiderKinds(waveRoster(wave, endless), this.seenRiders);
    if (!fresh.length) return '';
    for (const k of fresh) this.seenRiders.add(k.kind);
    const names = fresh.map((k) => g.t(k.guard ? 'rk_bikerGuard' : 'rk_' + k.kind));
    return g.t(fresh.length > 1 ? 'newEnemies' : 'newEnemy') + ': ' + names.join(', ');
  }

  /**
   * A rider's spawn event: he enters on a loop, out of the player's sight and at least 25 m away, while
   * fewer than maxRiders ride. Otherwise the spawn goes back into the wave's queue (deferSpawn keeps the
   * alive count right): behind the foot soldiers when every rider slot is taken, as the very next spawn
   * when there is no hidden point right now (the boss's guard stays right behind him).
   */
  /** Does the map being played have rider loops? */
  hasLoops() {
    const r = this.game.world && this.game.world.routes;
    return !!(r && r.length);
  }

  spawnRider(ev) {
    const g = this.game, c = this.core, p = g.player;
    if (!riderSlotFree(g.enemies.mountedCount(), c.wave, c.endless)) { deferSpawn(c, ev.enemyType, false); return null; }
    const eye = p.eyePos(), colliders = g.world.colliders;
    const visible = (x, z) => lineOfSight(colliders, x, 1.6, z, eye.x, eye.y, eye.z);
    const at = pickRiderSpawn(g.enemies.riders.routes, { x: p.pos.x, z: p.pos.z }, visible, { rng: rnd, occupied: g.enemies.riders.occupied() });
    if (!at) { deferSpawn(c, ev.enemyType, true); return null; }
    const e = g.enemies.spawnRider(ev.enemyType, at.route, at.s, ev.tier, { hpMult: ev.hpMult, lastSeen: { x: p.pos.x, z: p.pos.z } });
    if (e.T.boss) this.announceBoss(e);
    return e;
  }

  /**
   * A boss enters: his health bar on top of the screen at once, his banner and sound as soon as the wave's
   * own banner (with its line about new riders) has been read: the boss opens his wave half a second in.
   */
  announceBoss(e) {
    this.game.hud.bossBar(e);
    this.bossIntro = { e, at: Math.max(this.now, (this.bannerUntil || 0) - 300) };
  }

  _bossIntro() {
    const b = this.bossIntro, g = this.game;
    if (!b || this.now < b.at) return;
    this.bossIntro = null;
    if (!b.e.alive) return;
    g.hud.banner(g.t('boss') + ': ' + g.t(b.e.T.key), g.t('bossHint_' + b.e.core.type), 3);
    g.audio.bossIntro();
  }

  /** A vehicle was shot out from under its rider: its score in points and money, no kill. */
  onVehicleDestroyed(enemy, kind) {
    const g = this.game, pts = payVehicle(this.core, kind);
    g.hud.killfeed(g.t(enemy.T.key), false, 'dismount', pts, 0);
    return pts;
  }

  /** A motorbike ran the player down: a line in the feed (the damage itself went to the player). */
  onRam(enemy) {
    const g = this.game;
    g.hud.killfeed(g.t(enemy.T.key), false, 'vehicle', null, 0);
  }

  /** A bot died: points, streak, kill feed; a boss gets a line of his own and his bar goes. */
  onKill(enemy, zone, source) {
    const g = this.game;
    const r = enemyKilled(this.core, { headshot: zone === 'head', base: enemy.T.score, source }, this.now);
    g.hud.killfeed(g.t(enemy.T.key), zone === 'head', source, r.points, r.streak);
    if (enemy.T.boss) {
      g.hud.bossDown(g.t(enemy.T.key));
      g.hud.bossBar(null);
    }
  }
}
