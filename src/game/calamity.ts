import { create } from 'zustand';
import type { Season } from '../world/worldTime';

/**
 * 天災。
 *
 * 這個世界原本只有一種壞事:賊。可是漢末的縣裡,真正把人逼上山的
 * 從來不是賊,是<b>旱、澇、蝗、疫</b> —— 賊是結果不是原因。
 *
 * 所以災要能直接壓到收成與病死上,而且要壓得夠久:一場旱幾旬,
 * 你眼看著米價一格一格往上爬,而你手上那點糧是要吃掉還是留著。
 *
 * 災也是<b>賑濟</b>這件事存在的理由。散掉三石糧換不到一個銅錢,
 * 換到的是全村都知道你在最難的時候拿出了東西 ——
 * 對一個要靠人過日子的白身來說,那比三石糧值錢得多。
 */

export type CalamityKind = 'drought' | 'flood' | 'locust' | 'plague';

export const CALAMITY_LABEL: Record<CalamityKind, string> = {
  drought: '大旱', flood: '水患', locust: '蝗災', plague: '疫病',
};

export interface Calamity {
  kind: CalamityKind;
  /** 開始的那一天。 */
  since: number;
  /** 還要幾天。 */
  daysLeft: number;
}

/** 哪一季容易出哪一種災 —— 夏旱秋蝗,水患在雨季,疫病跟著荒年走。 */
const SEASON_WEIGHT: Record<CalamityKind, Record<Season, number>> = {
  drought: { spring: 0.6, summer: 1.6, autumn: 0.5, winter: 0.05 },
  flood: { spring: 0.8, summer: 1.5, autumn: 0.6, winter: 0.05 },
  locust: { spring: 0.3, summer: 1.2, autumn: 1.4, winter: 0 },
  plague: { spring: 0.7, summer: 0.9, autumn: 0.7, winter: 1.3 },
};

/**
 * 這一旬會不會出事。
 *
 * 底數壓得很低:災要罕見才有份量。一年出一次上下,玩家才會記得
 * 「那年的蝗災」,而不是把它當成天氣預報。
 */
export function calamityRoll(
  season: Season, harvest: number, roll: () => number,
): CalamityKind | null {
  // 已經歉收的年頭更容易再出事 —— 荒年是會連著來的
  const stress = harvest < 40 ? 1.5 : 1;
  const kinds = Object.keys(SEASON_WEIGHT) as CalamityKind[];
  for (const k of kinds) {
    if (roll() < 0.018 * SEASON_WEIGHT[k][season] * stress) return k;
  }
  return null;
}

export function calamityDays(kind: CalamityKind, roll: () => number): number {
  const base = kind === 'plague' ? 40 : kind === 'drought' ? 50 : 25;
  return Math.round(base * (0.7 + roll() * 0.7));
}

/** 災害每天對村子的影響。 */
export function calamityBite(kind: CalamityKind): {
  harvest: number; order: number; trade: number; sickMul: number;
} {
  switch (kind) {
    case 'drought': return { harvest: -0.55, order: -0.10, trade: -0.05, sickMul: 1.2 };
    case 'flood': return { harvest: -0.75, order: -0.15, trade: -0.30, sickMul: 1.5 };
    case 'locust': return { harvest: -1.30, order: -0.12, trade: 0, sickMul: 1.1 };
    case 'plague': return { harvest: -0.20, order: -0.25, trade: -0.40, sickMul: 3.2 };
  }
}

export function calamityWord(c: Calamity): string {
  switch (c.kind) {
    case 'drought': return '田裡裂了口子,井也淺了。';
    case 'flood': return '水漫過了下游的田埂。';
    case 'locust': return '蝗蟲過境,天都暗了一陣。';
    case 'plague': return '幾戶人家同時病倒,說是時疫。';
  }
}

interface CalamityState {
  active: Calamity | null;
  begin: (c: Calamity) => void;
  step: () => void;
  clear: () => void;
}

export const useCalamity = create<CalamityState>((set) => ({
  active: null,
  begin: (c) => set({ active: c }),
  step: () => set((s) => {
    if (!s.active) return s;
    const daysLeft = s.active.daysLeft - 1;
    return daysLeft <= 0 ? { active: null } : { active: { ...s.active, daysLeft } };
  }),
  clear: () => set({ active: null }),
}));

/* ── 賑濟 ──────────────────────────────────────────── */

/**
 * 散糧換名。
 *
 * 一石糧換多少鄉望。災年翻倍 —— 同樣一石米,平時是善舉,
 * 荒年是救命,村裡人記得的分量完全不同。
 */
export function reliefRenown(shi: number, inCalamity: boolean): number {
  return Math.round(shi * (inCalamity ? 3.2 : 1.4));
}

/** 賑濟同時也把村子拉回來一點 —— 你做的事要在世界上留下痕跡。 */
export function reliefOrder(shi: number): number {
  return Math.min(8, Math.round(shi * 0.6));
}
