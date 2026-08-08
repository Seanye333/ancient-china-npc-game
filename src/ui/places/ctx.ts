import type { CSSProperties } from 'react';
import type { VillageState } from '../../game/village';
import type { useHero } from '../../game/hero';
import type { useQuest } from '../../game/quest';
import type { placeById } from '../../game/places';
import type { Season } from '../../world/worldTime';

/**
 * 一個場所面板要用到的那一整包東西。
 *
 * 為什麼<b>整包傳</b>而不是各自去呼叫 hook:因為這幾塊是從同一個元件裡拆出來的,
 * 整包傳才能讓區塊裡的每一行原封不動 —— 各自解構自己要的名字,
 * 底下的 JSX 一個字都不必改。拆檔最怕的就是「順手」改壞什麼。
 *
 * 另一個好處是它把「一個場所看得到世界的哪些部分」寫成了一份清單:
 * 想加第十二個場所,照著這個介面看一眼就知道手上有什麼。
 */
export interface PlaceCtx {
  hero: ReturnType<typeof useHero.getState>;
  village: VillageState;
  /** 縣城與村裡是同一塊面板兩個價 —— 這一份是「此地的」行情。 */
  market: VillageState;
  day: number;
  hour: number;
  season: Season;
  advance: (hours: number) => void;
  note: (day: number, text: string, tone?: 'good' | 'bad' | 'plain') => void;
  quest: ReturnType<typeof useQuest.getState>;
  line: string | null;
  setLine: (s: string | null) => void;
  qty: number;
  setQty: (n: number) => void;
  place: NonNullable<ReturnType<typeof placeById>>;
  /** 手上的糧夠吃幾天。 */
  days: number;
  /** 幾張嘴 —— 你自己 + 隨行 + 部曲。 */
  heads: number;
  inCounty: boolean;
  close: () => void;
  /** 只關面板、不清那句話 —— 賽會要在面板收掉之後把比武演完。 */
  closePlace: () => void;
}

export const btn: CSSProperties = {
  padding: '.45rem .9rem', background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
  border: '1px solid rgba(255,255,255,.2)', cursor: 'pointer',
  fontSize: '.86rem', fontFamily: 'inherit', textAlign: 'left',
};
export const dim: CSSProperties = { ...btn, opacity: .42, cursor: 'not-allowed' };
