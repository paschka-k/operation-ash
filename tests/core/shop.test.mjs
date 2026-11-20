// Wave 12: the shop between waves and the weapon upgrades.
import { test, assert, near } from '../harness.mjs';
import { createGame, restart } from '../../src/core/waves.js';
import {
  createArsenal, specOf, owns, weaponLevel, setWeaponLevel, beginReload, tickWeapons, reloadProgress,
  START_WEAPONS, WEAPON_SPECS, WEAPON_ORDER,
} from '../../src/core/weapons.js';
import { GRENADE, ARMOR, UPGRADE, upgradeCost, upgradedSpec, reserveMax } from '../../src/core/rules.js';
import { shopOffers, buyWeapon, buyUpgrade, buyGrenade, buyArmor, refillAmmo } from '../../src/core/shop.js';

/** A game standing in the shop with some money, and the start loadout. */
function inShop(money = 10000) {
  const g = createGame(1);
  restart(g, 0);
  g.phase = 'shop';
  g.shop = { wave: 1, refilled: false };
  g.money = money;
  return { g, a: createArsenal('rifle', START_WEAPONS) };
}

test('every weapon with a price that is not owned is on sale, generically over WEAPON_ORDER', () => {
  const { g, a } = inShop();
  const offer = shopOffers(g, a);
  assert.deepEqual(offer.weapons.map((w) => w.id), WEAPON_ORDER);
  for (const w of offer.weapons) {
    const row = WEAPON_SPECS[w.id];
    assert.equal(w.canBuy, row.price > 0 && !owns(a, w.id), w.id);
    assert.equal(w.owned, owns(a, w.id));
  }
  const shotgun = offer.weapons.find((w) => w.id === 'shotgun');
  assert.equal(shotgun.price, 1500);
});

test('buying a weapon takes its price, gives it with full ammunition, and only once', () => {
  const { g, a } = inShop(2000);
  const r = buyWeapon(g, a, 'shotgun');
  assert.deepEqual(r, { ok: true, cost: 1500 });
  assert.equal(g.money, 500);
  assert.ok(owns(a, 'shotgun'));
  assert.deepEqual(a.weapons.shotgun, { mag: 6, reserve: 36 });
  assert.equal(buyWeapon(g, a, 'shotgun').reason, 'owned');
  assert.equal(buyWeapon(g, a, 'pistol').reason, 'owned');
  assert.equal(buyWeapon(g, a, 'no-such-gun').reason, 'unknown');
});

test('a purchase is refused without enough money and outside the shop', () => {
  const { g, a } = inShop(1499);
  assert.equal(buyWeapon(g, a, 'shotgun').reason, 'money');
  assert.equal(g.money, 1499);
  g.money = 99999;
  g.phase = 'wave';
  assert.equal(buyWeapon(g, a, 'shotgun').reason, 'closed');
  assert.equal(buyGrenade(g, a).reason, 'closed');
  assert.equal(buyArmor(g).reason, 'closed');
  assert.equal(buyUpgrade(g, a, 'rifle').reason, 'closed');
  assert.equal(refillAmmo(g, a).reason, 'closed');
  assert.equal(owns(a, 'shotgun'), false);
});

test('upgrade costs grow per level and follow the weapon price (a base for the free start weapons)', () => {
  const rifle = WEAPON_SPECS.rifle, shotgun = WEAPON_SPECS.shotgun;
  const r = [1, 2, 3].map((L) => upgradeCost(rifle, L)), s = [1, 2, 3].map((L) => upgradeCost(shotgun, L));
  assert.deepEqual(r, [400, 700, 1100]);
  assert.deepEqual(s, [600, 1050, 1650]);
  assert.ok(upgradeCost({ price: 4000 }, 1) > upgradeCost(shotgun, 1));
  for (const id of WEAPON_ORDER) {
    const c = [1, 2, 3].map((L) => upgradeCost(WEAPON_SPECS[id], L));
    assert.ok(c[0] < c[1] && c[1] < c[2], id);
  }
});

test('upgradedSpec raises damage and magazine, shortens the reload, and keeps every other field', () => {
  const rifle = WEAPON_SPECS.rifle;
  assert.equal(upgradedSpec(rifle, 0), rifle);
  const l1 = upgradedSpec(rifle, 1), l3 = upgradedSpec(rifle, 3);
  assert.notEqual(l1, rifle);
  assert.equal(rifle.mag, 30, 'the row itself is never changed');
  assert.ok(l1.damage > rifle.damage && l3.damage > l1.damage);
  assert.ok(l1.mag > rifle.mag && l3.mag > l1.mag);
  assert.ok(l1.reloadMs < rifle.reloadMs && l3.reloadMs < l1.reloadMs);
  assert.ok(l3.recoil.x < rifle.recoil.x);
  assert.deepEqual([l3.damage, l3.mag, l3.reserve, l3.reloadMs], [29.9, 44, 264, 1610]);
  for (const k of ['id', 'nameKey', 'price', 'rpm', 'auto', 'pellets', 'falloff', 'sound', 'perShell']) assert.deepEqual(l3[k], rifle[k], k);
  // a row of wave 13 with fields this code has never heard of
  const flamer = { id: 'flamer', nameKey: 'w_flamer', price: 3000, damage: 6, mag: 100, reserve: 200, reloadMs: 3000, fuel: 100, spinUpMs: 0, scope: null, moveMul: 0.9, recoil: { x: 0.1, y: 0.1 } };
  const f2 = upgradedSpec(flamer, 2);
  assert.deepEqual([f2.fuel, f2.spinUpMs, f2.scope, f2.moveMul], [100, 0, null, 0.9]);
  assert.ok(f2.mag > 100 && f2.damage > 6);
  // small magazines still gain a round per level
  assert.equal(upgradedSpec({ mag: 2, reserve: 10 }, 3).mag, 5);
});

test('buying upgrades: three levels, then no more; the arsenal reads the upgraded numbers', () => {
  const { g, a } = inShop(10000);
  a.weapons.rifle.mag = 30;
  for (let L = 1; L <= 3; L++) {
    const before = g.money;
    const r = buyUpgrade(g, a, 'rifle');
    assert.equal(r.ok, true); assert.equal(r.level, L);
    assert.equal(before - g.money, upgradeCost(WEAPON_SPECS.rifle, L));
  }
  assert.equal(buyUpgrade(g, a, 'rifle').reason, 'max');
  assert.equal(weaponLevel(a, 'rifle'), 3);
  assert.equal(specOf(a, 'rifle').mag, 44);
  assert.equal(a.weapons.rifle.mag, 44, 'a full magazine stays full when it grows');
  assert.equal(buyUpgrade(g, a, 'shotgun').reason, 'notOwned');
  // reload uses the faster time
  a.weapons.rifle.mag = 0;
  a.lastTick = 0;
  assert.equal(beginReload(a, 1000), true);
  tickWeapons(a, 1000 + specOf(a).reloadMs - 10);
  assert.ok(reloadProgress(a, 1000 + specOf(a).reloadMs - 10) > 0.99);
  tickWeapons(a, 1000 + specOf(a).reloadMs);
  assert.equal(a.weapons.rifle.mag, 44);
  assert.equal(reserveMax(specOf(a, 'rifle')), Math.round(264 * 1.5), 'the carrying limit follows the upgrade');
});

test('the six wave 13 weapons are sold, upgraded and refilled like the old ones, keeping their own fields', () => {
  const NEW = ['smg', 'carbine', 'sniper', 'lmg', 'minigun', 'flamer'];
  const { g, a } = inShop(200000);
  const offer = shopOffers(g, a);
  for (const id of NEW) {
    const w = offer.weapons.find((x) => x.id === id);
    assert.ok(w && w.forSale && w.canBuy && w.nameKey === 'w_' + id, id);
  }
  for (const id of NEW) {
    assert.equal(buyWeapon(g, a, id).ok, true, id);
    const row = WEAPON_SPECS[id];
    assert.deepEqual(a.weapons[id], { mag: row.mag, reserve: row.reserve }, id);
    for (let L = 1; L <= UPGRADE.maxLevel; L++) assert.equal(buyUpgrade(g, a, id).ok, true, id + ' level ' + L);
    const up = specOf(a, id);
    assert.ok(up.damage > row.damage && up.mag > row.mag && up.reloadMs < row.reloadMs, id);
    for (const k of ['moveMul', 'spinUpMs', 'spinDownMs', 'spinMoveMul', 'noAds', 'scope', 'boltAction', 'flame', 'range', 'burn']) {
      assert.deepEqual(up[k], row[k], id + '.' + k);
    }
    assert.equal(a.weapons[id].mag, up.mag, id + ': a full magazine (belt, tank) grows with the upgrade');
  }
  assert.ok(specOf(a, 'minigun').mag > 300 && specOf(a, 'flamer').mag > 100, 'a longer belt and a bigger tank');
  // the free refill fills fuel and belts to the upgraded size
  a.weapons.flamer.mag = 0; a.weapons.flamer.reserve = 0;
  a.weapons.minigun.mag = 5; a.weapons.minigun.reserve = 0;
  assert.equal(refillAmmo(g, a).ok, true);
  assert.deepEqual(a.weapons.flamer, { mag: specOf(a, 'flamer').mag, reserve: specOf(a, 'flamer').reserve });
  assert.deepEqual(a.weapons.minigun, { mag: specOf(a, 'minigun').mag, reserve: specOf(a, 'minigun').reserve });
});

test('setWeaponLevel(0) goes back to the plain row', () => {
  const a = createArsenal('rifle', ['rifle']);
  setWeaponLevel(a, 'rifle', 2);
  assert.equal(specOf(a).level, 2);
  setWeaponLevel(a, 'rifle', 0);
  assert.equal(specOf(a), WEAPON_SPECS.rifle);
  assert.equal(a.weapons.rifle.mag, 30);
  assert.deepEqual(a.levels, {});
});

test('grenades are sold one at a time up to the carrying limit', () => {
  const { g, a } = inShop(10000);
  assert.equal(a.grenades, GRENADE.start);
  while (a.grenades < GRENADE.max) assert.deepEqual(buyGrenade(g, a), { ok: true, cost: GRENADE.price });
  assert.equal(buyGrenade(g, a).reason, 'max');
  assert.equal(g.money, 10000 - (GRENADE.max - GRENADE.start) * GRENADE.price);
});

test('armour has three levels with growing points, each bought one after another, and comes full', () => {
  const { g } = inShop(10000);
  for (let L = 1; L < ARMOR.points.length; L++) {
    const r = buyArmor(g);
    assert.equal(r.ok, true);
    assert.equal(g.player.armorLevel, L);
    assert.equal(g.player.armor, ARMOR.points[L]);
    assert.ok(ARMOR.points[L] > ARMOR.points[L - 1]);
  }
  assert.equal(buyArmor(g).reason, 'max');
  assert.equal(g.money, 10000 - ARMOR.prices.reduce((s, p) => s + p, 0));
});

test('the free ammo refill fills every owned weapon once per shop visit', () => {
  const { g, a } = inShop(0);
  a.weapons.rifle.mag = 3; a.weapons.rifle.reserve = 10;
  a.weapons.pistol.mag = 0; a.weapons.pistol.reserve = 0;
  assert.equal(refillAmmo(g, a).reason, undefined);
  assert.deepEqual(a.weapons.rifle, { mag: 30, reserve: 180 });
  assert.deepEqual(a.weapons.pistol, { mag: 12, reserve: 60 });
  assert.equal(g.money, 0, 'it is free');
  a.weapons.rifle.mag = 0;
  assert.equal(refillAmmo(g, a).reason, 'used');
  // a full arsenal does not use up the refill
  const s = inShop(0);
  assert.equal(refillAmmo(s.g, s.a).reason, 'full');
  assert.equal(s.g.shop.refilled, false);
  // a bigger reserve than the starting one is kept
  const k = inShop(0);
  k.a.weapons.rifle.reserve = 250; k.a.weapons.rifle.mag = 1;
  refillAmmo(k.g, k.a);
  assert.deepEqual(k.a.weapons.rifle, { mag: 30, reserve: 250 });
});

test('shopOffers lists armour, grenades, refill and what each purchase would do', () => {
  const { g, a } = inShop(450);
  const o = shopOffers(g, a);
  assert.equal(o.money, 450);
  assert.deepEqual([o.armor.level, o.armor.nextPoints, o.armor.price, o.armor.canBuy], [0, 50, 800, false]);
  assert.deepEqual([o.grenade.count, o.grenade.max, o.grenade.canBuy], [GRENADE.start, GRENADE.max, true]);
  assert.equal(o.refill.canUse, true);
  const rifle = o.weapons.find((w) => w.id === 'rifle');
  assert.deepEqual([rifle.owned, rifle.level, rifle.upgradeCost, rifle.canUpgrade], [true, 0, 400, true]);
  assert.equal(rifle.next.mag, upgradedSpec(WEAPON_SPECS.rifle, 1).mag);
  assert.equal(UPGRADE.maxLevel, 3);
});

// ---- wave 15: the map of the next wave in the shop
import { MAP_IDS, chooseMap } from '../../src/core/maps.js';

test('shop: before wave 6 it names the next map in order without a choice', () => {
  const { g, a } = inShop();
  g.wave = 4; g.shop = { wave: 4, refilled: false, map: 'railyard' };   // wave 5 is map 5
  const m = shopOffers(g, a).maps;
  assert.equal(m.open, false);
  assert.equal(m.next, 'railyard');
  assert.deepEqual(m.choices.map((c) => c.id), MAP_IDS);
  assert.deepEqual(m.choices.map((c) => c.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const sel = m.choices.filter((c) => c.selected).map((c) => c.id);
  assert.deepEqual(sel, ['railyard']);
  assert.deepEqual(m.choices.filter((c) => c.default).map((c) => c.id), ['railyard']);
});

test('shop: from wave 6 the ten maps are a choice, the picked one selected, the one in order marked', () => {
  const { g, a } = inShop();
  g.wave = 5; g.shop = { wave: 5, refilled: false, map: 'airfield' };
  assert.equal(shopOffers(g, a).maps.open, true);
  assert.deepEqual(chooseMap(g, 'desert'), { ok: true });
  const m = shopOffers(g, a).maps;
  assert.equal(m.next, 'desert');
  assert.deepEqual(m.choices.filter((c) => c.selected).map((c) => c.id), ['desert']);
  assert.deepEqual(m.choices.filter((c) => c.default).map((c) => c.id), ['airfield']);
  g.phase = 'wave';
  assert.equal(shopOffers(g, a).maps.open, false, 'outside the shop nothing is open');
});
