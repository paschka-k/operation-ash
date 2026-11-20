// Light, sky and weather of every map, as plain data. The renderer applies one preset at a time
// (GameRenderer.applyAtmosphere). The id of a preset is the id of its map (core/maps.js MAP_IDS).
//
//   sun      elevation and azimuth in degrees (azimuth 0 = +z, 90 = +x), colour, intensity of
//            the cascaded sun. At night the "sun" is the moon.
//   sky      parameters of three's Sky shader: turbidity, rayleigh, mie (coefficient),
//            mieG (directional g), clouds (coverage) and cloudDensity; optional gain (dims an
//            overcast sky, 1 by default) and clamp (highest sky brightness more than about two
//            degrees from the sun, 6 by default; below the bloom threshold of 3 the glow of a low
//            sun no longer blooms over the buildings in front of it)
//   hemi     the sky fill light: sky colour, ground colour, intensity
//   fog      exponential fog: colour and density
//   env      strength of the image based light baked from the sky
//   exposure tone mapping exposure
//   bounce   colour of the ground the sky probe sees below the horizon (light bounced upward)
//   grade    film grade: saturation, contrast, vignette, optional colour tint [r, g, b]
//   weather  particles around the camera: 'none' | 'rain' | 'snow' | 'dust', intensity 0..1
//   night    the sky is the night dome (stars, moon) and the street lamps light the map
//   lampLights  point lights kept at the street lamps nearest to the camera (0..4)
//   view     lights of the weapon in hand (its own scene, no shadows): sun, sky and fill
//            intensities and colours. The weapon dims them in shade and under roofs.

export const WEATHER_KINDS = ['none', 'rain', 'snow', 'dust'];

const NONE = { kind: 'none', intensity: 0 };

export const ATMOSPHERES = {
  // Wave 14 look: low golden-hour sun from the west. Wave 15 took the milky haze out of the view
  // toward the sun (R02.6): a tighter, smaller sun glow that no longer blooms, thinner darker fog.
  block: {
    sun: { elevation: 17, azimuth: 250, color: 0xffc896, intensity: 4.2 },
    sky: { turbidity: 3.5, rayleigh: 1.6, mie: 0.0015, mieG: 0.97, clouds: 0.55, cloudDensity: 0.5, clamp: 2.9 },
    hemi: { sky: 0xa8bcd8, ground: 0x6b5a48, intensity: 0.9 },
    fog: { color: 0x8f8a84, density: 0.006 },
    env: { intensity: 1.25 },
    exposure: 0.72,
    bounce: 0x7a6650,
    grade: { saturation: 0.98, contrast: 1.12, vignette: 0.55 },
    weather: NONE,
    night: false,
    lampLights: 0,
    view: { sun: 3.0, sky: 0.9, fill: 0.8, sunColor: 0xffd2a6, skyColor: 0xb8c8e0, groundColor: 0x4a3a2a, fillColor: 0xc8d4e6 },
  },
  // Morning over the water: sun in the east, cool sea haze.
  port: {
    sun: { elevation: 24, azimuth: 105, color: 0xffe6c8, intensity: 3.9 },
    sky: { turbidity: 4.5, rayleigh: 2.2, mie: 0.003, mieG: 0.93, clouds: 0.4, cloudDensity: 0.45, clamp: 3.6 },
    hemi: { sky: 0x9fb9d8, ground: 0x55606a, intensity: 1.0 },
    fog: { color: 0x9eb0c0, density: 0.0068 },
    env: { intensity: 1.3 },
    exposure: 0.74,
    bounce: 0x5a646c,
    grade: { saturation: 0.94, contrast: 1.08, vignette: 0.5, tint: [0.985, 1.0, 1.03] },
    weather: NONE,
    night: false,
    lampLights: 0,
    view: { sun: 2.8, sky: 1.0, fill: 0.85, sunColor: 0xffebd6, skyColor: 0xb4c8e4, groundColor: 0x3e464c, fillColor: 0xc8d6e8 },
  },
  // Smog over the works: a pale sun through a thick brown overcast.
  factory: {
    sun: { elevation: 38, azimuth: 200, color: 0xffdcb0, intensity: 2.6 },
    sky: { turbidity: 8, rayleigh: 1.2, mie: 0.006, mieG: 0.75, clouds: 0.95, cloudDensity: 0.8, gain: 0.45, clamp: 2.9 },
    hemi: { sky: 0xa7a89f, ground: 0x544a40, intensity: 1.15 },
    fog: { color: 0x7f7a70, density: 0.0095 },
    env: { intensity: 1.15 },
    exposure: 0.8,
    bounce: 0x5a5046,
    grade: { saturation: 0.8, contrast: 1.1, vignette: 0.6, tint: [1.03, 1.0, 0.94] },
    weather: NONE,
    night: false,
    lampLights: 0,
    view: { sun: 1.9, sky: 1.1, fill: 0.9, sunColor: 0xffe0bc, skyColor: 0xb0b0a8, groundColor: 0x40382e, fillColor: 0xc0c4c4 },
  },
  // Late morning in the old town: high bright sun, clear air, warm stone.
  oldtown: {
    sun: { elevation: 44, azimuth: 150, color: 0xfff0d8, intensity: 4.4 },
    sky: { turbidity: 2.6, rayleigh: 1.3, mie: 0.0025, mieG: 0.92, clouds: 0.3, cloudDensity: 0.4, clamp: 2.9 },
    hemi: { sky: 0xa4c0e2, ground: 0x7a6248, intensity: 0.85 },
    fog: { color: 0xb7bcc2, density: 0.0048 },
    env: { intensity: 1.2 },
    exposure: 0.68,
    bounce: 0x8a7058,
    grade: { saturation: 1.04, contrast: 1.1, vignette: 0.5, tint: [1.02, 1.0, 0.97] },
    weather: NONE,
    night: false,
    lampLights: 0,
    view: { sun: 3.1, sky: 0.85, fill: 0.75, sunColor: 0xfff2de, skyColor: 0xb8cce6, groundColor: 0x56442e, fillColor: 0xcad6e6 },
  },
  // Sunset over the rails: the sun almost on the horizon, orange light, long shadows.
  railyard: {
    sun: { elevation: 9, azimuth: 285, color: 0xffa868, intensity: 3.4 },
    sky: { turbidity: 6, rayleigh: 2.6, mie: 0.004, mieG: 0.94, clouds: 0.5, cloudDensity: 0.5, clamp: 4 },
    hemi: { sky: 0x96a0bc, ground: 0x6a4a36, intensity: 0.8 },
    fog: { color: 0xa48c7c, density: 0.0068 },
    env: { intensity: 1.15 },
    exposure: 0.8,
    bounce: 0x6e4e3a,
    grade: { saturation: 1.02, contrast: 1.14, vignette: 0.6, tint: [1.05, 0.98, 0.9] },
    weather: NONE,
    night: false,
    lampLights: 0,
    view: { sun: 2.6, sky: 0.8, fill: 0.7, sunColor: 0xffb27a, skyColor: 0xa8b0cc, groundColor: 0x4a3426, fillColor: 0xc0c8dc },
  },
  // Noon on the airfield: high sun, clear blue sky, open space.
  airfield: {
    sun: { elevation: 58, azimuth: 195, color: 0xfff8ec, intensity: 4.6 },
    sky: { turbidity: 2.2, rayleigh: 1.0, mie: 0.002, mieG: 0.85, clouds: 0.2, cloudDensity: 0.35, clamp: 2.9 },
    hemi: { sky: 0x9cc4f0, ground: 0x7a725e, intensity: 0.9 },
    fog: { color: 0xbac8d6, density: 0.0042 },
    env: { intensity: 1.15 },
    exposure: 0.66,
    bounce: 0x7e7462,
    grade: { saturation: 1.0, contrast: 1.08, vignette: 0.45, tint: [0.995, 1.0, 1.01] },
    weather: NONE,
    night: false,
    lampLights: 0,
    view: { sun: 3.2, sky: 0.9, fill: 0.75, sunColor: 0xfffaf0, skyColor: 0xb2cef0, groundColor: 0x524a3c, fillColor: 0xcad8ea },
  },
  // Winter village: grey overcast, falling snow, light bounced off the snow.
  winter: {
    sun: { elevation: 14, azimuth: 210, color: 0xdfe6ff, intensity: 2.0 },
    sky: { turbidity: 8, rayleigh: 0.8, mie: 0.005, mieG: 0.7, clouds: 1.0, cloudDensity: 0.85, gain: 0.5, clamp: 2.9 },
    hemi: { sky: 0xc4d0e0, ground: 0x9aa0a8, intensity: 1.35 },
    fog: { color: 0xaab3be, density: 0.012 },
    env: { intensity: 1.35 },
    exposure: 0.78,
    bounce: 0xb8bec6,
    grade: { saturation: 0.75, contrast: 1.05, vignette: 0.45, tint: [0.97, 1.0, 1.05] },
    weather: { kind: 'snow', intensity: 0.8 },
    night: false,
    lampLights: 0,
    view: { sun: 1.5, sky: 1.3, fill: 1.0, sunColor: 0xe4eaff, skyColor: 0xd0dcec, groundColor: 0x8a9098, fillColor: 0xd8e2ee },
  },
  // Night in the city centre: moonlight, street lamps and neon.
  night: {
    sun: { elevation: 36, azimuth: 135, color: 0x9db4f0, intensity: 0.9 },
    sky: { turbidity: 1.5, rayleigh: 0.4, mie: 0.002, mieG: 0.9, clouds: 0.35, cloudDensity: 0.4 },
    hemi: { sky: 0x4a5a80, ground: 0x2a221a, intensity: 1.3 },
    fog: { color: 0x182030, density: 0.011 },
    env: { intensity: 1.0 },
    exposure: 1.3,
    bounce: 0x101216,
    grade: { saturation: 0.85, contrast: 1.1, vignette: 0.62, tint: [0.94, 0.98, 1.08] },
    weather: NONE,
    night: true,
    lampLights: 4,
    view: { sun: 0.35, sky: 0.4, fill: 0.35, sunColor: 0x9fb4f0, skyColor: 0x404c6c, groundColor: 0x1a1612, fillColor: 0x5a6680 },
  },
  // Desert village: hard high sun, pale sky, sand in the air.
  desert: {
    sun: { elevation: 50, azimuth: 235, color: 0xfff0d2, intensity: 5.0 },
    sky: { turbidity: 7, rayleigh: 1.0, mie: 0.005, mieG: 0.9, clouds: 0.1, cloudDensity: 0.3, clamp: 4 },
    hemi: { sky: 0xc6bea6, ground: 0x9a7850, intensity: 1.0 },
    fog: { color: 0xc4a983, density: 0.008 },
    env: { intensity: 1.1 },
    exposure: 0.64,
    bounce: 0xb08a5c,
    grade: { saturation: 0.92, contrast: 1.08, vignette: 0.5, tint: [1.05, 1.0, 0.9] },
    weather: { kind: 'dust', intensity: 0.7 },
    night: false,
    lampLights: 0,
    view: { sun: 3.4, sky: 1.0, fill: 0.85, sunColor: 0xfff2da, skyColor: 0xd2c8b0, groundColor: 0x6a5236, fillColor: 0xe0d6c4 },
  },
  // Building site in the rain: low cloud, cold grey light.
  construction: {
    sun: { elevation: 26, azimuth: 225, color: 0xc6cfdc, intensity: 1.6 },
    sky: { turbidity: 10, rayleigh: 0.9, mie: 0.006, mieG: 0.7, clouds: 1.0, cloudDensity: 0.95, gain: 0.38, clamp: 2.9 },
    hemi: { sky: 0x98a2ae, ground: 0x484a4c, intensity: 1.2 },
    fog: { color: 0x6c747c, density: 0.012 },
    env: { intensity: 1.0 },
    exposure: 0.86,
    bounce: 0x4e5258,
    grade: { saturation: 0.78, contrast: 1.06, vignette: 0.6, tint: [0.96, 1.0, 1.04] },
    weather: { kind: 'rain', intensity: 0.8 },
    night: false,
    lampLights: 0,
    view: { sun: 1.2, sky: 1.15, fill: 0.95, sunColor: 0xd0d8e4, skyColor: 0xa8b2c0, groundColor: 0x34363a, fillColor: 0xb8c2ce },
  },
};

/** The preset of a map; an unknown id gets the block's. */
export function atmosphereFor(id) { return ATMOSPHERES[id] || ATMOSPHERES.block; }

/** Unit vector toward the sun of a preset: azimuth 0 looks along +z, 90 along +x. */
export function sunDirection(a) {
  const el = (a.sun.elevation * Math.PI) / 180, az = (a.sun.azimuth * Math.PI) / 180;
  return { x: Math.cos(el) * Math.sin(az), y: Math.sin(el), z: Math.cos(el) * Math.cos(az) };
}
