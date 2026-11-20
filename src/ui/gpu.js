// The graphics card in the interface (G01): a line in the settings that names it, and a hint in the
// main menu when the game runs on integrated graphics or without a graphics card at all, telling how to
// get the fast card. A web page cannot pick the GPU itself, and changing Windows or driver settings for
// the player is not ours to do, so the game says where it runs and how to change it.
// The hint shows in the main menu until the player closes it; the choice is kept in the settings
// (settings.gpuHintClosed). The F3 line (hud.js) shows the card's name next to the FPS.
// Wave 15: under the launcher (tools/play.mjs, GET /launcher/info) the settings get select#s-gpu with the
// cards of the system; a change saves the settings and asks the launcher to restart the window on the
// chosen card. In a plain tab the line says honestly that the browser chooses and how to get a choice.
// The menu hint (menuHintKeys) names the launcher first in a plain tab, Windows and NVIDIA only as the
// other way; under the launcher it leads to the game's own "Graphics card" setting.

import { t } from '../config.js';

const STYLE = `
.row.gpu-row { grid-template-columns: 1fr auto; }
.row.gpu-row output { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gpu-note { margin: 4px 0 10px; font-size: 12px; line-height: 1.4; color: var(--muted); }
.gpu-hint { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding: 12px 14px; font-size: 13px; line-height: 1.4;
  letter-spacing: 0.02em; color: var(--ink); background: rgba(232, 137, 43, 0.12); border: 1px solid rgba(232, 137, 43, 0.55); }
.gpu-hint.hidden { display: none; }
.gpu-hint-t { font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-2); }
.gpu-hint-now b { color: var(--accent-2); font-weight: 600; }
.gpu-hint-s { color: var(--muted); }
.gpu-hint .btn { align-self: flex-start; font-size: 14px; padding: 7px 14px; margin-top: 4px; }
.gpu-hint-b { display: flex; flex-wrap: wrap; gap: 8px; }
`;

/**
 * The keys of the strings under the hint's title, in order. kind: core/gpu's kind of the graphics; launcher:
 * the answer of GET /launcher/info, or null in a plain tab. A plain tab names the launcher first and the
 * Windows or NVIDIA settings only as the other way; under the launcher the hint leads to the game's own
 * "Graphics card" setting (or says there is one card only) and never to Windows.
 */
export function menuHintKeys(kind, launcher) {
  const soft = kind === 'software' ? ['gpuSoftText'] : [];
  if (launcher && launcher.launcher) return [...soft, launcher.gpus && launcher.gpus.length > 1 ? 'gpuHintPick' : 'gpuOnlyOne'];
  return [...soft, 'gpuHintLauncher', 'gpuHintOther'];
}

export class GpuInfoUi {
  constructor(game) {
    this.game = game;
    this.gpu = (game.gr && game.gr.gpu) || { name: '', kind: 'unknown', hint: false };
    if (!document.getElementById('gpu-style')) {
      const style = document.createElement('style');
      style.id = 'gpu-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    this._settingsRow();
    this.launcher = null;
    this.box = null;
    this._probe();
  }

  /**
   * Ask the launcher who we are. Silent on file:// , on the site and when there is no launcher. The main
   * menu's hint is built after the answer, so it names the right way at once.
   */
  async _probe() {
    const h = location.hostname;
    if (!/^https?:$/.test(location.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(h)) { this._note('gpuTabNote'); this._menuHint(); return; }
    let info = null;
    try {
      const r = await fetch('/launcher/info', { cache: 'no-store' });
      if (r.ok) info = await r.json();
    } catch (e) { /* no launcher */ }
    if (!info || !info.launcher) { this._note('gpuTabNote'); this._menuHint(); return; }
    this.launcher = info;
    this._pickRow();
    this._menuHint();
    // debug aid: the launcher prints what the game really renders on
    try {
      fetch('/launcher/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderer: this.gpu.raw || this.gpu.name || '' }) }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /**
   * The explanation under the card's line (a plain tab, or a launcher with nothing to choose), by the key of
   * its string, or none. The key stays in data-t, so hud.refreshLang translates it when the language changes.
   */
  _note(key) {
    const row = document.getElementById('o-gpu') && document.getElementById('o-gpu').parentNode;
    if (!row) return;
    let n = document.getElementById('gpu-note');
    if (!n) {
      n = document.createElement('div');
      n.id = 'gpu-note';
      n.className = 'gpu-note';
      row.after(n);
    }
    if (key) n.dataset.t = key;
    else delete n.dataset.t;
    n.textContent = key ? t(key) : '';
  }

  /** After a change of language (hud.refreshLang): the texts that are not a plain data-t string. */
  refreshLang() {
    const out = document.getElementById('o-gpu');
    if (out) out.textContent = this.name;
    if (this.box) this.box.querySelector('b').textContent = this.name;
    this._fillPick();
  }

  _optionLabel(o) { return o.name + ' — ' + t(o.id === 'high' ? 'gpuFast' : 'gpuWindows'); }

  /** Can the card be changed right now? Only in the main menu and on pause. */
  get canSwitch() { const s = this.game.state; return s === 'menu' || s === 'paused'; }

  /** select#s-gpu with the cards of the system (only when there is more than one). */
  _pickRow() {
    const info = this.launcher;
    if (document.getElementById('s-gpu')) return;
    if (!info.gpus || info.gpus.length < 2) { this._note('gpuOnlyOne'); return; }
    const anchor = document.getElementById('gpu-note') || (document.getElementById('o-gpu') && document.getElementById('o-gpu').parentNode);
    if (!anchor) return;
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = '<span data-t="gpuPick"></span><select id="s-gpu"></select>';
    anchor.after(row);
    const sel = row.querySelector('select');
    this._fillPick();
    sel.addEventListener('change', () => this._choose(sel.value));
    // the settings screen has no hook of its own: look at it when it is shown
    const screen = document.getElementById('screen-settings');
    if (screen) new MutationObserver(() => { if (!screen.classList.contains('hidden')) this._fillPick(); }).observe(screen, { attributes: true, attributeFilter: ['class'] });
    this._fillPick();
  }

  _fillPick() {
    const sel = document.getElementById('s-gpu');
    if (!sel || !this.launcher) return;
    sel.parentNode.querySelector('span').textContent = t('gpuPick');
    sel.innerHTML = '';
    for (const o of this.launcher.gpus) {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = this._optionLabel(o);
      sel.appendChild(op);
    }
    sel.value = this.launcher.choice;
    sel.disabled = !this.canSwitch;
    sel.title = sel.disabled ? t('gpuPauseOnly') : '';
  }

  /** Save the settings, ask the launcher to restart the window on the card; the new window opens in the main menu. */
  async _choose(id) {
    const sel = document.getElementById('s-gpu');
    const fail = () => { this._note('gpuFailed'); if (sel) sel.value = this.launcher.choice; };
    if (!this.canSwitch || id === this.launcher.choice) { if (sel) sel.value = this.launcher.choice; return; }
    if (this.game.state === 'paused' && !window.confirm(t('gpuConfirm'))) { if (sel) sel.value = this.launcher.choice; return; }
    this.game.saveSettings();
    try {
      const r = await fetch('/launcher/gpu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice: id }) });
      const body = r.ok ? await r.json() : null;
      if (!body || !body.ok) { fail(); return; }
      this.launcher.choice = id;
      this._note(body.restarting ? 'gpuRestarting' : null);
    } catch (e) { fail(); }
  }

  /** Name of the card as the interface shows it. */
  get name() { return this.gpu.name || t('gpuUnknown'); }

  /** A read-only line in the settings, above the key bindings button. */
  _settingsRow() {
    const panel = document.querySelector('#screen-settings .panel');
    if (!panel || document.getElementById('o-gpu')) return;
    const row = document.createElement('div');
    row.className = 'row gpu-row';
    row.innerHTML = '<span data-t="gpuLabel"></span><output id="o-gpu"></output>';
    panel.insertBefore(row, document.getElementById('btn-keys') || null);
    row.querySelector('span').textContent = t('gpuLabel');
    const out = row.querySelector('output');
    out.textContent = this.name;
    out.title = this.gpu.raw || '';
  }

  /**
   * The hint in the main menu, built only when the card calls for it and the player has not closed it. Its
   * lines come from menuHintKeys: built once the launcher probe has answered, and built again when it says
   * the launcher is there (then a button opens the settings at select#s-gpu).
   */
  _menuHint() {
    const g = this.game;
    if (!this.gpu.hint || g.settings.gpuHintClosed) return;
    const panel = document.querySelector('#screen-menu .panel');
    if (!panel) return;
    if (this.box) this.box.remove();
    const soft = this.gpu.kind === 'software';
    const pick = !!document.getElementById('s-gpu');
    const box = document.createElement('div');
    box.className = 'gpu-hint';
    box.id = 'gpu-hint';
    box.innerHTML = `
      <div class="gpu-hint-t" data-t="${soft ? 'gpuSoftTitle' : 'gpuHintTitle'}"></div>
      <div class="gpu-hint-now"><span data-t="gpuNow"></span> <b></b></div>
      ${menuHintKeys(this.gpu.kind, this.launcher).map((k) => `<div class="gpu-hint-s" data-t="${k}"></div>`).join('')}
      <div class="gpu-hint-b">
        ${pick ? '<button class="btn" id="gpu-hint-open" data-t="gpuHintOpen"></button>' : ''}
        <button class="btn" id="gpu-hint-close" data-t="gpuHintClose"></button>
      </div>`;
    box.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    box.querySelector('b').textContent = this.name;
    const hint = panel.querySelector('.hint');
    panel.insertBefore(box, hint || null);
    box.querySelector('#gpu-hint-close').onclick = () => this.close();
    if (pick) box.querySelector('#gpu-hint-open').onclick = () => this.openPick();
    this.box = box;
  }

  /** The settings screen, at the card's select (under the launcher). */
  openPick() {
    const hud = this.game.hud;
    if (hud && hud.openSettings) hud.openSettings('menu');
    this._fillPick();
    const sel = document.getElementById('s-gpu');
    if (sel) { sel.scrollIntoView({ block: 'center' }); sel.focus(); }
  }

  /** Close the hint for good: it does not come back after a reload. */
  close() {
    const g = this.game;
    g.settings.gpuHintClosed = true;
    g.saveSettings();
    if (this.box) { this.box.remove(); this.box = null; }
  }

  /** Is the hint on the menu screen now? */
  get hintShown() { return !!this.box; }
}

/** The card's line in the settings and, when it is worth it, the hint in the main menu. */
export function createGpuInfo(game) { return new GpuInfoUi(game); }
