# Предложение в AGENTS.md (волна 14, уровень сборки T1)

Файл `AGENTS.md` принадлежит пользователю и не тронут. Ниже строки для вставки. Раздел A исправляет то, что в тексте теперь неверно или неполно; B, C — новое; D, E — два подраздела, которых в `AGENTS.md` нет. Проверено в этой сборке: `npm test` → 279 passed, 0 failed; `npm run test:tools` → 6 passed; `npm run build` → `dist/game.html` 1.18 MB, 0 встроенных файлов; `npm run build:web` → `dist/web/index.html` 1.18 MB + 29 файлов рядом (24.65 MB); `node server.mjs 5187` → `/` отвечает 200; Node v24.18.0, three 0.186.1, esbuild 0.28.2.

## A. Исправить в существующем тексте

1. Вместо «`npm run dashboard  # check the gates, regenerate .autopilot/*`»: `npm run dashboard            # проверить гейты, записать .autopilot/state.json, manifest.md, spec.md и overview.html (двойной клик); код выхода 1, если гейт не прошёл`
2. Вместо «Do not hand-edit `manifest.md`, `spec.md`, `state.json` or `dashboard.html`»: `- Не правь руками manifest.md, spec.md, state.json, overview.html (их пишет npm run dashboard) и dashboard.html (живая панель автопилота, её пишет он сам). Источник правды процесса — .autopilot/data.mjs.`
3. Вместо «`npm start  # http://localhost:5174, no build step`»: `npm start                   # http://localhost:5174, без сборки; другой порт — node server.mjs 5187 (или переменная PORT); сервер отдаёт только index.html, styles.css, src, assets, dist, .autopilot и three из node_modules`
4. К правилу про бота («A bot is one skinned mesh») добавить: `- Исключение — транспорт ездоков волны 14: по одному InstancePool на вид в src/enemies/vehicles.js (материалы через prepareMaterial, у обломков свой пул). Ездок остаётся одним скинованным ботом, его поза на транспорте — setRidePose в src/enemies/soldier.js.`
5. К «A new weapon is one row in `WEAPON_SPECS`…» добавить место: `- WEAPON_SPECS, WEAPON_ORDER, GRENADE и ECONOMY лежат в src/core/rules.js; цены и покупки — src/core/shop.js.`
6. К «`?shots` in the address enables `shot()`»: `- shot() шлёт кадр на 127.0.0.1:5175: сначала node tools/shot-server.mjs <папка> [порт=5175], иначе fetch упадёт.`
7. К «Layout»: `Карта модулей текущей сборки — .autopilot/<папка сборки>--wip/interfaces.md (границы волны 14 и что построил каждый таск); общая — .autopilot/interfaces.md.`

## B. Команды и переменные

8. `node -e "import('./tests/harness.mjs').then(async h => { await import('./tests/core/ride.test.mjs'); await h.run(); })"   # один файл тестов, подставь имя из tests/core/`
9. `npm run build` пишет и коммитится `dist/game.html`; `dist/web/`, `dist/game-scans.html`, `dist/game-lite.html` в .gitignore. Сборки запускает только оркестратор; исполнитель задачи `dist/` не трогает.
10. `.github/workflows/pages.yml` на каждый push в `main` гонит `npm ci`, `npm test`, `npm run test:tools`, `npm run build:web` и публикует `dist/web`: любой push в `main` меняет публичный сайт и требует «да» пользователя в чате.
11. Адрес игры: `?noscans` — без фотосканов, `?autostart` — сразу в бой без захвата курсора, `?shots` — включает `shot()`. PORT и `argv[2]` — только у `server.mjs`.
12. Настройки игрока — `localStorage['ruined-block-fps.settings.v1']`; умолчания и ключи — `DEFAULT_SETTINGS` в `src/config.js`; раскладка клавиш — `settings.bindings`, `mergeBindings` дополняет недостающие действия умолчаниями.
13. Проверка в браузере: `__game.startGame({noLock:true})`; `__game.stepFrames(600, 1/60, false)`; `__game.godMode = true`; `__game.snapshot()` (волна, фаза, `riders`, `wrecks`, `vehicles`); `__game.input.inject({keys, actions, dx, dy, wheel})`.
14. Игровой цикл идёт в реальном времени между твоими вызовами: перед замером ставь паузу или `godMode`, не считай состояние неподвижным.
15. Вызовы отрисовки за кадр: `gr.renderer.info.autoReset = false; gr.renderer.info.reset(); gr.render(0.016); gr.renderer.info.render.calls`; без этого счётчик покажет 1.
16. F3 срабатывает только от настоящего `keydown` на `window` (`Game.onKey` в `src/main.js`); `dispatchEvent` на элементе не подходит.

## C. Ловушки и места, где правят чаще всего

17. Правила: `src/core/*` чистое, числа только в `src/core/rules.js`. Волна 14 — раздел `// ---- wave 14: vehicles and bosses` (`VEHICLES`, `RIDE`, `BOSS`, `RIDER_RULES`, `RIDER_SPAWN`, `RIDER_MARKER`, `firstRiderWave`, `waveRoster`, `bossForWave`, `maxRiders`).
18. Ездоки и боссы: езда — `src/core/ride.js`, петли — `src/core/routes.js`, босс-командир — `src/core/boss.js`, правила ввода в бой — `src/core/riderlogic.js`; в игре: `src/enemies/riders.js` (ездок), `src/enemies/vehicles.js` (вид), `src/enemies/squad.js` (`Enemy.update` отдаёт ездока в `riders.ride`), `src/game/director.js` (`spawnRider`, `announceBoss`, `onVehicleDestroyed`, `onRam`).
19. Число ботов в волне N остаётся `3 + 2(N−1)` (`waveCount`): ездоки и босс входят в него, не добавляются. Одно событие `spawn` — одно ядро и ровно один `enemyKilled`; ездок, сбитый с транспорта, — то же ядро, убийство не засчитывается, транспорт платит `payVehicle`.
20. Петли — данные, не поиск пути: точка `[x, z]` или `[x, z, радиус]`; после правки уровня проверь `routeClearance` ≥ 0.8 м тестом `tests/core/routes.test.mjs` на снимке `tests/core/fixtures/street-colliders.json`; снимок снимается из игры (`__game.world.colliders`). Ящики и бочки не ставятся ближе `ROUTE_KEEP_CLEAR` (1.2 м) к петле (`src/world/props.js`).
21. Не вызывай в `build()` уровня общий генератор (`world.rng`): сдвинется облик всего уровня. Нужна случайность — свой генератор.
22. Новое от транспорта нужно убирать везде, где чистят мир: `startGame`, `toMenu`, `revive` (в `src/main.js`), магазин, пауза, победа; иначе остаются обломки, голоса двигателей и полоса босса. Голоса гаснут явно: `audio.update` на паузе и в магазине не идёт.
23. Цель транспорта в `src/core/combat.js` — `kind: 'vehicle'`, зона `'vehicle'`, одна повёрнутая по `yaw` коробка; ИИ (`separate`, `alertNearby`, `hearNoise`) ходит только по ядрам, `enemies.targets` отдаёт и ядра, и живые цели транспорта.
24. Текст в игре — `STR.ru` и `STR.en` в `src/config.js`, обе ветки сразу; код, комментарии, имена — по-английски. Здоровье врагов растёт по `waveHpMult(n)` и применяется к ездоку, транспорту и боссу.
25. Гранаты: полёт и взрыв — `src/core/grenade.js` (`launchGrenade`, `launchGrenadeAt`, `stepGrenade`), в сцене — `src/game/grenades.js`; граната врага (`launchAt(from, target, {owner:'enemy'})`) ранит игрока, ящики и бочки, не ботов и не засчитывает убийство. Клавиша — действие `grenade` (G), подсказка — `grenadeTip` в `src/ui/hud.js`.
26. Видеокарта: определение — `src/core/gpu.js` (`gpuInfo`, регэкспы `BUILT_IN`, `DISCRETE`, `SOFTWARE`; тест `tests/core/gpu.test.mjs`), контекст с `powerPreference: 'high-performance'` и откат на умолчание — `src/render/pipeline.js`, подсказка в меню и строка в настройках — `src/ui/gpu.js` (`settings.gpuHintClosed`), имя карты в F3 — `hud.fpsLine`. Страница выбрать видеокарту не может: игра только называет её и подсказывает, как переключить браузер.
27. Магазин: правила — `src/core/shop.js` (`shopOffers`, `buyWeapon`, `buyUpgrade`, `buyGrenade`, `buyArmor`, `refillAmmo`), экран — `src/ui/shop.js`; состояние игры `'shop'` после каждой волны, симуляция стоит. Каждый кликабельный элемент — `<button class="btn">`, иначе до него не дойдёт геймпад.
28. Геймпад: таблицы кнопок и чистые функции — `src/core/gamepad.js` (`PAD_PLAY`, `readPad`, `navDirection`), чтение в кадре — `src/player/gamepad.js` (`poll(dt)` из `main.js`). Пад не даёт пользовательского жеста: курсор не захватывается, `game.lastDevice` говорит, кто действовал последним.
29. Клавиши: действия — `ACTIONS` и `DEFAULT_BINDINGS` в `src/config.js`, экран переназначения — `src/ui/keys.js`; игра спрашивает действия, не коды. Новое действие — строка в обоих списках и подпись.
30. `.claude/launch.json` содержит записи `w11`…`rel` (на `.worktrees/`, которые могут не существовать) и `blind` (путь во временную папку): рабочая только `game`. Папку `.worktrees/` не открывай.

## D. Подраздел для вставки

### Правка без автопилота
Мелкий баг или доводка после сборки — обычная сессия, без прогона. Сначала прочитай `.autopilot/PROGRESS.md` (что не доделано, известные баги, о чём договорились); что правили после последней сборки — первая строка таблицы в «История git». После правки: коммит по правилам из «История git»; строка в «Правки без автопилота» в `PROGRESS.md`: дата — что — почему; починенный пункт из «Не доделано» или «Известные баги» удали; договорённость с пользователем — строка в «Договорились», его словами.

## E. Подраздел для вставки

### История git
Целиком не читай — бери срез под вопрос: что правили после последней сборки — `git log --oneline "$(git log -1 --format=%h --grep='^Autopilot: сборка сдана')"..HEAD -- . ':(exclude).autopilot'`; всё ради требования — `git log --oneline --grep="R02"`; история файла — `git log --oneline -10 -- <файл>`; когда появился код — `git log --oneline -S "<фрагмент>"`. Коммит: заголовок — что, тело — почему, трейлер `--trailer "Requirements: R02"`, если правка касается требования. Заголовок `Autopilot: сборка сдана` пишет только автопилот.

Оговорка к строке про «после последней сборки» (вставить следом, если пользователь согласен): `- В ветке waves-11-13 коммита «Autopilot: сборка сдана» пока нет, и подстановка в первой команде пуста (срез получится пустым). Ориентир до первой сдачи — слияние d24f370: git log --oneline d24f370..HEAD -- . ':(exclude).autopilot'.`
