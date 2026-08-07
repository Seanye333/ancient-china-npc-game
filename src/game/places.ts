import { MARKET, DOCKS, fieldSites, houseSites, meanderAt } from '../world/sites';
import { terrainHeight, rng } from '../world/field';
import { COUNTY } from '../world/County';
import { herbSpots } from './herbs';
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

export type PlaceKind =
  | 'market' | 'work' | 'home' | 'tavern' | 'inn' | 'yamen' | 'refugees' | 'fair'
  | 'herb' | 'apothecary' | 'sickbed';

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

/**
 * 會出現又會消失的場所 —— 流民的窩、將來的集市攤。
 *
 * 靜態表(places)是開局就定死的;這張表歸各自的元件管,
 * 誰擺出來的誰收走。placeAt 兩張都查。
 */
const dynamic = new Map<string, Place>();
export function registerPlace(p: Place) { dynamic.set(p.id, p); }
export function unregisterPlace(id: string) { dynamic.delete(id); }

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
    // 酒肆 —— Interior.tsx 蓋在市集東南七步、往北九步的地方。
    // 座標抄一份是有風險的,但那棟房子的位置本來就是寫死的常數,
    // 真要動的時候兩處會一起動
    {
      id: 'tavern', kind: 'tavern', label: '酒肆', radius: 6,
      ...at(MARKET[0] + 7, MARKET[1] - 9 - 5),
    },
    /*
     * 縣城 —— 半天路程外的另一個地方。
     *
     * 有了它,「離開」這件事才說得出口:押貨有地方可押、行商有第二個價、
     * 官身有衙門可去。這三個場所是那三條線的接點。
     */
    {
      id: 'county-market', kind: 'market', label: '縣城市集', radius: 8,
      ...at(COUNTY.x, COUNTY.z + 2),
    },
    {
      id: 'county-inn', kind: 'inn', label: '客棧', radius: 6,
      ...at(COUNTY.x + 15, COUNTY.z - 4 + 6),
    },
    {
      id: 'county-yamen', kind: 'yamen', label: '縣衙', radius: 7,
      ...at(COUNTY.x, COUNTY.z - 26 + 12 + 9),
    },
    /*
     * 藥鋪只有縣城有。
     *
     * 村裡買不到藥,這一條是故意的 —— 不然「上山採藥」就永遠不會發生:
     * 家門口二十步能買到的東西,沒有人會走三里山路去摘。
     */
    {
      id: 'county-apothecary', kind: 'apothecary', label: '藥鋪', radius: 6,
      ...at(COUNTY.x - 17, COUNTY.z + 8),
    },
    {
      id: 'home', kind: 'home', label: '落腳處', radius: 5,
      ...at(home.door[0], home.door[1]),
    },
    // 山坡上的藥草 —— 位置是決定論的,所以「西邊那叢柴胡」記得住
    ...herbSpots().map((s): Place => ({
      id: s.id, kind: 'herb', label: s.wild ? '深山的藥草' : '坡上的藥草',
      radius: 4.5, x: s.x, z: s.z, y: s.y,
    })),
  ];
  return cache;
}

/**
 * 這個村民住哪一棟。
 *
 * 抄的是 Crowd.tsx 分房子的那條規矩(第 i 個人住第 i 棟)。
 * 抄一份是有風險的,但兩邊<b>必須</b>對上:病家的門口要是和他真正的家
 * 不是同一棟,你就會端著藥站在別人家門前。所以這裡是唯一的出口,
 * 將來要改就改這裡,Crowd 改成調用它。
 */
export function homeOf(npcId: string): { x: number; z: number; door: [number, number] } | null {
  const i = Number(npcId.replace(/^v/, ''));
  if (!Number.isFinite(i)) return null;
  const houses = houseSites();
  const h = houses[i % houses.length];
  return h ? { x: h.x, z: h.z, door: h.door } : null;
}

/** 站在哪個地方上 —— 沒有就回 null。 */
export function placeAt(x: number, z: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of [...places(), ...dynamic.values()]) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > p.radius || d >= bestD) continue;
    bestD = d; best = p;
  }
  return best;
}

export function placeById(id: string): Place | undefined {
  return places().find((p) => p.id === id) ?? dynamic.get(id);
}

/**
 * 走丟的人在哪。
 *
 * 從差事的 id 推導,所以<b>同一件差事的人永遠在同一個地方</b> ——
 * 玩家問了兩次得到同一個方位,那個方位才可信。
 * 位置挑在村外但走得到的地方:太近沒有找的感覺,太遠會變成折磨。
 */
export function lostSpot(errandId: string): { x: number; z: number; whoId: string } {
  let h = 2166136261;
  for (let i = 0; i < errandId.length; i++) {
    h ^= errandId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = rng(h >>> 0);
  const fields = fieldSites();
  // 從田裡挑一塊當「最後有人見到他的地方」—— 田本來就在村外,而且一定走得到
  const f = fields[Math.floor(rand() * fields.length) % fields.length];
  const ang = rand() * Math.PI * 2;
  const off = 10 + rand() * 14;
  return {
    x: f.x + Math.sin(ang) * off,
    z: f.z + Math.cos(ang) * off,
    whoId: `lost-${(h % 97).toString(36)}`,
  };
}
