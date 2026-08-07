import { create } from 'zustand';
import type { Npc } from './npcs';

/**
 * 義結金蘭。
 *
 * 這個遊戲裡的每一個人都是<b>雇來的</b>:吃你的糧、按旬領月錢,
 * 你名聲爛了他就走,你斷糧兩頓他也走。那是這個世界誠實的地方 ——
 * 白身留不住人,本來就是白身的難處。
 *
 * 可是正因為如此,它缺了漢末最要緊的一種關係:<b>不是雇來的那個人</b>。
 * 桃園那一段之所以是桃園,不在於三個人有多能打,在於他們的關係
 * 不由錢維持 —— 而這個遊戲此前根本沒有辦法表達這件事。
 *
 * 所以結義給的和收的都很硬:
 *
 * 一、<b>不領月錢,也不會走。</b> 別人餓兩頓就散,他不散;
 *     你名聲狼藉到全村側目,他還在。這是全遊戲唯一一條「不受帳本管」的關係。
 * 二、<b>他會替你擋那一刀。</b> 你要倒下的那一下,他頂上去 —— 然後他倒下。
 *     這一條才是這個系統真正的意思:誓言值錢,恰恰在它讓他付出一切的那一刻。
 * 三、<b>結了就退不掉。</b> 「你先回去罷」對義兄弟按不出來,他佔著你的人頭上限,
 *     一輩子。白身的隨行上限只有十個 —— 兩個義兄弟是實打實的代價。
 * 四、<b>最多兩個。</b> 桃園那一回也只有三個人。
 */

interface OathState {
  /** 結義了的 npc id。 */
  sworn: string[];
  /** 哪一天結的 —— 生平那一頁要按先後排。 */
  swornOn: Record<string, number>;
  /**
   * 沒能跟你回來的義兄弟。
   *
   * 單獨記一份,而不是混進 lifeTally.lost:落幕那一頁上,
   * 「跟過你的人」和「替你死的兄弟」不該是同一行字。
   */
  fallen: string[];
  swear: (id: string, day: number) => void;
  mourn: (id: string) => void;
  reset: (s?: { sworn: string[]; swornOn: Record<string, number>; fallen: string[] }) => void;
}

export const useOath = create<OathState>((set) => ({
  sworn: [],
  swornOn: {},
  fallen: [],
  swear: (id, day) => set((s) => (s.sworn.includes(id) ? s : {
    sworn: [...s.sworn, id],
    swornOn: { ...s.swornOn, [id]: day },
  })),
  // 死了要從隨行名單上除名,但<b>名字留在 swornOn 裡</b> —— 生平要寫得出他是哪一年結的
  mourn: (id) => set((s) => ({
    sworn: s.sworn.filter((x) => x !== id),
    fallen: s.fallen.includes(id) ? s.fallen : [...s.fallen, id],
  })),
  reset: (v) => set({
    sworn: v?.sworn ?? [], swornOn: v?.swornOn ?? {}, fallen: v?.fallen ?? [],
  }),
}));

export function isSworn(id: string): boolean {
  return useOath.getState().sworn.includes(id);
}

/** 桃園那一回也只有三個人。 */
export const OATH_MAX = 2;
/** 要多少人情才談得上這件事 —— 比招人(joinThreshold)高出一截。 */
export const OATH_FAVOR = 14;
/** 擺酒設誓的花費:一隻雞、一壺酒、一炷香。 */
export const OATH_GOLD = 30;
export const OATH_GRAIN = 1;

/**
 * 現在能不能跟這個人結義 —— 不能的話要說得出為什麼。
 *
 * 三道門檻各有各的道理:<b>他得先跟過你</b>(沒一起走過路的人談什麼生死),
 * <b>交情要夠</b>,<b>酒肉錢要拿得出來</b>(設誓是要擺一桌的)。
 * 怕事的不肯 —— 這種事他擔不起。
 */
export function canSwear(input: {
  npc: Npc;
  favor: number;
  joined: boolean;
  count: number;
  gold: number;
  grain: number;
}): { ok: boolean; why: string } {
  if (isSworn(input.npc.id)) return { ok: false, why: '已經是兄弟了。' };
  if (input.count >= OATH_MAX) {
    return { ok: false, why: `結義不是收人。桃園那一回,也只有三個人。` };
  }
  if (!input.joined) return { ok: false, why: '沒一起走過路的人,談什麼生死。' };
  if (input.npc.temper === 'timid') return { ok: false, why: '他連連擺手 —— 這種事他擔不起。' };
  if (input.favor < OATH_FAVOR) {
    return { ok: false, why: `交情還差些（${input.favor}/${OATH_FAVOR}）。` };
  }
  if (input.gold < OATH_GOLD || input.grain < OATH_GRAIN) {
    return { ok: false, why: `設誓要擺一桌 —— ${OATH_GOLD} 錢、${OATH_GRAIN} 石糧。` };
  }
  return { ok: true, why: '' };
}

/**
 * 誓詞。
 *
 * 刻意不寫「不求同年同月同日生」那一句 —— 那是別人的話。
 * 這一段要像兩個真的在土屋前跪下的人說得出口的。
 */
export function oathWords(npc: Npc, heroName: string, elderIsHero: boolean): string {
  const [elder, younger] = elderIsHero ? [heroName, npc.name] : [npc.name, heroName];
  return `香插在土裡,酒潑了三成在地上。${elder}年長為兄,${younger}為弟 ——`
    + `「自今日起,你的事就是我的事。」`;
}

/** 誰年長。年紀一樣就算你長 —— 總得有個說法。 */
export function heroIsElder(heroAge: number, npcAge: number): boolean {
  return heroAge >= npcAge;
}

/* ── 帳本管不到的那部分 ────────────────────────────── */

/**
 * 這一旬要付幾個人的月錢 —— 義兄弟不算。
 *
 * 抽成函式而不是在日結裡減一減,是因為這是<b>結義最實在的那份好處</b>,
 * 得有個地方釘住它:一個義兄弟一年替你省下三十六個錢,
 * 剛好是白身兩天半的工。
 */
export function payrollCount(followers: string[], retinue: number): number {
  const free = followers.filter((id) => isSworn(id)).length;
  return Math.max(0, followers.length + retinue - free);
}

/**
 * 他會不會離開你。
 *
 * 義兄弟永遠回 false —— 這是整個系統最值錢的一條:
 * 世界上所有人都可能走,只有他不會。
 */
export function mayLeave(id: string): boolean {
  return !isSworn(id);
}

/**
 * 替你擋那一刀的人。
 *
 * 挑血最多的那一個 —— 他要擋得住才叫擋,一個本來就快倒的人頂上去,
 * 下一秒兩個人一起倒,那不是義氣,是浪費。
 * 一場架只擋一次(呼叫端記帳):第二次還有人頂,這件事就成了一層護甲。
 */
export function pickShield<T extends { hp: number }>(candidates: T[]): T | null {
  let best: T | null = null;
  for (const c of candidates) if (!best || c.hp > best.hp) best = c;
  return best;
}
