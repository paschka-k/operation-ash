# Границы и швы

Один шов для тестов: `src/core`. Он не знает про three, DOM, window и время стены. Всё остальное слои игры, которые читают ядро через фабрики.

## Схема

```
index.html ── src/main.js (Game: состояния, цикл, сборка)
               │
   ┌───────────┼──────────────────────────────────────────────────┐
   │ render/   │ world/          │ player/   │ weapons/  game/      │ enemies/  ui/   audio/
   │ pipeline  │ level scatter   │ controller│ viewmodel shooting   │ squad     hud   sfx
   │ materials │ details props   │ input     │           director   │
   │ models    │ effects         │           │                      │
   └───────────┴─────────────────┴───────────┴──────────────────────┴──────────────────
                                   │ только вызовы чистых функций
                                   ▼
                      src/core  (ШОВ ДЛЯ ТЕСТОВ, tests/core/*.test.mjs)
          math · collision · rules · weapons · combat · ai · waves · nav · cover
```

## Правила границ

1. `src/core` импортирует только `src/core`. Ни `three`, ни `document`, ни `window`, ни `performance.now()`.
2. Время приходит параметром `now` в миллисекундах. Случайность приходит параметром `rng`; `Math.random` встречается только как значение этого параметра по умолчанию. Один seed даёт одну игру.
3. Ядро не мутирует чужие данные без причины: `explode` и `moveBody` чистые, `stepBody`, `tickGame`, `tickWeapons` и `thinkEnemy` мутируют своё состояние и об этом сказано в имени или комментарии.
4. Слои игры не дублируют правила. Скорость, урон, темп, волны и точность читаются из `core/rules.js`.
5. Слои создаются фабриками `createX(game)` и получают остальное через объект `game` (контекст). Прямые импорты между слоями ограничены тремя случаями: любой слой может читать `config.js` и `core`; `world` читает `render/materials` и `render/models`; `game/shooting` владеет `weapons/viewmodel`. Всё остальное идёт через `game`.
6. Данные вместо веток: оружие, враги, ярусы волн, качество и строки живут в таблицах (`WEAPON_SPECS`, `ENEMY_TYPES`, `TIERS`, `QUALITY`, `STR`).

## Контракты ядра

| Модуль | Что отдаёт | Заметки |
|--------|-----------|---------|
| `math` | `vec3`, `v3`, `clamp`, `lerp`, `damp`, `angleDiff`, `createRng(seed)`, `randomCone` | `createRng` возвращает функцию с `.range`, `.int`, `.pick` |
| `collision` | `makeBox`, `stepBody`, `moveBody`, `standingHeight`, `raycast`, `rayBox`, `lineOfSight`, `raySphere`, `rayVerticalCylinder` | AABB с полями `solid`, `blocksBullets`, `navIgnore`, `kind` |
| `nav` | `NavGrid(half, cell, margin)`: `addBox`, `removeBox`, `blockedAt`, `walkable`, `findPath`, `reachableFrom`, `nearestFree` | в игре клетка 0.5 м и поле 0.4 м, чтобы двери 2 м оставались проходимыми |
| `cover` | `generateCoverPoints`, `indexCover`, `findCover` | точки на расстояниях 0.9, 1.25, 1.7 м от стены |
| `rules` | `PLAYER`, `WEAPON_SPECS`, `ENEMY_TYPES`, `TIERS`, `waveCount`, `waveTier`, `maxAlive`, `waveComposition`, `effectiveSpread`, `damageAtRange`, `botHitChance`, `killScore`, `explosionDamage`, `regenHealth`, `applyMedkit`, `applyAmmoPickup` | единственное место чисел баланса |
| `weapons` | `createArsenal`, `tryFire`, `beginReload`, `switchTo`, `tickWeapons`, `setStance`, `spreadDeg`, `totalAmmo`, `reloadProgress`, `addAmmo`, `addAmmoAll`, `resetArsenal` | состояние оружия в одном объекте, `now` в мс |
| `combat` | `resolveShot`, `applyDamage`, `explode`, `targetZones`, `rayTargets` | `resolveShot` возвращает попадание, зону, точку |
| `ai` | `createEnemy`, `thinkEnemy`, `enemyHurt`, `hearNoise`, `alertNearby` | `thinkEnemy` возвращает намерение `{moveX, moveZ, speed, fire, laser, cue, alert}` |
| `waves` | `createGame`, `restart`, `tickGame`, `enemyKilled`, `damagePlayer`, `continueEndless`, `setPaused`, `recordShots`, `resultStats` | `tickGame` возвращает события `waveStart`, `spawn`, `waveCleared`, `victory` |

## Слои игры

| Слой | Фабрика | Что делает | Читает из ядра |
|------|---------|-----------|----------------|
| `render/pipeline` | `createPipeline(canvas, settings)` | рендерер, небо, каскадные тени, постобработка, пресеты качества | нет |
| `render/materials` | `loadTexturePack`, `getMaterial`, `pbrMaterial` | процедурные PBR-наборы, замена файлами из `assets/textures` | нет |
| `render/models` | `loadModelPack`, `getModel`, `getModelGeometry` | glTF из `assets/models`, запасные примитивы | нет |
| `world/level` | `buildLevel(scene, game)` | геометрия, коллайдеры, сетка, укрытия, точки появления | `collision`, `nav`, `cover` |
| `world/details` | `addBigProps`, `addInteriors`, `addDetails` | уличная мебель, интерьеры, детали выше глаз | `collision` |
| `world/scatter` | `createScatter(scene, level, quality)` | тысячи мелких объектов инстансингом | нет |
| `world/props` | `createProps(game)` | ящики, бочки, подбор предметов | `combat.explode`, `rules` |
| `world/effects` | `createEffects(game)` | частицы, следы, трассеры, гильзы, свет | нет |
| `player/controller` | `createPlayer(game)` | движение, камера, здоровье через `core/waves` | `collision`, `rules` |
| `player/input` | `createInput(game)` | клавиатура, мышь, захват указателя, `inject()` для тестов | нет |
| `weapons/viewmodel` | `createViewmodel(game)` | модели оружия и анимации, только вид | нет |
| `game/shooting` | `new Shooting(game)` | ввод → арсенал ядра → выстрел → эффекты | `weapons`, `combat` |
| `game/director` | `new Director(game)` | события волн → появление ботов, баннеры, звук | `waves` |
| `enemies/squad` | `createSquad(game)` | вид и тело бота вокруг `core/ai` | `ai`, `combat`, `cover` |
| `ui/hud` | `createHud(game)` | HUD, меню, экраны | нет |
| `audio/sfx` | `createAudio(game)` | синтез звука | нет |

## Порядок сборки в `main.js`

`audio → fx → buildLevel → scatter → player → input → weapons → enemies → director → prepareScene`. Часы игры обнуляются до старта директора (ошибка, найденная при приёмке: иначе после перезапуска первая волна ждала столько секунд, сколько длилась прошлая игра).

## Как проверять

- Правила: `npm test` (тесты ядра, обычный Node).
- Игра целиком: открыть `http://localhost:5174/` и работать через `window.__game`: `startGame({noLock:true})`, `stepFrames(n, dt, render)`, `snapshot()`, `countVisibleItems(x, y, z, yaw, pitch)`, `input.inject({keys, left, right})`. Снимок холста: добавить `?shots` к адресу и запустить `node tools/shot-server.mjs <папка> 5175`.
