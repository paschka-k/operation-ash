// Keyboard, mouse and pointer lock, read as actions.
//
// The game asks for actions ('forward', 'fire', 'reload', ...), never for keys. Each action has a
// list of physical codes in settings.bindings (see ACTIONS and DEFAULT_BINDINGS in config.js).
// Mouse buttons are codes too: Mouse0 left, Mouse1 middle, Mouse2 right. Other sources (tests,
// a gamepad) hold actions directly with setVirtual(). Edge triggered presses are consumed once.

import { ACTIONS, mergeBindings } from '../config.js';

// keys whose browser default must not fire during play even when nothing is bound to them
const ALWAYS_GAME_KEYS = ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.down = new Set();        // physical codes held
    this.edge = new Set();        // physical codes pressed since they were last consumed
    this.lastPress = new Map();   // code -> time of the last press (jump buffering)
    this.virtual = new Set();     // actions held by a non-keyboard source
    this.vEdge = new Set();       // actions pressed by such a source, not yet consumed
    this.vPress = new Map();      // action -> time of its last virtual press
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this._listeners = [];
    this.setBindings(game.settings.bindings);

    this._on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (this.gameKeys.has(e.code) && this.game.state === 'playing') e.preventDefault();
      this._press(e.code);
    });
    this._on(window, 'keyup', (e) => { this.down.delete(e.code); });
    this._on(window, 'blur', () => this.releaseAll());

    this._on(document, 'mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    this._on(canvas, 'mousedown', (e) => {
      if (!this.locked) return;
      this._press('Mouse' + e.button);
    });
    this._on(window, 'mouseup', (e) => { this.down.delete('Mouse' + e.button); });
    this._on(canvas, 'contextmenu', (e) => e.preventDefault());
    this._on(canvas, 'wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    this._on(document, 'pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.releaseAll();
      this.game.onPointerLockChange(this.locked, was);
    });
    // a refused lock was never held: the game goes on without it (gamepad play, no user gesture)
    this._on(document, 'pointerlockerror', () => this.game.onPointerLockChange(false, false));
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  _press(code) {
    if (!this.down.has(code)) {
      this.edge.add(code);
      this.lastPress.set(code, performance.now());
    }
    this.down.add(code);
  }

  /** Use a new set of bindings (after the player changed them). Missing actions get their defaults. */
  setBindings(bindings) {
    this.bindings = mergeBindings(bindings);
    this.gameKeys = new Set(ALWAYS_GAME_KEYS);
    for (const a of ACTIONS) for (const c of this.bindings[a]) if (!c.startsWith('Mouse')) this.gameKeys.add(c);
  }

  // ---------------------------------------------------------------- actions
  /** Is the action held right now? */
  action(name) {
    if (this.virtual.has(name)) return true;
    const codes = this.bindings[name];
    if (codes) for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** True once per press of the action. */
  actionPressed(name) {
    let hit = false;
    if (this.vEdge.has(name)) { this.vEdge.delete(name); hit = true; }
    const codes = this.bindings[name];
    if (codes) for (const c of codes) if (this.edge.has(c)) { this.edge.delete(c); hit = true; }
    return hit;
  }

  /** True if the action was pressed within the last `ms` milliseconds (jump buffering). */
  actionRecent(name, ms) {
    const now = performance.now();
    const v = this.vPress.get(name);
    if (v !== undefined && now - v < ms) return true;
    const codes = this.bindings[name];
    if (codes) for (const c of codes) { const t = this.lastPress.get(c); if (t !== undefined && now - t < ms) return true; }
    return false;
  }

  clearActionRecent(name) {
    this.vPress.delete(name);
    const codes = this.bindings[name];
    if (codes) for (const c of codes) this.lastPress.delete(c);
  }

  /** Hold or release an action from a source other than the keyboard and mouse (gamepad, tests). */
  setVirtual(name, down) {
    if (down) {
      if (!this.virtual.has(name)) { this.vEdge.add(name); this.vPress.set(name, performance.now()); }
      this.virtual.add(name);
    } else this.virtual.delete(name);
  }

  // the trigger and the aim button, kept as fields because many places read them
  get left() { return this.action('fire'); }
  get right() { return this.action('aim'); }

  // names of the input contract
  get state() { return this; }
  consumeWheel() { return this.takeWheel(); }
  setSensitivity(v) { this.game.settings.sens = v; }
  dispose() {
    for (const [target, type, fn, opts] of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
    this.unlock();
  }

  /** Ask for the mouse. Resolves true when the pointer is locked, false when the browser refused. */
  lock() {
    return new Promise((resolve) => {
      if (document.pointerLockElement === this.canvas) { resolve(true); return; }
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        clearTimeout(timer);
        resolve(ok);
      };
      const onChange = () => finish(document.pointerLockElement === this.canvas);
      const onError = () => finish(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      const timer = setTimeout(() => finish(document.pointerLockElement === this.canvas), 1500);
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => finish(false));
      } catch (e) { finish(false); }
    });
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  releaseAll() {
    this.down.clear();
    this.edge.clear();
    this.virtual.clear();
    this.vEdge.clear();
    this.padX = this.padY = 0;
  }

  // raw codes: kept for global keys (F3, Esc) and for the key binding screen
  isDown(code) { return this.down.has(code); }

  /** True once per press of a physical key. */
  pressed(code) {
    if (this.edge.has(code)) { this.edge.delete(code); return true; }
    return false;
  }

  takeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = this.mouseDY = 0;
    return [dx, dy];
  }

  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  /**
   * Used by automated tests to inject input without a real device.
   * keys: {code: bool} physical keys; actions: {name: bool}; left/right: the fire and aim actions.
   */
  inject({ keys, actions, left, right, dx, dy, wheel } = {}) {
    if (keys) {
      for (const k of Object.keys(keys)) {
        if (keys[k]) this._press(k);
        else this.down.delete(k);
      }
    }
    if (actions) for (const a of Object.keys(actions)) this.setVirtual(a, !!actions[a]);
    if (left !== undefined) this.setVirtual('fire', !!left);
    if (right !== undefined) this.setVirtual('aim', !!right);
    if (dx) this.mouseDX += dx;
    if (dy) this.mouseDY += dy;
    if (wheel) this.wheel += wheel;
  }

  // ---- wave 11: analog sources (gamepad)
  /** The analog move vector of a stick: x right, y forward, each -1..1. Merged in moveAxes(). */
  setPadMove(x, y) { this.padX = x; this.padY = y; }

  /**
   * Movement in the local frame: x right, y forward. Keys give -1, 0 or 1, a stick anything in
   * between, so the speed follows the deflection. The length never exceeds 1.
   */
  moveAxes() {
    let x = (this.action('right') ? 1 : 0) - (this.action('left') ? 1 : 0) + (this.padX || 0);
    let y = (this.action('forward') ? 1 : 0) - (this.action('back') ? 1 : 0) + (this.padY || 0);
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  /** Turn the view like the mouse does, in mouse counts (the gamepad's right stick). */
  addLook(dx, dy) { this.mouseDX += dx; this.mouseDY += dy; }

  /** Cycle owned weapons like the wheel does: +1 next, -1 previous (the gamepad's Y). */
  addWheel(step) { this.wheel += step; }
}

/** Keyboard, mouse and pointer lock. Returns {state, lock(), unlock(), consumeWheel(), setSensitivity(v), dispose()}. */
export function createInput(game) { return new Input(game.canvas, game); }
