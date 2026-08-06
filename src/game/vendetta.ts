import { create } from 'zustand';
import { useBands } from './bands';

/**
 * 仇家 —— 跑掉的那幾個記住了你的臉。
 *
 * 這個系統回答一句一直沒人回答的話:<b>「打散」到底是什麼意思</b>。
 * 從前一夥人被打散,帳就結清了 —— 跑掉的那幾個像是走出了世界的邊界。
 * 可是他們沒死,他們知道是誰幹的,而你就住在那個村子裡。
 *
 * 三條規矩:
 *
 * 一、<b>只有跑掉的人才記仇</b>。倒下的不會回來,招安的成了自己人 ——
 *     所以「打得多乾淨」這件事第一次有了長期的後果。
 * 二、<b>他們找的是你,不是村子</b>。下山搶糧是生計,尋仇是私怨,
 *     兩件事在畫面上要看得出分別:一夥直奔村口,一夥直奔你站的地方。
 * 三、<b>一定先給風聲</b>。世界可以對你不利,不能瞞著你 ——
 *     動手前幾天,酒肆裡就有人在打聽你住哪。
 */

export interface Grudge {
  /** 記著這筆帳的人有幾個 —— 就是歷次從你手裡跑掉的數目。 */
  count: number;
  /** 最後一次結下樑子的日子。 */
  since: number;
  /** 風聲放出去了沒(哪一天) —— null = 還沒有人打聽你。 */
  warnedAt: number | null;
}

interface VendettaState {
  /** bandId → 這一夥欠你的帳。 */
  grudges: Record<string, Grudge>;
  remember: (bandId: string, fled: number, day: number) => void;
  warn: (bandId: string, day: number) => void;
  settle: (bandId: string) => void;
  reset: (g?: Record<string, Grudge>) => void;
}

export const useVendetta = create<VendettaState>((set) => ({
  grudges: {},
  remember: (bandId, fled, day) => set((s) => {
    if (fled <= 0) return s;
    const g = s.grudges[bandId];
    return {
      grudges: {
        ...s.grudges,
        [bandId]: {
          count: (g?.count ?? 0) + fled,
          since: day,
          // 又添了新仇,舊的風聲不算數 —— 這一趟要重新給預告
          warnedAt: null,
        },
      },
    };
  }),
  warn: (bandId, day) => set((s) => {
    const g = s.grudges[bandId];
    if (!g) return s;
    return { grudges: { ...s.grudges, [bandId]: { ...g, warnedAt: day } } };
  }),
  settle: (bandId) => set((s) => {
    if (!s.grudges[bandId]) return s;
    const next = { ...s.grudges };
    delete next[bandId];
    return { grudges: next };
  }),
  reset: (g) => set({ grudges: g ?? {} }),
}));

/** 攢夠幾個人才敢來尋仇 —— 一個人跑掉是逃命,三個人跑掉才是一夥。 */
export const VENDETTA_MIN = 3;
/** 結下樑子到動手之間,最少要過幾天。 */
export const VENDETTA_COOL = 8;
/** 風聲放出去到人真的來,還有幾天可以準備。 */
export const WARN_LEAD = 2;

/**
 * 今天該不該給你放風聲(酒肆裡有人打聽你)。
 *
 * 風聲必須在<b>動手之前</b>到,而且只放一次 —— 這是這個系統最要緊的
 * 一條:半夜被人堵在門口而事先一點徵兆都沒有,那不叫難,那叫耍人。
 */
export function shouldWarn(g: Grudge, day: number): boolean {
  return g.count >= VENDETTA_MIN
    && g.warnedAt === null
    && day - g.since >= VENDETTA_COOL - WARN_LEAD;
}

/**
 * 今天他們來不來。
 *
 * 三個門檻:人夠、時候到了、風聲已經放出去。過了門檻才擲骰 ——
 * 機率跟著人數走(記恨的人越多越敢),名聲大的人更招惹得起仇家:
 * 你越有名,他們越覺得這筆帳非討不可。
 */
export function vendettaChance(g: Grudge, day: number, renown: number): number {
  if (g.count < VENDETTA_MIN) return 0;
  if (day - g.since < VENDETTA_COOL) return 0;
  if (g.warnedAt === null || day - g.warnedAt < WARN_LEAD) return 0;
  return Math.min(0.45, 0.10 + g.count * 0.035 + Math.max(0, renown) * 0.0012);
}

/** 來幾個人 —— 記恨的人未必全來,但不會少於兩個。 */
export function vendettaSize(g: Grudge, roll: () => number): number {
  return Math.max(2, Math.round(g.count * (0.6 + roll() * 0.5)));
}

/**
 * 現在有誰記著你的仇(已經放出風聲、還沒動手)—— 給酒肆賣的那句話。
 * 只報「風聲已出」的那一夥:還沒放風聲就先講,等於偷跑了預告。
 */
export function hauntedBy(): string | null {
  const gs = useVendetta.getState().grudges;
  for (const [id, g] of Object.entries(gs)) {
    if (g.warnedAt === null) continue;
    // 報那一夥的名字,不是 id —— 酒肆裡的人不會說「band2」
    return useBands.getState().bands.find((b) => b.id === id)?.name ?? null;
  }
  return null;
}
