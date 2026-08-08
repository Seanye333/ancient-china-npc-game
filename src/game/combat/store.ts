/**
 * 戰鬥<b>低頻</b>的那一點狀態 —— 誰在打、打完了沒、是不是切磋。
 *
 * 只有這幾樣進 zustand:它們一場架只變兩三次,而 UI(HUD、收場面板)要跟著重繪。
 * 位置、姿態、士氣那些每幀在動的東西一律走模組級陣列(見 types.ts)。
 */

import { create } from 'zustand';
import type { BattleTally } from './types';
import { fighters, arrows } from './types';

interface BattleState {
  /** 正在打的那夥人的 id,null = 沒在打。 */
  bandId: string | null;
  /**
   * 切磋 —— 點到為止的打。
   *
   * 和真打共用整個戰鬥系統(走位、揮刀、士氣、姿態全部一樣),
   * 只在<b>收場</b>那一刻分岔:沒有戰利品、沒有折損、輸了不掉錢不受傷。
   * 對面認輸(逃)或倒地都算分出勝負 —— 倒地在切磋裡是「被放倒」,不是死。
   */
  sparring: boolean;
  /** 切磋的對手(npcId)—— 收場要記人情。 */
  sparWith: string | null;
  /** 這一場是夜襲 —— HUD 要說一句,收場的文案也不一樣。 */
  nightRaid: boolean;
  tally: BattleTally | null;
  open: (bandId: string) => void;
  finish: (t: BattleTally) => void;
  clear: () => void;
}

export const useBattle = create<BattleState>((set) => ({
  bandId: null,
  sparring: false,
  sparWith: null,
  nightRaid: false,
  tally: null,
  open: (bandId) => set({ bandId, tally: null, sparring: false, sparWith: null, nightRaid: false }),
  finish: (tally) => set({ tally }),
  clear: () => {
    fighters.length = 0;
    arrows.length = 0;
    set({ bandId: null, tally: null, sparring: false, sparWith: null, nightRaid: false });
  },
}));
