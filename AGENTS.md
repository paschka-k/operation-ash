# AGENTS.md

Browser first-person shooter "OPERATION ASH" (UI default language: Russian). Three.js, WebGL2, no framework.

## Commands

```bash
npm install                 # three and esbuild
npm start                   # http://localhost:5174, no build step
npm test                    # core tests under plain Node
npm run test:tools          # glb packer tests (tools, not game logic)
npm run build               # dist/game.html, one file, opens with a double click
npm run build:lite          # same without optional assets
npm run dashboard           # check the gates, regenerate .autopilot/*
npm run textures -- --dry   # print what the photoscan fetcher would download (downloads nothing)
npm run models -- --dry
```

## Rules

- `src/core` is pure: no three, DOM or window. Time (`now`, ms) and randomness (`rng`) come in as parameters. Tests go through it only (`tests/core`).
- Balance numbers live in `src/core/rules.js`. Never copy them into the game layers.
- A new weapon is one row in `WEAPON_SPECS` plus an entry in `WEAPON_ORDER`, and a model in `src/weapons/viewmodel.js`.
- Every scene material must go through the renderer's `prepareMaterial`, otherwise it gets no cascaded shadows.
- Static level geometry is merged per material and per 30 m map chunk (`World._flush`). Do not create one mesh per prop.
- The same flush builds one shadow-only mesh and one shape for the ambient occlusion pass out of all static geometry. Static geometry added outside the batches gets no shadow and no occlusion, so add it through `box`, `_addGeo` and friends before the flush.
- A bot is one skinned mesh (`src/enemies/soldier.js`). Add gear as parts of that mesh, not as separate meshes.
- Never download anything without the user's explicit consent. Photoscans are fetched only by `tools/fetch-*.mjs`, which the user runs.
- Process source of truth: `.autopilot/data.mjs`. After editing it run `npm run dashboard`. Do not hand-edit `manifest.md`, `spec.md`, `state.json` or `dashboard.html`.

## Layout

See `.autopilot/interfaces.md`: module diagram, core contracts, build order.

## Checking in a browser

`window.__game` is always available. `stepFrames(n, dt, false)` runs the simulation without drawing. `?shots` in the address enables `shot()`. Esc pauses, F3 shows FPS.

## Known limits

- Unreal Engine 5 quality is out of reach in WebGL (no Nanite, no Lumen). What exists: PBR, image based lighting, cascaded shadows, GTAO, bloom, SMAA, filmic tone mapping.
- Sound is synthesized and has not been listened to.
- The Claude browser pane cannot open `file://`, so double-clicking `dist/game.html` was checked only by confirming the file has no external references.
