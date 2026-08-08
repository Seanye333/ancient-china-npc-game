import { describe, it, expect, beforeEach } from 'vitest';
import { saveGame, loadGame, wipeSave, hasSave } from './save';
import { useHero } from './hero';
import { useOath } from './oath';
import { useFurlough } from './furlough';
import { useHerbs } from './herbs';
import { useVillage } from './village';
import { useClock } from '../world/worldTime';

/**
 * 存檔。
 *
 * 這個檔案在加測試之前<b>一行都沒跑過</b>(是覆蓋率指出來的,不是我想到的)。
 * 而它是整個專案裡壞掉最貴的一處:壞了就是玩家一局的進度沒了,
 * 而且多半要到下次開遊戲才發現。
 *
 * 每加一個會存的欄位,就在這裡加一條 —— 「存了沒讀回來」在畫面上是
 * 「我明明有五個人」,不是一個錯誤訊息。
 */

/** node 環境沒有 localStorage,補一個夠用的。 */
class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();

beforeEach(() => {
  wipeSave();
  useOath.getState().reset();
  useFurlough.getState().reset();
  useHerbs.getState().reset({});
});

describe('存了要讀得回來', () => {
  it('沒存過的時候,hasSave 是 false 而 loadGame 不炸', () => {
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBe(false);
  });

  it('身家:錢、糧、傷、疤、歲數、手上的藥', () => {
    useHero.setState({
      gold: 137, grain: 4.25, wounded: 2, woundKind: 'face', scars: 1,
      age: 31, herbs: 5, dressedOn: 12, merit: 40, renown: 9,
    });
    useClock.setState({ day: 73 });
    saveGame();
    expect(hasSave()).toBe(true);

    // 讀之前先弄髒 —— 不弄髒的話「讀回來」和「本來就沒變」分不出來
    useHero.setState({
      gold: 0, grain: 0, wounded: 0, woundKind: null, scars: 0,
      age: 24, herbs: 0, dressedOn: null, merit: 0, renown: 0,
    });
    expect(loadGame()).toBe(true);

    const h = useHero.getState();
    expect(h.gold).toBe(137);
    expect(h.grain).toBeCloseTo(4.25, 5);
    expect(h.wounded).toBe(2);
    expect(h.woundKind).toBe('face');
    expect(h.scars).toBe(1);
    expect(h.age).toBe(31);
    expect(h.herbs).toBe(5);
    expect(h.dressedOn).toBe(12);
    expect(useClock.getState().day).toBe(73);
  });

  it('義兄弟:結了誰、哪天結的、誰沒回來', () => {
    useOath.getState().swear('v3', 21);
    useOath.getState().swear('v7', 30);
    useOath.getState().mourn('v7');
    saveGame();
    useOath.getState().reset();
    loadGame();
    const o = useOath.getState();
    expect(o.sworn).toEqual(['v3']);
    expect(o.fallen).toEqual(['v7']);
    expect(o.swornOn.v3).toBe(21);
    // 死了的那個,結義那天也要留著 —— 生平那一頁要寫
    expect(o.swornOn.v7).toBe(30);
  });

  it('告假在外的人 —— 不存的話讀檔那一刻他們人間蒸發', () => {
    useFurlough.getState().send({ id: 'v5', reason: 'illness', backOn: 44 });
    useFurlough.getState().ask({ id: 'v9', reason: 'debt', askedOn: 40, days: 6 });
    saveGame();
    useFurlough.getState().reset();
    loadGame();
    const f = useFurlough.getState();
    expect(f.away).toHaveLength(1);
    expect(f.away[0]).toMatchObject({ id: 'v5', reason: 'illness', backOn: 44 });
    expect(f.pending).toMatchObject({ id: 'v9', reason: 'debt', days: 6 });
  });

  it('採空的藥叢:哪一叢、哪天採的', () => {
    useHerbs.getState().pick('herb-3', 18);
    saveGame();
    useHerbs.getState().reset({});
    loadGame();
    expect(useHerbs.getState().picked['herb-3']).toBe(18);
  });

  it('村況存的是決定,不是推導出來的東西', () => {
    useVillage.setState({ order: 33, harvest: 51, trade: 44 });
    saveGame();
    useVillage.setState({ order: 99, harvest: 99, trade: 99 });
    loadGame();
    const v = useVillage.getState();
    expect(v.order).toBe(33);
    expect(v.harvest).toBe(51);
    expect(v.trade).toBe(44);
  });
});

describe('版本對不上就當沒有存檔', () => {
  it('舊版本的檔要被當成沒有 —— 缺欄位混進帳裡是 NaN 的溫床', () => {
    useHero.setState({ gold: 500 });
    saveGame();
    // 手改版本號,模擬「上一版存的檔」
    const raw = JSON.parse(localStorage.getItem('baishen.save.v1')!);
    raw.v = raw.v - 1;
    localStorage.setItem('baishen.save.v1', JSON.stringify(raw));

    expect(hasSave(), '舊檔不該報告成「有存檔」').toBe(false);
    useHero.setState({ gold: 7 });
    expect(loadGame()).toBe(false);
    expect(useHero.getState().gold, '沒讀進來就不該動到現在的局').toBe(7);
  });

  it('壞掉的 JSON 不會把遊戲炸掉', () => {
    localStorage.setItem('baishen.save.v1', '{這不是 JSON');
    expect(() => hasSave()).not.toThrow();
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBe(false);
  });
});
