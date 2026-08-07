import { describe, it, expect } from 'vitest';
import { checkEnding, epitaph, whatNow, ENDING_TITLE, isFatal, useEnding, type Life } from './ending';

/**
 * 落幕與提示。
 *
 * 守兩件事:<b>敗亡優先於功成</b>(餓死的人不會同時「安身」),
 * 以及<b>提示講處境不講操作</b> —— 講操作的提示會過期,講處境的不會。
 */

const base = {
  starvingDays: 0, sickDays: 0, merit: 0, renown: 0,
  lodging: 'none' as const, gold: 0, bandsCleared: 0,
};

describe('落幕', () => {
  it('平常的日子不會沒事收場', () => {
    expect(checkEnding(base)).toBeNull();
    expect(checkEnding({ ...base, merit: 200, gold: 300 })).toBeNull();
  });

  it('餓上九天就沒了 —— 而且吃上一頓就重新算', () => {
    expect(checkEnding({ ...base, starvingDays: 8 })).toBeNull();
    expect(checkEnding({ ...base, starvingDays: 9 })).toBe('starved');
  });

  it('敗亡壓過功成 —— 餓死的人不會同時安身', () => {
    const both = { ...base, starvingDays: 12, lodging: 'owned' as const, gold: 999 };
    expect(checkEnding(both)).toBe('starved');
  });

  it('三種好下場各自有條件,而且不是「通關」', () => {
    // 出谷:有官身還不夠,要真的做過事
    expect(checkEnding({ ...base, merit: 200 })).toBeNull();
    expect(checkEnding({ ...base, merit: 200, bandsCleared: 2 })).toBe('summoned');
    // 名動一鄉靠的是鄉望,不是功績
    expect(checkEnding({ ...base, renown: 80 })).toBe('renowned');
    // 安身:有屋有餘錢
    expect(checkEnding({ ...base, lodging: 'owned', gold: 400 })).toBe('rooted');
    expect(checkEnding({ ...base, lodging: 'owned', gold: 100 })).toBeNull();
  });

  it('每一種收場都寫得出一段生平', () => {
    for (const kind of Object.keys(ENDING_TITLE) as Array<keyof typeof ENDING_TITLE>) {
      const life: Life = {
        kind, days: 400, merit: 30, renown: 20, gold: 500, lodging: 'owned',
        companions: ['王安'], lost: [], sworn: [], swornLost: [],
        bandsCleared: 2, errandsDone: 5,
      };
      expect(epitaph(life).length).toBeGreaterThan(20);
    }
  });
});

describe('眼下該做的事', () => {
  const now = {
    grainDays: 30, gold: 100, grainPrice: 34, hour: 10,
    lodging: 'rented' as const, hasQuest: true, questCleared: false,
    followers: 1, toil: 0, wounded: 0,
  };

  it('沒事可提醒的時候就不出現 —— 不占著畫面', () => {
    expect(whatNow(now)).toBeNull();
  });

  it('最要命的事排在最前面', () => {
    // 斷糧壓過一切
    const starving = whatNow({ ...now, grainDays: 0, questCleared: true });
    expect(starving?.urgent).toBe(true);
    expect(starving?.text).toContain('斷糧');
  });

  it('沒錢的時候叫你去做工,有錢的時候叫你去糴米', () => {
    expect(whatNow({ ...now, grainDays: 0, gold: 0 })?.text).toContain('做活');
    expect(whatNow({ ...now, grainDays: 0, gold: 100 })?.text).toContain('糴米');
  });

  it('天黑了沒地方睡是要緊事', () => {
    const night = whatNow({ ...now, hour: 21, lodging: 'none' });
    expect(night?.urgent).toBe(true);
  });

  it('沒活幹的時候,提示會照你有沒有人手換說法', () => {
    expect(whatNow({ ...now, hasQuest: false, followers: 0 })?.text).toContain('跟你走');
    expect(whatNow({ ...now, hasQuest: false, followers: 3 })?.text).toContain('要辦');
  });
});

describe('推掉的收場不再問第二次', () => {
  it('好下場可以推掉,推掉以後就不再跳出來', () => {
    useEnding.getState().reset();
    const life: Life = {
      kind: 'rooted', days: 200, merit: 10, renown: 5, gold: 500,
      lodging: 'owned', companions: [], lost: [], sworn: [], swornLost: [],
      bandsCleared: 0, errandsDone: 2,
    };
    useEnding.getState().end(life);
    expect(useEnding.getState().life).not.toBeNull();
    useEnding.getState().decline('rooted');
    expect(useEnding.getState().life).toBeNull();
    // 條件還是成立,但不該再跳
    useEnding.getState().end(life);
    expect(useEnding.getState().life).toBeNull();
    useEnding.getState().reset();
  });

  it('敗亡沒得推', () => {
    expect(isFatal('starved')).toBe(true);
    expect(isFatal('sick')).toBe(true);
    expect(isFatal('rooted')).toBe(false);
  });
});

describe('社日', () => {
  it('春秋各一天,前後對得上曆法', async () => {
    const { festivalOn, daysToFestival, DAYS_PER_SEASON, DAYS_PER_YEAR } = await import('./calendar');
    expect(festivalOn(14)).toBe('春社');
    expect(festivalOn(DAYS_PER_SEASON * 2 + 14)).toBe('秋社');
    expect(festivalOn(15)).toBeNull();
    expect(festivalOn(14 + DAYS_PER_YEAR)).toBe('春社');
    // 倒數要能對上
    expect(daysToFestival(11)).toBe(3);
  });

  it('擂台三場由弱到強,跟著你的人不上台', async () => {
    const { contenders } = await import('./fair');
    const { might } = await import('./npcs');
    const list = contenders([]);
    expect(list).toHaveLength(3);
    expect(might(list[0])).toBeLessThanOrEqual(might(list[1]));
    expect(might(list[1])).toBeLessThanOrEqual(might(list[2]));
    // 把最強那個帶走,他就不在台上了
    const without = contenders([list[2].id]);
    expect(without.some((p) => p.id === list[2].id)).toBe(false);
  });

  it('三勝封擂,一敗出局', async () => {
    const { useFair } = await import('./fair');
    const f = useFair.getState();
    f.reset();
    f.advance(); f.advance();
    expect(useFair.getState().champion).toBe(false);
    f.advance();
    expect(useFair.getState().champion).toBe(true);
    f.reset();
    f.advance(); f.fall();
    expect(useFair.getState().out).toBe(true);
    expect(useFair.getState().champion).toBe(false);
    f.reset();
  });
});
