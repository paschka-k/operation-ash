// core/boss: the decisions of a boss on foot (the commander, and the gang leader once he is off his
// motorbike). Pure, like core/ai: it wraps thinkEnemy and adds two habits.
//
//   const intent = thinkBoss(e, world, dt, now);   // thinkEnemy's intent, plus grenade: {x, z} | null
//
// - Grenades: a boss with T.grenadeEvery throws one at the player he sees, when the player is between
//   BOSS.grenadeMin and BOSS.grenadeMax metres away, at most once per grenadeEvery seconds. The game
//   layer throws it (the grenades of wave 13 fly and explode the same for everyone).
// - He never camps: after BOSS.standSecs within BOSS.standRadius of one spot he goes after the player
//   (state 'chase' towards where the player is) and for BOSS.pushSecs fights in the open, not in cover.
// His long bursts are simply his row in ENEMY_TYPES.

import { thinkEnemy } from './ai.js';
import { BOSS } from './rules.js';

export function thinkBoss(e, world, dt, now) {
  const intent = thinkEnemy(e, world, dt, now);
  intent.grenade = null;
  if (!e.alive) return intent;
  const p = world.player;

  // never camping: stood too long in one spot -> after the player
  if (!e.bossAnchor || Math.hypot(e.x - e.bossAnchor.x, e.z - e.bossAnchor.z) > BOSS.standRadius) {
    e.bossAnchor = { x: e.x, z: e.z };
    e.bossStandT = 0;
  } else e.bossStandT = (e.bossStandT || 0) + dt;
  if (e.bossStandT >= BOSS.standSecs && p.alive) {
    e.state = 'chase';
    e.lastSeen = { x: p.x, z: p.z };
    e.path = null;
    e.pathT = 0;
    e.bossPushUntil = now + BOSS.pushSecs * 1000;
    e.bossAnchor = null;
  } else if (e.state === 'combat' && now < (e.bossPushUntil || 0) && e.phase !== 'exposed') {
    e.phase = 'exposed';
    e.exposedT = Math.max(e.exposedT || 0, (e.bossPushUntil - now) / 1000);
  }

  // a grenade at the player he sees
  const every = (e.T.grenadeEvery || 0) * 1000;
  if (every > 0 && e.sees && p.alive && e.state === 'combat') {
    const dist = Math.hypot(p.x - e.x, p.z - e.z);
    if (dist >= BOSS.grenadeMin && dist <= BOSS.grenadeMax && now >= (e.grenadeAt ?? -Infinity)) {
      intent.grenade = { x: p.x, z: p.z };
      e.grenadeAt = now + every;
    }
  }
  return intent;
}
