/**
 * 天上的規矩 —— 雲、積雪、陣風。
 *
 * 三件事湊在一個檔案裡,因為它們都是「天氣<b>過了一陣子</b>會怎樣」:
 * 雲隨天氣換一副樣子、雪一場一場積起來、風一陣一陣地來。
 * 這一層在這之前完全沒有 —— 天氣只有「此刻在下什麼」,
 * 於是雪下了半天地上還是綠的,雨停了雲還是那兩朵晴天的白棉花。
 *
 * 純數字,不碰 three,所以規矩本身在 vitest 裡驗得到。
 */

import type { Season, Weather } from './worldTime';

/* ── 雲 ────────────────────────────────────── */

export interface CloudLook {
  /** 幾團。 */
  clusters: number;
  /** 雲底高度。 */
  y: number;
  /** 一團有多大。 */
  size: number;
  /** rgb,0..1。 */
  color: [number, number, number];
  /** 單片的不透明度。 */
  opacity: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 這樣的天該有什麼雲。
 *
 * 三條物理上說得通、畫面上也讀得出來的規矩:
 * 一、<b>要下雨的雲又低又厚又暗</b>。晴天的積雲飄在八十公尺上,
 *     雨雲壓到四十 —— 「天低了」這件事不用寫字。
 * 二、<b>雪雲是一整片灰,不是一團一團</b>。所以雪天團數多、單片淡、
 *     鋪得平,連起來像一層蓋子。
 * 三、<b>夏天的雲高而聳,秋天的雲薄而遠</b>。這是季節在天上的簽名。
 */
export function cloudLook(weather: Weather, season: Season, dayK: number): CloudLook {
  const night = 1 - clamp01(dayK);
  let look: CloudLook;
  if (weather === 'rain') {
    look = { clusters: 11, y: 46, size: 46, color: [0.40, 0.42, 0.46], opacity: 0.20 };
  } else if (weather === 'snow') {
    look = { clusters: 13, y: 58, size: 52, color: [0.66, 0.68, 0.72], opacity: 0.14 };
  } else {
    look = { clusters: 6, y: 82, size: 34, color: [0.93, 0.95, 0.98], opacity: 0.17 };
    if (season === 'summer') { look.y = 96; look.size = 42; look.clusters = 7; }
    if (season === 'autumn') { look.y = 110; look.size = 30; look.opacity = 0.12; }
    if (season === 'winter') { look.color = [0.85, 0.87, 0.91]; look.clusters = 8; }
  }
  /*
   * 夜裡的雲不是白的 —— 它只反月光。不壓暗的話滿天亮斑,比沒有雲還糟。
   * 藍的那一路要<b>乘上 night</b>,不能一律加成:第一版寫死 ×1.06,
   * 於是白天的雲同樣偏藍,「夜裡更冷」這件事在數字上等於沒發生
   * (測試抓到的:兩邊的藍紅比一模一樣)。
   */
  const k = 1 - night * 0.66;
  look.color = [
    look.color[0] * k, look.color[1] * k, look.color[2] * k * (1 + night * 0.22),
  ];
  return look;
}

/* ── 積雪 ──────────────────────────────────── */

/**
 * 地上積了多厚的雪(0..1)。
 *
 * <b>攢得慢、化得更慢</b>,而且冬天有個底 —— 沒有這個底的話,
 * 一個沒下雪的冬日晴天,屋頂和地面會突然全部露出來,
 * 讀起來像春天忽然來了。
 *
 * 反過來,秋天下一場雪也該白一陣子再化掉 —— 從前積雪綁死在
 * 「季節是不是冬天」,所以秋雪落地即化,冬天沒下雪也照樣滿地白。
 */
export function snowTarget(weather: Weather, season: Season): number {
  if (weather === 'snow') return 1;
  return season === 'winter' ? 0.55 : 0;
}

/**
 * 往目標走一步。攢得快化得慢 —— 一夜大雪積得起來,化要好幾天。
 *
 * 時間常數寫成<b>秒</b>並且走指數逼近(1 - e^(-dt/τ)),不寫成
 * 「每幀乘一個係數」:後者的速度會跟著幀率跑,一台跑 144 的機器
 * 雪化得比 60 的快一倍多。
 */
const SNOW_ON = 55;      // 秒
const SNOW_OFF = 260;
export function snowStep(pack: number, target: number, dt: number): number {
  const tau = target > pack ? SNOW_ON : SNOW_OFF;
  return clamp01(pack + (target - pack) * (1 - Math.exp(-Math.max(0, dt) / tau)));
}

/* ── 陣風 ──────────────────────────────────── */

export interface Gust {
  /** 風力,0..1 以上。1 = 一般的風,2 以上是狂風。 */
  strength: number;
  /** 風向(單位向量的 x/z)。 */
  dx: number;
  dz: number;
}

/**
 * 此刻的風。
 *
 * 從前的風是 `0.55 + sin(t*0.13)*0.22 + sin(t*0.047)*0.14` —— 一條溫吞的
 * 波,而且<b>方向永遠一樣</b>:整座山的樹一年到頭往同一邊倒同樣的幅度。
 * 真正讓人看見風的是<b>陣</b>:平時幾乎不動,忽然一陣掃過去,
 * 樹梢先倒、草伏下、塵土跟著走一道,然後慢慢立回來。
 *
 * 陣是拿兩條週期不同的正弦相乘再取尖 —— 不用亂數,所以存讀檔、
 * 重播、截圖都對得上(這個專案吃過裸 Math.random 的虧)。
 */
export function gustAt(t: number, weather: Weather): Gust {
  const base = weather === 'rain' ? 1.25 : weather === 'snow' ? 0.8 : 0.30;
  /*
   * 兩條慢波相乘 —— 週期互質,所以陣與陣之間長短不一,不會數得出節拍。
   *
   * 頻率是量出來的,不是拍腦袋的:第一版(0.083 / 0.211)算下來
   * 兩陣之間隔<b>五十到八十秒</b> —— 驗收腳本盯了十五秒,一陣都沒等到,
   * 玩的時候更是「風這個東西根本不存在」。現在是十四到四十五秒一陣、
   * 間隔長短不一,四分之三的時間仍然是靜的。
   */
  const a = Math.sin(t * 0.16) * 0.5 + 0.5;
  const b = Math.sin(t * 0.37 + 1.7) * 0.5 + 0.5;
  // 取尖:大半時間接近零,偶爾竄上去
  const pulse = Math.pow(a * b, 2.6);
  const peak = weather === 'rain' ? 1.5 : weather === 'snow' ? 0.9 : 1.15;
  // 風向也慢慢轉 —— 一整年同一個方向的風不像風,像設定
  const ang = t * 0.017 + Math.sin(t * 0.0061) * 1.1;
  return {
    strength: base + pulse * peak,
    dx: Math.sin(ang),
    dz: Math.cos(ang),
  };
}

/** 這一刻算不算「一陣」—— 塵土與草浪只在陣裡出現。 */
export function gusting(g: Gust, weather: Weather): number {
  const base = weather === 'rain' ? 1.25 : weather === 'snow' ? 0.8 : 0.30;
  return clamp01((g.strength - base - 0.12) / 0.5);
}
