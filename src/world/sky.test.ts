import { describe, it, expect } from 'vitest';
import { cloudLook, snowTarget, snowStep, gustAt, gusting } from './sky';
import { SEASONS, WEATHERS } from './worldTime';

describe('雲', () => {
  it('雨雲低而暗、雪雲多而平、晴雲高而白', () => {
    const clear = cloudLook('clear', 'summer', 1);
    const rain = cloudLook('rain', 'summer', 1);
    const snow = cloudLook('snow', 'winter', 1);
    expect(rain.y).toBeLessThan(clear.y * 0.7);
    expect(rain.color[0]).toBeLessThan(clear.color[0] * 0.6);
    expect(snow.clusters).toBeGreaterThan(clear.clusters);
    expect(snow.opacity).toBeLessThan(rain.opacity);
  });

  it('夜裡的雲只反月光,不是白的', () => {
    const day = cloudLook('clear', 'summer', 1);
    const night = cloudLook('clear', 'summer', 0);
    expect(night.color[0]).toBeLessThan(day.color[0] * 0.5);
    // 而且偏冷 —— 月光不是暖的
    expect(night.color[2] / night.color[0]).toBeGreaterThan(day.color[2] / day.color[0]);
  });

  it('任何組合都給得出合理的雲', () => {
    for (const s of SEASONS) {
      for (const w of WEATHERS) {
        for (const d of [0, 0.5, 1]) {
          const c = cloudLook(w, s, d);
          expect(c.clusters).toBeGreaterThan(0);
          expect(c.y).toBeGreaterThan(20);
          expect(c.opacity).toBeGreaterThan(0);
          for (const ch of c.color) expect(ch).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('積雪', () => {
  it('下雪積、天晴化,而冬天有個底', () => {
    expect(snowTarget('snow', 'autumn')).toBe(1);
    expect(snowTarget('clear', 'winter')).toBeGreaterThan(0);
    expect(snowTarget('clear', 'autumn')).toBe(0);
    expect(snowTarget('rain', 'autumn')).toBe(0);
  });

  it('攢得快、化得慢 —— 一夜積得起來,化要好幾天', () => {
    // 一小時的遊戲時間約十秒真實時間;拿一百秒當「一晚」
    let pack = 0;
    for (let i = 0; i < 100; i++) pack = snowStep(pack, 1, 1);
    expect(pack).toBeGreaterThan(0.6);
    const deep = pack;
    let melt = deep;
    for (let i = 0; i < 100; i++) melt = snowStep(melt, 0, 1);
    // 同樣長的時間,化掉的遠少於積起來的
    expect(melt).toBeGreaterThan(deep * 0.5);
  });

  it('永遠在 0..1', () => {
    let p = 0.5;
    for (const t of [1, 0, 1, 0.55, 0]) {
      for (let i = 0; i < 400; i++) p = snowStep(p, t, 0.5);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('陣風', () => {
  it('平時很小,偶爾一陣 —— 而且不是每次都一樣大', () => {
    const peaks = [];
    let big = 0, calm = 0;
    for (let t = 0; t < 1200; t += 0.5) {
      const g = gustAt(t, 'clear');
      const k = gusting(g, 'clear');
      if (k > 0.5) big++; else if (k < 0.05) calm++;
      peaks.push(g.strength);
    }
    // 大半時間是靜的 —— 一直在颳的不是陣風,是背景音
    expect(calm).toBeGreaterThan(peaks.length * 0.5);
    // 但真的會颳起來
    expect(big).toBeGreaterThan(20);
    expect(Math.max(...peaks)).toBeGreaterThan(1.0);
  });

  it('風向會轉 —— 一年到頭同一個方向的不叫風', () => {
    /*
     * 不要拿<b>兩個時刻</b>比。
     *
     * 第一版比 t=0 和 t=300,點積 0.993 —— 幾乎同向,測試紅了。
     * 可風向確實在轉:那個角度是 t*0.017 加一條慢慢擺的正弦,
     * 到 t=300 剛好繞了將近一整圈回到原處。抽兩個點看只會抽到運氣。
     * 該問的是「一年下來掃過多少方向」。
     */
    const seen = new Set();
    for (let t = 0; t < 1200; t += 5) {
      const g = gustAt(t, 'clear');
      expect(Math.hypot(g.dx, g.dz)).toBeCloseTo(1, 5);
      seen.add(Math.floor(((Math.atan2(g.dx, g.dz) + Math.PI) / (Math.PI * 2)) * 8));
    }
    // 八個方位至少掃過六個
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('是純函式 —— 同一個 t 永遠同一陣風(存讀檔與重播都靠這條)', () => {
    for (const t of [0, 13.7, 512.25]) {
      expect(gustAt(t, 'rain')).toEqual(gustAt(t, 'rain'));
    }
  });

  it('雨裡的風本來就大,陣也更猛', () => {
    let rainMax = 0, clearMax = 0;
    for (let t = 0; t < 1200; t += 0.5) {
      rainMax = Math.max(rainMax, gustAt(t, 'rain').strength);
      clearMax = Math.max(clearMax, gustAt(t, 'clear').strength);
    }
    expect(rainMax).toBeGreaterThan(clearMax * 1.4);
  });
});
