import { describe, it, expect } from 'vitest';
import { grainCost, grainSale, countyPrice, DAYS_PER_SHI } from './economy';
import type { VillageState } from './village';

/**
 * 行商成不成立,要算,不能寫在 commit 裡就當成立了。
 *
 * 縣城蓋好那天的說法是「行商賺的是看得準,不是跑得勤」——
 * 實際一算:趸買村裡 299,城裡賣 304,賺五個錢,白走兩天路。
 * 說法很好聽,數值上根本沒兌現。這個檔就是那筆帳,
 * 以後誰動米價、折扣、城裡溢價,這裡先叫。
 *
 * 規格用「跑一趟」為單位:去縣城約八個時辰,來回兩天,吃兩天糧。
 */

const village = (patch: Partial<VillageState> = {}): VillageState => ({
  order: 55, harvest: 60, trade: 50, grainPrice: 34,
  tick: () => {}, nudge: () => {},
  ...patch,
} as VillageState);

/** 跑一趟:村裡趸買十石,馱到縣城賣掉,扣掉兩天口糧。 */
function runOnce(v: VillageState): { capital: number; margin: number } {
  const county: VillageState = { ...v, grainPrice: countyPrice(v) };
  const capital = grainCost(v, 10);
  const revenue = grainSale(county, 10, true);
  const food = Math.ceil((2 / DAYS_PER_SHI) * v.grainPrice);
  return { capital, margin: revenue - capital - food };
}

describe('跑一趟值多少', () => {
  it('平時一趟賺三五十錢 —— 抵得上十天短工,但要押三百本錢', () => {
    const r = runOnce(village());
    console.log(`  平時:本錢 ${r.capital} · 淨賺 ${r.margin}`);
    // 下限:比五天短工(~25)多,值得跑。上限:不能比差事還好賺,
    // 不然剿匪那條命換錢的線就沒人走了
    expect(r.margin).toBeGreaterThan(25);
    expect(r.margin).toBeLessThan(90);
    expect(r.capital, '本錢門檻 —— 白身開局的三十錢摸不到這條線').toBeGreaterThan(250);
  });

  it('商路一斷,城裡先慌 —— 這時候跑一趟是平時的兩倍以上', () => {
    const calm = runOnce(village());
    const broken = runOnce(village({ trade: 25 }));
    console.log(`  斷路:淨賺 ${broken.margin}(平時 ${calm.margin}）`);
    expect(broken.margin).toBeGreaterThan(calm.margin * 2);
  });

  it('反著跑必虧 —— 從貴的地方進貨運去便宜的地方,不該有錢賺', () => {
    const v = village();
    const county: VillageState = { ...v, grainPrice: countyPrice(v) };
    const reverse = grainSale(v, 10) - grainCost(county, 10);
    expect(reverse).toBeLessThan(0);
  });

  it('在同一個市集買了就賣,必虧 —— 否則就是一台印錢機', () => {
    for (const v of [village(), village({ trade: 25 })]) {
      const county: VillageState = { ...v, grainPrice: countyPrice(v) };
      expect(grainSale(v, 10) - grainCost(v, 10)).toBeLessThan(0);
      expect(grainSale(county, 10, true) - grainCost(county, 10)).toBeLessThan(0);
    }
  });
});
