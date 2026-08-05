import { create } from 'zustand';
import { makeVillagers, type Npc } from './npcs';
import { relatives } from './kin';

/**
 * 村民身上會變的那些事 —— 老、病、死,以及他們怎麼看你。
 *
 * `makeVillagers` 是純函式,同一顆種子永遠生出同一批人;這很好,
 * 因為玩家要記得住「河邊那個怕事的老船工」。但一個活的村子裡人會變:
 * 會老一歲、會病、會死、會因為你做過的事改變對你的看法。
 *
 * 所以把<b>會變的部分抽出來單獨存</b>,而不是讓村民本身變成可變狀態:
 * 純函式管「這個人是誰」,這裡管「後來他怎麼了」。讀檔只要存這一小份。
 */

export interface FolkDelta {
  /** 多活了幾年 —— 顯示年紀時加上去。 */
  aged: number;
  /** 病了幾天,0 = 沒病。病著的人不出門。 */
  sick: number;
  /** 死了。死了的人不再出現在村裡,但名字還在(別人會提起他)。 */
  dead: boolean;
  /** 死在第幾天 —— 給「新喪」判斷用。 */
  diedOn?: number;
  /** 對你的觀感偏移,疊在 npc.regard 上。 */
  regard: number;
}

const zero = (): FolkDelta => ({ aged: 0, sick: 0, dead: false, regard: 0 });

interface FolkState {
  deltas: Record<string, FolkDelta>;
  patch: (id: string, p: Partial<FolkDelta>) => void;
  bumpRegard: (id: string, n: number) => void;
  reset: () => void;
}

export const useFolk = create<FolkState>((set) => ({
  deltas: {},
  patch: (id, p) => set((s) => ({
    deltas: { ...s.deltas, [id]: { ...(s.deltas[id] ?? zero()), ...p } },
  })),
  bumpRegard: (id, n) => set((s) => {
    const d = s.deltas[id] ?? zero();
    return { deltas: { ...s.deltas, [id]: { ...d, regard: d.regard + n } } };
  }),
  reset: () => set({ deltas: {} }),
}));

export function deltaOf(id: string): FolkDelta {
  return useFolk.getState().deltas[id] ?? zero();
}

/** 這個人現在的樣子 —— 純函式的底 + 後來發生的事。 */
export function folk(id: string): (Npc & FolkDelta) | null {
  const base = makeVillagers(38).find((p) => p.id === id);
  if (!base) return null;
  const d = deltaOf(id);
  return { ...base, ...d, age: base.age + d.aged, regard: base.regard + d.regard };
}

/** 還在世、而且今天出得了門的人。 */
export function livingVillagers(): Npc[] {
  const deltas = useFolk.getState().deltas;
  return makeVillagers(38)
    .filter((p) => !deltas[p.id]?.dead)
    .map((p) => {
      const d = deltas[p.id];
      return d ? { ...p, age: p.age + d.aged, regard: p.regard + d.regard } : p;
    });
}

export function isDead(id: string): boolean {
  return !!useFolk.getState().deltas[id]?.dead;
}

export function isSick(id: string): boolean {
  const d = useFolk.getState().deltas[id];
  return !!d && !d.dead && d.sick > 0;
}

/* ── 生老病死 ──────────────────────────────────────── */

/**
 * 今天病倒的機率。
 *
 * 老人與小孩最先倒,冬天與荒年更凶 —— 這不是為了折磨玩家,
 * 是為了讓「治安好、收成好」這兩個數字<b>連到人身上</b>:
 * 一個過得去的村子死人少,一個崩掉的村子會空。
 */
export function sickChance(age: number, harvest: number, winter: boolean): number {
  // 這是<b>每天</b>的機率,所以數字要很小。第一版寫成 (age-50)/90,
  // 七十歲的人每天有一成六的機會病倒 —— 一個月內全村的老人會死光。
  // 現在照著「一個七十歲的人一年病個兩回」回推。
  const frail = age >= 58 ? (age - 50) / 3200 : age <= 8 ? 0.0008 : 0.00025;
  const hunger = harvest < 30 ? (30 - harvest) / 3000 : 0;
  return Math.min(0.05, frail * (winter ? 1.7 : 1) + hunger);
}

/** 病著的人今天過不過得去。年紀越大越難熬。 */
export function deathChance(age: number, daysSick: number): number {
  const frail = age >= 58 ? (age - 50) / 800 : age <= 6 ? 0.006 : 0.0015;
  return Math.min(0.35, frail * (1 + daysSick / 8));
}

/* ── 兩套名聲 ──────────────────────────────────────── */

/**
 * 鄉里口碑和官府功績是<b>兩回事</b>。
 *
 * merit 是官府記在簿子上的功;renown 是鄉里嘴上傳的名。
 * 剿一夥賊,官府記你功;扶一個老人、賑一次饑,官府一個字都不會寫,
 * 可是全村都知道。這個遊戲的主角是白身 —— 對他來說,
 * <b>後者往往比前者管用</b>:招人看的是名,不是功。
 */
export function renownWord(renown: number): string {
  if (renown >= 70) return '名動一鄉';
  if (renown >= 40) return '頗有人望';
  if (renown >= 18) return '鄉里知名';
  if (renown >= 6) return '有人記得';
  if (renown <= -18) return '名聲狼藉';
  if (renown <= -6) return '風評不佳';
  return '無人知曉';
}

/* ── 流言 ──────────────────────────────────────────── */

export interface Rumor {
  /** 說的是你做的哪件事。 */
  text: string;
  /** 聽了以後對你的觀感變多少。 */
  delta: number;
  /** 還會傳幾天。 */
  life: number;
  /** 從誰身上起的頭 —— 他的親眷聽了反應更大。 */
  aboutId?: string;
}

export const rumors: Rumor[] = [];

/**
 * 放一句話出去。
 *
 * 你做的事不會只停在當事人身上:村子就這麼大,今天你幫了誰、
 * 或是丟下誰跑了,過幾天全村都會知道 —— 只是傳到每個人耳朵裡的
 * 時間和分量不一樣。
 */
export function spreadRumor(r: Rumor) {
  rumors.push({ ...r });
  if (rumors.length > 12) rumors.shift();
}

/**
 * 流言傳一天。
 *
 * 每天挑幾個人聽見。當事人的親眷聽了反應加倍 —— 這是 kin.ts 存在的理由:
 * 好處和壞處要沿著血緣走,不能停在當事人身上。
 */
export function stepRumors(roll: () => number): number {
  let heard = 0;
  const folkStore = useFolk.getState();
  const people = livingVillagers();
  for (const r of rumors) {
    if (r.life <= 0) continue;
    r.life--;
    const kinIds = r.aboutId ? relatives(r.aboutId) : [];
    const listeners = Math.max(1, Math.round(people.length * 0.18));
    for (let i = 0; i < listeners; i++) {
      const who = people[Math.floor(roll() * people.length) % people.length];
      if (!who) continue;
      const near = kinIds.includes(who.id) || who.id === r.aboutId;
      folkStore.bumpRegard(who.id, r.delta * (near ? 2 : 1) * 0.5);
      heard++;
    }
  }
  // 傳完的話丟掉
  for (let i = rumors.length - 1; i >= 0; i--) if (rumors[i].life <= 0) rumors.splice(i, 1);
  return heard;
}
