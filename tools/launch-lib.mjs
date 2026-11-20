// Pure helpers of the launcher (tools/play.mjs). No window, no server, no file access here: everything the
// launcher decides is a function of its arguments, so tests/tools/launch.test.mjs can check it.
import { gpuInfo } from '../src/core/gpu.js';

const FAST_KEY = '--force_high_performance_gpu';

/**
 * Command line of the game window: an app window (no tabs, no address bar) with the launcher's own
 * profile, so the player's everyday browser, its profile and its flags stay untouched. choice 'high'
 * adds the one key that makes Chrome and Edge draw on the fast graphics card; anything else adds nothing.
 */
export function browserArgs({ choice, profile, url } = {}) {
  const args = [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (choice === 'high') args.push(FAST_KEY);
  return args;
}

/**
 * The graphics cards the player can pick between, from the names Windows reports (Win32_VideoController).
 * [{id: 'high', name, kind}, {id: 'default', name, kind}]: 'high' is the card the browser is told to use
 * (the first discrete one), 'default' is what Windows picks for a browser (the built-in graphics). With
 * one usable card there is only 'default'; with none, an empty list. The software adapter, empty names
 * and virtual displays are not cards.
 */
export function gpuOptions(names) {
  const cards = [];
  for (const raw of Array.isArray(names) ? names : []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const info = gpuInfo(raw);
    if (info.kind === 'software') continue;
    cards.push({ name: info.name, kind: info.kind, virtual: /virtual|remote|indirect|parsec\b/i.test(raw) });
  }
  const real = cards.filter((c) => !c.virtual);
  const pool = real.length ? real : cards;
  const strip = ({ name, kind }) => ({ name, kind });
  const fast = pool.find((c) => c.kind === 'discrete');
  const rest = pool.filter((c) => c !== fast);
  const std = rest.find((c) => c.kind === 'integrated') || rest.find((c) => c.kind === 'unknown') || rest[0];
  if (fast && std) return [{ id: 'high', ...strip(fast) }, { id: 'default', ...strip(std) }];
  const only = fast || std;
  return only ? [{ id: 'default', ...strip(only) }] : [];
}

/** The choice that is really used: the saved one if this machine offers it, else the fast card when there is one, else 'default'. */
export function effectiveChoice(saved, options) {
  const ids = (options || []).map((o) => o.id);
  if (saved && ids.includes(saved)) return saved;
  return ids.includes('high') ? 'high' : 'default';
}

/** Does this Origin header belong to the launcher's own page (the only page allowed to give commands)? */
export function originAllowed(origin, port) {
  if (typeof origin !== 'string') return false;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/** Does this Host header name the launcher's own address (keeps other sites off through DNS rebinding)? */
export function hostAllowed(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Chrome first, then Edge: {name, path} of the first one that exists, or null. `exists(path)` is passed in. */
export function findBrowser(env, exists) {
  const e = env || {};
  const sep = '\\';
  const join = (base, rest) => base.replace(/[\\/]+$/, '') + sep + rest;
  const roots = [e.PROGRAMFILES, e['PROGRAMFILES(X86)'], e.PROGRAMW6432, e.LOCALAPPDATA].filter(Boolean);
  const list = [
    ['chrome', 'Google\\Chrome\\Application\\chrome.exe'],
    ['edge', 'Microsoft\\Edge\\Application\\msedge.exe'],
  ];
  for (const [name, rel] of list) {
    for (const r of roots) {
      const p = join(r, rel);
      if (exists(p)) return { name, path: p };
    }
  }
  return null;
}
