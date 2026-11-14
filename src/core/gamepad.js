// core/gamepad: the pure part of gamepad support, for pads in the "standard" mapping of the
// Gamepad API (Xbox, PlayStation and Nintendo pads all report it in current browsers).
//
// A pad is plain data: {id, buttons: [{pressed, value}] (or numbers), axes: [lx, ly, rx, ry]}.
// readPad() turns it into held buttons (triggers with hysteresis), a move vector (forward positive)
// and a look vector, both after a radial dead zone and a response curve. The browser side
// (player/gamepad.js) polls navigator.getGamepads() and feeds the result into the input layer.
// The numbers are GAMEPAD in core/rules.js.

import { GAMEPAD } from './rules.js';

/** Button indices of the standard mapping, named by position on an Xbox pad. */
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3,             // bottom, right, left, top of the face buttons
  LB: 4, RB: 5, LT: 6, RT: 7,
  VIEW: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
};
export const BUTTON_COUNT = 17;

/**
 * What each button does in play: an input action (config.js ACTIONS) or one of the pad commands
 * 'nextWeapon' (cycle owned weapons) and 'pause'. L3 is 'sprint' with a latch (stepSprintLatch):
 * one press starts the sprint and it stays on while the stick pushes forward.
 */
export const PAD_PLAY = {
  [BTN.A]: 'jump', [BTN.B]: 'crouch', [BTN.X]: 'reload', [BTN.Y]: 'nextWeapon',
  [BTN.LB]: 'lastWeapon', [BTN.RB]: 'grenade', [BTN.LT]: 'aim', [BTN.RT]: 'fire',
  [BTN.VIEW]: 'inventory', [BTN.START]: 'pause', [BTN.L3]: 'sprint', [BTN.UP]: 'map',
};

/** Values of PAD_PLAY that are commands of the pad rather than input actions. */
export const PAD_COMMANDS = ['nextWeapon', 'pause'];

/** Buttons that do an action, for prompts. Sticks are not buttons: see STICK_ACTIONS. */
export function padButtonsFor(action) {
  const out = [];
  for (const k of Object.keys(PAD_PLAY)) if (PAD_PLAY[k] === action) out.push(+k);
  return out;
}

/** Actions done with a stick rather than a button. */
export const STICK_ACTIONS = { forward: 'left', back: 'left', left: 'left', right: 'left', look: 'right' };

// Labels by position. Nintendo prints A on the right and B at the bottom, X on top and Y on the
// left, the opposite of Xbox, so the same index has the other letter.
const LABELS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Xbox'],
  playstation: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'PS'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home'],
};
export const LAYOUTS = Object.keys(LABELS);

/** The printed name of a button on a pad of this layout. */
export function buttonLabel(index, layout = 'xbox') {
  const l = LABELS[layout] || LABELS.xbox;
  return l[index] ?? LABELS.xbox[index] ?? '#' + index;
}

/** Which family a pad belongs to, from its id string (vendor ids 054c Sony, 057e Nintendo). */
export function detectLayout(id = '') {
  const s = String(id).toLowerCase();
  if (/\b054c\b|sony|playstation|dualsense|dualshock|\bps[345]\b|^wireless controller/.test(s)) return 'playstation';
  if (/\b057e\b|nintendo|switch|pro controller|joy-?con/.test(s)) return 'nintendo';
  return 'xbox';
}

/** The layout for prompts: the setting when it names one, otherwise what the pad id says. */
export function resolveLayout(setting, id) {
  return setting && setting !== 'auto' && LABELS[setting] ? setting : detectLayout(id);
}

/**
 * Radial dead zone with a response curve. Inside `inner` nothing; from there the deflection is
 * rescaled to 0..1 (reaching 1 at `outer`), raised to `curve`, and the direction is kept.
 * The result never exceeds length 1, also in the corners of a square stick gate.
 */
export function radialDeadzone(x, y, inner, outer = 1, curve = 1) {
  const mag = Math.hypot(x, y);
  if (!(mag > inner)) return { x: 0, y: 0 };
  const t = Math.min(1, (mag - inner) / Math.max(1e-6, outer - inner));
  const k = Math.pow(t, curve) / mag;
  return { x: x * k, y: y * k };
}

/** Trigger as a button: on above triggerOn, off below triggerOff, unchanged in between. */
export function triggerHeld(value, wasHeld) {
  return wasHeld ? value > GAMEPAD.triggerOff : value >= GAMEPAD.triggerOn;
}

/**
 * Read one pad. prevHeld is the `held` of the previous read (for the trigger hysteresis).
 * Returns {held: bool[BUTTON_COUNT], move: {x, y}, look: {x, y}}: move.x right, move.y forward
 * (stick up), look.x right, look.y down (like the mouse).
 */
export function readPad(pad, prevHeld = []) {
  const held = new Array(BUTTON_COUNT).fill(false);
  const bs = (pad && pad.buttons) || [];
  for (let i = 0; i < BUTTON_COUNT; i++) {
    const b = bs[i];
    if (b === undefined || b === null) continue;
    const value = typeof b === 'number' ? b : +b.value || 0;
    const pressed = typeof b === 'number' ? b > 0.5 : !!b.pressed;
    held[i] = i === BTN.LT || i === BTN.RT ? triggerHeld(Math.max(value, pressed && value === 0 ? 1 : 0), !!prevHeld[i]) : pressed || value > 0.5;
  }
  const ax = (pad && pad.axes) || [];
  const m = radialDeadzone(+ax[0] || 0, +ax[1] || 0, GAMEPAD.moveDeadzone, GAMEPAD.outerDeadzone, GAMEPAD.moveCurve);
  const l = radialDeadzone(+ax[2] || 0, +ax[3] || 0, GAMEPAD.lookDeadzone, GAMEPAD.outerDeadzone, GAMEPAD.lookCurve);
  return { held, move: { x: m.x, y: m.y === 0 ? 0 : -m.y }, look: { x: l.x, y: l.y } };
}

/**
 * Is the player using the pad? A new button press or a clear stick deflection says so; a stick
 * that only just leaves the dead zone (drift, a resting thumb) does not.
 */
export function padActive(read, edges) {
  if (edges && edges.length) return true;
  const k = GAMEPAD.activeDeflection;
  return Math.hypot(read.move.x, read.move.y) >= k || Math.hypot(read.look.x, read.look.y) >= k;
}

/** Is the stick back at rest for menu navigation (below the release threshold)? */
export function stickNeutral(stick) {
  return !stick || Math.hypot(stick.x, stick.y) < GAMEPAD.navOff;
}

/** Indices of buttons held now and not before. */
export function padEdges(prevHeld, held) {
  const out = [];
  for (let i = 0; i < held.length; i++) if (held[i] && !prevHeld[i]) out.push(i);
  return out;
}

/**
 * The L3 sprint: a press starts it while the stick pushes forward; it ends when the stick stops
 * pushing forward or the stamina runs dry (locked), and then needs a new press.
 */
export function stepSprintLatch(latched, pressed, forward, locked) {
  if (locked || !(forward >= GAMEPAD.sprintKeep)) return false;
  return latched || pressed;
}

/**
 * Menu direction from the D-pad (wins) or the left stick (move vector of readPad, y up), with
 * hysteresis so a stick resting near the threshold does not flicker. Returns 'up', 'down',
 * 'left', 'right' or null.
 */
export function navDirection(held, stick, prevDir = null) {
  if (held[BTN.UP]) return 'up';
  if (held[BTN.DOWN]) return 'down';
  if (held[BTN.LEFT]) return 'left';
  if (held[BTN.RIGHT]) return 'right';
  const x = stick ? stick.x : 0, y = stick ? stick.y : 0;
  const along = { up: y, down: -y, left: -x, right: x };
  if (prevDir && along[prevDir] > GAMEPAD.navOff) return prevDir;
  if (Math.abs(y) >= Math.abs(x) && Math.abs(y) >= GAMEPAD.navOn) return y > 0 ? 'up' : 'down';
  if (Math.abs(x) >= GAMEPAD.navOn) return x > 0 ? 'right' : 'left';
  return null;
}

/**
 * Key repeat for a held menu direction. rep is {dir, t} owned by the caller. Returns true when
 * the focus should move this frame: at once on a new direction, then after navDelay, then every
 * navRepeat seconds.
 */
export function stepNavRepeat(rep, dir, dt) {
  if (dir !== rep.dir) { rep.dir = dir; rep.t = 0; return !!dir; }
  if (!dir) return false;
  rep.t += dt;
  if (rep.t >= GAMEPAD.navDelay) { rep.t -= GAMEPAD.navRepeat; return true; }
  return false;
}
