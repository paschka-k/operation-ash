// core/waves: the game cycle and the score as a pure state machine.
//
// GameState = {
//   phase: 'menu' | 'wave' | 'intermission' | 'dead' | 'victory' | 'paused',
//   wave, waveEnemiesLeft, intermissionUntil,
//   player: {health, lastDamageAt, kills, headshots, shotsFired, shotsHit},
//   score, seed, ...
// }
//
// Time is kept by the caller in milliseconds (`now`). tickGame returns events
// the game layer reacts to: waveStart, spawn, waveCleared, victory, dead.
// Wave N has 3 + 2 * (N - 1) bots, at most 12 fight at once, victory comes
// after wave 10 and the game can go on in an endless mode.

import { createRng } from './math.js';
import {
  PLAYER, MAX_WAVES, INTERMISSION_SECONDS, waveTier, waveCount, maxAlive, waveComposition, killScore, regenHealth,
} from './rules.js';

const INTRO_MS = 4500;

function freshPlayer() {
  return { health: PLAYER.maxHealth, maxHealth: PLAYER.maxHealth, lastDamageAt: -1e9, kills: 0, headshots: 0, shotsFired: 0, shotsHit: 0 };
}

/** A new game in the menu phase. Call restart() to begin playing. */
export function createGame(seed = 1) {
  return {
    phase: 'menu',
    prevPhase: 'menu',
    seed,
    rng: createRng(seed),
    time: 0,                 // seconds of play
    wave: 0,
    tier: 1,
    endless: false,
    queue: [],               // enemy types still to spawn in this wave
    alive: 0,                // spawned and not yet killed
    waveEnemiesLeft: 0,
    waveTotal: 0,
    spawnT: 0,
    intermissionUntil: 0,
    score: 0,
    streak: 0,
    streakUntil: 0,
    bestStreak: 0,
    player: freshPlayer(),
  };
}

/** Full reset and start: a short intro, then wave 1. Same seed, so runs can be replayed. */
export function restart(g, now = 0) {
  const seed = g.seed;
  Object.assign(g, createGame(seed));
  g.phase = 'intermission';
  g.intermissionUntil = now + INTRO_MS;
  g.player.lastDamageAt = now - PLAYER.regenDelay * 1000;
  return g;
}

/** After the victory screen: keep going with waves 11, 12, ... at the full difficulty. */
export function continueEndless(g, now) {
  if (g.phase !== 'victory') return false;
  g.endless = true;
  g.phase = 'intermission';
  g.intermissionUntil = now + INTERMISSION_SECONDS * 1000;
  return true;
}

export function setPaused(g, paused) {
  if (paused && g.phase !== 'paused') { g.prevPhase = g.phase; g.phase = 'paused'; }
  else if (!paused && g.phase === 'paused') g.phase = g.prevPhase;
}

function startWave(g, n, events) {
  g.wave = n;
  g.tier = waveTier(n);
  const q = [];
  for (const [type, count] of Object.entries(waveComposition(n))) for (let i = 0; i < count; i++) q.push(type);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  g.queue = q;
  g.waveTotal = q.length;
  g.waveEnemiesLeft = q.length;
  g.spawnT = 0.5;
  g.phase = 'wave';
  events.push({ type: 'waveStart', wave: n, tier: g.tier, total: q.length, endless: g.endless });
}

/** Advance the game by dt seconds. Returns the events that happened. */
export function tickGame(g, dt, now) {
  const events = [];
  if (g.phase === 'menu' || g.phase === 'paused' || g.phase === 'dead' || g.phase === 'victory') return events;
  g.time += dt;

  // health comes back after a few quiet seconds
  g.player.health = regenHealth(g.player.health, g.player.maxHealth, (now - g.player.lastDamageAt) / 1000, dt);
  if (g.streak > 0 && now > g.streakUntil) g.streak = 0;

  if (g.phase === 'intermission') {
    if (now >= g.intermissionUntil) startWave(g, g.wave + 1, events);
  } else if (g.phase === 'wave') {
    g.spawnT -= dt;
    if (g.queue.length && g.alive < maxAlive(g.wave) && g.spawnT <= 0) {
      const enemyType = g.queue.pop();
      g.alive++;
      g.spawnT = 1.1 + g.rng() * 1.1;
      events.push({ type: 'spawn', enemyType, tier: g.tier });
    }
    if (!g.queue.length && g.alive === 0) {
      if (g.wave >= MAX_WAVES && !g.endless) {
        g.phase = 'victory';
        events.push({ type: 'victory', wave: g.wave });
      } else {
        g.score += 250 * Math.min(g.wave, MAX_WAVES);
        g.phase = 'intermission';
        g.intermissionUntil = now + INTERMISSION_SECONDS * 1000;
        events.push({ type: 'waveCleared', wave: g.wave, seconds: INTERMISSION_SECONDS });
      }
    }
  }
  g.waveEnemiesLeft = g.queue.length + g.alive;
  return events;
}

/** A bot died. Counts the kill and the points. Returns {points, streak}. */
export function enemyKilled(g, { headshot = false, base = 100, source = 'player' } = {}, now = 0) {
  g.alive = Math.max(0, g.alive - 1);
  g.player.kills++;
  if (headshot) g.player.headshots++;
  g.streak++;
  g.streakUntil = now + 8000;
  g.bestStreak = Math.max(g.bestStreak, g.streak);
  const points = killScore({ base, head: headshot, streak: g.streak, source });
  g.score += points;
  g.waveEnemiesLeft = g.queue.length + g.alive;
  return { points, streak: g.streak };
}

/** The player takes damage. Returns {health, dead}. Death ends the game. */
export function damagePlayer(g, amount, now) {
  const p = g.player;
  if (g.phase === 'dead') return { health: 0, dead: true };
  if (g.phase === 'victory') return { health: p.health, dead: false };
  p.health = Math.max(0, p.health - amount);
  p.lastDamageAt = now;
  if (p.health <= 0 && g.phase !== 'menu') g.phase = 'dead';
  return { health: p.health, dead: p.health <= 0 };
}

/** Count shots for the accuracy line of the result screen. */
export function recordShots(g, fired, hits) {
  g.player.shotsFired += fired;
  g.player.shotsHit += hits;
}

/** The numbers shown on the death and victory screens. */
export function resultStats(g) {
  const p = g.player;
  return {
    wave: g.wave, maxWaves: MAX_WAVES, score: g.score, kills: p.kills, headshots: p.headshots,
    shots: p.shotsFired, hits: p.shotsHit, accuracy: p.shotsFired ? p.shotsHit / p.shotsFired : 0,
    time: g.time, bestStreak: g.bestStreak,
  };
}

export { waveCount };
