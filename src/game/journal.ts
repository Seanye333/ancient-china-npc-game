import { create } from 'zustand';

/**
 * 日誌 —— 世界在你不看的時候做了什麼。
 *
 * 有了日子以後,很多事會在你走路的時候發生:糧吃完了、租到期了、
 * 有人受不了走了、賊窩又聚起人來。這些事如果只改數字不留一句話,
 * 玩家會覺得遊戲在偷偷扣他的東西 —— <b>世界可以對你不利,但不能瞞著你</b>。
 *
 * 刻意只留最近幾十條:這不是帳本,是「昨天發生了什麼」。
 */

export type Tone = 'plain' | 'good' | 'bad';

export interface Entry {
  /** 第幾天發生的。 */
  day: number;
  text: string;
  tone: Tone;
  /** 同一件事連著發生就疊起來,不要洗版。 */
  count: number;
}

const LIMIT = 40;

interface JournalState {
  entries: Entry[];
  /** 有沒有新的沒看過 —— 給 UI 點一個紅點。 */
  unread: number;
  note: (day: number, text: string, tone?: Tone) => void;
  markRead: () => void;
  clear: () => void;
}

export const useJournal = create<JournalState>((set) => ({
  entries: [],
  unread: 0,
  note: (day, text, tone = 'plain') => set((s) => {
    const head = s.entries[0];
    if (head && head.text === text && head.day === day) {
      const entries = s.entries.slice();
      entries[0] = { ...head, count: head.count + 1 };
      return { entries };
    }
    return {
      entries: [{ day, text, tone, count: 1 }, ...s.entries].slice(0, LIMIT),
      unread: s.unread + 1,
    };
  }),
  markRead: () => set({ unread: 0 }),
  clear: () => set({ entries: [], unread: 0 }),
}));

/** 隨處可呼叫的捷徑 —— 大部分寫日誌的地方不在 React 裡。 */
export function note(day: number, text: string, tone: Tone = 'plain') {
  useJournal.getState().note(day, text, tone);
}
