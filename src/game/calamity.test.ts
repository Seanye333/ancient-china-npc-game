import { describe, it, expect } from 'vitest';
import {
  calamityRoll, calamityDays, calamityBite, reliefRenown, reliefOrder, CALAMITY_LABEL,
} from './calamity';

/**
 * 天災。守的是「災要罕見才有份量」——
 * 一年出一次上下,玩家才會記得「那年的蝗災」,而不是把它當成天氣預報。
 */

function yearOfRolls(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('天災', () => {
  /**
   * 第一版拿「門檻壓到極低,看回傳哪一種」來驗季節權重 —— 那量到的是
   * <b>函式裡 for 迴圈的順序</b>,不是權重:機率再低,排第一個的那種也先中。
   * 要驗權重就得真的擲很多次去數。
   */
  const tally = (season: Parameters<typeof calamityRoll>[0], n = 4000) => {
    const roll = yearOfRolls(20260805);
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const k = calamityRoll(season, 60, roll);
      if (k) count[k] = (count[k] ?? 0) + 1;
    }
    return count;
  };

  it('夏天旱得多、秋天蝗得多、冬天疫得多', () => {
    const summer = tally('summer');
    const autumn = tally('autumn');
    const winter = tally('winter');
    expect(summer.drought ?? 0).toBeGreaterThan(summer.locust ?? 0);
    expect(autumn.locust ?? 0).toBeGreaterThan(autumn.drought ?? 0);
    expect(winter.plague ?? 0).toBeGreaterThan(winter.flood ?? 0);
  });

  it('冬天不鬧蝗災 —— 權重是零就該一次都不出', () => {
    expect(tally('winter').locust ?? 0).toBe(0);
  });

  it('一年大概出一次上下,不是每旬都來', () => {
    let hits = 0;
    const roll = yearOfRolls(99);
    // 一年三十六旬
    for (let xun = 0; xun < 36; xun++) {
      const season = (['spring', 'summer', 'autumn', 'winter'] as const)[Math.floor(xun / 9)];
      if (calamityRoll(season, 60, roll)) hits++;
    }
    expect(hits, `一年出了 ${hits} 次災`).toBeLessThan(5);
  });

  it('荒年更容易接著出事 —— 荒年是會連著來的', () => {
    let lean = 0; let fat = 0;
    const a = yearOfRolls(7); const b = yearOfRolls(7);
    for (let i = 0; i < 400; i++) {
      if (calamityRoll('summer', 20, a)) lean++;
      if (calamityRoll('summer', 80, b)) fat++;
    }
    expect(lean).toBeGreaterThan(fat);
  });

  it('每一種災都咬得到收成,疫病最要人命', () => {
    for (const k of ['drought', 'flood', 'locust', 'plague'] as const) {
      expect(CALAMITY_LABEL[k]).toBeTruthy();
      expect(calamityBite(k).harvest).toBeLessThan(0);
      expect(calamityDays(k, () => 0.5)).toBeGreaterThan(10);
    }
    expect(calamityBite('plague').sickMul).toBeGreaterThan(calamityBite('drought').sickMul);
    expect(calamityBite('locust').harvest).toBeLessThan(calamityBite('drought').harvest);
  });
});

describe('賑濟', () => {
  it('災年散糧,村裡人記得住的分量不一樣', () => {
    expect(reliefRenown(3, true)).toBeGreaterThan(reliefRenown(3, false));
  });
  it('賑濟也把村子拉回來一點,但拉不了太多', () => {
    expect(reliefOrder(3)).toBeGreaterThan(0);
    expect(reliefOrder(100)).toBeLessThanOrEqual(8);
  });
});
