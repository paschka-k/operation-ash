// "What's new": the version in the main menu and a window with the notes of the current release (in the game's
// language) and the list of earlier versions. The data is src/core/releases.js, the same as CHANGELOG.md.

import { t, getLang } from '../config.js';
import { RELEASES } from '../core/releases.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// `code` in the notes is shown as code
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

export class WhatsNew {
  constructor(game) {
    this.game = game;
    const menu = document.querySelector('#screen-menu .panel.menu');
    this.version = RELEASES[0].version;
    if (menu && !menu.querySelector('#btn-news')) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.id = 'btn-news';
      btn.dataset.t = 'newsButton';
      btn.textContent = t('newsButton');
      btn.onclick = () => this.open();
      const anchor = menu.querySelector('#btn-controls');
      if (anchor) anchor.after(btn); else menu.appendChild(btn);
      const v = document.createElement('div');
      v.className = 'version';
      v.id = 'menu-version';
      v.textContent = 'v' + this.version;
      menu.appendChild(v);
    }
    this.el = game.hud.addScreen('whatsnew', `
      <div class="panel news">
        <div class="logo small" data-t="newsTitle"></div>
        <div class="news-body" id="news-body"></div>
        <button class="btn" id="btn-nback" data-t="back"></button>
      </div>`);
    this.body = this.el.querySelector('#news-body');
    this.el.querySelector('#btn-nback').onclick = () => this.back();
  }

  /** The window's inside in the current language: this release, its known issues, then the older versions. */
  html() {
    const lang = getLang() === 'en' ? 'en' : 'ru';
    const [cur, ...older] = RELEASES;
    const list = (a) => a.map((s) => `<li>${inline(s)}</li>`).join('');
    let h = `<div class="news-head"><b>v${cur.version}</b> <span>${esc(cur.title[lang])}</span><em>${cur.date}</em></div>`;
    h += `<ul class="news-notes">${list(cur.notes[lang])}</ul>`;
    if (cur.known.length) h += `<div class="news-sub">${t('newsKnown')}</div><ul class="news-notes known">${list(cur.known.map((k) => k[lang]))}</ul>`;
    h += `<div class="news-sub">${t('newsEarlier')}</div><ul class="news-old">`;
    for (const r of older) h += `<li><b>v${r.version}</b><em>${r.date}</em><span>${esc(r.title[lang])}</span></li>`;
    return h + '</ul>';
  }

  open() {
    this.body.innerHTML = this.html();
    this.body.scrollTop = 0;
    this.game.hud.showScreen('whatsnew');
  }

  /** Back to the main menu (Esc and the gamepad B come here through the global Esc handler). */
  back() { this.game.hud.showScreen('menu'); }
}

export function createWhatsNew(game) { return new WhatsNew(game); }
