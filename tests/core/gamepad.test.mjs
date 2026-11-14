// Gamepad (R45): dead zones, triggers, the button table, layouts and labels, menu navigation.
import { test, assert, near } from '../harness.mjs';
import {
  BTN, BUTTON_COUNT, PAD_PLAY, PAD_COMMANDS, padButtonsFor, buttonLabel, detectLayout, resolveLayout, radialDeadzone, triggerHeld,
  readPad, padEdges, padActive, stickNeutral, stepSprintLatch, navDirection, stepNavRepeat, LAYOUTS,
} from '../../src/core/gamepad.js';
import { GAMEPAD } from '../../src/core/rules.js';

// the input actions the pad holds in play (all of them are in config.js ACTIONS; the browser side
// filters by that list, this test stays inside src/core)
const HELD = ['jump', 'crouch', 'reload', 'lastWeapon', 'grenade', 'aim', 'fire', 'inventory', 'sprint', 'map'];

function pad({ axes = [0, 0, 0, 0], down = [], values = {} } = {}) {
  const buttons = [];
  for (let i = 0; i < BUTTON_COUNT; i++) {
    const v = values[i] ?? (down.includes(i) ? 1 : 0);
    buttons.push({ pressed: v > 0.5 || down.includes(i), value: v });
  }
  return { id: 'test pad', axes, buttons };
}

test('radial dead zone: nothing inside, full at the rim, never longer than 1', () => {
  assert.deepEqual(radialDeadzone(0.1, 0.1, 0.16), { x: 0, y: 0 });
  const full = radialDeadzone(1, 0, 0.16, 0.95);
  near(full.x, 1, 1e-9);
  const corner = radialDeadzone(1, 1, 0.16, 0.95);
  near(Math.hypot(corner.x, corner.y), 1, 1e-9, 'square gate corner');
  near(corner.x, corner.y, 1e-12, 'direction kept');
  const half = radialDeadzone(0, 0.555, 0.16, 0.95, 1);
  near(half.y, 0.5, 1e-3, 'linear rescale after the dead zone');
});

test('the look curve is finer near the centre and the same at the rim', () => {
  const lin = radialDeadzone(0.5, 0, GAMEPAD.lookDeadzone, GAMEPAD.outerDeadzone, 1).x;
  const cur = radialDeadzone(0.5, 0, GAMEPAD.lookDeadzone, GAMEPAD.outerDeadzone, GAMEPAD.lookCurve).x;
  assert.ok(cur < lin, 'slower at half deflection');
  near(radialDeadzone(1, 0, GAMEPAD.lookDeadzone, GAMEPAD.outerDeadzone, GAMEPAD.lookCurve).x, 1, 1e-9);
});

test('triggers have hysteresis', () => {
  assert.equal(triggerHeld(0.3, false), false);
  assert.equal(triggerHeld(GAMEPAD.triggerOn, false), true);
  assert.equal(triggerHeld(0.25, true), true, 'stays on between the thresholds');
  assert.equal(triggerHeld(0.1, true), false);
});

test('readPad: stick up is forward, look follows the mouse convention, triggers are buttons', () => {
  const r = readPad(pad({ axes: [0, -1, 1, 0.0], values: { [BTN.RT]: 0.9, [BTN.LT]: 0.1 }, down: [BTN.A] }));
  near(r.move.y, 1, 1e-9);
  assert.equal(r.move.x, 0);
  near(r.look.x, 1, 1e-9);
  assert.equal(r.look.y, 0);
  assert.equal(r.held[BTN.RT], true);
  assert.equal(r.held[BTN.LT], false);
  assert.equal(r.held[BTN.A], true);
  assert.equal(r.held[BTN.B], false);
  const idle = readPad(pad({ axes: [0.05, -0.08, 0.03, 0.1] }));
  assert.deepEqual(idle.move, { x: 0, y: 0 }, 'drift inside the dead zone');
  assert.deepEqual(idle.look, { x: 0, y: 0 });
});

test('readPad accepts plain numbers and short button lists', () => {
  const r = readPad({ axes: [], buttons: [1, 0, 0, 0] });
  assert.equal(r.held[BTN.A], true);
  assert.equal(r.held.length, BUTTON_COUNT);
  assert.deepEqual(r.move, { x: 0, y: 0 });
});

test('edges are the buttons that went down', () => {
  assert.deepEqual(padEdges([true, false, false], [true, true, false]), [1]);
  assert.deepEqual(padEdges([], [false, false]), []);
});

test('the button table: conventional shooter layout, every action exists', () => {
  assert.equal(PAD_PLAY[BTN.RT], 'fire');
  assert.equal(PAD_PLAY[BTN.LT], 'aim');
  assert.equal(PAD_PLAY[BTN.A], 'jump');
  assert.equal(PAD_PLAY[BTN.B], 'crouch');
  assert.equal(PAD_PLAY[BTN.X], 'reload');
  assert.equal(PAD_PLAY[BTN.Y], 'nextWeapon');
  assert.equal(PAD_PLAY[BTN.L3], 'sprint');
  assert.equal(PAD_PLAY[BTN.RB], 'grenade');
  assert.equal(PAD_PLAY[BTN.LB], 'lastWeapon');
  assert.equal(PAD_PLAY[BTN.VIEW], 'inventory');
  assert.equal(PAD_PLAY[BTN.UP], 'map');
  assert.equal(PAD_PLAY[BTN.START], 'pause');
  for (const a of Object.values(PAD_PLAY)) assert.ok(HELD.includes(a) || PAD_COMMANDS.includes(a), a);
  assert.deepEqual([...PAD_COMMANDS].sort(), ['nextWeapon', 'pause']);
  assert.deepEqual(padButtonsFor('fire'), [BTN.RT]);
  assert.deepEqual(padButtonsFor('slot4'), []);
});

test('layouts from the pad id', () => {
  assert.equal(detectLayout('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), 'xbox');
  assert.equal(detectLayout('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(detectLayout('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'playstation');
  assert.equal(detectLayout('054c-0ce6-DualSense Wireless Controller'), 'playstation');
  assert.equal(detectLayout('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), 'nintendo');
  assert.equal(detectLayout('057e-2009-Pro Controller'), 'nintendo');
  assert.equal(detectLayout('Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)'), 'nintendo');
  assert.equal(detectLayout('xinput'), 'xbox');
  assert.equal(detectLayout('Generic USB Joystick'), 'xbox');
  assert.equal(detectLayout(undefined), 'xbox');
  assert.equal(resolveLayout('auto', '054c-0ce6-DualSense'), 'playstation');
  assert.equal(resolveLayout('nintendo', '054c-0ce6-DualSense'), 'nintendo');
  assert.equal(resolveLayout('bogus', 'Xbox'), 'xbox');
});

test('labels: Nintendo has A/B and X/Y the other way round', () => {
  assert.equal(buttonLabel(BTN.A, 'xbox'), 'A');
  assert.equal(buttonLabel(BTN.B, 'xbox'), 'B');
  assert.equal(buttonLabel(BTN.A, 'nintendo'), 'B', 'the bottom button prints B');
  assert.equal(buttonLabel(BTN.B, 'nintendo'), 'A', 'the right button prints A');
  assert.equal(buttonLabel(BTN.X, 'nintendo'), 'Y');
  assert.equal(buttonLabel(BTN.Y, 'nintendo'), 'X');
  assert.equal(buttonLabel(BTN.A, 'playstation'), '✕');
  assert.equal(buttonLabel(BTN.RT, 'playstation'), 'R2');
  assert.equal(buttonLabel(BTN.RT, 'nintendo'), 'ZR');
  assert.equal(buttonLabel(BTN.START, 'playstation'), 'Options');
  for (const l of LAYOUTS) for (let i = 0; i < BUTTON_COUNT; i++) assert.ok(buttonLabel(i, l), l + ' ' + i);
  assert.equal(buttonLabel(BTN.A, 'unknown'), 'A');
});

test('L3 sprint: starts on a press while pushing forward, ends when the push or the stamina ends', () => {
  assert.equal(stepSprintLatch(false, true, 1, false), true);
  assert.equal(stepSprintLatch(true, false, 0.9, false), true, 'stays on');
  assert.equal(stepSprintLatch(true, false, 0.1, false), false, 'stick let go');
  assert.equal(stepSprintLatch(false, false, 1, false), false, 'needs a new press');
  assert.equal(stepSprintLatch(true, false, 1, true), false, 'stamina ran dry');
  assert.equal(stepSprintLatch(false, true, 0, false), false, 'standing still');
});

test('menu direction: D-pad wins, the stick has hysteresis', () => {
  const none = new Array(BUTTON_COUNT).fill(false);
  const up = none.slice(); up[BTN.UP] = true;
  assert.equal(navDirection(up, { x: 1, y: 0 }), 'up');
  assert.equal(navDirection(none, { x: 0, y: 0.8 }), 'up');
  assert.equal(navDirection(none, { x: 0, y: -0.8 }), 'down');
  assert.equal(navDirection(none, { x: 0.8, y: 0.2 }), 'right');
  assert.equal(navDirection(none, { x: 0, y: 0.4 }), null, 'below the threshold');
  assert.equal(navDirection(none, { x: 0, y: 0.4 }, 'up'), 'up', 'held above the release threshold');
  assert.equal(navDirection(none, { x: 0, y: 0.2 }, 'up'), null);
});

test('the pad counts as in use only on a press or a clear deflection', () => {
  const rest = readPad(pad());
  assert.equal(padActive(rest, []), false);
  assert.equal(padActive(rest, [BTN.A]), true, 'a press');
  const drift = readPad(pad({ axes: [0.3, 0, 0.3, 0] }));
  assert.ok(drift.move.x > 0 && drift.look.x > 0, 'past the dead zone, so it still moves and looks');
  assert.equal(padActive(drift, []), false, 'but it does not take over from the mouse');
  assert.equal(padActive(readPad(pad({ axes: [0, -0.9, 0, 0] })), []), true);
  assert.equal(padActive(readPad(pad({ axes: [0, 0, 0.9, 0] })), []), true);
  // a non-standard pad read with standard indices would look like this: the view would turn on its own
  const wrong = readPad({ axes: [0, 0, -1, 0, 0, -1], buttons: [] });
  assert.equal(wrong.look.x, -1, 'why non-standard pads are ignored by the browser side');
});

test('stick at rest for menus', () => {
  assert.equal(stickNeutral({ x: 0, y: 0 }), true);
  assert.equal(stickNeutral({ x: 0, y: GAMEPAD.navOff - 0.01 }), true);
  assert.equal(stickNeutral({ x: 0, y: 0.8 }), false);
  assert.equal(stickNeutral(null), true);
});

test('menu repeat: at once, after the delay, then at the repeat rate', () => {
  const rep = { dir: null, t: 0 };
  const dt = 0.01;
  const steps = [];
  for (let i = 0; i < 100; i++) if (stepNavRepeat(rep, 'down', dt)) steps.push(+(i * dt).toFixed(2));
  assert.equal(steps[0], 0);
  near(steps[1], GAMEPAD.navDelay, 0.011);
  near(steps[2] - steps[1], GAMEPAD.navRepeat, 0.011);
  assert.equal(stepNavRepeat(rep, null, dt), false);
  assert.equal(stepNavRepeat(rep, 'down', dt), true, 'a new press moves at once');
});
