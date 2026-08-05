import { describe, it, expect } from 'vitest';
import {
  jobsToday, grainCost, DAYS_PER_SHI, RENT_PER_XUN, taxDue, stipendFor, mouths, UPKEEP_PER_MAN,
} from './economy';
import type { Lodging } from './economy';
import { seasonOf, DAYS_PER_XUN, DAYS_PER_YEAR } from './calendar';
import { ORIGINS } from './origin';
import type { VillageState } from './village';

/**
 * 一個人靠打工過得下去嗎。
 *
 * 這是這套經濟<b>唯一真正的規格</b>,而在寫這個檔之前它從來沒被問過:
 * 工錢 9–13 一趟、米價 34 一石、租金 26 一旬、雇人 31、屋子 620 ——
 * 每個數字單獨看都合理,合起來是不是一條活得下去的曲線,沒有人算過。
 *
 * 所以這裡空跑一年:一個什麼背景都沒有的人,每天起來只做兩件事 ——
 * 缺糧就去糴,不缺就去做工 —— 看他能不能活到明年開春。
 *
 * 這種測試的價值不在於「發現一個 bug」,而在於它問的是<b>整體</b>:
 * 任何一個常數被人調過頭,這裡都會先叫出來。
 */

const village = (patch: Partial<VillageState> = {}): VillageState => ({
  order: 55, harvest: 60, trade: 50, grainPrice: 34,
  tick: () => {}, nudge: () => {},
  ...patch,
} as VillageState);

interface Life {
  gold: number;
  grain: number;
  lodging: Lodging;
  /** 挨餓的天數。 */
  starved: number;
  /** 交不出算賦的次數。 */
  taxFail: number;
  /** 被趕出去的次數。 */
  evicted: number;
  /** 一年做了幾趟工。 */
  shifts: number;
  /** 年底剩多少。 */
  ledger: string[];
}

/**
 * 一個活得很樸素的人:缺糧就糴,不缺就做工,做不動就睡。
 * 這不是「最佳策略」,是<b>最笨的那一種</b> —— 如果連它都活不下去,
 * 那不是玩家不會玩,是這條曲線不成立。
 */
function liveAYear(o: { gold: number; grain: number; lodging: Lodging },
  opt: { grainPrice?: number; retinue?: number } = {}): Life {
  const life: Life = {
    gold: o.gold, grain: o.grain, lodging: o.lodging,
    starved: 0, taxFail: 0, evicted: 0, shifts: 0, ledger: [],
  };
  const retinue = opt.retinue ?? 0;
  const v = village({ grainPrice: opt.grainPrice ?? 34 });
  let rentDue = o.lodging === 'rented' ? DAYS_PER_XUN : Infinity;

  for (let day = 1; day <= DAYS_PER_YEAR; day++) {
    const season = seasonOf(day);
    let hour = 6.5;
    let toil = 0;

    // 一天之內能做幾趟就做幾趟 —— 時辰和身子都是上限
    while (hour < 18 && toil < 9) {
      const jobs = jobsToday(v, season, hour).filter((j) => !j.closed);
      if (!jobs.length) break;
      // 挑錢最多的那個(單位時辰)
      const best = jobs.sort((a, b) => b.pay / b.hours - a.pay / a.hours)[0];
      life.gold += best.pay;
      hour += best.hours;
      toil += best.toil;
      life.shifts++;
    }

    // 糧見底就去糴 —— 留三天的餘裕
    const daysLeft = (life.grain * DAYS_PER_SHI) / mouths(0, retinue);
    if (daysLeft < 6) {
      const want = 3;
      const cost = grainCost(v, want);
      if (life.gold >= cost) { life.gold -= cost; life.grain += want; }
    }

    // 吃飯
    const need = mouths(0, retinue) / DAYS_PER_SHI;
    if (life.grain >= need) life.grain -= need;
    else { life.grain = 0; life.starved++; }

    // 租
    if (day >= rentDue) {
      if (life.gold >= RENT_PER_XUN) { life.gold -= RENT_PER_XUN; rentDue += DAYS_PER_XUN; }
      else { life.evicted++; life.lodging = 'none'; rentDue = Infinity; }
    }

    // 俸(白身沒有)與月錢
    if (day % DAYS_PER_XUN === 0) {
      life.gold += stipendFor(11);
      life.gold = Math.max(0, life.gold - retinue * UPKEEP_PER_MAN);
    }

    // 算賦
    if (day === Math.floor(DAYS_PER_YEAR * 0.75)) {
      const due = taxDue(life.lodging);
      if (life.gold >= due) life.gold -= due;
      else {
        const shi = Math.ceil((due - life.gold) / v.grainPrice);
        if (life.grain >= shi) { life.gold = 0; life.grain -= shi; }
        else { life.gold = 0; life.taxFail++; }
      }
    }

    if (day % 90 === 0) {
      life.ledger.push(`${season} 末:錢 ${Math.round(life.gold)} 糧 ${life.grain.toFixed(1)}`);
    }
  }
  return life;
}

describe('活得下去嗎', () => {
  it('一個最笨的白身,靠打工能活過一年', () => {
    const life = liveAYear({ gold: 30, grain: 2, lodging: 'none' });
    console.log('  白身一年:', life.ledger.join(' · '),
      `· 做了 ${life.shifts} 趟工 · 餓 ${life.starved} 天`);
    expect(life.starved, `餓了 ${life.starved} 天`).toBeLessThan(10);
    expect(life.taxFail).toBe(0);
  });

  it('五種出身都活得過第一年 —— 開局不該有必死的選項', () => {
    for (const o of ORIGINS) {
      const life = liveAYear({ gold: o.gold, grain: o.grain, lodging: o.lodging });
      expect(life.starved, `${o.name} 餓了 ${life.starved} 天`).toBeLessThan(14);
    }
  });

  it('賃屋的人也撐得住 —— 一旬 26 錢不該是壓死人的價', () => {
    const life = liveAYear({ gold: 90, grain: 1, lodging: 'rented' });
    console.log('  賃屋一年:', life.ledger.join(' · '), `· 被趕 ${life.evicted} 次`);
    expect(life.evicted).toBe(0);
    expect(life.starved).toBeLessThan(10);
  });

  /**
   * <b>打工養不起隊伍,只有差事養得起。</b>
   *
   * 這是整套經濟真正想說的一句話:出賣力氣只夠一個人糊口,
   * 想帶著人就得去接那些會要命的活。所以驗的不是「有沒有餓死」,
   * 是「光靠做工帶三個人會不會入不敷出」。
   */
  it('打工養不起隊伍 —— 帶三個人光靠做工會虧空', () => {
    const alone = liveAYear({ gold: 30, grain: 2, lodging: 'none' });
    const crowded = liveAYear({ gold: 30, grain: 2, lodging: 'none' }, { retinue: 3 });
    console.log('  一個人:', Math.round(alone.gold), '錢 · 帶三個人:',
      Math.round(crowded.gold), '錢 · 餓', crowded.starved, '天');
    expect(crowded.gold).toBeLessThan(alone.gold / 3);
    expect(crowded.starved).toBeGreaterThan(0);
  });

  /**
   * 荒年不該把一個能做工的單身漢餓死 —— 那不寫實,也不好玩。
   * 該被荒年壓垮的是<b>盈餘</b>:攢了半年的錢一個冬天就沒了,
   * 而任何一個要養的人都會變成壓死你的那一根。
   */
  it('荒年吃掉的是盈餘,不是一個單身漢的命', () => {
    const good = liveAYear({ gold: 30, grain: 2, lodging: 'none' });
    const lean = liveAYear({ gold: 30, grain: 2, lodging: 'none' }, { grainPrice: 78 });
    console.log('  平年攢', Math.round(good.gold), '· 荒年攢', Math.round(lean.gold));
    expect(lean.gold).toBeLessThan(good.gold * 0.5);
    expect(lean.starved).toBe(0);

    // 但荒年裡帶著兩個人就真的會挨餓
    const withMen = liveAYear({ gold: 30, grain: 2, lodging: 'none' },
      { grainPrice: 78, retinue: 2 });
    expect(withMen.starved).toBeGreaterThan(0);
  });

  /**
   * 一間屋子要攢大半年,但攢得到 —— 太快就沒有份量,永遠攢不到就是死路。
   */
  it('一間屋子是大半年的事', () => {
    const life = liveAYear({ gold: 30, grain: 2, lodging: 'none' });
    console.log('  一年攢下:', Math.round(life.gold), '錢（屋子 620）· 做了',
      life.shifts, '趟工');
    expect(life.gold, '一年攢不到一間屋').toBeGreaterThan(620);
    expect(life.gold, '一年攢得起好幾間屋,錢就沒有意義了').toBeLessThan(620 * 3);
  });
});
