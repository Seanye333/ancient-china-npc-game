import { describe, it, expect } from 'vitest';
import { ambienceMix, phraseWalk, GONG } from './audio';

/**
 * 聲音。
 *
 * 這個檔在此之前一行覆蓋率都沒有,而它是<b>最不容易發現壞掉</b>的一塊:
 * 聲音壞掉的樣子是安靜,和「還沒做」一模一樣 —— 眼睛看不出來、截圖拍不到、
 * 探針也只能問「有沒有在響」。
 *
 * 所以先把裡面唯一有規矩的兩段抽成純函式(環境音的混音、樂句的音符),
 * 剩下的都是把噪音接到濾波器上 —— 那一段要真的用耳朵聽。
 */

describe('環境音的三層', () => {
  const day = { hour: 12, weather: 'clear' };
  const night = { hour: 23, weather: 'clear' };

  it('入夜蟲聲起來、風聲反而小 —— 這一組就是「天黑了」', () => {
    expect(ambienceMix(night).night).toBeGreaterThan(ambienceMix(day).night * 5);
    expect(ambienceMix(night).wind).toBeLessThan(ambienceMix(day).wind);
  });

  it('黃昏是<b>中間值</b>,不是直接切到夜 —— 硬切會聽出是三段錄音', () => {
    const dusk = ambienceMix({ hour: 18.5, weather: 'clear' }).night;
    expect(dusk).toBeGreaterThan(ambienceMix(day).night);
    expect(dusk).toBeLessThan(ambienceMix(night).night);
  });

  it('只有雨天才有雨聲,雪天小一點,晴天是零', () => {
    expect(ambienceMix({ ...day, weather: 'clear' }).rain).toBe(0);
    expect(ambienceMix({ ...day, weather: 'snow' }).rain).toBeGreaterThan(0);
    expect(ambienceMix({ ...day, weather: 'rain' }).rain)
      .toBeGreaterThan(ambienceMix({ ...day, weather: 'snow' }).rain * 4);
  });

  it('進了屋是<b>同一套壓小</b>,不是換一套 —— 門板擋的是音量不是內容', () => {
    const out = ambienceMix({ hour: 12, weather: 'rain' });
    const inn = ambienceMix({ hour: 12, weather: 'rain', indoors: true });
    const k = inn.wind / out.wind;
    expect(k).toBeLessThan(1);
    // 三層要按同一個比例壓下去,不然屋裡的雨聲會比風聲相對變大
    expect(inn.night / out.night).toBeCloseTo(k, 6);
    expect(inn.rain / out.rain).toBeCloseTo(k, 6);
  });

  it('任何時辰任何天氣都給得出合理的音量 —— 不能是負的、也不能吵死人', () => {
    for (let h = 0; h < 24; h += 0.5) {
      for (const w of ['clear', 'rain', 'snow']) {
        for (const indoors of [false, true]) {
          const m = ambienceMix({ hour: h, weather: w, indoors });
          for (const v of [m.wind, m.night, m.rain]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(0.35);
          }
        }
      }
    }
  });
});

describe('琴那一段', () => {
  /** 固定的骰子 —— 樂句要能重現,不然「這一段好不好聽」沒法討論。 */
  const dice = (seed: number) => {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  };

  it('每一個音都落在五聲音階上 —— 走出音階就是亂彈', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const n of phraseWalk(false, dice(seed))) {
        expect(GONG, `${n.hz} 不在音階上`).toContain(n.hz);
      }
    }
  });

  it('每一步都是<b>小步</b> —— 大跳聽起來像隨機數列,不像有人在撫弦', () => {
    for (let seed = 1; seed < 60; seed++) {
      const idx = phraseWalk(false, dice(seed)).map((n) => GONG.indexOf(n.hz));
      for (let i = 1; i < idx.length; i++) {
        expect(Math.abs(idx[i] - idx[i - 1]), '跳太遠了').toBeLessThanOrEqual(2);
      }
    }
  });

  it('三到六個音,時間一路往後,收在一個長音上', () => {
    for (let seed = 1; seed < 40; seed++) {
      const ns = phraseWalk(false, dice(seed));
      expect(ns.length).toBeGreaterThanOrEqual(3);
      expect(ns.length).toBeLessThanOrEqual(6);
      for (let i = 1; i < ns.length; i++) expect(ns[i].at).toBeGreaterThan(ns[i - 1].at);
      // 整段不能長到讓下一段追上來(updateAmbience 排程最短間隔二十秒)
      expect(ns[ns.length - 1].at + 1.7).toBeLessThan(18);
    }
  });

  it('夜裡彈得輕 —— 同一顆骰子,soft 的每一個音都比較小聲', () => {
    const loud = phraseWalk(false, dice(7));
    const soft = phraseWalk(true, dice(7));
    expect(soft.length).toBe(loud.length);
    for (let i = 0; i < soft.length; i++) {
      expect(soft[i].gain).toBeLessThan(loud[i].gain);
      expect(soft[i].hz).toBe(loud[i].hz);      // 只是輕,不是換一段
    }
  });

  it('同一顆骰子彈出同一段 —— 純函式這一條要立得住', () => {
    expect(phraseWalk(false, dice(42))).toEqual(phraseWalk(false, dice(42)));
  });
});
