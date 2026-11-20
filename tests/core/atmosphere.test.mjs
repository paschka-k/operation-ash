import { test, assert, near } from '../harness.mjs';
import { ATMOSPHERES, atmosphereFor, sunDirection, WEATHER_KINDS } from '../../src/core/atmosphere.js';

// The ids of the ten maps, in wave order (MAP_IDS of core/maps.js, interfaces.md).
const IDS = ['block', 'port', 'factory', 'oldtown', 'railyard', 'airfield', 'winter', 'night', 'desert', 'construction'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isColor = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;

function checkPreset(id, a) {
  const at = (path, ok) => assert.ok(ok, `${id}: ${path}`);
  at('sun.elevation', isNum(a.sun.elevation) && a.sun.elevation > 0 && a.sun.elevation < 90);
  at('sun.azimuth', isNum(a.sun.azimuth) && a.sun.azimuth >= 0 && a.sun.azimuth < 360);
  at('sun.color', isColor(a.sun.color));
  at('sun.intensity', isNum(a.sun.intensity) && a.sun.intensity > 0);
  for (const k of ['turbidity', 'rayleigh', 'mie', 'mieG', 'clouds', 'cloudDensity']) at('sky.' + k, isNum(a.sky[k]) && a.sky[k] >= 0);
  at('sky.mieG', a.sky.mieG < 1);
  if (a.sky.gain !== undefined) at('sky.gain', isNum(a.sky.gain) && a.sky.gain > 0 && a.sky.gain <= 1);
  if (a.sky.clamp !== undefined) at('sky.clamp', isNum(a.sky.clamp) && a.sky.clamp > 0 && a.sky.clamp <= 6);
  at('hemi.sky', isColor(a.hemi.sky));
  at('hemi.ground', isColor(a.hemi.ground));
  at('hemi.intensity', isNum(a.hemi.intensity) && a.hemi.intensity > 0);
  at('fog.color', isColor(a.fog.color));
  at('fog.density', isNum(a.fog.density) && a.fog.density > 0 && a.fog.density < 0.05);
  at('env.intensity', isNum(a.env.intensity) && a.env.intensity > 0);
  at('exposure', isNum(a.exposure) && a.exposure > 0);
  at('bounce', isColor(a.bounce));
  at('grade.saturation', isNum(a.grade.saturation));
  at('grade.contrast', isNum(a.grade.contrast));
  at('grade.vignette', isNum(a.grade.vignette));
  if (a.grade.tint !== undefined) at('grade.tint', Array.isArray(a.grade.tint) && a.grade.tint.length === 3 && a.grade.tint.every(isNum));
  at('weather.kind', WEATHER_KINDS.includes(a.weather.kind));
  at('weather.intensity', isNum(a.weather.intensity) && a.weather.intensity >= 0 && a.weather.intensity <= 1);
  at('night', typeof a.night === 'boolean');
  at('lampLights', Number.isInteger(a.lampLights) && a.lampLights >= 0 && a.lampLights <= 4);
  for (const k of ['sun', 'sky', 'fill']) at('view.' + k, isNum(a.view[k]) && a.view[k] >= 0);
  for (const k of ['sunColor', 'skyColor', 'groundColor', 'fillColor']) at('view.' + k, isColor(a.view[k]));
}

test('every map has a complete atmosphere preset', () => {
  for (const id of IDS) {
    assert.ok(ATMOSPHERES[id], 'no atmosphere for ' + id);
    checkPreset(id, ATMOSPHERES[id]);
  }
  assert.deepEqual(Object.keys(ATMOSPHERES).sort(), [...IDS].sort(), 'one preset per map, nothing else');
});

test('weather and night where the maps ask for them', () => {
  assert.equal(ATMOSPHERES.winter.weather.kind, 'snow');
  assert.equal(ATMOSPHERES.construction.weather.kind, 'rain');
  assert.equal(ATMOSPHERES.desert.weather.kind, 'dust');
  for (const id of ['winter', 'construction', 'desert']) assert.ok(ATMOSPHERES[id].weather.intensity > 0, id + ' weather is on');
  assert.equal(ATMOSPHERES.night.night, true);
  assert.equal(ATMOSPHERES.night.lampLights, 4);
  for (const id of IDS.filter((i) => i !== 'night')) assert.equal(ATMOSPHERES[id].night, false, id + ' is a day map');
  assert.equal(ATMOSPHERES.block.weather.kind, 'none');
  assert.equal(ATMOSPHERES.block.lampLights, 0);
});

test('every map has its own sun, sky and fog', () => {
  const seen = new Set();
  for (const id of IDS) {
    const a = ATMOSPHERES[id];
    const key = [a.sun.elevation, a.sun.azimuth, a.sun.color, a.sky.turbidity, a.fog.color, a.fog.density].join('/');
    assert.ok(!seen.has(key), id + ' repeats another map');
    seen.add(key);
  }
});

// The wave 14 renderer (pipeline.js at e3e6751) in numbers: the "block" preset is that look,
// except for the haze (R02.6).
test('the block keeps the light of wave 14', () => {
  const b = ATMOSPHERES.block;
  assert.deepEqual(b.sun, { elevation: 17, azimuth: 250, color: 0xffc896, intensity: 4.2 });
  for (const [k, v] of Object.entries({ turbidity: 3.5, rayleigh: 1.6, clouds: 0.55, cloudDensity: 0.5 })) assert.equal(b.sky[k], v, 'sky.' + k);
  assert.equal(b.sky.gain, undefined, 'the sky is not dimmed');
  assert.deepEqual(b.hemi, { sky: 0xa8bcd8, ground: 0x6b5a48, intensity: 0.9 });
  assert.deepEqual(b.env, { intensity: 1.25 });
  assert.equal(b.exposure, 0.72);
  assert.equal(b.bounce, 0x7a6650);
  assert.deepEqual(b.grade, { saturation: 0.98, contrast: 1.12, vignette: 0.55 });
  assert.deepEqual(b.view, { sun: 3.0, sky: 0.9, fill: 0.8, sunColor: 0xffd2a6, skyColor: 0xb8c8e0, groundColor: 0x4a3a2a, fillColor: 0xc8d4e6 });
});

// R02.6: against the low sun the block stood in a milky haze. Wave 14 had mie 0.003, fog 0xa39d97
// at 0.0072 and the sky clamped at 6, twice the bloom threshold (3), so the whole glow around the
// sun bloomed over the buildings in front of it.
test('the block has no milky haze against the sun', () => {
  const b = ATMOSPHERES.block;
  assert.ok(b.sky.mie < 0.003, 'a smaller glow around the sun');
  assert.ok(b.sky.mieG > 0.95, 'and a tighter one');
  assert.ok(b.sky.clamp !== undefined && b.sky.clamp < 3, 'the sky away from the sun stays under the bloom threshold');
  assert.ok(b.fog.density < 0.0072, 'thinner fog');
  const lum = (c) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
  assert.ok(lum(b.fog.color) < lum(0xa39d97), 'darker fog');
});

test('sun direction from elevation and azimuth', () => {
  // 17 degrees up, azimuth 250: x = cos17 sin250, y = sin17, z = cos17 cos250
  const d = sunDirection(ATMOSPHERES.block);
  near(d.x, -0.8986, 1e-4, 'x');
  near(d.y, 0.2924, 1e-4, 'y');
  near(d.z, -0.3271, 1e-4, 'z');
  const up = sunDirection({ sun: { elevation: 90, azimuth: 0 } });
  near(up.y, 1, 1e-9, 'straight up');
});

test('an unknown map falls back to the block', () => {
  assert.ok(atmosphereFor('nowhere') && atmosphereFor('nowhere').sun, 'a preset comes back');
  assert.equal(atmosphereFor('nowhere'), ATMOSPHERES.block);
  assert.equal(atmosphereFor('night'), ATMOSPHERES.night);
});
