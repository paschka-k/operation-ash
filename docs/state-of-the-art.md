# State of the art for OPERATION ASH (2024-2026)

Prepared 2026-11-20 for the game owner, statuses updated after wave 15 (release 1.5.0). This is a menu to choose from, not a plan: wave 15 built only the items marked **wave 15 - done**; everything else is still open. Nothing here changes the code.

**How to read a row**

- **In game**: `have` (works today), `partial` (some of it exists), `no`. Checked against `README.md`, `.autopilot/PROGRESS.md` and a keyword search of `src/`, not by playing every feature.
- **Feasible**: `WebGL now` (works on the current WebGL2 renderer), `needs WebGPU` (wants compute shaders or the WebGPU renderer), `needs a server` (needs a backend we do not have), `needs downloads or an account` (new asset downloads, a third-party service or a login; each needs the owner's explicit yes).
- **Size**: S = a day or less, M = one wave, L = two to three waves, XL = a rewrite or a standing service.

**Method and confidence.** Evidence comes from web searches and the pages listed under Sources, read 2026-11-20. For several pages I saw the search summary, not the full text; dates marked "approx." come from the URL or the summary. Browser-support claims move fast: check MDN and caniuse before building on one. Sizes are my estimates for this codebase, not measurements.

---

## Top 10 for the next waves

| # | Item | Why |
|---|------|-----|
| 1 | P05 Gamepad dual-rumble and trigger haptics | The pad already works; rumble is about a day of work and the biggest feel gain per hour. |
| 2 | P07 Damage-direction ring and kill confirmation | Players cannot tell who shot them from where; every modern shooter shows it. |
| 3 | A01 Spatial audio with HRTF and occlusion | Footsteps and shots with direction turn bots into something you can hear coming. |
| 4 | E03 Death animations and ragdolls | Bots that fold and fall are the cheapest visible jump in "this feels current". |
| 5 | P02 Weapon attachments and a gunsmith | The shop upgrades numbers; attachments give choices (the Delta Force and Tarkov draw). |
| 6 | P01 Mantle, vault and tactical slide | Omnimovement-style traversal is now baseline in Call of Duty; ledges on 90 m maps suit it. |
| 7 | G05 Dynamic resolution plus temporal anti-aliasing | Keeps frame rate on integrated GPUs, where a plain browser tab still runs this game for its owner (the launcher reaches the fast card). |
| 8 | G03 Screen-space reflections | Wet asphalt, glass and paint are where the PBR look still reads flat. |
| 9 | R01 Challenges, daily orders and unlocks | A reason to come back; Helldivers 2 and Call of Duty both run on it; works offline with local storage. |
| 10 | F01 Installable PWA with offline play | One file already plays offline; a manifest and service worker add an app icon and auto-updates. |

---

## Wave 15 - done

Wave 15 shipped as release 1.5.0. The items the owner asked for, plus what came with them (the release log, the vehicles, the weather of the new maps). They also appear in their groups below.

| Item | Row | Status |
|------|-----|--------|
| Quality of the map, first reading: a real top-down view of the map being fought on, on the big map and the radar, with its name, north and scale | U06 | wave 15 - done |
| Quality of the map, second reading: player shadow, sandbags that look like sandbags, no milky haze against the sun, buildings with depth | G08 | wave 15 - done |
| The map changes every wave: the block plus nine new maps, one per wave | M01 | wave 15 - done |
| Choose the next map after wave 5 (and in endless mode) | M02 | wave 15 - done |
| Choose the video card in game | F05 | wave 15 - done, partly: only when the game is started with the launcher (`npm run play` or `play-windows.cmd`); a plain browser tab (the site, `dist/game.html`) cannot choose, so it shows the card and names the launcher |
| Each new map with its own sky, light and weather (rain, snow, dust, a night with street lamps) | M09 | wave 15 - done |
| Cars, the bus and the riders' vehicles built as detailed models (a Tesla-style set) | G17 | wave 15 - done |
| Change log and release notes for every release, the version and "What's new" in the main menu | T01 | wave 15 - done |

---

## 1. Graphics & rendering

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| G01 | PBR materials with image-based lighting | Surfaces react to light like real ones | have | WebGL now | S |
| G02 | Cascaded sun shadows | Crisp shadows near, soft far | have (3 cascades) | WebGL now | S |
| G03 | Screen-space reflections | Wet ground, windows and paint show the street | no | WebGL now (a three.js SSR pass exists; costly on integrated GPUs) | M |
| G04 | Screen-space global illumination (SSGI) | Light bounces off walls and tints shaded corners | partial (GTAO only) | WebGL now at low quality; better on WebGPU | L |
| G05 | Dynamic resolution plus temporal anti-aliasing and upscaling | Steadier image and frame rate on weak GPUs | partial (SMAA, presets with auto-downgrade, render scale) | WebGL now (DLSS and FSR 4 cannot run in a page; a TAA plus spatial upscaler can) | M |
| G06 | Volumetric fog and light shafts | Dust and smoke that glow in the sun | partial (fake shafts, distance fog) | WebGL now; a froxel volume is cheaper with WebGPU compute | M |
| G07 | Contact shadows | Small objects sit on the ground | partial (GTAO yes, contact shadows no) | WebGL now | S |
| G08 | **Map quality: player shadow, sandbags, no haze against the sun, deep facades** - wave 15 - done | The block looks less like boxes | have | WebGL now | M |
| G09 | Decals: bullet holes, scorch, blood, tyre marks | Fights leave marks on the world | partial | WebGL now | M |
| G10 | Destructible geometry (walls break into chunks) | Cover and buildings change during a fight | no (crates and barrels only) | WebGL now for scripted breaks; real-time fracture needs WebGPU compute | XL |
| G11 | GPU particles (smoke, fire, sparks) | Thousands of particles instead of dozens | partial (CPU effects) | needs WebGPU for compute particles; instancing works now | M |
| G12 | Probe or ray-marched global illumination (Lumen-like) | Lighting reacts to every change | no | needs WebGPU; see Limits | XL |
| G13 | Photoscanned and sculpted assets | Real-looking props, walls, weapons | partial (8 textures, 5 models) | needs downloads or an account (each new scan is a download) | L |
| G14 | Gaussian splat backdrops | Photoreal distant scenery or scanned rooms | no | WebGL now (Spark 2.0 runs on WebGL2); capture files need downloads or an account | L |
| G15 | Wet surfaces, puddles and rain response | Rain changes how the street looks | partial (rain streaks) | WebGL now | M |
| G16 | HDR output | Brighter highlights on HDR screens | no (filmic tone mapping only) | needs WebGPU (canvas HDR is still limited) | M |
| G17 | **Detailed vehicles built by code: a Tesla-style set (Semi, three Roadsters, Model 3, S, X, Y, BADGER, CyberBus, Cyber3, CyberRoadster, Cybertruck), more detailed rider vehicles** - wave 15 - done | Parked cars and the bus look like vehicles, not boxes | have (no badges or plates; recognisable by shape) | WebGL now | M |

## 2. Gunplay & movement

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| P01 | Mantle, vault, tactical slide, wall jump (omnimovement) | Fluid traversal, more routes | partial (slide and lean; no mantle or vault) | WebGL now | M |
| P02 | Weapon attachments and a gunsmith screen | Build your own gun | no (upgrades only) | WebGL now | L |
| P03 | Recoil patterns and spray control | Guns that have to be learned | partial | WebGL now | M |
| P04 | Ballistics: bullet drop, penetration through thin cover, armour classes | Cover matters differently per gun | partial (armour yes) | WebGL now | M |
| P05 | Gamepad dual-rumble and trigger-rumble haptics | You feel shots, hits and reloads | no | WebGL now (Gamepad API; trigger-rumble is Chromium only) | S |
| P06 | Aim-assist tuning for gamepad | The pad is competitive on the stick | partial | WebGL now | M |
| P07 | Hit markers, damage-direction ring, kill confirmation | You know who hit you and from where | partial (hit markers, red crosshair, kill feed; no direction ring) | WebGL now | S |
| P08 | Weapon inspect, reload variants, procedural sway | The gun feels hand-held | partial | WebGL now | M |
| P09 | Melee and takedowns | A last resort when empty | no | WebGL now | M |
| P10 | Tactical equipment, deployable cover, scorestreaks | More than a frag grenade | partial (grenade, streak counter) | WebGL now | L |
| P11 | Alternate fire modes and underbarrel attachments | Burst, auto, launcher | no | WebGL now | S |
| P12 | Vehicles the player can ride | Scooters and bikes are not only enemy mounts | no | WebGL now | L |
| P13 | Sub-tick style input timestamps | Exact shot time in networked play | no | needs a server | M |

## 3. Enemies & AI

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| E01 | Cover use, peeking, telegraphed bursts | Bots that play, not stand | have | WebGL now | S |
| E02 | Squad tactics: flank, suppress, grenade out of cover | Fights with a plan | partial (squads, commander grenade) | WebGL now | M |
| E03 | Death animations and ragdolls | Bodies fall and react to the hit direction | no | WebGL now (full-skeleton ragdoll is M; simple falls are S) | M |
| E04 | Hit reactions by body part | A shot to the leg stumbles | partial (flinch) | WebGL now | S |
| E05 | Perception: sight cones, hearing, memory, search | You can hide and flank | partial | WebGL now | M |
| E06 | Learned locomotion for large machines (Arc Raiders style) | Walkers that adapt to rubble | no | needs downloads or an account (training pipeline; runtime on WebNN or WebGPU is experimental) | XL |
| E07 | Pacing director that reacts to the player | Waves that adapt | partial (wave director) | WebGL now | M |
| E08 | Boss encounters with phases | Memorable waves | have (waves 5 and 10) | WebGL now | S |
| E09 | Mounted enemies on street loops | Moving threats | have (from wave 3) | WebGL now | S |
| E10 | More enemy types: snipers, shields, drones | Different tactics per enemy | partial (three types plus riders and bosses) | WebGL now | M |
| E11 | Small language model for bot callouts | Bots that talk about the fight | no | needs downloads or an account (model weights), WebGPU inference | XL |
| E12 | Navmesh pathfinding with dynamic obstacles | Bots route around wrecks and new cover | partial (grid nav) | WebGL now | L |

## 4. Modes & content

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| M01 | **A different map every wave, up to 10 maps** - wave 15 - done | The fight does not repeat | have (the block plus nine new maps) | WebGL now (maps built by code) | L |
| M02 | **Choose the next map after wave 5** - wave 15 - done | You pick where to fight | have | WebGL now | M |
| M03 | Endless mode | Play beyond the last wave | have | WebGL now | S |
| M04 | Extraction mode: carry loot out or lose it | High-stakes runs (Tarkov, Delta Force Operations, Arc Raiders) | no | WebGL now for solo; a safe persistent stash needs a server | XL |
| M05 | Co-op against waves | Friends in the same wave | no | needs a server | XL |
| M06 | Domination, hardpoint, search and destroy against bots | Objective play | no | WebGL now | L |
| M07 | Round mode with perks and wall-buy shops (Zombies style) | A different loop on the same maps | partial (waves and shop) | WebGL now | L |
| M08 | Shrinking-zone mode against bots | A different pacing | no | WebGL now (needs a bigger map; see Limits) | XL |
| M09 | Weather and time of day per map - wave 15 - done | Night, fog, snow change tactics | have (each map its sun, sky, fog and weather: rain, snow, dust, night; fixed per map, no cycle) | WebGL now | M |
| M10 | Map editor for the owner | Build maps without code | no | WebGL now | XL |
| M11 | Daily seed run (same map and waves for everyone) | Compare scores | no | WebGL now; a shared board needs a server | M |
| M12 | Campaign missions with scripted beats | A story | no | WebGL now | XL |

## 5. Progression & meta

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| R01 | Challenges, daily orders, unlock tracks | A reason to return, a goal per session | no | WebGL now (local storage) | L |
| R02 | Weapon XP and per-weapon unlocks | Using a gun improves it | partial (shop upgrades) | WebGL now | M |
| R03 | Loadouts and perks | A build before the fight | no | WebGL now | L |
| R04 | Currency shop between waves | Spend what you earned | have | WebGL now | S |
| R05 | Cosmetics: camos, charms, emblems | Self-expression | no | WebGL now | M |
| R06 | Persistent stats and run history | See your progress | partial (settings saved) | WebGL now | S |
| R07 | Leaderboards | Compare scores | no | needs a server | L |
| R08 | Community-wide goals (Helldivers 2 galactic war) | A shared story | no | needs a server and an operator | XL |
| R09 | Achievements | Milestones | no | WebGL now | S |
| R10 | Cloud save and account | Progress on any device | no | needs downloads or an account | L |

## 6. Audio

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| A01 | 3D positional audio with HRTF and wall occlusion | Hear where a shot or step comes from | partial (synthesized sound; no panner nodes found in `src/`) | WebGL now (Web Audio PannerNode with HRTF) | M |
| A02 | Reverb zones from room size | Indoors sounds indoors | no | WebGL now | M |
| A03 | Layered weapon sound and distance filtering | Guns with weight | partial | WebGL now | M |
| A04 | Adaptive music | Music follows the fight | no | WebGL now | M |
| A05 | Explosion ringing and dynamic mix | Clarity and drama | no | WebGL now | S |
| A06 | Voice lines and radio chatter | Life in the world | no | needs downloads or an account (recorded or generated voice) | L |
| A07 | AudioWorklet synth for shots and engines | Richer synthesized sound at lower cost | no | WebGL now | M |
| A08 | Headphone mode toggle | Better stereo | no | WebGL now | S |
| A09 | Foley by surface | Steps on metal, glass, gravel | partial | WebGL now | S |

## 7. UI, UX & accessibility

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| U01 | Key remapping and full gamepad remap | Own controls | partial (bindings module; no remap screen found) | WebGL now | M |
| U02 | Colour-blind modes and enemy outline colour | Playable for everyone | no | WebGL now | S |
| U03 | Subtitles and captions for sound cues | Deaf and hard-of-hearing players | partial | WebGL now | S |
| U04 | Field of view, head bob and sensitivity sliders | Comfort | partial (fov, sensitivity, invert) | WebGL now | S |
| U05 | Russian and English UI | Own language | have | WebGL now | S |
| U06 | **Radar and big map with a real top-down view of the current map** - wave 15 - done | Orientation | have (map name, north, 10 m scale, legend) | WebGL now | S |
| U07 | Photo mode | Share screenshots | partial (dev `?shots` only) | WebGL now | S |
| U08 | Touch controls | Play on a phone or tablet | no | WebGL now | L |
| U09 | Kill cam and replay of the last seconds | Learn from deaths | no | WebGL now | L |
| U10 | Post-run report | See what happened | partial | WebGL now | S |
| U11 | Tutorial and onboarding | New players learn controls | no | WebGL now | M |
| U12 | Large text and high-contrast HUD | Readability | no | WebGL now | S |

## 8. Online & multiplayer

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| N01 | Authoritative server with tick-rate netcode | Fair multiplayer | no | needs a server | XL |
| N02 | WebTransport datagrams for low-latency traffic | Less lag on lossy links than WebSocket | no | needs a server (browser side is Baseline since March 2026, newly available) | L |
| N03 | WebRTC data channels for friends | Join without relaying game data | no | needs a server for signalling | L |
| N04 | Lag compensation and client prediction | Hits feel right | no | needs a server | L |
| N05 | Matchmaking and parties | Find friends | no | needs a server | XL |
| N06 | Anti-cheat | Fair games | no | needs a server; a browser client cannot be trusted | XL |
| N07 | Spectator mode | Watch friends | no | needs a server | L |
| N08 | Voice chat | Talk to the squad | no | needs a server (WebRTC) | L |
| N09 | Server-side destruction | Everyone sees the same rubble (The Finals) | no | needs a server | XL |
| N10 | Share a run by link (seed and score) | Challenge a friend | no | WebGL now (static link); a shared board needs a server | S |

## 9. Platform & performance

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| F01 | Installable PWA with offline play and updates | An icon and auto-updates | no (no service worker) | WebGL now | S |
| F02 | WebGPU renderer (three.js WebGPURenderer and TSL) | Compute effects, lower CPU cost | no | needs WebGPU (Chrome, Edge, Firefox 141+ on Windows, Safari 26) | XL |
| F03 | Web Workers and OffscreenCanvas | Physics and AI off the main thread, smoother frames | no | WebGL now | L |
| F04 | Automatic quality presets | Playable on weak GPUs | have | WebGL now | S |
| F05 | **Video-card choice in game** - wave 15 - done, partly | Pick the fast GPU on a laptop | partial (a choice in the settings when started with the launcher, `npm run play` or `play-windows.cmd`; a plain tab shows the card and names the launcher) | WebGL now through the launcher; a plain tab cannot choose | M |
| F06 | GPU-driven rendering (indirect draw, GPU culling) | Many more objects per frame | no | needs WebGPU | XL |
| F07 | Texture compression (KTX2, WebP) and streaming | Faster start, less memory | no (listed as not started) | WebGL now | M |
| F08 | Pointer-lock, fullscreen and wake-lock polish | Fewer interruptions | partial | WebGL now | S |
| F09 | WebAssembly physics or pathfinding | Faster simulation | no | WebGL now | L |
| F10 | WebXR VR mode | Play in a headset | no | WebGL now on Quest Browser and Chromium; Safari on iPhone and Mac has none | XL |
| F11 | Frame pacing and a performance overlay | See where time goes | partial (F3 FPS) | WebGL now | S |
| F12 | In-browser AI (WebNN, small models) | Local helpers: bot barks, upscaling | no | needs WebGPU or WebNN (W3C candidate recommendation, shipping uneven) and downloads | XL |

## 10. Tools & pipeline

| ID | Feature | Player gets | In game | Feasible | Size |
|----|---------|-------------|---------|----------|------|
| T01 | **Change log and release notes for every release** - wave 15 - done | See what changed | have (CHANGELOG.md, RELEASE_NOTES.md, the version and "What's new" in the main menu) | WebGL now | S |
| T02 | Automated browser tests and screenshot diffs | Fewer regressions | partial (core tests only) | WebGL now | M |
| T03 | Performance budget per map in CI | No slow maps | partial | WebGL now | M |
| T04 | One-file build and web build | Double-click or website | have | WebGL now | S |
| T05 | Asset fitting and scan fetchers | Safe use of photoscans | have | WebGL now | S |
| T06 | Level preview and editor tooling | Faster map work | no | WebGL now | XL |
| T07 | Debug console and replay recorder | Faster bug reports | partial (`window.__game`) | WebGL now | M |
| T08 | Opt-in telemetry | Know where players quit | no | needs a server | M |
| T09 | Localization pipeline | More languages | partial (ru, en tables) | WebGL now | S |
| T10 | Procedural map and prop generators | Endless variety | partial (wave 15: nine maps from a seeded generator, the same each game) | WebGL now | L |

Total: 117 rows across ten groups; no group has fewer than nine.

---

## Limits: what "Unreal Engine 5 quality" cannot mean in a browser

| UE5 feature | Why not in a browser | Browser substitute |
|-------------|----------------------|--------------------|
| Nanite (virtualised geometry) | Needs mesh shaders, GPU-driven culling and a streaming pipeline for huge assets; WebGPU has compute but no mesh shaders, and the assets would be gigabytes | Merged static batches per chunk, LODs, instancing, baked normal maps; on WebGPU, compute culling (F06) |
| Lumen (dynamic global illumination and reflections) | Software and hardware ray tracing over distance fields and surface caches, on DirectX 12 with Shader Model 6 | IBL, GTAO, baked or probe lighting, SSR and SSGI (G03, G04); probes on WebGPU |
| Hardware ray tracing | No ray-tracing API in WebGL or WebGPU | Screen-space tracing, cube-map or distance-field approximations |
| Virtual shadow maps | Designed to pair with Nanite and a 16k virtual resolution; heavy on memory | Stable cascaded shadow maps (have), contact shadows |
| MetaHuman characters | Hundreds of MB per character, strand hair, facial rigs and solvers | One skinned mesh per bot (have), normal-mapped faces, no strand hair |
| World Partition open worlds | Streaming of very large asset sets | 90 m maps built by code and merged per chunk (have) |
| TSR, DLSS, FSR 4 | Vendor SDKs and drivers; not callable from a page | TAA plus a spatial upscaler and dynamic resolution (G05) |
| Chaos destruction at scale | Heavy physics and server cost | Scripted breaks and instanced debris (G10) |

What is in reach: a good stylised-PBR look, with SSR, low-cost SSGI, volumetric fog and GPU particles, and compute culling if the game moves to WebGPU. The README already says it plainly: this is a good stylised PBR game, not a photograph.

---

## Sources

Dates are publication dates where I could see them; "approx." means taken from the URL or search summary; "living" means a documentation page that changes, read 2026-11-20.

1. web.dev, "WebGPU is now supported in major browsers", Nov 2025 (approx.) - https://web.dev/blog/webgpu-supported-major-browsers
2. three.js forum, "New Firefox version 145 broken Three.js WebGPU and TSL", 2025-11-13 - https://discourse.threejs.org/t/new-firefox-version-145-broken-three-js-webgpu-and-tsl/88092
3. ics.media, "Getting started with Three.js on WebGPU", 2025-05-01 (approx.) - https://ics.media/en/entry/250501/
4. three.js release notes r181 and r182 (SSGINode, TRAANode, SSRNode), late 2025 (approx.) - https://newreleases.io/project/github/mrdoob/three.js/release/r182
5. VR.org, "WebGPU baseline 2026: three.js and WebXR default", 2026-05-06 - https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default
6. EA, "How Battlefield 6 redefined destruction", 2025-11-10 - https://www.ea.com/ea-studios/ea-sports/news/how-battlefield-6-redefined-destruction
7. Valve Developer Community, "Counter-Strike 2" (volumetric smoke, sub-tick), living - https://developer.valvesoftware.com/wiki/CS2
8. WorthPlaying, "Counter-Strike 2 surprise launches as free-to-play", 2023-09-27 - https://worthplaying.com/article/2023/9/27/news/139146-counter-strike-2-surprise-launches-as-free-to-play-on-steam-trailer/
9. bo3.gg, "The new sub-tick update system from Counter-Strike 2 explained", 2023 (approx.) - https://bo3.gg/news/how-the-new-tick-rate-system-works-in-coun
10. Riot Games Tech, "VALORANT's 128-Tick Servers", 2020 (approx.) - https://technology.riotgames.com/node/112
11. Riot Games Tech, "Peeking into VALORANT's Netcode", 2020 (approx.) - https://technology.riotgames.com/node/111
12. Automaton, Arc Raiders machine-learning robot locomotion, 2025-12-06 - https://automaton-media.com/articles/newsjp/arc-raiders-20251206-369937/
13. GDC schedule, "Learning to Move: Physics-Based Enemy Locomotion in ARC Raiders", 2026 (approx.) - https://schedule.gdconf.com/session/learning-to-move-physics-based-enemy-locomotion-in-arc-raiders/917319
14. GamesRadar, Arc Raiders robots are not learning in real time, 2025-26 (approx.) - https://www.gamesradar.com/games/third-person-shooter/arc-raiders-killer-robots-arent-learning-in-real-time-but-embark-will-sneak-in-ai-upgrades-based-on-player-behavior-we-keep-trying-to-make-the-flying-drones-better-and-better/
15. Push Square, "As ARC Raiders Takes Off, Developer Embark Defends Its Use of AI Tools", 2025-11 (approx.) - https://www.pushsquare.com/news/2025/11/as-arc-raiders-takes-off-developer-embark-defends-its-use-of-ai-tools
16. GamesRadar, The Finals hands-on (server-side destruction), 2023-03 (approx.) - https://gamesradar.com/the-finals-preview-hands-on-march-2023
17. PlayStation Blog, "Call of Duty: Black Ops 7 - hands-on report", 2025-10-01 - https://blog.playstation.com/2025/10/01/call-of-duty-black-ops-7-hands-on-report/
18. Neowin, "Black Ops 7 has 18 launch maps, adds wall jumps to Omnimovement", 2025 (approx.) - https://www.neowin.net/news/call-of-duty-black-ops-7-has-18-launch-maps-adds-wall-jumps-to-omnimovement/
19. Call of Duty blog, "Black Ops Royale deep dive", 2026-03 - https://www.callofduty.com/blog/2026/03/black-ops-7-black-ops-royale-battle-royale-deep-dive
20. PCGamesN, Delta Force year-2 destruction system plans, 2025-26 (approx.) - https://www.pcgamesn.com/delta-force/year-2-plans-destruction-system-play-as-a-boss
21. Nerdbot, "Delta Force and Arc Raiders: the next generation of extraction shooters", 2026-03-29 - https://nerdbot.com/2026/03/29/delta-force-and-arc-raiders-the-next-generation-of-extraction-shooters/
22. PC Gamer, Helldivers 2 turns major orders into galactic war campaigns, 2024 (approx.) - https://pcgamer.com/games/action/helldivers-2-will-evolve-major-orders-into-galactic-war-campaigns-later-this-month-with-huge-changes-to-mission-distribution-and-super-destroyers-also-in-the-works/
23. PC Gamer, Helldivers 2 game master, 2024 (approx.) - https://pcgamer.com/games/third-person-shooter/helldivers-2-uses-its-game-master-to-stop-its-live-service-side-from-being-just-a-calendar-with-automated-events-tied-to-major-holidays
24. W3C, "Updated Candidate Recommendation: Web Neural Network (WebNN) API", 2026-01-22 - https://www.w3.org/news/2026/updated-candidate-recommendation-web-neural-network-webnn-api
25. WebRTC.ventures, "WebTransport is now Baseline", 2026-04 - https://webrtc.ventures/2026/04/webtransport-is-now-baseline-what-it-means-for-real-time-media/
26. web.dev, "March 2026 Baseline monthly digest", 2026-03 - https://web.dev/blog/baseline-digest-mar-2026
27. MDN, "GamepadHapticActuator" and "Gamepad.vibrationActuator", living - https://developer.mozilla.org/docs/Web/API/GamepadHapticActuator
28. Chromium blink-dev, "Intent to Prototype: Gamepad API Trigger-Rumble Extension", living - https://groups.google.com/a/chromium.org/g/blink-dev/c/ncvmDRl0AzM/m/z4v34arEAQAJ
29. MDN, "Web audio spatialization basics" (PannerNode, HRTF), living - https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics
30. VR.org, "WebXR adoption surge 2026", 2026-04-13 - https://vr.org/articles/webxr-adoption-surge-2026-browsers-vs-apps
31. UploadVR, "visionOS 2 brings WebXR to Apple Vision Pro", 2024 (approx.) - https://www.uploadvr.com/visionos-2-apple-vision-pro-webxr/
32. World Labs, "Spark 2.0" (Gaussian splats in three.js on WebGL2), 2026-04 - https://worldlabs.ai/blog/spark-2.0
33. PlayCanvas blog, "New in SuperSplat: WebGPU and Streaming", 2025-26 (approx.) - https://blog.playcanvas.com/new-in-supersplat-webgpu-and-streaming-bring-huge-performance-wins
34. Epic Games, "Virtual Shadow Maps in Unreal Engine", living - https://dev.epicgames.com/documentation/unreal-engine/virtual-shadow-maps-in-unreal-engine
35. Epic Games, "Lumen Global Illumination and Reflections", living - https://dev.epicgames.com/documentation/unreal-engine/lumen-global-illumination-and-reflections-in-unreal-engine
36. Wikipedia, "Unreal Engine 5" (Nanite overview), living - https://en.wikipedia.org/wiki/Unreal_Engine_5
37. TechSpot, FSR 4 vs DLSS 4 at 1440p, 2025 (approx.) - https://www.techspot.com/article/2964-amd-fsr4-1440p/
38. three.js forum, "DLSS for WebGL - Upscaling", 2024 (approx.) - https://discourse.threejs.org/t/dlss-for-webgl-upscaling/76303
