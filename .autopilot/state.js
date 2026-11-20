window.STATE =
{
  "version": 2,
  "slug": "wave-15-maps",
  "dir": "2026-11-20-wave-15-maps",
  "title": "Волна 15: карты, выбор карты, видеокарта, качество",
  "mode": "full",
  "depth": "normal",
  "tier": "T3",
  "briefFile": "2026-11-20-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/kombi/.claude/skills/autopilot",
  "baseCommit": "2e78ab7",
  "startedAt": "2026-11-20T10:51:52+01:00",
  "updatedAt": "2026-11-20T17:05:52+01:00",
  "finishedAt": "2026-11-20T17:05:52+01:00",
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-20T10:51:52+01:00",
      "finishedAt": "2026-11-20T10:52:32+01:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-20T10:52:32+01:00",
      "finishedAt": "2026-11-20T10:53:10+01:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "startedAt": "2026-11-20T10:53:10+01:00",
      "finishedAt": "2026-11-20T10:54:05+01:00",
      "note": "полный автомат — самобрифинг"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-20T10:57:38+01:00",
      "finishedAt": "2026-11-20T11:13:47+01:00"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-11-20T11:13:47+01:00",
      "finishedAt": "2026-11-20T11:17:46+01:00"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-11-20T11:17:46+01:00",
      "finishedAt": "2026-11-20T14:48:09+01:00"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-11-20T14:48:09+01:00",
      "finishedAt": "2026-11-20T15:38:48+01:00"
    },
    {
      "id": "final",
      "status": "done",
      "startedAt": "2026-11-20T15:38:48+01:00",
      "finishedAt": "2026-11-20T17:05:52+01:00"
    }
  ],
  "requirements": {
    "total": 32,
    "done": 32,
    "inTicket": 0,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Список современных функций и технологий",
      "requirements": [
        "R01",
        "R01.1",
        "R01.2"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "docs/state-of-the-art.md"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-20T11:17:48+01:00",
      "finishedAt": "2026-11-20T11:22:28+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 0,
        "failed": 0
      },
      "commit": "5b56301"
    },
    {
      "id": "02",
      "title": "Ядро карт: порядок, выбор и девять раскладок",
      "requirements": [
        "R03",
        "R04",
        "R04.2",
        "R05",
        "R08i",
        "R12i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/core/maps.js",
        "src/core/mapgen.js",
        "src/core/routes.js",
        "src/core/waves.js",
        "src/core/shop.js",
        "src/core/rules.js",
        "tests/core/maps.test.mjs",
        "tests/core/mapgen.test.mjs",
        "tests/core/routes.test.mjs",
        "tests/core/waves.test.mjs",
        "tests/core/shop.test.mjs",
        "tests/core/revive.test.mjs"
      ],
      "review": "да — фундамент",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-20T11:17:48+01:00",
      "finishedAt": "2026-11-20T12:22:10+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 326,
        "failed": 0
      },
      "commit": "dd61d10"
    },
    {
      "id": "03",
      "title": "Атмосфера карт, снимок сверху и вид «Квартала»",
      "requirements": [
        "R02",
        "R02.4",
        "R02.5",
        "R02.6",
        "R02.7",
        "R04",
        "R13i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/render/pipeline.js",
        "src/render/materials.js",
        "src/core/atmosphere.js",
        "src/world/weather.js",
        "src/world/level.js",
        "src/player/shadow.js",
        "src/main.js",
        "tests/core/atmosphere.test.mjs"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-20T11:17:48+01:00",
      "finishedAt": "2026-11-20T12:15:21+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 326,
        "failed": 0
      },
      "commit": "56ed4ae"
    },
    {
      "id": "04",
      "title": "Видеокарта из игры: лаунчер и пункт настроек",
      "requirements": [
        "R06",
        "R06.1",
        "R06.2",
        "R07",
        "R07.1",
        "R07.2",
        "R14i",
        "R15i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "tools/play.mjs",
        "tools/launch-lib.mjs",
        "tools/serve-lib.mjs",
        "server.mjs",
        "play-windows.cmd",
        "package.json",
        "tests/tools/",
        "src/ui/gpu.js",
        "src/core/gpu.js",
        "tests/core/gpu.test.mjs",
        "src/config.js",
        "README.md"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-20T11:22:30+01:00",
      "finishedAt": "2026-11-20T11:51:25+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 309,
        "failed": 0
      },
      "commit": "d57eff5"
    },
    {
      "id": "05",
      "title": "Смена карты между волнами",
      "requirements": [
        "R03",
        "R03.1",
        "R03.2",
        "R08i",
        "R12i",
        "R12i.1",
        "R13i",
        "R10i"
      ],
      "blockedBy": [
        "02",
        "03"
      ],
      "wave": 2,
      "zone": [
        "src/world/level.js",
        "src/world/mapbuild.js",
        "src/world/props.js",
        "src/world/scatter.js",
        "src/game/maps.js",
        "src/game/director.js",
        "src/main.js",
        "src/enemies/riders.js",
        "src/enemies/squad.js",
        "src/config.js"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-20T12:15:23+01:00",
      "finishedAt": "2026-11-20T12:43:24+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 326,
        "failed": 0
      },
      "commit": "a12ffe3"
    },
    {
      "id": "06",
      "title": "Облик девяти новых карт",
      "requirements": [
        "R04",
        "R04.1",
        "R16i",
        "R18i"
      ],
      "blockedBy": [
        "05"
      ],
      "wave": 3,
      "zone": [
        "src/world/mapbuild.js",
        "src/world/details.js",
        "src/world/scatter.js",
        "src/render/materials.js",
        "src/render/models.js"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-20T12:43:26+01:00",
      "finishedAt": "2026-11-20T13:43:19+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 326,
        "failed": 0
      },
      "commit": "a6037f9"
    },
    {
      "id": "07",
      "title": "Экранная карта, название карты и выбор карты в магазине",
      "requirements": [
        "R02",
        "R02.1",
        "R02.2",
        "R02.3",
        "R05",
        "R05.1",
        "R05.2",
        "R09i",
        "R10i",
        "R11i",
        "R17i"
      ],
      "blockedBy": [
        "02",
        "05"
      ],
      "wave": 3,
      "zone": [
        "src/ui/bigmap.js",
        "src/ui/hud.js",
        "src/ui/shop.js",
        "src/ui/mapthumb.js",
        "styles.css",
        "src/config.js",
        "src/game/director.js"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-20T12:43:26+01:00",
      "finishedAt": "2026-11-20T12:50:46+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 326,
        "failed": 0
      },
      "commit": "8f9b3c6"
    },
    {
      "id": "08",
      "title": "Версии, журнал изменений и заметки к выпускам",
      "requirements": [
        "G01",
        "G02",
        "G03",
        "G03.1",
        "G04i",
        "A01"
      ],
      "blockedBy": [
        "04",
        "06",
        "07",
        "09",
        "10"
      ],
      "wave": 5,
      "zone": [
        "src/core/releases.js",
        "tools/notes.mjs",
        "src/ui/whatsnew.js",
        "CHANGELOG.md",
        "RELEASE_NOTES.md",
        "README.md",
        "package.json",
        "styles.css",
        "src/config.js",
        "src/main.js",
        "tests/core/releases.test.mjs"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-20T14:42:44+01:00",
      "finishedAt": "2026-11-20T14:47:55+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 338,
        "failed": 0
      },
      "commit": "42c55e5"
    },
    {
      "id": "09",
      "title": "Машины и автобус: набор в стиле Tesla",
      "requirements": [
        "G05",
        "G05.1",
        "G05.2",
        "G05.3",
        "G06",
        "G07",
        "G08",
        "G09",
        "G10",
        "G11",
        "G12",
        "G13",
        "G14",
        "A02"
      ],
      "blockedBy": [
        "06"
      ],
      "wave": 4,
      "zone": [
        "src/core/fleet.js",
        "src/world/fleet.js",
        "src/world/level.js",
        "src/world/details.js",
        "src/world/mapbuild.js",
        "src/render/materials.js",
        "tests/core/fleet.test.mjs"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-20T13:43:21+01:00",
      "finishedAt": "2026-11-20T14:42:09+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 331,
        "failed": 0
      },
      "commit": "a207785"
    },
    {
      "id": "10",
      "title": "Транспорт ездоков подробнее",
      "requirements": [
        "G05",
        "G05.4"
      ],
      "blockedBy": [],
      "wave": 3,
      "zone": [
        "src/enemies/vehicles.js"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "done",
      "startedAt": "2026-11-20T13:09:01+01:00",
      "finishedAt": "2026-11-20T13:20:39+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 326,
        "failed": 0
      },
      "commit": "b596350"
    },
    {
      "id": "F1",
      "title": "Ремонт ветки по ревью",
      "requirements": [
        "R03",
        "R04",
        "R05",
        "R06",
        "R08i",
        "R15i",
        "R16i",
        "R17i",
        "G01",
        "G02",
        "G03",
        "G04i"
      ],
      "blockedBy": [],
      "wave": 6,
      "zone": [
        "src/core/releases.js",
        "CHANGELOG.md",
        "RELEASE_NOTES.md",
        "package-lock.json",
        "tests/core/releases.test.mjs",
        "src/config.js",
        "src/ui/gpu.js",
        "src/ui/hud.js",
        "README.md",
        "src/core/mapgen.js",
        "src/world/mapbuild.js",
        "tests/core/mapgen.test.mjs",
        "src/render/models.js"
      ],
      "review": "да — ремонт ветки",
      "model": "сильная",
      "status": "done",
      "startedAt": "2026-11-20T15:06:08+01:00",
      "finishedAt": "2026-11-20T15:38:47+01:00",
      "retries": 0,
      "repairs": 0,
      "tests": {
        "passed": 343,
        "failed": 0
      },
      "commit": "74f77c8"
    },
    {
      "id": "F2",
      "title": "Ремонт по слепой приёмке",
      "requirements": [
        "R01.2",
        "R06",
        "R07",
        "R15i",
        "G05",
        "G06",
        "G11",
        "G14"
      ],
      "blockedBy": [],
      "wave": 7,
      "zone": [
        "src/config.js",
        "src/ui/gpu.js",
        "src/core/fleet.js",
        "src/world/fleet.js",
        "tests/core/fleet.test.mjs",
        "tests/core/gpu.test.mjs",
        "docs/state-of-the-art.md"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "done",
      "retries": 0,
      "repairs": 0,
      "startedAt": "2026-11-20T16:35:20+01:00",
      "finishedAt": "2026-11-20T16:56:34+01:00",
      "tests": {
        "passed": 347,
        "failed": 0
      },
      "commit": "2ce9db6"
    }
  ],
  "tests": {
    "passed": 347,
    "failed": 0
  },
  "debt": {
    "placeholders": [],
    "assumptions": [
      "R01: список новых функций — документ на английском, на выбор; в эту волну из него строятся только четыре пункта пользователя",
      "R02: «card» прочитано как экранная карта (большая карта и радар) — вид сверху вместо коробок; другое прочтение (графика уровня) — вопрос в отчёте",
      "R03/R04: 10 карт на 10 волн — нынешний «Квартал» и 9 новых тем, порождённых кодом; заменяет договорённость 14.11 «этап = волна на нынешней карте»",
      "R05: с магазина после волны 5 игрок выбирает карту каждой следующей волны, по умолчанию следующая по порядку",
      "R06/R07: видеокарта выбирается в игре, когда она запущена лаунчером (окно Chrome/Edge с отдельным профилем и ключом запуска); в обычной вкладке браузер выбрать не даёт — проверено на машине пользователя",
      "R12i: возрождение — на карте волны смерти; бесконечный режим — карты по кругу с выбором",
      "R02: взяты оба прочтения — экранная карта (вид сверху) и качество самого «Квартала» по четырём замечаниям слепого просмотра (тень игрока, мешки, дымка против солнца, плоские фасады)",
      "G01–G03: версии 1.0.0…1.4.1 для семи прошлых выкладок, эта волна — 1.5.0; один источник src/core/releases.js; теги и выпуски на GitHub — только с отдельного «да»"
    ],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 5,
    "fixed": 4,
    "deferred": 1,
    "items": [
      "R06/R07 — в обычной вкладке браузера выбора видеокарты нет и быть не может (проверено на машине пользователя); выбор — через лаунчер, вкладка говорит это прямо"
    ]
  },
  "concerns": [
    "docs/state-of-the-art.md — часть источников прочитана по выдержкам поиска, часть дат приблизительна; статусы «в игре» по README/PROGRESS и поиску по коду, не по игре",
    "tools/play.mjs — ветка «нет ни Chrome, ни Edge», «профиль занят» и двойной щелчок по play-windows.cmd не проверены на машине",
    "src/ui/gpu.js — перезапуск с паузы спрашивает через встроенный confirm() браузера, а не окном игры",
    "src/core/atmosphere.js — дымку против солнца сняло новое число sky.clamp (2.9 у «Квартала»): небо дальше ~2° от солнца ниже порога bloom 3",
    "src/world/level.js — треугольников за кадр у «Квартала» +13 % (530→598 тыс. с точки фасада A); тень мешков — общей вставленной коробкой, не по мешку",
    "src/core/mapgen.js:1013-1016 — порт: у полосы воды z −35…−45 нет коллайдера; с тумб у набережной игрок уходит на дно, куда боты не достают (сетка путей)",
    "src/core/mapgen.js:335, 127-129, 173-176, 823-826 — двускатная крыша, балка крана, кронштейн фонаря, навес прилавка рисуются без коллайдеров",
    "src/core/mapgen.js:1300-1316, 850-851 — раскладка кэшируется общим объектом (theme = объект модуля THEMES), не заморожена",
    "src/core/routes.js:22 ↔ src/core/mapgen.js:35 — циклический импорт, держится, пока никто не обращается к другому на верхнем уровне",
    "src/core/mapgen.js:404-424 — mapSchema строит раскладку целиком: 10 карточек ~0.8 с в Node; считать один раз",
    "tests/core/mapgen.test.mjs — нет теста, что игрок прыжками не уходит туда, куда не достаёт сетка путей",
    "src/world/level.js World.dispose — вынимает освобождённые материалы из частной карты gr.csm.shaders; нужен gr.forgetMaterial в рендере",
    "src/world/mapbuild.js — наклонный фонарь addDetails с коллайдером отключён на новых картах подменой world.fits на время вызова",
    "src/core/mapgen.js — у ночной карты menuView смотрит в упор в высокий дом",
    "src/render/pipeline.js renderTopDown — крыши на снимке сверху пятнистые, мелкий мусор шумит; улицы, крыши, машины узнаются",
    "src/ui/shop.js — 10 карточек: панель магазина ~900 px при окне 720 px, прокрутка; схемы новых карт дорисовываются за ~1 с по одной за кадр",
    "src/config.js — неиспользуемые строки mapTitle, mapLegendFoe",
    "src/ui/shop.js — геймпад проверен только через focus()/neighbour, без настоящих кнопок",
    "src/enemies/vehicles.js — треугольников на модель почти вдвое (мотоцикл 10.7→18.6 тыс., тяжёлый 15.4→27.7 тыс.); полный прогон волны 7 не делался, только 4 ездока",
    "src/core/atmosphere.js — ночная карта темновата; таск 06 добавил пятна света под фонарями и окна",
    "src/world/mapbuild.js — на карту не больше 3 сканов машины и 4 барьера (бюджет); старый город и ночь у самого предела бюджета (+5 % вызовов, +6.5 % треугольников)",
    "src/world/fleet.js — модели длиннее старого коллайдера 4.3 × 1.8 (Model 3/Y 4.7–4.8 м): выступают до ~0.25 м с концов",
    "src/world/fleet.js — стёкла непрозрачные тёмные (весь набор — один материал); салон виден только у открытых и сгоревших",
    "src/render/models.js — скан covered_car больше не используется, но грузится",
    "src/core/fleet.js — размеров нет в открытых данных у Roadster 2017/2026, BADGER, Cyber3, CyberBus: приняты по донорам",
    "src/game/maps.js — первая смена на старый город/ночь 2.5 с в скрытой панели (повторные 1.2–1.5 с)",
    "package-lock.json — версия всё ещё 1.0.0 при package.json 1.5.0",
    "src/core/releases.js — known у записей 1.0.0–1.4.1 пусты (источников нет); known — массив {ru, en}, а не строк, как в interfaces.md",
    "src/ui/whatsnew.js — кнопка и версия вставляются в #screen-menu из скрипта (index.html и hud.js вне зоны)",
    "tools/assets-lib.mjs MODEL_MAP — covered_car остался в списке скачивания; build:scans и build:web несут неиспользуемый файл",
    "src/core/mapgen.js — на порту невидимая стена 14 м над морем: граната, брошенная с набережной на север, отскакивает назад"
  ],
  "blind": {
    "checked": 3,
    "matched": 3,
    "mismatches": []
  },
  "beats": [
    "2026-11-20T10:51:52+01:00",
    "2026-11-20T10:52:32+01:00",
    "2026-11-20T10:53:09+01:00",
    "2026-11-20T10:53:10+01:00",
    "2026-11-20T10:54:05+01:00",
    "2026-11-20T10:57:37+01:00",
    "2026-11-20T10:57:38+01:00",
    "2026-11-20T11:10:45+01:00",
    "2026-11-20T11:12:33+01:00",
    "2026-11-20T11:12:34+01:00",
    "2026-11-20T11:13:47+01:00",
    "2026-11-20T11:16:24+01:00",
    "2026-11-20T11:16:25+01:00",
    "2026-11-20T11:16:40+01:00",
    "2026-11-20T11:17:46+01:00",
    "2026-11-20T11:17:48+01:00",
    "2026-11-20T11:22:28+01:00",
    "2026-11-20T11:22:29+01:00",
    "2026-11-20T11:22:30+01:00",
    "2026-11-20T11:51:25+01:00",
    "2026-11-20T11:51:26+01:00",
    "2026-11-20T12:14:06+01:00",
    "2026-11-20T12:15:21+01:00",
    "2026-11-20T12:15:22+01:00",
    "2026-11-20T12:15:23+01:00",
    "2026-11-20T12:22:10+01:00",
    "2026-11-20T12:22:11+01:00",
    "2026-11-20T12:43:24+01:00",
    "2026-11-20T12:43:25+01:00",
    "2026-11-20T12:43:26+01:00",
    "2026-11-20T12:50:46+01:00",
    "2026-11-20T12:50:47+01:00",
    "2026-11-20T13:08:41+01:00",
    "2026-11-20T13:09:01+01:00",
    "2026-11-20T13:20:39+01:00",
    "2026-11-20T13:20:40+01:00",
    "2026-11-20T13:43:19+01:00",
    "2026-11-20T13:43:20+01:00",
    "2026-11-20T13:43:21+01:00",
    "2026-11-20T14:42:09+01:00",
    "2026-11-20T14:42:10+01:00",
    "2026-11-20T14:42:44+01:00",
    "2026-11-20T14:47:55+01:00",
    "2026-11-20T14:47:56+01:00",
    "2026-11-20T14:48:09+01:00",
    "2026-11-20T14:55:57+01:00",
    "2026-11-20T15:06:06+01:00",
    "2026-11-20T15:06:07+01:00",
    "2026-11-20T15:06:08+01:00",
    "2026-11-20T15:28:34+01:00",
    "2026-11-20T15:28:35+01:00",
    "2026-11-20T15:28:36+01:00",
    "2026-11-20T15:38:47+01:00",
    "2026-11-20T15:38:48+01:00",
    "2026-11-20T16:34:37+01:00",
    "2026-11-20T16:35:19+01:00",
    "2026-11-20T16:35:20+01:00",
    "2026-11-20T16:56:34+01:00",
    "2026-11-20T16:56:35+01:00",
    "2026-11-20T17:04:31+01:00",
    "2026-11-20T17:05:51+01:00",
    "2026-11-20T17:05:52+01:00"
  ],
  "rev": 71,
  "waiting": null,
  "waits": [],
  "log": [
    {
      "t": "2026-11-20T10:51:52+01:00",
      "k": "init"
    },
    {
      "t": "2026-11-20T10:52:32+01:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-20T10:53:10+01:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-20T10:54:05+01:00",
      "k": "stage",
      "id": "briefing",
      "act": "skip",
      "note": "полный автомат — самобрифинг"
    },
    {
      "t": "2026-11-20T10:57:37+01:00",
      "k": "add",
      "key": "debt.assumptions",
      "n": 6
    },
    {
      "t": "2026-11-20T10:57:38+01:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 18,
      "total": 18
    },
    {
      "t": "2026-11-20T10:57:38+01:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-20T11:10:45+01:00",
      "k": "tests",
      "passed": 290,
      "failed": 0
    },
    {
      "t": "2026-11-20T11:10:45+01:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 22
    },
    {
      "t": "2026-11-20T11:12:33+01:00",
      "k": "add",
      "key": "debt.assumptions",
      "n": 2
    },
    {
      "t": "2026-11-20T11:12:34+01:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 5,
      "fixed": 4,
      "deferred": 1
    },
    {
      "t": "2026-11-20T11:13:47+01:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-20T11:13:47+01:00",
      "k": "tier",
      "v": "T3"
    },
    {
      "t": "2026-11-20T11:16:24+01:00",
      "k": "tickets",
      "n": 8
    },
    {
      "t": "2026-11-20T11:16:25+01:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-20T11:17:46+01:00",
      "k": "stage",
      "id": "build",
      "act": "start"
    },
    {
      "t": "2026-11-20T11:17:48+01:00",
      "k": "ticket",
      "ids": [
        "01",
        "02",
        "03"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T11:22:28+01:00",
      "k": "ticket",
      "ids": [
        "01"
      ],
      "act": "done",
      "tests": {
        "passed": 0,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T11:22:29+01:00",
      "k": "add",
      "key": "concerns",
      "n": 1
    },
    {
      "t": "2026-11-20T11:22:30+01:00",
      "k": "ticket",
      "ids": [
        "04"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T11:51:25+01:00",
      "k": "ticket",
      "ids": [
        "04"
      ],
      "act": "done",
      "tests": {
        "passed": 309,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T11:51:26+01:00",
      "k": "add",
      "key": "concerns",
      "n": 2
    },
    {
      "t": "2026-11-20T12:14:06+01:00",
      "k": "ticket",
      "ids": [
        "02"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T12:14:06+01:00",
      "k": "ticket",
      "ids": [
        "02"
      ],
      "act": "review"
    },
    {
      "t": "2026-11-20T12:15:21+01:00",
      "k": "ticket",
      "ids": [
        "03"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T12:15:22+01:00",
      "k": "add",
      "key": "concerns",
      "n": 2
    },
    {
      "t": "2026-11-20T12:15:23+01:00",
      "k": "ticket",
      "ids": [
        "05"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T12:22:10+01:00",
      "k": "ticket",
      "ids": [
        "02"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T12:22:11+01:00",
      "k": "add",
      "key": "concerns",
      "n": 6
    },
    {
      "t": "2026-11-20T12:43:24+01:00",
      "k": "ticket",
      "ids": [
        "05"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T12:43:25+01:00",
      "k": "add",
      "key": "concerns",
      "n": 3
    },
    {
      "t": "2026-11-20T12:43:26+01:00",
      "k": "ticket",
      "ids": [
        "06",
        "07"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T12:50:46+01:00",
      "k": "ticket",
      "ids": [
        "07"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T12:50:47+01:00",
      "k": "add",
      "key": "concerns",
      "n": 4
    },
    {
      "t": "2026-11-20T13:08:41+01:00",
      "k": "tickets",
      "n": 10
    },
    {
      "t": "2026-11-20T13:08:41+01:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    },
    {
      "t": "2026-11-20T13:09:01+01:00",
      "k": "ticket",
      "ids": [
        "10"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T13:20:39+01:00",
      "k": "ticket",
      "ids": [
        "10"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T13:20:40+01:00",
      "k": "add",
      "key": "concerns",
      "n": 1
    },
    {
      "t": "2026-11-20T13:43:19+01:00",
      "k": "ticket",
      "ids": [
        "06"
      ],
      "act": "done",
      "tests": {
        "passed": 326,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T13:43:20+01:00",
      "k": "add",
      "key": "concerns",
      "n": 2
    },
    {
      "t": "2026-11-20T13:43:21+01:00",
      "k": "ticket",
      "ids": [
        "09"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T14:42:09+01:00",
      "k": "ticket",
      "ids": [
        "09"
      ],
      "act": "done",
      "tests": {
        "passed": 331,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T14:42:10+01:00",
      "k": "add",
      "key": "concerns",
      "n": 5
    },
    {
      "t": "2026-11-20T14:42:44+01:00",
      "k": "ticket",
      "ids": [
        "08"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T14:47:55+01:00",
      "k": "ticket",
      "ids": [
        "08"
      ],
      "act": "done",
      "tests": {
        "passed": 338,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T14:47:56+01:00",
      "k": "add",
      "key": "concerns",
      "n": 3
    },
    {
      "t": "2026-11-20T14:48:09+01:00",
      "k": "stage",
      "id": "review",
      "act": "start"
    },
    {
      "t": "2026-11-20T14:55:57+01:00",
      "k": "tests",
      "passed": 338,
      "failed": 0
    },
    {
      "t": "2026-11-20T15:06:06+01:00",
      "k": "tickets",
      "n": 11
    },
    {
      "t": "2026-11-20T15:06:07+01:00",
      "k": "add",
      "key": "report",
      "n": 17
    },
    {
      "t": "2026-11-20T15:06:08+01:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T15:28:34+01:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done",
      "tests": {
        "passed": 343,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T15:28:35+01:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "review"
    },
    {
      "t": "2026-11-20T15:28:36+01:00",
      "k": "add",
      "key": "concerns",
      "n": 2
    },
    {
      "t": "2026-11-20T15:38:47+01:00",
      "k": "ticket",
      "ids": [
        "F1"
      ],
      "act": "done",
      "tests": {
        "passed": 343,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T15:38:48+01:00",
      "k": "add",
      "key": "report",
      "n": 3
    },
    {
      "t": "2026-11-20T15:38:48+01:00",
      "k": "stage",
      "id": "final",
      "act": "start"
    },
    {
      "t": "2026-11-20T16:34:37+01:00",
      "k": "gate",
      "g": "G4",
      "ok": false,
      "checked": 13,
      "matched": 10
    },
    {
      "t": "2026-11-20T16:35:19+01:00",
      "k": "tickets",
      "n": 12
    },
    {
      "t": "2026-11-20T16:35:20+01:00",
      "k": "ticket",
      "ids": [
        "F2"
      ],
      "act": "start"
    },
    {
      "t": "2026-11-20T16:56:34+01:00",
      "k": "ticket",
      "ids": [
        "F2"
      ],
      "act": "done",
      "tests": {
        "passed": 347,
        "failed": 0
      }
    },
    {
      "t": "2026-11-20T16:56:35+01:00",
      "k": "add",
      "key": "report",
      "n": 1
    },
    {
      "t": "2026-11-20T17:04:31+01:00",
      "k": "gate",
      "g": "G4",
      "ok": true,
      "checked": 3,
      "matched": 3
    },
    {
      "t": "2026-11-20T17:05:51+01:00",
      "k": "tests",
      "passed": 347,
      "failed": 0
    },
    {
      "t": "2026-11-20T17:05:52+01:00",
      "k": "finish",
      "result": "Версия 1.5.0: десять карт на десять волн с выбором после пятой, вид сверху на карте и радаре, видеокарта через лаунчер, журнал версий и заметки, машины в стиле Tesla",
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«please provide me a list of all the possible new features and functions that are state of the art»",
      "status": "done"
    },
    {
      "id": "R02",
      "text": "«increase the quality of card in the current map»",
      "status": "done"
    },
    {
      "id": "R03",
      "text": "«integrate changing of the map for each level»",
      "status": "done"
    },
    {
      "id": "R04",
      "text": "«max 10 new maps»",
      "status": "done"
    },
    {
      "id": "R05",
      "text": "«integrate ability for choosing the map after level 5»",
      "status": "done"
    },
    {
      "id": "R06",
      "text": "«user shold have the ability to change the graphic card in the game»",
      "status": "done"
    },
    {
      "id": "R07",
      "text": "«without any usege of windows or browser settings»",
      "status": "done"
    },
    {
      "id": "R08i",
      "text": "(подразумевается) каждая новая карта играется полностью: боты ходят, прячутся, появляются вне взгляда; ездоки едут своими петлями; ящики, бочки, аптечки, патроны на месте",
      "status": "done"
    },
    {
      "id": "R09i",
      "text": "(подразумевается) игрок видит, на какой карте он: название карты на экране волны, на большой карте, в магазине",
      "status": "done"
    },
    {
      "id": "R10i",
      "text": "(подразумевается) радар и большая карта рисуют ту карту, на которой идёт бой",
      "status": "done"
    },
    {
      "id": "R11i",
      "text": "(подразумевается) выбор карты делается мышью, клавиатурой и геймпадом, как весь интерфейс",
      "status": "done"
    },
    {
      "id": "R12i",
      "text": "(подразумевается) после волны 10 (бесконечный режим) и при возрождении на волне смерти карта определена: какая и почему",
      "status": "done"
    },
    {
      "id": "R13i",
      "text": "(подразумевается) смена карты между волнами не замораживает игру надолго и не течёт памятью",
      "status": "done"
    },
    {
      "id": "R14i",
      "text": "(подразумевается) выбор видеокарты сохраняется между запусками, игра показывает, на какой видеокарте рисует сейчас",
      "status": "done"
    },
    {
      "id": "R15i",
      "text": "(подразумевается) где браузер не даёт выбрать видеокарту, игра говорит это прямо и играет дальше на той, что есть",
      "status": "done"
    },
    {
      "id": "R16i",
      "text": "(подразумевается) каждая карта укладывается в бюджет кадра нынешней (вызовы отрисовки, тени, затенение) и играет без assets/",
      "status": "done"
    },
    {
      "id": "R17i",
      "text": "(подразумевается) названия карт и новые надписи — на русском и английском",
      "status": "done"
    },
    {
      "id": "R18i",
      "text": "(подразумевается) однофайловая сборка dist/game.html и сайт несут все карты",
      "status": "done"
    },
    {
      "id": "G01",
      "text": "«create version cahnge log»",
      "status": "done"
    },
    {
      "id": "G02",
      "text": "«and release notes»",
      "status": "done"
    },
    {
      "id": "G03",
      "text": "«for each and every release/deploy of that project»",
      "status": "done"
    },
    {
      "id": "G04i",
      "text": "(подразумевается) у каждой выкладки есть номер версии, и по игре видно, какая версия открыта",
      "status": "done"
    },
    {
      "id": "G05",
      "text": "«increase the quality of all the vehicles, cars and bus in the current map»",
      "status": "done"
    },
    {
      "id": "G06",
      "text": "«use prioritize tesla vehicles like»",
      "status": "done"
    },
    {
      "id": "G07",
      "text": "«SemyTruck»",
      "status": "done"
    },
    {
      "id": "G08",
      "text": "«Roadster 1(2014)»",
      "status": "done"
    },
    {
      "id": "G09",
      "text": "«Roadster 2 (2017)»",
      "status": "done"
    },
    {
      "id": "G10",
      "text": "«Roadster 3(2026)»",
      "status": "done"
    },
    {
      "id": "G11",
      "text": "«Model 3, S, X, Y (stand 2026)»",
      "status": "done"
    },
    {
      "id": "G12",
      "text": "«BEDGER / CyberBus»",
      "status": "done"
    },
    {
      "id": "G13",
      "text": "«Cyber3»",
      "status": "done"
    },
    {
      "id": "G14",
      "text": "«TSK CyberHooligans / CyberRoadster»",
      "status": "done"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-20T11:10:45+01:00",
      "open": 0,
      "total": 32
    },
    "G2": {
      "ok": true,
      "at": "2026-11-20T11:12:34+01:00",
      "found": 5,
      "fixed": 4,
      "deferred": 1
    },
    "G3": {
      "ok": true,
      "at": "2026-11-20T13:08:41+01:00",
      "problems": 0
    },
    "G4": {
      "ok": true,
      "at": "2026-11-20T17:04:31+01:00",
      "checked": 3,
      "matched": 3
    }
  },
  "result": "Версия 1.5.0: десять карт на десять волн с выбором после пятой, вид сверху на карте и радаре, видеокарта через лаунчер, журнал версий и заметки, машины в стиле Tesla",
  "report": [
    "Сервер разработки и лаунчер отдают файлы проекта странице с чужим адресом (DNS-rebinding): адрес проверяется только у лаунчера, не на всех путях (tools/serve-lib.mjs:29-44, tools/play.mjs:138-140)",
    "У защиты лаунчера от чужих адресов (hostAllowed) нет теста (tests/tools/launch.test.mjs)",
    "В лаунчере осталась отладочная ручка POST /launcher/seen, которой нет в спецификации (tools/play.mjs:145-153)",
    "Лаунчер не проверен на машине без Chrome и Edge, с занятым профилем и двойным щелчком по play-windows.cmd",
    "routes.js и mapgen.js импортируют друг друга: сейчас работает, сломается от первой константы верхнего уровня (src/core/routes.js:22, src/core/mapgen.js:35)",
    "Тест выпусков перечисляет ровно 8 версий: следующую выкладку придётся вписывать и в тест (tests/core/releases.test.mjs:14)",
    "Тест атмосферы держит свою копию списка карт: новая карта без своего света молча получит свет «Квартала» (tests/core/atmosphere.test.mjs:5)",
    "Одна проверка в тесте петель не может покраснеть: onRoute с пустым списком всегда false (tests/core/routes.test.mjs:148)",
    "Если карта не соберётся из-за ошибки, игра зависнет на экране загрузки (src/game/maps.js:46-86)",
    "В домах идёт дождь и снег: погода не учитывает крыши (src/world/weather.js:149-153)",
    "У Model 3/Y и Cyber3 бампер выступает за коллайдер на 0.2-0.25 м: там пули и игрок проходят сквозь кузов (src/world/level.js:1177-1183, src/core/fleet.js:89)",
    "Мир при смене карты сам чистит частную карту теней рендера gr.csm.shaders; нужен метод рендера gr.forgetMaterial (src/world/level.js:1346-1351)",
    "Смена карты освобождает текстуры, которые общий кэш отдаст следующей карте; работает лишь потому, что three загрузит их заново (src/world/level.js:1338-1344, src/render/materials.js:607-616)",
    "Окно «Что нового» выше экрана: мышью и клавиатурой листается, геймпадом нет (src/ui/whatsnew.js:34)",
    "Смена видеокарты на паузе спрашивает встроенным окном браузера, геймпадом на него не ответить (src/ui/gpu.js:121)",
    "В списке современных функций M01, M02, F05, T01 после сдачи всё ещё «в работе»; вид сверху не помечен волной 15; 5 из 36 источников датированы 2020-2023 (docs/state-of-the-art.md)",
    "Магазин с 10 карточками карт выше окна 720 px и прокручивается (уже в известных недочётах 1.5.0)",
    "На порту над морем стоит невидимая стена: граната, брошенная с набережной в сторону моря, отскакивает от воздуха и может вернуться под ноги (src/core/mapgen.js, кусок water с wall)",
    "Тест выпусков читает src/config.js — слой игры, а не ядро; правило проекта велит тестам ядра идти только через src/core (tests/core/releases.test.mjs:6)",
    "Модель covered_car больше не используется, но осталась в списке скачивания и в сборках со сканами (tools/assets-lib.mjs MODEL_MAP)",
    "Тест видеокарты читает src/ui/gpu.js — слой интерфейса, а не ядро (tests/core/gpu.test.mjs)"
  ],
  "blindRounds": 2
}
