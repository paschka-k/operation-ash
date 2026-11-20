// The launcher: npm run play, or a double click on play-windows.cmd. No dependencies, nothing downloaded.
//   1. serves the game on 127.0.0.1 (free port from 5180) like server.mjs;
//   2. opens it in Chrome (else Edge) as an app window with its own profile in %LOCALAPPDATA%\OperationAsh\browser,
//      with the key --force_high_performance_gpu when the fast graphics card is chosen;
//   3. answers the game's settings: GET /launcher/info (cards of this system, current choice) and
//      POST /launcher/gpu {choice} (saves the choice in launcher.json and restarts the window).
// It writes nothing to the registry or Windows settings and does not touch the player's own browser profile:
// the only things it runs are the browser exe it found and PowerShell Get-CimInstance for the card list.
// The window closing ends the launcher. Without Chrome and Edge it says so in one line and opens the
// default browser (the graphics card then is the browser's own choice); Ctrl+C ends it.
// Options: --dry (print what would run, start nothing), --port N. Env: OPERATION_ASH_HOME (folder for profile and launcher.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './serve-lib.mjs';
import { browserArgs, gpuOptions, effectiveChoice, originAllowed, hostAllowed, findBrowser } from './launch-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const portArg = argv.indexOf('--port') >= 0 ? Number(argv[argv.indexOf('--port') + 1]) : 0;
const FIRST_PORT = 5180;
const PORT_TRIES = 20;

const home = process.env.OPERATION_ASH_HOME
  || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'OperationAsh') : path.join(os.homedir(), '.operation-ash'));
const profile = path.join(home, 'browser');
const configFile = path.join(home, 'launcher.json');

const say = (s) => console.log('[ash] ' + s);

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')) || {}; } catch (e) { return {}; }
}
function writeConfig(cfg) {
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + '\n');
}

/** Names of the video controllers (Win32_VideoController) through PowerShell; empty off Windows or on failure. */
function controllerNames() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve([]); return; }
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }'],
      { timeout: 20000, windowsHide: true }, (err, out) => {
        resolve(err ? [] : String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      });
  });
}

function listen(server) {
  const tries = portArg ? [portArg] : Array.from({ length: PORT_TRIES }, (_, i) => FIRST_PORT + i);
  return new Promise((resolve, reject) => {
    const next = (i) => {
      if (i >= tries.length) { reject(new Error('нет свободного порта')); return; }
      const onError = (e) => { server.off('listening', onOk); if (e.code === 'EADDRINUSE') next(i + 1); else reject(e); };
      const onOk = () => { server.off('error', onError); resolve(tries[i]); };
      server.once('error', onError);
      server.once('listening', onOk);
      server.listen(tries[i], '127.0.0.1');
    };
    next(0);
  });
}

function openDefaultBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch (e) { /* the address is printed */ }
}

const names = await controllerNames();
const options = gpuOptions(names);
const found = findBrowser(process.env, (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
let choice = effectiveChoice(readConfig().choice, options);

if (dry) {
  console.log(JSON.stringify({
    browser: found, choice, gpus: options, home,
    args: found ? browserArgs({ choice, profile, url: `http://127.0.0.1:${FIRST_PORT}/` }) : null,
  }, null, 2));
  process.exit(0);
}

// ---- the window
let child = null;
let restarting = false;
let url = '';
let seen = null;       // what the game said it renders on (debug aid, see /launcher/seen)

function killTree(c) {
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch (e) { /* gone already */ }
  } else { try { c.kill(); } catch (e) { /* gone already */ } }
}

function openWindow() {
  const started = Date.now();
  const c = spawn(found.path, browserArgs({ choice, profile, url }), { stdio: 'ignore' });
  child = c;
  c.on('exit', () => {
    if (restarting || child !== c) return;
    if (Date.now() - started < 3000) say('окно закрылось сразу: профиль занят другим запуском игры?');
    shutdown();
  });
  c.on('error', (e) => { say('не удалось открыть ' + found.name + ': ' + e.message); shutdown(); });
}

/** Close the window and open a new one with the current choice. */
function restartWindow() {
  if (!child || restarting) return;
  restarting = true;
  const old = child;
  old.once('exit', () => {
    setTimeout(() => { restarting = false; openWindow(); }, 500);
  });
  killTree(old);
}

// ---- the server and its routes
const MAX_BODY = 2048;
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > MAX_BODY) { req.destroy(); resolve(null); } });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

let port = 0;
const server = createGameServer(root, (req, res, u) => {
  if (!u.pathname.startsWith('/launcher/')) return false;
  if (!hostAllowed(req.headers.host, port)) { json(res, 403, { error: 'host' }); return true; }
  if (u.pathname === '/launcher/info' && req.method === 'GET') {
    json(res, 200, { launcher: true, gpus: options, choice, browser: found ? found.name : null, seen });
    return true;
  }
  if (req.method === 'POST' && (u.pathname === '/launcher/gpu' || u.pathname === '/launcher/seen')) {
    if (!originAllowed(req.headers.origin, port)) { json(res, 403, { error: 'origin' }); return true; }
    readBody(req).then((body) => {
      if (!body || typeof body !== 'object') { json(res, 400, { error: 'body' }); return; }
      if (u.pathname === '/launcher/seen') {
        seen = String(body.renderer || '').slice(0, 300);
        say('игра рисует на: ' + seen);
        json(res, 200, { ok: true });
        return;
      }
      if (!options.some((o) => o.id === body.choice)) { json(res, 400, { error: 'choice' }); return; }
      const changed = body.choice !== choice;
      choice = body.choice;
      try { writeConfig({ ...readConfig(), choice }); } catch (e) { say('не удалось записать launcher.json: ' + e.message); }
      json(res, 200, { ok: true, choice, restarting: changed && !!found });
      if (changed && found) { say('видеокарта: ' + choice + ', окно перезапускается'); restartWindow(); }
    });
    return true;
  }
  json(res, 404, { error: 'not found' });
  return true;
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  if (server.closeAllConnections) server.closeAllConnections();
  setTimeout(() => process.exit(0), 100);
}
process.on('SIGINT', () => { if (child) killTree(child); shutdown(); });
process.on('SIGTERM', () => { if (child) killTree(child); shutdown(); });

try { port = await listen(server); } catch (e) { say('сервер не запустился: ' + e.message); process.exit(1); }
url = `http://127.0.0.1:${port}/`;
say('игра: ' + url);
if (options.length) say('видеокарты: ' + options.map((o) => `${o.name} [${o.id}]`).join(', ') + '; выбрано: ' + choice);
if (found) {
  say('окно: ' + found.name + (choice === 'high' ? ', быстрая видеокарта' : ''));
  openWindow();
} else {
  say('Chrome и Edge не найдены: выбрать видеокарту нечем, открываю игру браузером по умолчанию (Ctrl+C — выход).');
  openDefaultBrowser(url);
}
