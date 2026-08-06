import { describe, it, expect, beforeEach } from 'vitest';
import {
  useVendetta, shouldWarn, vendettaChance, vendettaSize,
  VENDETTA_MIN, VENDETTA_COOL, WARN_LEAD,
} from './vendetta';

/**
 * 仇家 —— 這個系統的全部價值在於「打散」從此有了長期的後果,
 * 而它成不成立只看一條:<b>動手之前一定先給風聲</b>。
 * 半夜被人堵在門口而事先毫無徵兆,那不叫難,那叫耍人。
 */

const g = (over: Partial<{ count: number; since: number; warnedAt: number | null }> = {}) =>
  ({ count: 4, since: 0, warnedAt: null, ...over });

describe('仇家', () => {
  beforeEach(() => useVendetta.getState().reset());

  it('只有跑掉的人記仇,倒下的不會回來', () => {
    const v = useVendetta.getState();
    v.remember('band0', 0, 10);
    expect(useVendetta.getState().grudges.band0).toBeUndefined();
    v.remember('band0', 2, 10);
    v.remember('band0', 3, 20);
    // 帳是累加的,而且日子跟著最後一次走
    expect(useVendetta.getState().grudges.band0.count).toBe(5);
    expect(useVendetta.getState().grudges.band0.since).toBe(20);
  });

  it('人不夠就不來 —— 一個人跑掉是逃命,一夥人跑掉才是仇家', () => {
    expect(vendettaChance(g({ count: VENDETTA_MIN - 1, warnedAt: 0 }), 999, 0)).toBe(0);
  });

  /** 這是整個系統的規格:沒放過風聲,今天就不可能有人來。 */
  it('沒給過風聲就永遠不會動手', () => {
    const far = VENDETTA_COOL + 99;
    expect(vendettaChance(g({ warnedAt: null }), far, 500)).toBe(0);
    // 風聲當天也不算 —— 至少留 WARN_LEAD 天讓你準備
    expect(vendettaChance(g({ warnedAt: far }), far, 500)).toBe(0);
    expect(vendettaChance(g({ warnedAt: far - WARN_LEAD }), far, 0)).toBeGreaterThan(0);
  });

  it('風聲只放一次,而且放在動手之前', () => {
    expect(shouldWarn(g({ since: 0 }), 1)).toBe(false);         // 才剛結梁子
    expect(shouldWarn(g({ since: 0 }), VENDETTA_COOL - WARN_LEAD)).toBe(true);
    expect(shouldWarn(g({ since: 0, warnedAt: 3 }), 99)).toBe(false);  // 已經放過了
    // 又添新仇 —— 舊風聲不算數,要重新預告
    useVendetta.getState().remember('band0', 4, 5);
    useVendetta.getState().warn('band0', 6);
    useVendetta.getState().remember('band0', 2, 30);
    expect(useVendetta.getState().grudges.band0.warnedAt).toBeNull();
  });

  it('名聲越大越招仇家,但機率有頂', () => {
    const ready = g({ count: 8, since: 0, warnedAt: 0 });
    const day = VENDETTA_COOL + 5;
    expect(vendettaChance(ready, day, 300)).toBeGreaterThan(vendettaChance(ready, day, 0));
    expect(vendettaChance(g({ count: 99, warnedAt: 0 }), day, 9999)).toBeLessThanOrEqual(0.45);
  });

  it('打回去就把帳結了', () => {
    useVendetta.getState().remember('band0', 5, 1);
    useVendetta.getState().settle('band0');
    expect(useVendetta.getState().grudges.band0).toBeUndefined();
  });

  it('來的人不會少於兩個,也不會多過記恨的人數太多', () => {
    for (const c of [3, 6, 12]) {
      const n = vendettaSize(g({ count: c }), () => 0.5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(c + 1);
    }
  });
});
