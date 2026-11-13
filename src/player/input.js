// Keyboard, mouse and pointer lock. Edge triggered keys are consumed once.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft',
  'KeyR', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

export class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.down = new Set();
    this.edge = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.left = false;
    this.right = false;
    this.wheel = 0;
    this.locked = false;
    this.lastPress = new Map();
    this._listeners = [];

    this._on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (GAME_KEYS.has(e.code) && this.game.state === 'playing') e.preventDefault();
      if (!this.down.has(e.code)) {
        this.edge.add(e.code);
        this.lastPress.set(e.code, performance.now());
      }
      this.down.add(e.code);
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
      if (e.button === 0) this.left = true;
      if (e.button === 2) this.right = true;
    });
    this._on(window, 'mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    this._on(canvas, 'contextmenu', (e) => e.preventDefault());
    this._on(canvas, 'wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    this._on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.releaseAll();
      this.game.onPointerLockChange(this.locked);
    });
    this._on(document, 'pointerlockerror', () => this.game.onPointerLockChange(false));
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

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
    this.left = this.right = false;
  }

  isDown(code) { return this.down.has(code); }

  /** True once per key press. */
  pressed(code) {
    if (this.edge.has(code)) { this.edge.delete(code); return true; }
    return false;
  }

  /** True if the key went down within the last `ms` milliseconds (jump buffering). */
  recent(code, ms) {
    const t = this.lastPress.get(code);
    return t !== undefined && performance.now() - t < ms;
  }

  clearRecent(code) { this.lastPress.delete(code); }

  takeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = this.mouseDY = 0;
    return [dx, dy];
  }

  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  /** Used by automated tests to inject input without a real device. */
  inject({ keys, left, right, dx, dy } = {}) {
    if (keys) {
      for (const k of Object.keys(keys)) {
        if (keys[k]) { if (!this.down.has(k)) { this.edge.add(k); this.lastPress.set(k, performance.now()); } this.down.add(k); }
        else this.down.delete(k);
      }
    }
    if (left !== undefined) this.left = left;
    if (right !== undefined) this.right = right;
    if (dx) this.mouseDX += dx;
    if (dy) this.mouseDY += dy;
  }
}

/** Keyboard, mouse and pointer lock. Returns {state, lock(), unlock(), consumeWheel(), setSensitivity(v), dispose()}. */
export function createInput(game) { return new Input(game.canvas, game); }
