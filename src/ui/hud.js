// HUD and menu screens, built as DOM over the canvas.

import * as THREE from 'three';
import { t, setLang, getLang, QUALITY_ORDER } from '../config.js';

// Screens are full-window panels; one is shown at a time. Other modules add theirs with addScreen().
const SCREENS = ['loading', 'menu', 'pause', 'settings', 'controls', 'dead', 'victory'];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.cache = {};
    this.toastT = 0;
    this.bannerT = 0;
    this.hitT = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this._v = new THREE.Vector3();
    this.build();
    this.refreshLang();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.screens = [...SCREENS];

    // ------------------------------------------------------------------ hud
    this.hud = el('div', 'hud hidden');
    this.hud.innerHTML = `
      <div class="wavebox"><div class="wave-title" id="h-wave"></div><div class="wave-sub" id="h-left"></div><div class="wave-break" id="h-break"></div></div>
      <div class="scorebox"><div class="score-label" data-t="score"></div><div class="score-val" id="h-score">0</div><div class="money hidden" id="h-money"></div><div class="fps" id="h-fps"></div></div>
      <div class="scope hidden" id="h-scope"></div>
      <div class="killfeed" id="h-feed"></div>
      <canvas class="radar" id="h-radar" width="300" height="300"></canvas>
      <div class="crosshair" id="h-xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="enemybar" id="h-ebar"><div class="eb-name" id="h-ename"></div><div class="eb-track"><div class="eb-fill" id="h-efill"></div></div></div>
      <div class="hitmarker" id="h-hit"><i></i><i></i><i></i><i></i></div>
      <div class="dmg-layer" id="h-dmg"></div>
      <div class="banner" id="h-banner"><div class="banner-t" id="h-banner-t"></div><div class="banner-s" id="h-banner-s"></div></div>
      <div class="toast" id="h-toast"></div>
      <div class="status">
        <div class="health">
          <div class="stamina hidden" id="h-stam"><div class="stamina-fill" id="h-sfill"></div></div>
          <div class="armor hidden" id="h-armor"><div class="armor-fill" id="h-afill"></div></div>
          <div class="health-label" data-t="health"></div><div class="health-row"><div class="health-bar"><div class="health-fill" id="h-hfill"></div></div><div class="health-num" id="h-hnum">100</div></div></div>
        <div class="ammo"><div class="ammo-name" id="h-wname"></div><div class="ammo-row"><span class="ammo-mag" id="h-mag">30</span><span class="ammo-res" id="h-res">/ 150</span></div>
          <div class="reload" id="h-reload"><div class="reload-bar"><div class="reload-fill" id="h-rfill"></div></div><div class="reload-txt" data-t="reload"></div></div>
          <div class="ammo-warn" id="h-awarn"></div>
          <div class="grenades hidden" id="h-gren"></div></div>
      </div>`;
    r.appendChild(this.hud);

    // -------------------------------------------------------------- screens
    const mk = (id, html, cls = '') => {
      const s = el('div', 'screen hidden ' + cls, html);
      s.id = 'screen-' + id;
      r.appendChild(s);
      return s;
    };

    mk('loading', `
      <div class="panel loading">
        <div class="logo" data-t="title"></div>
        <div class="progress"><div class="progress-fill" id="load-fill"></div></div>
        <div class="load-label" id="load-label"></div>
      </div>`, 'solid');

    mk('menu', `
      <div class="panel menu">
        <div class="logo" data-t="title"></div>
        <div class="tagline" data-t="subtitle"></div>
        <button class="btn primary" id="btn-play" data-t="play"></button>
        <button class="btn" id="btn-settings" data-t="settings"></button>
        <button class="btn" id="btn-controls" data-t="controls"></button>
        <div class="mini-ctl">${['move', 'jump', 'sprint', 'fire', 'aim', 'reload', 'switch', 'pause'].map((k) => `<div><span data-t="ctl_${k}"></span><b data-t="k_${k}"></b></div>`).join('')}</div>
        <div class="hint" data-t="hintStart"></div>
      </div>`);

    mk('pause', `
      <div class="panel menu">
        <div class="logo small" data-t="paused"></div>
        <button class="btn primary" id="btn-resume" data-t="resume"></button>
        <button class="btn" id="btn-restart" data-t="restart"></button>
        <button class="btn" id="btn-psound"></button>
        <button class="btn" id="btn-pset" data-t="settings"></button>
        <button class="btn" id="btn-pctl" data-t="controls"></button>
        <button class="btn" id="btn-tomenu" data-t="toMenu"></button>
      </div>`);

    const qOpts = QUALITY_ORDER.map((q) => `<option value="${q}" data-t="q_${q}"></option>`).join('');
    mk('settings', `
      <div class="panel settings">
        <div class="logo small" data-t="settings"></div>
        <label class="row"><span data-t="sens"></span><input type="range" id="s-sens" min="0.2" max="3" step="0.05"><output id="o-sens"></output></label>
        <label class="row"><span data-t="fov"></span><input type="range" id="s-fov" min="60" max="105" step="1"><output id="o-fov"></output></label>
        <label class="row"><span data-t="volume"></span><input type="range" id="s-vol" min="0" max="1" step="0.05"><output id="o-vol"></output></label>
        <label class="row"><span data-t="quality"></span><select id="s-quality">${qOpts}</select></label>
        <label class="row"><span data-t="language"></span><select id="s-lang"><option value="ru">Русский</option><option value="en">English</option></select></label>
        <label class="row chk"><input type="checkbox" id="s-sound"><span data-t="soundOn"></span></label>
        <label class="row chk"><input type="checkbox" id="s-auto"><span data-t="autoQuality"></span></label>
        <label class="row chk"><input type="checkbox" id="s-inv"><span data-t="invertY"></span></label>
        <label class="row chk"><input type="checkbox" id="s-fps"><span data-t="showFps"></span></label>
        <label class="row chk" id="row-scans"><input type="checkbox" id="s-scans"><span data-t="scans"></span></label>
        <button class="btn" id="btn-sback" data-t="back"></button>
      </div>`);

    const ctl = ['move', 'look', 'jump', 'sprint', 'crouch', 'fire', 'aim', 'reload', 'switch', 'pause', 'fps']
      .map((k) => `<div class="ctl"><span class="ctl-name" data-t="ctl_${k}"></span><span class="ctl-key" data-t="k_${k}"></span></div>`).join('');
    mk('controls', `
      <div class="panel controls">
        <div class="logo small" data-t="controls"></div>
        <div class="ctl-grid">${ctl}</div>
        <button class="btn" id="btn-cback" data-t="back"></button>
      </div>`);

    mk('dead', `
      <div class="panel result bad">
        <div class="logo" data-t="dead"></div>
        <div class="tagline" data-t="deadSub"></div>
        <div class="stats" id="stats-dead"></div>
        <button class="btn primary" id="btn-drevive"></button>
        <button class="btn" id="btn-dretry" data-t="restart"></button>
        <button class="btn" id="btn-dmenu" data-t="toMenu"></button>
      </div>`);

    mk('victory', `
      <div class="panel result good">
        <div class="logo" data-t="victory"></div>
        <div class="tagline" data-t="victorySub"></div>
        <div class="stats" id="stats-win"></div>
        <button class="btn primary" id="btn-vcont" data-t="continueEndless"></button>
        <button class="btn" id="btn-vretry" data-t="restart"></button>
        <button class="btn" id="btn-vmenu" data-t="toMenu"></button>
      </div>`);

    this.q = (id) => document.getElementById(id);
    this.radar = this.q('h-radar');
    this.radarCtx = this.radar.getContext('2d');
    this.wire();
  }

  wire() {
    const g = this.game, q = this.q;
    q('btn-play').onclick = () => g.startGame();
    q('btn-settings').onclick = () => this.openSettings('menu');
    q('btn-controls').onclick = () => this.openControls('menu');
    q('btn-resume').onclick = () => g.resume();
    q('btn-restart').onclick = () => g.restart();
    q('btn-pset').onclick = () => this.openSettings('pause');
    q('btn-pctl').onclick = () => this.openControls('pause');
    q('btn-tomenu').onclick = () => g.toMenu();
    q('btn-sback').onclick = () => this.showScreen(this.backTo || 'menu');
    q('btn-cback').onclick = () => this.showScreen(this.backTo || 'menu');
    q('btn-dretry').onclick = () => g.restart();
    q('btn-drevive').onclick = () => g.revive();
    q('btn-dmenu').onclick = () => g.toMenu();
    q('btn-vretry').onclick = () => g.restart();
    q('btn-vcont').onclick = () => g.continueEndless();
    q('btn-psound').onclick = () => { g.setSound(!g.settings.sound); this.syncSettings(); };
    q('btn-vmenu').onclick = () => g.toMenu();

    const s = g.settings;
    const bind = (id, outId, key, fmt, apply) => {
      const input = q(id);
      input.addEventListener('input', () => {
        s[key] = parseFloat(input.value);
        if (outId) q(outId).textContent = fmt(s[key]);
        apply && apply(s[key]);
        g.saveSettings();
      });
    };
    bind('s-sens', 'o-sens', 'sens', (v) => v.toFixed(2));
    bind('s-fov', 'o-fov', 'fov', (v) => Math.round(v) + '°');
    bind('s-vol', 'o-vol', 'volume', (v) => Math.round(v * 100) + '%', (v) => g.audio.setVolume(v));
    q('s-quality').addEventListener('change', (e) => { s.quality = e.target.value; g.applyQuality(s.quality, true); g.saveSettings(); });
    q('s-lang').addEventListener('change', (e) => { s.lang = e.target.value; setLang(s.lang); this.refreshLang(); g.saveSettings(); });
    q('s-sound').addEventListener('change', (e) => g.setSound(e.target.checked));
    q('s-auto').addEventListener('change', (e) => { s.autoQuality = e.target.checked; g.saveSettings(); });
    q('s-inv').addEventListener('change', (e) => { s.invertY = e.target.checked; g.saveSettings(); });
    q('s-fps').addEventListener('change', (e) => { s.showFps = e.target.checked; g.saveSettings(); });
    q('s-scans').addEventListener('change', (e) => { s.scans = e.target.checked; g.saveSettings(); });
    this.syncSettings();
  }

  syncSettings() {
    const s = this.game.settings, q = this.q;
    q('s-sens').value = s.sens; q('o-sens').textContent = s.sens.toFixed(2);
    q('s-fov').value = s.fov; q('o-fov').textContent = Math.round(s.fov) + '°';
    q('s-vol').value = s.volume; q('o-vol').textContent = Math.round(s.volume * 100) + '%';
    q('s-quality').value = s.quality;
    q('s-lang').value = s.lang;
    q('s-auto').checked = s.autoQuality;
    q('s-sound').checked = s.sound !== false;
    q('btn-psound').textContent = t('soundOn') + (s.sound !== false ? '  ✓' : '  ✗');
    q('s-inv').checked = s.invertY;
    q('s-fps').checked = s.showFps;
    q('s-scans').checked = s.scans !== false;
    q('row-scans').style.display = this.game.scansFound ? '' : 'none';   // a build without scans has nothing to switch
  }

  refreshLang() {
    this.root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    document.documentElement.lang = getLang();
    document.title = t('title');
    this.cache = {};
    this.syncSettings();
  }

  openSettings(from) { this.backTo = from; this.syncSettings(); this.showScreen('settings'); }
  openControls(from) { this.backTo = from; this.showScreen('controls'); }

  /**
   * Add a screen built elsewhere (shop, inventory, key bindings, big map). `html` is the inside of
   * the screen, usually one .panel. Returns the screen element (id 'screen-' + name).
   */
  addScreen(name, html, cls = '') {
    const s = el('div', 'screen hidden ' + cls, html);
    s.id = 'screen-' + name;
    this.root.appendChild(s);
    if (!this.screens.includes(name)) this.screens.push(name);
    s.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    return s;
  }

  showScreen(name) {
    for (const s of this.screens) {
      const n = document.getElementById('screen-' + s);
      if (n) n.classList.toggle('hidden', s !== name);
    }
    this.screen = name;
    // the game interface stays out of the way of menus, pause and result screens
    this.hud.classList.toggle('behind', !!name);
  }

  hideScreens() { this.showScreen(null); }

  // names of the hud contract
  hideScreen() { this.hideScreens(); }
  currentScreen() { return this.screen || null; }
  setFps(n) { this.set('h-fps', n ? Math.round(n) + ' ' + t('fpsLabel') : ''); }

  showHud(on) { this.hud.classList.toggle('hidden', !on); }

  setLoading(p, label) {
    this.q('load-fill').style.width = Math.round(p * 100) + '%';
    this.q('load-label').textContent = label;
  }

  // ---------------------------------------------------------------- events
  hitmarker(kill, head, prop = false) {
    const h = this.q('h-hit');
    h.classList.remove('on', 'kill', 'head', 'prop');
    void h.offsetWidth;
    h.classList.add('on');
    if (kill) h.classList.add('kill');
    else if (head) h.classList.add('head');
    if (prop) h.classList.add('prop');
  }

  damageFrom(rel, amount) {
    const layer = this.q('h-dmg');
    const d = el('div', 'dmg');
    d.style.transform = 'rotate(' + (-rel * 180 / Math.PI).toFixed(1) + 'deg)';
    d.style.opacity = String(Math.min(1, 0.45 + amount / 30));
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  toast(text) {
    const n = this.q('h-toast');
    n.textContent = text;
    n.classList.remove('on');
    void n.offsetWidth;
    n.classList.add('on');
  }

  banner(title, sub = '', secs = 2.5) {
    const b = this.q('h-banner');
    this.q('h-banner-t').textContent = title;
    this.q('h-banner-s').textContent = sub;
    b.classList.remove('on');
    void b.offsetWidth;
    b.style.setProperty('--dur', secs + 's');
    b.classList.add('on');
  }

  setBreak(s) {
    const n = this.q('h-break');
    const text = s > 0 ? t('nextWave') + ' ' + s : '';
    if (n.textContent !== text) n.textContent = text;
  }

  killfeed(name, head, source, pts, streak) {
    const feed = this.q('h-feed');
    const line = el('div', 'feed-line' + (head ? ' head' : ''));
    const how = source === 'barrel' ? ' · ' + t('barrel') : head ? ' · ' + t('headshot') : '';
    line.innerHTML = `<span class="feed-name">${name}${how}</span><span class="feed-pts">+${pts}</span>` + (streak >= 3 ? `<span class="feed-streak">${t('streak')} ×${streak}</span>` : '');
    feed.appendChild(line);
    while (feed.children.length > 5) feed.firstChild.remove();
    setTimeout(() => line.remove(), 4200);
  }

  showResult(kind, stats) {
    const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const mm = Math.floor(stats.time / 60), ss = Math.floor(stats.time % 60);
    const html = `
      <div><span>${t('score')}</span><b>${stats.score}</b></div>
      <div><span>${t('kills')}</span><b>${stats.kills}</b></div>
      <div><span>${t('headshots')}</span><b>${stats.headshots}</b></div>
      <div><span>${t('accuracy')}</span><b>${acc}%</b></div>
      <div><span>${t('time')}</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div>
      <div><span>${t('wave')}</span><b>${stats.wave}/${stats.maxWaves}</b></div>
      <div><span>${t('deaths')}</span><b>${stats.deaths || 0}</b></div>
      <div><span>${t('money')}</span><b>${this.game.shop ? this.game.shop.fmtMoney(stats.money || 0) : stats.money || 0}</b></div>`;
    this.q(kind === 'dead' ? 'stats-dead' : 'stats-win').innerHTML = html;
    if (kind === 'dead') {
      const rv = this.q('btn-drevive');
      rv.textContent = t('reviveAt', { n: stats.reviveWave });
      rv.classList.toggle('hidden', !stats.reviveWave);
    }
    this.showScreen(kind);
  }

  // ---------------------------------------------------------------- update
  set(id, text) {
    if (this.cache[id] !== text) { this.cache[id] = text; this.q(id).textContent = text; }
  }

  update(dt, realDt) {
    const g = this.game;
    if (g.settings.showFps) {
      this.fpsFrames++; this.fpsTime += realDt;
      if (this.fpsTime > 0.5) {
        this.set('h-fps', Math.round(this.fpsFrames / this.fpsTime) + ' ' + t('fpsLabel'));
        this.fpsFrames = 0; this.fpsTime = 0;
      }
    } else this.set('h-fps', '');

    const p = g.player;
    const hp = Math.ceil(p.health);
    this.set('h-hnum', String(hp));
    const frac = p.health / p.maxHealth;
    const fill = this.q('h-hfill');
    fill.style.width = (frac * 100).toFixed(1) + '%';
    fill.classList.toggle('low', frac < 0.3);
    this.hud.classList.toggle('lowhp', frac < 0.3 && p.alive);

    const w = g.weapons.hudInfo();
    this.set('h-wname', t(w.name));
    this.set('h-mag', String(w.mag));
    this.set('h-res', '/ ' + w.reserve);
    this.q('h-mag').classList.toggle('empty', w.mag === 0);
    this.q('h-mag').classList.toggle('low', w.mag > 0 && w.mag <= w.magSize * 0.3);
    const rl = this.q('h-reload');
    rl.classList.toggle('on', w.reloading);
    if (w.reloading) this.q('h-rfill').style.width = (w.progress * 100).toFixed(0) + '%';
    const warn = w.reloading ? '' : w.mag === 0 ? (w.reserve === 0 ? t('noAmmo') : t('reload') + ' [R]') : w.mag <= w.magSize * 0.3 ? t('lowAmmo') : '';
    this.set('h-awarn', warn);

    // crosshair gap follows spread; hidden while aiming
    const cam = g.gr.camera;
    const pxPerRad = (window.innerHeight / 2) / Math.tan((cam.fov * Math.PI) / 360);
    const gap = Math.max(5, Math.tan(w.spread) * pxPerRad);
    const xh = this.q('h-xh');
    xh.style.setProperty('--gap', gap.toFixed(1) + 'px');
    xh.style.opacity = String(1 - Math.min(1, w.ads * 1.4));
    const aim = g.weapons.aim;
    xh.classList.toggle('onenemy', !!aim.enemy);
    const bar = this.q('h-ebar');
    const showBar = aim.t > 0 && aim.last && aim.last.alive;
    bar.classList.toggle('on', !!showBar);
    if (showBar) {
      // hover above the head of the enemy that was hit or aimed at
      const e = aim.last.pos, head = this._v.set(e.x, (e.y || 0) + (e.height || 1.8) * (1 - 0.35 * (aim.last.crouchK || 0)) + 0.28, e.z).project(cam);
      if (head.z < 1) {
        const sx = Math.min(window.innerWidth - 90, Math.max(90, (head.x * 0.5 + 0.5) * window.innerWidth));
        const sy = Math.min(window.innerHeight - 40, Math.max(40, (-head.y * 0.5 + 0.5) * window.innerHeight));
        bar.style.left = sx.toFixed(0) + 'px'; bar.style.top = sy.toFixed(0) + 'px';
      }
      this.set('h-ename', t(aim.last.T.key));
      this.q('h-efill').style.width = Math.max(0, aim.last.hp / aim.last.P.hp * 100).toFixed(0) + '%';
    }

    this.set('h-wave', t('wave') + ' ' + Math.max(1, g.director.wave) + (g.director.endless ? '  ∞' : ' / ' + g.director.maxWaves));
    this.set('h-left', t('enemiesLeft') + ': ' + g.director.remaining());
    this.set('h-score', String(g.director.stats.score));

    this.updateStamina(dt);
    this.updateEconomy(dt);
    this.updateWeaponExtras(dt, w);
    this.drawRadar();
  }

  // ---- wave 11: the sprint bar above the health bar (#h-stam, #h-sfill)
  updateStamina(dt) {}

  // ---- wave 12: money (#h-money) and armour (#h-armor, #h-afill)
  updateEconomy(dt) { if (this.game.shop) this.game.shop.updateHud(dt); }

  // ---- wave 13: grenades (#h-gren) and the sniper scope (#h-scope). w is weapons.hudInfo()
  updateWeaponExtras(dt, w) {}

  drawRadar() {
    const g = this.game, ctx = this.radarCtx, S = 300, C = S / 2, R = C - 6;
    const p = g.player;
    const range = 42, k = R / range;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(8,10,12,0.55)'; ctx.fillRect(0, 0, S, S);
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const toScreen = (wx, wz) => {
      const dx = wx - p.pos.x, dz = wz - p.pos.z;
      // right = (cos, -sin), forward = (-sin, -cos)
      const sx = dx * cy - dz * sy;
      const sf = -dx * sy - dz * cy;
      return [C + sx * k, C - sf * k];
    };
    // building outlines
    ctx.strokeStyle = 'rgba(190,200,210,0.35)'; ctx.fillStyle = 'rgba(120,130,140,0.18)'; ctx.lineWidth = 2;
    for (const f of g.world.footprints) {
      const pts = [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]].map(([x, z]) => toScreen(x, z));
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // enemies that fired recently show up as red dots, as in the genre
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const since = g.time - e.lastFired;
      if (since > 2.2) continue;
      const [x, y] = toScreen(e.pos.x, e.pos.z);
      ctx.fillStyle = `rgba(255,60,50,${Math.max(0.2, 1 - since / 2.2)})`;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // rim and player marker
    ctx.strokeStyle = 'rgba(232,137,43,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(C, C - 11); ctx.lineTo(C + 8, C + 9); ctx.lineTo(C, C + 4); ctx.lineTo(C - 8, C + 9); ctx.closePath(); ctx.fill();
  }
}

/** The on-screen interface. Returns {update, showScreen, hideScreen, damageFrom, setFps, currentScreen}. */
export function createHud(game) { return new HUD(game); }
