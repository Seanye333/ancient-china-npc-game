import { create } from 'zustand';

/**
 * 主角 — 這個遊戲的狀態以<b>一個人</b>為中心,不是以勢力為中心。
 *
 * 這是和一般三國策略遊戲最根本的差別:那些遊戲的 state 樹頂是「勢力」,
 * 底下掛城池、武將、外交;這裡樹頂是「你」,世界只是你所處的環境。
 * 差別會一路長到每一個系統 —— 你不會有「全國糧倉」這種欄位,
 * 你只會有「你身上有多少錢、你認識誰、你欠誰人情」。
 */

/** 11 白身 · 10 部曲 · 9 九品(最低官身) … 1 一方諸侯 */
export const RANK_COMMONER = 11;
export const RANK_RETAINER = 10;
export const RANK_LOWEST_OFFICE = 9;

/** 功績門檻,由下而上。前幾級刻意便宜 —— 開局要動得起來。 */
const RANK_FLOORS = [0, 6, 18, 40, 75, 130, 210, 320, 460, 620, 820];

const STATUS: Array<{ at: number; zh: string; en: string }> = [
  { at: 11, zh: '白身', en: 'Commoner' },
  { at: 10, zh: '部曲', en: 'Retainer' },
  { at: 8, zh: '武官', en: 'Officer' },
  { at: 6, zh: '大臣', en: 'Minister' },
  { at: 4, zh: '太守', en: 'Governor' },
  { at: 2, zh: '都督', en: 'Viceroy' },
  { at: 1, zh: '一方諸侯', en: 'Grand Marshal' },
];

export function rankForMerit(merit: number): number {
  for (let i = RANK_FLOORS.length - 1; i >= 0; i--) {
    if (merit >= RANK_FLOORS[i]) return RANK_COMMONER - i;
  }
  return RANK_COMMONER;
}

export function rankLabel(rank: number): { zh: string; en: string } {
  let best = STATUS[0];
  for (const s of STATUS) if (rank <= s.at) best = s;
  return best;
}

export function nextRankMerit(rank: number): number | null {
  const idx = RANK_COMMONER - rank + 1;
  return rank > 1 && idx < RANK_FLOORS.length ? RANK_FLOORS[idx] : null;
}

/** 私兵上限 — 品階是天花板,統率只決定摸不摸得到。 */
export function retinueCap(rank: number, leadership: number): number {
  if (rank >= RANK_COMMONER) return 10;      // 白身養得起幾個賓客,那不是兵
  if (rank >= RANK_RETAINER) return 50;
  if (rank >= 8) return 100;
  const byLead = leadership * 100;
  if (rank <= 3) return byLead + 6000;
  if (rank <= 5) return byLead + 3000;
  return byLead + 1000;
}

export interface Stats {
  war: number;
  leadership: number;
  intelligence: number;
  politics: number;
  charisma: number;
}

interface HeroState {
  name: string;
  courtesy: string;
  /** 籍貫 — 同鄉是這個世界最強的一條人脈。 */
  hometown: string;
  stats: Stats;
  merit: number;
  gold: number;
  food: number;
  /**
   * 無名的鄉勇人數。差事算人手時和 followers 合計。
   */
  retinue: number;
  /**
   * 有名有姓的同行者 —— npcs.ts 的 id。
   *
   * 和 retinue 分開,是因為<b>第一個跟你走的人該有名字</b>:
   * 你會記得「王安是第一個跟我走的」,不會記得「鄉勇 +1」。
   * 早期兩三個伙伴撐起整支隊伍,後期鄉勇才是大頭。
   */
  followers: string[];
  renown: number;
  /** 人情 — 誰欠你多少。 */
  favors: Record<string, number>;
  /** 傷勢剩餘旬數,0 = 無恙。 */
  wounded: number;

  addMerit: (n: number) => void;
  addGold: (n: number) => void;
  addRetinue: (n: number) => { taken: number; turnedAway: number };
  addFavor: (who: string, n: number) => void;
  /** 招他同行。人頭超過品階上限會拒絕。 */
  recruit: (id: string) => boolean;
  dismiss: (id: string) => void;
  hurt: (spans: number) => void;
  heal: () => void;
}

export const useHero = create<HeroState>((set, get) => ({
  name: '無名',
  courtesy: '',
  hometown: 'valley',
  stats: { war: 58, leadership: 52, intelligence: 46, politics: 40, charisma: 55 },
  merit: 0,
  gold: 30,
  food: 20,
  retinue: 0,
  followers: [],
  renown: 0,
  favors: {},
  wounded: 0,

  addMerit: (n) => set((s) => ({ merit: Math.max(0, s.merit + n) })),
  addGold: (n) => set((s) => ({ gold: Math.max(0, s.gold + n) })),

  /**
   * 收人。<b>收不下的要回報出去</b> —— 升品的動機該來自「人來了卻收不下」,
   * 而不是一條看不見的數值。
   */
  addRetinue: (n) => {
    const s = get();
    const cap = retinueCap(rankForMerit(s.merit), s.stats.leadership);
    const taken = Math.max(0, Math.min(n, cap - s.retinue));
    set({ retinue: s.retinue + taken });
    return { taken, turnedAway: n - taken };
  },

  addFavor: (who, n) => set((s) => ({ favors: { ...s.favors, [who]: (s.favors[who] ?? 0) + n } })),

  recruit: (id) => {
    const s = get();
    if (s.followers.includes(id)) return false;
    // 伙伴也佔人頭 —— 白身養不起一支隊伍,這條不設限的話品階就沒有意義
    const cap = retinueCap(rankForMerit(s.merit), s.stats.leadership);
    if (s.followers.length + s.retinue >= cap) return false;
    set({ followers: [...s.followers, id] });
    return true;
  },
  dismiss: (id) => set((s) => ({ followers: s.followers.filter((f) => f !== id) })),
  hurt: (spans) => set((s) => ({ wounded: Math.max(s.wounded, spans) })),
  heal: () => set((s) => ({ wounded: Math.max(0, s.wounded - 1) })),
}));

// 原型階段:截圖腳本要能直接擺好局面,不必每次都把招募流程重跑一遍
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__heroStore = useHero;
}

/** 讀出當前品階 — 隨功績自動推導,不另存。 */
export function useRank(): number {
  return rankForMerit(useHero((s) => s.merit));
}

/** 手上總人頭 = 有名的伙伴 + 無名的鄉勇。差事算人手看這個。 */
export function useHeadcount(): number {
  return useHero((s) => s.followers.length + s.retinue);
}
