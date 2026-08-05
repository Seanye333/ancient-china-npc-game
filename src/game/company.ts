import type { Npc } from './npcs';
import { deltaOf } from './folk';
import { kinOf } from './kin';

/**
 * 跟著你的人怎麼想。
 *
 * 在這之前,招進來的人就是一個會打架的數字:他不會抱怨、不會走,
 * 除非餓到極限。可是一個人肯不肯跟著你,從來不是只看有沒有飯吃 ——
 * 他看你有沒有名聲、看你有沒有讓他家裡的人受過罪、看你帶他去打的那幾場
 * 是打贏了還是把他丟在後面。
 *
 * 所以這裡把「他現在怎麼看你」算成一個數,而且<b>要走之前一定先抱怨</b>。
 * 沒有預兆的離開會讓玩家覺得系統在耍他;抱怨過一次再走,
 * 那就是他自己的決定。
 */

export interface Mood {
  /** −100..100。 */
  score: number;
  /** 一句話。 */
  word: string;
  /** 已經在想走了。 */
  restless: boolean;
}

export function moodOf(input: {
  npc: Npc;
  favor: number;
  renown: number;
  /** 最近幾天有沒有餓著。 */
  hungryDays: number;
  /** 他家裡有沒有人剛歿。 */
  grieving: boolean;
}): Mood {
  const d = deltaOf(input.npc.id);
  // 名聲的權重刻意壓得比人情重:在一個村子裡,「跟著誰」這件事別人天天看在眼裡。
  // 私交再好,也擋不住一個名聲狼藉的主人 —— 他還要在這個村裡過日子
  const base = input.favor * 3 + d.regard * 2 + input.renown * 0.9;
  const hunger = input.hungryDays * -9;
  const grief = input.grieving ? -14 : 0;
  // 直脾氣的忍得住,精明的先算帳
  const temper = input.npc.temper === 'gruff' ? 8
    : input.npc.temper === 'warm' ? 4
      : input.npc.temper === 'shrewd' ? -4 : -6;

  const score = Math.max(-100, Math.min(100, base + hunger + grief + temper));
  return {
    score,
    restless: score < -18,
    word: score >= 45 ? '死心塌地'
      : score >= 18 ? '跟得踏實'
        : score >= -6 ? '沒說什麼'
          : score >= -18 ? '有些話沒說出口'
            : '看樣子是想走了',
  };
}

/** 他想說的那句話 —— 抱怨要具體,不能只是「心情不好」。 */
export function grumble(input: {
  npc: Npc; hungryDays: number; grieving: boolean; renown: number;
}): string {
  if (input.hungryDays >= 2) return '「跟著你,連口飯都吃不上。」';
  if (input.grieving) return '「家裡出了事⋯⋯我這心思不在這兒。」';
  if (input.renown <= -10) return '「外頭都在說你的事。我還要在這個村裡過日子。」';
  return input.npc.temper === 'gruff'
    ? '「⋯⋯沒事。走罷。」'
    : '「沒什麼。就是有點累了。」';
}

/**
 * 家裡剛出過事嗎 —— 三十天以內有親人歿了就算。
 * 這一條是 kin.ts 真正兌現的地方:死的不是他,可是他跟不動了。
 */
export function isGrieving(npcId: string, today: number): boolean {
  for (const id of [...kinOf(npcId).parents, ...kinOf(npcId).children,
    ...kinOf(npcId).siblings, ...(kinOf(npcId).spouse ? [kinOf(npcId).spouse!] : [])]) {
    const d = deltaOf(id);
    if (d.dead && d.diedOn !== undefined && today - d.diedOn <= 30) return true;
  }
  return false;
}

/* ── 同鄉 ──────────────────────────────────────────── */

const HOMES = ['河谷', '河谷', '河谷', '河谷', '潁川', '南陽', '雁門', '汝南', '巴郡'];

/**
 * 這個村民是哪裡人。
 *
 * <b>從 id 雜湊推導,不動 makeVillagers 的亂數序列</b> ——
 * 在那個函式裡多抽一次 rand(),整村的名字和年紀都會跟著換一批人。
 * 純函式的世界最怕的就是這種「加一個欄位,結果換了一村人」。
 */
export function homeOf(npcId: string): string {
  let h = 2166136261;
  for (let i = 0; i < npcId.length; i++) {
    h ^= npcId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return HOMES[(h >>> 0) % HOMES.length];
}

/**
 * 同鄉是這個世界最強的一條人脈。
 *
 * 在一個人離開出生地就等於失去一切的時代,碰上一個同鄉不是巧合,
 * 是<b>一根可以抓的繩子</b>。所以它給的不是一點好感,是直接抵掉一截人情。
 */
export function sameHome(heroHome: string, npcId: string): boolean {
  const h = homeOf(npcId);
  return h === heroHome && h !== '河谷' ? true : h === heroHome;
}

export function homeBonus(heroHome: string, npcId: string): number {
  if (!sameHome(heroHome, npcId)) return 0;
  // 外鄉的同鄉最親 —— 大家都在本地的話,「同鄉」就不算什麼
  return homeOf(npcId) === '河谷' ? 1 : 4;
}
