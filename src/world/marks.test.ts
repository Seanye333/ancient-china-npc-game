import { describe, it, expect } from 'vitest';
import { __poolSpots } from './Marks';
import { terrainHeight, slopeAt, waterLevel } from './field';

/**
 * 積水的窪。
 *
 * 「水往低處走」這條規矩在畫面上很難驗 —— 四十來個窪散在三百公尺見方裡,
 * 隨手一張截圖多半一個都拍不到。但它是可以算的:每一處都該是<b>局部低點</b>。
 * 算錯的樣子是水積在坡上,而那一眼就假。
 */

describe('窪地選址', () => {
  const spots = __poolSpots();

  it('選得出來,而且不會滿地都是', () => {
    expect(spots.length).toBeGreaterThan(20);
    expect(spots.length).toBeLessThanOrEqual(46);
  });

  it('每一處都是局部低點 —— 水往低處走', () => {
    for (const p of spots) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const nb = terrainHeight(p.x + Math.sin(a) * 2.2, p.z + Math.cos(a) * 2.2);
        expect(nb, `(${p.x.toFixed(1)}, ${p.z.toFixed(1)}) 旁邊比它還低`)
          .toBeGreaterThanOrEqual(p.y - 0.02);
      }
    }
  });

  it('不積在水裡,也不積在坡上', () => {
    for (const p of spots) {
      expect(p.y).toBeGreaterThan(waterLevel() + 0.4);
      expect(slopeAt(p.x, p.z)).toBeLessThanOrEqual(0.12);
    }
  });

  it('彼此拉開距離 —— 擠成一團讀作一塊沼澤,不是幾窪水', () => {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z))
          .toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('同一場雨,水永遠積在同一幾處', () => {
    const again = __poolSpots();
    expect(again.map((p) => [p.x, p.z])).toEqual(spots.map((p) => [p.x, p.z]));
  });
});

/* ── 岸線 ────────────────────────────────────── */

import { __shoreSpots } from './Water';
import { riverMask } from './field';

describe('岸線', () => {
  const shore = __shoreSpots();

  it('沿著整條河,不是只有半段', () => {
    expect(shore.length).toBeGreaterThan(300);
    const zs = shore.map((s) => s.z);
    expect(Math.min(...zs)).toBeLessThan(-150);
    expect(Math.max(...zs)).toBeGreaterThan(150);
  });

  /**
   * 這一條是這批唯一真正難查的:水面那張網用 riverMask 裁外圍,可它是一片
   * <b>平的</b>板子鋪在 WATER_Y —— 靠岸那一段早埋進土裡了。眼睛看到的水邊
   * 在遮罩邊界的內側。照遮罩擺浪的話,三百道浪全在地底下,而截圖裡
   * 看起來就只是「浪沒做出來」。
   */
  it('落在<b>看得見的水邊</b>上,不是遮罩的邊界', () => {
    for (const s of shore) {
      // 往河心退一點,那裡該還是水(遮罩沒歸零)
      const cx = meanderAtOf(s.z);
      const inward = s.x + Math.sign(cx - s.x) * 0.6;
      expect(riverMask(inward, s.z), `(${s.x.toFixed(1)}, ${s.z.toFixed(1)}) 不在水邊`)
        .toBeGreaterThan(0.05);
      // 而地面在這裡已經爬到水位附近 —— 這才是看得見的那條線
      expect(terrainHeight(s.x, s.z)).toBeGreaterThan(waterLevel() - 0.8);
    }
  });

  it('兩岸都有 —— 只做一邊的話,轉個身河就成了硬邊', () => {
    const left = shore.filter((s) => s.yaw < 0).length;
    const right = shore.filter((s) => s.yaw > 0).length;
    expect(left).toBeGreaterThan(50);
    expect(right).toBeGreaterThan(50);
  });
});

function meanderAtOf(z: number): number {
  return Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;
}
