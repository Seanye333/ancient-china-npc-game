import { describe, it, expect, beforeEach } from 'vitest';
import {
  herbSpots, pickYield, spotReady, useHerbs, canDress,
  recoverChance, deathMul, herbPrice, herbSale,
  REGROW, DOSE_SELF, DRESS_COOL,
} from './herbs';
import { useHero } from './hero';
import { deathChance } from './folk';
import { MARKET } from '../world/sites';

/**
 * 採藥 —— 這個系統要成立,靠的是三條規矩,一條都不能鬆:
 *
 * 一、<b>藥長在遠處</b>。站在市集旁邊就能採的話,它只是另一個按鈕。
 * 二、<b>藥讓傷好一倍快,不是立刻好</b>。買到的是時間,不是免疫。
 * 三、<b>藥不是免死金牌</b>。送了藥,老人還是可能走 ——
 *     那一句「你那副藥,終究是晚了」才是這個系統真正換到的東西。
 */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

describe('藥長在哪', () => {
  it('一叢都不在村口 —— 採藥必須是一趟路', () => {
    const spots = herbSpots();
    expect(spots.length).toBeGreaterThanOrEqual(8);
    for (const s of spots) {
      expect(Math.hypot(s.x - MARKET[0], s.z - MARKET[1]),
        `${s.id} 離村心太近`).toBeGreaterThanOrEqual(40);
    }
    // 決定論:同一顆種子每次都是同一片山,「西邊那叢」才記得住
    expect(herbSpots().map((s) => s.id)).toEqual(spots.map((s) => s.id));
  });

  it('採空的要等它長回來', () => {
    useHerbs.getState().reset();
    expect(spotReady('herb0', 100)).toBe(true);
    useHerbs.getState().pick('herb0', 100);
    expect(spotReady('herb0', 100)).toBe(false);
    expect(spotReady('herb0', 100 + REGROW - 1)).toBe(false);
    expect(spotReady('herb0', 100 + REGROW)).toBe(true);
    // 採這一叢不影響隔壁那一叢
    expect(spotReady('herb1', 100)).toBe(true);
  });
});

describe('一趟採得到多少', () => {
  const avg = (o: Parameters<typeof pickYield>[0], n = 200) => {
    let sum = 0;
    const roll = seeded(77);
    for (let i = 0; i < n; i++) sum += pickYield({ ...o, roll });
    return sum / n;
  };

  it('冬天上山是白跑', () => {
    expect(avg({ season: 'winter', intelligence: 46, wild: false, roll: Math.random }))
      .toBeLessThan(0.35);
  });

  it('認得藥的人採得多 —— 見識第一次在山野上有用', () => {
    const dull = avg({ season: 'spring', intelligence: 20, wild: false, roll: Math.random });
    const keen = avg({ season: 'spring', intelligence: 90, wild: false, roll: Math.random });
    expect(keen, `${dull.toFixed(1)} → ${keen.toFixed(1)}`).toBeGreaterThan(dull * 1.3);
  });

  it('走得越遠採得越多', () => {
    const near = avg({ season: 'summer', intelligence: 46, wild: false, roll: Math.random });
    const far = avg({ season: 'summer', intelligence: 46, wild: true, roll: Math.random });
    expect(far).toBeGreaterThan(near);
  });

  /**
   * 這一條是整個系統的張力所在:一趟採的藥<b>不夠兩個人用</b>。
   * 自己敷要兩株、送病家要三株 —— 於是每次下山都是同一個問題。
   */
  it('一趟採不滿一副藥加一次敷藥', () => {
    const got = avg({ season: 'spring', intelligence: 60, wild: false, roll: Math.random });
    expect(got, `平均 ${got.toFixed(1)} 株`).toBeLessThan(DOSE_SELF + 3);
  });
});

describe('敷藥', () => {
  beforeEach(() => {
    useHero.setState({ wounded: 0, woundKind: null, scars: 0, herbs: 0, dressedOn: null });
  });

  it('藥讓傷好一倍快 —— 不是立刻好', () => {
    useHero.setState({ wounded: 3, woundKind: 'leg', herbs: 10 });
    expect(useHero.getState().dress(0)).toBe(true);
    expect(useHero.getState().wounded).toBe(2);
    expect(useHero.getState().herbs).toBe(10 - DOSE_SELF);
    // 同一旬不能連敷 —— 不然一把藥當場把傷抹平
    expect(canDress(useHero.getState(), 0).ok).toBe(false);
    expect(canDress(useHero.getState(), DRESS_COOL - 1).ok).toBe(false);
    expect(canDress(useHero.getState(), DRESS_COOL).ok).toBe(true);
  });

  it('沒藥、沒傷都按不動,而且說得出為什麼', () => {
    expect(canDress({ wounded: 0, herbs: 9, dressedOn: null }, 5).why).toContain('沒傷');
    expect(canDress({ wounded: 2, herbs: 1, dressedOn: null }, 5).why).toContain('藥不夠');
    // 按不動的時候一株都不許扣
    useHero.setState({ wounded: 2, woundKind: 'leg', herbs: 1 });
    expect(useHero.getState().dress(0)).toBe(false);
    expect(useHero.getState().herbs).toBe(1);
  });

  /** 疤是「那次沒藥可敷」的紀念 —— 這是傷有形狀和採藥之間的接點。 */
  it('破相敷過藥就不留疤,沒敷過就留一輩子', () => {
    useHero.setState({ wounded: 1, woundKind: 'face', herbs: 4, scars: 0, dressedOn: null });
    useHero.getState().dress(0);
    expect(useHero.getState().wounded).toBe(0);
    expect(useHero.getState().scars, '敷過藥不該留疤').toBe(0);
    // 敷過的紀錄要跟著傷一起結掉,不然下一道傷會白撿一次「敷過了」
    expect(useHero.getState().dressedOn).toBeNull();

    useHero.setState({ wounded: 1, woundKind: 'face' });
    useHero.getState().heal();
    expect(useHero.getState().scars).toBe(1);
  });
});

describe('送藥', () => {
  it('救得回人,但救不了所有人', () => {
    expect(recoverChance(true)).toBeGreaterThan(recoverChance(false) * 2);
    // 藥不是免死金牌:機率壓下去,不歸零
    expect(deathMul(true)).toBeGreaterThan(0);
    expect(deathMul(true)).toBeLessThan(1);
  });

  /**
   * 空跑一個病人:七十歲、送不送藥,死掉的比例差多少。
   *
   * 這種事<b>只能空跑</b>:兩個機率相乘再逐日迭代,用眼睛看不出結果 ——
   * 第一版這個測試按感覺寫成「生路從三成拉到七成」,一跑才知道
   * 不送藥本來就有八成五活得下來。病死在這個世界一向不是常態,
   * 藥真正救的是<b>拖著不好的那一個</b>:病程從四天縮到不到兩天,
   * 而 deathChance 是隨病程往上爬的,所以尾巴一剪,死亡率就掉了一個數量級。
   */
  it('空跑:一副藥把老人的死路從一成五砍到二分', () => {
    const sim = (dosed: boolean) => {
      const roll = seeded(dosed ? 991 : 137);
      let dead = 0, days = 0;
      const N = 2000;
      for (let i = 0; i < N; i++) {
        let sick = 1;
        for (let d = 0; d < 80; d++) {
          if (roll() < deathChance(70, sick) * deathMul(dosed)) { dead++; break; }
          if (roll() < recoverChance(dosed)) break;
          sick++;
        }
        days += sick;
      }
      return { dead: dead / N, days: days / N };
    };
    const plain = sim(false), dosed = sim(true);
    const word = `無藥 ${(plain.dead * 100).toFixed(1)}%/${plain.days.toFixed(1)}天`
      + ` → 有藥 ${(dosed.dead * 100).toFixed(1)}%/${dosed.days.toFixed(1)}天`;
    expect(plain.dead, word).toBeGreaterThan(0.10);
    expect(dosed.dead, word).toBeLessThan(plain.dead * 0.35);
    // 藥真正做的事:把病程的尾巴剪掉
    expect(dosed.days, word).toBeLessThan(plain.days * 0.6);
  });
});

describe('藥價', () => {
  it('買賣有差價 —— 不然藥鋪是台印錢機', () => {
    for (const plague of [false, true]) {
      expect(herbSale(plague)).toBeLessThan(herbPrice(plague));
    }
  });
  it('疫年藥貴', () => {
    expect(herbPrice(true)).toBeGreaterThan(herbPrice(false));
  });
});
