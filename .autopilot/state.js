window.STATE =
{
  "version": 2,
  "slug": "wave-14-vehicles-bosses",
  "dir": "2026-11-14-wave-14-vehicles-bosses--wip",
  "title": "Волна 14: противники на транспорте и боссы",
  "mode": "full",
  "depth": "normal",
  "tier": "T1",
  "briefFile": "2026-11-14-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/kombi/.claude/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-14T17:57:46+01:00",
  "updatedAt": "2026-11-14T18:11:11+01:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-14T17:57:46+01:00",
      "finishedAt": "2026-11-14T17:58:23+01:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-14T17:58:23+01:00",
      "finishedAt": "2026-11-14T17:59:04+01:00"
    },
    {
      "id": "briefing",
      "status": "skipped",
      "startedAt": "2026-11-14T17:59:04+01:00",
      "finishedAt": "2026-11-14T17:59:43+01:00",
      "note": "полный автомат — самобрифинг"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-14T17:59:45+01:00",
      "finishedAt": "2026-11-14T18:09:18+01:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-14T18:09:18+01:00"
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
    "total": 14,
    "done": 0,
    "inTicket": 14,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Правила, петли и езда в ядре, заглушки границ",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09i",
        "R10i",
        "R12i",
        "R14i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/core/",
        "tests/core/",
        "src/world/level.js",
        "src/world/props.js",
        "src/enemies/vehicles.js",
        "src/enemies/soldier.js",
        "LOOK",
        "setRidePose",
        "src/audio/sfx.js",
        "engine",
        "vehicleCrash",
        "bossIntro",
        "src/config.js",
        "e_*"
      ],
      "review": "да — фундамент",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "02",
      "title": "Как выглядят и звучат транспорт, ездоки и боссы",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R11i",
        "R13i",
        "R14i",
        "R08"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/enemies/vehicles.js",
        "src/enemies/soldier.js",
        "src/audio/sfx.js"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "03",
      "title": "Ездоки и боссы в бою",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09i",
        "R10i",
        "R11i",
        "R12i",
        "R13i"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/enemies/squad.js",
        "src/enemies/riders.js",
        "src/game/director.js",
        "src/ui/hud.js",
        "src/player/controller.js",
        "src/main.js",
        "src/config.js",
        "e_*",
        "styles.css"
      ],
      "review": "нет",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [
      "самокат электрический, ездок стреляет из пистолета (R01)",
      "скейт медленнее самоката, ездок с пистолетом-пулемётом (R02)",
      "мотоцикл самый быстрый, стреляет и сбивает (R03)",
      "самокаты с волны 3, скейты с 5, мотоциклы с 7 (R04)",
      "подбитый транспорт падает, ездок воюет пешим (R06)",
      "боссы на волнах 5 и 10, в бесконечном каждая пятая (R07)",
      "ездоки стреляют на ходу с пониженной точностью (R09i)",
      "полоса здоровья босса вверху экрана, баннер БОСС (R11i)"
    ],
    "emptyEnv": []
  },
  "additions": [
    "подпись о новом виде ездока под баннером волны — ради R04"
  ],
  "coverage": {
    "found": 2,
    "fixed": 2,
    "deferred": 0,
    "items": []
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-14T17:57:46+01:00",
    "2026-11-14T17:58:23+01:00",
    "2026-11-14T17:59:03+01:00",
    "2026-11-14T17:59:04+01:00",
    "2026-11-14T17:59:43+01:00",
    "2026-11-14T17:59:44+01:00",
    "2026-11-14T17:59:45+01:00",
    "2026-11-14T18:03:26+01:00",
    "2026-11-14T18:03:27+01:00",
    "2026-11-14T18:09:18+01:00",
    "2026-11-14T18:10:47+01:00",
    "2026-11-14T18:11:09+01:00",
    "2026-11-14T18:11:11+01:00"
  ],
  "rev": 14,
  "waiting": null,
  "waits": [],
  "log": [
    {
      "t": "2026-11-14T17:57:46+01:00",
      "k": "init"
    },
    {
      "t": "2026-11-14T17:58:23+01:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-14T17:59:04+01:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-14T17:59:43+01:00",
      "k": "stage",
      "id": "briefing",
      "act": "skip",
      "note": "полный автомат — самобрифинг"
    },
    {
      "t": "2026-11-14T17:59:44+01:00",
      "k": "add",
      "key": "debt.assumptions",
      "n": 8
    },
    {
      "t": "2026-11-14T17:59:45+01:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 14,
      "total": 14
    },
    {
      "t": "2026-11-14T17:59:45+01:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-14T18:03:26+01:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    {
      "t": "2026-11-14T18:03:27+01:00",
      "k": "add",
      "key": "additions",
      "n": 1
    },
    {
      "t": "2026-11-14T18:09:18+01:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-14T18:09:18+01:00",
      "k": "gate",
      "g": "G1",
      "ok": true,
      "open": 0,
      "total": 14
    },
    {
      "t": "2026-11-14T18:10:47+01:00",
      "k": "tier",
      "v": "T1"
    },
    {
      "t": "2026-11-14T18:11:09+01:00",
      "k": "tickets",
      "n": 3
    },
    {
      "t": "2026-11-14T18:11:11+01:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«противники на самокатах»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«противники на … скейтах»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«противники на … мотоциклах»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«Транспорт в порядке самокат, скейт, мотоцикл»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«ездоков пускать по заданным петлям вдоль улиц»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«подбитый транспорт оставляет ездока пешим»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«волны-боссы»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«use autopilot for the development of the wafes for best result and parallelisation»",
      "status": "in-ticket"
    },
    {
      "id": "R09i",
      "text": "(подразумевается) ездок — противник: стреляет в игрока или иначе опасен для него",
      "status": "in-ticket"
    },
    {
      "id": "R10i",
      "text": "(подразумевается) транспорт не застревает и не проходит сквозь стены и завалы",
      "status": "in-ticket"
    },
    {
      "id": "R11i",
      "text": "(подразумевается) босс заметен как босс: имя, полоса здоровья, объявление волны",
      "status": "in-ticket"
    },
    {
      "id": "R12i",
      "text": "(подразумевается) ездоки и боссы встроены в то, что уже есть: деньги за убийство, рост здоровья по волнам, возрождение на волне, мини-карта и большая карта, бесконечный режим",
      "status": "in-ticket"
    },
    {
      "id": "R13i",
      "text": "(подразумевается) транспорт слышно: двигатель, колёса",
      "status": "in-ticket"
    },
    {
      "id": "R14i",
      "text": "(подразумевается) правила проекта соблюдены: всё порождено кодом без скачиваний, бот — одна сетка со скелетом, динамические предметы — пулы, частота кадров не падает заметно",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": true,
      "at": "2026-11-14T18:09:18+01:00",
      "open": 0,
      "total": 14
    },
    "G2": {
      "ok": true,
      "at": "2026-11-14T18:03:26+01:00",
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-14T18:11:11+01:00",
      "problems": 0
    }
  },
  "result": null
}
