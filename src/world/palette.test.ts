import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { jitteredColor, rngGate } from './palette';
import { paletteFor } from './worldTime';

/**
 * 色彩抖動。
 *
 * 這一條測試存在的理由,是它抓到的那個 bug <b>用眼睛看不出來</b>:
 * 2600 棵針葉樹裡有 644 棵是純黑的,可黑樹散在暗綠的林子裡,
 * 看起來只像「那邊背光」。直到把 instanceColor 撈出來數,才知道是四分之一。
 */

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** 世界上每一種會被抖色的東西,連同它在 Vegetation.tsx 用的抖動幅度。 */
const KINDS: Array<[keyof ReturnType<typeof paletteFor>, number, number, number]> = [
  ['conifer', 0.012, 0.10, 0.09],
  ['broadleaf', 0.018, 0.12, 0.11],
  ['reed', 0.010, 0.08, 0.10],
  ['rock', 0.004, 0.05, 0.13],
  ['bamboo', 0.014, 0.10, 0.10],
  ['willow', 0.014, 0.10, 0.10],
];

/** 抄 Vegetation.tsx 撒點的範圍 —— 測試要走真的會出現的座標。 */
function spots(n: number) {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    out.push([(rngGate(i * 3.7, i * 1.9) - 0.5) * 470, (rngGate(i * 2.3, i * 5.1) - 0.5) * 470]);
  }
  return out;
}

describe('逐棵抖色', () => {
  it('抖動不能把顏色抖沒了 —— 一棵純黑的樹在畫面上讀作「壞了」', () => {
    const pts = spots(2600);
    for (const season of SEASONS) {
      const p = paletteFor(season);
      for (const [kind, dh, ds, dl] of KINDS) {
        const base = p[kind] as THREE.Color;
        let darkest = 1;
        let blacks = 0;
        for (const [x, z] of pts) {
          const c = jitteredColor(base, x, z, dh, ds, dl);
          const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
          if (lum < 0.0015) blacks++;
          darkest = Math.min(darkest, lum);
        }
        const where = `${season} · ${kind}`;
        expect(blacks, `${where} 有 ${blacks} 棵是純黑的`).toBe(0);
        // 底色本身就暗的(針葉 #2c402a 亮度 0.037),只要求別比它再暗一半以上
        const baseLum = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722;
        expect(darkest, `${where} 最暗 ${darkest.toFixed(4)} vs 底色 ${baseLum.toFixed(4)}`)
          .toBeGreaterThan(baseLum * 0.25);
      }
    }
  });

  it('來回一趟要回到原色 —— 抖動為零時不該偷偷改色', () => {
    // getHSL 讀線性、setHSL 寫 sRGB,兩個預設空間不同;這一趟剛好互相抵消,
    // 所以「不抖」看起來一直是對的 —— 這條測試釘的是「修好以後也還是對的」
    for (const hex of ['#2c402a', '#c08a2e', '#f2ece4', '#33433a', '#080808']) {
      const base = new THREE.Color(hex);
      const got = jitteredColor(base, 12.3, -45.6, 0, 0, 0);
      expect(got.getHexString(), hex).toBe(hex.slice(1));
    }
  });

  it('同一個地點永遠是同一個色 —— 換季重掛不能換一棵樹的長相', () => {
    const base = new THREE.Color('#6f8a36');
    const a = jitteredColor(base, 88.5, -12.25, 0.018, 0.12, 0.11);
    const b = jitteredColor(base, 88.5, -12.25, 0.018, 0.12, 0.11);
    expect(a.getHexString()).toBe(b.getHexString());
  });
});
