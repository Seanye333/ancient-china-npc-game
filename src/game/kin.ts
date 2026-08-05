import { makeVillagers, type Npc } from './npcs';
import { rng } from '../world/field';

/**
 * 親眷。
 *
 * 三十八個人原本互不相干:每一個都是孤零零站在自己那條作息線上的個體。
 * 可是一個縣裡真正的結構不是三十八個人,是<b>十來戶人家</b> ——
 * 你得罪一個人,他哥記你一輩子;你救了一個人,他娘見了你就要塞東西。
 *
 * 這一層一接上,後面所有的人情、流言、生死都有了傳導的路:
 * 好處和壞處不再停在當事人身上,會沿著血緣走。
 *
 * 關係從種子推導,和村民本身一樣是純函式 —— 同一顆種子每次載入都是同一批親戚,
 * 玩家記得住「那是王安他弟」才有意義。
 */

export interface Kin {
  spouse: string | null;
  parents: string[];
  children: string[];
  siblings: string[];
}

const EMPTY: Kin = { spouse: null, parents: [], children: [], siblings: [] };

let cache: Map<string, Kin> | null = null;
let houses: string[][] | null = null;

function build() {
  const people = makeVillagers(38);
  const rand = rng(77771);
  const kin = new Map<string, Kin>();
  for (const p of people) kin.set(p.id, { spouse: null, parents: [], children: [], siblings: [] });

  const taken = new Set<string>();
  const adults = people.filter((p) => p.age >= 18).sort((a, b) => a.age - b.age);

  /* 配對 —— 年紀相近的才成親,差太多不像話 */
  for (const a of adults) {
    if (taken.has(a.id)) continue;
    if (rand() < 0.28) continue;                     // 有些人就是沒成家
    const mate = adults.find((b) => !taken.has(b.id) && b.id !== a.id
      && Math.abs(b.age - a.age) <= 9);
    if (!mate) continue;
    taken.add(a.id); taken.add(mate.id);
    kin.get(a.id)!.spouse = mate.id;
    kin.get(mate.id)!.spouse = a.id;
  }

  /* 孩子 —— 掛到年紀夠當爹娘的那些人身上 */
  const kids = people.filter((p) => p.age < 18);
  const couples = [...taken].filter((id) => {
    const k = kin.get(id)!;
    return k.spouse && id < k.spouse;                // 一對只算一次
  });
  for (const kid of kids) {
    const fit = couples.filter((id) => {
      const dad = people.find((p) => p.id === id)!;
      return dad.age - kid.age >= 17;
    });
    if (!fit.length) continue;
    const dadId = fit[Math.floor(rand() * fit.length) % fit.length];
    const momId = kin.get(dadId)!.spouse!;
    kin.get(kid.id)!.parents = [dadId, momId];
    kin.get(dadId)!.children.push(kid.id);
    kin.get(momId)!.children.push(kid.id);
  }

  /* 同父母的就是兄弟姊妹 */
  for (const p of people) {
    const k = kin.get(p.id)!;
    if (!k.parents.length) continue;
    k.siblings = kin.get(k.parents[0])!.children.filter((c) => c !== p.id);
  }

  /* 沒成家的成年人裡,挑一些湊成兄弟 —— 一個村不該人人都是獨門獨戶 */
  const singles = adults.filter((a) => !kin.get(a.id)!.spouse && !kin.get(a.id)!.parents.length);
  for (let i = 0; i + 1 < singles.length; i += 2) {
    if (rand() < 0.45) continue;
    const a = singles[i], b = singles[i + 1];
    kin.get(a.id)!.siblings.push(b.id);
    kin.get(b.id)!.siblings.push(a.id);
  }

  cache = kin;

  /*
   * 戶 —— 夫妻加未成年的孩子算一戶,其餘各自一戶。
   *
   * <b>要從年長的排起</b>。照生成順序走的話,某個孩子會排在他爹前面,
   * 於是他先自己成一戶,他爹後來又把他算進自己那一戶 —— 同一個人出現在兩戶裡。
   * 一個人只能屬於一戶,這是後面所有「拜訪某戶」「一家人一起反應」的前提。
   */
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const p of [...people].sort((a, b) => b.age - a.age)) {
    if (seen.has(p.id)) continue;
    const k = kin.get(p.id)!;
    const home = [p.id];
    if (k.spouse && !seen.has(k.spouse)) home.push(k.spouse);
    for (const c of k.children) if (!seen.has(c)) home.push(c);
    for (const id of home) seen.add(id);
    out.push(home);
  }
  houses = out;
}

export function kinOf(id: string): Kin {
  if (!cache) build();
  return cache!.get(id) ?? EMPTY;
}

/** 一戶人家 —— 同住的人。 */
export function householdOf(id: string): string[] {
  if (!houses) build();
  return houses!.find((h) => h.includes(id)) ?? [id];
}

/** 和你有血緣或姻親關係的所有人。流言與生死沿著這條路走。 */
export function relatives(id: string): string[] {
  const k = kinOf(id);
  return [...new Set([
    ...(k.spouse ? [k.spouse] : []), ...k.parents, ...k.children, ...k.siblings,
  ])];
}

/** 「王安的兄長」—— 給對話用的一句話。 */
export function relationWord(who: string, toWhom: string): string | null {
  const k = kinOf(who);
  const people = makeVillagers(38);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? '某人';
  const me = people.find((p) => p.id === who);
  const other = people.find((p) => p.id === toWhom);
  if (!me || !other) return null;
  if (k.spouse === toWhom) return `${name(toWhom)}的家眷`;
  if (k.parents.includes(toWhom)) return `${name(toWhom)}的孩子`;
  if (k.children.includes(toWhom)) return `${name(toWhom)}的爹娘`;
  if (k.siblings.includes(toWhom)) return me.age > other.age ? `${name(toWhom)}的兄姊` : `${name(toWhom)}的弟妹`;
  return null;
}

/** 這個人在村裡的一句身家 —— 對話面板上顯示。 */
export function kinWord(id: string): string {
  const k = kinOf(id);
  const people = makeVillagers(38);
  const name = (i: string) => people.find((p) => p.id === i)?.name ?? '某人';
  const bits: string[] = [];
  if (k.spouse) bits.push(`${name(k.spouse)}之配`);
  if (k.children.length) bits.push(`育有 ${k.children.length} 子`);
  else if (k.parents.length) bits.push(`${name(k.parents[0])}之子`);
  if (!bits.length && k.siblings.length) bits.push(`${name(k.siblings[0])}之手足`);
  return bits.join(' · ') || '孑然一身';
}

/** 全村按戶分組 —— 除錯與將來的「拜訪某戶」都用得到。 */
export function households(): string[][] {
  if (!houses) build();
  return houses!;
}

export function allVillagers(): Npc[] {
  return makeVillagers(38);
}
