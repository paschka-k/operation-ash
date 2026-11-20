# Предложение в AGENTS.md (волна 15, уровень сборки T3)

`AGENTS.md` принадлежит пользователю и не тронут. Раздел A исправляет то, что в нём теперь неверно; B — новые команды; C — ловушки и указатели; D и E — два подраздела, которых в `AGENTS.md` нет. Пункты прошлого предложения (волна 14) сверены с нынешним кодом: верные вошли сюда, устаревшие выброшены (список — в конце).

Проверено в этой сборке, не перепроверялось:
- оркестратор: `npm test` → 343 passed, 0 failed; `npm run test:tools` → 17 passed, 0 failed.
- слепой приёмщик из чистого клона: `npm ci --prefer-offline` → 3 пакета, 0 уязвимостей (предупреждение `allow-scripts esbuild@0.28.2` безвредно, esbuild работает); `npm test` → 343; `npm run test:tools` → 17; `npm run build` → `dist/game.html` 1.44 MB, 0 встроенных файлов (и перезаписывает закоммиченный `dist/game.html`); `npm run notes` → оба файла `unchanged`; `OPERATION_ASH_HOME=<папка> node tools/play.mjs --dry` → JSON с браузером, выбором видеокарты и аргументами, код 0; `node server.mjs 5185` → игра на http://localhost:5185, меню с v1.5.0, ошибок в консоли нет.
- мной, в этой сессии: `node tools/notes.mjs --check` → `CHANGELOG.md: ok`, `RELEASE_NOTES.md: ok`; `node tools/play.mjs --dry` → JSON, браузер найден (Chrome). `npm run play` не запускался (открывает окно).

## A. Исправить в существующем тексте

1. Вместо «`npm run dashboard           # check the gates, regenerate .autopilot/*`»: `npm run dashboard             # проверить гейты, записать .autopilot/state.json, manifest.md, spec.md и overview.html (двойной клик); код выхода 1, если гейт не прошёл`
2. Вместо «Do not hand-edit `manifest.md`, `spec.md`, `state.json` or `dashboard.html`.»: `- Не правь руками manifest.md, spec.md, state.json, overview.html (их пишет npm run dashboard) и dashboard.html со state.js (живая панель навыка /autopilot, их пишет только .autopilot/ap.py). Источник правды процесса — .autopilot/data.mjs.`
3. Вместо «A bot is one skinned mesh (`src/enemies/soldier.js`). Add gear as parts of that mesh, not as separate meshes.»: `- Бот — одна скинованная сетка (src/enemies/soldier.js); снаряжение — части этой сетки. Исключение — транспорт ездоков: по одному InstancePool на вид в src/enemies/vehicles.js (материалы через prepareMaterial). Поза ездока на транспорте — setRidePose в soldier.js.`
4. Вместо «`npm start                   # http://localhost:5174, no build step`»: `npm start                   # http://localhost:5174, без сборки; другой порт — node server.mjs 5185 (или PORT=5185); сервер отдаёт только index.html, styles.css, favicon.svg, src, assets, dist, .autopilot и node_modules/three`
5. Вместо «`npm run build                # dist/game.html, one file, opens with a double click (no photoscans, kept in git)`»: `npm run build                # dist/game.html, один файл, открывается двойным щелчком (без сканов); файл в git, сборка его ПЕРЕЗАПИСЫВАЕТ — коммить только если сборку просили`
6. Вместо «See `.autopilot/interfaces.md`: module diagram, core contracts, build order.»: `См. docs/architecture.md: два слоя, поток кадра, карты и смена карты, соглашения. Слова — CONTEXT.md, решения — docs/adr/. Границы конкретной сборки — interfaces.md в её папке .autopilot/<сборка>--wip/ (верхний .autopilot/interfaces.md не менялся с 2026-11-13, до волн 14–15).`

## B. Команды и переменные

7. `npm run notes                # переписать CHANGELOG.md и RELEASE_NOTES.md из src/core/releases.js; npm run notes -- --check только проверяет (код 1, если устарели)` — версия и заметки живут в `src/core/releases.js`; новая выкладка = новая верхняя запись в `RELEASES` + `package.json` и `package-lock.json` той же версии (тест `tests/core/releases.test.mjs` это проверяет).
8. `npm run play                 # лаунчер: игра окном Chrome/Edge на выбранной видеокарте (открывает окно; на Windows, нужен npm install); тоже play-windows.cmd двойным щелчком`
9. `node tools/play.mjs --dry     # напечатать, что запустил бы лаунчер (браузер, видеокарты, аргументы), ничего не стартуя; --port N; папка профиля и launcher.json — переменная OPERATION_ASH_HOME`
10. Один файл тестов: `node -e "import('./tests/harness.mjs').then(async h => { await import('./tests/core/maps.test.mjs'); await h.run(); })"` (имя из `tests/core/`; для `tests/tools/` путь тот же).
11. Адрес игры: `?noscans` — без фотосканов, `?autostart` — сразу в бой без захвата курсора, `?shots` — включает `shot()`. Порт и `argv[2]` — только у `server.mjs`.
12. `shot()` шлёт кадр на 127.0.0.1:5175: сначала `node tools/shot-server.mjs <папка> [порт=5175]`, иначе fetch упадёт.
13. Смена карты в браузере: `await __game.switchMap('port')` (id из `MAP_IDS`), `__game.snapshot().map`; состояние после смены — `loading`, дальше `startGame({noLock:true})` или `stepFrames`. Остальное: `__game.startGame({noLock:true})`, `__game.stepFrames(600, 1/60, false)`, `__game.godMode = true`, `__game.input.inject({keys, actions, dx, dy, wheel})`.
14. Игровой цикл идёт в реальном времени между вызовами `javascript_tool`: перед замером ставь паузу или `godMode`.
15. F3 срабатывает только от настоящего `keydown` на `window` (`Game.onKey` в `src/main.js`); `dispatchEvent` на элементе не подходит.
16. `.github/workflows/pages.yml` на каждый push в `main` гонит `npm ci`, `npm test`, `npm run test:tools`, `npm run build:web` и публикует `dist/web`: любой push в `main` меняет публичный сайт и требует «да» пользователя в чате.

## C. Ловушки и указатели

17. Настройки игрока — `localStorage['ruined-block-fps.settings.v1']`; умолчания — `DEFAULT_SETTINGS` в `src/config.js`; клавиши — `ACTIONS` и `DEFAULT_BINDINGS` там же, экран — `src/ui/keys.js`.
18. Оружие, гранаты и экономика: `WEAPON_SPECS`, `WEAPON_ORDER`, `GRENADE`, `ECONOMY` — `src/core/rules.js`; покупки — `src/core/shop.js`, экран — `src/ui/shop.js`; каждый кликабельный элемент — `<button class="btn">`, иначе до него не дойдёт геймпад.
19. Карты: десять, по одной на волну 1–10 (`MAP_IDS` в `src/core/maps.js`); «Квартал» (`block`) рукописный, `World.build()` в `src/world/level.js`, остальные девять порождает `generateLayout` (`src/core/mapgen.js`) и строит `buildGenerated` (`src/world/mapbuild.js`). Не вызывай в `build()` «Квартала» общий `world.rng` и не меняй порядок вызовов: сдвинутся облик, петли и снимок `tests/core/fixtures/street-colliders.json`. Свет и погода — `src/core/atmosphere.js`; смена карты — `src/game/maps.js` (`switchMap`, `ensureMap`).
20. Новая карта или кусок раскладки: коллайдеры только из `layoutColliders`; здания рисуй по `buildingOpenings`/`partitionOf`/`PIECE_SHAPES`, не через `World.building()`; раскладка — общий кэшированный объект, не мутировать. Новый тип куска — `PIECE_TYPES` + `PIECE_SHAPES` + при желании `PIECE_DRAW`. Тест: `tests/core/mapgen.test.mjs` (зазор петли ≥ 0.8 м, ≥16 достижимых точек появления, нет островов свободных клеток).
21. Число ботов в волне N — `3 + 2(N−1)` (`waveCount`); ездоки и босс входят в него. Одно событие `spawn` = одно ядро врага = ровно один `enemyKilled`.
22. Ездоки и боссы: езда `src/core/ride.js`, петли `src/core/routes.js` (читать из `game.world.routes`), правила ввода `src/core/riderlogic.js`, босс `src/core/boss.js`; в игре `src/enemies/riders.js`, `src/enemies/vehicles.js`, `src/game/director.js`. Новое от мира и транспорта чисти везде, где чистят мир: `startGame`, `toMenu`, `revive` (`src/main.js`), магазин, пауза, победа, `switchMap`.
23. Машины: данные `src/core/fleet.js`, геометрия `src/world/fleet.js` (`buildVehicle` коллайдеров не ставит). Без марок, логотипов и сканов в коде и интерфейсе.
24. Видеокарта: определение `src/core/gpu.js` (`gpuInfo`), строка в настройках `src/ui/gpu.js`, лаунчер `tools/play.mjs` + `tools/launch-lib.mjs` + `tools/serve-lib.mjs`. Страница выбрать видеокарту сама не может — только лаунчер; он не пишет в реестр и настройки Windows.
25. Текст в игре — `STR.ru` и `STR.en` в `src/config.js`, обе ветки сразу; код, комментарии, имена — по-английски. Правки `config.js` и `styles.css` — только `Edit` по месту, не переписывание целиком.
26. Фотоскан `covered_car` в игре не используется (убран из `MODEL_IDS`, `MODEL_SIZES`, `MODEL_BUDGET`), но остался в `MODEL_MAP` в `tools/assets-lib.mjs`, и `npm run build:scans` / `build:web` его ещё несут.
27. `.claude/launch.json` сейчас: `game` (`node server.mjs 5174`, рабочая) и `blind` (путь во временную папку чужой сессии, не рабочая). `.worktrees/` (`int`, `rel`, `w11`, `w12`, `w13`) в `.git/info/exclude`, это чужие рабочие деревья старых сборок: не открывай.
28. Известное: `package.json` без поля `engines`; CI на Node 22, локально проверялось на Node 24. `npm ci` печатает безвредное предупреждение `allow-scripts esbuild`.

## D. Подраздел для вставки

### Правка без автопилота

Мелкий баг или доводка после сборки — обычная сессия, без прогона.

Сначала прочитай:
1. `.autopilot/PROGRESS.md` — что не доделано, известные баги, о чём договорились с пользователем.
2. Что правили после последней сборки — первая строка таблицы в «История git».
3. Только если правка их касается: почему сделано так — `docs/adr/`; что значат слова — `CONTEXT.md`;
   что именно просили — `manifest.md` в папке сборки (указана в начале `PROGRESS.md`).

После правки:
- коммит — по правилам из «История git»;
- строка в «Правки без автопилота» в `PROGRESS.md`: дата — что — почему;
- починенный пункт из «Не доделано» или «Известные баги» — удали;
- договорились с пользователем о том, что следующая сборка не должна пересматривать, —
  строка в «Договорились», его словами.

## E. Подраздел для вставки

### История git

Целиком не читай — бери срез под вопрос:

| Вопрос | Команда |
|---|---|
| что правили после последней сборки | `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'` |
| всё, что делали ради требования | `git log --oneline --grep="R02"` |
| история файла | `git log --oneline -10 -- <файл>` |
| когда появился или исчез код | `git log --oneline -S "<фрагмент>"` |
| почему строка такая | `git blame -L <с>,<по> <файл>`, затем `git show <sha>` |
| что внутри коммита | `git show --stat <sha>` |

Срез длиннее ~30 коммитов — отдай его субагенту и возьми выжимку в десять строк.

Первая команда проверена: подстановка даёт коммит `45570ed` («Autopilot: сборка сдана»).

## Из прошлого предложения (волна 14) выброшено или заменено

- Пункт 4 (исключение для транспорта) — взят как A3. Пункт 5 (где лежат `WEAPON_SPECS` и др.) — в C18; верно (`src/core/rules.js`).
- Пункты 12, 13, 15, 16, 20–23, 25, 27–29 — верны, но вошли только то, что не видно из имён и из `docs/architecture.md`; остальное (петли, цели транспорта, гранаты, геймпад, магазин) читай там и в коде.
- Пункт 26 (видеокарта) переписан: «страница выбрать не может» осталось, но появился лаунчер (C24).
- Пункт 30 (`.claude/launch.json`: записи `w11`…`rel`) устарел: записей больше нет (C27).
- Пункт 7 (карта модулей в папке `--wip`) устарел: теперь `docs/architecture.md` (A6).
- Пункт 9 про `dist/game-lite.html`: этот файл есть только в `.gitignore`, команды сборки для него нет; выброшен.
- Оговорка про ветку `waves-11-13` и коммит `d24f370` выброшена: «Автопилот: сборка сдана» в истории есть (`45570ed`).
- Чего не проверял: что `AGENTS.md` не содержит этих строк уже после правки пользователем между волнами — сверено только по тексту, показанному в начале сессии.
