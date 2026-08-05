import { MARKET, DOCKS, fieldSites, houseSites, meanderAt } from '../world/sites';
import { terrainHeight } from '../world/field';
import type { JobKind } from './economy';

/**
 * 地方 —— 可以走過去做事的地點。
 *
 * 在這之前,世界上唯一能互動的東西是「人」:走近一個村民按 E 搭話,
 * 其餘的房子、市集、碼頭都只是佈景。可是白身的一天大半不是在跟人說話,
 * 是在<b>某個地方做某件事</b>:去市集糴米、去碼頭扛包、回柴房睡覺。
 *
 * 所以地方要和人平起平坐地進互動系統:同一顆 E 鍵,誰近就是誰。
 * 這張表也是後面所有「場所」的掛鉤 —— 酒肆、賭坊、縣衙都照這個樣子加。
 */

export type PlaceKind = 'market' | 'work' | 'home' | 'tavern';

export interface Place {
  id: string;
  kind: PlaceKind;
  label: string;
  /** 靠多近算到了。比搭話遠一些 —— 一片市集不是一個點。 */
  radius: number;
  x: number;
  z: number;
  y: number;
  /** work 專用:這裡能做哪一種活。 */
  job?: JobKind;
}

function at(x: number, z: number) {
  return { x, z, y: terrainHeight(x, z) };
}

let cache: Place[] | null = null;

export function places(): Place[] {
  if (cache) return cache;
  const fields = fieldSites();
  const houses = houseSites();
  // 挑一戶離市集近的,新來的人總是先在村口賃屋
  const home = houses
    .map((h) => ({ h, d: Math.hypot(h.x - MARKET[0], h.z - MARKET[1]) }))
    .sort((a, b) => a.d - b.d)[2]?.h ?? houses[0];
  // 挑一塊離村心近的田當「幫工的那片地」—— 不能讓玩家跑到三百步外才找得到活
  const field = fields
    .map((f) => ({ f, d: Math.hypot(f.x - MARKET[0], f.z - MARKET[1]) }))
    .sort((a, b) => a.d - b.d)[6]?.f ?? fields[0];

  cache = [
    {
      id: 'market', kind: 'market', label: '市集', radius: 6.5,
      ...at(MARKET[0], MARKET[1]),
    },
    {
      id: 'dock', kind: 'work', label: '碼頭', radius: 5.5, job: 'dock',
      ...at(DOCKS[0][0], DOCKS[0][1]),
    },
    {
      id: 'field', kind: 'work', label: '田頭', radius: 6, job: 'field',
      ...at(field.x, field.z),
    },
    {
      id: 'woods', kind: 'work', label: '林子邊', radius: 6.5, job: 'wood',
      ...at(meanderAt(-26) + 40, -26),
    },
    // 落腳處放在<b>某一戶人家的門口</b>,而不是憑座標點一個地方。
    // 第一版隨手挑了市集旁邊十六步的一個點,結果那裡是別人家的牆裡:
    // 玩家一路走過去,走到門邊就再也過不去了。門前那一步是現成的,
    // 房子生成的時候就算好了(NPC 進出也走那裡),用它才不會撞牆
    {
      id: 'home', kind: 'home', label: '落腳處', radius: 5,
      ...at(home.door[0], home.door[1]),
    },
  ];
  return cache;
}

/** 站在哪個地方上 —— 沒有就回 null。 */
export function placeAt(x: number, z: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of places()) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > p.radius || d >= bestD) continue;
    bestD = d; best = p;
  }
  return best;
}

export function placeById(id: string): Place | undefined {
  return places().find((p) => p.id === id);
}
