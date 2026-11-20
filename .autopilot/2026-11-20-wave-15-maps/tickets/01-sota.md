# 01 — Список современных функций и технологий

**Требования:** R01, R01.1, R01.2
**Зависит от:** —
**Зона:** `docs/state-of-the-art.md`
**Волна:** 1
**Ревью:** нет
**Модель:** обычная

## Что должно заработать

Владелец игры открывает `docs/state-of-the-art.md` и видит всё, что современные шутеры и браузерные технологии 2024–2026 умеют и что могло бы войти в «Операцию «Пепел»», — с честной оценкой: что в игре уже есть, что выполнимо в браузере сейчас, что требует WebGPU, сервера, загрузок или аккаунтов, и сколько это стоит. Из этого списка он выберет следующие волны. Это документ, не код: в коде ничего не меняется.

## Из брифа, дословно

> «please provide me a list of all the possible new features and functions that are state of the art. please see below some ideas fgrom my site»

## Разделы спецификации

Истории 1–3 (`spec.md`), Решения — «Документ R01».

## Как работать

- Исследуй в сети: современные шутеры (например серии Call of Duty, Battlefield 6, The Finals, Arc Raiders, Delta Force, Escape from Tarkov, Counter-Strike 2, Valorant, Helldivers 2 — что из их функций стало стандартом) и браузерные технологии (WebGPU и TSL в three.js, вычислительные шейдеры, GPU-driven рендеринг, глобальное освещение в экранном пространстве, отражения, временной апскейлинг и сглаживание, объёмный туман, гауссовы сплаты, WebTransport/WebRTC для сети, WebCodecs, Gamepad API с вибрацией, Web Audio с HRTF, PWA, WebXR, ИИ в браузере — WebNN, малые модели). Ссылайся на источники с датами.
- Что игра уже умеет — читай `README.md`, `.autopilot/PROGRESS.md`, `.autopilot/HISTORY.md` и `.autopilot/interfaces.md` (верхний); код — только чтобы проверить статус пункта.
- Пиши на английском (язык запроса пользователя).

## Критерии приёмки

- [ ] `docs/state-of-the-art.md` существует; вверху — «Top 10 for the next waves»: десять пунктов с одной строкой причины каждый
- [ ] Группы: Graphics & rendering · Gunplay & movement · Enemies & AI · Modes & content · Progression & meta · Audio · UI, UX & accessibility · Online & multiplayer · Platform & performance · Tools & pipeline; ни одна не пуста; всего не меньше 80 пунктов
- [ ] У каждого пункта: что получает игрок (одна строка), статус в игре (have / partial / no), выполнимость (WebGL now / needs WebGPU / needs a server / needs downloads or an account), размер S / M / L / XL
- [ ] Четыре пункта пользователя (качество карты, смена карты каждую волну до 10 карт, выбор карты после волны 5, выбор видеокарты в игре) и журнал изменений с заметками к выпускам помечены «wave 15 — in progress»
- [ ] Раздел «Limits»: что из «уровня Unreal Engine 5» (Nanite, Lumen, аппаратная трассировка лучей, MetaHuman и т. п.) в браузере недостижимо и почему, и какие браузерные замены есть
- [ ] Раздел «Sources»: не меньше 20 ссылок с датами публикации, на которые опираются оценки
