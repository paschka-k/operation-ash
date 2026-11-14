// Key rebinding (R44): assigning a code keeps the other slot, never reorders, and moves a code
// away from the action that had it.
import { test, assert } from '../harness.mjs';
import { assignBinding, SLOTS_PER_ACTION } from '../../src/core/bindings.js';

const base = () => ({
  forward: ['KeyW', 'ArrowUp'], sprint: ['ShiftLeft', 'ShiftRight'], jump: ['Space'],
  reload: ['KeyR'], crouch: ['KeyC', 'ControlLeft'], map: [],
});

test('two slots per action', () => assert.equal(SLOTS_PER_ACTION, 2));

test('pressing the code a slot already has changes nothing', () => {
  assert.deepEqual(assignBinding(base(), 'forward', 0, 'KeyW').forward, ['KeyW', 'ArrowUp']);
  assert.deepEqual(assignBinding(base(), 'sprint', 0, 'ShiftLeft').sprint, ['ShiftLeft', 'ShiftRight']);
});

test('a code of the other slot of the same action stays where it is (no swap)', () => {
  assert.deepEqual(assignBinding(base(), 'forward', 1, 'KeyW').forward, ['KeyW', 'ArrowUp']);
  assert.deepEqual(assignBinding(base(), 'forward', 0, 'ArrowUp').forward, ['KeyW', 'ArrowUp']);
});

test('a new code replaces only its slot', () => {
  assert.deepEqual(assignBinding(base(), 'forward', 0, 'KeyI').forward, ['KeyI', 'ArrowUp']);
  assert.deepEqual(assignBinding(base(), 'forward', 1, 'KeyI').forward, ['KeyW', 'KeyI']);
});

test('a code another action had moves here and only leaves there', () => {
  const b = assignBinding(base(), 'jump', 1, 'KeyC');
  assert.deepEqual(b.jump, ['Space', 'KeyC']);
  assert.deepEqual(b.crouch, ['ControlLeft'], 'removed from crouch, nothing else changed');
  assert.deepEqual(b.forward, ['KeyW', 'ArrowUp']);
  assert.deepEqual(b.sprint, ['ShiftLeft', 'ShiftRight']);
});

test('an empty slot appends, a full list never grows', () => {
  assert.deepEqual(assignBinding(base(), 'jump', 1, 'KeyF').jump, ['Space', 'KeyF']);
  assert.deepEqual(assignBinding(base(), 'map', 1, 'KeyM').map, ['KeyM'], 'no hole before it');
  assert.equal(assignBinding(base(), 'forward', 5, 'KeyI').forward.length, 2);
});

test('clearing a slot keeps the rest', () => {
  assert.deepEqual(assignBinding(base(), 'forward', 1, null).forward, ['KeyW']);
  assert.deepEqual(assignBinding(base(), 'jump', 1, null).jump, ['Space'], 'an empty slot: nothing to clear');
});

test('the input is not changed', () => {
  const b = base();
  assignBinding(b, 'jump', 0, 'KeyC');
  assert.deepEqual(b, base());
});
