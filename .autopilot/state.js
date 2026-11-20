window.STATE =
{
  "version": 2,
  "slug": "wave-15-maps",
  "dir": "2026-11-20-wave-15-maps--wip",
  "title": "Волна 15: карты, выбор карты, видеокарта, качество",
  "mode": "full",
  "depth": "normal",
  "tier": "T3",
  "briefFile": "2026-11-20-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/kombi/.claude/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-20T10:51:52+01:00",
  "updatedAt": "2026-11-20T11:16:25+01:00",
  "finishedAt": null,
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
      "status": "active",
      "startedAt": "2026-11-20T11:13:47+01:00"
    },
    {
      "id": "build",
      "status": "pending"
    },
    {
      "id": "review",
      "status": "pending"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 22,
    "done": 0,
    "inTicket": 22,
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
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
        "07"
      ],
      "wave": 4,
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
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": {
    "passed": 290,
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
  "concerns": [],
  "blind": null,
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
    "2026-11-20T11:16:25+01:00"
  ],
  "rev": 15,
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
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«please provide me a list of all the possible new features and functions that are state of the art»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«increase the quality of card in the current map»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«integrate changing of the map for each level»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«max 10 new maps»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«integrate ability for choosing the map after level 5»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«user shold have the ability to change the graphic card in the game»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«without any usege of windows or browser settings»",
      "status": "in-ticket"
    },
    {
      "id": "R08i",
      "text": "(подразумевается) каждая новая карта играется полностью: боты ходят, прячутся, появляются вне взгляда; ездоки едут своими петлями; ящики, бочки, аптечки, патроны на месте",
      "status": "in-ticket"
    },
    {
      "id": "R09i",
      "text": "(подразумевается) игрок видит, на какой карте он: название карты на экране волны, на большой карте, в магазине",
      "status": "in-ticket"
    },
    {
      "id": "R10i",
      "text": "(подразумевается) радар и большая карта рисуют ту карту, на которой идёт бой",
      "status": "in-ticket"
    },
    {
      "id": "R11i",
      "text": "(подразумевается) выбор карты делается мышью, клавиатурой и геймпадом, как весь интерфейс",
      "status": "in-ticket"
    },
    {
      "id": "R12i",
      "text": "(подразумевается) после волны 10 (бесконечный режим) и при возрождении на волне смерти карта определена: какая и почему",
      "status": "in-ticket"
    },
    {
      "id": "R13i",
      "text": "(подразумевается) смена карты между волнами не замораживает игру надолго и не течёт памятью",
      "status": "in-ticket"
    },
    {
      "id": "R14i",
      "text": "(подразумевается) выбор видеокарты сохраняется между запусками, игра показывает, на какой видеокарте рисует сейчас",
      "status": "in-ticket"
    },
    {
      "id": "R15i",
      "text": "(подразумевается) где браузер не даёт выбрать видеокарту, игра говорит это прямо и играет дальше на той, что есть",
      "status": "in-ticket"
    },
    {
      "id": "R16i",
      "text": "(подразумевается) каждая карта укладывается в бюджет кадра нынешней (вызовы отрисовки, тени, затенение) и играет без assets/",
      "status": "in-ticket"
    },
    {
      "id": "R17i",
      "text": "(подразумевается) названия карт и новые надписи — на русском и английском",
      "status": "in-ticket"
    },
    {
      "id": "R18i",
      "text": "(подразумевается) однофайловая сборка dist/game.html и сайт несут все карты",
      "status": "in-ticket"
    },
    {
      "id": "G01",
      "text": "«create version cahnge log»",
      "status": "in-ticket"
    },
    {
      "id": "G02",
      "text": "«and release notes»",
      "status": "in-ticket"
    },
    {
      "id": "G03",
      "text": "«for each and every release/deploy of that project»",
      "status": "in-ticket"
    },
    {
      "id": "G04i",
      "text": "(подразумевается) у каждой выкладки есть номер версии, и по игре видно, какая версия открыта",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-20T11:10:45+01:00",
      "open": 0,
      "total": 22
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
      "at": "2026-11-20T11:16:25+01:00",
      "problems": 0
    }
  },
  "result": null
}
