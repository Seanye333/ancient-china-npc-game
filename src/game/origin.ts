import type { Stats } from './hero';
import type { Lodging } from './economy';

/**
 * 出身。
 *
 * 這個遊戲在此之前沒有開局:你直接就站在河谷裡,沒有名字、沒有來歷、
 * 五項數值人人一樣。可是「白身」這個主題最要緊的一句話是
 * <b>你從哪裡跌下來的</b> —— 一個破落士族的兒子和一個逃兵在同一條路上走,
 * 遇到的是同一批人,難處卻完全不同。
 *
 * 所以出身不給你「職業技能」,只給你三樣東西:
 * 一副底子、一點家當、以及<b>村裡人一開始怎麼看你</b>。
 * 後面兩樣往往比第一樣重要 —— 這是一個靠人過日子的遊戲。
 */

export interface Origin {
  id: string;
  name: string;
  /** 一句話說清楚你是誰。 */
  blurb: string;
  stats: Stats;
  gold: number;
  grain: number;
  /** 開局的鄉里口碑。有人一進村就欠著一身債。 */
  renown: number;
  lodging: Lodging;
  /** 開局就認得你的人有幾分香火情 —— 同鄉、舊識。 */
  favorSeed: number;
  hometown: string;
}

export const ORIGINS: Origin[] = [
  {
    id: 'farm',
    name: '佃農之子',
    blurb: '爹娘去得早,田讓債主收了。你會下田,認得每一種能吃的野菜。',
    stats: { war: 52, leadership: 44, intelligence: 38, politics: 32, charisma: 46 },
    gold: 12, grain: 4, renown: 4, lodging: 'shed', favorSeed: 2, hometown: '河谷',
  },
  {
    id: 'clan',
    name: '破落士族',
    blurb: '祖上做過郡吏,家道中落。識字,懂規矩,可是一雙手沒拿過鋤頭。',
    stats: { war: 40, leadership: 52, intelligence: 62, politics: 58, charisma: 54 },
    gold: 90, grain: 1, renown: 10, lodging: 'rented', favorSeed: 1, hometown: '潁川',
  },
  {
    id: 'trader',
    name: '行商之後',
    blurb: '跟著父親跑過幾趟商路。會算帳,會說話,錢比別人多一點。',
    stats: { war: 46, leadership: 48, intelligence: 54, politics: 44, charisma: 62 },
    gold: 140, grain: 2, renown: 2, lodging: 'none', favorSeed: 3, hometown: '南陽',
  },
  {
    id: 'deserter',
    name: '逃卒',
    blurb: '從邊軍逃回來的。手上有本事,身上有案底 —— 村裡人先信的是後面那句。',
    stats: { war: 68, leadership: 56, intelligence: 42, politics: 30, charisma: 38 },
    gold: 24, grain: 2, renown: -12, lodging: 'none', favorSeed: 0, hometown: '雁門',
  },
  {
    id: 'wanderer',
    name: '游俠兒',
    blurb: '沒有家,靠一口氣和幾個朋友活著。打得,也肯替人出頭。',
    stats: { war: 60, leadership: 50, intelligence: 40, politics: 28, charisma: 58 },
    gold: 30, grain: 2, renown: 8, lodging: 'none', favorSeed: 4, hometown: '不詳',
  },
];

export function originById(id: string): Origin {
  return ORIGINS.find((o) => o.id === id) ?? ORIGINS[0];
}

/** 開局隨機一個名字 —— 玩家可以改,但不該逼他先想一個。 */
const SURNAMES = ['王', '李', '張', '陳', '趙', '周', '孫', '劉', '楊', '黃'];
const GIVEN = ['安', '平', '直', '順', '通', '達', '守', '同', '德', '義', '和', '章'];

export function randomName(roll: () => number): string {
  return SURNAMES[Math.floor(roll() * SURNAMES.length) % SURNAMES.length]
    + GIVEN[Math.floor(roll() * GIVEN.length) % GIVEN.length];
}
