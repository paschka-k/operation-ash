import { test, assert } from '../harness.mjs';
import { FLEET, PLACES, pickVehicle, vehicleOf } from '../../src/core/fleet.js';

// The thirteen models of the set (interfaces.md, "Машины").
const IDS = ['semi', 'roadster08', 'roadster17', 'roadster26', 'model3', 'modelS', 'modelX', 'modelY', 'badger', 'cyberbus', 'cyber3', 'cyberroadster', 'cybertruck'];
const SLOTS = ['car', 'sport', 'van', 'bus', 'truck'];

// Open data of the prototypes, metres: [length, width without mirrors, height, wheelbase].
// Sources (read 2026-11-20): Tesla owner's manuals and spec catalogues (auto-data.net, evspecifications.com,
// iseecars.com, dimensions.com, motormatchup.com, cararac.com), the Roadster (2008) article on Wikipedia.
// Where no maker data exists (the second-generation Roadster, the custom builds), the estimate named here.
const PROTO = {
  semi: [6.71, 2.59, 4.0, 3.96],             // motormatchup 264 in / 102 in / wheelbase 156 in; dimensions.com height 3.96-4.11 m
  roadster08: [3.946, 1.873, 1.127, 2.352],  // Wikipedia: 3946 / 1873 / 1127 / 2352 mm
  roadster17: [4.2, 2.0, 1.2, 2.8],          // cararac (second generation, unofficial): 4200 / 2000 / 1200 / 2800 mm
  roadster26: [4.2, 2.0, 1.2, 2.8],          // no published figures for the 2026 reveal: same platform as the 2017 prototype
  model3: [4.72, 1.85, 1.441, 2.875],        // Model 3 (2024+): 4720 / 1850 / 1441 / 2875 mm
  modelS: [5.021, 1.963, 1.431, 2.96],       // Model S (2025): 5021 / 1963 / 1431 / 2960 mm
  modelX: [5.057, 1.999, 1.68, 2.965],       // Model X (2025): 5057 / 1999 / 1680 / 2965 mm
  modelY: [4.79, 1.92, 1.624, 2.89],         // Model Y (2025+): 4790 / 1920 / 1624 / 2890 mm
  badger: [4.9, 1.95, 2.1, 2.875],           // no published figures: estimate from the SEMA photo, donor Model 3 wheelbase
  cyberbus: [10.4, 2.5, 3.0, 5.6],           // no such product: the BADGER style stretched to the block's bus place (10.4 m)
  cyber3: [4.72, 1.85, 1.441, 2.875],        // a Model 3 rebodied (TSK club): donor dimensions
  cyberroadster: [4.72, 2.08, 1.16, 2.875],  // Model 3 based; body 9 in wider, roofline 11 in lower (press reports)
  cybertruck: [5.683, 2.032, 1.793, 3.635],  // Tesla: 223.7 in / 80 in / 70.6 in / 143.1 in
};

const within = (v, ref, k = 0.1) => Math.abs(v - ref) <= ref * k + 1e-9;
// the widest point of a model: its body, or the tyres where they stand out of it
const fits = (v, w, d) => v.length <= Math.max(w, d) + 1e-9 && Math.max(v.width, v.wheelSpan ?? 0) <= Math.min(w, d) + 1e-9;

// Ground clearance, metres (read 2026-11-20): Model 3 5.5 in (getjerry.com, Tesla), Model S about 4.6-5.3 in
// (getjerry.com), Model Y 6.6 in (tesla.com Model Y spec page), Model X 6.6 in at medium ride height and more
// when raised (getjerry.com, basenor.com). The beltline (the foot of the side windows) is not published: a
// crossover's sits higher, a saloon's lower, and the side glass of all four is 0.35-0.65 m tall.
const CLEARANCE = { model3: 0.14, modelS: 0.13, modelY: 0.167, modelX: 0.17 };

test('fleet: the thirteen models, each with a slot and plain sizes', () => {
  assert.deepEqual(FLEET.map((v) => v.id).sort(), [...IDS].sort());
  for (const v of FLEET) {
    assert.ok(SLOTS.includes(v.slot), v.id + ': slot ' + v.slot);
    for (const k of ['length', 'width', 'height', 'wheelbase', 'wheelR']) assert.ok(Number.isFinite(v[k]) && v[k] > 0, v.id + ': ' + k);
    assert.ok(v.wheelbase < v.length, v.id + ': wheelbase inside the body');
    assert.ok(v.wheelR * 2 < v.height, v.id + ': wheels lower than the roof');
    assert.equal(typeof v.look, 'object', v.id + ': look');
    assert.equal(vehicleOf(v.id), v);
  }
  assert.equal(vehicleOf('nope'), null);
});

test('fleet: every model is within 10 % of its prototype in length, width, height and wheelbase', () => {
  for (const id of IDS) {
    const v = vehicleOf(id), [L, W, H, B] = PROTO[id];
    assert.ok(v, id + ' is in the set');
    assert.ok(within(v.length, L), `${v.id}: length ${v.length} vs ${L}`);
    assert.ok(within(v.width, W), `${v.id}: width ${v.width} vs ${W}`);
    assert.ok(within(v.height, H), `${v.id}: height ${v.height} vs ${H}`);
    assert.ok(within(v.wheelbase, B), `${v.id}: wheelbase ${v.wheelbase} vs ${B}`);
  }
});

test('fleet: Model X and Y are tall crossovers, Model 3 and S low saloons, the four told apart from the side', () => {
  const [m3, mS, mX, mY] = ['model3', 'modelS', 'modelX', 'modelY'].map(vehicleOf);
  for (const v of [m3, mS, mX, mY]) {
    assert.ok(Number.isFinite(v.clearance) && Number.isFinite(v.belt), v.id + ': ground clearance and beltline in the catalogue');
    assert.ok(within(v.clearance, CLEARANCE[v.id], 0.25), `${v.id}: clearance ${v.clearance} vs ${CLEARANCE[v.id]}`);
    assert.ok(v.belt > v.wheelR * 2 && v.belt < v.height, v.id + ': the beltline between the wheel tops and the roof');
    const glass = v.height - v.belt;
    assert.ok(glass >= 0.35 && glass <= 0.65, `${v.id}: side glass ${glass.toFixed(2)} m tall`);
  }
  // the open data: Model 3 and S about 1.44 m, Model Y about 1.62 m, Model X about 1.68 m
  for (const low of [m3, mS]) {
    for (const tall of [mX, mY]) {
      assert.ok(tall.height >= low.height + 0.15, `${tall.id} (${tall.height}) at least 0.15 m taller than ${low.id} (${low.height})`);
      assert.ok(tall.belt >= low.belt + 0.08, `${tall.id}: the beltline ${tall.belt} well above ${low.id}'s ${low.belt}`);
      assert.ok(tall.clearance > low.clearance, `${tall.id}: more ground clearance than ${low.id}`);
    }
  }
  assert.ok(mX.height > mY.height, 'Model X is the tallest of the four');
  assert.ok(mS.length >= m3.length + 0.2, 'Model S is a longer car than Model 3');
  // no two of the four share a side view: length or height differ by 5 cm at least
  const four = [m3, mS, mX, mY];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = four[i], b = four[j];
      assert.ok(Math.abs(a.length - b.length) >= 0.05 || Math.abs(a.height - b.height) >= 0.05, a.id + ' and ' + b.id + ' look the same from the side');
    }
  }
});

test('fleet: the CyberRoadster stands on huge rear tyres that stick out of its body', () => {
  const v = vehicleOf('cyberroadster');
  assert.ok(Number.isFinite(v.rearWheelR), 'a rear wheel of its own');
  assert.ok(v.rearWheelR >= v.wheelR * 1.08, `rear tyre ${v.rearWheelR} m against the front ${v.wheelR} m: not much bigger`);
  assert.ok(Array.isArray(v.tyreW) && v.tyreW.length === 2, 'tyre widths [front, rear]');
  assert.ok(v.tyreW[1] >= v.tyreW[0] * 1.25, `rear tyre ${v.tyreW[1]} m wide against the front ${v.tyreW[0]} m`);
  assert.ok(v.wheelSpan > v.width + 0.1, `the rear tyres (${v.wheelSpan} m outside) stand out of the body (${v.width} m)`);
  assert.ok(v.rearWheelR * 2 < v.height, 'the rear tyres stay under the roll bar');
  // the place keeps its collider: the model still fits the street place of a sports car
  assert.ok(PLACES.sport.some((p) => fits(v, p.w, p.d)), 'the CyberRoadster with its tyres fits a street place');
});

test('fleet: every model fits at least one place of its class', () => {
  for (const s of SLOTS) assert.ok(Array.isArray(PLACES[s]) && PLACES[s].length > 0, 'places of ' + s);
  for (const v of FLEET) {
    assert.ok(PLACES[v.slot].some((p) => fits(v, p.w, p.d)), v.id + ' fits no ' + v.slot + ' place');
  }
  // the places the maps really have: a car of the block or of a layout (collider 4.3 x 1.8), the bus of the block
  assert.ok(PLACES.car.some((p) => p.w >= 4.3 && p.d >= 1.8 && p.w <= 5 && p.d <= 2.5), 'the street place of a car');
  assert.ok(PLACES.bus.some((p) => p.w >= 10.4 && p.d >= 2.6), 'the bus place of the block');
});

test('fleet: pickVehicle is deterministic and never picks a model larger than the place', () => {
  const sizes = [[4.9, 2.4], [2.4, 4.9], [5.4, 2.4], [6.2, 2.6], [11, 3.2], [7.4, 3.2], [4.3, 2.1], [3.9, 2.0], [12, 4]];
  let found = 0;
  for (const slot of SLOTS) {
    for (const [w, d] of sizes) {
      for (let seed = 0; seed < 40; seed++) {
        const id = pickVehicle(slot, w, d, seed);
        assert.equal(pickVehicle(slot, w, d, seed), id, 'same answer twice');
        if (id === null) { assert.ok(!FLEET.some((v) => fits(v, w, d)), `${slot} ${w}x${d}: null although something fits`); continue; }
        assert.ok(fits(vehicleOf(id), w, d), `${slot} ${w}x${d} seed ${seed}: ${id} is larger than the place`);
        found++;
      }
    }
  }
  // the car place of a street (4.9 x 2.4) and the bus place always get a model
  assert.ok(found > SLOTS.length * 40 * 5, 'models were found for the places: ' + found);
});

test('fleet: pickVehicle keeps to the asked class when one of it fits, turns the place, and gives up on a box', () => {
  for (let seed = 0; seed < 30; seed++) {
    assert.equal(vehicleOf(pickVehicle('bus', 11, 3.2, seed)).slot, 'bus');
    assert.equal(vehicleOf(pickVehicle('truck', 7.4, 3.2, seed)).slot, 'truck');
    assert.equal(vehicleOf(pickVehicle('car', 4.9, 2.4, seed)).slot, 'car');
    assert.equal(pickVehicle('car', 4.9, 2.4, seed), pickVehicle('car', 2.4, 4.9, seed), 'a place turned by a quarter is the same place');
  }
  const seen = new Set();
  for (let seed = 0; seed < 60; seed++) seen.add(pickVehicle('car', 4.9, 2.4, seed));
  assert.ok(seen.size >= 3, 'different seeds give different cars: ' + [...seen]);
  assert.equal(pickVehicle('car', 1, 1, 7), null);
  assert.equal(pickVehicle('bus', 4.9, 2.4, 3) === null, false, 'no bus fits a car place: another class that fits');
});
