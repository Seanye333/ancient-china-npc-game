import { create } from 'zustand';
import type { Band } from './bands';
import type { VillageState } from './village';
import type { Season } from '../world/worldTime';

/**
 * 下山。
 *
 * 在這之前,賊是<b>蹲在窩裡等你</b>的:村民口中「西邊那夥人又下來搶糧道了」
 * 在世界上沒有對應的事,治安那個數字也沒有畫面。你不去找他們,
 * 他們一輩子不會動 —— 那不是山賊,那是靶場。
 *
 * 現在他們會出來:治安越差、秋收前後越敢,一夥人離開營地往村子走。
 * 三件事因此接上了:
 *
 * 一、<b>治安有了畫面</b>。數字低的時候你會在路上撞見人,而不是只看到一行字。
 * 二、<b>剿匪有了理由</b>。放著不管,他們真的會到村口,真的會讓收成掉。
 * 三、<b>路上有了風險</b>。從此走去哪裡都不再是純粹的位移。
 *
 * 位置是高頻資料,和 combat.ts 的 fighters 一樣走模組級陣列;
 * store 裡只放「有幾夥在外面」這種變得很慢的東西。
 */

export type RaidPhase = 'out' | 'raiding' | 'back';

export interface RaidParty {
  id: string;
  bandId: string;
  name: string;
  count: number;
  fierce: number;
  x: number; y: number; z: number; yaw: number;
  phase: RaidPhase;
  /** 到了村口以後賴著不走的時間 —— 讓玩家來得及趕回去。 */
  linger: number;
  /**
   * 正在跟你打。
   *
   * 打起來的時候<b>不能把這一夥從陣列裡刪掉</b>:刪了以後你要是打輸,
   * 他們就憑空消失 —— 攔路失敗反而幫村子解了圍,說不通。
   * 所以只是掛個旗子:不再移動、不再重複接戰,勝負由收場那段決定去留。
   */
  fighting?: boolean;
  /** 出發那天,日誌上要說得出「這夥人出來三天了」。 */
  since: number;
}

export const raidParties: RaidParty[] = [];

interface RaidState {
  /** 只是一個版本號 —— 位置每幀在變,不能進 store,但「多了一夥」要能觸發重繪。 */
  version: number;
  bump: () => void;
}

export const useRaids = create<RaidState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

/**
 * 今天有沒有人下山。
 *
 * 機率吃三件事:治安、季節、那一夥有多兇。秋收前後最凶 ——
 * 有東西可搶的時候才有人搶,這條和 village.ts 裡治安的季節曲線是同一個道理。
 */
export function raidChance(b: Band, village: VillageState, season: Season): number {
  if (b.routed) return 0;
  const order = 1 - village.order / 100;               // 治安越差越敢
  const harvest = season === 'autumn' ? 0.9 : season === 'winter' ? 0.55 : 0.2;
  return Math.min(0.34, 0.012 + order * 0.10 * (0.5 + b.fierce) + harvest * 0.035 * b.fierce);
}

/** 這夥人派幾個出來。留守的不會傾巢而出 —— 窩總得有人看。 */
export function raidSize(b: Band, roll: () => number): number {
  return Math.max(1, Math.min(b.count - 1, Math.round(b.count * (0.4 + roll() * 0.35))));
}

export function alreadyOut(bandId: string): boolean {
  return raidParties.some((r) => r.bandId === bandId);
}

export function clearRaids() {
  raidParties.length = 0;
  useRaids.getState().bump();
}

/**
 * 招安 —— 把丟下刀跑的那幾個收成自己的人。
 *
 * 這是「打贏一夥賊」之後最該有的選擇,也是這個遊戲少數幾個
 * <b>把敵人變成負擔</b>的機制:收下來的人要吃飯(daily.ts 按人頭扣糧),
 * 於是「要不要收」是一個真的決定,而不是白撿的獎勵。
 *
 * 肯不肯降看三件事:你把他們打得多慘、你的名聲、以及你會不會說話。
 */
export function surrenderChance(input: {
  foesDown: number; foesFled: number; charisma: number; merit: number;
}): number {
  const beaten = input.foesDown / Math.max(1, input.foesDown + input.foesFled);
  return Math.max(0.05, Math.min(0.92,
    0.18 + beaten * 0.34 + (input.charisma - 40) / 160 + Math.min(0.2, input.merit / 500),
  ));
}

/** 肯降的有幾個 —— 不會是全部,總有人頭也不回地跑掉。 */
export function surrenderCount(foesFled: number, roll: () => number): number {
  return Math.max(1, Math.round(foesFled * (0.45 + roll() * 0.4)));
}
