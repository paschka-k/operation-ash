// The big map of the whole block, toggled by the 'map' action (M, D-pad up).
//
// It is an overlay inside the HUD, not a screen: the game keeps running under it, nothing pauses
// and the pointer stays locked. North (-z) is up, the player arrow turns with the view, enemies
// show by the same setting as the radar (settings.radarEnemies). It closes by itself whenever the
// game is not being played (death, pause, victory, menu).
//
// Wave 15: the ground is the picture from above that the renderer took when the map was built
// (game.mapView.image, scaled by game.mapView.half). Without one (a failed capture) the plain drawing
// of the footprints stays as the fallback.

import { MAP_HALF, t } from '../config.js';
import { enemyMarkerAlpha } from '../core/rules.js';
import { BTN, buttonLabel } from '../core/gamepad.js';
import { keyName } from './keys.js';

/** Half the side of the map on screen: the picture's, else the world's, else the block's 45 m. */
export function mapHalfOf(g) {
  return (g.mapView && g.mapView.half) || (g.world && g.world.half) || MAP_HALF;
}

/** The picture from above of the map that is on screen now, or null (none taken, or of another map). */
export function mapImageOf(g) {
  const v = g.mapView;
  return v && v.image && g.world && v.mapId === g.world.mapId ? v.image : null;
}

const fill = (str, vars) => { let r = str; for (const k of Object.keys(vars)) r = r.split('{' + k + '}').join(String(vars[k])); return r; };

export class BigMap {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    const el = document.createElement('div');
    el.className = 'bigmap hidden';
    el.id = 'h-bigmap';
    el.innerHTML = `
      <div class="bigmap-head"><span id="h-bmtitle"></span><span class="bigmap-hint" id="h-bmhint"></span></div>
      <canvas class="bigmap-canvas" id="h-bmcanvas"></canvas>
      <div class="bigmap-legend"><span><i class="me"></i><b data-t="mapYou"></b></span><span><i class="foe"></i><b id="h-bmfoe"></b></span><span><i class="rider"></i><b data-t="mapLegendRider"></b></span><span><i class="boss"></i><b data-t="mapLegendBoss"></b></span></div>`;
    game.hud.hud.appendChild(el);
    el.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    const g = this.game;
    if (g.shop && g.shop.invOpen) g.shop.closeInventory(); // one overlay at a time
    // texts follow the language and the bindings of the moment
    const keys = (g.settings.bindings && g.settings.bindings.map) || [];
    let hint = keys.length ? keyName(keys[0]) : '';
    if (g.pad && g.pad.connected) hint += (hint ? ' / ' : '') + buttonLabel(BTN.UP, g.pad.layout());
    this.el.querySelector('#h-bmhint').textContent = (hint ? '[' + hint + '] ' : '') + t('mapClose');
    this.el.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    const name = t('map_' + ((g.world && g.world.mapId) || 'block'));
    this.el.querySelector('#h-bmtitle').textContent = fill(t('mapHead'), { name });
    this.el.querySelector('#h-bmfoe').textContent = t('radarEnemies') + ': ' + t(g.settings.radarEnemies === 'all' ? 're_all' : 're_fired').toLowerCase();
    this.el.classList.remove('hidden');
    g.hud.hud.classList.add('map-open');    // the wave banner moves above the map (styles.css)
    this.draw();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add('hidden');
    this.game.hud.hud.classList.remove('map-open');
  }

  /** Once per frame: the map key, closing outside of play, drawing while open. */
  update() {
    const g = this.game;
    const pressed = g.input.actionPressed('map'); // consumed in every state, so it cannot fire late
    if (g.state !== 'playing' || !g.player.alive || g.hud.screen) { this.close(); return; }
    if (pressed) this.toggle();
    if (this.isOpen) this.draw();
  }

  draw() {
    const g = this.game, cv = this.canvas, ctx = this.ctx;
    const css = cv.clientWidth;
    if (!(css > 0)) return; // the window has no size (hidden tab)
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    ctx.setTransform(px / css, 0, 0, px / css, 0, 0);

    const hm = mapHalfOf(g);
    const L = css, m = 14, k = (L - 2 * m) / (2 * hm);
    const X = (x) => m + (x + hm) * k, Y = (z) => m + (z + hm) * k;
    ctx.clearRect(0, 0, L, L);

    // ground: the picture from above, or the plain drawing of the footprints under a 10 m grid
    ctx.fillStyle = 'rgba(22, 25, 28, 0.92)';
    ctx.fillRect(m, m, L - 2 * m, L - 2 * m);
    const image = mapImageOf(g);
    if (image) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, m, m, L - 2 * m, L - 2 * m);
      ctx.fillStyle = 'rgba(8, 10, 12, 0.16)';  // a little dimming so that the marks read
      ctx.fillRect(m, m, L - 2 * m, L - 2 * m);
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let v = -hm + 5; v < hm; v += 10) {
        ctx.moveTo(X(v), Y(-hm)); ctx.lineTo(X(v), Y(hm));
        ctx.moveTo(X(-hm), Y(v)); ctx.lineTo(X(hm), Y(v));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(128, 138, 148, 0.42)';
      ctx.strokeStyle = 'rgba(205, 214, 222, 0.7)';
      ctx.lineWidth = 1.5;
      for (const f of (g.world.footprints || [])) {
        const x0 = X(Math.min(f.x0, f.x1)), y0 = Y(Math.min(f.z0, f.z1));
        const w = Math.abs(f.x1 - f.x0) * k, h = Math.abs(f.z1 - f.z0) * k;
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeRect(x0, y0, w, h);
      }
    }

    // the edge of the playable area
    ctx.strokeStyle = 'rgba(232, 137, 43, 0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(m, m, L - 2 * m, L - 2 * m);

    // the 10 m scale bar, bottom left
    {
      const len = 10 * k, bx = m + 12, by = L - m - 14;
      ctx.fillStyle = 'rgba(8, 10, 12, 0.6)';
      ctx.fillRect(bx - 6, by - 20, len + 12 + 34, 28);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 2); ctx.lineTo(bx + len, by + 2); ctx.lineTo(bx + len, by - 5); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '600 12px Bahnschrift, "Segoe UI", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t('mapScale'), bx + len + 8, by + 2);
    }

    // enemies, by the same rule as the radar
    const mode = g.settings.radarEnemies;
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const a = enemyMarkerAlpha(mode, g.time - e.lastFired);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(255, 60, 50, ${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(X(e.pos.x), Y(e.pos.z), 5, 0, Math.PI * 2); ctx.fill();
    }

    // the player: view cone and arrow. Forward is (-sin yaw, -cos yaw) in x, z, and z grows downwards here.
    const p = g.player, cx = X(p.pos.x), cy = Y(p.pos.z);
    const ang = Math.atan2(-Math.cos(p.yaw), -Math.sin(p.yaw)); // screen angle of the view
    const cam = g.gr.camera;
    const half = Math.min(1.2, Math.atan(Math.tan(((cam.fov || 70) * Math.PI) / 360) * (cam.aspect || 1.6)));
    const reach = 14 * k;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, reach, ang - half, ang + half); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();

    // north
    ctx.fillStyle = 'rgba(8, 10, 12, 0.7)';
    ctx.beginPath(); ctx.arc(L / 2, m / 2 + 1, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 185, 94, 0.95)';
    ctx.font = '600 14px Bahnschrift, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('mapNorth'), L / 2, m / 2 + 1);
  }
}

/** The big map overlay. Returns {update(), open(), close(), toggle(), isOpen}. */
export function createBigMap(game) { return new BigMap(game); }
