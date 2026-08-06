/**
 * 縣衙。
 *
 * 白身要爬上去,靠的從來不是功績自己長到門檻 —— 那是遊戲裡的數字。
 * 真實的那條路是<b>有人替你說話</b>:你在鄉里的名聲傳到縣裡,
 * 門吏肯替你把那封書遞進去。
 *
 * 所以投書要花錢(打點門吏),而成不成看的是鄉望與談吐,不是你砍過幾個賊。
 * 這也是「兩套名聲」第一次真的分岔:功績讓你接得到更難的活,
 * 鄉望讓你進得了那道門。
 */

export const PETITION_COST = 12;

export interface PetitionResult {
  ok: boolean;
  merit: number;
  line: string;
}

export function petition(input: {
  gold: number; merit: number; renown: number; politics: number; roll: () => number;
}): PetitionResult {
  if (input.gold < PETITION_COST) {
    return { ok: false, merit: 0, line: '門吏斜了你一眼:「這點意思都沒有?」' };
  }
  if (input.renown < 10) {
    return {
      ok: false, merit: 0,
      line: '「你是哪一位?」—— 他把書推了回來。鄉里沒人提過你的名字。',
    };
  }

  // 名聲是門檻,談吐是成數
  const chance = Math.min(0.85, 0.2 + input.renown / 160 + (input.politics - 30) / 200);
  if (input.roll() > chance) {
    return {
      ok: true, merit: 0,
      line: '書收下了,沒有下文。門吏說：「等著罷。」',
    };
  }
  const gain = Math.max(2, Math.round(3 + input.renown / 12));
  return {
    ok: true,
    merit: gain,
    line: `主簿把你的名字記在簿上。「鄉里都說你辦事牢靠。」 · 功績 +${gain}`,
  };
}

/* ── 懸賞 ──────────────────────────────────────────── */

import type { Band } from './bands';

/**
 * 縣衙貼榜。
 *
 * 賊坐大到縣裡壓不住(那一夥的份量過了檻、而且治安爛),官府才肯出錢 ——
 * 懸賞不是常設商店,是<b>官府沒辦法了的證據</b>。
 * 賞錢比村民的委託高得多,但這錢難掙:榜上那一夥一定是最大的。
 *
 * 這也是官府線和武那條線的交匯點:領賞給的功績,和投書不一樣,
 * 是實打實「替官府辦了事」的功。
 */
export function bountyTarget(bands: Band[], order: number): Band | null {
  if (order >= 35) return null;
  const big = bands
    .filter((b) => !b.routed && b.count * (0.6 + b.fierce) >= 7.5)
    .sort((a, b) => b.count * (0.6 + b.fierce) - a.count * (0.6 + a.fierce));
  return big[0] ?? null;
}

export function bountyPay(b: Band): number {
  return Math.round(40 + b.count * (0.6 + b.fierce) * 12);
}

export function bountyMerit(b: Band): number {
  return Math.round(6 + b.count * (0.6 + b.fierce) * 1.4);
}
