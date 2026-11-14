// core/bindings: pure edits of key bindings for the key binding screen (ui/keys.js).
// Bindings map an action to a list of up to SLOTS_PER_ACTION codes; the list has no holes, so
// slot i is list[i]. Every function returns a new object and leaves its input alone.

export const SLOTS_PER_ACTION = 2;

function copy(bindings) {
  const out = {};
  for (const a of Object.keys(bindings)) out[a] = [...bindings[a]];
  return out;
}

/**
 * Put `code` in slot `slot` of `action` (code null clears the slot).
 * - The other slot of the action stays as it is; nothing is reordered.
 * - A code that another action had is removed there, and only there.
 * - A code this action already has stays where it is: pressing it again changes nothing.
 * - A slot past the end of the list appends (an empty first slot is not kept as a hole).
 */
export function assignBinding(bindings, action, slot, code) {
  const out = copy(bindings);
  const list = out[action] || (out[action] = []);
  if (!code) {
    if (slot < list.length) list.splice(slot, 1);
    return out;
  }
  if (list.includes(code)) return out;
  for (const a of Object.keys(out)) if (a !== action) out[a] = out[a].filter((c) => c !== code);
  if (slot < list.length) list[slot] = code;
  else if (list.length < SLOTS_PER_ACTION) list.push(code);
  return out;
}
