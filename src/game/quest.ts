import { create } from 'zustand';
import type { Errand } from './errands';

/**
 * 手上的活 —— 接了以後要<b>自己走出去辦</b>的那一件。
 *
 * 這個模組存在的理由只有一句:差事不能用擲骰子交代。
 * 在這之前,「剿匪」按下去就是一次 Math.random(),世界上那五夥賊蹲在原地
 * 跟這件事毫無關係 —— 那樣的差事是文本,不是遊戲。
 *
 * 接了活以後,活會指著地圖上<b>真的那一夥</b>:有名字、有座標、有幾個人。
 * 你得自己走過去,自己打,再自己走回來覆命。中間任何一步都可能出岔子。
 *
 * <b>一次只接一件</b>。這不是技術限制,是身分限制:你是白身,你只有一雙手。
 * 能同時接五件活的人,那叫衙門,不叫遊民。
 */

export interface Taken {
  errand: Errand;
  /** 委託人的名字 —— 覆命的時候要說「回去尋王安」,不是「回去尋 npc12」。 */
  patronName: string;
  /** 剿匪才有:地圖上那一夥的 id。 */
  bandId: string | null;
  /** 事情辦妥了,但還沒回去說 —— 這中間那段路是這個系統的重點。 */
  cleared: boolean;
}

interface QuestState {
  taken: Taken | null;
  accept: (t: Taken) => void;
  /** 事情在世界上辦成了(例如那夥賊被打散了)。 */
  markCleared: () => void;
  /** 覆完命,或是自己退了這件活。 */
  drop: () => void;
}

export const useQuest = create<QuestState>((set) => ({
  taken: null,
  accept: (t) => set({ taken: t }),
  markCleared: () => set((s) => (s.taken ? { taken: { ...s.taken, cleared: true } } : s)),
  drop: () => set({ taken: null }),
}));

// 原型階段:驗收腳本要能問「現在手上接了什麼、辦妥了沒」
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__quest = () => useQuest.getState().taken;
}

/** 北 = -z、東 = +x。整個專案只在這裡定一次方位,別處一律問這個函式。 */
const DIRS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];

/**
 * 從一個位移讀出方位。
 *
 * 給的是「西南」而不是箭頭,因為這個遊戲沒有小地圖 ——
 * 人問路得到的本來就是「往西邊林子走,約莫七十步」,不是一個座標。
 */
export function bearing(dx: number, dz: number): string {
  const turn = Math.atan2(dx, -dz) / (Math.PI * 2);   // 0 = 正北,順時針為正
  const i = ((Math.round(turn * 8) % 8) + 8) % 8;
  return DIRS[i];
}

/** 「約七十步」—— 距離也說得像人話,取整到五步。 */
export function paces(dx: number, dz: number): number {
  const d = Math.hypot(dx, dz);
  return d < 12 ? Math.round(d) : Math.round(d / 5) * 5;
}

/** 一句路引:「西南 · 約 70 步」。 */
export function wayWord(fromX: number, fromZ: number, toX: number, toZ: number): string {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  return `${bearing(dx, dz)} · 約 ${paces(dx, dz)} 步`;
}
