// Changing the map between waves (wave 15). The old map goes completely (bots, riders, wrecks, grenades,
// effects, props, scatter, static level), the new one is built, lit, compiled and photographed from above,
// and the player stands on its start. Behind a loading screen "Loading map: <name>".
//
//   await switchMap(game, 'port')     always rebuilds
//   await ensureMap(game, 'block')    only when another map is on screen; resolves true when it switched
//   snapMap(game)                     game.mapView = {mapId, half, image} for the big map and the radar
//
// The caller decides the game state afterwards (Game.leaveShop, startGame, revive in main.js).

import { buildLevel } from '../world/level.js';
import { createScatter } from '../world/scatter.js';
import { t } from '../config.js';

/** The street lamps of a map for the renderer's lamp lights: the layout's, or the block's standing posts. */
export function mapLamps(world) {
  if (world.layout) return world.layout.lamps.map((l) => ({ x: l.x, y: l.y, z: l.z, color: l.color }));
  return (world.lampList || []).filter((l) => !l.fallen).map((l) => ({ x: l.x + 0.6, y: 5.4, z: l.z }));
}

/** The picture from above of the map on screen (null when it cannot be taken: the maps draw the footprints). */
export function snapMap(game) {
  const w = game.world;
  let image = null;
  try { image = game.gr.renderTopDown(w.half); } catch (e) { image = null; }
  game.mapView = { mapId: w.mapId, half: w.half, image };
  return game.mapView;
}

/** Let the browser draw the loading screen once (a hidden tab draws nothing: then a short timer does). */
function paint() {
  return new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; setTimeout(resolve, 0); } };
    requestAnimationFrame(go);
    setTimeout(go, 60);
  });
}

/**
 * Throw the map on screen away and build `mapId`. Returns a promise; a second call while one runs gets
 * the same promise. The game stays in the state 'loading' until the caller sets its own.
 */
export function switchMap(game, mapId) {
  if (game.switching) return game.switching;
  const run = async () => {
    const t0 = performance.now();
    const gr = game.gr, hud = game.hud;
    game.state = 'loading';
    if (game.bigMap && game.bigMap.isOpen) game.bigMap.close();
    hud.bossBar(null);
    hud.showScreen('loading');
    hud.setLoading(0.15, t('mapLoading', { name: t('map_' + mapId) }));
    await paint();
    const t1 = performance.now();

    // everything that lives on the old map
    game.enemies.clear();          // bots, riders, vehicles, wrecks, engine voices
    game.grenades.clear();
    game.fx.clear();               // particles, fires, bullet holes, tracers
    game.props.clear();            // crates, barrels, supply points (the pools stay)
    if (game.scatter) {
      gr.removeNoAO(game.scatter.group);
      game.scatter.dispose();
      game.scatter = null;
    }
    game.world.dispose();

    // the new map: static level, props, spawn and cover points; litter; its light and weather
    buildLevel(gr.scene, game, mapId);
    game.scatter = createScatter(gr.scene, game.world, game.settings.quality);
    gr.addNoAO(game.scatter.group);
    gr.applyAtmosphere(game.world.layout ? game.world.layout.atmosphere : mapId);
    gr.setLampLights(mapLamps(game.world));
    gr.prepareScene();
    game.player.reset();
    game.player.updateCamera(0);
    const t2 = performance.now();
    snapMap(game);
    gr.renderer.compile(gr.scene, gr.camera);
    hud.setLoading(1, t('mapLoading', { name: t('map_' + mapId) }));
    const t3 = performance.now();
    game.lastSwitch = { mapId, ms: Math.round(t3 - t0), build: Math.round(t2 - t1), snapAndCompile: Math.round(t3 - t2) };
    console.info(`[map] ${mapId}: ${game.lastSwitch.ms} ms (build ${game.lastSwitch.build}, picture and shaders ${game.lastSwitch.snapAndCompile})`);
  };
  const p = run().finally(() => { game.switching = null; });
  game.switching = p;
  return p;
}

/** switchMap only when `mapId` is not the map on screen. Resolves true when it switched. */
export function ensureMap(game, mapId) {
  if (game.switching) return game.switching.then(() => ensureMap(game, mapId));
  if (game.world && game.world.mapId === mapId) return Promise.resolve(false);
  return switchMap(game, mapId).then(() => true);
}
