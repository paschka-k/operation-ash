# Границы и правила: волна 14

Читается первым каждым исполнителем и ревьюером. Код проекта описан в `notes.md` (снят до слияния волн 11–13; где после слияния иначе — верен код). Общая карта модулей проекта — `.autopilot/interfaces.md` (верхний), правила — `AGENTS.md`.

## Стек и команды

- JavaScript (ES-модули), Three.js r186 (`node_modules/three`), без фреймворка и без сборки при разработке; Node для тестов и инструментов; esbuild только в `tools/build.mjs`. Новых зависимостей не ставить (`npm install` чего-либо нового — `BLOCKED`).
- Проверка одной командой: `npm test` (все `tests/core/*.test.mjs`, чистый Node). Один файл: `node -e "import('./tests/harness.mjs').then(async h => { await import('./tests/core/<файл>.test.mjs'); await h.run(); })"` из корня.
- Запуск: `npm start` → http://localhost:5174 (в этой сессии сервер уже поднят; исполнителю даётся свой порт и вкладка). Отладка в браузере: `window.__game` — `startGame({noLock:true})`, `stepFrames(n, dt, false)`, `snapshot()`, `input.inject({...})`, `godMode`; `?noscans` — без фотосканов; `?shots` — снимки через `tools/shot-server.mjs`.
- Сборки (`npm run build*`) пишут в `dist/` — исполнители их не запускают; сборку делает оркестратор в конце.
- Не трогать: `.autopilot/` (кроме того, что велит таск), `AGENTS.md`, `CLAUDE.md`, `README.md`, `dist/`, `assets/`, `.claude/`, `.worktrees/`.

## Правила проекта

Из `AGENTS.md` (кратко, полный текст там):
- `src/core` чистый: без three, DOM, window; время `now` (мс) и случайность `rng` приходят параметрами. Тесты только через ядро (`tests/core/*.test.mjs`, `npm test`).
- Числа баланса только в `src/core/rules.js`, слои их не копируют.
- Бот — одна скинованная сетка (`src/enemies/soldier.js`), снаряжение — части этой сетки.
- Динамические предметы — пулы экземпляров (`src/world/pool.js`) с простой формой `proxy` для теней; не сетка на деталь.
- Каждый материал сцены проходит `game.gr.prepareMaterial`.
- Статика уровня собирается до `World._flush` через `box`, `_addGeo` и т. п., иначе нет тени и AO.
- Ничего не скачивать. Всё порождается кодом. Игра строится и играет без `assets/`.
- Процесс проекта: `.autopilot/data.mjs` + `npm run dashboard` — исполнители этой сборки их НЕ трогают (ведёт оркестратор).

Договорились с пользователем (из `carried.md`, дословно):
- Каждая отправка в `main` меняет публичный сайт и требует отдельного «да» пользователя в чате.
- Ничего не скачивать без явного согласия пользователя; согласие от 13 ноября покрыло 13 файлов Poly Haven, не более.
- Скан используется только после подгонки под уровень (`SCAN_FIT`, `MODEL_SIZES`, `MODEL_BUDGET`), уровень строится и играет без `assets/`.
- «Уровень Unreal Engine 5» в WebGL недостижим, говорить об этом прямо (история E02-13).
- Списки, которые приносит пользователь, сначала согласуются; согласованное делается волнами без остановок.
- 14 ноября, решения по списку из десяти пунктов (приняты по моим советам после «start with wave 11, 12 & 13»): этап и уровень означают волну на нынешней карте; магазин после каждой волны, игра на паузе, без таймера; купленное сбрасывается с новой игрой; всё купленное носится сразу; транспорт по порядку самокат, скейт, мотоцикл; мои добавления приняты все (большая карта, гранаты, бесплатные патроны, рост здоровья врагов, волны-боссы); графика после волны 12.
- 14 ноября: после смерти игрок возрождается на той волне, где погиб (R56).
- Порядок волн: 11 управление и экран, 12 экономика и возрождение, 13 шесть стволов и гранаты, 14 транспорт и боссы.

Правила этой сборки:
- Требование `R20` проекта («в волне N ботов 3+2(N−1)») остаётся верным: ездоки и босс входят в это число, а не добавляются сверху.
- Одно событие `spawn` = одно ядро врага = ровно один `enemyKilled`. Спешившийся ездок — то же ядро.
- Новый общий генератор случайности в `build()` уровня не вызывать (`world.rng` сдвинет весь облик уровня); своё — отдельным генератором.
- Код, комментарии и имена — по-английски; текст в игре — `STR.ru` и `STR.en` в `src/config.js`.

## Границы, решённые в спецификации

### 1. Правила — `src/core/rules.js` (раздел `// ---- wave 14: vehicles and bosses`)
- `VEHICLES = { scooter, skate, moto, heavyMoto }`, у каждого: `hp`, `armor` (множитель урона), `speed` (м/с крейсерская), `accel`, `brake` (м/с²), `length`, `width`, `height`, `seatY` (высота системы тела ездока над землёй: `core.y = ride.y + seatY`, таз на `seatY + 0.93·scale` — так решил таск 01, D01), `stance` ('stand' | 'skate' | 'seat'), `ramSpeed` (м/с, с какой скорости наезд бьёт; `Infinity` — не бьёт), `ramDamage`, `ramCooldown` (с), `wreckSecs`, `score` (очки и деньги за подбитый транспорт).
- Новые строки `ENEMY_TYPES` (все поля, как у существующих, плюс): `scooterRider`, `skater`, `biker` (поле `vehicle: 'scooter'|'skate'|'moto'`), `bossBiker` (`vehicle: 'heavyMoto'`, `boss: true`), `bossCommander` (`boss: true`, без транспорта, `grenadeEvery` с). `dmg` в пределах 8..12 (тест). `mountedAcc` — множитель точности на ходу.
- `firstRiderWave = { scooterRider: 3, skater: 5, biker: 7 }`.
- `waveRoster(n, endless)` → `{ [type]: count }` — полный состав волны n, сумма равна `waveCount(n)`; ездоки вырезаются из рядовых, босс — из тяжёлых. `waveComposition(n)` не меняется (остаётся пешей основой, его тесты целы).
- `bossForWave(n)` → `null | 'bossBiker' | 'bossCommander'`: 5 → `bossBiker` (+2 `biker` охраны), 10 → `bossCommander`, в бесконечном режиме каждая пятая по очереди.
- `maxRiders(n, endless)` → 3 или 4: одновременно живых ездоков на транспорте.
- `ZONE_MULT.vehicle = 1`.

### 2. Маршруты — `src/core/routes.js` (новый, чистый)
- `ROUTES` — массив `{ id, points: [[x, z], ...], closed: true, width }`: замкнутые ломаные по свободным местам улиц. Данные, а не поиск пути.
- `buildRoute(def)` → `Route = { id, length, segments, width, sample(s) → {x, z, heading, curvature}, nearest(x, z) → {s, dist} }`; `s` — расстояние вдоль петли в метрах, по модулю `length`. Углы скругляются при построении.
- `routeClearance(route, colliders, step = 0.5)` → наименьший зазор (м) от петли до твёрдых коллайдеров выше 0.42 м; тест проверяет `>= 0.8` на снимке коллайдеров уровня (`tests/core/fixtures/street-colliders.json`, снятом из игры).
- `onRoute(x, z, margin)` → bool: точка ближе `margin` к какой-либо петле (для запрета ставить на петли ящики и бочки).

### 3. Езда — `src/core/ride.js` (новый, чистый)
- `createRide(route, s, kind, rng)` → `Ride = { route, s, kind, speed, x, z, y, heading, lean, blockedT, ramCdT, alive, wrecked, mounted: true }`.
- `stepRide(ride, dt, blockers)` — мутирует: подшаги не длиннее 0.25 м; целевая скорость `VEHICLES[kind].speed`, на поворотах ниже по `curvature`; `blockers = [{x, z, r}]` (игрок, другие ездоки, пешие боты) — тормозит, если блокер впереди в полосе на расстоянии торможения; `blockedT` копит время почти без движения. Возвращает `{ dismount: blockedT >= 3 }`.
- `rideRam(ride, player, now)` → `null | { damage, pushX, pushZ }`: наезд при `speed >= ramSpeed` и касании, не чаще `ramCooldown`.
- `rideAim(ride, e, playerView, now, rng)` — решение ездока стрелять: видимость (`playerView.visible` считает слой), дальность, телеграф, очередь, точность `acc * mountedAcc`; возвращает намерение в форме `thinkEnemy`: `{ fire: {dist} | null, laser, cue }`.
- `crashRide(ride, dir)` — транспорт подбит или ездок убит: скольжение с трением, крен до падения, `wrecked = true`.

### 4. Цели транспорта — `src/core/combat.js`
- Цель с `kind: 'vehicle'` = `{ id, kind, x, y, z, yaw, length, width, height, alive, hp, armor, view }`: `targetZones` даёт одну повёрнутую по `yaw` коробку с зоной `'vehicle'`; `rayTargets` для неё проверяет луч с коробкой и предварительный отсев по её радиусу, а не по 1.0 м; `explode` бьёт её по центру коробки. Существующие цели не меняются.

### 5. Вид транспорта и ездока — `src/enemies/vehicles.js` (новый) и `src/enemies/soldier.js`
- `createVehicles(game)` → `Vehicles = { add(kind) → handle, place(handle, x, y, z, heading, lean, roll), wreck(handle), remove(handle), clear(), pools }`: на вид транспорта один `InstancePool` с `proxy`; геометрия порождается кодом (покраска по вершинам, как у `Sculpt`), материалы через `prepareMaterial`.
- `soldier.js`: строки `LOOK` для пяти новых типов (босс крупнее, своя броня частями той же сетки); `setRidePose(model, stance)` — поза ездока костями скелета (`hips`, `legs`, `torso`); `STANCE` для оружия ботов, если нужно новое (пистолет-пулемёт держится как пистолет).

### 6. Ездоки в игре — `src/enemies/squad.js` и новый `src/enemies/riders.js`
- `enemies.spawnRider(type, route, s, tier, opts)` → `Enemy` с `core.mounted = true`, `core.ride` (из `createRide`), `core.vehicle` (цель `kind: 'vehicle'`, `view.takeDamage` которой бьёт транспорт).
- `Enemy.update`: пока `core.mounted` — путь ездока (`stepRide`, `rideAim`, `rideRam`), без `thinkEnemy`; поза `setRidePose`; `core.y = ride.y + seatY`.
- Транспорт подбит (`hp <= 0`) → `crashRide`, `core.mounted = false`, ядро становится пешим на месте падения (`state = 'combat'`, `path = null`), убийство не засчитывается. Ездок убит на ходу → обычная смерть (одна), транспорт `crashRide`.
- `enemies.targets` возвращает ядра и живые цели транспорта; ИИ (`separate`, `alertNearby`, `hearNoise`) по-прежнему ходит только по ядрам.
- Обломки: `wreckSecs` или до `waveCleared`, затем удаляются; коллайдера у обломков нет.
- `clear()` убирает транспорт, обломки и гасит звуки.

### 7. Директор, HUD, звук
- `director`: событие `spawn` с типом ездока → петля и точка `s`: точка не видна игроку и не ближе 25 м; одновременно не больше `maxRiders`; иначе тип ждёт в очереди. Босс — `hud.bossBar(enemy)`, баннер `БОСС: <имя>`. Первое появление вида ездока — подпись под баннером волны.
- `hud`: `#h-boss` (полоса вверху экрана, имя, заполнение), `bossBar(enemy | null)`, строки ленты для `source`: `'dismount'` (сбит с транспорта, без засчитанного убийства — только очки и деньги за транспорт) и `'vehicle'` (наезд); радар и большая карта рисуют ездока другим значком.
- `audio`: `engine(kind) → voice { update(pos, speed), stop() }` — зацикленный голос с `PannerNode`, двигающимся каждый кадр; одновременно не больше 3 голосов (ближайшие); `vehicleCrash(pos)`, `bossIntro()`. Без `ready` и при выключенном звуке молчит.
- `player`: поле отбрасывания `knock = {vx, vz}`, которое `step` прибавляет к желаемой скорости и гасит за ~0.4 с; `damage(amount, x, z, 'vehicle')`.

### 8. Босс-командир — `src/core/boss.js` (новый, чистый) и `squad.js`
- `thinkBoss(e, world, dt, now)` оборачивает `thinkEnemy`: длинные очереди, раз в `grenadeEvery` с намерение `grenade: {x, z}` при видимости игрока; стоит дольше 4 с — идёт к игроку (`chase`). Бросок гранаты делает слой через API гранат волны 13.
- Граната врага (решено после обновления `notes.md`): сейчас `game.grenades.launch(eye, unitDir, vel)` бросает только по направлению, а взрыв (`props.explode(..., 'grenade')`) ранит всех ботов и засчитывает их игроку. Таск 03 добавляет в `src/game/grenades.js` бросок врага `launchAt(from, target, {owner: 'enemy'})` с баллистическим расчётом скорости до точки (чистая функция расчёта — в `src/core/grenade.js`, таск 01 или 03, с тестом); взрыв гранаты врага ранит игрока, ящики и бочки, но не ботов, и никому не засчитывает убийство.

### 7a. Где гасить новое (из обновлённых `notes.md`)
- Голоса двигателей, транспорт, обломки и полоса босса убираются во всех местах, где сейчас гасят звуки оружия и чистят мир: `startGame`, `toMenu`, `revive`, открытие магазина (`showShop`), пауза (голоса — тише или стоп), победа. `audio.update` не идёт на паузе и в магазине, поэтому голоса там гасятся явно.

### 9. Что даёт волна 12 (ветка `wave-12`, 232b499) — опираться на это
- Событие `spawn` несёт `hpMult` (`waveHpMult(n) = 1 + 0.06·(n−1)`, растёт и в бесконечном режиме); его применять и к ездоку, и к здоровью транспорта, и к боссу.
- Фаза ядра `'shop'` после каждой отбитой волны (событие `waveCleared` = `{wave, stage}`), состояние игры `game.state === 'shop'`: симуляция стоит. Обломки и транспорт к магазину должны быть убраны.
- Возрождение: `main.revive()` → `enemies.clear()`, `props.clear()`, `fx.clear()`, `world._places()`, `player.reset()`, `director.revive()`. Всё новое (транспорт, обломки, голоса двигателей, полоса босса) обязано убираться из этой цепочки так же, как из `startGame`.
- Деньги за убийство = `killScore` очков; `enemyKilled` один раз на ядро.

## Швы для тестов
- `src/core/routes.js`, `src/core/ride.js`, `src/core/boss.js`, `rules.js` (`waveRoster`, `bossForWave`, `maxRiders`), `combat.js` (цели `vehicle`) — `tests/core/*.test.mjs`.
- Снимок коллайдеров улиц `tests/core/fixtures/street-colliders.json` — снимается из игры (`__game.world.colliders`) и проверяет петли без браузера.

## Что построили законченные таски

### 01 — ядро, петли, езда, заглушки, видеокарта
- rules: `VEHICLES{scooter,skate,moto,heavyMoto}`, `RIDE`, `BOSS{…,throwTime}`, `RIDER_RULES`, `firstRiderWave`, `waveRoster(n, endless)` → `{type: count}`, `bossForWave(n)` → `null | 'bossBiker' | 'bossCommander'`, `maxRiders(n, endless)` → 3 | 4, `ZONE_MULT.vehicle = 1`; пять строк `ENEMY_TYPES` (`scooterRider`, `skater` с `weapon: 'smg'`, `biker`, `bossBiker`, `bossCommander`; поля `vehicle`, `mountedAcc`, `boss`, `grenadeEvery`). `startWave` строит очередь из `waveRoster`.
- routes: `ROUTES` = `main` (156 м, через перекрёсток), `north` (47 м), `south` (40 м); точка `[x, z]` или `[x, z, cornerRadius]`; `buildRoute(def)` → `{id, length, width, closed, segments, sample(s, out?), nearest(x, z)}`; `routeClearance(route, colliders, step = 0.5)`; `onRoute(x, z, margin, routes?)`; `levelRoutes()`; `ROUTE_KEEP_CLEAR = 1.2`. Наименьший зазор 0.83 м. `level.js` не менялся; ящики и бочки не встают ближе 1.2 м к петлям.
- ride: `createRide(route, s, kind, rng)` → Ride (`+curvature, impact, phase`); `stepRide(ride, dt, [{x, z, r}])` → `{dismount}`; `rideRam(ride, {x, z, radius?, alive?}, now)` → `null | {damage, pushX, pushZ}` (push в м/с); `rideAim(ride, e, {x, z, visible, alive?}, now, rng)` → `{fire: {dist, acc} | null, laser, cue}`; `crashRide(ride, dir?)`.
- combat: цель `{kind: 'vehicle', x, y, z, yaw, length, width, height, alive, hp, armor, view}` → зона `'vehicle'`.
- boss: `thinkBoss(e, world, dt, now)` → намерение `thinkEnemy` + `grenade: {x, z} | null`. grenade: `launchGrenadeAt({from, target, now})` — бросок в точку (для командира).
- gpu: `core/gpu.js` `gpuInfo(raw)` → `{raw, name, kind, hint}`; `gr.gpu`, `gr.powerPreference`; `ui/gpu.js` `createGpuInfo(game)` (CSS подсказки внедряется из этого файла); `hud.fpsLine(n)`; `settings.gpuHintClosed`.
- vehicles (заглушка, серые коробки): `createVehicles(game)` → `{add(kind) → {kind, copy, wrecked}, place(h, x, y, z, heading, lean, roll), wreck, remove, clear, pools, count}`. soldier: `setRidePose(model, stance)` (заглушка). sfx: `engine(kind)` → `{update(pos, speed), stop()}` (молчит), `vehicleCrash(pos)`, `bossIntro()`.
- Оговорки 01, обязательные для 02 и 03: `seatY` — высота системы тела ездока, а не таза: `core.y = ride.y + seatY` держит зоны попадания на месте, таз оказывается на `seatY + 0.93·scale` (у мотоцикла −0.1, у тяжёлого −0.25 под масштаб босса). У `'smg'` нет строки `STANCE`/`MUZZLE` — скейтер пока с видом винтовки (это 02). На волне 5 охрана главаря — два мотоциклиста, поэтому мотоциклисты впервые появляются на волне 5, а не на 7 (подпись первого появления решает 03).

### 03 — ездоки и боссы в бою
- enemies: `spawnRider(type, route, s, tier, opts)` → Enemy · `mountedCount()` · `riders {mount, ride, riderKilled, update, targets(), occupied(), clearWrecks(), silence(), clear(), mounted, wrecks, vehicles}` · `touchTargets()` · `shielded(fn)` · `targets` содержит и живые цели транспорта · `raycast` возвращает VehicleView `{alive, pos, hp, T.key 'v_<kind>', P.hp, takeDamage}`. Enemy: `shoot(dist, now, acc?)`, `throwGrenade({x, z})`.
- grenades: `launchAt(from, target, {owner})` → граната с `.owner`; `harmless(fn)`. player: `knock {vx, vz}`, `knockBack(vx, vz)`, урон вида `'vehicle'`.
- hud: `bossBar(enemy | null)`, `bossDown(name)`, источники ленты `'dismount'` и `'vehicle'` (pts null), `radarRiders`, `bigMapRiders`, `#h-boss`. director: `spawnRider(ev)`, `announceBoss(e)`, `onVehicleDestroyed(enemy, kind)`, `onRam(enemy)`, `riderNews(wave, endless)`.
- core/riderlogic: `isRider`, `riderSlotFree`, `deferSpawn(g, type, next)`, `pickRiderSpawn(routes, player, visible, {rng, occupied})`, `payVehicle(g, kind)`, `vehicleHp(kind, hpMult)`, `newRiderKinds(roster, seen)`, `riderMarkerAlpha(mode, sinceFired, mounted)`, `RIDER_SPAWN`, `RIDER_MARKER`. `snapshot()` даёт `riders, wrecks, vehicles`.
- Оговорки 03: метки ездоков на большой карте рисует hud.js поверх холста bigmap.js; 24a не держится буквально (ярус 3 ×1.15 к здоровью сверх `waveHpMult`), множитель применён точно к ездокам, транспорту и боссам; подписи нового вида на волнах 3 и 5 (мотоциклисты объявлены на 5 как охрана); граната врага уводит цепочки бочек от ботов через `props.timers`; ездок не поворачивается к игроку при стрельбе; обломки не мешают ездокам.

### 02 — вид и звук
- vehicles: подписи прежние + `wrecks` (пул обломков на вид) и экспорт `buildVehicleModel(kind, wrecked)`. soldier: `setRidePose(model, stance, lean = 0)` (`stance` null — снова пеший), `buildSoldier()` даёт ещё `type` и `torsoYaw`, новый `MUZZLE.smg`. audio: `engine(kind)` → `{update(pos, speed), stop()}`, `vehicleCrash(pos)`, `bossIntro()`, `play('vehicleCrash' | 'bossIntro')`.
- Оговорки 02: в браузере исполнитель ничего не видел (вкладки и сервера не было); вызовы отрисовки оценены (до 30 на три вида), не измерены; ездок не наклоняется с транспортом — riders.js сбрасывает крен корня, нужен `setRidePose(M, stance, ride.lean)`; сборка 8 моделей ~0.6 с. Оркестратор после посадки видел в игре самокатчика на волне 3 (стоит на деке, держит руль, имя и полоса здоровья), ошибок в консоли нет.

### 04 — клавиша гранаты на виду
- hud: `toast(text, secs = 1.6)`, блок `#mainkeys` с кнопкой `#btn-mkeys` вверху «Настроек»; director: `grenadeTipDue`; строки `mainKeys`, `grenadeTip`.
