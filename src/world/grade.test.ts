import { describe, it, expect } from 'vitest';
import { gradeFor, applyGrade, chroma, type Grade } from './grade';
import { SEASONS, WEATHERS } from './worldTime';

/** 一片草的顏色,拿來當量尺 —— 調色的成敗多半看綠色。 */
const GRASS: [number, number, number] = [0.26, 0.40, 0.16];
const SKIN: [number, number, number] = [0.62, 0.47, 0.38];
const GREY: [number, number, number] = [0.5, 0.5, 0.5];

describe('調色', () => {
  it('晴天白晝的調色不把中灰推走 —— 基準點要站得住', () => {
    for (const s of SEASONS) {
      const out = applyGrade(GREY, gradeFor(s, 'clear', 1));
      // 中灰只准微調,±6% 以內。跑掉的話整張畫面的曝光就被調色偷走了
      for (const c of out) expect(Math.abs(c - 0.5)).toBeLessThan(0.06);
    }
  });

  it('冬天比夏天灰', () => {
    const w = chroma(applyGrade(GRASS, gradeFor('winter', 'clear', 1)));
    const s = chroma(applyGrade(GRASS, gradeFor('summer', 'clear', 1)));
    expect(w).toBeLessThan(s * 0.8);
  });

  it('下雨把顏色洗掉 —— 每個季節都要洗掉', () => {
    for (const s of SEASONS) {
      const clear = chroma(applyGrade(GRASS, gradeFor(s, 'clear', 1)));
      const rain = chroma(applyGrade(GRASS, gradeFor(s, 'rain', 1)));
      expect(rain).toBeLessThan(clear);
    }
  });

  it('夜裡顏色認不出來,而且暗處發藍', () => {
    const day = gradeFor('summer', 'clear', 1);
    const night = gradeFor('summer', 'clear', 0);
    expect(night.saturation).toBeLessThan(day.saturation * 0.5);
    // 藍的 lift 要比紅的高 —— 這一條就是「暗處發藍」本身
    expect(night.lift[2]).toBeGreaterThan(night.lift[0] * 1.3);
    // 而且真的看得出來:同一塊皮膚,夜裡的藍綠比白天高
    const dc = applyGrade(SKIN, day);
    const nc = applyGrade(SKIN, night);
    expect(nc[2] / nc[0]).toBeGreaterThan(dc[2] / dc[0]);
  });

  it('任何季節×天氣×時辰都不炸 —— 輸出留在 0..1,參數不出常識範圍', () => {
    for (const s of SEASONS) {
      for (const w of WEATHERS) {
        for (const d of [0, 0.25, 0.5, 0.75, 1]) {
          const g: Grade = gradeFor(s, w, d);
          expect(g.saturation).toBeGreaterThan(0.2);
          expect(g.saturation).toBeLessThan(1.4);
          expect(g.contrast).toBeGreaterThan(0.7);
          expect(g.contrast).toBeLessThan(1.3);
          for (const c of applyGrade(GRASS, g)) {
            expect(Number.isFinite(c)).toBe(true);
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('dayK 連續 —— 黃昏不能有一格跳變', () => {
    let prev = gradeFor('autumn', 'clear', 0).saturation;
    for (let k = 0.02; k <= 1.0001; k += 0.02) {
      const now = gradeFor('autumn', 'clear', k).saturation;
      expect(Math.abs(now - prev)).toBeLessThan(0.05);
      prev = now;
    }
  });
});
