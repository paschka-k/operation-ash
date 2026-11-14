// Wave 13 weapons: the six new rows, the minigun's spinning barrels, the weight of a weapon,
// the flamer's short reach and burning, the sniper's one shot.
import { test, assert, near } from '../harness.mjs';
import {
  WEAPON_SPECS, WEAPON_ORDER, PLAYER, ENEMY_TYPES, damageAtRange, effectiveSpread, fireInterval, moveSpeed, enemyParams,
  igniteBurn, burnDamage,
} from '../../src/core/rules.js';
import {
  createArsenal, tryFire, tickWeapons, switchTo, setTrigger, spinLevel, weaponMoveMul, giveWeapon, beginReload,
} from '../../src/core/weapons.js';
import { applyDamage } from '../../src/core/combat.js';

const NEW = ['smg', 'carbine', 'sniper', 'lmg', 'minigun', 'flamer'];
const FRAME = 1000 / 60;

test('the six new weapons follow the three old ones in slot order: slots 4 to 9', () => {
  assert.deepEqual(WEAPON_ORDER.slice(3), NEW);
  assert.equal(WEAPON_ORDER.length, 9, 'the keys 1 to 9 select a weapon each');
});

test('every row is complete and its numbers make sense', () => {
  const num = ['price', 'damage', 'pellets', 'rpm', 'mag', 'reserve', 'reloadMs', 'spreadBase', 'spreadMax', 'spreadPerShot',
    'adsSpreadMul', 'switchMs', 'headMult', 'legMult', 'zoom', 'adsMs', 'noise', 'tracerEvery'];
  for (const id of WEAPON_ORDER) {
    const s = WEAPON_SPECS[id];
    assert.equal(s.id, id);
    assert.equal(typeof s.nameKey, 'string', id + '.nameKey');
    assert.equal(typeof s.sound, 'string', id + '.sound');
    assert.equal(typeof s.auto, 'boolean', id + '.auto');
    assert.equal(typeof s.perShell, 'boolean', id + '.perShell');
    for (const k of num) assert.ok(Number.isFinite(s[k]) && s[k] >= 0, id + '.' + k + ' = ' + s[k]);
    for (const k of ['damage', 'pellets', 'rpm', 'mag', 'reserve', 'reloadMs', 'switchMs', 'zoom', 'adsMs']) assert.ok(s[k] > 0, id + '.' + k);
    assert.ok(Number.isFinite(s.recoil.x) && Number.isFinite(s.recoil.y), id + '.recoil');
    assert.ok(s.spreadMax >= s.spreadBase, id + ' spread');
    assert.ok(s.falloff.zero > s.falloff.full && s.falloff.min >= 0 && s.falloff.min <= 1, id + '.falloff');
    assert.ok(s.zoom <= 1, id + '.zoom');
    if (s.moveMul !== undefined) assert.ok(s.moveMul > 0.5 && s.moveMul <= 1.1, id + '.moveMul');
  }
});

test('the shop prices: the new weapons are for sale, the minigun costs most', () => {
  for (const id of NEW) assert.ok(WEAPON_SPECS[id].price > 0, id);
  const p = (id) => WEAPON_SPECS[id].price;
  assert.ok(p('smg') < p('carbine') && p('carbine') < p('sniper') && p('sniper') < p('lmg') && p('lmg') < p('flamer') && p('flamer') < p('minigun'));
});

test('roles: the smg is fast, weak and short; the second rifle hits harder and fires slower than the AR-7', () => {
  const smg = WEAPON_SPECS.smg, rifle = WEAPON_SPECS.rifle, car = WEAPON_SPECS.carbine;
  assert.ok(smg.rpm > rifle.rpm && smg.damage < rifle.damage && smg.falloff.zero < rifle.falloff.zero && smg.switchMs < rifle.switchMs);
  assert.ok(damageAtRange(smg, 30) < damageAtRange(rifle, 30));
  assert.ok(car.damage > rifle.damage && car.rpm < rifle.rpm && car.moveMul < 1 && car.falloff.full > rifle.falloff.full);
  // three body shots for a grunt with the carbine, five with the rifle
  const hp = enemyParams('grunt', 1).hp;
  assert.equal(Math.ceil(hp / car.damage), 3);
  assert.equal(Math.ceil(hp / rifle.damage), 5);
});

test('sniper: one body shot kills a tier 1 grunt anywhere on the map, a head shot kills a heavy', () => {
  const s = WEAPON_SPECS.sniper;
  for (const dist of [5, 40, 90, 130]) {
    for (const type of ['grunt', 'rusher']) {
      const bot = { hp: enemyParams(type, 1).hp, armor: ENEMY_TYPES[type].armor };
      assert.equal(applyDamage(bot, damageAtRange(s, dist), 'body').dead, true, type + ' at ' + dist + ' m');
    }
    const heavy = { hp: enemyParams('heavy', 1).hp, armor: ENEMY_TYPES.heavy.armor };
    assert.equal(applyDamage(heavy, damageAtRange(s, dist), 'head').dead, true, 'heavy head at ' + dist + ' m');
  }
  // a body shot does not kill a heavy
  const heavy = { hp: enemyParams('heavy', 1).hp, armor: ENEMY_TYPES.heavy.armor };
  assert.equal(applyDamage(heavy, s.damage, 'body').dead, false);
});

test('sniper: wide from the hip, almost nothing when aimed, a slow bolt between shots', () => {
  const s = WEAPON_SPECS.sniper;
  const st = { bloom: 0, ads: 0, speed01: 0, airborne: false, crouched: false };
  assert.ok(effectiveSpread(s, st) >= 4);
  assert.ok(effectiveSpread(s, { ...st, ads: 1 }) < 0.1);
  assert.ok(s.scope && s.zoom <= 0.3, 'strong zoom through the scope');
  const a = createArsenal('sniper');
  assert.equal(tryFire(a, 5000).ok, true);
  assert.equal(tryFire(a, 6000).reason, 'cooldown');
  assert.equal(tryFire(a, 5000 + fireInterval(s) * 1000 + 1).ok, true);
  assert.ok(fireInterval(s) > 1.2);
});

test('machine gun: a 100 round belt, a long reload, slows the player a little', () => {
  const l = WEAPON_SPECS.lmg;
  assert.equal(l.mag, 100);
  assert.ok(l.reloadMs >= 5000 && l.auto);
  assert.ok(l.moveMul < 0.95 && l.moveMul > 0.8);
});

test('flamer: full damage close up, falling to nothing by 10 m; fuel is the magazine', () => {
  const f = WEAPON_SPECS.flamer;
  assert.equal(damageAtRange(f, 1), f.damage);
  assert.ok(damageAtRange(f, 6) > 0 && damageAtRange(f, 6) < f.damage);
  assert.ok(damageAtRange(f, 9.9) > 0);
  assert.equal(damageAtRange(f, 10), 0);
  assert.equal(damageAtRange(f, 25), 0);
  assert.equal(f.range, 10);
  assert.ok(f.flame && f.tracerEvery === 0 && f.pellets > 1 && f.spreadBase >= 5);
  const a = createArsenal('flamer');
  let t = 0, shots = 0;
  for (; t < 1000; t += FRAME) { tickWeapons(a, t); for (let i = 0; i < 3; i++) if (tryFire(a, t).ok) shots++; else break; }
  assert.ok(shots >= 14 && shots <= 16, 'fuel units per second: ' + shots);
  assert.equal(a.weapons.flamer.mag, f.mag - shots);
});

test('burning: a flame hit sets a bot alight for a while, more hits keep it burning', () => {
  const f = WEAPON_SPECS.flamer;
  const b = igniteBurn(null, f, 1000);
  assert.deepEqual(b, { dps: f.burn.dps, until: 1000 + f.burn.ms });
  near(burnDamage(b, 1000, 1500), f.burn.dps * 0.5);
  near(burnDamage(b, 2900, 3500), f.burn.dps * ((1000 + f.burn.ms - 2900) / 1000));
  assert.equal(burnDamage(b, 3000 + f.burn.ms, 9000), 0);
  assert.equal(burnDamage(null, 0, 1000), 0);
  const again = igniteBurn(b, f, 2000);
  assert.equal(again.until, 2000 + f.burn.ms);
  assert.equal(igniteBurn(b, WEAPON_SPECS.rifle, 2000), b, 'bullets do not set anything alight');
});

test('minigun: no shot until the barrels have spun up, then a very high rate', () => {
  const m = WEAPON_SPECS.minigun;
  const a = createArsenal('minigun');
  tickWeapons(a, 0);
  setTrigger(a, true);
  let first = null, shots = 0, reason = null;
  for (let t = FRAME; t < 3000; t += FRAME) {
    tickWeapons(a, t);
    for (let i = 0; i < 3; i++) {
      const r = tryFire(a, t);
      if (r.ok) { shots++; if (first === null) first = t; } else { if (first === null) reason = r.reason; break; }
    }
  }
  assert.equal(reason, 'spinning');
  assert.ok(first >= m.spinUpMs - FRAME && first <= m.spinUpMs + 2 * FRAME, 'first shot at ' + first);
  const perSecond = shots / ((3000 - first) / 1000);
  assert.ok(perSecond > 27 && perSecond < 32, 'rounds per second: ' + perSecond);
});

test('minigun: letting go runs the barrels down; a short pause keeps them turning', () => {
  const m = WEAPON_SPECS.minigun;
  const a = createArsenal('minigun');
  tickWeapons(a, 0);
  setTrigger(a, true);
  let t = 0;
  for (; t < 1000; t += FRAME) tickWeapons(a, t);
  assert.equal(spinLevel(a), 1);
  setTrigger(a, false);
  const stop = t;
  for (; t < stop + 300; t += FRAME) tickWeapons(a, t);
  assert.ok(spinLevel(a) > 0.7 && spinLevel(a) < 1, 'after 0.3 s: ' + spinLevel(a));
  setTrigger(a, true);
  const again = t;
  let fired = null;
  for (; t < again + 1000 && fired === null; t += FRAME) { tickWeapons(a, t); if (tryFire(a, t).ok) fired = t; }
  assert.ok(fired - again < m.spinUpMs / 2, 'fires again after ' + (fired - again) + ' ms');
  setTrigger(a, false);
  const events = [];
  for (const end = t + m.spinDownMs + 100; t < end; t += FRAME) events.push(...tickWeapons(a, t));
  assert.equal(spinLevel(a), 0);
  assert.ok(events.some((e) => e.type === 'spunDown'));
});

test('minigun: switching away stops the barrels, other weapons never spin', () => {
  const a = createArsenal('minigun');
  tickWeapons(a, 0); setTrigger(a, true);
  for (let t = FRAME; t < 1000; t += FRAME) tickWeapons(a, t);
  assert.equal(spinLevel(a), 1);
  setTrigger(a, false);
  switchTo(a, 'rifle', 1000);
  tickWeapons(a, 1000 + WEAPON_SPECS.rifle.switchMs);
  assert.equal(a.current, 'rifle');
  assert.equal(spinLevel(a), 0);
  setTrigger(a, true); tickWeapons(a, 2000);
  assert.equal(spinLevel(a), 0);
  assert.equal(tryFire(a, 2000).ok, true, 'the rifle fires at once');
});

test('the weapon in hand changes how fast the player moves', () => {
  near(moveSpeed({ crouched: false, sprinting: false, ads: 0 }), PLAYER.walk, 1e-9, 'no weapon multiplier');
  near(moveSpeed({ crouched: false, sprinting: false, ads: 0, weapon: 0.72 }), PLAYER.walk * 0.72);
  near(moveSpeed({ crouched: false, sprinting: true, ads: 0, weapon: 0.5 }), PLAYER.sprint * 0.5);
  const a = createArsenal('pistol');
  assert.equal(weaponMoveMul(a), 1);
  for (const id of WEAPON_ORDER) {
    giveWeapon(a, id);
    a.current = id;
    near(weaponMoveMul(a), WEAPON_SPECS[id].moveMul ?? 1, 1e-9, id);
  }
  a.current = 'minigun';
  const still = weaponMoveMul(a);
  assert.ok(still < 0.8, 'the minigun slows the player clearly: ' + still);
  a.spin = 1;
  near(weaponMoveMul(a), WEAPON_SPECS.minigun.moveMul * WEAPON_SPECS.minigun.spinMoveMul);
  assert.ok(weaponMoveMul(a) < still);
  a.current = 'smg';
  assert.ok(weaponMoveMul(a) > 1, 'the smg is light');
});

test('every new weapon fires, empties and reloads through the same rules', () => {
  for (const id of NEW) {
    const spec = WEAPON_SPECS[id];
    const a = createArsenal(id);
    tickWeapons(a, 0);
    setTrigger(a, true);
    let t = 0;
    for (; t < 2000; t += FRAME) tickWeapons(a, t);           // spin up where needed
    const r = tryFire(a, t);
    assert.equal(r.ok, true, id + ' fires');
    assert.equal(r.pellets, spec.pellets);
    assert.equal(a.weapons[id].mag, spec.mag - 1);
    assert.equal(beginReload(a, t + 5000), true, id + ' reloads');
    tickWeapons(a, t + 5000 + spec.reloadMs + 1);
    assert.deepEqual(a.weapons[id], { mag: spec.mag, reserve: spec.reserve - 1 }, id + ' after the reload');
  }
});
