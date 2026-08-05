import { create } from 'zustand';

/**
 * 互動 — 玩家與世界之間那條線。
 *
 * 這裡有個效能上的分工:玩家與 NPC 的<b>座標每幀在變,不能進 zustand</b>
 * (每幀 set 一次會讓整棵 React 樹重繪);但「現在最近的是誰」變得很慢,
 * 放進 store 剛好。所以座標走模組級的可變引用,選中的人走 store。
 */

/** 玩家座標 — 高頻,由 Player 每幀寫入,互動偵測每 0.15 秒讀一次。 */
export const playerPos = { x: 0, y: 0, z: 0, yaw: 0 };

/**
 * 把人挪到別處去 —— 目前只有一個用途:打輸了以後「再睜眼時人已經在路邊」。
 *
 * 非有不可,因為<b>打輸了那夥賊還在原地</b>。不把你挪開,收兵的視窗一關,
 * 你還站在他們臉上,下一幀就再打一場,一路輸到死。
 * 走 playerPos 沒用 —— 那是每幀被 Player 覆寫的鏡子,不是本體。
 */
export const warp = { x: 0, z: 0, pending: false };
export function warpPlayer(x: number, z: number) {
  warp.x = x; warp.z = z; warp.pending = true;
}

/** 一個可互動的對象在世界上的位置 —— 由 Crowd 每幀維護。 */
export interface Presence {
  id: string;
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

/** NPC 的即時位置表 — 同樣是高頻,不進 store。 */
export const presences: Presence[] = [];

/**
 * 隨行的人也要能搭話 —— 他們已經不在村裡的作息隊伍裡了(不然會有兩個他),
 * 但總不能招進來就從此只剩一個數字。分成兩張表,是因為維護它們的是兩個元件,
 * 誰都不該去清空對方寫的東西。
 */
export const companions: Presence[] = [];

/** 走一遍在場的所有人 — 村民 + 隨行。 */
export function eachPresence(fn: (p: Presence) => void) {
  for (const p of presences) fn(p);
  for (const p of companions) fn(p);
}

export function findPresence(id: string): Presence | undefined {
  return presences.find((p) => p.id === id) ?? companions.find((p) => p.id === id);
}

interface InteractState {
  /** 走得夠近、可以搭話的那個人。 */
  nearbyId: string | null;
  /** 正在對話的人。 */
  talkingTo: string | null;
  setNearby: (id: string | null) => void;
  open: (id: string) => void;
  close: () => void;
}

export const useInteract = create<InteractState>((set) => ({
  nearbyId: null,
  talkingTo: null,
  setNearby: (id) => set((s) => (s.nearbyId === id ? s : { nearbyId: id })),
  open: (id) => set({ talkingTo: id }),
  close: () => set({ talkingTo: null }),
}));

/** 搭話的距離。太遠會變成隔空喊話,太近又得貼著人走。 */
export const TALK_RANGE = 3.4;
