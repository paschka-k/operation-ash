// Owned weapons, slot order, grenade counts: the parts of the arsenal the shop builds on.
import { test, assert } from '../harness.mjs';
import {
  createArsenal, resetArsenal, giveWeapon, owns, cycleWeapon, switchTo, tickWeapons, addAmmoAll, totalAmmo,
  addGrenades, takeGrenade, specOf, WEAPON_SPECS, WEAPON_ORDER, START_WEAPONS,
} from '../../src/core/weapons.js';
import { GRENADE } from '../../src/core/rules.js';

test('every weapon in the slot order has a row, a name and a price', () => {
  for (const id of WEAPON_ORDER) {
    const s = WEAPON_SPECS[id];
    assert.ok(s, 'row for ' + id);
    assert.equal(s.id, id);
    assert.ok(s.nameKey, 'name of ' + id);
    assert.ok(Number.isFinite(s.price) && s.price >= 0, 'price of ' + id);
  }
  for (const id of START_WEAPONS) assert.ok(WEAPON_ORDER.includes(id));
  assert.ok(START_WEAPONS.includes('pistol') && START_WEAPONS.includes('rifle'), 'the brief asks for a pistol and an assault rifle');
});

test('an arsenal owns only what it was given, in slot order', () => {
  const a = createArsenal('rifle', ['rifle', 'pistol']);
  assert.deepEqual(a.owned, ['pistol', 'rifle']);
  assert.equal(owns(a, 'shotgun'), false);
  assert.equal(a.weapons.shotgun, undefined);
  assert.equal(totalAmmo(a), 12 + 60 + 30 + 180);
  assert.equal(a.previous, 'pistol');
});

test('the weapon in hand is always owned', () => {
  const a = createArsenal('shotgun', ['pistol']);
  assert.deepEqual(a.owned, ['pistol', 'shotgun']);
});

test('switching to a weapon the player does not own is refused', () => {
  const a = createArsenal('rifle', ['pistol', 'rifle']);
  assert.equal(switchTo(a, 'shotgun', 0), false);
  assert.equal(switchTo(a, 'pistol', 0), true);
});

test('giveWeapon adds a full weapon once and keeps the slot order', () => {
  const a = createArsenal('rifle', ['rifle']);
  assert.equal(a.previous, null);
  assert.equal(giveWeapon(a, 'shotgun'), true);
  assert.equal(giveWeapon(a, 'shotgun'), false);
  assert.equal(giveWeapon(a, 'no-such-gun'), false);
  giveWeapon(a, 'pistol');
  assert.deepEqual(a.owned, ['pistol', 'rifle', 'shotgun']);
  assert.deepEqual(a.weapons.shotgun, { mag: WEAPON_SPECS.shotgun.mag, reserve: WEAPON_SPECS.shotgun.reserve });
  assert.equal(a.previous, 'shotgun');
  assert.equal(switchTo(a, 'shotgun', 0), true);
  tickWeapons(a, 1000);
  assert.equal(a.current, 'shotgun');
});

test('the wheel cycles through owned weapons only and wraps around', () => {
  const a = createArsenal('rifle', ['pistol', 'rifle']);
  assert.equal(cycleWeapon(a, 1), 'pistol');
  assert.equal(cycleWeapon(a, -1), 'pistol');
  giveWeapon(a, 'shotgun');
  assert.equal(cycleWeapon(a, 1), 'shotgun');
  assert.equal(cycleWeapon(a, -1), 'pistol');
  const one = createArsenal('rifle', ['rifle']);
  assert.equal(cycleWeapon(one, 1), 'rifle');
});

test('an ammo box fills owned weapons only', () => {
  const a = createArsenal('rifle', ['pistol', 'rifle']);
  a.weapons.pistol.reserve = 0; a.weapons.rifle.reserve = 0;
  assert.equal(addAmmoAll(a, 1), true);
  assert.equal(a.weapons.pistol.reserve, 12);
  assert.equal(a.weapons.rifle.reserve, 30);
  assert.equal(a.weapons.shotgun, undefined);
});

test('specOf reads the upgraded numbers when there are any', () => {
  const a = createArsenal('rifle', ['rifle']);
  assert.equal(specOf(a), WEAPON_SPECS.rifle);
  a.specs.rifle = { ...WEAPON_SPECS.rifle, mag: 40 };
  assert.equal(specOf(a).mag, 40);
  assert.equal(specOf(a, 'pistol'), WEAPON_SPECS.pistol);
});

test('grenades start at their count, stop at the limit and run out', () => {
  const a = createArsenal();
  assert.equal(a.grenades, GRENADE.start);
  assert.equal(addGrenades(a, 99), GRENADE.max - GRENADE.start);
  assert.equal(a.grenades, GRENADE.max);
  assert.equal(addGrenades(a, 1), 0);
  for (let i = 0; i < GRENADE.max; i++) assert.equal(takeGrenade(a), true);
  assert.equal(takeGrenade(a), false);
  assert.equal(a.grenades, 0);
});

test('a reset goes back to the starting loadout', () => {
  const a = createArsenal('rifle', START_WEAPONS);
  for (const id of WEAPON_ORDER) giveWeapon(a, id);
  a.grenades = 0;
  a.specs.rifle = { ...WEAPON_SPECS.rifle };
  resetArsenal(a, 'rifle', START_WEAPONS);
  assert.deepEqual(a.owned, WEAPON_ORDER.filter((id) => START_WEAPONS.includes(id)));
  assert.equal(a.grenades, GRENADE.start);
  assert.deepEqual(a.specs, {});
});
