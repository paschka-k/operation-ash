import { test, assert, near } from '../harness.mjs';
import {
  createArsenal, tryFire, beginReload, switchTo, tickWeapons, addAmmo, addAmmoAll, setStance, spreadDeg, totalAmmo,
  reloadProgress, WEAPON_SPECS, resetArsenal,
} from '../../src/core/weapons.js';

/** Hold the trigger for ms milliseconds at 60 fps. Returns the number of shots fired. */
function hold(a, startMs, ms, auto = true) {
  let shots = 0, last = false;
  for (let t = startMs; t < startMs + ms; t += 1000 / 60) {
    tickWeapons(a, t);
    if (auto || !last) { const r = tryFire(a, t); if (r.ok) shots++; }
    last = true;
  }
  return shots;
}

test('a new arsenal has every weapon full and the rifle in hand', () => {
  const a = createArsenal('rifle', ['pistol', 'rifle', 'shotgun']);
  assert.equal(a.current, 'rifle');
  assert.deepEqual(a.weapons.pistol, { mag: 12, reserve: 60 });
  assert.deepEqual(a.weapons.rifle, { mag: 30, reserve: 180 });
  assert.deepEqual(a.weapons.shotgun, { mag: 6, reserve: 36 });
  assert.equal(totalAmmo(a), 12 + 60 + 30 + 180 + 6 + 36);
});
test('the rifle fires at about 700 rounds per minute while the trigger is held', () => {
  const a = createArsenal();
  const shots = hold(a, 1000, 1000);
  assert.ok(shots >= 10 && shots <= 13, 'shots in one second: ' + shots);
});
test('the pistol is semi-automatic with a 200 ms cooldown (300 rpm)', () => {
  const a = createArsenal('pistol');
  assert.equal(tryFire(a, 1000).ok, true);
  const r = tryFire(a, 1100);
  assert.deepEqual([r.ok, r.reason], [false, 'cooldown']);
  assert.equal(tryFire(a, 1210).ok, true);
});
test('firing spends one round and reports the cone and recoil', () => {
  const a = createArsenal();
  const r = tryFire(a, 1000);
  assert.equal(a.weapons.rifle.mag, 29);
  assert.equal(r.pellets, 1);
  near(r.spreadDeg, 0.4);
  assert.deepEqual(r.recoil, { x: 0.9, y: 0.35 });
});
test('a burst widens the cone, resting cools it down again', () => {
  const a = createArsenal();
  const first = tryFire(a, 1000).spreadDeg;
  hold(a, 1100, 600);
  assert.ok(spreadDeg(a) > first + 0.5, 'after a burst: ' + spreadDeg(a));
  tickWeapons(a, 3000); tickWeapons(a, 3100); tickWeapons(a, 3200); tickWeapons(a, 3300);
  for (let t = 3400; t < 6000; t += 100) tickWeapons(a, t);
  near(spreadDeg(a), 0.4, 0.01);
});
test('the cone reported by tryFire is the one the crosshair showed', () => {
  const a = createArsenal();
  setStance(a, { ads: 0.5, speed01: 0.7, airborne: false, crouched: false });
  const shown = spreadDeg(a);
  const r = tryFire(a, 1000);
  assert.equal(r.spreadDeg, shown);
});
test('aiming narrows the cone, running widens it', () => {
  const a = createArsenal();
  const rest = spreadDeg(a);
  setStance(a, { ads: 1 });
  assert.ok(spreadDeg(a) < rest * 0.5);
  setStance(a, { ads: 0, speed01: 1 });
  assert.ok(spreadDeg(a) > rest * 2);
});
test('an empty magazine clicks and reloads by itself when there is a reserve', () => {
  const a = createArsenal('pistol');
  a.weapons.pistol.mag = 0;
  const r = tryFire(a, 1000);
  assert.deepEqual([r.ok, r.reason, r.reloading], [false, 'empty', true]);
  assert.ok(a.reload);
  tickWeapons(a, 1000 + 1500);
  assert.equal(a.weapons.pistol.mag, 0);
  tickWeapons(a, 1000 + 1601);
  assert.deepEqual(a.weapons.pistol, { mag: 12, reserve: 48 });
});
test('with no reserve left an empty weapon only clicks', () => {
  const a = createArsenal('pistol');
  a.weapons.pistol.mag = 0; a.weapons.pistol.reserve = 0;
  const r = tryFire(a, 1000);
  assert.deepEqual([r.ok, r.reason, r.reloading], [false, 'empty', false]);
  assert.equal(a.reload, null);
});
test('rifle reload takes 2.3 s and moves rounds from the reserve', () => {
  const a = createArsenal();
  hold(a, 0, 400);
  const spent = 30 - a.weapons.rifle.mag;
  assert.ok(spent > 0);
  assert.equal(beginReload(a, 1000), true);
  assert.equal(beginReload(a, 1001), false);
  near(reloadProgress(a, 1000 + 1150), 0.5, 0.01);
  assert.equal(tryFire(a, 1500).reason, 'reloading');
  const ev = tickWeapons(a, 1000 + 2301);
  assert.ok(ev.some((e) => e.type === 'reloadDone'));
  assert.deepEqual(a.weapons.rifle, { mag: 30, reserve: 180 - spent });
});
test('no reload when the magazine is full or the reserve is empty', () => {
  const a = createArsenal();
  assert.equal(beginReload(a, 0), false);
  a.weapons.rifle.mag = 5; a.weapons.rifle.reserve = 0;
  assert.equal(beginReload(a, 0), false);
});
test('a reload of a partly used magazine only adds what is missing', () => {
  const a = createArsenal();
  a.weapons.rifle.mag = 25;
  beginReload(a, 0); tickWeapons(a, 2400);
  assert.deepEqual(a.weapons.rifle, { mag: 30, reserve: 175 });
});
test('switching takes the weapon switch time, blocks firing and swaps halfway', () => {
  const a = createArsenal();
  assert.equal(switchTo(a, 'pistol', 1000), true);
  assert.equal(switchTo(a, 'shotgun', 1010), false);
  assert.equal(tryFire(a, 1050).reason, 'switching');
  assert.equal(a.current, 'rifle');
  tickWeapons(a, 1000 + 160);
  assert.equal(a.current, 'pistol');
  assert.equal(a.previous, 'rifle');
  tickWeapons(a, 1000 + 301);
  assert.equal(a.switching, null);
  assert.equal(tryFire(a, 1400).ok, true);
});
test('switching away in the middle of a reload loses the progress', () => {
  const a = createArsenal();
  a.weapons.rifle.mag = 10;
  beginReload(a, 0);
  switchTo(a, 'pistol', 1000);
  assert.equal(a.reload, null);
  tickWeapons(a, 1000 + 400); tickWeapons(a, 6000);
  assert.equal(a.weapons.rifle.mag, 10);
});
test('switching to the same or an unknown weapon does nothing', () => {
  const a = createArsenal();
  assert.equal(switchTo(a, 'rifle', 0), false);
  assert.equal(switchTo(a, 'rocket', 0), false);
});
test('shotgun: eight pellets, one shot per 0.8 s, shells loaded one by one', () => {
  const a = createArsenal('shotgun');
  const r = tryFire(a, 1000);
  assert.equal(r.pellets, 8);
  assert.equal(tryFire(a, 1500).reason, 'cooldown');
  assert.equal(tryFire(a, 1800).ok, true);
  assert.equal(a.weapons.shotgun.mag, 4);
  assert.equal(beginReload(a, 2000), true);
  assert.ok(a.reload.perShell);
  tickWeapons(a, 2400);
  assert.equal(a.weapons.shotgun.mag, 5);
  tickWeapons(a, 2400 + 480);
  assert.equal(a.weapons.shotgun.mag, 6);
  assert.equal(a.reload, null);
  assert.equal(a.weapons.shotgun.reserve, 34);
});
test('shotgun: firing interrupts shell loading as long as there is a shell', () => {
  const a = createArsenal('shotgun');
  a.weapons.shotgun.mag = 2;
  beginReload(a, 0);
  tickWeapons(a, 400);
  assert.equal(a.weapons.shotgun.mag, 3);
  const r = tryFire(a, 410);
  assert.equal(r.ok, true);
  assert.equal(a.reload, null);
});
test('ammo boxes: one magazine per weapon, capped at the carrying limit', () => {
  const a = createArsenal();
  a.weapons.pistol.reserve = 0; a.weapons.rifle.reserve = 0; a.weapons.shotgun.reserve = 0;
  assert.equal(addAmmoAll(a, 1), true);
  assert.deepEqual([a.weapons.pistol.reserve, a.weapons.rifle.reserve, a.weapons.shotgun.reserve], [12, 30, 6]);
  const b = createArsenal();
  b.weapons.rifle.reserve = 265;
  assert.equal(addAmmo(b, 'rifle', 1), true);
  assert.equal(b.weapons.rifle.reserve, 270);
  assert.equal(addAmmo(b, 'rifle', 1), false);
  assert.equal(addAmmo(b, 'nope', 1), false);
});
test('resetArsenal restores the starting loadout', () => {
  const a = createArsenal();
  hold(a, 0, 500); switchTo(a, 'pistol', 600);
  resetArsenal(a);
  assert.deepEqual(a.weapons.rifle, { mag: 30, reserve: 180 });
  assert.equal(a.switching, null); assert.equal(a.current, 'rifle');
});
test('weapons are data: every row has the fields the logic needs', () => {
  for (const spec of Object.values(WEAPON_SPECS)) {
    for (const k of ['id', 'damage', 'pellets', 'rpm', 'mag', 'reserve', 'reloadMs', 'spreadBase', 'spreadMax', 'spreadPerShot', 'recoil', 'adsSpreadMul', 'switchMs', 'falloff']) {
      assert.ok(spec[k] !== undefined, spec.id + '.' + k);
    }
  }
});
