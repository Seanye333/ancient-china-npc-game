import { create } from 'zustand';

/**
 * 押貨。
 *
 * 這是四種活裡最後一件還在擲骰的 —— 不是因為難寫,是因為<b>沒有地方可押</b>。
 * 押貨要的是「陪一輛車走一段路」,而在縣城之前,這個世界只有一個聚落,
 * 硬做只會做出假的:走到一個座標,跳一行字說到了。
 *
 * 現在有了縣城,它才成立。而成立之後,它和別的活都不一樣:
 * <b>你不是去辦一件事,你是被一輛車綁住半天</b>。
 *
 * 車比人慢,而且你走遠了它就停 —— 於是「快走幾步先探路」這種事做不了,
 * 你只能陪著它。路上撞見下山的賊,你也躲不掉:丟下車跑,貨就沒了。
 * 這種被拖慢、被綁住的感覺,正是押貨這件差事真正的內容。
 */

export type CargoState = 'waiting' | 'moving' | 'delivered' | 'lost';

export interface Convoy {
  x: number; y: number; z: number; yaw: number;
  state: CargoState;
  /** 貨值多少 —— 丟了要賠。 */
  worth: number;
  /**
   * 車自己要走的路。
   *
   * <b>車不是跟著你走的,是自己認得路的</b> —— 你只是護著它。
   * 第一版讓車追著玩家跑,結果玩家一卡在樹叢裡,車也跟著停死:
   * 兩個都不動,而畫面上完全看不出來是誰先卡的。
   * 而且那個模型本身就不對:趕車的人比你熟這條路,你是保鏢不是嚮導。
   */
  route: Array<[number, number]>;
  /** 卡住多久了 —— 和玩家共用同一條規矩:走不動就重算。 */
  stuck: number;
  /** 上一次離下一個航點多遠。 */
  lastD: number;
}

/** 位置每幀在動,和戰鬥、下山的賊一樣走模組級。 */
export const convoy: { car: Convoy | null } = { car: null };

interface ConvoyState {
  /** 只是版本號 —— 位置不進 store,但「有沒有車」要能觸發重繪。 */
  version: number;
  bump: () => void;
}

export const useConvoy = create<ConvoyState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

/** 車走多快。比人慢一截 —— 這一截就是押貨的全部感覺。 */
export const CART_SPEED = 1.55;
/**
 * 你走遠了它就停 —— 押貨的人不在,趕車的不敢走。
 *
 * 這條繩子是這件差事的全部感覺:你不能先跑去探路,不能繞開那夥下山的賊,
 * 你被一輛牛車綁住了半天。
 */
export const CART_LEASH = 14;
/** 到了多近算交貨。 */
export const DELIVER_AT = 12;

export function startConvoy(
  at: { x: number; y: number; z: number }, worth: number,
  route: Array<[number, number]>,
) {
  convoy.car = { ...at, yaw: 0, state: 'moving', worth, route, stuck: 0, lastD: Infinity };
  useConvoy.getState().bump();
}

export function endConvoy() {
  convoy.car = null;
  useConvoy.getState().bump();
}

/** 貨值 —— 差事的酬勞越高,貨越貴,丟了賠得越多。 */
export function cargoWorth(pay: number): number {
  return Math.round(pay * 2.4);
}

/**
 * 丟了貨要賠多少。
 *
 * 賠不起就欠著(掉鄉望)—— 這比「直接扣到零」誠實:
 * 一個押丟了貨的人,在鄉里就是那個押丟了貨的人,那才是真正的代價。
 */
export function lossPenalty(worth: number, gold: number): {
  paid: number; renown: number; line: string;
} {
  if (gold >= worth) {
    return { paid: worth, renown: -3, line: `賠了 ${worth} 錢。` };
  }
  return {
    paid: gold,
    renown: -12,
    line: `你賠不出來。這筆帳記在了你頭上 —— 往後這一帶沒人敢託你押貨。`,
  };
}
