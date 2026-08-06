import { describe, it, expect, beforeEach } from 'vitest';
import {
  useMarauders, marauderRoll, warnDays, personalLoss, marauderBite,
} from './marauders';
import { useRefugees, refugeeRoll, REFUGEE_STAY } from './refugees';
import { useBands } from './bands';
import { bountyTarget, bountyPay, bountyMerit } from './yamen';

/**
 * 世界會爛給你看的三件事:亂兵、流民、賊坐大。
 * 三個共同的規格:<b>罕見、有預兆、留下可以做的事</b>。
 */

describe('亂兵過境', () => {
  beforeEach(() => useMarauders.getState().clear());

  it('一年零到一次 —— 它是段落,不是日常', () => {
    let seed = 777;
    const roll = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let hits = 0;
    for (let d = 0; d < 360 * 3; d++) if (marauderRoll(55, roll)) hits++;
    expect(hits, `三年來了 ${hits} 次`).toBeLessThan(5);
  });

  it('風聲先到兩三天 —— 這幾天就是這個系統給你的全部', () => {
    for (const r of [0, 0.5, 0.99]) {
      const w = warnDays(() => r);
      expect(w).toBeGreaterThanOrEqual(2);
      expect(w).toBeLessThanOrEqual(3);
    }
  });

  it('coming 幾天後 arrived,禍害兩天後 left', () => {
    const m = useMarauders.getState();
    m.begin(2);
    expect(useMarauders.getState().phase).toBe('coming');
    expect(m.step()).toBeNull();
    expect(m.step()).toBe('arrived');
    expect(useMarauders.getState().phase).toBe('present');
    expect(m.step()).toBeNull();
    expect(m.step()).toBe('left');
    expect(useMarauders.getState().phase).toBeNull();
  });

  it('人不在就全身而退 —— 「提前兩天知道」的全部價值就是這一條', () => {
    const away = personalLoss({
      inVillage: false, lodging: 'none', gold: 500, grain: 10, roll: () => 0.5,
    });
    expect(away.gold).toBe(0);
    expect(away.grain).toBe(0);
    expect(away.word).toBeNull();
  });

  it('人在村裡被搜身;有屋的糧鎖在屋裡,睡柴垛的家當就在身上', () => {
    const housed = personalLoss({
      inVillage: true, lodging: 'owned', gold: 400, grain: 10, roll: () => 0.5,
    });
    const rough = personalLoss({
      inVillage: true, lodging: 'none', gold: 400, grain: 10, roll: () => 0.5,
    });
    expect(housed.gold).toBeGreaterThan(0);
    expect(housed.grain).toBe(0);
    expect(rough.grain).toBeGreaterThan(0);
  });

  it('兩天的禍害比任何一種天災的一天都狠', () => {
    const b = marauderBite();
    expect(b.order).toBeLessThan(-5);
    expect(b.harvest).toBeLessThan(-5);
  });
});

describe('流民', () => {
  beforeEach(() => useRefugees.setState({ band: null }));

  it('太平年頭不來 —— 流民往還過得下去的地方走', () => {
    expect(refugeeRoll({ order: 60, justCalamity: false, justMarauders: false, roll: () => 0.001 }))
      .toBe(0);
  });

  it('亂兵剛走最容易來一夥,人數三到六', () => {
    const n = refugeeRoll({ order: 60, justCalamity: false, justMarauders: true, roll: () => 0.1 });
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('收留是減人頭,收到零就散了', () => {
    const r = useRefugees.getState();
    r.arrive(4, 10);
    r.take(3);
    expect(useRefugees.getState().band?.count).toBe(1);
    r.take(1);
    expect(useRefugees.getState().band).toBeNull();
  });

  it('一夥人只吃你一次粥 —— 再給就是白給', () => {
    const r = useRefugees.getState();
    r.arrive(4, 10);
    expect(useRefugees.getState().band?.fed).toBe(false);
    r.feed();
    expect(useRefugees.getState().band?.fed).toBe(true);
  });

  it('待滿五天自己走', () => {
    expect(REFUGEE_STAY).toBe(5);
  });
});

describe('賊坐大與懸賞', () => {
  it('治安差的旬,活著的窩會添人丁;打散的不會', () => {
    useBands.setState((s) => ({
      bands: s.bands.map((b, i) => ({ ...b, count: 4, fierce: 0.5, routed: i === 0 })),
    }));
    for (let i = 0; i < 30; i++) useBands.getState().swell(20, () => 0.1);
    const bands = useBands.getState().bands;
    expect(bands[0].count, '打散的窩不該長').toBe(4);
    expect(Math.max(...bands.slice(1).map((b) => b.count))).toBeGreaterThan(4);
    // 有上限 —— 不會長成一支軍隊
    expect(Math.max(...bands.map((b) => b.count))).toBeLessThanOrEqual(10);
  });

  it('治安好的旬不長 —— 賊坐大是「沒人管」的結果', () => {
    useBands.setState((s) => ({
      bands: s.bands.map((b) => ({ ...b, count: 4, fierce: 0.5, routed: false })),
    }));
    for (let i = 0; i < 30; i++) useBands.getState().swell(70, () => 0.1);
    expect(Math.max(...useBands.getState().bands.map((b) => b.count))).toBe(4);
  });

  it('榜只貼最大那一夥,而且要治安真的爛', () => {
    const bands = [
      { id: 'a', name: '甲', x: 0, z: 0, fierce: 0.5, count: 4, routed: false },
      { id: 'b', name: '乙', x: 0, z: 0, fierce: 0.8, count: 9, routed: false },
      { id: 'c', name: '丙', x: 0, z: 0, fierce: 0.9, count: 10, routed: true },
    ];
    expect(bountyTarget(bands, 50), '治安還行就不貼榜').toBeNull();
    const t = bountyTarget(bands, 25);
    expect(t?.id, '散了的不算,要活著最大那夥').toBe('b');
    // 賞錢比村民的委託高得多 —— 這錢難掙
    expect(bountyPay(t!)).toBeGreaterThan(150);
    expect(bountyMerit(t!)).toBeGreaterThan(20);
  });

  it('小賊不上榜 —— 懸賞是官府沒辦法了的證據', () => {
    const bands = [{ id: 'a', name: '甲', x: 0, z: 0, fierce: 0.3, count: 3, routed: false }];
    expect(bountyTarget(bands, 10)).toBeNull();
  });
});
