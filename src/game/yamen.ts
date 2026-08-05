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
