import { describe, it, expect, beforeEach } from 'vitest';
import { partsFor, seasonOf, dateWord, numberWord, firstDayOf, DAYS_PER_YEAR } from './calendar';
import { grainCost, grainSale, jobsToday, mouths, DAYS_PER_SHI, restQuality } from './economy';
import { settleDay, grainDays } from './daily';
import { useHero } from './hero';
import { useVillage } from './village';
import { useJournal } from './journal';
import type { VillageState } from './village';

/**
 * 日子與生計。
 *
 * 這一組守的是一件事:<b>時間會拿走東西</b>。在它之前,日子只是天色在變,
 * 你可以站在原地一年什麼都不會發生 —— 而那正是舊碼的實情:
 * 「今天第幾天」算出來永遠是 0,村況開場推一次以後再沒推過。
 */

const village = (patch: Partial<VillageState> = {}): VillageState => ({
  order: 50, harvest: 60, trade: 50, grainPrice: 34,
  tick: () => {}, nudge: () => {},
  ...patch,
} as VillageState);

describe('曆法', () => {
  it('十日一旬、三旬一月、四季一年', () => {
    expect(partsFor(0)).toMatchObject({ year: 1, month: 1, dayOfMonth: 1, xun: 0 });
    expect(partsFor(9).xun).toBe(0);
    expect(partsFor(10).xun).toBe(1);
    expect(partsFor(29).xun).toBe(2);
    expect(partsFor(30)).toMatchObject({ month: 2, dayOfMonth: 1, xun: 0 });
    expect(partsFor(DAYS_PER_YEAR)).toMatchObject({ year: 2, month: 1 });
  });

  it('旬序號跟著日子走 —— 差事靠它換,錯了就是「一季換不了一次活」', () => {
    expect(partsFor(0).xunIndex).toBe(0);
    expect(partsFor(9).xunIndex).toBe(0);
    expect(partsFor(10).xunIndex).toBe(1);
    expect(partsFor(95).xunIndex).toBe(9);
  });

  it('季節從日子推導,不另存 —— 兩個來源遲早會對不上', () => {
    expect(seasonOf(0)).toBe('spring');
    expect(seasonOf(89)).toBe('spring');
    expect(seasonOf(90)).toBe('summer');
    expect(seasonOf(180)).toBe('autumn');
    expect(seasonOf(270)).toBe('winter');
    expect(seasonOf(360)).toBe('spring');
    // 跳季要跳到那一季的頭一天,而不是偷偷改一個和日子對不上的欄位
    expect(seasonOf(firstDayOf('winter', 5))).toBe('winter');
  });

  it('日期寫成人話', () => {
    expect(dateWord(0)).toContain('元年');
    expect(dateWord(0)).toContain('上旬');
    expect(numberWord(12)).toBe('十二');
    expect(numberWord(20)).toBe('二十');
    expect(numberWord(35)).toBe('三十五');
  });
});

describe('糧按人頭吃', () => {
  it('帶的人越多,同樣一堆糧撐得越短', () => {
    expect(mouths(0, 0)).toBe(1);
    expect(mouths(2, 3)).toBe(6);
    expect(grainDays(3, 0, 0)).toBe(90);
    expect(grainDays(3, 2, 0)).toBe(30);
    expect(grainDays(3, 2, 3)).toBe(15);
  });

  it('躉買比零買便宜,賣出去要折價 —— 攢一筆一次買足才是划算的決定', () => {
    const v = village();
    expect(grainCost(v, 10)).toBeLessThan(grainCost(v, 1) * 10);
    expect(grainSale(v, 5)).toBeLessThan(grainCost(v, 5));
  });

  it('米價貴的時候買糧真的更痛', () => {
    expect(grainCost(village({ grainPrice: 70 }), 5))
      .toBeGreaterThan(grainCost(village({ grainPrice: 30 }), 5));
  });
});

describe('短工看天吃飯', () => {
  it('冬天田裡沒活、商路斷了碼頭空著', () => {
    const winter = jobsToday(village(), 'winter', 9);
    expect(winter.find((j) => j.kind === 'field')?.closed).toBeTruthy();
    const noTrade = jobsToday(village({ trade: 10 }), 'summer', 9);
    expect(noTrade.find((j) => j.kind === 'dock')?.closed).toBeTruthy();
  });

  it('農忙時田裡的工錢更高 —— 什麼時候去做工本身是要讀懂的事', () => {
    const rush = jobsToday(village(), 'autumn', 9).find((j) => j.kind === 'field')!;
    const idle = jobsToday(village(), 'summer', 9).find((j) => j.kind === 'field')!;
    expect(rush.pay).toBeGreaterThan(idle.pay);
  });

  it('天黑了就沒活可接', () => {
    for (const j of jobsToday(village(), 'spring', 19)) {
      if (j.kind !== 'market') expect(j.closed).toBeTruthy();
    }
  });
});

describe('過一天要結的帳', () => {
  beforeEach(() => {
    useHero.setState({
      grain: 3, gold: 100, followers: [], retinue: 0,
      lodging: 'none', rentPaidThrough: 0, wounded: 0, toil: 0, favors: {},
    });
    useVillage.setState({ order: 50, harvest: 60, trade: 50, grainPrice: 34 });
    useJournal.getState().clear();
  });

  it('一天吃掉一個人一天的份', () => {
    const before = useHero.getState().grain;
    settleDay(1, 'spring');
    expect(useHero.getState().grain).toBeCloseTo(before - 1 / DAYS_PER_SHI, 4);
  });

  it('帶著人就吃得快 —— 招募的代價從這裡才算真的成立', () => {
    useHero.setState({ grain: 3, followers: ['v1', 'v2'], retinue: 3 });
    settleDay(1, 'spring');
    expect(useHero.getState().grain).toBeCloseTo(3 - 6 / DAYS_PER_SHI, 4);
  });

  it('斷糧會有人走,而且日誌上要說出來 —— 世界可以對你不利,不能瞞著你', () => {
    useHero.setState({ grain: 0, followers: ['v1', 'v2', 'v3', 'v4', 'v5'], retinue: 0 });
    let anyLeft = false;
    for (let d = 1; d <= 12 && !anyLeft; d++) {
      const r = settleDay(d, 'winter');
      expect(r.starved).toBe(true);
      anyLeft = r.left.length > 0;
    }
    expect(anyLeft).toBe(true);
    expect(useJournal.getState().entries.some((e) => e.text.includes('斷糧'))).toBe(true);
  });

  it('租到期會自己扣;交不出就被請出去', () => {
    useHero.setState({ lodging: 'rented', rentPaidThrough: 5, gold: 100 });
    settleDay(5, 'spring');
    expect(useHero.getState().gold).toBeLessThan(100);
    expect(useHero.getState().rentPaidThrough).toBe(15);

    useHero.setState({ lodging: 'rented', rentPaidThrough: 20, gold: 3 });
    const r = settleDay(20, 'spring');
    expect(r.evicted).toBe(true);
    expect(useHero.getState().lodging).toBe('none');
  });

  it('村子自己往前走 —— 這一段從前一次都沒跑過', () => {
    const before = useVillage.getState().order;
    for (let d = 1; d <= 6; d++) settleDay(d, 'autumn');
    // 秋天盜匪最凶,治安該往下走
    expect(useVillage.getState().order).toBeLessThan(before);
  });

  it('傷按旬好轉,不是按天', () => {
    useHero.setState({ wounded: 2, grain: 5 });
    settleDay(11, 'spring');
    expect(useHero.getState().wounded).toBe(2);
    settleDay(20, 'spring');
    expect(useHero.getState().wounded).toBe(1);
  });
});

describe('睡在哪裡是有差別的', () => {
  it('沒片瓦遮頭睡不好,還可能被摸走東西', () => {
    expect(restQuality('none').risk).toBeGreaterThan(restQuality('owned').risk);
    expect(restQuality('owned').healChance).toBeGreaterThan(restQuality('none').healChance);
  });
});
