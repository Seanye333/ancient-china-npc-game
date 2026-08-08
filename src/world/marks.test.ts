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
