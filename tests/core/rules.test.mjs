import { test, assert, near } from '../harness.mjs';
import {
  PLAYER, WEAPON_SPECS, WEAPON_ORDER, effectiveSpread, bloomAfterShot, bloomDecay, damageAtRange, moveSpeed, regenHealth,
  explosionDamage, applyMedkit, applyAmmoPickup, reserveMax, fireInterval, ENEMY_TYPES, TIERS, enemyParams, botHitChance,
  waveCount, waveTier, waveComposition, maxAlive, killScore, MAX_WAVES, MAX_ALIVE, INTERMISSION_SECONDS, EXPLOSION, PICKUP,
  CRATE_HP, BARREL_HP, ZONE_MULT,
} from '../../src/core/rules.js';

test('player: walk 4.2, run 6.6, crouch 2.2, aim 2.8 m/s and a 1.1 m jump', () => {
  assert.equal(PLAYER.walk, 4.2); assert.equal(PLAYER.sprint, 6.6); assert.equal(PLAYER.crouch, 2.2); assert.equal(PLAYER.ads, 2.8);
  near(PLAYER.jump * PLAYER.jump / (2 * PLAYER.gravity), 1.1, 1e-9);
  assert.equal(PLAYER.maxHealth, 100);
});
test('moveSpeed: running is forward only, aiming slows you down, crouching is slowest', () => {
  near(moveSpeed({ crouched: false, sprinting: false, ads: 0 }), 4.2);
  near(moveSpeed({ crouched: false, sprinting: true, ads: 0 }), 6.6);
  near(moveSpeed({ crouched: true, sprinting: false, ads: 0 }), 2.2);
  near(moveSpeed({ crouched: false, sprinting: false, ads: 1 }), 2.8);
  assert.ok(moveSpeed({ crouched: false, sprinting: false, ads: 0, backwards: true }) < 4.2);
});
test('health regenerates after 5 s without damage at 18 per second', () => {
  assert.equal(regenHealth(50, 100, 4.9, 1), 50);
  near(regenHealth(50, 100, 5.1, 1), 68);
  assert.equal(regenHealth(95, 100, 10, 1), 100);
  assert.equal(regenHealth(100, 100, 10, 1), 100);
});
test('weapon table matches the spec', () => {
  const p = WEAPON_SPECS.pistol, r = WEAPON_SPECS.rifle, s = WEAPON_SPECS.shotgun;
  assert.deepEqual([p.damage, p.rpm, p.auto, p.mag, p.reserve, p.reloadMs], [34, 300, false, 12, 60, 1600]);
  assert.deepEqual([r.damage, r.rpm, r.auto, r.mag, r.reserve, r.reloadMs], [22, 700, true, 30, 180, 2300]);
  assert.deepEqual([s.damage, s.pellets, s.rpm, s.auto, s.mag, s.reserve, s.reloadMs, s.perShell], [13, 8, 75, false, 6, 36, 2800, true]);
  assert.deepEqual([r.spreadBase, r.spreadMax], [0.4, 3.5]);
  assert.deepEqual(WEAPON_ORDER, ['pistol', 'rifle', 'shotgun']);
  assert.ok(ZONE_MULT.head === 2.5);
});
test('spread: aiming narrows it, moving and jumping widen it, bloom is capped at the maximum', () => {
  const r = WEAPON_SPECS.rifle;
  const still = { bloom: 0, ads: 0, speed01: 0, airborne: false, crouched: false };
  near(effectiveSpread(r, still), 0.4);
  near(effectiveSpread(r, { ...still, ads: 1 }), 0.4 * r.adsSpreadMul);
  near(effectiveSpread(r, { ...still, speed01: 1 }), 0.4 + 1.2);
  assert.ok(effectiveSpread(r, { ...still, speed01: 0.5 }) < effectiveSpread(r, { ...still, speed01: 1 }));
  assert.ok(effectiveSpread(r, { ...still, airborne: true }) > effectiveSpread(r, still));
  assert.ok(effectiveSpread(r, { ...still, crouched: true }) < effectiveSpread(r, still));
  let bloom = 0; for (let i = 0; i < 100; i++) bloom = bloomAfterShot(r, bloom);
  near(effectiveSpread(r, { ...still, bloom }), 3.5);
  near(bloomDecay(1, 0.2), 1 - 0.2 * 1.5);
  assert.equal(bloomDecay(0.1, 1), 0);
});
test('spread is the same at a run, aiming and in a burst as the crosshair shows', () => {
  const r = WEAPON_SPECS.rifle;
  const st = { bloom: 1.1, ads: 0.5, speed01: 0.8, airborne: false, crouched: false };
  assert.equal(effectiveSpread(r, st), effectiveSpread(r, { ...st }));
});
test('damage falls with distance: the shotgun is full to 8 m and zero from 26 m', () => {
  const s = WEAPON_SPECS.shotgun;
  assert.equal(damageAtRange(s, 5), 13);
  assert.equal(damageAtRange(s, 8), 13);
  near(damageAtRange(s, 17), 6.5);
  assert.equal(damageAtRange(s, 26), 0);
  assert.equal(damageAtRange(s, 80), 0);
  const r = WEAPON_SPECS.rifle;
  assert.equal(damageAtRange(r, 10), 22);
  assert.ok(damageAtRange(r, 60) < 22 && damageAtRange(r, 60) > damageAtRange(r, 90) - 1e-9);
});
test('fire interval follows the rpm', () => {
  near(fireInterval(WEAPON_SPECS.rifle), 60 / 700);
  near(fireInterval(WEAPON_SPECS.shotgun), 0.8);
});
test('explosion: radius 5 m, 120 in the centre, quadratic falloff', () => {
  assert.equal(EXPLOSION.radius, 5); assert.equal(EXPLOSION.damage, 120);
  near(explosionDamage(0), 120);
  near(explosionDamage(2.5), 30);
  assert.equal(explosionDamage(5), 0); assert.equal(explosionDamage(9), 0);
});
test('barrels have 30 hp, crates 20, the medkit heals 40 and is not used at full health', () => {
  assert.equal(BARREL_HP, 30); assert.equal(CRATE_HP, 20);
  assert.deepEqual(applyMedkit(100, 100), { health: 100, used: false });
  assert.deepEqual(applyMedkit(30, 100), { health: 70, used: true });
  assert.equal(applyMedkit(80, 100).health, 100);
  assert.equal(PICKUP.radius, 1.2); assert.equal(PICKUP.ammo.respawn, 25); assert.equal(PICKUP.health.respawn, 35);
});
test('an ammo box gives one magazine per weapon, up to the carrying limit', () => {
  const ws = WEAPON_ORDER.map((id) => ({ id, reserve: 0 }));
  assert.equal(applyAmmoPickup(ws), true);
  assert.deepEqual(ws.map((w) => w.reserve), [12, 30, 6]);
  const full = WEAPON_ORDER.map((id) => ({ id, reserve: reserveMax(WEAPON_SPECS[id]) }));
  assert.equal(applyAmmoPickup(full), false);
});
test('waves: 3 + 2(N-1) bots, tiers 1-3, at most 12 alive, ten waves', () => {
  assert.deepEqual([1, 2, 3, 10].map(waveCount), [3, 5, 7, 21]);
  assert.deepEqual([1, 3, 4, 6, 7, 10].map(waveTier), [1, 1, 2, 2, 3, 3]);
  assert.equal(maxAlive(1), 5); assert.equal(maxAlive(20), MAX_ALIVE);
  assert.equal(MAX_WAVES, 10); assert.equal(INTERMISSION_SECONDS, 6);
});
test('wave composition always adds up and brings tougher types later', () => {
  for (let n = 1; n <= 25; n++) {
    const c = waveComposition(n);
    assert.equal(c.grunt + c.rusher + c.heavy, waveCount(n), 'wave ' + n);
    assert.ok(c.grunt >= 0 && c.rusher >= 0 && c.heavy >= 0);
  }
  assert.deepEqual(waveComposition(1), { grunt: 3, rusher: 0, heavy: 0 });
  assert.equal(waveComposition(3).heavy, 0);
  assert.ok(waveComposition(10).heavy >= 3);
});
test('tiers: wave 1 shoots slower and wider than wave 7', () => {
  const t1 = enemyParams('grunt', 1), t3 = enemyParams('grunt', 3);
  assert.ok(t1.interval > t3.interval * 2);
  assert.ok(t1.acc < t3.acc);
  assert.ok(t1.burst[1] < t3.burst[1]);
  assert.ok(t1.telegraph > t3.telegraph);
  assert.ok(t3.hp > t1.hp);
  assert.ok(TIERS[1].interval > TIERS[2].interval && TIERS[2].interval > TIERS[3].interval);
});
test('bot damage is 8-12 per hit, heavies are tougher and armoured', () => {
  for (const t of Object.values(ENEMY_TYPES)) { assert.ok(t.dmg[0] >= 8 && t.dmg[1] <= 12); }
  assert.ok(ENEMY_TYPES.heavy.hp > ENEMY_TYPES.grunt.hp && ENEMY_TYPES.heavy.armor < 1);
});
test('bot hit chance drops with distance and when the player runs or crouches', () => {
  const base = botHitChance(0.6, 10, 2, {});
  assert.ok(botHitChance(0.6, 60, 2, {}) < base);
  assert.ok(botHitChance(0.6, 10, 2, { speedFrac: 1, sprinting: true }) < botHitChance(0.6, 10, 2, { speedFrac: 1 }));
  assert.ok(botHitChance(0.6, 10, 2, { crouched: true }) < base);
  assert.ok(botHitChance(0.6, 10, 0, {}) < base);
  assert.ok(botHitChance(5, 1, 5, {}) <= 0.9 && botHitChance(0, 200, 0, {}) >= 0.05);
});
test('kill score: base plus headshot and streak bonuses', () => {
  assert.equal(killScore({ base: 100 }), 100);
  assert.equal(killScore({ base: 100, head: true }), 150);
  assert.equal(killScore({ base: 100, streak: 3 }), 120);
  assert.equal(killScore({ base: 100, streak: 50 }), 200);
  assert.equal(killScore({ base: 100, source: 'barrel' }), 150);
});
