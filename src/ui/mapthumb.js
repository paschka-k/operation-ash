// The small schemes of the maps on the shop's cards (wave 15).
//
// A card draws core/mapgen's mapSchema(id): streets, buildings and the rider loops, north up. A layout
// takes 70-120 ms to make the first time, so the schemes are made one per animation frame behind the
// cards (fillThumbs) and kept; a redrawn card finds its scheme at once.

import { mapSchema } from '../core/mapgen.js';

const schemes = new Map();   // id -> mapSchema(id), made once

/** The scheme of a map, or null when it cannot be made (the card then stays a dark square). */
export function schemeOf(id) {
  if (schemes.has(id)) return schemes.get(id);
  let s = null;
  try { s = mapSchema(id); } catch (e) { s = null; }
  schemes.set(id, s);
  return s;
}

/** Is the scheme of `id` ready (a card of it can be drawn without a pause)? */
export const schemeReady = (id) => schemes.has(id);

/** Draw the scheme of `id` on a canvas, at its physical size. Returns false when there is nothing to draw. */
export function drawThumb(canvas, id) {
  const s = schemeOf(id);
  const ctx = canvas.getContext('2d');
  const css = canvas.clientWidth || Number(canvas.dataset.css) || 120;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(css * dpr);
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  ctx.setTransform(px / css, 0, 0, px / css, 0, 0);
  ctx.clearRect(0, 0, css, css);
  ctx.fillStyle = '#16191c';
  ctx.fillRect(0, 0, css, css);
  if (!s) return false;
  const m = 3, k = (css - 2 * m) / (2 * s.half);
  const X = (x) => m + (x + s.half) * k, Y = (z) => m + (z + s.half) * k;
  ctx.fillStyle = '#2a2f33';
  ctx.fillRect(m, m, css - 2 * m, css - 2 * m);
  // streets
  ctx.fillStyle = '#4a5157';
  for (const r of s.roads) ctx.fillRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
  // the rider loops, dashed
  ctx.strokeStyle = 'rgba(255, 185, 94, 0.8)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  for (const route of s.routes) {
    if (!route.length) continue;
    ctx.beginPath();
    route.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z))));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // buildings
  ctx.fillStyle = '#aab3ba';
  ctx.strokeStyle = '#6d777f';
  ctx.lineWidth = 1;
  for (const b of s.buildings) {
    const w = (b.x1 - b.x0) * k, h = (b.z1 - b.z0) * k;
    ctx.fillRect(X(b.x0), Y(b.z0), w, h);
    ctx.strokeRect(X(b.x0) + 0.5, Y(b.z0) + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  }
  ctx.strokeStyle = 'rgba(232, 137, 43, 0.7)';
  ctx.strokeRect(m, m, css - 2 * m, css - 2 * m);
  return true;
}

let queue = [];
let running = false;

/**
 * Draw every `canvas[data-thumb]` under `root`: the cards whose scheme is ready at once, the rest one per
 * animation frame (a frame that makes a layout is not asked for a second one).
 */
export function fillThumbs(root) {
  const todo = [];
  for (const cv of root.querySelectorAll('canvas[data-thumb]')) {
    if (schemeReady(cv.dataset.thumb)) drawThumb(cv, cv.dataset.thumb); else todo.push(cv);
  }
  queue = todo;
  if (running || !todo.length) return;
  running = true;
  // one scheme per animation frame; a hidden tab gets no frames, so a timer backs each step up
  const next = () => {
    let started = false;
    const go = () => { if (!started) { started = true; step(); } };
    requestAnimationFrame(go);
    setTimeout(go, 80);
  };
  const step = () => {
    const cv = queue.shift();
    if (cv && cv.isConnected) drawThumb(cv, cv.dataset.thumb);
    if (queue.length) next(); else running = false;
  };
  next();
}
