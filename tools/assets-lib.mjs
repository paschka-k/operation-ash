// Shared helpers for the asset scripts. Everything here talks to the public Poly Haven
// API (https://api.polyhaven.com, assets are CC0). Nothing runs unless you call a script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API = 'https://api.polyhaven.com';
export const UA = { 'User-Agent': 'ruined-block-fps asset fetcher (CC0 assets)' };

/** Which Poly Haven texture feeds which surface kind of the game. */
export const TEXTURE_MAP = {
  concrete: 'concrete_wall_008',
  plaster: 'worn_plaster_wall',
  brick: 'red_brick_03',
  asphalt: 'asphalt_floor',
  dirt: 'gravel_ground_01',
  wood: 'weathered_brown_planks',
  metal: 'rusty_metal_02',
  container: 'rusty_corrugated_iron',
  sandbag: 'hessian_230',
};

/** Which Poly Haven model feeds which prop. ammo_box has no scan and stays procedural. */
export const MODEL_MAP = {
  barrel: 'Barrel_01',
  crate: 'wooden_crate_01',
  cardboard_box: 'cardboard_box_01',
  concrete_barrier: 'concrete_road_barrier',
  covered_car: 'covered_car',
};

export async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function getFiles(id) { return getJson(`${API}/files/${id}`); }

export async function download(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export function mb(bytes) { return (bytes / 1048576).toFixed(2) + ' MB'; }

export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

/** Rewrite assets/manifest.json from the files that exist in assets/textures and assets/models. */
export function writeManifest() {
  const files = [];
  for (const dir of ['textures', 'models']) {
    const full = path.join(root, 'assets', dir);
    if (fs.existsSync(full)) for (const f of fs.readdirSync(full)) files.push(f);
  }
  ensureDir(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
  return files;
}
