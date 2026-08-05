import { describe, it, expect, beforeEach } from 'vitest';
import { errandFrom, reward, odds, ERRAND_LABEL } from './errands';
import { bearing, paces, wayWord, useQuest } from './quest';
import { makeVillagers } from './npcs';
import type { Band } from './bands';
import type { VillageState } from './village';

/**
 * 差事 → 賊窩 → 覆命 這條線的測試。
 *
 * 這裡守的是一件事:<b>委託人嘴裡說的和地圖上站著的必須是同一夥人</b>。
 * 這條線一旦鬆掉,「剿匪」就退回成一段文字加一次擲骰,而那正是這個
 * 系統存在的理由被推翻的樣子 —— 所以它值得幾個測試釘著。
 */

const village = (patch: Partial<VillageState> = {}): VillageState => ({
  order: 30, harvest: 60, trade: 50, grainPrice: 34,
  tick: () => {}, nudge: () => {},
  ...patch,
} as VillageState);

const band = (id: string, patch: Partial<Band> = {}): Band => ({
  id, name: id, x: 40, z: -20, fierce: 0.5, count: 4, routed: false, ...patch,
});

const everyErrand = (v: VillageState, bands: Band[], merit = 0) =>
  makeVillagers(38)
    .map((n) => errandFrom(n, v, 3, merit, bands))
    .filter((e): e is NonNullable<typeof e> => !!e);

describe('剿匪指的是地圖上真的那一夥', () => {
  it('每一件剿匪的活都掛著一個存在而且還沒被打散的賊窩', () => {
    const bands = [band('b0'), band('b1', { routed: true }), band('b2')];
    // 功績 200 = 已經有點身分,難度天花板才夠高看得見這幾夥
    const list = everyErrand(village(), bands, 200).filter((e) => e.kind === 'bandits');
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) {
      expect(e.bandId).toBeTruthy();
      const b = bands.find((x) => x.id === e.bandId);
      expect(b, `${e.bandId} 不在盤上`).toBeTruthy();
      expect(b!.routed, '不該派你去剿一夥已經散了的').toBe(false);
    }
  });

  it('剿光了就沒有剿匪的活 —— 由世界說了算,不是由治安那個數字說了算', () => {
    // 治安 12 是最該派剿匪的時候,但盤上一夥活的都沒有
    const dead = [band('b0', { routed: true }), band('b1', { routed: true })];
    const list = everyErrand(village({ order: 12 }), dead).filter((e) => e.kind === 'bandits');
    expect(list).toHaveLength(0);
  });

  it('沒有賊窩資料時退回其它種類的活,而不是憑空生一個剿匪', () => {
    const list = everyErrand(village({ order: 12 }), []);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((e) => e.kind === 'bandits')).toBe(false);
  });

  it('難度與人手是從那夥人身上算的 —— 一大夥就該標得比三兩個毛賊難', () => {
    // 兩邊都用同一個身分,才量得到「賊窩大小」本身的效果
    const small = everyErrand(village(), [band('s', { count: 2, fierce: 0.25 })], 200)
      .filter((e) => e.kind === 'bandits');
    const big = everyErrand(village(), [band('s', { count: 7, fierce: 0.85 })], 200)
      .filter((e) => e.kind === 'bandits');
    expect(small.length).toBeGreaterThan(0);
    expect(big.length).toBeGreaterThan(0);
    expect(Math.max(...big.map((e) => e.tier)))
      .toBeGreaterThan(Math.min(...small.map((e) => e.tier)));
    expect(Math.max(...big.map((e) => e.wantMen)))
      .toBeGreaterThan(Math.max(...small.map((e) => e.wantMen)));
  });

  /**
   * 這一條是寫測試時才發現的:先隨機挑一夥、再讓身分門檻去擋,
   * 結果是白身<b>連小的那夥都接不到</b> —— 挑中大的那次整件活就消失了。
   * 玩家看見的會是一個沒人有事託他的村子,而不是一個看不起他的村子。
   */
  it('白身會被指去小的那一夥,而不是什麼活都沒有', () => {
    const bands = [band('big', { count: 7, fierce: 0.9 }), band('small', { count: 2, fierce: 0.3 })];
    const list = everyErrand(village(), bands, 0).filter((e) => e.kind === 'bandits');
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.bandId === 'small')).toBe(true);
  });

  it('同一個人同一旬給的活恆定 —— 反覆搭話刷不出更好的差事', () => {
    const bands = [band('b0'), band('b1'), band('b2')];
    const npc = makeVillagers(38)[7];
    const v = village();
    const a = errandFrom(npc, v, 5, 0, bands);
    const b = errandFrom(npc, v, 5, 0, bands);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('覆命的酬勞', () => {
  it('不擲骰 —— 同一件活覆命兩次拿到的一模一樣', () => {
    const e = { id: 'x', kind: 'bandits' as const, patronId: 'n1', tier: 3, wantMen: 4, pay: 90 };
    expect(reward(e, 0)).toEqual(reward(e, 0));
  });

  it('白身辦同一件事更算數 —— 爬上去以後同樣的活不再是功勞', () => {
    const e = { id: 'x', kind: 'bandits' as const, patronId: 'n1', tier: 3, wantMen: 4, pay: 90 };
    expect(reward(e, 0).merit).toBeGreaterThan(reward(e, 300).merit);
  });

  it('剿匪覆命會讓治安好轉,別的活不會', () => {
    const b = { id: 'x', kind: 'bandits' as const, patronId: 'n', tier: 2, wantMen: 3, pay: 40 };
    const g = { id: 'y', kind: 'guard' as const, patronId: 'n', tier: 2, wantMen: 0, pay: 40 };
    expect(reward(b, 0).order).toBeGreaterThan(0);
    expect(reward(g, 0).order).toBe(0);
  });
});

describe('路引 —— 沒有小地圖,只有問路問來的方位', () => {
  it('北是 -z、東是 +x', () => {
    expect(bearing(0, -10)).toBe('北');
    expect(bearing(10, 0)).toBe('東');
    expect(bearing(0, 10)).toBe('南');
    expect(bearing(-10, 0)).toBe('西');
    expect(bearing(10, 10)).toBe('東南');
    expect(bearing(-10, -10)).toBe('西北');
  });

  it('近了給實數,遠了取整到五步 —— 人問路不會答「七十三步」', () => {
    expect(paces(0, -7)).toBe(7);
    expect(paces(0, -73)).toBe(75);
    expect(wayWord(0, 0, 0, -73)).toBe('北 · 約 75 步');
  });
});

describe('手上一次只有一件活', () => {
  beforeEach(() => useQuest.setState({ taken: null }));

  const taken = (bandId: string) => ({
    errand: { id: 'e', kind: 'bandits' as const, patronId: 'n1', tier: 2, wantMen: 3, pay: 40, bandId },
    patronName: '王安', bandId, cleared: false,
  });

  it('接了以後才有得覆命,覆完就空了', () => {
    const q = useQuest.getState();
    expect(q.taken).toBeNull();
    q.accept(taken('b0'));
    expect(useQuest.getState().taken?.cleared).toBe(false);
    useQuest.getState().markCleared();
    expect(useQuest.getState().taken?.cleared).toBe(true);
    useQuest.getState().drop();
    expect(useQuest.getState().taken).toBeNull();
  });

  it('再接一件會蓋掉前一件 —— 白身只有一雙手,不做待辦清單', () => {
    useQuest.getState().accept(taken('b0'));
    useQuest.getState().accept(taken('b1'));
    expect(useQuest.getState().taken?.bandId).toBe('b1');
  });
});

describe('攤開的資訊還是誠實的', () => {
  it('人手不足會把抽象差事的勝算壓下去', () => {
    const e = { id: 'x', kind: 'escort' as const, patronId: 'n', tier: 2, wantMen: 4, pay: 40 };
    const stats = { war: 58, leadership: 52, intelligence: 46, politics: 40, charisma: 55 };
    expect(odds(e, stats, 0)).toBeLessThan(odds(e, stats, 4));
  });

  it('每一種活都有名字可以顯示', () => {
    for (const k of ['bandits', 'escort', 'guard', 'search', 'harvest'] as const) {
      expect(ERRAND_LABEL[k]).toBeTruthy();
    }
  });
});
