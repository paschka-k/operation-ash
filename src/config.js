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
};

const KEY = 'ruined-block-fps.settings.v1';

export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch (e) { /* storage may be blocked */ }
  if (!QUALITY[s.quality]) s.quality = 'medium';
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
