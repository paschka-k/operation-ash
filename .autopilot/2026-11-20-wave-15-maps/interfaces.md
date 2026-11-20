# Границы и правила: волна 15

Читается первым каждым исполнителем и ревьюером. Код проекта описан в `notes.md` этой папки (снят 20.11 с `bugfix-15`, после выпуска e3e6751; где позже иначе — верен код). Общая карта модулей проекта — `.autopilot/interfaces.md` (верхний), правила — `AGENTS.md`.

## Стек и команды

- JavaScript (ES-модули), Three.js r186 (`node_modules/three`), без фреймворка и без сборки при разработке; Node 24 для тестов и инструментов; esbuild только в `tools/build.mjs`. Новых зависимостей не ставить (`npm install` чего-либо нового — `BLOCKED`).
- Проверка одной командой: `npm test` (все `tests/core/*.test.mjs`, чистый Node). Один файл: `node -e "import('./tests/harness.mjs').then(async h => { await import('./tests/core/<файл>.test.mjs'); await h.run(); })"` из корня. Инструменты: `npm run test:tools`.
- Запуск: `npm start` → http://localhost:5174. Исполнителю браузерного таска оркестратор даёт свой порт и id вкладки браузерной панели; вкладки самому не открывать. Отладка: `window.__game` — `startGame({noLock:true})`, `stepFrames(n, dt, false)`, `snapshot()`, `godMode`; `?noscans` — без фотосканов; `?shots` — полноразмерные снимки через `node tools/shot-server.mjs <папка> 5175` и `await __game.shot('имя')`.
- Панель браузера бывает скрыта: тогда `innerWidth` 0 — перед проверкой вида `resize_window` 1280 × 720 и пересчёт размеров игры. Один вызов `javascript_tool` живёт ~45 с — длинные прогоны дробить.
- Сборки (`npm run build*`) пишут в `dist/` — исполнители их не запускают; сборку делает оркестратор в конце.
- Не трогать: `.autopilot/` (кроме того, что велит таск), `AGENTS.md`, `CLAUDE.md`, `README.md` (кроме таска, который это велит), `dist/`, `assets/`, `.claude/`, `.worktrees/`.
- Длинные пути Windows: папка проекта ~180 символов; новые файлы называть коротко.

## Правила проекта

Из `AGENTS.md` (кратко, полный текст там):
- `src/core` чистый: без three, DOM, window; время `now` (мс) и случайность `rng` приходят параметрами. Тесты только через ядро (`tests/core/*.test.mjs`, `npm test`).
- Числа баланса только в `src/core/rules.js`, слои их не копируют.
- Оружие в руках — одна сетка на подвижную часть (`Sculpt`); бот — одна скинованная сетка (`src/enemies/soldier.js`), снаряжение — части этой сетки.
- Динамические предметы — пулы экземпляров (`src/world/pool.js`) с простой формой для теней; не сетка на деталь.
- Каждый материал сцены проходит `prepareMaterial` рендерера, иначе нет каскадных теней.
- Статика уровня сливается по материалу и чанку 30 м в `World._flush`; статика вне `box`, `_addGeo` и т. п. не получает тени и AO.
- Ничего не скачивать. Всё порождается кодом. Каждое использование скана имеет запасной вариант из коробок; игра строится и играет без `assets/`.

Договорились с пользователем (из `carried.md`, дословно):
- Каждая отправка в `main` меняет публичный сайт и требует отдельного «да» пользователя. «deploy after the wave 14 is compleated» (15.11) покрыло выпуск волны 14, не более; «yes, deploy» (20.11) — выпуск исправлений `bugfix-15`, не более.
- Ничего не скачивать без явного согласия; согласие 13.11 — только 13 файлов Poly Haven. Пакеты npm тоже не ставить без согласия.
- Скан — только после подгонки (`SCAN_FIT`, `MODEL_SIZES`, `MODEL_BUDGET`); игра строится и играет без `assets/`.
- «Уровень Unreal Engine 5» в WebGL недостижим — говорить прямо (E02-13).
- Списки пользователя сначала согласуются; согласованное делается волнами без остановок.
- 14.11: этап = волна на нынешней карте; магазин после каждой волны, на паузе, без таймера; купленное сбрасывается с новой игрой; всё купленное носится сразу; транспорт по порядку самокат, скейт, мотоцикл; мои добавления приняты все.
- После смерти — возрождение на волне смерти (R56).
- «use allways the most performed GPU of the System» (14.11): игра всегда просит быструю видеокарту; выбрать её может только пользователь в настройках Windows — игра показывает видеокарту и подсказку (G01).
- Ездоки и боссы входят в число ботов волны 3+2(N−1) (R20 проекта): ездоки вместо рядовых, босс вместо тяжёлого.

Что новая задача 20.11 меняет в договорённостях (по словам пользователя, полный автомат):
- «этап = волна на нынешней карте» → у каждой волны своя карта (R03). Остальное из той строки в силе: магазин после каждой волны, на паузе, без таймера; сброс купленного с новой игрой.
- «выбрать видеокарту может только пользователь в настройках Windows» → выбор есть в игре, когда она запущена лаунчером (R06, R07); в обычной вкладке прежняя подсказка остаётся.
- «списки сначала согласуются» → четыре пункта пользователя взяты с «/autopilot full»; список R01 — предложение на выбор, из него ничего не строится.

Правила этой сборки:
- Код, комментарии и имена — по-английски; текст в игре — таблицы `ru` и `en` в `src/config.js`.
- Новый общий генератор случайности в постройке «Квартала» не вызывать (`world.rng` сдвинет весь облик карты 1); генератор новых карт — своё зерно на карту.
- Одно событие `spawn` = одно ядро врага = ровно один `enemyKilled` (как в волне 14).
- Карту 1 («Квартал», `World.build()`) не перестраивать: порядок вызовов и расход `world.rng` не трогать — от них зависят её облик, `ROUTES` и снимок `tests/core/fixtures/street-colliders.json`. Ей добавляются только `dispose()`, `mapId`, `half`, `routes` и снимок сверху.
- Новые строки интерфейса — в `src/config.js`, в обеих таблицах, своей группой `// ---- wave 15: <таск>`; правки `config.js` — только `Edit` по месту (файл трогают несколько тасков одновременно), никогда переписывание файла целиком. То же для `styles.css` (свой блок `/* ---- wave 15: <таск> */` в конце) и `package.json` (только свой ключ `scripts`).

## Границы, решённые в спецификации

Имена ниже — договор между тасками. Таск, которому имя нужно, а владелец ещё не дописал, пишет против этой подписи; владелец обязан её выдержать или поднять `BLOCKED`.

### Ядро карт — `src/core/maps.js` (новый; владелец — таск ядра карт)
- `MAP_IDS = ['block', 'port', 'factory', 'oldtown', 'railyard', 'airfield', 'winter', 'night', 'desert', 'construction']` — порядок = порядок волн 1–10. `'block'` — нынешний «Квартал» (строит `World.build()`), остальные — генератор.
- `MAPS` — `[{id, nameKey: 'map_<id>', themeKey: 'mapTheme_<id>', order: 1..10}]`. Названия и строка темы — в `config.js` (ru/en).
- `MAP_CHOICE_FROM_WAVE = 6` (в `rules.js`, реэкспорт здесь): выбор открыт, когда следующая волна ≥ 6 или режим бесконечный.
- `defaultMapFor(wave, endless) -> id` — `MAP_IDS[(wave - 1) % 10]`.
- `mapChoiceOpen(nextWave, endless) -> bool`.
- `chooseMap(g, id) -> {ok, reason?}` — в фазе `'shop'`; причины `'closed'` (не магазин или выбор не открыт), `'unknown'`. Пишет `g.shop.map`.
- Состояние в `g` (core/waves.js): `g.map` — карта идущей волны (`'block'` после `createGame`/`restart`); `openShop` ставит `g.shop.map = defaultMapFor(g.wave + 1, g.endless)`; `leaveShop` переносит `g.map = g.shop.map` и пишет `map` в чекпоинт; `saveCheckpoint(g, wave)` кладёт `map: g.map`; `reviveAtCheckpoint` возвращает `g.map = cp.map ?? 'block'`. Для волн 1–5 магазин ставит карту по порядку и `chooseMap` отвечает `'closed'`.
- `shopOffers(...)` (core/shop.js) дополняется полем `maps: {open, next: id, choices: [{id, order, selected, default}]}`.

### Генератор раскладок — `src/core/mapgen.js` (новый; владелец — таск генератора)
- `generateLayout(id) -> Layout` для 9 новых id (для `'block'` бросает: его раскладка не данные). Чистая, детерминированная: своё зерно на карту (константа в файле), `makeRng` из `core/math.js`; одинаковый результат при каждом вызове (кэш по id допустим).
- `Layout = { id, half: 45, theme, atmosphere: id, playerStart: {x, z, yaw}, ground: {kind}, roads: [{x0, z0, x1, z1}], buildings: [B], pieces: [P], routes: [routeDef], spawns: [{x, z}], pickups: [{x, z, type: 'ammo'|'health'}], crates: [{x, z, size}], barrels: [{x, z, explosive}], fires: [{x, z, s}], lamps: [{x, z, y, color}], vantage: [{x, z, y}], menuView: {x, y, z, tx, ty, tz} }`.
  - `B = {cx, cz, w, d, storeys, thick, wall: kind, roof: kind|null, doors: [{side: 'n'|'s'|'e'|'w', at, width, height}], partitions: bool, windowEvery}` — тот же смысл, что у опций `World.building(o)` (level.js:319).
  - `P = {type, x, z, y?, yaw, w?, h?, d?, kind?}`; `type` из закрытого списка `PIECE_TYPES` (экспорт): например `'container'`, `'car'`, `'jersey'`, `'sandbags'`, `'crate_stack'`, `'pallet'`, `'fence'`, `'tree'`, `'lamp'`, `'crane'`, `'tank'`, `'pipe'`, `'wagon'`, `'rail'`, `'platform'`, `'hangar'`, `'plane'`, `'tower'`, `'stall'`, `'fountain'`, `'scaffold'`, `'frame'`, `'rebar'`, `'stairs'`, `'wall'`, `'rubble'`, `'snowbank'`, `'adobe_wall'`, `'palm'`, `'sign'`, `'neon'`, `'water'`, `'quay'`, `'box'` (свободный ящик формы). Список может расти, но каждый тип обязан иметь строку в `PIECE_SHAPES`.
  - `routeDef` — формат `ROUTES` из `core/routes.js` (`{id, closed: true, width, radius, points}`).
- `PIECE_SHAPES[type](piece) -> [colliderBox]` — чистые коробки столкновения каждого типа (формат `makeBox`: `minX..maxZ`, `kind`, `blocksBullets?`, `navIgnore?`).
- `layoutColliders(layout) -> [box]` — ВСЕ статические коллайдеры карты: стены зданий с проёмами дверей, крыши/перекрытия, лестницы и высоты, предметы `pieces`, периметр арены. Единственный источник коллайдеров новой карты: игровой слой создаёт ровно их (плюс ящики и бочки пулов `props` по `crates`/`barrels` и мебель интерьеров `addInteriors` внутри зданий) и не добавляет своих.
- `mapSchema(id) -> {half, buildings: [{x0, z0, x1, z1}], roads: [{x0, z0, x1, z1}], routes: [[x, z][]]}` — для схемы на карточке магазина; для `'block'` — ручная таблица 10 зданий и двух улиц «Квартала» (level.js:844-871, улицы |x|<6, |z|<6).
- Темы и материалы раскладки: `theme = {name, palette: {...}, ground, wallKinds: [...], scatter: {mix}}` — смысл виден генератору мира; материалы рисует мир.

### Петли по картам — `src/core/routes.js` (владелец — таск генератора)
- `routesFor(id) -> [route]` — `'block'` → `levelRoutes()` как сейчас; иначе `generateLayout(id).routes.map(buildRoute)`, кэш по id.
- `onRoute(x, z, margin, routes)` — список петель передаётся явно; значение по умолчанию остаётся петлями «Квартала» (обратная совместимость тестов).

### Атмосфера — `src/core/atmosphere.js` (новый, чистые данные; владелец — таск рендера)
- `ATMOSPHERES[id] = {sun: {elevation, azimuth, color, intensity}, sky: {turbidity, rayleigh, mie, mieG, clouds, cloudDensity}, hemi: {sky, ground, intensity}, fog: {color, density}, env: {intensity}, exposure, bounce, grade: {saturation, contrast, vignette, tint?}, weather: {kind: 'none'|'rain'|'snow'|'dust', intensity}, night: bool, lampLights: n (0..4)}` — id: `'block'` (ровно нынешние числа pipeline.js: солнце 17°/250°, `0xffc896`, 4.2, туман `0xa39d97` 0.0072, экспозиция 0.72 и т. д.) и по одному на каждую новую карту (id атмосферы = id карты).
- Тест: у каждого `MAP_IDS` есть атмосфера; `'block'` совпадает с нынешними константами.

### Рендер — `src/render/pipeline.js` (владелец — таск рендера)
- `gr.applyAtmosphere(id)` — солнце (`sunDir`, `csm.lightDirection`, цвет и сила каскадов), небо и окружение (пересборка env-карты с освобождением старой), `hemi`, туман, экспозиция, `grade`, свет оружия (`_updateViewLight` по пресету, без зашитых 3.0/0.9/0.8), погода через `gr.weather`. Повторный вызов с тем же id ничего не делает. Нынешний вид = `applyAtmosphere('block')` без видимой разницы.
- `gr.setLampLights(list)` — список `{x, y, z, color}` фонарей карты; рендер держит `ATMOSPHERES[id].lampLights` точечных источников и переставляет их к ближайшим к камере фонарям раз в ~0.25 с. Число источников меняется только внутри `applyAtmosphere` (экран загрузки), затем вызывающий делает `renderer.compile`.
- `gr.weather` — `src/world/weather.js` (новый; владелец — таск рендера): `createWeather(gr)` → `{set(kind, intensity), update(dt, camera), clear(), dispose()}`; частицы вокруг камеры одним `InstancedMesh`/`Points`, через `prepareMaterial` или `fog`-совместимый материал, без тени.
- `gr.removeAOSwap(full)` — снимает запись `swapForAO`; `gr.removeNoAO(obj)` — есть.
- `gr.renderTopDown(half, size = 1024) -> HTMLCanvasElement | null` — ортографический снимок сцены сверху на арену `±half`, без тумана, неба, постэффектов, оружия, частиц и погоды, с освещением карты; возвращает 2D-холст `size × size` (север, −z, сверху) или `null` при ошибке. Не ломает основной композер и теневые карты.

### Мир и смена карты (владелец — таск мира)
- `buildLevel(scene, game, mapId = 'block') -> World`; у мира: `mapId`, `half` (45), `routes` (`routesFor(mapId)`), `layout` (`null` у `'block'`), `lampList`, `footprints` и прочие поля, что читают details/scatter/hud (notes §1.2).
- `World.dispose()` — убирает `root` из сцены, освобождает свои геометрии, материалы (`world.m`, `world.dm`), текстуры (небосвод, канвасы), снимает `gr.removeAOSwap`/`removeNoAO`; общие материалы `getMaterial` и наборы `game.textures` не освобождает.
- Новые карты строит `src/world/mapbuild.js` (новый): `buildGenerated(world, layout)` — раскладка в меши через `box`/`_addGeo`/`_flush` и материалы темы; коллайдеры — ровно `layoutColliders(layout)`; `addDetails`/`addInteriors` по `footprints`/`openings`; ящики, бочки, огни, подборы, точки появления — из раскладки.
- `src/game/maps.js` (новый): `switchMap(game, mapId) -> Promise<void>` — экран «Загрузка карты: <название>», очистка врагов, ездоков и обломков, гранат, эффектов, `props.clear()`, `scatter.dispose()`, `world.dispose()`, постройка новой, `createScatter` заново, `gr.applyAtmosphere(mapId)`, `gr.setLampLights`, `gr.prepareScene()`, `renderer.compile`, `player.reset()`, снимок сверху `game.mapView = {mapId, half, image}`; `ensureMap(game, mapId)` — то же, только если `game.world.mapId !== mapId`.
- Вызовы: `Game.leaveShop` (карта `core.map` после `director.leaveShop()`), `Game.startGame` (`'block'`), `Game.revive` (карта чекпоинта), `continueEndless` (магазин сам).
- Все чтения петель — `game.world.routes` (не кэш в конструкторе `Riders`); `Props.canPlace` — `onRoute(x, z, r, game.world.routes)`. Если у карты петель нет — ездок выходит пешим тем же ядром.
- `game.mapView = {mapId, half, image: HTMLCanvasElement | null}` — после каждой постройки карты (включая первую).

### Экранная карта и магазин (владелец — таск интерфейса)
- `bigmap.js` и `hud.drawRadar` рисуют `game.mapView.image` (или прежний рисунок по `world.footprints`, когда `image` нет), масштаб — `game.mapView.half`/`world.half`; заголовок «Карта: <название>», север, полоса 10 м, легенда.
- Баннер волны: вторая строка — название карты (с новостями о ездоках через « · »).
- Магазин: контейнер `#shop-maps` над `.shop-cols`; карточки `button.btn.map-card[data-act="map"][data-id][data-key="map:<id>"]` с холстом схемы (`mapSchema`); до выбора — строка «Следующая карта: …»; кнопка «В бой» называет волну и карту. Клик зовёт `chooseMap(core, id)`, затем `render()`.
- Строки: `map_<id>`, `mapTheme_<id>`, `mapNext`, `mapChoose`, `mapLoading`, `mapDefault` и т. п.

### Видеокарта (владелец — таск лаунчера)
- `tools/play.mjs` (Node, без зависимостей) + `npm run play` + `play-windows.cmd` в корне. Отдаёт игру как `server.mjs` (общий код вынести в `tools/serve-lib.mjs` или экспорт из `server.mjs`, поведение `npm start` не меняется) и ручки: `GET /launcher/info -> {launcher: true, gpus: [{id: 'high'|'default', name, kind}], choice}`, `POST /launcher/gpu {choice}` (проверка `Origin` = свой адрес) -> сохраняет выбор, отвечает, перезапускает окно.
- Чистые помощники в `tools/launch-lib.mjs` с тестами в `tests/tools/launch.test.mjs` (`npm run test:tools` запускает все `tests/tools/*.test.mjs`): `browserArgs({choice, profile, url})`, `gpuOptions(controllerNames)` (по `gpuInfo` из `src/core/gpu.js`), `originAllowed(origin, port)`, `findBrowser(env, exists)`.
- Игра: `src/ui/gpu.js` — проба `GET /launcher/info` (тихо проваливается на сайте и `file://`); строка «Видеокарта» в настройках: под лаунчером — `select#s-gpu` (смена только в меню и на паузе, перед перезапуском `saveSettings`), иначе — имя видеокарты и честный текст.

#### Построено таском 02 (dd61d10)
- `maps.js`: `MAP_IDS`, `MAPS[{id, nameKey, themeKey, order}]`, `defaultMapFor(wave, endless)`, `mapChoiceOpen(nextWave, endless)`, `chooseMap(g, id) -> {ok, reason?: 'unknown'|'closed'}` (сначала проверка id); `MAP_CHOICE_FROM_WAVE = 6` в `rules.js`.
- `waves.js`: `g.map` (`'block'` после `createGame`/`restart`), `g.shop.map`, `checkpoint.map`; `leaveShop` → `g.map = g.shop.map`; `reviveAtCheckpoint` → `g.map = cp.map ?? 'block'`. `shop.js`: `shopOffers().maps = {open, next, choices: [{id, order, nameKey, themeKey, selected, default}]}`.
- `mapgen.js`: `generateLayout(id)` (кэш, ОБЩИЙ объект — не мутировать; первый вызов 70–120 мс; бросает для `'block'` и неизвестных), `PIECE_TYPES` (37, плюс `bus`, `hedgehog`, `dumpster`), `PIECE_SHAPES[type](p)`, `layoutColliders(L)`, `mapSchema(id)`. Для мира: `STOREY`, `surfaceOf(kind)`, `stepsFor(h)`, `buildingOpenings(b) -> {n, s, e, w: [{from, to, bottom, top, kind: 'door'|'window'}]}`, `partitionOf(b)`, `buildingColliders(b, ref)`. У зданий ещё `parapet` и `access` (разрывы парапета у лестниц); каждый коллайдер помечен `part` (`'wall'|'floor'|'roof'|'parapet'|'partition'|'piece'|'perimeter'`) и `ref`. **Меши рисовать по `buildingOpenings`/`partitionOf`/`PIECE_SHAPES`, чтобы совпали с коллайдерами.**
- Имена вида в `P.kind`, `B.wall`, `theme.wallKinds` (corrugated, timber, adobe, neonPink, wagonRed, spruce, bollard…) — у мира таких материалов нет: мир берёт ближайший существующий (таск 05), таск 06 даёт им свои материалы.
- Высоты 2.6–4.6 м — только для игрока (сетка ботов плоская, как на «Квартале»). У каждой карты 1–2 петли ездоков.
- **Здания новых карт строятся из `buildingColliders`/`buildingOpenings`/`partitionOf` раскладки, никогда через `World.building()`**: тот тратит `world.rng` (облом, пропуск окон, заплатки пола, перегородки наугад) и ставит свои коллайдеры. Поле `B` не равно опциям `World.building`.
- Раскладка (`generateLayout`) и всё в ней (`theme` — объект модуля, общие массивы) — только читать; ни миру, ни магазину её не менять.
- Видимое без коллайдера (по ревью таска 02, допустимо — выше досягаемости игрока): скат двускатной крыши (коллайдер — плоская плита на высоте `H`), балка портального крана, кронштейн фонаря, навес прилавка. Проверка лучами таска 06 эти части пропускает.
- `mapSchema(id)` строит раскладку целиком (~80 мс на карту): схемы для магазина считать один раз и держать, не на каждую отрисовку.
- `routes.js`: `routesFor(mapId)` (`'block'` → `levelRoutes()`, иначе из раскладки, кэш); `onRoute(x, z, margin, routes = levelRoutes())` прежний.

#### Построено таском 03 (56ed4ae)
- `src/core/atmosphere.js`: `ATMOSPHERES[id]`, `atmosphereFor(id)`, `sunDirection(atm) -> {x, y, z}`, `WEATHER_KINDS`; пресет как в «Атмосфера» плюс `view: {sun, sky, fill, sunColor, skyColor, groundColor, fillColor}`, необязательные `sky.gain`, `sky.clamp` (у `'block'` 2.9 — убрал дымку против солнца).
- Рендер: `gr.applyAtmosphere(id) -> bool` (false — тот же id), `gr.atmosphereId`, `gr.setLampLights([{x, y?, z, color?}])`, `gr.lampLights`, `gr.removeAOSwap(full)`, `gr.renderTopDown(half, size = 1024) -> HTMLCanvasElement | null` (север, −z, сверху; ~84 мс первый раз, ~20 мс дальше).
- `createWeather(gr) -> {object, kind, intensity, set(kind, i), update(dt, camera), clear(), dispose()}` (`src/world/weather.js`); `createPlayerShadow(game) -> {mesh, update(), dispose()}` (`src/player/shadow.js`).
- `World.wall()` возвращает `[{s, e, top, open}]`; `World.casterProxies` (прокси теней мешков). `world.rng` «Квартала» — прежние 30057 вызовов, 1093 коллайдера, 24 точки появления.

#### Построено таском 05 (a12ffe3)
- `buildLevel(scene, game, mapId = 'block')`; `new World(game, {mapId, seed})`; поля мира `mapId, half, routes, layout, menuView, vantage, sharedMats, chunkGroup, layoutColliderCount, furnitureColliderCount`; `World.dispose()`; `World.sandbagBags(cx, cz, len, alongX)`.
- `src/world/mapbuild.js`: `buildGenerated(world, layout)`, `placeLayout(world)`, `PIECE_DRAW[type](w, p, mat, i)` (нет строки → рисуется форма `PIECE_SHAPES`), `drawPieceShape`, `lookMaterial(w, kind)`, `MAP_SEEDS`.
- `src/game/maps.js`: `switchMap(game, id) -> Promise` (состояние `'loading'`, `game.switching`, `game.lastSwitch = {mapId, ms, build, snapAndCompile}`), `ensureMap(game, id) -> Promise<bool>`, `snapMap(game)` → `game.mapView`, `mapLamps(world)`.
- `Game`: `startGame`, `leaveShop`, `revive` возвращают промис, когда карта меняется; `game.switchMap(id)`; `snapshot().map`. `Riders.routes` — геттер `world.routes`; `Director.hasLoops()`; без петель ездок выходит пешим. Строки `mapLoading`, `map_<id>` (все 10, ru/en) — уже есть.
- Смена «В бой» → управление: 0.5–1.4 с, худшая 2.0 с (первый старый город); после 20 смен память и записи AO не растут.

#### Построено таском 06 (a6037f9)
- `materials.js`: `themeTextureSet(kind, aniso) -> {map, normalMap, orm, texWorld}`; 9 наборов `onDemand` в `TEXTURE_SPECS` (snow, sand, adobe, corrugated, cobble, tiles, timber, grass, gravel), стартовый пак прежний.
- `details.js`: `export decorMaterials(w)`; наклонный фонарь и билборд — только `'block'`. `mapbuild.js`: своя форма у всех 37 типов `PIECE_DRAW`, `lookMaterial(w, kind)` по таблице `LOOKS`, слияние оттенков (`mergeTints`). На карту не больше 3 сканов машины и 4 барьера.
- Бюджет (вызовы / тыс. треугольников, старт · центр): «Квартал» 390/691 · 269/624; худшая новая карта — ночь +5 % вызовов, +6.5 % треугольников.

#### Построено таском 09 (a207785) и 10 (b596350)
- `src/core/fleet.js`: `FLEET[{id, slot, length, width, height, wheelbase, wheelR, look}]`, `SLOTS`, `PAINTS`, `PLACES[slot] = [{name, w, d}]`, `PLACE_MARGIN`, `vehicleOf(id)`, `placeOf(w, d)`, `fitsPlace(v, w, d)`, `pickVehicle(slot | [slots], w, d, seed) -> id | null`, `pickPaint(id, seed)`.
- `src/world/fleet.js`: `buildVehicle(world, id, {x, y, z, yaw, state, paint, tarp, seed}) -> {id, length, width, height}` (без коллайдеров), `fleetMaterials(world)`, `fleetMaterial(gr)`, `vehicleGeometry(id, {state, paint, tarp})`. `level.js`: `World.aoProxies`, `material.userData.aoProxy` в `_flush`, `car/coveredCar(cx, cz, yaw, paint, look?)`, `_parking()` + `PARKING` (6 новых мест; коллайдеров «Квартала» 1093 → 1102). Брезенты — кодом, скан `covered_car` не используется.
- Транспорт ездоков (`vehicles.js`): подписи прежние, треугольников почти вдвое.

#### Построено таском 07 (8f9b3c6)
- `src/ui/bigmap.js`: `mapHalfOf(game)`, `mapImageOf(game) -> canvas | null` (null, когда `mapView.mapId !== world.mapId`). `src/ui/mapthumb.js`: `schemeOf(id)`, `schemeReady(id)`, `drawThumb(canvas, id)`, `fillThumbs(root)`.
- Магазин: `#shop-maps`, `button.btn.map-card[data-act="map"][data-id][data-key="map:<id>"]`; «В бой: волна N — <карта>». `Director.mapName()`. Строки группы `// ---- wave 15: map-ui`: `mapHead, mapScale, mapLegendRider, mapLegendBoss, mapNext, mapChooseH, mapChooseHint, mapDefault, mapSelected, toBattleMap, mapTheme_<id>`.

#### Построено таском 04 (d57eff5)
- `tools/launch-lib.mjs`: `browserArgs({choice, profile, url}) -> string[]`, `gpuOptions(names) -> [{id: 'high'|'default', name, kind}]`, `effectiveChoice(saved, options)`, `originAllowed(origin, port)`, `hostAllowed(host, port)`, `findBrowser(env, exists) -> {name, path} | null`. `tools/serve-lib.mjs` — общая раздача игры (`server.mjs` и `tools/play.mjs`); без лаунчера `GET /launcher/info` отвечает `{launcher: false}` (200).
- HTTP лаунчера: `GET /launcher/info -> {launcher, gpus, choice, browser, seen}`; `POST /launcher/gpu {choice}`, `POST /launcher/seen {renderer}` — только со своим `Origin`, иначе 403. `tools/play.mjs`: `--dry`, `--port N`, env `OPERATION_ASH_HOME`. `npm run play`, `play-windows.cmd`; `npm run test:tools` гоняет `tests/tools/run.mjs` (все `tests/tools/*.test.mjs`).
- Игра: `select#s-gpu`, `#gpu-note` в настройках (`src/ui/gpu.js`); проба лаунчера только на localhost/127.0.0.1/[::1]; строки `config.js` группа `// ---- wave 15: gpu`.

### Вид «Квартала», R02.4–R02.7 (владелец — таск вида «Квартала»)
- Тень игрока: простая форма только для теней (капсула/коробки, `colorWrite: false` как `writeNothing` в pool.js, `castShadow`), следует за `player.pos` и взглядом; в кадре не видна; на всех картах.
- Мешки: шейдер набора `sandbag` в `materials.js` (ткань, швы, завязки) и форма в `World.sandbags` — подушки со скруглением и разбросом размера/оттенка. Разброс — от своего генератора с зерном из координат, **не** `world.rng` (облик и петли карты 1 не должны сдвинуться: тест `routes` и снимок коллайдеров остаются зелёными, число вызовов `world.rng` прежнее).
- Дымка: только числа атмосферы `'block'` в `src/core/atmosphere.js` (туман, `mie*`, экспозиция) — после таска рендера; тест атмосферы обновляется вместе с ними (`'block'` больше не равен старым константам — это и есть изменение).
- Фасады: в `World.building()`/`wall()` — откосы и подоконники проёмов, пояса между этажами, парапеты; всё `collide: false`, через `box`/`_addGeo` до `_flush`; без вызовов `world.rng`.

### Машины, G05–G14 (владелец — таск машин)
- `src/core/fleet.js` (чистый): `FLEET` — `[{id, slot: 'car'|'sport'|'van'|'bus'|'truck', length, width, height, wheelbase, wheelR, look: {...}}]`, id: `'semi', 'roadster08', 'roadster17', 'roadster26', 'model3', 'modelS', 'modelX', 'modelY', 'badger', 'cyberbus', 'cyber3', 'cyberroadster', 'cybertruck'`; `pickVehicle(slot, w, d, seed) -> id` — модель, что влезает в место `w × d` (по длине и ширине с поворотом); тест `tests/core/fleet.test.mjs`.
- `src/world/fleet.js`: `buildVehicle(world, id, {x, z, yaw, state: 'parked'|'burnt', paint}) ` — кладёт геометрию в батчи мира (`_addGeo` по материалам набора) до `_flush`; **коллайдеров не ставит** (их ставит место: `World.car`, кусок раскладки, новое место парковки). `fleetMaterials(world)` — краска (несколько цветов), стекло, тёмное стекло, хром, резина, диски, фары, фонари (излучают), обугленный металл; через `prepareMaterial`, освобождаются `World.dispose()`.
- Где вызывается: `World.car()` и запасная машина `coveredCar` (облик меняется, коллайдер тот же, `world.rng` не трогать — разброс от зерна из координат места), автобус в `details.js`, `PIECE_DRAW.car` / `.bus` в `mapbuild.js`. Новые места парковки «Квартала» — в `level.js` после всех вызовов `world.rng` (своё зерно), с проверкой `onRoute`/`fits`/точек появления.
- Без логотипов, эмблем, надписей, номерных знаков; в именах кода и интерфейса марки нет (id выше — внутренние).
- Транспорт ездоков (`src/enemies/vehicles.js`) — отдельный таск: подписи `createVehicles`, `buildVehicleModel(kind, wrecked)`, размеры и пулы прежние.

### Версии и заметки (владелец — таск выпусков)
- `src/core/releases.js` (чистый): `RELEASES` — новые сверху, `{version, date: 'YYYY-MM-DD', commit: 'abc1234'|null, title: {ru, en}, notes: {ru: [], en: []}, changes: {added: [], changed: [], fixed: [], removed: []}, known: []}`; `renderChangelog(releases) -> string`, `renderReleaseNotes(releases) -> string`.
- `tools/notes.mjs` + `npm run notes` пишут `CHANGELOG.md` и `RELEASE_NOTES.md`; тест `tests/core/releases.test.mjs`: версия `package.json` = `RELEASES[0].version`, версии по убыванию, файлы совпадают с выводом функций.
- Игра: версия в главном меню, окно «Что нового» (`src/ui/whatsnew.js`).

### Швы для тестов
- `tests/core/maps.test.mjs` — выбор карты, порядок, чекпоинт, бесконечный режим.
- `tests/core/mapgen.test.mjs` — по каждой из 9 карт: детерминизм, коллайдеры в арене, старт свободен, ≥16 точек появления вне коллайдеров и достижимы от старта по `NavGrid` из `layoutColliders`, ≥1 петля длиной > 30 м с зазором ≥ 0.8 м (`routeClearance`), ≥6 зданий с дверями, ≥1 высота, подборы/ящики/бочки не на петлях и не в стенах.
- `tests/core/atmosphere.test.mjs`, `tests/core/releases.test.mjs`, `tests/tools/launch.test.mjs`.
- Браузер: `window.__game` — новые `game.switchMap(id)` (или `switchMap(game, id)` через модуль) и `snapshot().map`.

### Построено таском F1 (ремонт ветки)
- Кусок раскладки `water` принимает необязательный `wall` (высота): `Plan.put('water', x, z, {wall})`; `PIECE_SHAPES.water(p)` → `[]`, а при `p.wall > 0` — одна коробка над водой (обрезана по LIM, `blocksBullets: false`). На порту — невидимая стена высотой периметра (14 м) над морем: игрок останавливается у края набережной (z −35), пули летят над ней, граната от неё отскакивает.
- `tests/core/mapgen.test.mjs`: на каждой карте свободные клетки `NavGrid` вне области старта не образуют островов больше 15 м²; на порту `stepBody` с константами PLAYER не уходит с набережной на воду.
- `GpuInfoUi.refreshLang()` — вызывает `hud.refreshLang`; `#gpu-note[data-t]`, подпись `select#s-gpu` — `span[data-t="gpuPick"]`.
- `src/render/models.js`: `covered_car` убран из `MODEL_IDS`, `MODEL_SIZES`, `MODEL_BUDGET` и запасных форм; в списке скачивания `tools/assets-lib.mjs` (`MODEL_MAP`) он остался, `build:scans` и `build:web` ещё несут файл.
- `tests/core/releases.test.mjs`: версия `package-lock.json` = версии `package.json`; у каждой выкладки `known` не пуст там, где в PROGRESS.md коммита выкладки были «Известные баги» или «Не сделано»; названия карт и оружия в заметках — как в игре.

### Построено таском F2 (ремонт по слепой приёмке)
- `src/ui/gpu.js`: `menuHintKeys(kind, launcher|null) -> string[]` — строки уведомления о встроенной графике: в обычной вкладке первой — лаунчер (`npm run play` / `play-windows.cmd`), Windows/NVIDIA одной строкой «второй путь»; под лаунчером — «Настройки → Видеокарта» и кнопка `#gpu-hint-open` → `GpuInfoUi.openPick()` (настройки на `select#s-gpu`). Строки ru/en `gpuHintLauncher`, `gpuHintOther`, `gpuHintPick`, `gpuHintOpen`; ключи `gpuHintWindows/Nvidia/Restart` удалены.
- `src/core/fleet.js` (FLEET): у Model 3/S/X/Y поля `clearance`, `belt` (X/Y — кроссоверы 1.68/1.62 м, линия окон и просвет выше); у CyberRoadster `rearWheelR`, `tyreW: [front, rear]`, `wheelSpan`; `fitsPlace` берёт max(width, wheelSpan). `src/world/fleet.js`: опция оси `open` — колёса вне кузова.
- Тест `tests/core/gpu.test.mjs` импортирует `src/ui/gpu.js` (DOM трогается только при постройке) — шов вне ядра.
