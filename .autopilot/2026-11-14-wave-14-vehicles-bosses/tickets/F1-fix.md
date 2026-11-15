# F1 — Ремонт ветки по ревью

**Требования:** R01, R02, R03, R06, R14i, G01
**Зависит от:** —
**Зона:** `src/core/ride.js` · `src/core/rules.js` · `src/core/riderlogic.js` · `src/core/gpu.js` · `tests/core/` · `src/enemies/vehicles.js` · `src/enemies/riders.js` · `src/enemies/soldier.js`
**Волна:** 4
**Ревью:** да — ремонт ветки
**Модель:** сильная

## Что должно заработать

Транспорт и ездок наклоняются в поворот, а не из него; все числа баланса волны 14 лежат в `rules.js`; обломки мешают ездокам, как любое препятствие, а спешившийся из-за блокировки ездок оставляет целый транспорт; встроенная графика AMD узнаётся как встроенная.

## Из брифа, дословно

> «противники на самокатах, скейтах и мотоциклах»
> «подбитый транспорт оставляет ездока пешим»
> «use allways the most performed GPU of the System. Don't use only the onboards GPU!»

## Разделы спецификации

Истории 1–3, 9–11, 20, 28, 31; `interfaces.md` §1, §3, §5, §6 и «Что построили законченные таски».

## Критерии приёмки

Находки ревью ветки, дословно (первые две — «fix now»; третья и четвёртая взяты из «report» решением оркестратора, сказано пользователю):

- [ ] src/core/ride.js:110 (рисуют src/enemies/vehicles.js:716 и src/enemies/riders.js:107) · Every vehicle and its rider lean OUT of every turn. The code sets lean = +atan(v²κ/g), and both place() and the rider's root roll by −lean in Euler YXZ. That tips the top toward (cos h, −sin h), which on a positive-curvature arc points away from the arc centre. · Condition: on every arc the vehicle's up vector, Euler(0, heading, −lean, 'YXZ')·ŷ, has a positive component toward the arc centre. A test in tests/core/ride.test.mjs pins the sign: on an arc, lean · ((cos h, −sin h)·(centre − pos)) > 0. A wreck without a hit direction (crashRide) then falls to the inside of the turn.
- [ ] Balance numbers outside rules.js: src/core/ride.js:208 rider reload 1800 ms; src/enemies/soldier.js:259 STANCE_SEAT_Y repeats VEHICLES.seatY as literals 0.16/0.11/−0.1; src/core/riderlogic.js:22,25 RIDER_SPAWN 25/2/12 and RIDER_MARKER 0.85, while the matching MAP_MARKERS lives in rules.js; src/enemies/riders.js:254-255 dismount reaction 0.7/0.3 s and flinch 0.5 s. · Condition: every one of these values is read from rules.js (e.g. RIDE.reloadSecs, RIDE.dismountReact, RIDER_SPAWN and RIDER_MARKER moved into rules.js and re-exported from riderlogic). STANCE_SEAT_Y is derived from VEHICLES, not typed again. npm test stays green.
- [ ] src/enemies/riders.js:72,111-125,195-203 · Riders ignore wrecks: the next rider drives straight through a wreck in his lane; occupied() leaves wrecks out, so a new rider can spawn on top of one; a moto lying on its side can stick into a wall where the loop clears it by only 0.83 m; a rider who gets off because he is blocked leaves a burnt, crashed wreck with the crash sound. · Condition: wrecks count as blockers and as occupied spots, and getting off when blocked leaves the intact vehicle without crash effects.
- [ ] src/core/gpu.js:13 · "AMD Radeon RX Vega 10 Graphics" and "AMD Radeon R7 Graphics" are integrated APU graphics but come out as discrete, so no hint appears. · Condition: the integrated Vega/R-series names are matched before DISCRETE (test on both strings; Iris Xe and RTX 4070 unchanged).
- [ ] `npm test` зелёный; в браузере на петле `main` мотоцикл и самокат в повороте наклонены внутрь (снимок), без ошибок консоли
