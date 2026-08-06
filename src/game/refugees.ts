import { create } from 'zustand';

/**
 * 流民。
 *
 * 村子爛到一個程度(或亂兵剛過、大災剛完),村口會出現一小群外鄉人:
 * 蹲在路邊,不討不搶,就是走不動了。
 *
 * 他們是這個世界對你的一道<b>不出聲的考題</b>:
 * 收留 —— 最便宜的人手(不要雇錢),但要吃你的糧,而且來歷不明;
 * 施粥 —— 一石糧換鄉望,災年的分量翻倍(和賑濟同一條規矩);
 * 不理 —— 五天後他們自己走,往下一個村去。趕走才掉鄉望,見死不救不掉 ——
 * 這個世道,自顧不暇不是罪。
 */

export interface RefugeeBand {
  count: number;
  /** 到的那天。待五天,沒人管就走。 */
  since: number;
  /** 施過粥了 —— 一夥人只吃你一次,再給就是白給。 */
  fed: boolean;
}

interface RefugeeState {
  band: RefugeeBand | null;
  arrive: (count: number, day: number) => void;
  feed: () => void;
  /** 收走 n 個。剩 0 就散了。 */
  take: (n: number) => void;
  leave: () => void;
}

export const useRefugees = create<RefugeeState>((set) => ({
  band: null,
  arrive: (count, day) => set({ band: { count, since: day, fed: false } }),
  feed: () => set((s) => (s.band ? { band: { ...s.band, fed: true } } : s)),
  take: (n) => set((s) => {
    if (!s.band) return s;
    const count = s.band.count - n;
    return { band: count > 0 ? { ...s.band, count } : null };
  }),
  leave: () => set({ band: null }),
}));

export const REFUGEE_STAY = 5;

/**
 * 今天會不會來一夥。
 *
 * 觸發不是純機率:要村子真的爛(治安低)或剛出過大事(由 daily 傳進來)。
 * 太平年頭不來 —— 流民往<b>還過得下去</b>的地方走,一個也爛掉的村子不值得停。
 */
export function refugeeRoll(input: {
  order: number; justCalamity: boolean; justMarauders: boolean; roll: () => number;
}): number {
  const base = input.justMarauders ? 0.5 : input.justCalamity ? 0.3
    : input.order < 25 ? 0.02 : 0;
  if (input.roll() >= base) return 0;
  return 3 + Math.floor(input.roll() * 4);          // 3–6 個
}

/** 收留流民不要雇錢 —— 這就是他們存在的經濟意義。但一樣吃糧、一樣月錢。 */
export function takeWord(n: number): string {
  return `${n} 個流民放下包袱跟了你。不要身價錢 —— 他們要的是口飯。`;
}
