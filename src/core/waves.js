// core/waves: the game cycle and the score as a pure state machine.
//
// GameState = {
//   phase: 'menu' | 'wave' | 'intermission' | 'shop' | 'dead' | 'victory' | 'paused',
//   wave, waveEnemiesLeft, intermissionUntil,
//   player: {health, lastDamageAt, kills, headshots, shotsFired, shotsHit, armor, armorMax, armorLevel},
//   score, money, deaths, shop, checkpoint, seed, ...
// }
//
// Time is kept by the caller in milliseconds (`now`). tickGame returns events
// the game layer reacts to: waveStart, spawn, waveCleared, victory, dead.
// Wave N has 3 + 2 * (N - 1) bots, at most 12 fight at once, victory comes
// after wave 10 and the game can go on in an endless mode.
//
// After a cleared wave the game waits in the 'shop' phase without a timer; leaveShop() starts a
// short countdown to the next wave. At the start of every wave a checkpoint keeps what the player
// had; after a death reviveAtCheckpoint() goes back to it and replays that wave.

import { createRng } from './math.js';
import {
  PLAYER, MAX_WAVES, INTERMISSION_SECONDS, waveTier, waveCount, maxAlive, killScore, regenHealth, waveRoster,
} from './rules.js';
import { ECONOMY, stageBreakdown, waveHpMult, absorbDamage } from './rules.js';

const INTRO_MS = 4500;

function freshPlayer() {
  return {
    health: PLAYER.maxHealth, maxHealth: PLAYER.maxHealth, lastDamageAt: -1e9, kills: 0, headshots: 0, shotsFired: 0, shotsHit: 0,
    armor: 0, armorMax: 0, armorLevel: 0,
  };
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
    money: 0,                // the wallet; spending it never touches the score
    spent: 0,
    deaths: 0,               // deaths so far, the one being shown on the death screen included
    waveMoney: 0,            // kill money of the current wave, for the shop's breakdown
    waveHeadshots: 0,
    waveDamaged: false,
    stage: null,             // what the last cleared wave earned (stageBreakdown)
    shop: null,              // the open shop visit: {wave, refilled}
    checkpoint: null,        // what the player had at the start of the current wave
  };
}

/** Full reset and start: a short intro, then wave 1. Same seed, so runs can be replayed. */
export function restart(g, now = 0) {
  const seed = g.seed;
  Object.assign(g, createGame(seed));
  g.phase = 'intermission';
  g.intermissionUntil = now + INTRO_MS;
  g.player.lastDamageAt = now - PLAYER.regenDelay * 1000;
  saveCheckpoint(g, 1);
  return g;
}

/** After the victory screen: keep going with waves 11, 12, ... at the full difficulty, through the shop. */
export function continueEndless(g, now) {
  if (g.phase !== 'victory') return false;
  g.endless = true;
  openShop(g, now);
  return true;
}

// ---- wave 12: money, the shop phase, the checkpoint and the revival

/** Remember what the player has at the start of `wave`. The game layer adds `arsenal` (snapshotArsenal). */
function saveCheckpoint(g, wave) {
  const p = g.player;
  g.checkpoint = {
    wave, endless: g.endless, money: g.money, spent: g.spent, score: g.score, bestStreak: g.bestStreak,
    kills: p.kills, headshots: p.headshots, shotsFired: p.shotsFired, shotsHit: p.shotsHit,
    armor: p.armor, armorMax: p.armorMax, armorLevel: p.armorLevel,
    arsenal: null,
  };
  return g.checkpoint;
}

/** Pay the stage reward of the wave that was just cleared. */
function payStage(g) {
  const s = stageBreakdown(g.wave, { killMoney: g.waveMoney, headshots: g.waveHeadshots, damaged: g.waveDamaged });
  g.money += s.paid;
  g.stage = s;
  return s;
}

/** The shop: a safe break without a timer. Health and armour are full again, the free refill is unused. */
function openShop(g, now) {
  const p = g.player;
  g.phase = 'shop';
  g.shop = { wave: g.wave, refilled: false };
  p.health = p.maxHealth;
  p.armor = p.armorMax;
  p.lastDamageAt = now - PLAYER.regenDelay * 1000;
}

/** Leave the shop: a short countdown, then the next wave. The checkpoint already holds the purchases. */
export function leaveShop(g, now) {
  if (g.phase !== 'shop') return false;
  g.phase = 'intermission';
  g.intermissionUntil = now + ECONOMY.countdownMs;
  saveCheckpoint(g, g.wave + 1);
  return true;
}

/**
 * After a death: back to the checkpoint of the wave the player died in (money, score, counters,
 * armour; the game layer restores the arsenal from checkpoint.arsenal), full health, and that wave
 * starts again from the beginning after a short intro. Play time and the death count keep running.
 */
export function reviveAtCheckpoint(g, now) {
  const cp = g.checkpoint;
  if (g.phase !== 'dead' || !cp) return false;
  g.money = cp.money; g.spent = cp.spent; g.score = cp.score; g.bestStreak = cp.bestStreak; g.endless = cp.endless;
  Object.assign(g.player, {
    health: g.player.maxHealth, lastDamageAt: now - PLAYER.regenDelay * 1000,
    kills: cp.kills, headshots: cp.headshots, shotsFired: cp.shotsFired, shotsHit: cp.shotsHit,
    armor: cp.armor, armorMax: cp.armorMax, armorLevel: cp.armorLevel,
  });
  g.streak = 0; g.streakUntil = 0;
  g.queue = []; g.alive = 0; g.waveTotal = 0; g.waveEnemiesLeft = 0;
  g.waveMoney = 0; g.waveHeadshots = 0; g.waveDamaged = false;
  g.wave = cp.wave - 1;
  g.phase = 'intermission';
  g.prevPhase = 'intermission';
  g.intermissionUntil = now + ECONOMY.reviveIntroMs;
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
  // the full roster: foot soldiers, riders (wave 14) and the boss, together exactly waveCount(n) bots
  for (const [type, count] of Object.entries(waveRoster(n, g.endless))) for (let i = 0; i < count; i++) q.push(type);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(g.rng() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  g.queue = q;
  g.waveTotal = q.length;
  g.waveEnemiesLeft = q.length;
  g.spawnT = 0.5;
  g.phase = 'wave';
  g.waveMoney = 0; g.waveHeadshots = 0; g.waveDamaged = false;
  saveCheckpoint(g, n);
  events.push({ type: 'waveStart', wave: n, tier: g.tier, total: q.length, endless: g.endless });
}

/** Advance the game by dt seconds. Returns the events that happened. */
export function tickGame(g, dt, now) {
  const events = [];
  if (g.phase === 'menu' || g.phase === 'paused' || g.phase === 'dead' || g.phase === 'victory') return events;
  if (g.phase === 'shop') return events;   // the shop waits for leaveShop(), without a timer
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
      events.push({ type: 'spawn', enemyType, tier: g.tier, hpMult: waveHpMult(g.wave) });
    }
    if (!g.queue.length && g.alive === 0) {
      if (g.wave >= MAX_WAVES && !g.endless) {
        const stage = payStage(g);   // the money is there when the endless mode opens the shop
        g.phase = 'victory';
        events.push({ type: 'victory', wave: g.wave, stage });
      } else {
        g.score += 250 * Math.min(g.wave, MAX_WAVES);
        const stage = payStage(g);
        openShop(g, now);
        events.push({ type: 'waveCleared', wave: g.wave, stage });
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
  g.money += points;           // a kill pays as much money as it gives points
  g.waveMoney += points;
  if (headshot) g.waveHeadshots++;
  g.waveEnemiesLeft = g.queue.length + g.alive;
  return { points, streak: g.streak };
}

/**
 * The player takes damage. Armour takes its share first (absorbDamage). Returns {health, dead}.
 * Death ends the game. A cleared wave (shop, victory) cannot hurt any more.
 */
export function damagePlayer(g, amount, now) {
  const p = g.player;
  if (g.phase === 'dead') return { health: 0, dead: true };
  if (g.phase === 'victory' || g.phase === 'shop') return { health: p.health, dead: false };
  const split = absorbDamage(p.armor || 0, amount);
  p.armor = split.armor;
  if (g.phase === 'wave' && amount > 0) g.waveDamaged = true;
  p.health = Math.max(0, p.health - split.health);
  p.lastDamageAt = now;
  if (p.health <= 0 && g.phase !== 'menu') { g.phase = 'dead'; g.deaths++; }
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
    deaths: g.deaths, money: g.money, reviveWave: g.checkpoint ? g.checkpoint.wave : 0,
  };
}

export { waveCount };
