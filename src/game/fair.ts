import { create } from 'zustand';
import { makeVillagers, might, type Npc } from './npcs';
import { deltaOf } from './folk';

/**
 * 社日的擂台。
 *
 * 三場連著打:村裡拳腳最硬的三個人,從第三硬打到最硬 ——
 * 一場比一場難,贏完三場才有彩頭。輸一場就下台,今年沒份,
 * 明年再來:<b>彩頭要稀罕才叫彩頭</b>。
 *
 * 打的是切磋那一套(點到為止),但擂台是當著全村的面 ——
 * 贏一場漲的鄉望比私下切磋多,三場全勝那一下,半個縣都聽得見。
 */

interface FairState {
  /** 打到第幾場(0 = 還沒上台)。 */
  round: number;
  /** 今天已經贏完 / 已經被打下來了。 */
  out: boolean;
  champion: boolean;
  advance: () => void;
  fall: () => void;
  reset: () => void;
}

export const useFair = create<FairState>((set) => ({
  round: 0,
  out: false,
  champion: false,
  advance: () => set((s) => {
    const round = s.round + 1;
    return round >= 3 ? { round: 3, out: true, champion: true } : { round };
  }),
  fall: () => set({ out: true }),
  reset: () => set({ round: 0, out: false, champion: false }),
}));

/**
 * 今年的三個對手 —— 從還在世、沒跟著你走的村民裡挑拳腳最硬的三個,
 * 由弱到強排。跟著你的人不上台:自己人打自己人,那不叫奪彩叫內訌。
 */
export function contenders(followers: string[]): Npc[] {
  return makeVillagers(38)
    .filter((p) => !followers.includes(p.id) && !deltaOf(p.id).dead)
    .sort((a, b) => might(b) - might(a))
    .slice(0, 3)
    .reverse();
}

/** 彩頭。 */
export const FAIR_PRIZE_GOLD = 80;
export const FAIR_PRIZE_RENOWN = 10;
