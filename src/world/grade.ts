/**
 * 調色 —— 一年四季、陰晴晝夜,各有各的顏色性格。
 *
 * 這一步和 skyFor() 分工:那邊調的是<b>光</b>(太陽多強、霧多厚、什麼色溫),
 * 這邊調的是<b>片子</b>(整張畫面的飽和、反差、暗部往哪偏)。
 * 兩件事分開的理由很實在:光改了,所有材質的明暗關係跟著變,
 * 容易把好不容易調對的東西弄壞;而調色是最後一道,改壞了也只壞一層。
 *
 * 為什麼一定要有:季節在這之前只換植被的顏色 —— 冬天是「綠變灰」,
 * 可真正讓人覺得冷的不是草的顏色,是<b>整張畫面的飽和掉下去、暗部發藍</b>。
 * 那件事材質做不到,只有這一層做得到。
 *
 * 純數字、不碰 three —— 所以規矩本身可以在 vitest 裡驗。
 */

import type { Season, Weather } from './worldTime';

export interface Grade {
  /** 暗部抬起來多少(rgb)。抬得越多越「灰」,是陰天與夜的招牌。 */
  lift: [number, number, number];
  /** 亮部的染色(rgb 乘數)。暖色調的黃昏就靠它。 */
  gain: [number, number, number];
  /** 反差,以 0.5 為軸。 */
  contrast: number;
  /** 飽和。1 = 不動。 */
  saturation: number;
}

const SEASON_BASE: Record<Season, Grade> = {
  // 春:嫩,飽和稍高、亮部偏一點點黃綠
  spring: { lift: [0.010, 0.014, 0.016], gain: [1.02, 1.02, 0.98], contrast: 1.02, saturation: 1.07 },
  // 夏:烈日,反差最高、亮部偏暖
  summer: { lift: [0.006, 0.008, 0.014], gain: [1.05, 1.02, 0.95], contrast: 1.07, saturation: 1.12 },
  // 秋:金,亮部推向赭黃,暗部也帶一點暖
  autumn: { lift: [0.016, 0.012, 0.008], gain: [1.07, 1.01, 0.90], contrast: 1.04, saturation: 1.10 },
  // 冬:飽和整個掉下去,暗部發藍 —— 這兩樣加起來才是「冷」
  winter: { lift: [0.014, 0.020, 0.034], gain: [0.98, 0.99, 1.04], contrast: 0.97, saturation: 0.80 },
};

/**
 * 天氣的修正 —— <b>乘在季節上</b>,不是另起一套。
 *
 * 分開寫是因為「冬天的雨」和「夏天的雨」該長得不一樣:
 * 各寫一套十二種組合遲早會有一格忘了改。
 */
const WEATHER_MUL: Record<Weather, { sat: number; contrast: number; lift: number }> = {
  clear: { sat: 1, contrast: 1, lift: 0 },
  // 雨:顏色被水洗掉一大半,反差也軟。lift 抬暗部 = 空氣裡有水的那種灰
  rain: { sat: 0.70, contrast: 0.90, lift: 0.030 },
  // 雪:去飽和但不像雨那麼軟 —— 雪地本身是高反差的
  snow: { sat: 0.80, contrast: 0.96, lift: 0.022 },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 這一刻該用什麼調色。
 *
 * @param dayK 0 = 深夜,1 = 大白天(skyFor().day)。
 *
 * 夜的處理不是「調暗」—— 亮度是光的事,這裡只做人眼在暗處的兩件事:
 * <b>顏色認不出來</b>(飽和掉到四成)和<b>暗處發藍</b>(浦肯野效應)。
 * 少了這兩樣,夜景只是白天關了燈,月光下的草照樣綠得刺眼。
 */
export function gradeFor(season: Season, weather: Weather, dayK: number): Grade {
  const base = SEASON_BASE[season];
  const w = WEATHER_MUL[weather];
  const night = 1 - clamp01(dayK);

  const sat = base.saturation * w.sat * (1 - night * 0.58);
  const contrast = base.contrast * w.contrast * (1 - night * 0.10);
  const liftAdd = w.lift + night * 0.030;

  return {
    lift: [
      base.lift[0] + liftAdd * 0.72,
      base.lift[1] + liftAdd * 0.86,
      // 抬暗部的時候藍抬得最多 —— 那就是「暗處發藍」
      base.lift[2] + liftAdd * 1.30,
    ],
    gain: [
      base.gain[0] * (1 - night * 0.06),
      base.gain[1],
      base.gain[2] * (1 + night * 0.10),
    ],
    contrast,
    saturation: Math.max(0, sat),
  };
}

/**
 * 把調色套到一個顏色上 —— 這四行<b>就是</b>著色器裡的四行。
 *
 * 留一份 JS 的意義不在渲染(渲染永遠走 GLSL 那份),在於<b>能驗</b>:
 * 「冬天比夏天灰」這種話,對著參數表是看不出來的 —— 飽和低但反差也低,
 * 最後落在畫面上是什麼樣要真的算一遍。兩份要一起改,這是代價。
 */
export function applyGrade(rgb: [number, number, number], g: Grade): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = rgb[i] * g.gain[i] + g.lift[i] * (1 - rgb[i]);
  for (let i = 0; i < 3; i++) out[i] = (out[i] - 0.5) * g.contrast + 0.5;
  const l = out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722;
  for (let i = 0; i < 3; i++) out[i] = clamp01(l + (out[i] - l) * g.saturation);
  return out;
}

/** 一個顏色離灰有多遠 —— 「這張畫面飽不飽和」用得上的最小尺子。 */
export function chroma(rgb: [number, number, number]): number {
  return Math.max(...rgb) - Math.min(...rgb);
}
