import { describe, it, expect, beforeEach } from 'vitest';
import {
  useFurlough, furloughRoll, grantEffect, refuseEffect, ignoreEffect,
  ASK_PATIENCE, REASON_ASK, REASON_WORD,
} from './furlough';

/**
 * 告假。
 *
 * 這個系統要成立,靠的不是「有人會來求你」,而是<b>三條路都有價</b>:
 * 准了要少一個人手若干天、不准要記一筆、不理最貴。
 * 少了任何一條,它就退回成一個沒有選擇的通知。
 */

const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};

describe('誰會開口', () => {
  beforeEach(() => useFurlough.getState().reset());

  it('一次只有一個人堵在門口', () => {
    const base = {
      followers: ['v1', 'v2', 'v3'], away: [], season: 'autumn' as const,
      sickAtHome: false, roll: seeded(7),
    };
    expect(furloughRoll({ ...base, pending: true })).toBeNull();
  });

  it('已經在外面的人不會再求一次', () => {
    let asked = 0;
    for (let i = 0; i < 400; i++) {
      const got = furloughRoll({
        followers: ['v1', 'v2'], away: ['v1', 'v2'], pending: false,
        season: 'autumn', sickAtHome: false, roll: seeded(i * 31 + 5),
      });
      if (got) asked++;
    }
    expect(asked, '人都不在了還有人來求').toBe(0);
  });

  it('沒人跟著你的時候不會有人來求', () => {
    expect(furloughRoll({
      followers: [], away: [], pending: false, season: 'autumn',
      sickAtHome: false, roll: seeded(3),
    })).toBeNull();
  });

  it('秋天最多 —— 那時候自家的地也熟了', () => {
    const count = (season: 'autumn' | 'summer') => {
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        if (furloughRoll({
          followers: ['v1', 'v2', 'v3'], away: [], pending: false, season,
          sickAtHome: false, roll: seeded(i * 977 + 11),
        })) n++;
      }
      return n;
    };
    const autumn = count('autumn'), summer = count('summer');
    expect(autumn, `秋 ${autumn} vs 夏 ${summer}`).toBeGreaterThan(summer * 1.5);
  });

  it('村裡有人病著,求的理由就是家裡老的病了', () => {
    for (let i = 0; i < 200; i++) {
      const got = furloughRoll({
        followers: ['v1'], away: [], pending: false, season: 'spring',
        sickAtHome: true, roll: seeded(i * 13 + 1),
      });
      if (got) { expect(got.reason).toBe('illness'); return; }
    }
    throw new Error('兩百次都沒人開口 —— 機率調得太低了');
  });

  it('病和喪走得久,喜事和收麥快去快回', () => {
    const daysFor = (sick: boolean, season: 'autumn' | 'spring') => {
      for (let i = 0; i < 500; i++) {
        const got = furloughRoll({
          followers: ['v1'], away: [], pending: false, season,
          sickAtHome: sick, roll: seeded(i * 29 + 7),
        });
        if (got) return got.days;
      }
      return -1;
    };
    expect(daysFor(true, 'spring')).toBeGreaterThanOrEqual(9);
    expect(daysFor(false, 'autumn')).toBeLessThan(10);
  });
});

describe('三條路都有價', () => {
  it('准了往你這邊走,不准往回走,不理最貴', () => {
    const grant = grantEffect();
    const refuse = refuseEffect('wedding');
    const ignore = ignoreEffect();
    expect(grant.favor).toBeGreaterThan(0);
    expect(refuse.favor).toBeLessThan(0);
    // 不理比回絕更難看 —— 回絕好歹是個交代
    expect(ignore.favor).toBeLessThan(refuse.favor);
    expect(ignore.regard).toBeLessThan(refuse.regard);
  });

  it('家裡有病人、有喪事的,回絕起來最傷', () => {
    for (const heavy of ['illness', 'funeral'] as const) {
      for (const light of ['wedding', 'debt', 'harvest'] as const) {
        expect(refuseEffect(heavy).favor).toBeLessThan(refuseEffect(light).favor);
        expect(refuseEffect(heavy).quitChance).toBeGreaterThan(refuseEffect(light).quitChance);
      }
    }
  });

  it('回絕<b>不是</b>翻臉 —— 大多數人會忍下來,那才是難受的地方', () => {
    for (const r of ['illness', 'funeral', 'wedding', 'debt', 'harvest'] as const) {
      expect(refuseEffect(r).quitChance).toBeLessThan(0.5);
    }
  });

  it('等的日子夠你走一趟縣城,不夠你當作沒這回事', () => {
    expect(ASK_PATIENCE).toBeGreaterThanOrEqual(3);
    expect(ASK_PATIENCE).toBeLessThanOrEqual(8);
  });
});

describe('狀態', () => {
  beforeEach(() => useFurlough.getState().reset());

  it('第二個人求不進來 —— 門口只站得下一個', () => {
    useFurlough.getState().ask({ id: 'v1', reason: 'debt', askedOn: 3, days: 6 });
    useFurlough.getState().ask({ id: 'v2', reason: 'wedding', askedOn: 3, days: 6 });
    expect(useFurlough.getState().pending?.id).toBe('v1');
  });

  it('同一個人不會在外面出現兩次', () => {
    useFurlough.getState().send({ id: 'v1', reason: 'debt', backOn: 10 });
    useFurlough.getState().send({ id: 'v1', reason: 'illness', backOn: 20 });
    expect(useFurlough.getState().away).toHaveLength(1);
    expect(useFurlough.getState().away[0].backOn).toBe(20);
  });

  it('每一種理由都有話說,也都有個說法', () => {
    for (const r of ['illness', 'harvest', 'wedding', 'funeral', 'debt'] as const) {
      expect(REASON_ASK[r].length).toBeGreaterThan(8);
      expect(REASON_WORD[r].length).toBeGreaterThan(3);
    }
  });
});
