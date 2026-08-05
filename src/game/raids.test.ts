import { describe, it, expect } from 'vitest';
import { raidChance, raidSize, surrenderChance, surrenderCount } from './raids';
import type { Band } from './bands';
import type { VillageState } from './village';

/**
 * 下山。
 *
 * 守的是一件事:<b>賊不是靶場裡的靶</b>。治安差他們就敢出來,
 * 而「出來」這件事要能在世界上被撞見、被攔下、被算帳。
 */

const band = (patch: Partial<Band> = {}): Band => ({
  id: 'b', name: '黑石岡', x: 40, z: -20, fierce: 0.5, count: 5, routed: false, ...patch,
});
const village = (patch: Partial<VillageState> = {}): VillageState => ({
  order: 50, harvest: 60, trade: 50, grainPrice: 34,
  tick: () => {}, nudge: () => {},
  ...patch,
} as VillageState);

describe('什麼時候下山', () => {
  it('治安越差越敢出來', () => {
    expect(raidChance(band(), village({ order: 12 }), 'summer'))
      .toBeGreaterThan(raidChance(band(), village({ order: 88 }), 'summer'));
  });

  it('秋收前後最凶 —— 有東西可搶的時候才有人搶', () => {
    expect(raidChance(band(), village(), 'autumn'))
      .toBeGreaterThan(raidChance(band(), village(), 'spring'));
  });

  it('兇的一夥更敢動', () => {
    expect(raidChance(band({ fierce: 0.9 }), village({ order: 30 }), 'autumn'))
      .toBeGreaterThan(raidChance(band({ fierce: 0.2 }), village({ order: 30 }), 'autumn'));
  });

  it('打散了的窩不會出人', () => {
    expect(raidChance(band({ routed: true }), village({ order: 5 }), 'autumn')).toBe(0);
  });

  it('再糟也不是每天都來 —— 天天遭遇會讓走路變成不能忍受的事', () => {
    expect(raidChance(band({ fierce: 1 }), village({ order: 0 }), 'autumn'))
      .toBeLessThanOrEqual(0.34);
  });

  it('不會傾巢而出,窩裡總得留人', () => {
    for (const roll of [() => 0, () => 0.5, () => 0.999]) {
      const n = raidSize(band({ count: 5 }), roll);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
    // 兩個人的小窩派一個出來,還剩一個看家
    expect(raidSize(band({ count: 2 }), () => 0.9)).toBe(1);
  });
});

describe('招安', () => {
  it('打得越慘越肯降', () => {
    const base = { charisma: 55, merit: 0 };
    expect(surrenderChance({ ...base, foesDown: 4, foesFled: 1 }))
      .toBeGreaterThan(surrenderChance({ ...base, foesDown: 0, foesFled: 5 }));
  });

  it('會說話、有名聲的人招得動', () => {
    const f = { foesDown: 2, foesFled: 2 };
    expect(surrenderChance({ ...f, charisma: 85, merit: 0 }))
      .toBeGreaterThan(surrenderChance({ ...f, charisma: 30, merit: 0 }));
    expect(surrenderChance({ ...f, charisma: 55, merit: 400 }))
      .toBeGreaterThan(surrenderChance({ ...f, charisma: 55, merit: 0 }));
  });

  it('never 全收 —— 總有人頭也不回', () => {
    expect(surrenderCount(6, () => 0.999)).toBeLessThan(6);
    expect(surrenderCount(1, () => 0)).toBe(1);
  });
});
