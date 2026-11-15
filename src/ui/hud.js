// HUD and menu screens, built as DOM over the canvas.

import * as THREE from 'three';
import { t, setLang, getLang, QUALITY_ORDER, MAP_HALF } from '../config.js';
import { WEAPON_ORDER } from '../core/rules.js';
import { riderMarkerAlpha } from '../core/riderlogic.js';
import { keyName, bindingText, padHint } from './keys.js';

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
      <canvas class="radar" id="h-radar" width="600" height="600"></canvas>
      <div class="crosshair" id="h-xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="enemybar" id="h-ebar"><div class="eb-name" id="h-ename"></div><div class="eb-track"><div class="eb-fill" id="h-efill"></div></div></div>
      <div class="hitmarker" id="h-hit"><i></i><i></i><i></i><i></i></div>
      <div class="dmg-layer" id="h-dmg"></div>
      <div class="bossbar hidden" id="h-boss"><div class="bb-name" id="h-bname"></div><div class="bb-track"><div class="bb-fill" id="h-bfill"></div></div><div class="bb-veh" id="h-bveh"><div class="bb-vfill" id="h-bvfill"></div></div></div>
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
        <div class="mini-ctl">${['move', 'jump', 'sprint', 'fire', 'aim', 'reload', 'switch', 'grenade', 'inventory', 'pause'].map((k) => `<div><span data-t="ctl_${k}"></span><b data-k="${k}" data-kp="1"></b></div>`).join('')}</div>
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
        <label class="row"><span data-t="radarEnemies"></span><select id="s-renemy"><option value="fired" data-t="re_fired"></option><option value="all" data-t="re_all"></option></select></label>
        <label class="row"><span data-t="padSens"></span><input type="range" id="s-psens" min="0.3" max="3" step="0.05"><output id="o-psens"></output></label>
        <label class="row chk"><input type="checkbox" id="s-pinv"><span data-t="padInvertY"></span></label>
        <label class="row"><span data-t="padLayout"></span><select id="s-playout"><option value="auto" data-t="pl_auto"></option><option value="xbox">Xbox</option><option value="playstation">PlayStation</option><option value="nintendo">Nintendo</option></select></label>
        <button class="btn" id="btn-keys" data-t="keysBtn"></button>
        <button class="btn" id="btn-sback" data-t="back"></button>
      </div>`);

    const ctl = ['move', 'look', 'jump', 'sprint', 'crouch', 'fire', 'aim', 'reload', 'switch', 'grenade', 'inventory', 'map', 'pause', 'fps']
      .map((k) => `<div class="ctl"><span class="ctl-name" data-t="ctl_${k}"></span><span class="ctl-key" data-k="${k}"></span><span class="ctl-pad" data-pk="${k}"></span></div>`).join('');
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
    // wave 11: map markers, gamepad, key bindings
    q('s-renemy').addEventListener('change', (e) => { s.radarEnemies = e.target.value; g.saveSettings(); });
    bind('s-psens', 'o-psens', 'padSens', (v) => v.toFixed(2));
    q('s-pinv').addEventListener('change', (e) => { s.padInvertY = e.target.checked; g.saveSettings(); });
    q('s-playout').addEventListener('change', (e) => { s.padLayout = e.target.value; g.saveSettings(); this.refreshBindings(); });
    q('btn-keys').onclick = () => { if (g.keys) g.keys.open(); };
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
    q('s-renemy').value = s.radarEnemies === 'all' ? 'all' : 'fired';
    q('s-psens').value = s.padSens; q('o-psens').textContent = (+s.padSens || 1).toFixed(2);
    q('s-pinv').checked = !!s.padInvertY;
    q('s-playout').value = s.padLayout || 'auto';
  }

  refreshLang() {
    this.root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    document.documentElement.lang = getLang();
    document.title = t('title');
    this.cache = {};
    this.syncSettings();
    this.refreshBindings();
  }

  /**
   * Texts that name keys and gamepad buttons: the controls screen, the main menu's short list,
   * the key screen and the reload prompt. Call after the bindings, the language, the prompt
   * layout or the device in use changed.
   */
  refreshBindings() {
    const g = this.game, b = (g.input && g.input.bindings) || g.settings.bindings || {};
    const first = (a) => keyName((b[a] || [])[0]);
    // slots of the weapons that exist, '1–3' when they are the plain digit keys in a row
    const slots = WEAPON_ORDER.map((_, i) => (b['slot' + (i + 1)] || [])[0]).filter(Boolean);
    const digits = slots.every((c, i) => c === 'Digit' + (i + 1));
    const slotText = digits && slots.length > 2 ? '1–' + slots.length : slots.map(keyName).join(', ');
    const text = {
      move: ['forward', 'left', 'back', 'right'].map(first).join(' '),
      look: t('k_look'),
      jump: bindingText(b, 'jump'), sprint: bindingText(b, 'sprint'), crouch: bindingText(b, 'crouch'),
      fire: bindingText(b, 'fire'), aim: bindingText(b, 'aim'), reload: bindingText(b, 'reload'),
      switch: [slotText, t('k_wheel'), ...(b.lastWeapon || []).map(keyName)].filter(Boolean).join(', '),
      grenade: bindingText(b, 'grenade'), inventory: bindingText(b, 'inventory'),
      map: bindingText(b, 'map'), pause: 'Esc', fps: 'F3',
    };
    const pad = g.pad && g.pad.showHints() ? g.pad.layout() : null;
    const padText = (k) => (!pad ? '' : padHint(k === 'move' ? 'forward' : k, pad));
    this.root.querySelectorAll('[data-k]').forEach((n) => {
      const k = n.dataset.k, p = n.dataset.kp ? padText(k) : '';
      n.textContent = (text[k] ?? '') + (p ? ' · ' + p : '');
    });
    this.root.querySelectorAll('[data-pk]').forEach((n) => {
      n.textContent = padText(n.dataset.pk);
      n.classList.toggle('hidden', !pad);
    });
    // prompts on the HUD (an empty magazine, the grenade counter, the inventory) name what does it
    // with the device in use
    const prompt = (a) => (g.lastDevice === 'pad' && pad ? padHint(a, pad) : first(a));
    this.reloadKey = prompt('reload');
    this.prompts = { grenade: prompt('grenade'), inventory: prompt('inventory') };
    delete this.cache['h-awarn'];
    delete this.cache.gren;
    if (g.keys) g.keys.refresh();
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
    // leaving the key screen in any way (back, resume, pause, menu, a new game) ends a key wait
    if (name !== 'keys' && this.game.keys) this.game.keys.cancel();
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
  setFps(n) { this.set('h-fps', n ? this.fpsLine(n) : ''); }

  /** The F3 line: frames per second and the graphics card they come from (G01). */
  fpsLine(n) {
    const gpu = this.game.gr && this.game.gr.gpu;
    return Math.round(n) + ' ' + t('fpsLabel') + ' · ' + ((gpu && gpu.name) || t('gpuUnknown'));
  }

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

  /**
   * A line of the kill feed. source tells how: a plain shot ('player'), 'barrel', 'grenade', 'fire', and
   * from wave 14 'dismount' (a rider shot off his vehicle: the vehicle's points, no kill) and 'vehicle'
   * (a motorbike ran the player down: pts null, nothing earned).
   */
  killfeed(name, head, source, pts, streak) {
    const cause = { barrel: 'barrel', grenade: 'grenade', fire: 'killFire', dismount: 'feedDismount', vehicle: 'feedRam' }[source];
    const how = cause ? ' · ' + t(cause) : head ? ' · ' + t('headshot') : '';
    const cls = 'feed-line' + (head ? ' head' : '') + (source === 'dismount' ? ' dismount' : source === 'vehicle' ? ' ram' : '');
    this._feed(cls, `<span class="feed-name">${name}${how}</span>` + (pts != null ? `<span class="feed-pts">+${pts}</span>` : '') +
      (streak >= 3 ? `<span class="feed-streak">${t('streak')} ×${streak}</span>` : ''));
  }

  /** The line of its own a boss gets in the kill feed when he falls. */
  bossDown(name) {
    this._feed('feed-line boss', `<span class="feed-name">${t('boss')} · ${name} · ${t('bossDown')}</span>`);
  }

  _feed(cls, html) {
    const feed = this.q('h-feed');
    const line = el('div', cls, html);
    feed.appendChild(line);
    while (feed.children.length > 5) feed.firstChild.remove();
    setTimeout(() => line.remove(), 4200);
  }

  /**
   * The boss's health bar on top of the screen (#h-boss): his name, his health, and while he rides, a thin
   * bar for his vehicle. null hides it.
   */
  bossBar(enemy) {
    this.boss = enemy || null;
    const box = this.q('h-boss');
    box.classList.toggle('hidden', !this.boss);
    if (this.boss) { delete this.cache['h-bname']; this.bossW = this.bossVW = null; }
  }

  updateBoss() {
    const e = this.boss;
    if (!e) return;
    if (!e.alive) { this.bossBar(null); return; }
    this.set('h-bname', t('boss') + ' · ' + t(e.T.key));
    const w = Math.max(0, (e.hp / e.P.hp) * 100).toFixed(1) + '%';
    if (this.bossW !== w) { this.bossW = w; this.q('h-bfill').style.width = w; }
    const v = e.pos.mounted && e.pos.vehicle ? e.pos.vehicle : null;
    const vw = v ? Math.max(0, (v.hp / v.view.P.hp) * 100).toFixed(1) + '%' : '';
    if (this.bossVW !== vw) {
      this.bossVW = vw;
      this.q('h-bveh').classList.toggle('hidden', !v);
      if (v) this.q('h-bvfill').style.width = vw;
    }
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
        this.set('h-fps', this.fpsLine(this.fpsFrames / this.fpsTime));
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
    const warn = w.reloading ? '' : w.mag === 0 ? (w.reserve === 0 ? t('noAmmo') : t('reload') + ' [' + (this.reloadKey || 'R') + ']') : w.mag <= w.magSize * 0.3 ? t('lowAmmo') : '';
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
    this.updateBoss();
    this.drawRadar();
    this.drawBigMapRiders();
  }

  // ---- wave 11: the sprint bar above the health bar (#h-stam, #h-sfill)
  // Always shown: dim when full, bright while it drains, red while locked after running dry.
  updateStamina(dt) {
    const st = this.game.player.stamina;
    if (!st) return;
    const box = this.stamBox || (this.stamBox = this.q('h-stam'));
    const fill = this.stamFill || (this.stamFill = this.q('h-sfill'));
    box.classList.remove('hidden');
    const w = (st.value * 100).toFixed(1) + '%';
    if (this.stamW !== w) { this.stamW = w; fill.style.width = w; }
    const state = st.locked ? 'locked' : st.draining ? 'draining' : st.value >= 1 ? 'full' : 'refill';
    if (this.stamState !== state) {
      this.stamState = state;
      box.classList.toggle('locked', state === 'locked');
      box.classList.toggle('draining', state === 'draining');
      box.classList.toggle('full', state === 'full');
    }
  }

  // ---- wave 12: money (#h-money) and armour (#h-armor, #h-afill)
  updateEconomy(dt) { if (this.game.shop) this.game.shop.updateHud(dt); }

  // ---- wave 13: grenades (#h-gren) and the sniper scope (#h-scope). w is weapons.hudInfo()
  updateWeaponExtras(dt, w) {
    const q = this.q;
    if (!this._extras) {
      // built once: the scope is a dark mask with a round window, a reticle and a lens shadow
      q('h-scope').innerHTML = '<div class="scope-lens"></div><div class="scope-cross"><i class="h"></i><i class="v"></i><i class="ph l"></i><i class="ph r"></i><i class="ph b"></i><i class="dot"></i></div>';
      q('h-gren').classList.remove('hidden');
      this._extras = true;
    }
    // grenades: an icon, how many, and the key (or the pad button) that throws one
    const key = (this.prompts && this.prompts.grenade) || '';
    const gren = w.grenades + '|' + key;
    if (this.cache.gren !== gren) {
      this.cache.gren = gren;
      const k = q('h-gren');
      k.innerHTML = `<span class="gren-key"></span><i class="gren-ico"></i><b>×${w.grenades}</b>`;
      k.firstChild.textContent = key;
      k.classList.toggle('none', w.grenades === 0);
      k.title = t('grenades');
    }
    // the scope covers the view once the rifle is up at the eye (the model is hidden from then on);
    // the big map and the inventory lower it (Shooting.overlayOpen), so it never shows under them
    const on = !!w.scope && w.ads > 0.8 && !this.game.weapons.overlayOpen();
    q('h-scope').classList.toggle('hidden', !on);
    if (on) q('h-scope').style.opacity = String(Math.min(1, (w.ads - 0.8) / 0.12));
    // the flamer counts fuel, not rounds: the counter turns the colour of flame
    q('h-mag').classList.toggle('fuel', !!w.fuel);
  }

  // Drawn in a 300 x 300 layout (the size on screen in CSS pixels) on a canvas of twice that, so it stays sharp.
  drawRadar() {
    const g = this.game, ctx = this.radarCtx, S = 300, C = S / 2, R = C - 4;
    const p = g.player;
    const range = 42, k = R / range;
    const px = this.radar.width / S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.radar.width, this.radar.height);
    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(8,10,12,0.55)'; ctx.fillRect(0, 0, S, S);
    // a ring at half the range and the view cone
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(C, C, R / 2, 0, Math.PI * 2); ctx.stroke();
    const cone = ctx.createRadialGradient(C, C, 0, C, C, R);
    cone.addColorStop(0, 'rgba(255,255,255,0.16)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const toScreen = (wx, wz) => {
      const dx = wx - p.pos.x, dz = wz - p.pos.z;
      // right = (cos, -sin), forward = (-sin, -cos)
      const sx = dx * cy - dz * sy;
      const sf = -dx * sy - dz * cy;
      return [C + sx * k, C - sf * k];
    };
    // building outlines
    ctx.strokeStyle = 'rgba(190,200,210,0.4)'; ctx.fillStyle = 'rgba(120,130,140,0.2)'; ctx.lineWidth = 1.5;
    for (const f of g.world.footprints) {
      const pts = [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]].map(([x, z]) => toScreen(x, z));
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // enemies as red dots: by default only those that fired recently, as in the genre (settings.radarEnemies);
    // riders on their vehicles always, as a diamond (riderMarkerAlpha), and a boss with a gold ring
    const mode = g.settings.radarEnemies;
    let shown = 0, riders = 0;
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const a = riderMarkerAlpha(mode, g.time - e.lastFired, !!e.pos.mounted);
      if (a <= 0) continue;
      const [x, y] = toScreen(e.pos.x, e.pos.z);
      if (enemyMark(ctx, e, x, y, a, 1)) riders++;
      shown++;
    }
    this.radarShown = shown; // enemies drawn last frame (tests read it)
    this.radarRiders = riders;
    ctx.restore();
    // rim and player marker
    ctx.strokeStyle = 'rgba(232,137,43,0.8)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(C, C - 9); ctx.lineTo(C + 6.5, C + 7); ctx.lineTo(C, C + 3.5); ctx.lineTo(C - 6.5, C + 7); ctx.closePath(); ctx.fill();
  }

  /**
   * Riders and bosses on the big map (ui/bigmap.js draws the plain red dots of the radar rule): the map has
   * just been drawn this frame, these marks go on top in the same layout (the edge m = 14 px of BigMap.draw).
   * A rider on his vehicle shows even when he has not fired. bigMapRiders counts them (tests read it).
   */
  drawBigMapRiders() {
    const g = this.game, map = g.bigMap;
    this.bigMapRiders = 0;
    if (!map || !map.isOpen) return;
    const cv = map.canvas, ctx = map.ctx, L = cv.clientWidth;
    if (!(L > 0)) return;
    const m = 14, k = (L - 2 * m) / (2 * MAP_HALF);
    const mode = g.settings.radarEnemies;
    for (const e of g.enemies.list) {
      if (!e.alive || !(e.pos.mounted || e.T.boss)) continue;
      const a = riderMarkerAlpha(mode, g.time - e.lastFired, !!e.pos.mounted);
      if (a <= 0) continue;
      enemyMark(ctx, e, m + (e.pos.x + MAP_HALF) * k, m + (e.pos.z + MAP_HALF) * k, a, 1.1);
      this.bigMapRiders++;
    }
  }
}

/**
 * One enemy marker at x, y of a map canvas: a red dot for a soldier on foot, a red diamond with a light
 * rim for a rider on his vehicle, a gold ring round a boss. Returns true for a rider on a vehicle.
 */
function enemyMark(ctx, e, x, y, a, size) {
  const rider = !!e.pos.mounted, al = a.toFixed(3);
  ctx.fillStyle = `rgba(255,60,50,${al})`;
  ctx.beginPath();
  if (rider) {
    const r = 7 * size;
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,225,200,${al})`; ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.arc(x, y, 5 * size, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.T.boss) {
    ctx.strokeStyle = `rgba(255,196,64,${al})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 11 * size, 0, Math.PI * 2); ctx.stroke();
  }
  return rider;
}

/** The on-screen interface. Returns {update, showScreen, hideScreen, damageFrom, setFps, currentScreen}. */
export function createHud(game) { return new HUD(game); }
