import type { Npc } from './npcs';
import { rankForMerit, RANK_COMMONER, RANK_RETAINER } from './hero';

/**
 * 招人 — 從村裡帶走一個人。
 *
 * 這是整條成長線最關鍵的一步,也最容易做砸:來得太早不值錢,太晚玩家已經走了。
 * 三個規矩讓它<b>是你做過的事的結果,不是一個解鎖</b>:
 *
 * 一、<b>要先有人情</b>。素不相識的人不會跟你走。人情從辦事和搭把手來,
 *     所以「你替他做過什麼」才是門票。
 * 二、<b>脾氣說了算</b>。怕事的人再欠你也不肯提刀;直脾氣的講義氣,
 *     一點人情就跟你走。這讓村民不是一批可刷的資源,而是一群不同的人。
 * 3、<b>你養不養得起</b>。白身上限十個人,收滿了就是收滿了 ——
 *     想帶更多人,先去掙個出身。
 */

export interface Persuasion {
  /** 肯不肯。 */
  ok: boolean;
  /** 他的回話。 */
  line: string;
  /** 還差多少人情(ok 時為 0)。 */
  needMore: number;
}

/** 脾氣決定的門檻 — 這個數字就是「他是怎樣一個人」。 */
export function joinThreshold(npc: Npc): number {
  switch (npc.temper) {
    case 'gruff': return 4;      // 直脾氣,講義氣
    case 'warm': return 6;
    case 'shrewd': return 9;     // 精明,要算過才跟
    case 'timid': return 14;     // 怕事,得欠你很多
  }
}

/**
 * 開口邀他同行。純函式 —— 同一份狀態問幾次都是同一個答案,
 * 不能靠反覆點擊碰運氣。
 */
export function askToJoin(input: {
  npc: Npc;
  favor: number;
  merit: number;
  charisma: number;
  headcount: number;
  cap: number;
  alreadyWith: boolean;
}): Persuasion {
  const { npc, favor } = input;
  if (input.alreadyWith) {
    return { ok: false, line: '我不是已經跟著你了麼。', needMore: 0 };
  }
  if (input.headcount >= input.cap) {
    const rank = rankForMerit(input.merit);
    return {
      ok: false,
      needMore: 0,
      line: rank >= RANK_COMMONER
        ? '你自己都還吃不飽,養得起我?先掙個出身罷。'
        : '你這人手已經滿了,再多帶不動。',
    };
  }

  // 人望能抵一點人情,但抵不了太多 —— 嘴甜不能代替做過的事
  const charmOff = Math.max(0, (input.charisma - 50) / 12);
  const need = Math.max(2, joinThreshold(npc) - charmOff);
  if (favor < need) {
    const short = Math.ceil(need - favor);
    return {
      ok: false,
      needMore: short,
      line: npc.temper === 'timid'
        ? '我上有老下有小,這種事⋯⋯還是算了。'
        : npc.temper === 'shrewd'
          ? '無緣無故的,我憑什麼跟你走?'
          : '你我不過幾面之緣,再說罷。',
    };
  }

  return {
    ok: true,
    needMore: 0,
    line: npc.temper === 'gruff'
      ? '早想跟著你了。走!'
      : npc.temper === 'warm'
        ? '承蒙看得起。這條命，往後就交給你了。'
        : npc.temper === 'shrewd'
          ? '看你不像沒出息的。我押你一把。'
          : '⋯⋯罷了。跟你走一趟。',
  };
}

/** 部曲能帶多少人 — 給 UI 提示用,和 hero.retinueCap 同源。 */
export function capHint(merit: number): string {
  const rank = rankForMerit(merit);
  if (rank >= RANK_COMMONER) return '白身只養得起十來個賓客';
  if (rank >= RANK_RETAINER) return '部曲之身,五十人為限';
  return '有了官身,帶得動百人';
}
