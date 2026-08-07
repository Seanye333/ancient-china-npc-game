import { create } from 'zustand';
import type { Lodging } from './economy';
import type { WeaponId } from './weapons';
import { DOSE_SELF } from './herbs';

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
  /**
   * 歲數。過年長一歲,和村裡所有人同一套規矩 ——
   * 這個世界的人不會永遠二十五,主角也不該是例外。
   * (結義排年齒要用到它;在此之前這裡是一個寫死的 28。)
   */
  age: number;
  stats: Stats;
  merit: number;
  gold: number;
  /**
   * 手上的糧,以石計。<b>你帶的人也吃這一堆</b> ——
   * 招人不是白撿的戰力,每多一個名字冬天就早來一天。
   */
  grain: number;
  /** 手上的傢伙 —— 就一件,換了就是舊的不要了。 */
  weapon: WeaponId;
  /** 有沒有片瓦遮頭。睡得好不好、東西會不會被摸走,都看它。 */
  lodging: Lodging;
  /** 租金付到第幾天為止。到期沒錢就被趕出去。 */
  rentPaidThrough: number;
  /**
   * 累。做工、趕路、打架都會攢,睡一覺才消。
   * 有這個東西,「一天只有那麼長」才不只是時鐘上的數字。
   */
  toil: number;
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
  /**
   * 傷在哪 —— 傷不該只是一個倒數計時。
   * 腿:走得慢;臂:砍得輕;面:好了也留疤(疤是生平的一部分)。
   */
  woundKind: 'leg' | 'arm' | 'face' | null;
  /** 臉上的疤 —— 好不了的那種痕跡。 */
  scars: number;
  /** 手上的藥草,以株計。山上採的,或藥鋪買的。 */
  herbs: number;
  /**
   * 這道傷上次敷藥是哪一天(null = 從沒敷過)。
   *
   * 兩個用處:一是一旬只能敷一次(藥讓傷好一倍快,不是立刻好);
   * 二是<b>敷過藥的破相不留疤</b> —— 疤是「那次沒藥可敷」的紀念。
   */
  dressedOn: number | null;

  addMerit: (n: number) => void;
  addGold: (n: number) => void;
  /** 付錢。錢不夠就<b>什麼都不做並回報 false</b> —— 別讓餘額變成負數。 */
  spend: (n: number) => boolean;
  addGrain: (n: number) => void;
  setLodging: (l: Lodging, paidThrough?: number) => void;
  addToil: (n: number) => void;
  addRetinue: (n: number) => { taken: number; turnedAway: number };
  addFavor: (who: string, n: number) => void;
  /** 招他同行。人頭超過品階上限會拒絕。 */
  recruit: (id: string) => boolean;
  dismiss: (id: string) => void;
  addHerbs: (n: number) => void;
  hurt: (spans: number, kind?: 'leg' | 'arm' | 'face') => void;
  heal: () => void;
  /** 敷一次藥 —— 扣藥、傷減一分。能不能敷由 herbs.ts 的 canDress 說了算。 */
  dress: (day: number) => boolean;
}

/**
 * 傷結掉一分。
 *
 * 自然痊癒和敷藥走<b>同一個出口</b>:兩邊各寫一次的話,
 * 「破相留不留疤」遲早會長出兩個版本,而那種錯只有玩家會發現。
 */
function closeWound(
  s: { wounded: number; woundKind: 'leg' | 'arm' | 'face' | null; scars: number },
  treated: boolean,
) {
  const left = Math.max(0, s.wounded - 1);
  if (left > 0) return { wounded: left };
  return {
    wounded: 0,
    woundKind: null,
    dressedOn: null,
    scars: s.scars + (s.woundKind === 'face' && !treated ? 1 : 0),
  };
}

export const useHero = create<HeroState>((set, get) => ({
  name: '無名',
  courtesy: '',
  hometown: 'valley',
  age: 24,
  stats: { war: 58, leadership: 52, intelligence: 46, politics: 40, charisma: 55 },
  merit: 0,
  gold: 30,
  grain: 2,
  weapon: 'club',
  lodging: 'none',
  rentPaidThrough: 0,
  toil: 0,
  retinue: 0,
  followers: [],
  renown: 0,
  favors: {},
  wounded: 0,
  woundKind: null,
  scars: 0,
  herbs: 0,
  dressedOn: null,

  addMerit: (n) => set((s) => ({ merit: Math.max(0, s.merit + n) })),
  addGold: (n) => set((s) => ({ gold: Math.max(0, s.gold + n) })),
  spend: (n) => {
    if (get().gold < n) return false;
    set((s) => ({ gold: s.gold - n }));
    return true;
  },
  // 不在這裡四捨五入:一天吃掉三十分之一石,每天捨一次的誤差會一路累積下去。
  // 要好看是顯示端的事(UI 一律 toFixed(1))
  addGrain: (n) => set((s) => ({ grain: Math.max(0, s.grain + n) })),
  setLodging: (lodging, paidThrough) => set((s) => ({
    lodging, rentPaidThrough: paidThrough ?? s.rentPaidThrough,
  })),
  addToil: (n) => set((s) => ({ toil: Math.max(0, Math.min(12, s.toil + n)) })),

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
  addHerbs: (n) => set((s) => ({ herbs: Math.max(0, s.herbs + n) })),
  hurt: (spans, kind) => set((s) => ({
    wounded: Math.max(s.wounded, spans),
    // 舊傷未愈又添新傷:傷處以新的為準 —— 帳只有一本,別疊兩種減益
    woundKind: kind ?? s.woundKind ?? 'leg',
  })),
  // 好利索了 —— 破相而沒敷過藥的收口成疤,疤不會再掉
  heal: () => set((s) => closeWound(s, s.dressedOn !== null)),
  dress: (day) => {
    const s = get();
    if (s.wounded <= 0 || s.herbs < DOSE_SELF) return false;
    // dressedOn 擺在展開之前:傷這一下剛好結掉的話,closeWound 會把它清成 null,
    // 而那是對的 —— 下一道傷要重新算「敷過沒有」
    set({ herbs: s.herbs - DOSE_SELF, dressedOn: day, ...closeWound(s, true) });
    return true;
  },
}));

/**
 * 傷的減益 —— 數字集中一處,測試釘這裡。
 * 帶傷能走(不然「帶傷出門是在賭命」是句空話),但走不快、跑不動;
 * 腿傷最瘸,臂傷砍下去輕一截。
 */
export function woundPenalty(s: { wounded: number; woundKind: 'leg' | 'arm' | 'face' | null }) {
  if (s.wounded <= 0 || !s.woundKind) return { speed: 1, dmg: 1 };
  return {
    speed: s.woundKind === 'leg' ? 0.62 : 0.85,
    dmg: s.woundKind === 'arm' ? 0.72 : 1,
  };
}

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
