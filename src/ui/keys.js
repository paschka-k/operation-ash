// Key bindings: readable names of key codes and the binding screen (Settings → Key bindings).
//
// Every action of ACTIONS has up to two codes (KeyboardEvent.code, or Mouse0/1/2). A click on a
// slot waits for the next key or mouse button and assigns it; Esc cancels the wait, Backspace or
// Delete clears the slot; a code that another action used moves to this one. The result is saved
// in settings.bindings and handed to input.setBindings().
//
// While a slot waits, key presses are taken in the capture phase on window and stopped there, so
// nothing else (the game's global keys, the input layer, a focused button) sees them. Releases go
// through, except those of the presses that were taken, so a key held before the wait is let go
// normally. A wait lives only on this screen: leaving it any way (back, resume, pause, menu) ends it
// (hud.showScreen calls cancel()).

import { ACTIONS, mergeBindings, t } from '../config.js';
import { WEAPON_ORDER, WEAPON_SPECS } from '../core/rules.js';
import { BTN, buttonLabel, padButtonsFor, STICK_ACTIONS } from '../core/gamepad.js';
import { assignBinding } from '../core/bindings.js';

// names that read the same in every language
const NAMES = {
  ShiftLeft: 'Shift', ControlLeft: 'Ctrl', AltLeft: 'Alt', MetaLeft: 'Win', MetaRight: 'Win',
  Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter', NumpadEnter: 'Num Enter', Backspace: 'Backspace', Escape: 'Esc',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', ContextMenu: 'Menu',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};
// names that need a translation (STR keys)
const LOCAL = {
  Space: 'kn_space', Mouse0: 'kn_mouse0', Mouse1: 'kn_mouse1', Mouse2: 'kn_mouse2',
  ShiftRight: 'kn_rshift', ControlRight: 'kn_rctrl', AltRight: 'kn_ralt',
};
// keys that cannot be bound: Esc cancels the wait, F3 is the FPS counter
const RESERVED = new Set(['Escape', 'F3']);

/** A readable name of a key code: KeyW → W, Digit1 → 1, ShiftLeft → Shift, Mouse0 → ЛКМ. */
export function keyName(code) {
  if (!code) return t('keysNone');
  if (LOCAL[code]) return t(LOCAL[code]);
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  if (/^Mouse\d$/.test(code)) return t('kn_mouse', { n: +code.slice(5) + 1 });
  return code; // F1..F24 and rare keys read fine as they are
}

/** Names of the codes of one action, joined: 'Shift, Пр. Shift'. */
export function bindingText(bindings, action, sep = ', ') {
  const codes = (bindings && bindings[action]) || [];
  return codes.length ? codes.map(keyName).join(sep) : t('keysNone');
}

/** The readable name of an action: 'Прыжок', 'Слот 2 · Автомат AR-7'. */
export function actionName(action) {
  const m = /^slot(\d)$/.exec(action);
  if (m) {
    const id = WEAPON_ORDER[+m[1] - 1], base = t('act_slot', { n: m[1] });
    return id && WEAPON_SPECS[id] ? base + ' · ' + t(WEAPON_SPECS[id].nameKey) : base;
  }
  return t('act_' + action);
}

/** What does this action on a gamepad of this layout: 'A', 'RT', 'левый стик', '' for nothing. */
export function padHint(action, layout) {
  if (STICK_ACTIONS[action]) return t(STICK_ACTIONS[action] === 'left' ? 'pad_lstick' : 'pad_rstick');
  if (action === 'switch') return buttonLabel(BTN.Y, layout) + ', ' + buttonLabel(BTN.LB, layout);
  return padButtonsFor(action).map((i) => buttonLabel(i, layout)).join(', ');
}

export class KeyScreen {
  constructor(game) {
    this.game = game;
    this.capture = null;        // {action, slot} while a slot waits for a key
    this.eaten = new Set();     // keys and mouse buttons whose press the wait took: their release goes nowhere either
    this.eatClicks = false;     // a mouse button was just bound: its click goes nowhere either
    const rows = ACTIONS.map((a) => `
      <div class="kb-row" data-act="${a}">
        <span class="kb-name"></span>
        <button class="kb-slot" data-act="${a}" data-slot="0"></button>
        <button class="kb-slot" data-act="${a}" data-slot="1"></button>
        <span class="kb-pad"></span>
      </div>`).join('');
    this.el = game.hud.addScreen('keys', `
      <div class="panel keys">
        <div class="logo small" data-t="keysTitle"></div>
        <div class="kb-hint" data-t="keysHint"></div>
        <div class="kb-grid">${rows}</div>
        <div class="kb-buttons">
          <button class="btn" id="btn-kreset" data-t="keysReset"></button>
          <button class="btn" id="btn-kback" data-t="back"></button>
        </div>
      </div>`);
    this.slots = [...this.el.querySelectorAll('.kb-slot')];
    for (const b of this.slots) b.onclick = () => this.start(b.dataset.act, +b.dataset.slot);
    this.el.querySelector('#btn-kreset').onclick = () => this.reset();
    this.el.querySelector('#btn-kback').onclick = () => this.back();
    this.listen();
    this.refresh();
  }

  /** Is a slot waiting? Only on this screen; a wait left behind elsewhere is ended. */
  get capturing() { return this.live(); }

  live() {
    if (this.capture && this.game.hud.screen !== 'keys') this.cancel();
    return !!this.capture;
  }

  /** Show the screen (from the settings screen). */
  open() {
    this.cancel();
    this.refresh();
    this.game.hud.showScreen('keys');
  }

  /** Back to the settings screen. */
  back() {
    this.cancel();
    this.game.hud.showScreen('settings');
  }

  /** Make a slot wait for the next key or mouse button. */
  start(action, slot) {
    this.capture = { action, slot };
    // a focused button would answer Space or Enter itself
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.refresh();
  }

  cancel() {
    if (!this.capture) return;
    this.capture = null;
    this.refresh();
  }

  /**
   * Put a code in the waiting slot (null clears it). The other slot stays as it is, a code another
   * action had moves here (core/bindings.js assignBinding).
   */
  assign(code) {
    if (!this.capture) return;
    const { action, slot } = this.capture;
    this.capture = null;
    this.save(assignBinding(mergeBindings(this.game.settings.bindings), action, slot, code));
  }

  reset() {
    this.cancel();
    this.save(mergeBindings(null));
  }

  save(bindings) {
    const g = this.game;
    g.settings.bindings = bindings;
    g.saveSettings();
    g.input.setBindings(bindings);
    g.input.releaseAll(); // nothing pressed under the old bindings may stay pressed
    g.hud.refreshBindings(); // refreshes this screen too
  }

  /** Texts of the screen: action names, slots, gamepad hints. */
  refresh() {
    const g = this.game, b = mergeBindings(g.settings.bindings);
    const pad = g.pad && g.pad.showHints() ? g.pad.layout() : null;
    for (const row of this.el.querySelectorAll('.kb-row')) {
      const a = row.dataset.act;
      row.querySelector('.kb-name').textContent = actionName(a);
      const hint = row.querySelector('.kb-pad');
      hint.textContent = pad ? padHint(a, pad) : '';
      hint.classList.toggle('hidden', !pad);
    }
    for (const s of this.slots) {
      const a = s.dataset.act, i = +s.dataset.slot, code = b[a][i];
      const waiting = !!this.capture && this.capture.action === a && this.capture.slot === i;
      s.textContent = waiting ? t('keysPress') : code ? keyName(code) : t('keysNone');
      s.classList.toggle('wait', waiting);
      s.classList.toggle('empty', !waiting && !code);
    }
  }

  listen() {
    const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    // a press outside a wait means the key was let go meanwhile: its next release is not ours
    window.addEventListener('blur', () => this.eaten.clear());
    window.addEventListener('keydown', (e) => {
      if (!this.live()) { this.eaten.delete(e.code); return; }
      stop(e);
      this.eaten.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Escape') this.cancel();
      else if (e.code === 'Backspace' || e.code === 'Delete') this.assign(null);
      else if (!e.code || RESERVED.has(e.code)) return; // keep waiting
      else this.assign(e.code);
    }, true);
    window.addEventListener('keyup', (e) => {
      // only the releases of presses the wait took; any other key (held before) is let go as usual
      if (this.eaten.delete(e.code)) stop(e);
    }, true);
    window.addEventListener('mousedown', (e) => {
      if (!this.live()) { this.eaten.delete('Mouse' + e.button); return; }
      stop(e);
      this.eaten.add('Mouse' + e.button);
      if (e.button > 2) return; // back and forward buttons would also navigate the page
      this.eatClicks = true;
      this.assign('Mouse' + e.button);
    }, true);
    window.addEventListener('mouseup', (e) => {
      if (!this.eaten.delete('Mouse' + e.button)) return;
      stop(e);
      // the click (or the context menu) of the bound button follows its mouseup
      if (this.eatClicks) setTimeout(() => { this.eatClicks = false; }, 60);
    }, true);
    for (const type of ['click', 'auxclick', 'contextmenu']) {
      window.addEventListener(type, (e) => { if (this.eatClicks || (this.capture && this.live())) stop(e); }, true);
    }
  }
}

/** The key binding screen. Returns {open(), back(), cancel(), capturing, refresh()}. */
export function createKeyScreen(game) { return new KeyScreen(game); }
