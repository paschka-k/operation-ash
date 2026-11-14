// The graphics card in the interface (G01): a line in the settings that names it, and a hint in the
// main menu when the game runs on integrated graphics or without a graphics card at all, telling how to
// put the browser on the fast card. A web page cannot pick the GPU itself, and changing Windows or driver
// settings for the player is not ours to do, so the game says where it runs and how to change it.
// The hint shows in the main menu until the player closes it; the choice is kept in the settings
// (settings.gpuHintClosed). The F3 line (hud.js) shows the card's name next to the FPS.

import { t } from '../config.js';

const STYLE = `
.row.gpu-row { grid-template-columns: 1fr auto; }
.row.gpu-row output { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gpu-hint { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding: 12px 14px; font-size: 13px; line-height: 1.4;
  letter-spacing: 0.02em; color: var(--ink); background: rgba(232, 137, 43, 0.12); border: 1px solid rgba(232, 137, 43, 0.55); }
.gpu-hint.hidden { display: none; }
.gpu-hint-t { font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-2); }
.gpu-hint-now b { color: var(--accent-2); font-weight: 600; }
.gpu-hint-s { color: var(--muted); }
.gpu-hint .btn { align-self: flex-start; font-size: 14px; padding: 7px 14px; margin-top: 4px; }
`;

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
    this._menuHint();
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

  /** The hint in the main menu, built only when the card calls for it and the player has not closed it. */
  _menuHint() {
    const g = this.game;
    if (!this.gpu.hint || g.settings.gpuHintClosed) return;
    const panel = document.querySelector('#screen-menu .panel');
    if (!panel) return;
    const soft = this.gpu.kind === 'software';
    const box = document.createElement('div');
    box.className = 'gpu-hint';
    box.id = 'gpu-hint';
    box.innerHTML = `
      <div class="gpu-hint-t" data-t="${soft ? 'gpuSoftTitle' : 'gpuHintTitle'}"></div>
      <div class="gpu-hint-now"><span data-t="gpuNow"></span> <b></b></div>
      ${soft ? '<div class="gpu-hint-s" data-t="gpuSoftText"></div>' : ''}
      <div class="gpu-hint-s" data-t="gpuHintWindows"></div>
      <div class="gpu-hint-s" data-t="gpuHintNvidia"></div>
      <div class="gpu-hint-s" data-t="gpuHintRestart"></div>
      <button class="btn" id="gpu-hint-close" data-t="gpuHintClose"></button>`;
    box.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    box.querySelector('b').textContent = this.name;
    const hint = panel.querySelector('.hint');
    panel.insertBefore(box, hint || null);
    box.querySelector('#gpu-hint-close').onclick = () => this.close();
    this.box = box;
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
