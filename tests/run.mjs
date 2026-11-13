// Runs the tests of src/core. They import no three.js, touch no DOM and draw nothing.
import { run } from './harness.mjs';
import './core/math.test.mjs';
import './core/collision.test.mjs';
import './core/nav-cover.test.mjs';
import './core/rules.test.mjs';
import './core/weapons.test.mjs';
import './core/combat.test.mjs';
import './core/ai.test.mjs';
import './core/waves.test.mjs';
import './core/regressions.test.mjs';
await run();
