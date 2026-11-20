// The parked vehicles of the maps (wave 15, G05-G14): a catalogue of sizes and looks, no geometry.
// world/fleet.js builds each model from these numbers; the maps ask pickVehicle for a model that fits
// the place they have. Pure data and functions: no three.js, no DOM.
//
//   FLEET                          [{id, slot, length, width, height, wheelbase, wheelR, look}]
//   vehicleOf(id)                  the entry of a model, or null
//   PLACES[slot]                   the places of each class the maps really have: [{name, w, d}]
//   placeOf(w, d)                  the place around a collider footprint: PLACE_MARGIN free on every side
//   pickVehicle(slot, w, d, seed)  a model that fits a place w x d (either way round), or null
//   pickPaint(id, seed)            a paint name of PAINTS that the model comes in
//
// Sizes are metres: length along the vehicle, width of the body without mirrors, height to the roof (to
// the top of the roll bar on an open car), wheelbase from the front axle to the rear one (to the middle
// of the rear pair on the three-axle tractor), wheelR the outer radius of a tyre.
// The four saloons and crossovers also carry their side view: clearance (ground to the sill) and belt (the
// foot of the side windows at the middle doors); world/fleet.js lofts their bodies from these numbers.
// A model on wheels of two sizes carries rearWheelR, tyreW [front, rear] and wheelSpan (outside of the
// rear tyres when they stand out of the body); a place must take the wider of width and wheelSpan.
//
// The prototypes, as published (read 2026-11-20). Every model stays within 10 % of these numbers
// (tests/core/fleet.test.mjs holds the same table and checks it):
//   Semi (tractor)      6710 x 2590 x 4000, wheelbase 3960 mm - motormatchup.com (264 in, 102 in, wheelbase
//                       156 in), dimensions.com height 3.96 m; there is no maker sheet, sources range 6.3-7.0 m.
//   Roadster (2008-12)  3946 x 1873 x 1127, wheelbase 2352 mm - Wikipedia, Tesla Roadster (2008).
//   Roadster (2017)     4200 x 2000 x 1200, wheelbase 2800 mm - cararac.com (second generation, unofficial).
//   Roadster (2026)     no figures were published with the reveal: the 2017 numbers; the shape follows the
//                       reveal coverage (carwow): angular, low nose, triangular lamps, a light bar across the
//                       tail, a big spoiler, four thruster nozzles in the diffuser.
//   Model 3 (2024+)     4720 x 1850 x 1441, wheelbase 2875 mm - auto-data.net, vehiclesizes.com.
//   Model S (2025)      5021 x 1963 x 1431, wheelbase 2960 mm - evspecifications.com, cars-data.com.
//   Model X (2025)      5057 x 1999 x 1680, wheelbase 2965 mm - Tesla owner's manual, evspecifications.com.
//   Model Y (2025+)     4790 x 1920 x 1624, wheelbase 2890 mm - auto-data.net, motor1.com.
//   Cybertruck          5683 x 2032 x 1793, wheelbase 3635 mm - Tesla (223.7 in, 80 in, 70.6 in, 143.1 in).
//   BADGER (Hoffman EV) no published figures: about 4900 x 1950 x 2100 from the user's SEMA photo (the wheels are
//                       Model 3 wheels), on the wheelbase of the donor Model 3 (2875 mm).
//   CyberBus            not a product: the BADGER style stretched to the block's bus place, 10400 x 2500 x 3000,
//                       wheelbase 5600 mm (assumed).
//   Cyber3 (TSK club)   a rebodied Model 3: the donor's 4720 x 1850 x 1441, wheelbase 2875 mm.
//   CyberRoadster       a Model 3 cut down (David Andreyev, "Cyber Hooligan"): wheelbase 2875 mm, the body 9 in
//                       wider (2080 mm) and the roofline 11 in lower (1160 mm) than the donor (press reports).
//                       The user's pictures: drag-radial rear tyres about an eighth taller and half as wide
//                       again as the front ones, standing out of the body behind the cockpit (estimated).
// Ground clearance (read 2026-11-20): Model 3 5.5 in (140 mm), Model S 4.6-5.3 in, Model Y 6.6 in (tesla.com),
// Model X 6.6 in at medium ride height, more raised (getjerry.com, basenor.com). The beltlines are measured
// off side photos against the published heights: the crossovers' sit about 0.1 m above the saloons'.

/** The classes of places: a car of a street, a small sports car, a van or pickup, a bus, a tractor. */
export const SLOTS = ['car', 'sport', 'van', 'bus', 'truck'];

/** Paints, sRGB. A model lists the ones it comes in (look.paints); 'char' is the burnt shell of any. */
export const PAINTS = {
  white: 0xe9e9e6, black: 0x111214, silver: 0x8e9296, grey: 0x4f5357, blue: 0x1d3a6e, red: 0x8f0f12,
  green: 0x24493a, orange: 0xc4561c, steel: 0xb8bcbe, matte: 0xa9a79f, teal: 0x2f6f80, char: 0x231e1a,
};

/**
 * The set. look: body (the builder of world/fleet.js), rim (wheel style), paints, open (no roof), and the
 * parts a model has: lightBar (one strip of light across the nose and the tail), spoiler, nozzles, cage.
 */
export const FLEET = [
  { id: 'semi', slot: 'truck', length: 6.6, width: 2.5, height: 3.95, wheelbase: 3.95, wheelR: 0.52,
    look: { body: 'semi', rim: 'truck', paints: ['white', 'black', 'silver', 'red'], axles: 3 } },
  { id: 'roadster08', slot: 'sport', length: 3.95, width: 1.87, height: 1.13, wheelbase: 2.35, wheelR: 0.31,
    look: { body: 'roadster08', rim: 'spoke5', paints: ['red', 'green', 'orange', 'black', 'white'], open: true } },
  { id: 'roadster17', slot: 'sport', length: 4.2, width: 1.98, height: 1.18, wheelbase: 2.8, wheelR: 0.345,
    look: { body: 'roadster17', rim: 'turbine', paints: ['red', 'black', 'white', 'silver'] } },
  { id: 'roadster26', slot: 'sport', length: 4.25, width: 2.0, height: 1.16, wheelbase: 2.8, wheelR: 0.35,
    look: { body: 'roadster26', rim: 'blade', paints: ['white', 'red', 'black'], lightBar: true, spoiler: true, nozzles: 4 } },
  { id: 'model3', slot: 'car', length: 4.72, width: 1.85, height: 1.44, wheelbase: 2.875, wheelR: 0.335, clearance: 0.14, belt: 0.97,
    look: { body: 'model3', rim: 'aero', paints: ['white', 'black', 'grey', 'blue', 'red', 'silver'] } },
  { id: 'modelS', slot: 'car', length: 5.02, width: 1.96, height: 1.43, wheelbase: 2.96, wheelR: 0.35, clearance: 0.13, belt: 0.95,
    look: { body: 'modelS', rim: 'spoke10', paints: ['black', 'white', 'blue', 'silver', 'red'] } },
  { id: 'modelX', slot: 'car', length: 5.06, width: 2.0, height: 1.68, wheelbase: 2.965, wheelR: 0.372, clearance: 0.19, belt: 1.11,
    look: { body: 'modelX', rim: 'turbine', paints: ['silver', 'white', 'black', 'blue'] } },
  { id: 'modelY', slot: 'car', length: 4.79, width: 1.92, height: 1.62, wheelbase: 2.89, wheelR: 0.36, clearance: 0.167, belt: 1.07,
    look: { body: 'modelY', rim: 'aero', paints: ['white', 'grey', 'black', 'blue', 'red', 'silver'], lightBar: true } },
  { id: 'badger', slot: 'van', length: 4.9, width: 1.95, height: 2.1, wheelbase: 2.875, wheelR: 0.335,
    look: { body: 'badger', rim: 'spoke6', paints: ['matte', 'white', 'grey'] } },
  { id: 'cyberbus', slot: 'bus', length: 10.4, width: 2.5, height: 3.0, wheelbase: 5.6, wheelR: 0.48,
    look: { body: 'cyberbus', rim: 'hex', paints: ['matte', 'steel', 'white'], lightBar: true } },
  { id: 'cyber3', slot: 'car', length: 4.75, width: 1.92, height: 1.4, wheelbase: 2.875, wheelR: 0.34,
    look: { body: 'cyber3', rim: 'hex', paints: ['steel', 'black', 'matte'], lightBar: true } },
  { id: 'cyberroadster', slot: 'sport', length: 4.75, width: 2.08, height: 1.16, wheelbase: 2.875, wheelR: 0.34,
    rearWheelR: 0.385, tyreW: [0.245, 0.36], wheelSpan: 2.32,
    look: { body: 'cyberroadster', rim: 'blade', paints: ['teal'], open: true, cage: true, spoiler: true, lightBar: true } },
  { id: 'cybertruck', slot: 'van', length: 5.68, width: 2.03, height: 1.79, wheelbase: 3.635, wheelR: 0.44,
    look: { body: 'cybertruck', rim: 'hex', paints: ['steel', 'black', 'matte'], lightBar: true } },
];

const BY_ID = new Map(FLEET.map((v) => [v.id, v]));

/** The entry of a model, or null. */
export function vehicleOf(id) { return BY_ID.get(id) || null; }

/** Free space a parked vehicle may take beyond its collider on every side (layouts keep 0.6 m between pieces). */
export const PLACE_MARGIN = 0.3;

/** The place around a collider footprint w x d. */
export function placeOf(w, d) { return { w: w + 2 * PLACE_MARGIN, d: d + 2 * PLACE_MARGIN }; }

/**
 * The places of each class that the maps have, as w x d (long side first). A car of the block's streets and a
 * car piece of a layout stand on a 4.3 x 1.8 collider; the block's new parking places, its bus and the yard of
 * the tractor are sized here (world/level.js).
 */
export const PLACES = {
  car: [{ name: 'street', ...placeOf(4.3, 1.8) }, { name: 'parking', w: 5.5, d: 2.5 }],
  sport: [{ name: 'street', ...placeOf(4.3, 1.8) }],
  van: [{ name: 'lot', w: 6.3, d: 2.7 }],
  bus: [{ name: 'block bus', ...placeOf(10.4, 2.6) }, { name: 'layout bus', ...placeOf(11, 2.5) }],
  truck: [{ name: 'yard', w: 7.4, d: 3.2 }],
};

/** True when the model stands in a place w x d, either way round (tyres that stand out of the body count). */
export function fitsPlace(v, w, d) {
  return v.length <= Math.max(w, d) + 1e-9 && Math.max(v.width, v.wheelSpan ?? 0) <= Math.min(w, d) + 1e-9;
}

/** A well mixed unsigned integer from any number. */
function mix(seed) {
  let h = Math.imul(Math.round((Number(seed) || 0) * 997) ^ 0x2545f491, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A model for a place w x d (metres, either way round), the same one for the same seed. slot: a class or a
 * list of classes. When no model of the class fits, any model that fits; null when none does.
 */
export function pickVehicle(slot, w, d, seed = 0) {
  const slots = Array.isArray(slot) ? slot : [slot];
  let list = FLEET.filter((v) => slots.includes(v.slot) && fitsPlace(v, w, d));
  if (!list.length) list = FLEET.filter((v) => fitsPlace(v, w, d));
  if (!list.length) return null;
  return list[mix(seed) % list.length].id;
}

/** A paint name the model comes in, the same one for the same seed. */
export function pickPaint(id, seed = 0) {
  const v = vehicleOf(id);
  const list = (v && v.look.paints) || ['silver'];
  return list[mix(seed + 0.371) % list.length];
}
