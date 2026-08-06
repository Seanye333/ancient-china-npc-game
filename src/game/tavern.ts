import type { Band } from './bands';
import type { VillageState } from './village';
import type { Npc } from './npcs';
import { rankForMerit, RANK_COMMONER, RANK_RETAINER } from './hero';
import { bandWord } from './bands';
import { wayWord } from './quest';

/**
 * 酒肆 —— 這個村子唯一能打聽事情的地方。
 *
 * 它存在的理由不是「多一個場所」,是<b>讓情報變成商品</b>。
 * 在這之前,你想知道哪一夥賊最大、誰家有活,只能一個一個走過去問;
 * 現在花幾個錢就有人告訴你 —— 而那句話必須是<b>真的</b>,
 * 從世界的實際狀態讀出來,不是隨機生成的風味文字。
 *
 * 假情報比沒有情報更糟:玩家會學會不聽。
 */

export const DRINK_PRICE = 2;
export const NEWS_PRICE = 5;

/** 一碗酒能解多少乏。喝多了不會更好 —— 這不是回血藥。 */
export const DRINK_TOIL = 3;

/**
 * 打聽來的一句話。
 *
 * 全部從真實狀態讀:哪一夥最兇、誰下了山、村子缺什麼。
 * 玩家可以拿這句話直接去做事,那才叫情報。
 */
export function newsFrom(input: {
  bands: Band[];
  raids: Array<{ name: string; x: number; z: number }>;
  village: VillageState;
  at: { x: number; z: number };
  sickNames: string[];
  /** 亂兵:'coming' 的時候這句話值錢 —— 你還有兩天。 */
  marauders?: { phase: 'coming' | 'present' | null; daysLeft: number };
}): string {
  const { bands, raids, village, at } = input;

  // 過兵的風聲壓過一切 —— 這五個錢買的就是那兩天
  if (input.marauders?.phase === 'coming') {
    return `「北邊潰下來的兵,已經過了山口 —— 頂多${input.marauders.daysLeft}天就到。`
      + `帶得走的帶走,帶不走的埋起來。」`;
  }
  if (input.marauders?.phase === 'present') {
    return '「還問?兵就在村裡!能別出門就別出門。」';
  }

  // 有人在路上就先說這個 —— 這是最要緊、也最來得及去做的事
  if (raids.length) {
    const r = raids[0];
    return `「${r.name}的人下山了,這會兒在${wayWord(at.x, at.z, r.x, r.z)}。」`;
  }
  if (input.sickNames.length) {
    return `「${input.sickNames[0]}病了些日子了,家裡揭不開鍋。」`;
  }
  if (village.order < 30) {
    const worst = [...bands].filter((b) => !b.routed)
      .sort((a, b) => b.count * (0.6 + b.fierce) - a.count * (0.6 + a.fierce))[0];
    return worst
      ? `「數${worst.name}那夥最橫 —— ${bandWord(worst)},在${wayWord(at.x, at.z, worst.x, worst.z)}。」`
      : '「這一帶的賊,倒是清乾淨了。」';
  }
  if (village.trade < 30) return '「下游的路斷了,鹽都運不進來。」';
  if (village.grainPrice > 48) return '「米價這樣下去,開春要出事。」';
  const live = bands.filter((b) => !b.routed).length;
  return live
    ? `「山裡還有${live}處窩點。太平日子是暫時的。」`
    : '「近來太平。太平久了,人就忘了怎麼提刀。」';
}

/* ── 雇人 ──────────────────────────────────────────── */

/**
 * 雇一個鄉勇要多少錢。
 *
 * 這是<b>錢 → 人 → 糧</b>那條循環的接點:錢買得到人手,
 * 人手要吃飯,吃飯又要錢。所以「雇幾個」不是越多越好,
 * 而是一個你要自己算的帳。
 *
 * 亂世人賤,治安越差越便宜 —— 活不下去的人才肯拿命換一口飯。
 */
export function hirePrice(village: VillageState, already: number): number {
  const hard = 1.3 - village.order / 160;          // 治安差 = 人便宜
  const scarce = 1 + already * 0.09;               // 帶得越多,肯來的越少
  return Math.max(6, Math.round(22 * hard * scarce));
}

/**
 * 雇得到人嗎。
 *
 * 白身雇不到 —— 沒有身分的人喊不動任何人替他賣命,
 * 那正是「品階」第一個真正有用的地方:在此之前它只是一個上限數字。
 */
export function canHire(merit: number): { ok: boolean; why: string } {
  const rank = rankForMerit(merit);
  if (rank >= RANK_COMMONER) {
    return { ok: false, why: '「你一個白身,拿什麼養人?先掙個名分罷。」' };
  }
  if (rank >= RANK_RETAINER) return { ok: true, why: '' };
  return { ok: true, why: '' };
}

/** 酒肆裡坐著的人會說什麼 —— 按村況給一句閒話。 */
export function tavernMood(village: VillageState, npcs: Npc[]): string {
  if (village.order < 25) return '幾個人低聲說著誰家又被搶了,聲音一低再低。';
  if (village.grainPrice > 48) return '有人拍著桌子罵米價,沒人接話。';
  if (village.harvest > 70) return '今年收成好,裡頭鬧哄哄的。';
  return npcs.length > 20 ? '爐子上溫著酒,幾個熟面孔靠著牆閒話。' : '店裡沒幾個人,火不旺。';
}
