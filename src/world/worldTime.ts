import * as THREE from 'three';
import { create } from 'zustand';
import { seasonOf, firstDayOf } from '../game/calendar';

/**
 * 世界時鐘 — 一天的時辰與四季。
 *
 * 所有隨時間變的東西都從這裡導出,不各自算各自的:太陽方位與色溫、
 * 天空散射、霧色、環境光,以及四季的地表與林相配色。
 * 分散去算的下場是黃昏的太陽配著正午的霧。
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_LABEL: Record<Season, string> = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
};

export type Weather = 'clear' | 'rain' | 'snow';
export const WEATHERS: Weather[] = ['clear', 'rain', 'snow'];
export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '晴', rain: '雨', snow: '雪',
};

/**
 * 一秒真實時間走掉多少個時辰 —— 一天約四分鐘。
 *
 * 這個數字是有意調慢的:走到最近的賊窩要兩分鐘,也就是<b>大半天</b>。
 * 一趟差事花掉一天,那句「早去早回」才有重量。快了就變成不用計較的旅費。
 */
const HOUR_RATE = 0.1;

interface ClockState {
  hour: number;                 // 0–24
  /** 開局以來第幾天。<b>季節由它推導</b>,不是另外存一份。 */
  day: number;
  season: Season;
  weather: Weather;
  auto: boolean;
  setHour: (h: number) => void;
  setSeason: (s: Season) => void;
  setWeather: (w: Weather) => void;
  toggleAuto: () => void;
  tick: (dt: number) => void;
  /** 過掉一段時間(睡覺、做工、趕路)。跨日的結算由 VillageClock 接手。 */
  advance: (hours: number) => void;
}

export const useClock = create<ClockState>((set) => ({
  hour: 7.4,
  day: 0,
  season: seasonOf(0),
  weather: 'clear',
  auto: true,
  setHour: (hour) => set({ hour }),
  // 除錯面板直接點季節 —— 跳到那一季的頭一天,而不是偷偷改一個和日子對不上的欄位
  setSeason: (season) => set((s) => ({ season, day: firstDayOf(season, s.day) })),
  setWeather: (weather) => set({ weather }),
  toggleAuto: () => set((s) => ({ auto: !s.auto })),
  tick: (dt) => set((s) => {
    if (!s.auto) return {};
    const h = s.hour + dt * HOUR_RATE;
    if (h < 24) return { hour: h };
    const day = s.day + Math.floor(h / 24);
    return { hour: h % 24, day, season: seasonOf(day) };
  }),
  advance: (hours) => set((s) => {
    const h = s.hour + Math.max(0, hours);
    const day = s.day + Math.floor(h / 24);
    return { hour: h % 24, day, season: seasonOf(day) };
  }),
}));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 季節推移日照長度 — 冬天日短夜長,夏天相反。 */
export function daylight(season: Season) {
  switch (season) {
    case 'winter': return { rise: 7.3, set: 16.8 };
    case 'autumn': return { rise: 6.4, set: 18.0 };
    case 'spring': return { rise: 6.0, set: 18.4 };
    case 'summer': return { rise: 5.1, set: 19.4 };
  }
}

export interface SkyState {
  /** 天穹著色器的太陽位置 —— 夜裡在地平線下,天才會黑。 */
  sun: THREE.Vector3;
  /** 平行光的位置 —— 白天是太陽,夜裡是月亮。掛在天上的和照在地上的要同源。 */
  light: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  skyColor: THREE.Color;
  groundColor: THREE.Color;
  hemiIntensity: number;
  ambient: number;
  fog: THREE.Color;
  fogDensity: number;
  turbidity: number;
  rayleigh: number;
  exposure: number;
  /** 0 = 深夜,1 = 大白天。給其他系統當總開關用。 */
  day: number;
}

const NOON = new THREE.Color('#fff4e0');
const GOLDEN = new THREE.Color('#ffb066');
const DUSK = new THREE.Color('#ff8a4a');
const NIGHT = new THREE.Color('#8fa6d8');

const FOG_DAY = new THREE.Color('#b9c9d8');
const FOG_GOLD = new THREE.Color('#c9a483');
const FOG_NIGHT = new THREE.Color('#1b2434');

export function skyFor(hour: number, season: Season, weather: Weather = 'clear'): SkyState {
  const { rise, set } = daylight(season);
  const noon = (rise + set) / 2;
  const half = (set - rise) / 2;

  // 太陽高度角:日出 0 → 正午 1 → 日落 0,夜間為負
  const t = (hour - noon) / half;                  // -1..1 白天
  const alt = Math.cos((t * Math.PI) / 2);          // 白天 0..1
  const isDay = hour > rise && hour < set;
  const day = isDay ? clamp01(alt * 1.25) : 0;

  // 方位:東升西落
  const azT = clamp01((hour - rise) / (set - rise));
  const az = Math.cos(azT * Math.PI);
  const sunY = isDay ? Math.max(2, alt * 96) : -30;
  const sun = new THREE.Vector3(az * 150, sunY, 52 + (1 - alt) * 30);
  /**
   * 平行光的位置。白天就是太陽;夜裡是<b>月亮</b> —— 從前夜間光源擺在
   * y=-30(地平線下的太陽),從地底往上照,影子全靠環境光遮掩。
   * 月亮走自己的弧:入夜升起、下半夜偏西。NightSky 畫的那輪和照在
   * 地上的光同用這個方向 —— 月亮掛在東邊,影子就不能倒向東。
   * 注意 Sky 著色器仍然吃 sun:把月亮塞給它,半夜的天會亮成白晝
   * (踩過:22:42 滿地暖光,像黃昏)。
   */
  let light = sun;
  if (!isDay) {
    const nightLen = 24 - (set - rise);
    const sinceSet = ((hour - set) + 24) % 24;
    const u = clamp01(sinceSet / nightLen);
    const malt = Math.sin(u * Math.PI);
    light = new THREE.Vector3(Math.cos(u * Math.PI) * 130, 18 + malt * 60, 40);
  }

  // 低角度的太陽偏暖 — 大氣路徑長,藍光散掉了
  const warmth = clamp01(1 - alt * 1.35);
  const sunColor = new THREE.Color().copy(NOON).lerp(GOLDEN, warmth);
  if (alt < 0.22) sunColor.lerp(DUSK, clamp01((0.22 - alt) / 0.22));
  if (!isDay) sunColor.copy(NIGHT);

  // 夜間是月光 — 不能歸零,遊戲裡的夜要看得見輪廓。
  // 月亮挪到頭頂之後這個數也得跟著砍:0.52 是「從地底照」時代的值,
  // 光真的落在地上以後,同樣的強度夜就成了暖洋洋的黃昏
  const sunIntensity = isDay ? lerp(0.9, 3.6, clamp01(alt * 1.2)) : 0.30;

  // 霧:白天淡藍、黃昏轉暖、入夜壓深
  const fog = new THREE.Color();
  if (!isDay) fog.copy(FOG_NIGHT);
  else {
    fog.copy(FOG_DAY).lerp(FOG_GOLD, warmth);
    const edge = clamp01((0.30 - alt) / 0.30);
    fog.lerp(FOG_NIGHT, edge * 0.45);
  }

  const winter = season === 'winter' ? 1 : 0;
  const summer = season === 'summer' ? 1 : 0;
  // 陰雨天:陽光壓掉大半、霧加厚、天空去飽和 — 天氣不改光,粒子就只是貼在畫面上的雜訊
  const overcast = weather === 'clear' ? 0 : weather === 'rain' ? 0.72 : 0.52;

  return {
    sun,
    light,
    sunColor,
    sunIntensity: sunIntensity * (1 - overcast * 0.78),
    skyColor: new THREE.Color(isDay ? '#b5cbe6' : '#26324a'),
    groundColor: new THREE.Color(winter ? '#7d8794' : '#6b573a'),
    hemiIntensity: (isDay ? lerp(0.55, 1.05, alt) : 0.46) * lerp(1, 1.25, overcast),
    ambient: isDay ? lerp(0.18, 0.30, alt) : 0.26,
    fog,
    // 冬天霾重、夏天通透
    fogDensity: lerp(0.0015, 0.0026, warmth) * lerp(1, 1.35, winter) * lerp(1, 0.82, summer)
      * lerp(1, 2.6, overcast),
    turbidity: lerp(3.4, 10.5, warmth) * lerp(1, 1.7, overcast),
    rayleigh: lerp(1.4, 3.2, warmth),
    exposure: (isDay ? lerp(1.55, 2.05, warmth) : 1.72) * lerp(1, 0.86, overcast),
    day,
  };
}

/* ── 四季的配色 ── 地表與林相 */
export interface SeasonPalette {
  grass: THREE.Color;
  dry: THREE.Color;
  silt: THREE.Color;
  rock: THREE.Color;
  snow: THREE.Color;
  snowLo: number;                 // 雪線起點(世界高度)
  snowHi: number;
  conifer: THREE.Color;
  broadleaf: THREE.Color;
  bamboo: THREE.Color;
  willow: THREE.Color;
  reed: THREE.Color;
  paddy: THREE.Color;
}

/**
 * 月相 —— 從曆法的日子推,不另存一份。三旬一月,十五望:
 * 0 = 朔(看不見),0.5 = 望(滿月)。玩家若注意到「每逢十五月最圓」,
 * 那不是彩蛋,是曆法在天上寫著。
 */
export function moonPhase(day: number): number {
  return ((day % 30) + 30) % 30 / 30;
}

export function paletteFor(season: Season): SeasonPalette {
  switch (season) {
    case 'spring':
      return {
        grass: new THREE.Color('#5c7a34'), dry: new THREE.Color('#77803f'),
        silt: new THREE.Color('#7d6a4c'), rock: new THREE.Color('#565149'),
        snow: new THREE.Color('#dfe4ea'), snowLo: 44, snowHi: 58,
        conifer: new THREE.Color('#33502f'), broadleaf: new THREE.Color('#6f8a36'),
        bamboo: new THREE.Color('#5f7f33'), willow: new THREE.Color('#7d9840'),
        reed: new THREE.Color('#7c7c42'), paddy: new THREE.Color('#6a7d40'),
      };
    case 'summer':
      return {
        grass: new THREE.Color('#415c28'), dry: new THREE.Color('#6a6c35'),
        silt: new THREE.Color('#75634a'), rock: new THREE.Color('#524d46'),
        snow: new THREE.Color('#e4e9ef'), snowLo: 52, snowHi: 64,
        conifer: new THREE.Color('#25391f'), broadleaf: new THREE.Color('#3c5423'),
        bamboo: new THREE.Color('#46662a'), willow: new THREE.Color('#4f6d2e'),
        reed: new THREE.Color('#63682f'), paddy: new THREE.Color('#4d6a2b'),
      };
    case 'autumn':
      return {
        grass: new THREE.Color('#6b6a38'), dry: new THREE.Color('#87703a'),
        silt: new THREE.Color('#7a664a'), rock: new THREE.Color('#585047'),
        snow: new THREE.Color('#dde2e8'), snowLo: 40, snowHi: 54,
        conifer: new THREE.Color('#2c402a'), broadleaf: new THREE.Color('#8a6326'),
        bamboo: new THREE.Color('#6d7434'), willow: new THREE.Color('#8a7c34'),
        reed: new THREE.Color('#8a7a44'), paddy: new THREE.Color('#8e7a35'),
      };
    case 'winter':
      return {
        grass: new THREE.Color('#6e6d5c'), dry: new THREE.Color('#7d7562'),
        silt: new THREE.Color('#6e6455'), rock: new THREE.Color('#5c5a55'),
        snow: new THREE.Color('#e8ecf1'), snowLo: 8, snowHi: 22,
        conifer: new THREE.Color('#33433a'), broadleaf: new THREE.Color('#6a5f4c'),
        bamboo: new THREE.Color('#5c6a48'), willow: new THREE.Color('#6b6350'),
        reed: new THREE.Color('#8d8770'), paddy: new THREE.Color('#7f7c6b'),
      };
  }
}
