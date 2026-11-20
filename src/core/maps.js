// core/maps: the ten maps, their order over the waves and the choice of the next map in the shop.
// Pure: works on the game state of core/waves (g.map, g.shop, g.checkpoint).
//
//   defaultMapFor(7)          -> 'winter'        wave N plays on map N, the endless mode starts over
//   mapChoiceOpen(6, false)   -> true            the shop after wave 5 lets the player pick
//   chooseMap(g, 'desert')    -> {ok: true}      or {ok: false, reason: 'closed' | 'unknown'}
//
// 'block' is the hand-built city block of src/world/level.js; the other nine are generated from data
// (core/mapgen). The names and the one-line themes are in config.js under map_<id> and mapTheme_<id>.

import { MAP_CHOICE_FROM_WAVE } from './rules.js';

export { MAP_CHOICE_FROM_WAVE };

/** The maps in the order of waves 1-10. */
export const MAP_IDS = ['block', 'port', 'factory', 'oldtown', 'railyard', 'airfield', 'winter', 'night', 'desert', 'construction'];

/** One row per map: the keys of its name and theme line in config.js, and its place in the order (1-10). */
export const MAPS = MAP_IDS.map((id, i) => ({ id, nameKey: 'map_' + id, themeKey: 'mapTheme_' + id, order: i + 1 }));

/** The map wave `wave` gets when nobody picks: map ((wave - 1) mod 10) + 1, in the endless mode too. */
export function defaultMapFor(wave, endless = false) {
  const n = Math.max(1, Math.floor(wave) || 1);
  return MAP_IDS[(n - 1) % MAP_IDS.length];
}

/** Can the player pick the map of wave `nextWave`? From MAP_CHOICE_FROM_WAVE on, and always when endless. */
export function mapChoiceOpen(nextWave, endless = false) {
  return !!endless || nextWave >= MAP_CHOICE_FROM_WAVE;
}

/** Pick the map of the next wave in the shop. leaveShop() takes it into g.map and the checkpoint. */
export function chooseMap(g, id) {
  if (!MAP_IDS.includes(id)) return { ok: false, reason: 'unknown' };
  if (g.phase !== 'shop' || !g.shop || !mapChoiceOpen(g.wave + 1, g.endless)) return { ok: false, reason: 'closed' };
  g.shop.map = id;
  return { ok: true };
}
