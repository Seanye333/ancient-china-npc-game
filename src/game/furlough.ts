import { create } from 'zustand';
import type { Season } from '../world/worldTime';

/**
 * 告假。
 *
 * 在這之前,跟著你的人只有兩種狀態:在,或者走了。而走的理由永遠是你的過失 ——
 * 沒糧、名聲爛、嫌你窩囊。他們沒有<b>自己的事</b>。
 *
 * 一個人會跟你走,不代表他家裡的老娘不病、地裡的麥子不熟。告假這件事把
 * 「他也有他的日子」擺到檯面上:他來求你,而你可以准,也可以不准。
 * 准了他去幾天再回來,人情往你這邊走一點;不准他也還在,可是心裡記著一筆 ——
 * 記得多了,某天就真的不回來了。
 *
 * 最要緊的是第三條路:<b>你可以不理他</b>。而不理是有價的 ——
 * 等了幾天沒等到一句話,他就自己走了,而且走得比被回絕更難看。
 */

export type Reason = 'illness' | 'harvest' | 'wedding' | 'funeral' | 'debt';

export const REASON_WORD: Record<Reason, string> = {
  illness: '家裡老的病了',
  harvest: '自家那幾畝到日子了',
  wedding: '族裡有喜事',
  funeral: '族裡走了人',
  debt: '欠人的錢到期了',
};

/** 開口求的那句話。求人是要低頭的,語氣得像。 */
export const REASON_ASK: Record<Reason, string> = {
  illness: '想跟你討幾天假 —— 家裡老的病了,我得回去看一眼。',
  harvest: '想跟你討幾天假 —— 自家那幾畝到日子了,再不割就爛在地裡。',
  wedding: '想跟你討幾天假 —— 族裡有喜事,不去說不過去。',
  funeral: '想跟你討幾天假 —— 族裡走了人,總得送一程。',
  debt: '想跟你討幾天假 —— 欠人的錢到期了,躲不過去。',
};

export interface Pending {
  id: string;
  reason: Reason;
  askedOn: number;
  days: number;
}

export interface Away {
  id: string;
  reason: Reason;
  backOn: number;
}

interface FurloughState {
  /** 開了口還沒等到答覆的那一個。<b>一次只有一個</b> —— 兩個人同時堵在門口不像話。 */
  pending: Pending | null;
  away: Away[];
  ask: (p: Pending) => void;
  clearAsk: () => void;
  send: (a: Away) => void;
  returned: (id: string) => void;
  reset: () => void;
}

export const useFurlough = create<FurloughState>((set) => ({
  pending: null,
  away: [],
  ask: (p) => set((s) => (s.pending ? s : { pending: p })),
  clearAsk: () => set({ pending: null }),
  send: (a) => set((s) => ({ away: [...s.away.filter((x) => x.id !== a.id), a] })),
  returned: (id) => set((s) => ({ away: s.away.filter((x) => x.id !== id) })),
  reset: () => set({ pending: null, away: [] }),
}));

/** 等幾天沒答覆就自己走。夠你走一趟縣城回來,不夠你當作沒這回事。 */
export const ASK_PATIENCE = 5;

/**
 * 今天有沒有人來求你。
 *
 * 秋天最多 —— 自家的地也在那時候熟。一次只准有一個人開口,
 * 而且<b>已經在外面的人不會再求</b>。
 */
export function furloughRoll(o: {
  followers: string[];
  away: string[];
  pending: boolean;
  season: Season;
  sickAtHome: boolean;
  roll: () => number;
}): { id: string; reason: Reason; days: number } | null {
  if (o.pending) return null;
  const here = o.followers.filter((id) => !o.away.includes(id));
  if (!here.length) return null;
  // 每人每天的機率。秋收翻倍 —— 那時候「回家割麥」是真的等不得
  const per = o.season === 'autumn' ? 0.024 : 0.011;
  if (o.roll() > 1 - Math.pow(1 - per, here.length)) return null;
  const id = here[Math.floor(o.roll() * here.length) % here.length];
  const reason: Reason = o.sickAtHome ? 'illness'
    : o.season === 'autumn' ? 'harvest'
      : (['wedding', 'funeral', 'debt'] as const)[Math.floor(o.roll() * 3) % 3];
  // 病和喪走得久,喜事和收麥快去快回
  const days = reason === 'illness' || reason === 'funeral'
    ? 9 + Math.floor(o.roll() * 7)
    : 5 + Math.floor(o.roll() * 5);
  return { id, reason, days };
}

/** 准了。人情往你這邊走 —— 而且這種事村裡是傳的。 */
export function grantEffect(): { favor: number; regard: number; renown: number } {
  return { favor: 3, regard: 2, renown: 1 };
}

/**
 * 不准。人還在,可是記了一筆。
 *
 * quitChance 不是「回絕就翻臉」——大多數人會忍下來繼續跟著你,
 * 那才是難受的地方:他還在,只是不再是原來那個他。
 */
export function refuseEffect(reason: Reason): {
  favor: number; regard: number; quitChance: number;
} {
  // 家裡有病人、有喪事的,回絕起來最傷
  const heavy = reason === 'illness' || reason === 'funeral';
  return { favor: heavy ? -7 : -4, regard: heavy ? -6 : -3, quitChance: heavy ? 0.30 : 0.15 };
}

/** 晾著不答。比回絕更難看 —— 回絕好歹是個交代。 */
export function ignoreEffect(): { favor: number; regard: number } {
  return { favor: -9, regard: -8 };
}
