// Global constants, quality presets, persisted settings and UI strings.

export const MAP_HALF = 45;          // playable area is [-45, 45] on x and z
export const PHYSICS_HZ = 120;
export { PLAYER } from './core/rules.js';

// Three presets. The sun and three shadow cascades exist on all of them, only the
// shadow map size, ambient occlusion, render scale, particles and lens effects change.
export const QUALITY = {
  low:    { label: 'low',    renderScale: 0.75, shadow: 1024, ao: false, aoScale: 0,   bloom: false, smaa: true, msaa: 0, particles: 0.25, aniso: 4,  ca: 0,     shadowType: 'pcf', rays: 0,  raysStrength: 0 },
  medium: { label: 'medium', renderScale: 1.0,  shadow: 2048, ao: true,  aoScale: 0.5, bloom: true,  smaa: true, msaa: 0, particles: 0.6,  aniso: 8,  ca: 0,     shadowType: 'pcf', rays: 8,  raysStrength: 0.36 },
  high:   { label: 'high',   renderScale: 1.0,  shadow: 4096, ao: true,  aoScale: 1,   bloom: true,  smaa: true, msaa: 4, particles: 1.0,  aniso: 16, ca: 0.012, shadowType: 'pcf', rays: 20, raysStrength: 0.42 },
};
export const QUALITY_ORDER = ['low', 'medium', 'high'];

// Key bindings: what the game does (an action) and the physical keys that do it. The game asks
// for actions, never for keys, so a binding can change without touching the code that reads it.
// Codes are KeyboardEvent.code values plus Mouse0 (left button), Mouse1 (middle), Mouse2 (right).
// The mouse wheel is not an action: it always cycles weapons.
export const ACTIONS = [
  'forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch',
  'fire', 'aim', 'reload', 'lastWeapon', 'grenade',
  'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9',
  'inventory', 'map',
];
export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'],
  fire: ['Mouse0'], aim: ['Mouse2'], reload: ['KeyR'], lastWeapon: ['KeyQ'], grenade: ['KeyG'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'], slot5: ['Digit5'],
  slot6: ['Digit6'], slot7: ['Digit7'], slot8: ['Digit8'], slot9: ['Digit9'],
  inventory: ['KeyI'], map: ['KeyM'],
};

/** Bindings with every action present: saved ones win, missing ones come from the defaults. */
export function mergeBindings(saved) {
  const out = {};
  for (const a of ACTIONS) {
    const s = saved && saved[a];
    out[a] = Array.isArray(s) ? s.filter((c) => typeof c === 'string') : [...DEFAULT_BINDINGS[a]];
  }
  return out;
}

export const DEFAULT_SETTINGS = {
  sens: 1.0,
  fov: 78,
  volume: 0.7,
  quality: 'medium',
  sound: true,
  autoQuality: true,
  lang: 'ru',
  invertY: false,
  showFps: false,
  scans: true,
  bindings: null,      // filled by loadSettings from DEFAULT_BINDINGS and what was saved
  // ---- wave 11 settings (controls and screen)
  radarEnemies: 'fired', // enemies on the radar and the big map: 'fired' (just shot) or 'all' (every living one)
  padSens: 1.0,          // gamepad look speed, a multiplier of GAMEPAD.lookYaw / lookPitch
  padInvertY: false,
  padLayout: 'auto',     // gamepad button prompts: 'auto' (from the pad's name), 'xbox', 'playstation', 'nintendo'
  // ---- wave 12 settings (economy)
  // ---- wave 13 settings (weapons)
};

const KEY = 'ruined-block-fps.settings.v1';

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch (e) { /* storage may be blocked */ }
  if (!QUALITY[s.quality]) s.quality = 'medium';
  s.bindings = mergeBindings(s.bindings);
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- strings
const STR = {
  ru: {
    title: 'ОПЕРАЦИЯ «ПЕПЕЛ»',
    subtitle: 'Выживание в разрушенном квартале. Десять волн.',
    play: 'В бой',
    resume: 'Продолжить',
    restart: 'Начать заново',
    settings: 'Настройки',
    controls: 'Управление',
    toMenu: 'В главное меню',
    back: 'Назад',
    sens: 'Чувствительность мыши',
    fov: 'Угол обзора',
    volume: 'Громкость',
    quality: 'Качество графики',
    autoQuality: 'Автоматически снижать качество при низком FPS',
    language: 'Язык',
    invertY: 'Инвертировать мышь по вертикали',
    showFps: 'Показывать FPS (клавиша F3)',
    scans: 'Фотосканы текстур и моделей (применится после перезагрузки страницы)',
    loadModels: 'Загрузка моделей',
    soundOn: 'Звук включён',
    continueEndless: 'Продолжить в бесконечном режиме',
    endless: 'БЕСКОНЕЧНЫЙ РЕЖИМ',
    q_low: 'Низкое', q_medium: 'Среднее', q_high: 'Высокое',
    loading: 'Загрузка',
    loadTextures: 'Подготовка PBR-материалов',
    loadWorld: 'Сборка квартала',
    loadAudio: 'Подготовка звука',
    loadReady: 'Готово',
    clickToPlay: 'Нажми, чтобы вернуться в игру',
    paused: 'ПАУЗА',
    dead: 'ВЫ ПОГИБЛИ',
    victory: 'МИССИЯ ВЫПОЛНЕНА',
    victorySub: 'Квартал зачищен. Все десять волн отбиты.',
    deadSub: 'Враги взяли квартал под контроль.',
    stats: 'Итоги',
    score: 'Очки',
    kills: 'Убийства',
    headshots: 'В голову',
    accuracy: 'Точность',
    time: 'Время',
    wave: 'ВОЛНА',
    waveClear: 'ВОЛНА ОТБИТА',
    nextWave: 'Следующая волна через',
    enemiesLeft: 'Врагов',
    health: 'ЗДОРОВЬЕ',
    reload: 'Перезарядка',
    noAmmo: 'ПАТРОНЫ КОНЧИЛИСЬ',
    lowAmmo: 'Мало патронов',
    pickupHealth: 'Аптечка',
    pickupAmmo: 'Патроны',
    killfeedYou: 'Вы',
    headshot: 'В голову',
    streak: 'Серия',
    w_pistol: 'Пистолет P-9',
    w_rifle: 'Автомат AR-7',
    w_shotgun: 'Дробовик S-12',
    e_grunt: 'Рядовой',
    e_rusher: 'Штурмовик',
    e_heavy: 'Тяжёлый',
    barrel: 'Бочка',
    ctl_move: 'Движение', ctl_look: 'Обзор', ctl_jump: 'Прыжок', ctl_sprint: 'Бег',
    ctl_crouch: 'Присесть', ctl_fire: 'Огонь', ctl_aim: 'Прицелиться', ctl_reload: 'Перезарядка',
    ctl_switch: 'Сменить оружие', ctl_pause: 'Пауза', ctl_fps: 'Счётчик FPS',
    k_move: 'W A S D', k_look: 'Мышь', k_jump: 'Пробел', k_sprint: 'Shift', k_crouch: 'C',
    k_fire: 'Левая кнопка', k_aim: 'Правая кнопка', k_reload: 'R', k_switch: '1, 2, 3, колесо, Q', k_pause: 'Esc', k_fps: 'F3',
    hintStart: 'Нажми, чтобы играть. Esc ставит паузу, кнопка «Продолжить» возвращает в бой. F3 показывает FPS.',
    webglFail: 'Нужен современный браузер с поддержкой WebGL 2. Включите аппаратное ускорение.',
    fpsLabel: 'FPS',
    qualityDropped: 'Качество снижено до',

    // ---- wave 11: controls and screen
    radarEnemies: 'Враги на карте',
    re_fired: 'Только стрелявшие', re_all: 'Все живые',
    padSens: 'Чувствительность геймпада',
    padInvertY: 'Инвертировать геймпад по вертикали',
    padLayout: 'Подписи кнопок геймпада',
    pl_auto: 'Автоматически',
    keysBtn: 'Клавиши',
    keysTitle: 'Клавиши',
    keysHint: 'Нажмите на ячейку, затем клавишу или кнопку мыши. Esc отменяет, Backspace очищает ячейку. Клавиша, занятая другим действием, переходит сюда.',
    keysPress: 'Нажмите…',
    keysReset: 'Сбросить по умолчанию',
    keysNone: '—',
    act_forward: 'Вперёд', act_back: 'Назад', act_left: 'Влево', act_right: 'Вправо',
    act_jump: 'Прыжок', act_sprint: 'Бег', act_crouch: 'Присесть', act_fire: 'Огонь', act_aim: 'Прицелиться',
    act_reload: 'Перезарядка', act_lastWeapon: 'Прошлое оружие', act_grenade: 'Граната',
    act_slot: 'Слот {n}', act_inventory: 'Инвентарь', act_map: 'Карта',
    kn_space: 'Пробел', kn_mouse0: 'ЛКМ', kn_mouse1: 'СКМ', kn_mouse2: 'ПКМ', kn_mouse: 'Мышь {n}',
    kn_rshift: 'Пр. Shift', kn_rctrl: 'Пр. Ctrl', kn_ralt: 'Пр. Alt',
    k_wheel: 'колесо',
    ctl_map: 'Карта',
    pad_lstick: 'левый стик', pad_rstick: 'правый стик',
    mapTitle: 'КАРТА КВАРТАЛА', mapClose: 'закрыть', mapNorth: 'С', mapYou: 'Вы',

    // ---- wave 12: economy

    // ---- wave 13: weapons and grenades

  },
  en: {
    title: 'OPERATION ASH',
    subtitle: 'Survive in a ruined city block. Ten waves.',
    play: 'Deploy',
    resume: 'Resume',
    restart: 'Restart',
    settings: 'Settings',
    controls: 'Controls',
    toMenu: 'Main menu',
    back: 'Back',
    sens: 'Mouse sensitivity',
    fov: 'Field of view',
    volume: 'Volume',
    quality: 'Graphics quality',
    autoQuality: 'Lower quality automatically when FPS is low',
    language: 'Language',
    invertY: 'Invert mouse Y',
    showFps: 'Show FPS (F3)',
    scans: 'Photoscanned textures and models (applies after the page reloads)',
    loadModels: 'Loading models',
    soundOn: 'Sound on',
    continueEndless: 'Continue in endless mode',
    endless: 'ENDLESS MODE',
    q_low: 'Low', q_medium: 'Medium', q_high: 'High',
    loading: 'Loading',
    loadTextures: 'Preparing PBR materials',
    loadWorld: 'Assembling the block',
    loadAudio: 'Preparing audio',
    loadReady: 'Ready',
    clickToPlay: 'Click to return to the game',
    paused: 'PAUSED',
    dead: 'YOU DIED',
    victory: 'MISSION COMPLETE',
    victorySub: 'The block is clear. All ten waves repelled.',
    deadSub: 'The enemy has taken the block.',
    stats: 'Summary',
    score: 'Score',
    kills: 'Kills',
    headshots: 'Headshots',
    accuracy: 'Accuracy',
    time: 'Time',
    wave: 'WAVE',
    waveClear: 'WAVE CLEARED',
    nextWave: 'Next wave in',
    enemiesLeft: 'Enemies',
    health: 'HEALTH',
    reload: 'Reloading',
    noAmmo: 'OUT OF AMMO',
    lowAmmo: 'Low ammo',
    pickupHealth: 'Medkit',
    pickupAmmo: 'Ammo',
    killfeedYou: 'You',
    headshot: 'Headshot',
    streak: 'Streak',
    w_pistol: 'P-9 Pistol',
    w_rifle: 'AR-7 Rifle',
    w_shotgun: 'S-12 Shotgun',
    e_grunt: 'Grunt',
    e_rusher: 'Rusher',
    e_heavy: 'Heavy',
    barrel: 'Barrel',
    ctl_move: 'Move', ctl_look: 'Look', ctl_jump: 'Jump', ctl_sprint: 'Sprint',
    ctl_crouch: 'Crouch', ctl_fire: 'Fire', ctl_aim: 'Aim down sights', ctl_reload: 'Reload',
    ctl_switch: 'Switch weapon', ctl_pause: 'Pause', ctl_fps: 'FPS counter',
    k_move: 'W A S D', k_look: 'Mouse', k_jump: 'Space', k_sprint: 'Shift', k_crouch: 'C',
    k_fire: 'Left button', k_aim: 'Right button', k_reload: 'R', k_switch: '1, 2, 3, wheel, Q', k_pause: 'Esc', k_fps: 'F3',
    hintStart: 'Click to play. Esc pauses, the Resume button returns to the fight. F3 shows FPS.',
    webglFail: 'A modern browser with WebGL 2 is required. Enable hardware acceleration.',
    fpsLabel: 'FPS',
    qualityDropped: 'Quality lowered to',

    // ---- wave 11: controls and screen
    radarEnemies: 'Enemies on the map',
    re_fired: 'Only those that fired', re_all: 'All living',
    padSens: 'Gamepad sensitivity',
    padInvertY: 'Invert gamepad Y',
    padLayout: 'Gamepad button prompts',
    pl_auto: 'Automatic',
    keysBtn: 'Key bindings',
    keysTitle: 'Key bindings',
    keysHint: 'Click a slot, then press a key or a mouse button. Esc cancels, Backspace clears the slot. A key used by another action moves here.',
    keysPress: 'Press…',
    keysReset: 'Reset to defaults',
    keysNone: '—',
    act_forward: 'Forward', act_back: 'Back', act_left: 'Left', act_right: 'Right',
    act_jump: 'Jump', act_sprint: 'Sprint', act_crouch: 'Crouch', act_fire: 'Fire', act_aim: 'Aim down sights',
    act_reload: 'Reload', act_lastWeapon: 'Last weapon', act_grenade: 'Grenade',
    act_slot: 'Slot {n}', act_inventory: 'Inventory', act_map: 'Map',
    kn_space: 'Space', kn_mouse0: 'LMB', kn_mouse1: 'MMB', kn_mouse2: 'RMB', kn_mouse: 'Mouse {n}',
    kn_rshift: 'R-Shift', kn_rctrl: 'R-Ctrl', kn_ralt: 'R-Alt',
    k_wheel: 'wheel',
    ctl_map: 'Map',
    pad_lstick: 'left stick', pad_rstick: 'right stick',
    mapTitle: 'BLOCK MAP', mapClose: 'close', mapNorth: 'N', mapYou: 'You',

    // ---- wave 12: economy

    // ---- wave 13: weapons and grenades

  },
};

let lang = 'ru';
export function setLang(l) { lang = STR[l] ? l : 'ru'; }
export function getLang() { return lang; }
export function t(key, vars) {
  let s = (STR[lang] && STR[lang][key]) ?? STR.ru[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
