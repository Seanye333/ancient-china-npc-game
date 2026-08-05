import { create } from 'zustand';
import { rankForMerit, RANK_RETAINER } from './hero';
import type { Lodging } from './economy';
import { partsFor, numberWord } from './calendar';

/**
 * 落幕。
 *
 * 在這之前這個遊戲沒有結束的方式:你可以無限走下去,而一個沒有盡頭的
 * 生計模擬,玩到後來只是數字變大。<b>要有結局,前面的每一天才算數。</b>
 *
 * 四種收場,對應四種活法 —— 而且沒有一種叫「通關」:
 * 這是一個關於小人物的遊戲,最好的下場也不過是「在這個縣裡站住了腳」。
 *
 * 敗亡那兩種也刻意不做成失敗畫面。餓死病死是漢末最尋常的死法,
 * 它該像其它結局一樣,給你一份生平。
 */

export type EndingKind = 'starved' | 'sick' | 'rooted' | 'summoned' | 'renowned';

export const ENDING_TITLE: Record<EndingKind, string> = {
  starved: '餓殍',
  sick: '病歿',
  rooted: '安身',
  summoned: '出谷',
  renowned: '名動一鄉',
};

export interface Life {
  kind: EndingKind;
  /** 活了幾天。 */
  days: number;
  merit: number;
  renown: number;
  gold: number;
  lodging: Lodging;
  /** 跟過你的人(名字)。 */
  companions: string[];
  /** 沒能跟你回來的人。 */
  lost: string[];
  /** 剿了幾夥。 */
  bandsCleared: number;
  /** 辦成幾件差事。 */
  errandsDone: number;
}

/**
 * 該收場了嗎。
 *
 * 判斷刻意<b>全部放在一處</b>:分散在各個系統裡的話,
 * 「怎樣算輸」這件事會慢慢長成五個互相不知道的版本。
 */
export function checkEnding(s: {
  starvingDays: number;
  sickDays: number;
  merit: number;
  renown: number;
  lodging: Lodging;
  gold: number;
  bandsCleared: number;
}): EndingKind | null {
  // 敗亡優先 —— 死了就沒有後面的事
  if (s.starvingDays >= 9) return 'starved';
  if (s.sickDays >= 14) return 'sick';

  // 出谷:有了官身,而且真的做過事 —— 光有品階不算,那只是數字
  if (rankForMerit(s.merit) <= RANK_RETAINER && s.bandsCleared >= 2) return 'summoned';

  // 名動一鄉:靠的是鄉里的名,不是官府的功
  if (s.renown >= 80) return 'renowned';

  // 安身:有屋、有餘錢、還活著。最尋常的一種好下場
  if (s.lodging === 'owned' && s.gold >= 400) return 'rooted';

  return null;
}

/** 生平的那一段話 —— 每一種收場的語氣都不一樣。 */
export function epitaph(life: Life): string {
  const y = partsFor(life.days);
  const span = life.days >= 360
    ? `在河谷過了${numberWord(y.year)}年`
    : life.days >= 30
      ? `在河谷待了${numberWord(Math.floor(life.days / 30))}個月`
      : `才到河谷${numberWord(Math.max(1, life.days))}天`;

  switch (life.kind) {
    case 'starved':
      return `${span}。最後那幾天粒米未進 —— 這一帶每年冬天都有人這樣去的,`
        + `沒有人會特別記住哪一個。`;
    case 'sick':
      return `${span}。病了半個多月,沒能起來。`
        + `${life.companions.length ? '跟過你的人替你收了屍。' : '沒有人替你收屍。'}`;
    case 'rooted':
      return `${span},終於有了一間自己的屋子。`
        + `這不是什麼了不起的事 —— 可是對一個白身來說,在一個縣裡站住腳,`
        + `已經是大多數人一輩子做不到的。`;
    case 'summoned':
      return `${span}。剿了幾夥賊之後,郡裡有人記住了你的名字。`
        + `離開河谷那天沒有人送 —— 他們只知道你要去做官了。`;
    case 'renowned':
      return `${span}。你沒有官身,可是這一鄉的人都認得你。`
        + `誰家出了事都想著先來尋你 —— 那是官府給不了的東西。`;
  }
}

interface EndingState {
  life: Life | null;
  /**
   * 推掉過的收場。
   *
   * 好的那幾種結局<b>不該由遊戲替你決定什麼時候夠了</b> ——
   * 屋子買下來的那一刻直接跳出生平,玩家會覺得東西被拿走了。
   * 所以好結局是「你可以就此收手」,推掉以後這一種就不再問第二次。
   * 敗亡那兩種沒得推。
   */
  declined: EndingKind[];
  end: (l: Life) => void;
  decline: (k: EndingKind) => void;
  clear: () => void;
  reset: () => void;
}

export const useEnding = create<EndingState>((set) => ({
  life: null,
  declined: [],
  end: (life) => set((s) => (s.declined.includes(life.kind) ? s : { life })),
  decline: (k) => set((s) => ({ life: null, declined: [...s.declined, k] })),
  clear: () => set({ life: null }),
  reset: () => set({ life: null, declined: [] }),
}));

/** 敗亡沒得推,好下場才有得選。 */
export function isFatal(k: EndingKind): boolean {
  return k === 'starved' || k === 'sick';
}

/* ── 眼下該做的事 ──────────────────────────────────── */

/**
 * 一句提示,而且<b>是從真實狀態讀出來的</b>。
 *
 * 這不是教學關卡。這個遊戲沒有「按 F 開啟商店」那種東西可教 ——
 * 新玩家真正卡住的地方是「我現在到底該幹嘛」。
 * 所以提示不講操作,講處境:糧快沒了、天要黑了還沒地方睡、
 * 手上的活辦妥了該回去覆命。
 *
 * 講處境的提示有一個好處:它永遠不會過期。玩到第一百天它還在,
 * 而且那時候它說的是別的事。
 */
export function whatNow(s: {
  grainDays: number;
  gold: number;
  grainPrice: number;
  hour: number;
  lodging: Lodging;
  hasQuest: boolean;
  questCleared: boolean;
  patronName?: string;
  followers: number;
  toil: number;
  wounded: number;
}): { text: string; urgent: boolean } | null {
  if (s.wounded > 0) return { text: '傷還沒好,先養著。', urgent: false };
  if (s.grainDays <= 1) {
    return { text: s.gold >= s.grainPrice
      ? '斷糧了。去市集糴米（F）。'
      : '斷糧了,身上也沒錢 —— 去碼頭或田裡做活（F）。', urgent: true };
  }
  if (s.questCleared) {
    return { text: `事情辦妥了,回去尋${s.patronName ?? '委託人'}覆命（E）。`, urgent: false };
  }
  const night = s.hour > 18.4 || s.hour < 5;
  if (night && s.lodging === 'none') {
    return { text: '天黑了。沒有落腳處就只能露宿,身上的錢可能不保。', urgent: true };
  }
  if (s.grainDays <= 5) {
    return { text: '糧不多了,趁早去糴一些。', urgent: false };
  }
  if (!s.hasQuest) {
    return { text: s.followers === 0
      ? '找村裡人搭話（E）—— 幫他們做點事,才有人肯跟你走。'
      : '去問問誰家有事要辦（E）。', urgent: false };
  }
  if (s.toil >= 9) return { text: '身子乏透了,回去歇一夜（F）。', urgent: false };
  return null;
}
