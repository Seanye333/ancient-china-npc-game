import { create } from 'zustand';
import { rng, terrainHeight, slopeAt, riverMask, walkable, WATER_Y } from '../world/field';
import { meanderAt } from '../world/sites';

/**
 * 山賊 — 世界上真的有那麼一夥人蹲在那裡。
 *
 * 不是差事文本裡的一個名詞:他們有座標、有人數、有兇悍程度,
 * 你可以自己摸過去,也可以一輩子繞著走。這是「差事」和「世界」的分水嶺 ——
 * <b>接了差事才存在的敵人是任務道具,先存在再被人提起的敵人才是世界</b>。
 *
 * 位置從種子算,所以每次載入都在同一個地方 —— 玩家記得住「西邊林子裡那夥」。
 * 治安低的時候他們才敢下山:村民口中那句「西邊林子裡那夥人又下來了」
 * 指的就是這裡的某一夥。
 */

export interface Band {
  id: string;
  name: string;
  x: number; z: number;
  /** 0..1,決定武力與士氣。 */
  fierce: number;
  count: number;
  /** 打散了沒。散掉的營寨會留在地上,但不再有人。 */
  routed: boolean;
}

const NAMES = ['黑石岡', '斷腸嶺', '野狐灘', '枯樹坳', '亂葬崗'];

/**
 * 賊窩選址。要離村子夠遠(走得到才有意義),又不能遠到找不著。
 *
 * 關鍵是<b>真的走得到</b>:第一版只按角度和距離撒點,結果有一夥落在崖壁上,
 * 玩家一路走過去卡在半山腰,離營地二十五步就是過不去 —— 畫面上看得見、
 * 腳下走不到,比沒有這夥人更糟。所以除了坡度與水深,還要從河谷拉一條直線
 * <b>逐點驗過去</b>。
 */
function makeBands(seed = 8821): Band[] {
  const rand = rng(seed);
  const out: Band[] = [];

  for (let i = 0; i < NAMES.length; i++) {
    let placed: { x: number; z: number } | null = null;
    for (let tries = 0; tries < 500 && !placed; tries++) {
      const ang = (i / NAMES.length) * Math.PI * 2 + (rand() - 0.5) * 1.1;
      const dist = 52 + rand() * 44;
      const x = Math.sin(ang) * dist;
      const z = Math.cos(ang) * dist;
      if (!goodSpot(x, z)) continue;
      if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 30)) continue;
      if (!reachable(x, z)) continue;
      placed = { x, z };
    }
    // 五百次都挑不到就退回河谷邊上 —— 寧可位置平庸,也不要一夥摸不到的賊
    const at = placed ?? fallbackSpot(i);
    out.push({
      id: `band${i}`,
      name: NAMES[i],
      x: at.x, z: at.z,
      fierce: 0.25 + rand() * 0.6,
      count: 2 + Math.floor(rand() * 5),
      routed: false,
    });
  }
  return out;
}

function goodSpot(x: number, z: number): boolean {
  const h = terrainHeight(x, z);
  if (h < WATER_Y + 1.2 || h > 18) return false;      // 不在水裡,也不在山頂
  if (slopeAt(x, z) > 0.30) return false;
  if (riverMask(x, z) > 0.35) return false;
  return true;
}

/** 從河谷邊上橫拉一條直線過去,九成的點走得過去才算數。 */
function reachable(x: number, z: number): boolean {
  const fx = meanderAt(z) + (x > meanderAt(z) ? 16 : -16);
  const n = Math.max(8, Math.round(Math.abs(x - fx) / 2.5));
  let ok = 0;
  for (let i = 0; i <= n; i++) {
    if (walkable(fx + (x - fx) * (i / n), z)) ok++;
  }
  return ok / (n + 1) >= 0.9;
}

function fallbackSpot(i: number) {
  const z = -70 + i * 35;
  return { x: meanderAt(z) + (i % 2 ? 34 : -34), z };
}

interface BandsState {
  bands: Band[];
  rout: (id: string) => void;
  /** 被打散的一夥過些時日會有人回來 —— 剿匪不是一勞永逸。 */
  regrow: () => void;
  /**
   * 沒人剿,賊就坐大。
   *
   * 原本 regrow 只會把散掉的窩變小 —— 於是放著不管的世界會越來越太平,
   * 這和亂世的方向正好相反。現在治安差的旬,活著的窩會添人丁;
   * 坐大到一個程度,縣衙就得貼榜(見 yamen 的懸賞)。
   * 回傳坐大到出名的那一夥,好讓日誌說一句。
   */
  swell: (order: number, roll: () => number) => Band | null;
}

export const useBands = create<BandsState>((set) => ({
  bands: makeBands(),
  rout: (id) => set((s) => ({
    bands: s.bands.map((b) => (b.id === id ? { ...b, routed: true } : b)),
  })),
  swell: (order, roll) => {
    let famous: Band | null = null;
    set((s) => ({
      bands: s.bands.map((b) => {
        if (b.routed || order >= 40 || roll() > 0.30) return b;
        if (b.count >= 10) return b;
        const grown = { ...b, count: b.count + 1, fierce: Math.min(0.95, b.fierce + 0.02) };
        if (grown.count === 8) famous = grown;      // 過了這個檻,鄉里就有名了
        return grown;
      }),
    }));
    return famous;
  },
  regrow: () => set((s) => {
    if (!s.bands.some((b) => b.routed)) return s;
    return {
      bands: s.bands.map((b) => (b.routed && Math.random() < 0.12
        // 回來的是小股,而且沒了原來的頭目,沒那麼兇
        ? { ...b, routed: false, count: 2 + Math.floor(Math.random() * 3), fierce: b.fierce * 0.8 }
        : b)),
    };
  }),
}));

/** 這夥人有多難打 — 給 UI 一句話,不給數字。 */
export function bandWord(b: Band): string {
  const w = b.count * (0.6 + b.fierce);
  if (w >= 6.5) return '一大夥,不好惹';
  if (w >= 4) return '有些人手';
  return '三兩個毛賊';
}
