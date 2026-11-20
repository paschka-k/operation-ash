// Releases: the one source of the version history. The game reads it for the "What's new" window,
// `npm run notes` renders it into CHANGELOG.md and RELEASE_NOTES.md (English), and tests/core/releases.test.mjs
// stops a deploy when package.json, this list and the two files disagree.
//
// Rule: every deploy (every push to main that GitHub Pages publishes) is a new version and a new record on top.
// The minor number is a wave, the patch number is a round of fixes. `commit` is the commit that was deployed;
// the record of the release being built has `null` until it is deployed (the files then say "this release").
// Facts come from `git log`, .autopilot/HISTORY.md and PROGRESS.md; nothing here is invented.
//
// Record: {version, date: 'YYYY-MM-DD', commit: 'abc1234' | null,
//          title: {ru, en}, notes: {ru: [], en: []},          // for the player, plain words
//          changes: {added, changed, fixed, removed: []},       // for the developer, English
//          known: [{ru, en}]}                                   // what is still rough

export const RELEASES = [
  {
    version: '1.5.0',
    date: '2026-11-20',
    commit: null,
    title: { ru: 'Волна 15: десять карт и новые машины', en: 'Wave 15: ten maps and new vehicles' },
    notes: {
      ru: [
        'Десять карт: у каждой волны своя. «Квартал», порт, промзона, старый город, сортировочная станция, аэродром, зимний посёлок, ночной центр, пустынная деревня и стройка. Названия видны в баннере волны.',
        'Начиная с волны 6 следующую карту выбираете вы: в магазине между волнами появились карточки с видом сверху. В бесконечном режиме выбор открыт всегда.',
        'У карт свой свет и погода: снег в зимнем посёлке, пыль в пустыне, дождь на стройке; фонари на ночной карте светят по-настоящему.',
        'Большая карта и радар рисуют вид сверху именно той карты, где вы сейчас.',
        'Машины на улицах и автобус стали заметно подробнее: на дорогах стоят и горят современные электромобили, грузовики и автобусы разных цветов.',
        'Мотоциклы, самокаты и скейты врагов проработаны подробнее.',
        'Тени и вид «Квартала»: у игрока есть своя тень, мешки с песком выглядят как мешки, у фасадов появились откосы окон, пояса и парапеты, дымка против солнца стала слабее.',
        'Если запустить игру через лаунчер (`npm run play` или `play-windows.cmd`), видеокарту можно выбрать прямо в настройках. В обычной вкладке браузер выбирает её сам, игра только показывает, на какой она идёт.',
        'Окно «Что нового» в главном меню и номер версии.',
      ],
      en: [
        'Ten maps, one per wave: City Block, Port, Industrial Zone, Old Town, Railyard, Airfield, Winter Village, Night Downtown, Desert Village and Construction Site. The name shows in the wave banner.',
        'From wave 6 you pick the next map yourself: the shop between waves shows cards with a view from above. In endless mode the choice is always open.',
        'Each map has its own light and weather: snow in the winter village, dust in the desert, rain on the construction site; the street lamps of the night map really light the ground.',
        'The big map and the radar draw the view from above of the map you are on.',
        'Cars and buses on the streets are much more detailed: modern electric cars, trucks and buses in several colours stand and burn on the roads.',
        'The scooters, skateboards and motorbikes of the riders are more detailed too.',
        'Block look: the player has a shadow, sandbags look like sandbags, facades gained window reveals, floor bands and parapets, and the haze against the sun is thinner.',
        'When the game is started with the launcher (`npm run play` or `play-windows.cmd`), the graphics card can be chosen in Settings. In an ordinary tab the browser chooses it; the game only shows which card it draws on.',
        'A "What\'s new" window in the main menu, and the version number.',
      ],
    },
    changes: {
      added: [
        'Ten maps in wave order (`src/core/maps.js`): the block built by `World.build()` and nine generated ones (`src/core/mapgen.js`, one seed per map, 37 piece types with collision shapes, buildings with doors and openings, riders\' loops, spawns, pickups, crates, barrels).',
        'Map choice in the shop from wave 6 (`MAP_CHOICE_FROM_WAVE`), always in endless mode; the choice and the map of the checkpoint survive death and revival.',
        'Map switching behind a loading screen (`src/game/maps.js`: `switchMap`, `ensureMap`, `snapMap`); `World.dispose()` and a rebuild of clutter, weather and lamp lights per map.',
        'Atmosphere presets per map (`src/core/atmosphere.js`: sun, sky, fog, exposure, grade, weather, lamp lights), rain, snow and dust particles (`src/world/weather.js`), `gr.applyAtmosphere`, `gr.setLampLights`.',
        'Top-down map picture (`gr.renderTopDown`) for the big map and the radar; map name on the big map and in the wave banner; map cards with schemes in the shop (`src/ui/mapthumb.js`).',
        'Vehicle fleet (`src/core/fleet.js`, `src/world/fleet.js`): thirteen models (cars, sports cars, vans, buses, trucks) with paint, parked and burnt states, placed by size into parking places and map pieces.',
        'Player shadow for the shadow maps only (`src/player/shadow.js`).',
        'Launcher: `npm run play` / `play-windows.cmd` (`tools/play.mjs`, `tools/launch-lib.mjs`, `tools/serve-lib.mjs`), a graphics card list in Settings (`src/ui/gpu.js`), tests in `tests/tools/launch.test.mjs`.',
        '`docs/state-of-the-art.md`: a list of modern techniques and what the game already has.',
        'Versions: `src/core/releases.js`, `CHANGELOG.md`, `RELEASE_NOTES.md`, `npm run notes`, the version and a "What\'s new" window in the main menu.',
      ],
      changed: [
        'Rider vehicles (`src/enemies/vehicles.js`) have almost twice the triangles with the same signatures and sizes.',
        'Block facades: reveals, sills, floor bands and parapets without collision (`World.building`/`wall` through `box`/`_addGeo`); sandbags are cushions with seams, drawn without `world.rng`.',
        '`World.car` and the spare covered car use the new fleet; six new parking places on the block (colliders 1093 -> 1102).',
        'Atmosphere of the block moved to `ATMOSPHERES.block` (same numbers, sun glare haze reduced by `sky.clamp`).',
        '`buildLevel(scene, game, mapId)`, `Riders` read loops from `world.routes`, `routesFor(mapId)`.',
        'Nine new on-demand texture sets (snow, sand, adobe, corrugated, cobble, tiles, timber, grass, gravel); the start pack is unchanged.',
      ],
      fixed: [],
      removed: [
        'The scan of the covered car is no longer placed (the tarpaulin is built by code); the file is still loaded.',
      ],
    },
    known: [
      {
        ru: 'Первая смена на старый город или ночь занимает 1.2–2.5 с за экраном загрузки; повторные смены быстрее.',
        en: 'The first switch to the old town or the night map takes 1.2 to 2.5 s behind the loading screen; later switches are faster.',
      },
      {
        ru: 'Ночная карта темновата; на ней и на старом городе кадр тяжелее остальных (примерно на 5% больше вызовов отрисовки).',
        en: 'The night map is rather dark; it and the old town are the heaviest maps (about 5% more draw calls).',
      },
      {
        ru: 'На «Порту» у полосы воды нет стены: можно спрыгнуть с набережной туда, куда боты не доберутся.',
        en: 'On the Port map the strip of water has no wall: you can drop off the quay to where the bots cannot follow.',
      },
      {
        ru: 'Окна машин непрозрачные, салон виден только у открытых и сгоревших; некоторые модели длиннее своего коллайдера и выступают до четверти метра.',
        en: 'Car windows are opaque and the inside shows only on open and burnt cars; some models are longer than their collision box and stick out up to a quarter of a metre.',
      },
      {
        ru: 'Магазин с десятью картами выше окна высотой 720 px: он прокручивается, схемы карт дорисовываются около секунды.',
        en: 'The shop with ten map cards is taller than a 720 px window, so it scrolls, and the map schemes finish drawing within about a second.',
      },
      {
        ru: 'Перезапуск лаунчера на другой видеокарте спрашивает подтверждение окном браузера. Лаунчер без Chrome и Edge и повторный запуск при занятом профиле не проверялись, звук на слух и настоящий геймпад тоже.',
        en: 'Restarting the launcher on another graphics card asks for confirmation in a browser dialog. The launcher without Chrome and Edge, a busy profile, sound by ear and a real gamepad were not tried.',
      },
    ],
  },
  {
    version: '1.4.1',
    date: '2026-11-20',
    commit: 'e3e6751',
    title: { ru: 'Исправления после волны 14', en: 'Fixes after wave 14' },
    notes: {
      ru: [
        'Ездоки поворачивают корпус к вам и стреляют, когда ствол смотрит на вас, а не вбок.',
        'Ездоки объезжают обломки и брошенный транспорт, а не слезают цепочкой.',
        'Мотоциклы держат больше в поворотах, а мотоцикл с места толкает вас, не убивая сразу.',
        'Баннер волны стоит между радаром и лентой убийств и не закрывает большую карту.',
        'Геймпад в магазине ходит по столбцу оружия; LT и RT снимают зафиксированный бег.',
        'Названия стволов: «Боевая винтовка HR-12» и «AR-7 Assault Rifle» больше не путаются.',
      ],
      en: [
        'Riders turn their body towards you and fire when the barrel points at you, not sideways.',
        'Riders steer round wrecks and abandoned vehicles instead of dismounting one after another.',
        'Motorbikes hold the road better in turns, and a bike starting from a standstill pushes you instead of killing you outright.',
        'The wave banner sits between the radar and the kill feed and no longer covers the big map.',
        'On a gamepad the shop is walked down the weapon column; LT and RT release a locked sprint.',
        'Weapon names: the HR-12 Battle Rifle and the AR-7 Assault Rifle are no longer confused.',
      ],
    },
    changes: {
      added: [],
      changed: [
        'Rider body turns to the player (`aimTwist` in `rideAim`, `RIDE.twistRate`); a shot waits until the barrel is on the line (`RIDE.twistSlack`).',
        'The muzzle of every bot is read from the weapon bone (`muzzleOf`), also when crouched.',
        'Wave banner layout, gamepad focus order in the shop, README: nine weapons, slots 1 to 9, riders.',
      ],
      fixed: [
        'Riders stopped and dismounted behind wrecks; they now swerve round them where there is room (`RIDE.swerve*`, rays in `riders.js`).',
        'Motorbikes took turns faster than their grip allowed (`VEHICLES.moto.grip`, `heavyMoto`, own `maxLean`); a bike from a standstill hits with `RIDE.bumpSpeed`.',
        'The banner overlapped the radar on windows narrower than about 1250 px and sat over the open big map.',
        'LT and RT did not release a locked sprint; right mouse button and LT now stop a sprint with any weapon.',
        'Two weapons were both called "Rifle" in English; wrong curvature sign in a comment in `core/routes.js`.',
      ],
      removed: [],
    },
    known: [],
  },
  {
    version: '1.4.0',
    date: '2026-11-15',
    commit: 'dc62181',
    title: { ru: 'Волна 14: ездоки и боссы', en: 'Wave 14: riders and bosses' },
    notes: {
      ru: [
        'Враги ездят по улицам на самокатах, скейтах и мотоциклах (с волны 3), обходят друг друга по петлям и слезают, когда их сбивают.',
        'Боссы на волнах 5 и 10 со своей полоской здоровья; ездоки и боссы входят в число ботов волны.',
        'Новые звуки и вид транспорта, обломки сбитых машин.',
        'Мотоцикл может сбить вас, если разгонится: следите за дорогой.',
        'Клавиша гранаты видна на экране.',
        'Игра всегда просит быструю видеокарту и показывает в настройках, на какой работает; на встроенной графике подсказывает, как это исправить.',
      ],
      en: [
        'Enemies ride the streets on scooters, skateboards and motorbikes (from wave 3), follow loops of the streets and dismount when shot off.',
        'Bosses on waves 5 and 10 with their own health bar; riders and bosses count towards the number of bots of the wave.',
        'New sounds and looks for the vehicles, and wrecks of shot vehicles.',
        'A motorbike can run you down when it has speed, so watch the road.',
        'The grenade key is shown on screen.',
        'The game always asks for the fast graphics card and shows in Settings which one it draws on; on integrated graphics it says how to fix that.',
      ],
    },
    changes: {
      added: [
        'Rules, loops and riding in the core (`src/core/ride.js`, `routes.js`, `RIDE`, `RIDER_RULES`, `BOSS` in `rules.js`), riders and bosses in a fight (`src/enemies/riders.js`), vehicle models and sounds (`vehicles.js`).',
        'Graphics card info (`src/core/gpu.js`) and a hint for integrated graphics; `powerPreference: high-performance` is requested.',
        'The grenade key on the HUD.',
      ],
      changed: [
        'Rider and boss share the wave count of bots (`3 + 2(N-1)`): riders instead of rank and file, a boss instead of a heavy.',
        'Skateboards from wave 4; bike ram on contact; riders lean into turns; numbers moved to `rules.js`; keys listed in README.',
      ],
      fixed: [
        'Boss and his guard went first in the wave queue.',
        'The graphics hint for integrated AMD graphics.',
      ],
      removed: [],
    },
    known: [],
  },
  {
    version: '1.3.0',
    date: '2026-11-15',
    commit: 'a41ba9c',
    title: { ru: 'Волны 11–13: управление, экономика, оружие', en: 'Waves 11 to 13: controls, economy, weapons' },
    notes: {
      ru: [
        'Запас бега: бежать можно 3 секунды, потом бег восстанавливается; полоска над здоровьем.',
        'Радар крупнее, большая карта на клавишу M, настройка «враги на карте».',
        'Все клавиши можно переназначить; игра работает с геймпадом, включая меню и магазин.',
        'Деньги за убийства и за волны, магазин между волнами без таймера: оружие, улучшения, броня и аптечки.',
        'Возрождение на волне смерти.',
        'Шесть новых стволов: пистолет-пулемёт, боевая винтовка, снайперская винтовка, пулемёт, миниган и огнемёт.',
        'Ручные гранаты.',
      ],
      en: [
        'Sprint stamina: you can run for 3 seconds, then it recovers; a bar above the health.',
        'A larger radar, a big map on the M key and an "enemies on the map" setting.',
        'Every key can be rebound; the game works with a gamepad, menus and the shop included.',
        'Money for kills and waves, and a shop between waves without a timer: weapons, upgrades, armour and medkits.',
        'Revival on the wave you died on.',
        'Six new weapons: an SMG, a battle rifle, a sniper rifle, a machine gun, a minigun and a flamethrower.',
        'Hand grenades.',
      ],
    },
    changes: {
      added: [
        'Wave 11: sprint stamina, radar of 300 px, enemies-on-map setting, big map, key rebinding screen (`src/core/bindings.js`), gamepad input (`src/core/gamepad.js`, `src/player/gamepad.js`).',
        'Wave 12: money, the shop between waves, upgrades, armour, inventory, enemy health growth, revival on the wave of death (`src/core/shop.js`, `src/ui/shop.js`).',
        'Wave 13: SMG U-4, battle rifle HR-12, sniper rifle LR-4 with a scope, machine gun LM-6, minigun RG-6 with spin-up, flamethrower FL-2 with burning; grenades with bounces.',
        'Actions instead of keys, owned weapons and `specOf`, grenade count, HUD weapon slots (the shared ground of the three waves).',
      ],
      changed: [
        'Review fixes of waves 11 to 13: key waits, refused pointer locks, slot order, odd pads, menu focus, double purchases, death count, fire rate, kills after death.',
        'Revival and the shop clear grenades and burning; a checkpoint does not keep barrel spin.',
      ],
      fixed: [],
      removed: [],
    },
    known: [],
  },
  {
    version: '1.2.0',
    date: '2026-11-14',
    commit: 'b07b1ea',
    title: { ru: 'Волны 9–10: оружие в руках и фотосканы', en: 'Waves 9 and 10: weapons in hand and photoscans' },
    notes: {
      ru: [
        'Фотосканы Poly Haven (CC0): восемь поверхностей и пять предметов, подогнанных к уровню; стены, дорога и ящики ближе к фотографии. Выключаются в настройках или `?noscans`.',
        'Оружие в руках вылеплено заново: пистолет с подвижным затвором, автомат с прицелом, дробовик; перчатки с пальцами и рукава.',
        'Свет на оружии следует за миром, а не за камерой.',
        'Ящики, бочки и подборы быстрее: меньше нагрузка на видеокарту при тех же предметах.',
        'Воронки на дороге стали пятнами копоти, разметка и бумага притушены.',
      ],
      en: [
        'Poly Haven photoscans (CC0): eight surfaces and five props fitted to the level; walls, road and crates are closer to a photograph. They switch off in Settings or with `?noscans`.',
        'The weapons in hand are sculpted again: a pistol with a moving slide, a rifle with a sight, a shotgun; gloves with fingers and sleeves.',
        'The light on the weapon follows the world, not the camera.',
        'Crates, barrels and pickups are cheaper to draw with the same objects on screen.',
        'Craters on the road are soot stains, road markings and paper are toned down.',
      ],
    },
    changes: {
      added: [
        'Poly Haven textures and models (13.9 MB and 10.7 MB, CC0) in `assets/`, fetched by `tools/fetch-*.mjs`, fitted by `SCAN_FIT`, `MODEL_SIZES`, `MODEL_BUDGET`; a retry loader that skips finished sets; the scans switch and `?noscans`.',
        'Builds `build:scans` and `build:web` (the page plus `assets/`, what GitHub Pages publishes).',
        'Weapons from side outlines and turned profiles (`src/weapons/sculpt.js`, `guns.js`), jointed hands (`hands.js`), colour, metalness and glow painted per vertex.',
        'Pools of instances for crates, barrels and pickups (`src/world/pool.js`) with simple shadow shapes.',
      ],
      changed: [
        'Crates, barrels and pickups: 627 -> 380 draw calls from the start view with scans, 0.85 -> 0.59 million triangles.',
        'Weapon light follows the world; craters, markings, light shafts and the sandbag scan decision (rejected, removed).',
        'Barriers and three of eight covered cars come from scans, colliders unchanged.',
      ],
      fixed: [
        'Scans as they came made the picture worse (asphalt ten times too bright, rusty red corrugated iron, a flat crate scan); each is fitted before it is used.',
        'Shell casings without brass, an unlit room lit like the street, a pistol drawn wrongly at a few angles (blind acceptance review).',
      ],
      removed: [],
    },
    known: [],
  },
  {
    version: '1.1.0',
    date: '2026-11-13',
    commit: '72c182e',
    title: { ru: 'Меньше вызовов отрисовки, новый солдат, проломы', en: 'Fewer draw calls, a new soldier, breaches' },
    notes: {
      ru: [
        'Игра заметно быстрее: вызовов отрисовки стало вдвое меньше (на пустой сцене 2025 -> 725).',
        'Новый солдат: одна фигура со скелетом, шлем, очки, разгрузка, рюкзак и камуфляж.',
        'Боты проходят в проломы стен: на проломе лежит низкая россыпь вместо кучи обломков.',
        'Картинка лучше без скачиваний: неповторяющиеся поверхности, потёки на стенах, небо и свечение подобраны заново, лучи солнца, горизонт из башен.',
      ],
      en: [
        'The game is noticeably faster: draw calls are down by more than half (an empty scene 2025 -> 725).',
        'A new soldier: one figure with a skeleton, a helmet, glasses, a vest, a pack and camouflage.',
        'Bots walk through wall breaches: a low scatter lies in the gap instead of a heap of rubble.',
        'A better picture without downloads: surfaces that do not repeat, streaks on walls, a recalibrated sky and glow, sun shafts and a skyline of towers.',
      ],
    },
    changes: {
      added: [
        'Skinned soldier of 12 bones in one mesh (`src/enemies/soldier.js`), prewarmed at load.',
        'Sun shafts on medium and high presets; skyline towers with setbacks and antennas.',
      ],
      changed: [
        'Static shadows: one merged mesh per side instead of every piece of every material; one merged shape for the ambient occlusion pass.',
        'Breaches are walkable for bots (all 37 openings pass in both directions); surface tint varies in world coordinates; sky and glow calibrated by measurement.',
        'Light pillar of pickups is thin and fades near.',
      ],
      fixed: [
        'A body touching two nested low steps was thrown sideways, sometimes to the far end of a long box.',
        'Crate and barrel geometry freed on restart.',
      ],
      removed: [],
    },
    known: [],
  },
  {
    version: '1.0.1',
    date: '2026-11-13',
    commit: 'c4eed2f',
    title: { ru: 'Ссылка на игру в README', en: 'The play link in the README' },
    notes: {
      ru: [
        'В README появилась ссылка, по которой игру можно открыть в браузере.',
        'Сама игра не менялась.',
      ],
      en: [
        'The README now carries the link that opens the game in a browser.',
        'The game itself did not change.',
      ],
    },
    changes: {
      added: ['The live play link in the README.'],
      changed: [],
      fixed: [],
      removed: [],
    },
    known: [],
  },
  {
    version: '1.0.0',
    date: '2026-11-13',
    commit: '9b3cac5',
    title: { ru: 'Первая выкладка: «Операция «Пепел»»', en: 'First release: OPERATION ASH' },
    notes: {
      ru: [
        'Шутер от первого лица в разрушенном городском квартале 90 × 90 м: десять домов с мебелью внутри, улицы, баррикады, контейнеры и снайперская точка на крыше контейнера.',
        'Три оружия: пистолет, автомат и дробовик. Десять волн ботов, затем бесконечный режим.',
        'Боты прячутся за укрытиями, выглядывают и предупреждают о очереди лазером и звуком; три уровня сложности.',
        'Здоровье восстанавливается через пять тихих секунд; ящики ломаются, бочки взрываются, аптечки и патроны появляются снова.',
        'Три пресета качества с автоснижением, настройки, русский и английский языки, звук.',
        'Игра открывается одним файлом `dist/game.html` без установки.',
      ],
      en: [
        'A first-person shooter in a ruined 90 by 90 m city block: ten buildings furnished inside, streets, barricades, containers and a sniper perch on a container roof.',
        'Three weapons: a pistol, a rifle and a shotgun. Ten waves of bots, then an endless mode.',
        'Bots take cover, peek out, and warn of a burst with a laser and a sound; three difficulty tiers.',
        'Health regenerates after five quiet seconds; crates break, barrels explode, medkits and ammo boxes come back.',
        'Three quality presets with automatic downgrade, settings, Russian and English, sound.',
        'The game opens as one file, `dist/game.html`, with nothing to install.',
      ],
    },
    changes: {
      added: [
        'The pure core under `src/core` with its tests (`npm test`) under plain Node.',
        'The renderer: PBR, sky with image based lighting, three shadow cascades, GTAO, bloom, SMAA, grade, three quality presets with automatic downgrade.',
        'The block with ten furnished buildings, cover and about 5300 small objects; weapons from one table; bots with cover and a telegraph; ten waves and the endless mode.',
        'HUD, menu, pause (Esc), FPS counter (F3), sound switch, red crosshair and an enemy health bar.',
        'The build `dist/game.html` (0.93 MB, no external references).',
      ],
      changed: [],
      fixed: [],
      removed: [],
    },
    known: [],
  },
];

/** Compare 'major.minor.patch' strings: <0, 0, >0. */
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

const SECTION_TITLES = [['added', 'Added'], ['changed', 'Changed'], ['fixed', 'Fixed'], ['removed', 'Removed']];
const stamp = (r) => (r.commit ? 'commit ' + r.commit : 'this release');

/** CHANGELOG.md: one entry per release, newest first, sections Added / Changed / Fixed / Removed. */
export function renderChangelog(releases) {
  const out = [
    '# Changelog',
    '',
    'Every deploy of OPERATION ASH is a version with an entry here, newest first. The minor number is a wave, the patch number is a round of fixes.',
    'This file is generated by `npm run notes` from `src/core/releases.js`; edit the data, not the file.',
    '',
  ];
  for (const r of releases) {
    out.push(`## ${r.version} - ${r.date} (${stamp(r)})`, '');
    for (const [key, name] of SECTION_TITLES) {
      if (!r.changes[key] || !r.changes[key].length) continue;
      out.push(`### ${name}`, '', ...r.changes[key].map((s) => '- ' + s), '');
    }
  }
  return out.join('\n').replace(/\n+$/, '') + '\n';
}

/** RELEASE_NOTES.md: for each release what is new for a player in plain words, and the known issues. */
export function renderReleaseNotes(releases) {
  const out = [
    '# Release notes',
    '',
    'What changed in OPERATION ASH with every release, in plain words, newest first. The developer\'s list is in [CHANGELOG.md](CHANGELOG.md).',
    'This file is generated by `npm run notes` from `src/core/releases.js`; edit the data, not the file.',
    '',
  ];
  for (const r of releases) {
    out.push(`## ${r.version}: ${r.title.en}`, '', `${r.date}, ${stamp(r)}`, '', ...r.notes.en.map((s) => '- ' + s), '');
    if (r.known && r.known.length) out.push('Known issues:', '', ...r.known.map((k) => '- ' + k.en), '');
  }
  return out.join('\n').replace(/\n+$/, '') + '\n';
}
