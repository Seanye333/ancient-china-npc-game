import { describe, it, expect } from 'vitest';
import { flankOf } from './combat';

/**
 * 包抄。
 *
 * 這條規則最後只留下<b>玩家自己繞</b>那一半,而那是空跑逼出來的結論:
 * 讓 AI 也繞後的話,四個局面裡三個是 0% 的背後攻擊、最擠的一個也只有 1%,
 * 可是五打五兇的勝率從 0.43 掉到 0.35 —— 掉的不是被包抄打的,是自己人在繞圈。
 *
 * 為什麼幾乎不會發生是結構性的:這個戰鬥模型裡<b>每個人每幀都轉身面對自己的目標</b>,
 * 所以「背後」這個位置存在不到一秒就沒了。真人不一樣 —— 走位是他在控的。
 */

describe('從哪個方向來的', () => {
  // 面朝 +Z(yaw = 0)
  const t = { x: 0, z: 0, yaw: 0 };

  it('正面是 0,正背後是 1', () => {
    expect(flankOf({ x: 0, z: 2 }, t)).toBeCloseTo(0, 5);      // 站在他前面
    expect(flankOf({ x: 0, z: -2 }, t)).toBeCloseTo(1, 5);     // 站在他背後
  });

  it('側面算不上包抄 —— 半側身還招架得住', () => {
    expect(flankOf({ x: 2, z: 0 }, t)).toBeCloseTo(0, 5);
    expect(flankOf({ x: -2, z: 0 }, t)).toBeCloseTo(0, 5);
  });

  it('斜後方是有的,而且越靠後越多', () => {
    const back45 = flankOf({ x: 1, z: -1 }, t);
    const back20 = flankOf({ x: 2.7, z: -1 }, t);
    expect(back45).toBeGreaterThan(0.6);
    expect(back45).toBeGreaterThan(back20);
    expect(back20).toBeGreaterThan(0);
  });

  it('他轉身面對你,包抄就沒了 —— 這正是 AI 繞不出效果的原因', () => {
    const from = { x: 0, z: -2 };
    expect(flankOf(from, { ...t, yaw: 0 })).toBeCloseTo(1, 5);
    // 他轉過來(面朝 -Z)
    expect(flankOf(from, { ...t, yaw: Math.PI })).toBeCloseTo(0, 5);
  });

  it('貼到身上(距離為零)不算包抄,也不該除以零', () => {
    expect(flankOf({ x: 0, z: 0 }, t)).toBe(0);
    expect(Number.isFinite(flankOf({ x: 0, z: 0 }, t))).toBe(true);
  });
});
