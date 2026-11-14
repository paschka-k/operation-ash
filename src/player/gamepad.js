// Gamepad in the browser. main.js frame() calls poll(dt) once per frame, before anything reads input.
//
// In play the pad works through the same input layer as the keyboard and the mouse: buttons hold
// actions with input.setVirtual(), the left stick moves through input.setPadMove() (analog, the
// speed follows the deflection), the right stick turns the view through input.addLook() (the mouse
// path), Y cycles owned weapons through input.addWheel(). The table is PAD_PLAY in core/gamepad.js.
//
// While any screen is visible (menu, pause, settings, keys, controls, results, and every screen
// added later with hud.addScreen) the pad drives that screen instead: the D-pad or the left stick
// moves a visible focus between its buttons, lists, sliders and check boxes, A clicks (or steps a
// list), left and right adjust a slider or a list, B acts as Esc, Start resumes a paused game.
//
// Gamepad input is not a user activation, so the browser refuses pointer lock to it. game.lastDevice
// says which device acted last ('pad' or 'kbm'); main.js starts and resumes without pointer lock
// when it is 'pad'.

import { ACTIONS } from '../config.js';
import { GAMEPAD } from '../core/rules.js';
import {
  BTN, PAD_PLAY, readPad, padEdges, stepSprintLatch, navDirection, stepNavRepeat, resolveLayout,
} from '../core/gamepad.js';
import { LOOK_RAD_PER_COUNT } from './controller.js';

const FOCUSABLE = 'button, select, input, [data-pad-focus]';
const HELD_ACTIONS = Object.entries(PAD_PLAY).filter(([, a]) => ACTIONS.includes(a) && a !== 'sprint').map(([i, a]) => [+i, a]);

export class GamepadInput {
  constructor(game) {
    this.game = game;
    this.connected = false;
    this.id = '';
    this.held = [];            // buttons held at the last poll
    this.mute = new Set();     // buttons that must be let go before they count (after a mode change)
    this.actions = new Set();  // input actions this pad holds right now
    this.latch = false;        // the L3 sprint
    this.mode = 'none';        // 'play' | 'menu' | 'none'
    this.rep = { dir: null, t: 0 };
    this.focus = null;
    this.screenEl = null;
    this.lastFocus = new WeakMap(); // screen element -> the element focused there last
    this.synthetic = false;
    if (!game.lastDevice) game.lastDevice = 'kbm';
    // the keyboard and the mouse take over as soon as they are used
    const kbm = () => { if (!this.synthetic) this.setDevice('kbm'); };
    window.addEventListener('keydown', kbm, true);
    window.addEventListener('mousedown', kbm, true);
  }

  /** The prompt layout: the setting, or what the connected pad's name says. */
  layout() { return resolveLayout(this.game.settings.padLayout, this.id); }

  /** Show gamepad buttons in the controls and key screens? */
  showHints() { return this.connected || (this.game.settings.padLayout && this.game.settings.padLayout !== 'auto'); }

  setDevice(d) {
    const g = this.game;
    if (g.lastDevice === d) return;
    g.lastDevice = d;
    document.body.classList.toggle('pad-active', d === 'pad');
    if (d !== 'pad') this.setFocus(null);
    if (g.hud && g.hud.refreshBindings) g.hud.refreshBindings();
  }

  /** The pad to read: the first connected one in the standard mapping, else the first connected. */
  read() {
    let list = null;
    try { list = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { return null; }
    if (!list) return null;
    let any = null;
    for (const p of list) {
      if (!p || p.connected === false) continue;
      if (p.mapping === 'standard') return p;
      if (!any) any = p;
    }
    return any;
  }

  poll(dt) {
    const g = this.game;
    const raw = this.read();
    if (!raw) { if (this.connected) this.disconnect(); return; }
    if (!this.connected || raw.id !== this.id) this.connect(raw);

    const r = readPad(raw, this.held);
    const edges = padEdges(this.held, r.held);
    this.held = r.held;
    if (edges.length || r.move.x || r.move.y || r.look.x || r.look.y) this.setDevice('pad');

    const screen = this.visibleScreen();
    const mode = screen ? 'menu' : g.state === 'playing' ? 'play' : 'none';
    if (mode !== this.mode) this.enterMode(mode, r);
    for (const i of [...this.mute]) if (!r.held[i]) this.mute.delete(i);
    const fresh = edges.filter((i) => !this.mute.has(i));
    if (mode === 'play') this.play(dt, r, fresh);
    else if (mode === 'menu') this.menu(dt, r, fresh, screen);
  }

  connect(raw) {
    this.connected = true;
    this.id = raw.id || '';
    this.held = [];
    this.mute = new Set();
    // buttons already down when the pad shows up do not count until let go
    const r = readPad(raw, []);
    r.held.forEach((h, i) => { if (h) this.mute.add(i); });
    this.held = r.held;
    if (this.game.hud.refreshBindings) this.game.hud.refreshBindings();
  }

  disconnect() {
    const g = this.game;
    this.release();
    this.connected = false;
    this.held = [];
    this.setFocus(null);
    this.mode = 'none';
    // the controller was in use: stop the fight rather than leave the player standing in it
    if (g.state === 'playing' && g.lastDevice === 'pad') g.pause();
    if (g.hud.refreshBindings) g.hud.refreshBindings();
  }

  /** Let go of everything this pad holds in the input layer. */
  release() {
    const inp = this.game.input;
    for (const a of this.actions) inp.setVirtual(a, false);
    this.actions.clear();
    inp.setPadMove(0, 0);
    this.latch = false;
  }

  enterMode(mode, r) {
    this.release();
    this.mode = mode;
    // what is held at the switch belongs to the old mode (A that clicked "Resume" must not jump)
    this.mute = new Set();
    r.held.forEach((h, i) => { if (h) this.mute.add(i); });
    this.rep = { dir: navDirection([], r.move), t: 0 };
    if (mode !== 'menu') { this.setFocus(null); this.screenEl = null; }
    // a menu opened fresh (pause, death) starts on its main button; within the menus the focus is remembered
    else this.lastFocus = new WeakMap();
  }

  // -------------------------------------------------------------------- play
  play(dt, r, fresh) {
    const g = this.game, inp = g.input, s = g.settings;
    const want = new Set();
    for (const [i, a] of HELD_ACTIONS) if (r.held[i] && !this.mute.has(i)) want.add(a);
    this.latch = stepSprintLatch(this.latch, fresh.includes(BTN.L3), r.move.y, g.player.stamina && g.player.stamina.locked);
    if (this.latch) want.add('sprint');
    for (const a of this.actions) if (!want.has(a)) inp.setVirtual(a, false);
    for (const a of want) if (!this.actions.has(a)) inp.setVirtual(a, true);
    this.actions = want;

    inp.setPadMove(r.move.x, r.move.y);
    if (r.look.x || r.look.y) {
      // radians this frame, turned into mouse counts so the player's look() treats them like the mouse
      const k = (s.padSens || 1) * dt / (LOOK_RAD_PER_COUNT * (s.sens || 1));
      const flip = (s.padInvertY ? -1 : 1) * (s.invertY ? -1 : 1); // look() flips again for the mouse setting
      inp.addLook(r.look.x * GAMEPAD.lookYaw * k, r.look.y * GAMEPAD.lookPitch * k * flip);
    }
    if (fresh.includes(BTN.Y)) inp.addWheel(1);
    if (fresh.includes(BTN.START)) g.pause();
  }

  // -------------------------------------------------------------------- menus
  /** The screen on top, if any: every .screen of the UI that is not hidden. */
  visibleScreen() {
    const list = document.querySelectorAll('#ui > .screen:not(.hidden)');
    return list.length ? list[list.length - 1] : null;
  }

  menu(dt, r, fresh, screen) {
    const g = this.game;
    if (screen !== this.screenEl) { this.screenEl = screen; this.focus = null; }
    const had = this.validFocus(screen);
    if (!had && g.lastDevice === 'pad') this.setFocus(this.defaultFocus(screen));
    const held = r.held.map((h, i) => h && !this.mute.has(i));
    const dir = navDirection(held, r.move, this.rep.dir);
    const step = stepNavRepeat(this.rep, dir, dt);
    if (fresh.includes(BTN.B)) { this.back(); return; }
    if (fresh.includes(BTN.START) && g.state === 'paused') { g.resume(); return; }
    if (!had) return; // the first move or A only shows where the focus is
    if (step) this.navigate(dir, screen);
    if (fresh.includes(BTN.A)) this.activate();
  }

  focusables(screen) {
    return [...screen.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden');
  }

  validFocus(screen) {
    const f = this.focus;
    return !!(f && screen && screen.contains(f) && !f.disabled && f.getClientRects().length > 0);
  }

  defaultFocus(screen) {
    const last = this.lastFocus.get(screen);
    if (last && screen.contains(last) && last.getClientRects().length > 0 && !last.disabled) return last;
    const els = this.focusables(screen);
    return els.find((el) => el.classList.contains('primary')) || els[0] || null;
  }

  setFocus(el) {
    const old = this.focus;
    if (old) {
      old.classList.remove('pad-focus');
      const row = old.closest('.row');
      if (row) row.classList.remove('pad-row');
    }
    this.focus = el;
    if (!el) return;
    el.classList.add('pad-focus');
    const row = el.closest('.row');
    if (row) row.classList.add('pad-row');
    try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    if (this.screenEl) this.lastFocus.set(this.screenEl, el);
  }

  navigate(dir, screen) {
    const el = this.focus;
    if ((dir === 'left' || dir === 'right') && this.adjustable(el)) { this.adjust(el, dir === 'right' ? 1 : -1, false); return; }
    const next = this.neighbour(el, dir, this.focusables(screen));
    if (next) this.setFocus(next);
  }

  adjustable(el) { return !!el && (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'range')); }

  /** Step a list or a slider and tell its listeners, as a change by hand would. */
  adjust(el, sign, wrap) {
    if (el.tagName === 'SELECT') {
      const n = el.options.length;
      if (!n) return;
      let i = el.selectedIndex + sign;
      i = wrap ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
      if (i === el.selectedIndex) return;
      el.selectedIndex = i;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const min = el.min !== '' ? +el.min : 0, max = el.max !== '' ? +el.max : 100, step = +el.step || 1;
      const d = Math.max(step, Math.round((max - min) / 20 / step) * step);
      const v = Math.max(min, Math.min(max, +el.value + sign * d));
      if (v === +el.value) return;
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * The next element in a direction: the nearest row (or column) of boxes that way, then the box in
   * it closest to the current one. Rows first, so a small check box at the left edge of a form is
   * not skipped for a wide control further down. Up and down wrap around.
   */
  neighbour(cur, dir, els) {
    const i0 = els.indexOf(cur);
    const a = cur.getBoundingClientRect();
    if (!(a.width > 0 && a.height > 0)) { // no layout to measure (window without size): page order
      if (dir === 'down' || dir === 'right') return els[(i0 + 1) % els.length];
      return els[(i0 - 1 + els.length) % els.length];
    }
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const vertical = dir === 'up' || dir === 'down';
    const cands = [];
    let nearest = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      if (main <= 4) continue;
      if (!vertical && Math.abs(dy) > Math.max(a.height, b.height)) continue; // left and right stay in the row
      cands.push({ el, main, side: Math.abs(vertical ? dx : dy) });
      nearest = Math.min(nearest, main);
    }
    const band = Math.max(12, (vertical ? a.height : a.width) * 0.5);
    let best = null;
    for (const c of cands) if (c.main <= nearest + band && (!best || c.side < best.side)) best = c;
    if (best) return best.el;
    if (vertical) { const w = dir === 'down' ? els[0] : els[els.length - 1]; return w === cur ? null : w; }
    return null;
  }

  activate() {
    const el = this.focus;
    if (!el) return;
    this.game.lastDevice = 'pad';
    if (el.tagName === 'SELECT') { this.adjust(el, 1, true); return; }
    if (el.tagName === 'INPUT' && el.type === 'range') return;
    el.click();
  }

  /** B: cancel a key capture, otherwise do what Esc does on this screen. */
  back() {
    const g = this.game;
    if (g.keys && g.keys.capturing) { g.keys.cancel(); return; }
    this.synthetic = true;
    try {
      for (const type of ['keydown', 'keyup']) {
        window.dispatchEvent(new KeyboardEvent(type, { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
      }
    } finally { this.synthetic = false; }
  }
}

/** The gamepad. Returns {poll(dt), connected, layout(), showHints()}. */
export function createGamepad(game) { return new GamepadInput(game); }
