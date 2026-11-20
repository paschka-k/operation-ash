// core/shop: what the shop between waves sells and what a purchase does. Pure: it works on the
// game state of core/waves (money, armour, the shop visit) and the arsenal of core/weapons.
//
//   const offer = shopOffers(g, a);       // everything the screen shows, with prices and what is possible
//   buyWeapon(g, a, 'shotgun');           // {ok:true, cost} or {ok:false, reason}
//
// Reasons a purchase is refused: 'closed' (not in the shop phase), 'unknown', 'owned', 'notOwned',
// 'notForSale', 'max', 'money', 'used', 'full'. Spending lowers the money, never the score.
// Weapons on sale are every id of WEAPON_ORDER with a price above 0 that the player does not own,
// so a new row in WEAPON_SPECS shows up in the shop without code here.

import { WEAPON_SPECS, WEAPON_ORDER, GRENADE, UPGRADE, ARMOR, upgradeCost, upgradedSpec } from './rules.js';
import { owns, giveWeapon, specOf, weaponLevel, setWeaponLevel, refillArsenal, addGrenades } from './weapons.js';
import { MAPS, defaultMapFor, mapChoiceOpen } from './maps.js';

const no = (reason) => ({ ok: false, reason });

function spend(g, cost) {
  g.money -= cost;
  g.spent = (g.spent || 0) + cost;
  return { ok: true, cost };
}

function check(g, cost) {
  if (g.phase !== 'shop') return 'closed';
  if (g.money < cost) return 'money';
  return null;
}

/** Everything the shop can show right now. */
export function shopOffers(g, a) {
  const open = g.phase === 'shop';
  const weapons = WEAPON_ORDER.filter((id) => WEAPON_SPECS[id]).map((id) => {
    const row = WEAPON_SPECS[id], have = owns(a, id), level = weaponLevel(a, id);
    const next = level < UPGRADE.maxLevel ? level + 1 : null;
    const upCost = next ? upgradeCost(row, next) : 0;
    return {
      id, nameKey: row.nameKey, price: row.price, owned: have, forSale: row.price > 0, level, maxLevel: UPGRADE.maxLevel,
      canBuy: open && !have && row.price > 0 && g.money >= row.price,
      upgradeCost: upCost,
      canUpgrade: open && have && !!next && g.money >= upCost,
      now: specOf(a, id),
      next: next ? upgradedSpec(row, next) : null,
    };
  });
  const p = g.player, armorNext = p.armorLevel < ARMOR.points.length - 1 ? p.armorLevel + 1 : null;
  return {
    open, money: g.money, wave: g.wave, stage: g.stage,
    weapons,
    grenade: { count: a.grenades, max: GRENADE.max, price: GRENADE.price, canBuy: open && a.grenades < GRENADE.max && g.money >= GRENADE.price },
    armor: {
      level: p.armorLevel, maxLevel: ARMOR.points.length - 1, points: p.armor, max: p.armorMax, absorb: ARMOR.absorb,
      nextPoints: armorNext ? ARMOR.points[armorNext] : null, price: armorNext ? ARMOR.prices[armorNext] : 0,
      canBuy: open && !!armorNext && g.money >= ARMOR.prices[armorNext],
    },
    refill: { used: !!(g.shop && g.shop.refilled), canUse: open && !!g.shop && !g.shop.refilled },
    maps: mapOffer(g, open),
  };
}

/**
 * The map of the next wave: `next` is the one leaveShop() will take, `open` whether the player may
 * pick another (chooseMap in core/maps). Every map is listed; `default` marks the one in order.
 */
function mapOffer(g, open) {
  const inOrder = defaultMapFor(g.wave + 1, g.endless);
  const next = (g.shop && g.shop.map) || inOrder;
  return {
    open: open && mapChoiceOpen(g.wave + 1, g.endless),
    next,
    choices: MAPS.map((m) => ({
      id: m.id, order: m.order, nameKey: m.nameKey, themeKey: m.themeKey, selected: m.id === next, default: m.id === inOrder,
    })),
  };
}

/** Buy a weapon with full ammunition. */
export function buyWeapon(g, a, id) {
  const row = WEAPON_SPECS[id];
  if (!row) return no('unknown');
  if (owns(a, id)) return no('owned');
  if (!(row.price > 0)) return no('notForSale');
  const r = check(g, row.price);
  if (r) return no(r);
  giveWeapon(a, id);
  return spend(g, row.price);
}

/** Raise an owned weapon by one level. */
export function buyUpgrade(g, a, id) {
  const row = WEAPON_SPECS[id];
  if (!row) return no('unknown');
  if (!owns(a, id)) return no('notOwned');
  const level = weaponLevel(a, id);
  if (level >= UPGRADE.maxLevel) return no('max');
  const cost = upgradeCost(row, level + 1);
  const r = check(g, cost);
  if (r) return no(r);
  setWeaponLevel(a, id, level + 1);
  return { ...spend(g, cost), level: level + 1 };
}

/** One grenade, up to the carrying limit. */
export function buyGrenade(g, a) {
  if (a.grenades >= GRENADE.max) return no('max');
  const r = check(g, GRENADE.price);
  if (r) return no(r);
  addGrenades(a, 1);
  return spend(g, GRENADE.price);
}

/** The next armour level. New armour comes full. */
export function buyArmor(g) {
  const p = g.player, next = p.armorLevel + 1;
  if (next >= ARMOR.points.length) return no('max');
  const cost = ARMOR.prices[next];
  const r = check(g, cost);
  if (r) return no(r);
  p.armorLevel = next;
  p.armorMax = ARMOR.points[next];
  p.armor = p.armorMax;
  return { ...spend(g, cost), level: next };
}

/** The free refill: full magazines and at least the starting reserve, once per visit. */
export function refillAmmo(g, a) {
  if (g.phase !== 'shop' || !g.shop) return no('closed');
  if (g.shop.refilled) return no('used');
  if (!refillArsenal(a)) return no('full');
  g.shop.refilled = true;
  return { ok: true, cost: 0 };
}
