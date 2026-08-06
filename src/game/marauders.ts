import { create } from 'zustand';
import type { VillageState } from './village';
import type { Lodging } from './economy';

/**
 * 亂兵過境。
 *
 * 這是這個遊戲第一個<b>不能用刀解決</b>的威脅。賊是三五個人,你帶人能剿;
 * 亂兵是潰散的部隊,幾十口刀 —— 打不過,躲得過。它的全部玩法在「提前得信」:
 * 酒肆裡花五個錢聽到「北邊過兵了」,你有兩天把糧搬進屋裡、把人帶去縣城;
 * 沒聽到,就只能眼睜睜看著。
 *
 * 漢末的縣志裡,「兵」和「匪」常常是同一頁的兩行 —— 對小民來說,
 * 過境的官軍和下山的賊,差別只在人數。
 */

export type MarauderPhase = 'coming' | 'present' | null;

export interface MarauderState {
  phase: MarauderPhase;
  /** 還有幾天到 / 還要禍害幾天。 */
  daysLeft: number;
  begin: (warnDays: number) => void;
  step: () => 'arrived' | 'left' | null;
  clear: () => void;
}

export const useMarauders = create<MarauderState>((set, get) => ({
  phase: null,
  daysLeft: 0,
  begin: (warnDays) => set({ phase: 'coming', daysLeft: warnDays }),
  step: () => {
    const s = get();
    if (!s.phase) return null;
    const left = s.daysLeft - 1;
    if (left > 0) { set({ daysLeft: left }); return null; }
    if (s.phase === 'coming') {
      set({ phase: 'present', daysLeft: 2 });        // 禍害兩天
      return 'arrived';
    }
    set({ phase: null, daysLeft: 0 });
    return 'left';
  },
  clear: () => set({ phase: null, daysLeft: 0 }),
}));

/**
 * 今天會不會有兵過境。
 *
 * 比天災還罕見(一年零到一次):它是段落,不是日常。
 * 治安崩了的年頭更容易招來 —— 亂世的壞事是連著的。
 */
export function marauderRoll(order: number, roll: () => number): boolean {
  return roll() < 0.0022 * (order < 30 ? 2 : 1);
}

/** 提前幾天有風聲 —— 這幾天就是這個系統給你的全部。 */
export function warnDays(roll: () => number): number {
  return 2 + Math.floor(roll() * 2);
}

/** 亂兵在的每一天,村子掉多少。比任何天災都狠,但只有兩天。 */
export function marauderBite(): Pick<VillageState, 'order' | 'harvest' | 'trade'> {
  return { order: -9, harvest: -7, trade: -8 } as Pick<VillageState, 'order' | 'harvest' | 'trade'>;
}

/**
 * 你自己被禍害多少 —— 看你人在不在村裡、糧放在哪。
 *
 * 有屋的人糧在屋裡,搶不走;露宿的人家當就在身上。
 * 人在村裡會被拉伕搜身;躲去縣城就只丟留在村裡的東西。
 * <b>「提前兩天知道」值錢,就值在這張表上。</b>
 */
export function personalLoss(input: {
  inVillage: boolean; lodging: Lodging; gold: number; grain: number; roll: () => number;
}): { gold: number; grain: number; word: string | null } {
  // 人不在就全身而退 —— 「提前兩天知道」的全部價值,就是這一條:走。
  if (!input.inVillage) return { gold: 0, grain: 0, word: null };
  const sheltered = input.lodging === 'owned' || input.lodging === 'rented';
  const gold = Math.round(input.gold * (0.25 + input.roll() * 0.25));
  // 有屋的糧鎖在屋裡;睡柴垛的,家當就在身上
  const grain = sheltered ? 0 : Math.min(input.grain, 1 + input.roll() * 2);
  return {
    gold, grain,
    word: `兵丁把你按在牆上搜了個遍,拿走 ${gold} 錢${grain > 0 ? `、${grain.toFixed(1)} 石糧` : ''}。`,
  };
}
