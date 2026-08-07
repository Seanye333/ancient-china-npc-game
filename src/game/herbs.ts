import { create } from 'zustand';
import { terrainHeight, slopeAt, valleyMask, riverMask, rng } from '../world/field';
import { MARKET } from '../world/sites';
import { DAYS_PER_XUN } from './calendar';
// 型別用 import type —— 值進來的話,純邏輯就把三維那半邊的模組拖進 headless 測試
import type { Season } from '../world/worldTime';

/**
 * 採藥 —— 藥長在最不方便的地方。
 *
 * 這個系統補的是兩個一直沒有答案的洞:
 *
 * 一、<b>你的傷只是一個倒數計時</b>。躺著等一旬,除此之外無事可做 ——
 *     傷有了形狀(腿瘸臂軟)以後,這件事更難受:你看得見自己走得慢,
 *     卻沒有任何辦法讓它快一點。
 * 二、<b>村裡的人病倒了,你什麼都做不了</b>。日誌上寫「某某病倒了」,
 *     過幾天再寫「某某沒能熬過去」,而你從頭到尾只是個讀報的人。
 *     一個以「你就住在這個村子裡」為前提的遊戲,不該是這樣。
 *
 * 三條規矩:
 *
 * 一、<b>藥長在山坡上</b>,不長在市集裡。要藥就得走出谷地 ——
 *     而山坡正是賊走的路。「最需要藥的時候最不方便去拿」是這個系統的形狀:
 *     腿上帶著傷,你跑不過任何人。
 * 二、<b>藥讓傷好一倍快,不是立刻好</b>。一旬敷一次(傷本來也是一旬好一分),
 *     所以藥買到的是時間,不是免疫。
 * 三、<b>一趟採的藥不夠兩個人用</b>。自己敷要兩株,送給病家要三株,
 *     一趟採三五株 —— 於是每次上山回來都是同一個問題:
 *     這副藥是給自己的腿,還是給河邊那個老船工的。
 */

/* ── 藥長在哪 ────────────────────────────────────────── */

export interface HerbSpot {
  id: string;
  x: number;
  z: number;
  y: number;
  /** 遠處的藥好 —— 也遠。走得越出去,一趟採得越多。 */
  wild: boolean;
}

let spotCache: HerbSpot[] | null = null;

/**
 * 藥草的生處。
 *
 * 條件是「谷地的邊上」:valleyMask 太高就是人耕的田,太低就是禿山頂。
 * 再加一條硬規矩 —— <b>離村心四十步以外</b>。採藥要是站在市集旁邊就能做,
 * 它就只是另一個按鈕;要走出去才算數。
 */
export function herbSpots(): HerbSpot[] {
  if (spotCache) return spotCache;
  const rand = rng(90210);
  const out: HerbSpot[] = [];
  let guard = 0;
  while (out.length < 12 && guard < 9000) {
    guard++;
    const z = (rand() - 0.5) * 340;
    const side = rand() < 0.5 ? -1 : 1;
    const x = (Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5) + side * (52 + rand() * 74);
    const v = valleyMask(x, z);
    if (v > 0.34 || v < 0.02) continue;          // 田裡沒有,禿頂也沒有
    if (riverMask(x, z) > 0.2) continue;
    const s = slopeAt(x, z);
    if (s < 0.10 || s > 0.52) continue;          // 要斜坡,但不能是崖
    const h = terrainHeight(x, z);
    if (h < 2.5 || h > 28) continue;
    const far = Math.hypot(x - MARKET[0], z - MARKET[1]);
    if (far < 40) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 24)) continue;
    out.push({ id: `herb${out.length}`, x, z, y: terrainHeight(x, z), wild: far > 108 });
  }
  spotCache = out;
  return out;
}

/* ── 採過的要等它長回來 ──────────────────────────────── */

/** 採過以後幾天才長得回來。比一旬長一點 —— 同一叢不能天天薅。 */
export const REGROW = 12;

interface HerbState {
  /** spotId → 上次採空的日子。 */
  picked: Record<string, number>;
  pick: (id: string, day: number) => void;
  reset: (p?: Record<string, number>) => void;
}

export const useHerbs = create<HerbState>((set) => ({
  picked: {},
  pick: (id, day) => set((s) => ({ picked: { ...s.picked, [id]: day } })),
  reset: (p) => set({ picked: p ?? {} }),
}));

export function spotReady(id: string, day: number): boolean {
  const at = useHerbs.getState().picked[id];
  return at === undefined || day - at >= REGROW;
}

/* ── 一趟採得到多少 ─────────────────────────────────── */

/** 每一季山上有什麼 —— 冬天那一句是實話:沒有。 */
export function herbWord(season: Season): string {
  switch (season) {
    case 'spring': return '柴胡剛出苗,葉子還嫩';
    case 'summer': return '金銀花開得正好';
    case 'autumn': return '桔梗的根這時候最壯';
    case 'winter': return '雪底下什麼都沒有';
  }
}

const SEASON_MUL: Record<Season, number> = {
  spring: 1.15, summer: 1, autumn: 0.85, winter: 0.15,
};

/**
 * 採一趟得幾株。
 *
 * 見識管用 —— <b>認得藥的人才採得到藥</b>,不認得的人滿山都是草。
 * 這是 intelligence 這一欄第一次在山野上有用處(從前它只影響投書自薦)。
 */
export function pickYield(o: {
  season: Season; intelligence: number; wild: boolean; roll: () => number;
}): number {
  const know = 0.7 + o.intelligence / 100;
  const n = (2 + o.roll() * 2.2) * SEASON_MUL[o.season] * know * (o.wild ? 1.5 : 1);
  return Math.max(0, Math.floor(n));
}

/* ── 藥怎麼用 ────────────────────────────────────────── */

/** 自己敷一次要幾株。 */
export const DOSE_SELF = 2;
/** 送給病家一副要幾株 —— 比自己敷貴,一條命本來就比一身傷值錢。 */
export const DOSE_SICK = 3;
/** 一旬敷一次。傷本來也是一旬好一分 —— 所以藥剛好讓它<b>快一倍</b>。 */
export const DRESS_COOL = DAYS_PER_XUN;

/**
 * 現在能不能敷藥。不能的話要說得出為什麼 ——
 * 一個按不動的鈕沒有理由,玩家就會以為是壞了。
 */
export function canDress(
  s: { wounded: number; herbs: number; dressedOn: number | null }, day: number,
): { ok: boolean; why: string } {
  if (s.wounded <= 0) return { ok: false, why: '身上沒傷。' };
  if (s.herbs < DOSE_SELF) return { ok: false, why: `藥不夠 —— 敷一次要 ${DOSE_SELF} 株。` };
  if (s.dressedOn !== null && day - s.dressedOn < DRESS_COOL) {
    return { ok: false, why: `藥剛敷過,${DRESS_COOL - (day - s.dressedOn)} 天後再換一次。` };
  }
  return { ok: true, why: '' };
}

/* ── 送藥給病家 ─────────────────────────────────────── */

/** 沒藥的時候,病著的人每天自己好轉的機會。這個數字本來寫死在日結裡。 */
export const RECOVER_PLAIN = 0.22;
/** 收過你的藥以後。 */
export const RECOVER_DOSED = 0.55;

export function recoverChance(dosed: boolean): number {
  return dosed ? RECOVER_DOSED : RECOVER_PLAIN;
}

/**
 * 收過藥的人今天死掉的機率要乘上這個。
 *
 * 沒有歸零 —— <b>藥不是免死金牌</b>。你送了藥,老人還是可能走;
 * 那一句「你那副藥,終究晚了」才是這個系統真正要換到的東西。
 */
export function deathMul(dosed: boolean): number {
  return dosed ? 0.3 : 1;
}

/** 藥灌下去,當晚就見效的機會 —— 給玩家一個當場的回音。 */
export function dosedTurn(intelligence: number, roll: () => number): boolean {
  return roll() < 0.32 + intelligence / 320;
}

/* ── 藥鋪 ────────────────────────────────────────────── */

/** 藥鋪賣你一株多少錢。疫年翻倍還不止 —— 要藥的人多了。 */
export function herbPrice(plague: boolean): number {
  return plague ? 22 : 10;
}

/** 藥鋪收你一株多少錢。買賣差價一直在,不然就是印錢機。 */
export function herbSale(plague: boolean): number {
  return plague ? 12 : 4;
}

/**
 * 請郎中。
 *
 * 貴得離譜,而且必須貴 —— 它是「有錢就不必上山」的那個出口,
 * 早期你出不起,後期你不在乎。白身的難處本來就是<b>只能拿時間換</b>。
 */
export const PHYSICIAN_FEE = 80;
