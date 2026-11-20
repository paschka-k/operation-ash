# Архитектура

Снято с кода ветки `bugfix-15` (выпуск 1.5.0). Слова «волна», «карта», «квартал», «раскладка», «петля» — в `CONTEXT.md`; почему сделано так — в `docs/adr/` (номера ниже). Здесь только границы и поток данных.

## Два слоя

- `src/core/*` (24 файла) — чистые правила и данные: без three, DOM и window; время `now` (мс) и случайность `rng` приходят параметрами. Всё, что можно проверить без браузера, лежит здесь; тесты — только сюда (`tests/core/*.test.mjs`, `npm test`).
- Всё остальное — слой игры над Three.js: `src/main.js` (класс `Game`), `src/world`, `src/render`, `src/enemies`, `src/player`, `src/weapons`, `src/game`, `src/ui`, `src/audio`. Слой игры читает ядро, ядро о нём не знает.
- Числа баланса — `src/core/rules.js`, строки интерфейса — таблицы `STR.ru` и `STR.en` в `src/config.js` (обе сразу). Слои числа не копируют.
- Проверки слоя игры — только руками в браузере через `window.__game` (см. `AGENTS.md`); тестов у него нет, кроме `tests/tools` для лаунчера и glb.

## Поток кадра

`Game.loop` → `frame(dt)` в `src/main.js`. Состояния `Game.state`: `loading | menu | playing | paused | dead | victory | shop`; параллельно у ядра своя фаза (`g.phase` в `core/waves.js`: menu, wave, intermission, shop, dead, victory, paused).
- Физика игрока шагает фиксированным `STEP` (`player.step`), не более 8 шагов за кадр; остальное — по `dt`.
- Порядок при `playing | dead | victory`: игрок → оружие (`weapons`, `game/shooting.js`) → враги (`enemies/squad.js`) → `Director` → пулы предметов (`world/props.js`) → гранаты (`game/grenades.js`) → эффекты и звук → HUD → `gr.render`.
- В `paused` и `shop` симуляция стоит, звук и эффекты тоже; рисуется кадр с `dt = 0`.
- Геймпад (`player/gamepad.js`, таблицы в `core/gamepad.js`) подаёт ввод до всего остального; он не даёт жеста пользователя, поэтому курсор не захватывается.

## Правила волн и режиссёр

- `core/waves.js` — машина состояний: `createGame`, `tickGame(g, now, ...) -> события` (`waveStart`, `spawn`, `waveCleared`, `victory`, `dead`), `enemyKilled`, `leaveShop`, `reviveAtCheckpoint`, `continueEndless`. Бот в волне N: `3 + 2(N−1)` (`waveCount`); ездоки и босс входят в это число (`waveRoster`, `bossForWave`).
- `game/director.js` (`Director`) держит `core` и переводит события в сцену: появление врагов, баннеры, ездоки, босс, магазин. Одно событие `spawn` = одно ядро врага = ровно один `enemyKilled`.
- Магазин: правила `core/shop.js` (`shopOffers`, `buy*`), экран `ui/shop.js`. Каждый кликабельный элемент — `button.btn`, иначе до него не дойдёт геймпад.
- Возрождение после смерти — на волне смерти: чекпоинт (`saveCheckpoint`) хранит и карту (ADR 0012).

## Враги, ездоки, транспорт

- Ядро врага — запись в `core/combat.js`/`core/ai.js` (цели, зоны попаданий, слух, укрытия `core/cover.js`, сетка `core/nav.js`). `enemies/squad.js` оживляет их: `Enemy` рисуется одной скинованной сеткой из `enemies/soldier.js`.
- Ездоки: езда `core/ride.js`, правила ввода `core/riderlogic.js`, петли `core/routes.js`; в игре `enemies/riders.js` и `enemies/vehicles.js` (по пулу экземпляров на вид транспорта). Босс — `core/boss.js`.
- Транспорт ездока — цель `kind: 'vehicle'` с повёрнутой коробкой; убийство ездока и убийство транспорта считаются раздельно (`payVehicle`).
- Петли читаются только из `game.world.routes`, не кэшируются в конструкторах. Без петель ездок выходит пешим.

## Карты

Десять карт, по одной на волну 1–10 (`core/maps.js`: `MAP_IDS`, `defaultMapFor`, `chooseMap`; выбор открыт с волны 6 и в бесконечном режиме, ADR 0012). Арена всегда 90 × 90 м (ADR 0003).

- `block` («Квартал») — рукописный: `World.build()` в `src/world/level.js`. Порядок его вызовов и расход `world.rng` определяют облик, петли и снимок `tests/core/fixtures/street-colliders.json`; перестраивать нельзя (ADR 0002). Новое на нём — через своё зерно от координат и после всех вызовов `world.rng`.
- Остальные девять — данные: `core/mapgen.js` `generateLayout(id)` (детерминированно, зерно на карту, общий кэшированный объект — не мутировать, ADR 0001) → `src/world/mapbuild.js` `buildGenerated` строит меши.
- Коллайдеры новой карты — ровно `layoutColliders(layout)` (ADR 0004). Здания и куски рисуются по `buildingOpenings`/`partitionOf`/`PIECE_SHAPES`, чтобы совпали с коллайдерами; `World.building()` для них не зовётся (тратит `world.rng`). Свой вид у типа куска — `PIECE_DRAW[type]` в `mapbuild.js`; нет строки — рисуется форма коллайдера.
- Петли карты — `routesFor(id)` в `core/routes.js`; зазор ≥ 0.8 м проверяет `routeClearance`.
- Свет, небо, туман, погода — пресет `ATMOSPHERES[id]` (`core/atmosphere.js`, ADR 0005); применяет `gr.applyAtmosphere(id)` в `render/pipeline.js`, погода — `world/weather.js`, фонари — `gr.setLampLights`.
- Материалы тем — `themeTextureSet` в `render/materials.js` (девять наборов `onDemand`), у видов материала в раскладке `lookMaterial(w, kind)` в `mapbuild.js`.
- Машины — `core/fleet.js` (данные, `pickVehicle` по месту) и `world/fleet.js` (`buildVehicle`, кладёт геометрию в батчи, коллайдеров не ставит; их ставит место). Без марок, логотипов и сканов (ADR 0011).

### Смена карты (ADR 0006)

`Game.leaveShop` → `director.leaveShop()` (пишет `core.map`) → `ensureMap(game, map)` в `src/game/maps.js` → `switchMap`: экран «Загрузка карты», очистка врагов, ездоков, гранат, эффектов, `props.clear()`, `scatter.dispose()`, `world.dispose()`, `buildLevel(scene, game, mapId)`, `createScatter`, `applyAtmosphere`, `setLampLights`, `prepareScene`, `renderer.compile`, `player.reset()`, `snapMap`. Старая карта освобождается целиком; после 20 смен память не растёт. Тот же путь у `startGame` (`block`) и `revive` (карта чекпоинта).
Всё, что порождает мир или транспорт, чистится в `startGame`, `toMenu`, `revive`, магазине, паузе и победе — иначе остаются обломки, голоса двигателей и полоса босса.

### Экранная карта (ADR 0007)

`gr.renderTopDown(half)` снимает сцену сверху один раз на карту → `game.mapView = {mapId, half, image}`. Читают `ui/bigmap.js` и радар `hud.drawRadar`; схемы на карточках магазина — `ui/mapthumb.js` по `mapSchema(id)` (раскладка целиком, ~80 мс на карту, считать один раз).

## Мир и рендер

- Статика уровня сливается по материалу и по чанку 30 м в `World._flush`; тот же сброс строит один теневой меш и одну форму для AO. Статика вне `box`/`_addGeo` и т. п. до `_flush` не получает тени и AO.
- Динамика (ящики, бочки, подборы, транспорт ездоков) — пулы `world/pool.js` с простой формой для теней. Оружие в руках — по сетке на подвижную часть (`weapons/sculpt.js`, строители в `weapons/guns.js`, ряды `VIEW` в `weapons/viewmodel.js`).
- Любой материал сцены проходит `gr.prepareMaterial`, иначе без каскадных теней; новые материалы от появляющихся предметов подхватывает `gr.prepareScene()` раз в 90 кадров.
- Фотоскан допускается только после подгонки (`SCAN_FIT` в `materials.js`, `MODEL_SIZES` и `MODEL_BUDGET` в `models.js`); у каждого использования есть запасной вариант из коробок; игра играет и без `assets/`. Скачивает только пользователь (`tools/fetch-*.mjs`).
- Конвейер: PBR, IBL, каскадные тени, GTAO, bloom, SMAA — `render/pipeline.js`. Контекст просит `high-performance`, откат на умолчание там же.

## Видеокарта и лаунчер (ADR 0008, 0009)

- Страница видеокарту выбрать не может. Определение — `core/gpu.js` `gpuInfo`; интерфейс — `ui/gpu.js` (`select#s-gpu` только под лаунчером, иначе имя и подсказка).
- `npm run play` → `tools/play.mjs`: раздаёт игру через `tools/serve-lib.mjs` (как `server.mjs`), открывает Chrome или Edge окном со своим профилем, ручки `GET /launcher/info`, `POST /launcher/gpu`, `POST /launcher/seen` (только со своим `Origin`). Чистые помощники и их тесты — `tools/launch-lib.mjs`, `tests/tools/launch.test.mjs`. Система и реестр не трогаются.
- Игра пробует `/launcher/info` только на localhost; на сайте и в `file://` проба тихо проваливается.

## Версии (ADR 0010)

`src/core/releases.js` — единственный источник: `RELEASES[0].version` = `package.json` = `package-lock.json`. Из него `npm run notes` пишет `CHANGELOG.md` и `RELEASE_NOTES.md`, а `ui/whatsnew.js` — окно «Что нового». Тест `tests/core/releases.test.mjs` ловит расхождение; `npm run notes -- --check` только проверяет.

## Сборка и выкладка

- `tools/build.mjs` (esbuild): `dist/game.html` (в git; `npm run build` его перезаписывает), `--scans` — со сканами в одном файле, `--web` — `dist/web/` для Pages. Сервер `tools/serve-lib.mjs` отдаёт только `index.html`, `styles.css`, `favicon.svg`, `src`, `assets`, `dist`, `.autopilot` и `node_modules/three`.
- `.github/workflows/pages.yml`: каждый push в `main` гонит `npm ci`, `npm test`, `npm run test:tools`, `npm run build:web` и публикует сайт. Push в `main` меняет публичный сайт — нужно «да» пользователя в чате.

## Соглашения, которые уже устоялись

- Код, комментарии, имена — по-английски; текст игры — по-русски и по-английски в `config.js`. В имена кода марки машин не попадают.
- Новый вид карты, оружие, предмет — строка в таблице, а не ветка кода: `WEAPON_SPECS` + `WEAPON_ORDER` + `VIEW`; `MAP_IDS`; `PIECE_TYPES` + `PIECE_SHAPES` + `PIECE_DRAW`; `FLEET`.
- Общий `world.rng` в постройке «Квартала» не трогать; всё новое — своё зерно.
- Действия клавиш — `ACTIONS` и `DEFAULT_BINDINGS` в `config.js`, экран — `ui/keys.js`; игра спрашивает действия, не коды.
- Настройки — `localStorage['ruined-block-fps.settings.v1']`, умолчания `DEFAULT_SETTINGS` в `config.js`.
- Параметры адреса: `?noscans`, `?autostart` (сразу в бой без захвата курсора), `?shots` (включает `shot()`).

## Где больно

- Карта «Квартал»: любая правка `World.build()` сдвигает `world.rng` и ломает снимок коллайдеров и петли.
- Первый вызов `generateLayout` — 70–120 мс; смена карты 0.5–2 с (первый «старый город» худший). Экран загрузки обязателен.
- Высоты 2.6–4.6 м на новых картах — только для игрока: сетка ботов `core/nav.js` плоская.
- `tests/core/mapgen.test.mjs` — набор правил карт; новая карта обязана пройти его целиком (детерминизм, ≥16 достижимых точек появления, петля ≥ 0.8 м, ≥6 зданий с дверями, нет островов свободных клеток).
