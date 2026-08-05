import { create } from 'zustand';
import type { Season } from '../world/worldTime';

/**
 * 這個縣現在過得怎麼樣。
 *
 * 只有四個數,但它們是<b>差事、閒話、糧價的共同源頭</b> —— 村民抱怨的事
 * 和你能接到的活必須是同一件事。硬編一句「路上不太平」而實際沒有匪,
 * 那個世界就是假的。
 *
 * 刻意不做成一張大表:一個縣的處境用四個數講得完,多了玩家也記不住,
 * 而記不住的數值等於不存在。
 */

export interface VillageState {
  /** 治安 0–100。低了盜匪就出來。 */
  order: number;
  /** 收成 0–100。秋天結算,決定一年的糧與租。 */
  harvest: number;
  /** 商路 0–100。斷了就沒鏢可押,米價也跟著漲。 */
  trade: number;
  /** 米價,以「石/錢」計。低是好事。 */
  grainPrice: number;

  /** 世界的節奏 — 每旬推一次。 */
  tick: (season: Season) => void;
  nudge: (patch: Partial<Pick<VillageState, 'order' | 'harvest' | 'trade'>>) => void;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export const useVillage = create<VillageState>((set) => ({
  order: 58,
  harvest: 62,
  trade: 44,
  grainPrice: 34,

  tick: (season) => set((s) => {
    // 治安會自己緩慢回復,但秋收前後盜匪最凶 —— 有東西可搶的時候才有人搶
    const banditSeason = season === 'autumn' ? -3.5 : season === 'winter' ? -2.2 : 0.9;
    const order = clamp(s.order + banditSeason + (s.order < 40 ? -1.2 : 0.6));

    // 商路吃治安 —— 沒人敢走的路就不是路
    const trade = clamp(s.trade + (order > 55 ? 1.8 : -2.4));

    // 收成只在春夏長,秋天收掉,冬天歸零
    const harvest = season === 'spring' ? clamp(s.harvest + 4)
      : season === 'summer' ? clamp(s.harvest + 6)
        : season === 'autumn' ? clamp(s.harvest - 2)
          : clamp(s.harvest - 12);

    // 米價:收成好就便宜,商路斷就貴
    const grainPrice = Math.round(
      28 + (70 - harvest) * 0.42 + (60 - trade) * 0.30,
    );

    return { order, harvest, trade, grainPrice };
  }),

  nudge: (patch) => set((s) => ({
    order: patch.order !== undefined ? clamp(patch.order) : s.order,
    harvest: patch.harvest !== undefined ? clamp(patch.harvest) : s.harvest,
    trade: patch.trade !== undefined ? clamp(patch.trade) : s.trade,
  })),
}));

/** 治安讀出來的一句話 — 給閒話與 UI 共用,免得兩處說法不一致。 */
export function orderWord(order: number): string {
  if (order < 25) return '匪患猖獗';
  if (order < 42) return '路上不太平';
  if (order < 60) return '還算安穩';
  return '境內清平';
}

export function harvestWord(harvest: number): string {
  if (harvest < 25) return '歉收';
  if (harvest < 50) return '平平';
  if (harvest < 72) return '還過得去';
  return '大熟';
}
