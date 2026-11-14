// The shop between waves, the inventory overlay, and money and armour on the HUD.
//
// The rules (prices, what a purchase does) live in core/shop.js; this module only draws them and
// sends the clicks there. The shop is a screen ('shop', added with hud.addScreen); the inventory is
// an overlay inside the HUD that the 'inventory' action (I) opens and closes during play without
// pausing. Every clickable thing is a <button class="btn"> so keyboard and gamepad focus reach it.

import { t, getLang } from '../config.js';
import { shopOffers, buyWeapon, buyUpgrade, buyGrenade, buyArmor, refillAmmo } from '../core/shop.js';
import { specOf, weaponLevel, WEAPON_ORDER, WEAPON_SPECS } from '../core/weapons.js';
import { GRENADE, UPGRADE, ARMOR } from '../core/rules.js';

// After a purchase its row ignores clicks this long (interface timing, not a game rule).
const PURCHASE_GUARD_MS = 400;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A string with {name} fields filled in. Unlike t(key, vars) it is safe for values that contain '$'. */
function tf(key, vars) {
  let s = t(key);
  for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

const locale = () => (getLang() === 'en' ? 'en-US' : 'ru-RU');
const num = (x, digits = 1) => Number(x).toLocaleString(locale(), { maximumFractionDigits: digits });
export const fmtMoney = (n) => tf('moneyFmt', { n: Math.round(n).toLocaleString(locale()) });
const weaponName = (id) => { const s = WEAPON_SPECS[id]; return esc(t(s && s.nameKey ? s.nameKey : id)); };

export class Shop {
  constructor(game) {
    this.game = game;
    this.hud = game.hud;
    this.invOpen = false;
    this.invT = 0;
    this.invHtml = '';
    this.moneyShown = false;
    this.armorFill = '';
    this.root = this.hud.addScreen('shop', `
      <div class="panel shop">
        <div class="shop-top">
          <div>
            <div class="logo small" data-t="shop"></div>
            <div class="shop-sub" id="shop-sub"></div>
          </div>
          <div class="shop-wallet"><span data-t="money"></span><b id="shop-money"></b></div>
        </div>
        <div class="shop-earn" id="shop-earn"></div>
        <div class="shop-cols">
          <section class="shop-col">
            <div class="shop-h" data-t="shopWeapons"></div>
            <div class="shop-list" id="shop-weapons"></div>
          </section>
          <section class="shop-col">
            <div class="shop-h" data-t="shopGear"></div>
            <div class="shop-list" id="shop-gear"></div>
            <div class="shop-h" data-t="shopCarry"></div>
            <div class="inv-list" id="shop-inv"></div>
          </section>
        </div>
        <div class="shop-foot">
          <div class="shop-msg" id="shop-msg"></div>
          <button class="btn primary" id="btn-shop-go"></button>
        </div>
      </div>`, 'shop-screen');
    this.root.addEventListener('click', (e) => this.onClick(e));
    // A held Enter repeats the activation of the focused button: every purchase needs a new press.
    this.root.addEventListener('keydown', (e) => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
    }, true);
    this.guard = { key: null, until: 0 };   // the row just bought from, deaf for a moment

    // the inventory overlay lives in the HUD, so it hides with it behind every screen
    this.inv = document.createElement('div');
    this.inv.className = 'inventory hidden';
    this.inv.id = 'h-inv';
    this.hud.hud.appendChild(this.inv);
  }

  q(id) { return document.getElementById(id); }

  /** Money as the interface writes it ("1 250 $", "$1,250"). */
  fmtMoney(n) { return fmtMoney(n); }

  // ------------------------------------------------------------------ shop
  /** Show the shop screen with fresh numbers. */
  open() {
    this.closeInventory();
    this.message('');
    this.render();
    this.hud.showScreen('shop');
  }

  close() { this.message(''); }

  /** A new game: nothing of the last one stays open. */
  reset() {
    this.closeInventory();
    this.message('');
  }

  message(text, bad = false) {
    const m = this.q('shop-msg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled || !this.root.contains(b)) return;
    const g = this.game, now = performance.now();
    // the button the focus moved to after a purchase (render) is just as deaf: a quick second press
    // of Enter or of the pad's A must not buy something else or leave the shop
    if (now < this.guard.until && this.guard.moved && (b.dataset.key || b.id) === this.guard.moved) return;
    if (b.id === 'btn-shop-go') { g.leaveShop(); return; }
    // A row redraws in place after a purchase (Buy becomes Upgrade, armour 1 becomes armour 2), so
    // the second click of a double click or a gamepad button held down would buy the next step too.
    const key = b.dataset.key;
    if (key && key === this.guard.key && now < this.guard.until) return;
    const core = g.director.core, a = g.weapons.arsenal, id = b.dataset.id;
    let r, done = '';
    switch (b.dataset.act) {
      case 'buy': r = buyWeapon(core, a, id); done = tf('bought', { x: weaponName(id) }); break;
      case 'up': r = buyUpgrade(core, a, id); done = tf('upgraded', { x: weaponName(id), n: weaponLevel(a, id) }); break;
      case 'grenade': r = buyGrenade(core, a); done = tf('bought', { x: t('grenades') }); break;
      case 'armor': r = buyArmor(core); done = tf('bought', { x: t('armor') }); break;
      case 'refill': r = refillAmmo(core, a); done = t('refilled'); break;
      default: return;
    }
    if (r.ok) {
      g.audio.purchase(true);
      this.message(done);
      this.guard = { key, until: now + PURCHASE_GUARD_MS, moved: null };
    } else {
      g.audio.purchase(false);
      this.message(this.reasonText(r.reason), true);
    }
    this.render();
  }

  reasonText(reason) {
    return {
      money: t('notEnough'), used: t('refillUsed'), full: t('refillFull'), max: t('maxed'),
    }[reason] || reason;
  }

  /** One line of numbers for a weapon; with `next` it shows what the upgrade changes. */
  statLine(now, next) {
    const parts = [];
    const add = (label, f) => {
      const a = f(now), b = next ? f(next) : null;
      if (a === null) return;
      parts.push(`${t(label)} ${a}` + (b !== null && b !== a ? ` → <em>${b}</em>` : ''));
    };
    add('statDamage', (s) => (Number.isFinite(s.damage) ? num(s.damage) + (s.pellets > 1 ? '×' + s.pellets : '') : null));
    add(now.flame ? 'statFuel' : 'statMag', (s) => (Number.isFinite(s.mag) ? String(s.mag) : null)); // a flamer's magazine is its tank
    add('statReload', (s) => (Number.isFinite(s.reloadMs) ? tf('secs', { n: num(s.reloadMs / 1000) }) : null));
    return parts.join(' · ');
  }

  render() {
    const g = this.game, core = g.director.core, a = g.weapons.arsenal;
    const o = shopOffers(core, a);
    // keep the keyboard or gamepad focus on the same row after a purchase redraws the lists
    const focusKey = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const order = [...this.root.querySelectorAll('[data-key]')].map((n) => n.dataset.key);

    this.q('shop-sub').textContent = tf('shopSub', { n: o.stage ? o.stage.wave : core.wave });
    this.q('shop-money').textContent = fmtMoney(o.money);

    const s = o.stage;
    const earn = (key, v, cls = '') => `<div class="${cls}${v ? '' : ' zero'}"><span>${t(key)}</span><b>${v ? '+' : ''}${fmtMoney(v)}</b></div>`;
    this.q('shop-earn').innerHTML = s ? `
      <div class="shop-h">${t('shopEarned')}</div>
      <div class="earn-grid">
        ${earn('earnKills', s.kills)}${earn('earnReward', s.reward)}${earn('earnHeads', s.headshots)}${earn('earnFlawless', s.flawless)}
        ${earn('earnTotal', s.total, 'total')}
      </div>` : '';

    this.q('shop-weapons').innerHTML = o.weapons.map((w) => {
      if (!w.owned && !w.forSale) return '';
      const level = w.owned ? `<span class="si-lv">${tf('levelShort', { n: w.level, m: w.maxLevel })}</span>` : '';
      let action;
      if (!w.owned) action = `<button class="btn${w.canBuy ? '' : ' poor'}" data-act="buy" data-id="${w.id}" data-key="w:${w.id}"${w.canBuy ? '' : ' disabled'}>${tf('buyFor', { p: fmtMoney(w.price) })}</button>`;
      else if (w.next) action = `<button class="btn${w.canUpgrade ? '' : ' poor'}" data-act="up" data-id="${w.id}" data-key="w:${w.id}"${w.canUpgrade ? '' : ' disabled'}>${tf('upgradeFor', { p: fmtMoney(w.upgradeCost) })}</button>`;
      else action = `<div class="si-max">${t('maxed')}</div>`;
      return `
        <div class="shop-item${w.owned ? ' owned' : ''}">
          <div class="si-text"><div class="si-name">${weaponName(w.id)} ${level}</div>
          <div class="si-info">${this.statLine(w.now, w.owned ? w.next : null)}</div></div>
          ${action}
        </div>`;
    }).join('');

    const gr = o.grenade, ar = o.armor, rf = o.refill;
    const armorNow = ar.level > 0 ? `${Math.round(ar.points)} / ${ar.max} · ${tf('levelShort', { n: ar.level, m: ar.maxLevel })}` : t('armorNone');
    this.q('shop-gear').innerHTML = `
      <div class="shop-item">
        <div class="si-text"><div class="si-name">${t('armor')} <span class="si-lv">${armorNow}</span></div>
        <div class="si-info">${tf('armorInfo', { p: Math.round(ar.absorb * 100) })}</div></div>
        ${ar.nextPoints ? `<button class="btn${ar.canBuy ? '' : ' poor'}" data-act="armor" data-key="armor"${ar.canBuy ? '' : ' disabled'}>${tf('armorBuy', { n: ar.nextPoints, p: fmtMoney(ar.price) })}</button>` : `<div class="si-max">${t('maxed')}</div>`}
      </div>
      <div class="shop-item">
        <div class="si-text"><div class="si-name">${t('grenades')} <span class="si-lv">${gr.count} / ${gr.max}</span></div></div>
        ${gr.count < gr.max ? `<button class="btn${gr.canBuy ? '' : ' poor'}" data-act="grenade" data-key="grenade"${gr.canBuy ? '' : ' disabled'}>${tf('grenadeBuy', { p: fmtMoney(gr.price) })}</button>` : `<div class="si-max">${t('maxed')}</div>`}
      </div>
      <div class="shop-item">
        <button class="btn" data-act="refill" data-key="refill"${rf.canUse ? '' : ' disabled'}>${rf.used ? t('refillUsed') : t('refill')}</button>
      </div>`;

    this.q('shop-inv').innerHTML = this.carryHtml(false);
    this.q('btn-shop-go').textContent = tf('toBattle', { n: core.wave + 1 });

    if (focusKey) {
      const el = this.root.querySelector(`[data-key="${focusKey}"]`);
      let next = el && !el.disabled ? el : null;
      if (!next) {
        // that row has nothing more to buy: the next button that still does something, the battle button last
        const live = [...this.root.querySelectorAll('button[data-key]:not(:disabled)')];
        const at = order.indexOf(focusKey);
        next = live.find((n) => order.indexOf(n.dataset.key) > at) || live[live.length - 1] || this.q('btn-shop-go');
        this.guard.moved = next.dataset.key || next.id;
      }
      next.focus();
    }
  }

  // ------------------------------------------------------------- inventory
  /** What the player carries: money, armour, grenades, every owned weapon with level and ammo. */
  carryHtml(withMoney = true) {
    const g = this.game, core = g.director.core, p = core.player, a = g.weapons.arsenal;
    const row = (label, value) => `<div class="inv-row"><span>${label}</span><b>${value}</b></div>`;
    const armor = p.armorLevel > 0
      ? `${Math.round(p.armor)} / ${p.armorMax} · ${tf('levelShort', { n: p.armorLevel, m: ARMOR.points.length - 1 })}` : t('armorNone');
    const weapons = a.owned.map((id) => {
      const w = a.weapons[id], spec = specOf(a, id), slot = WEAPON_ORDER.indexOf(id) + 1;
      return `<div class="inv-w${id === a.current ? ' cur' : ''}"><span class="inv-slot">${slot}</span>`
        + `<span class="inv-name">${weaponName(id)}</span><span class="inv-lv">${tf('levelShort', { n: weaponLevel(a, id), m: UPGRADE.maxLevel })}</span>`
        + `<b class="inv-ammo">${w.mag}/${spec.mag} · ${w.reserve}</b></div>`;
    }).join('');
    return (withMoney ? row(t('money'), fmtMoney(core.money)) : '')
      + row(t('armor'), armor)
      + row(t('grenades'), `${a.grenades} / ${GRENADE.max}`)
      + weapons;
  }

  toggleInventory() { if (this.invOpen) this.closeInventory(); else this.openInventory(); }

  openInventory() {
    if (this.game.bigMap) this.game.bigMap.close();   // one overlay at a time: they would overlap on small screens
    this.invOpen = true;
    this.inv.classList.remove('hidden');
    this.hud.hud.classList.add('inv-open');   // on short windows it takes the radar's corner (styles.css)
    this.invT = 0;
    this.renderInventory();
  }

  closeInventory() {
    this.invOpen = false;
    this.inv.classList.add('hidden');
    this.hud.hud.classList.remove('inv-open');
  }

  renderInventory() {
    const key = esc((this.hud.prompts && this.hud.prompts.inventory) || '');   // the key or the pad button in use
    const html = `<div class="inv-head"><span>${t('inventory')}</span><small>${tf('invClose', { k: key })}</small></div>` + this.carryHtml(true);
    if (html !== this.invHtml) { this.invHtml = html; this.inv.innerHTML = html; }
  }

  // -------------------------------------------------------------------- HUD
  /** Per frame while the HUD runs (hud.updateEconomy): money, the armour bar and the inventory key. */
  updateHud(dt) {
    const g = this.game, core = g.director.core, p = core.player, hud = this.hud;
    if (!this.moneyShown) { this.q('h-money').classList.remove('hidden'); this.moneyShown = true; }
    hud.set('h-money', fmtMoney(core.money));

    const armorOn = p.armorMax > 0;
    this.q('h-armor').classList.toggle('hidden', !armorOn);
    if (armorOn) {
      const w = (Math.max(0, p.armor) / p.armorMax * 100).toFixed(1) + '%';
      if (w !== this.armorFill) { this.armorFill = w; this.q('h-afill').style.width = w; }
    }

    // the inventory: the same key opens and closes it; it never stays open off the battlefield
    const pressed = g.input.actionPressed('inventory');
    if (g.state !== 'playing' || !g.player.alive) { if (this.invOpen) this.closeInventory(); }
    else if (pressed) this.toggleInventory();
    if (this.invOpen && (this.invT -= dt) <= 0) { this.invT = 0.1; this.renderInventory(); }
  }
}

/** The shop between waves and the inventory. Returns {open, close, reset, updateHud, toggleInventory, closeInventory}. */
export function createShop(game) { return new Shop(game); }
