import { describe, it, expect, beforeEach } from 'vitest';
import {
  beginBattle, stepBattle, fighters, alive, impacts, corpses, stains,
  guardTally, ageBattlefield, CORPSE_DAYS,
} from './combat';
import { WEAPONS } from './weapons';

/** 空跑一場到收場為止。ground 給平地 —— 這裡驗的不是地形。 */
function fight(seed = 1, count = 4, day = 10) {
  // 32 位以內的乘同餘 —— 1103515245 那組會超出 double 的整數精度,
  // 算出來的「亂數」其實是一串垃圾(而且可能收斂到定點)
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  beginBattle({
    ours: [
      { id: 'you', name: '你', war: 55, isPlayer: true, weapon: WEAPONS.club },
      { id: 'mate-a', npcId: 'a', name: '甲', war: 45 },
      { id: 'mate-b', npcId: 'b', name: '乙', war: 45 },
    ],
    band: { id: 'b', x: 6, z: 0, fierce: 0.5, count },
    at: { x: 0, z: 0 }, ground: () => 0, leadership: 40, day, rng: rand,
  });
  // 玩家不由人推,空跑要他自己動
  const me = fighters.find((f) => f.isPlayer);
  if (me) me.driven = false;
  /*
   * 位移的樁子要<b>真的讓人走到目標</b>。
   *
   * 第一版寫成 `(x, z) => ({ x, z })` —— 回傳原地。於是所有人一步都沒動、
   * 一刀都沒揮,二十五秒之後「僵局」規則發作,整場架不戰而散:
   * guardTally 三個零、屍首零。看起來像新功能沒接上,其實是測試的樁子寫錯了。
   * (combat.balance.test.ts 的 nowhere 是對的:回傳目標點。)
   */
  const walk = (x: number, z: number, nx: number, nz: number) => {
    void x; void z; return { x: nx, z: nz };
  };
  for (let i = 0; i < 4000; i++) {
    stepBattle(0.05, () => 0, walk);
    const up = (side: string) => fighters.some((f) => f.side === side && alive(f));
    if (!up('you') || !up('foe')) break;
  }
}

beforeEach(() => {
  corpses.length = 0;
  stains.length = 0;
});

describe('擋、閃、中', () => {
  it('一場架裡三種都會發生', () => {
    fight(7);
    expect(guardTally.hits).toBeGreaterThan(0);
    expect(guardTally.parries).toBeGreaterThan(0);
    expect(guardTally.dodges).toBeGreaterThan(0);
  });

  it('命中率沒有被改動 —— 中的佔全部出手的四到六成', () => {
    /*
     * 這一條是<b>防止手滑</b>的:擋/閃只是把「沒中」分成兩種樣子,
     * 一分數值都不該動。命中率的算式從 0.44 起跳,加上武力差、
     * 圍毆、背刺、長短兵,平均落在五成上下。真的動到數值的話,
     * 這裡會先紅,而不是等到平衡鎖(那邊只看最後的勝率,遲鈍得多)。
     */
    fight(11, 5);
    const total = guardTally.hits + guardTally.parries + guardTally.dodges;
    expect(total).toBeGreaterThan(30);
    const rate = guardTally.hits / total;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.68);
  });

  it('打中留血、架開冒火星', () => {
    fight(3);
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts.some((i) => i.kind === 'blood')).toBe(true);
    expect(impacts.some((i) => i.kind === 'spark')).toBe(true);
    // 火花與血都要有方向 —— 沒有方向就只能原地開花
    for (const i of impacts) expect(Math.hypot(i.dx, i.dz)).toBeCloseTo(1, 3);
  });

  it('一場架的特效不會無限長', () => {
    fight(5, 8);
    expect(impacts.length).toBeLessThanOrEqual(40);
  });
});

describe('屍首與血漬', () => {
  it('有人倒下就留一具,記著是哪一天', () => {
    fight(9, 4, 12);
    expect(corpses.length).toBeGreaterThan(0);
    for (const c of corpses) expect(c.day).toBe(12);
    expect(stains.length).toBe(corpses.length);
  });

  it('倒下幾個就有幾具 —— 不多不少', () => {
    fight(21, 5, 3);
    const down = fighters.filter((f) => f.stance === 'down').length;
    expect(corpses.length).toBe(down);
  });

  it('過幾天收走,而血漬留得久一點', () => {
    fight(9, 4, 12);
    const had = corpses.length;
    expect(had).toBeGreaterThan(0);
    ageBattlefield(12 + CORPSE_DAYS - 1);
    expect(corpses.length).toBe(had);
    ageBattlefield(12 + CORPSE_DAYS);
    expect(corpses.length).toBe(0);
    expect(stains.length).toBe(had);       // 血還在
    ageBattlefield(12 + CORPSE_DAYS * 2);
    expect(stains.length).toBe(0);
  });

  it('下一場不會把上一場的屍首清掉 —— 清了就等於沒留過', () => {
    fight(9, 3, 5);
    const first = corpses.length;
    expect(first).toBeGreaterThan(0);
    fight(13, 3, 5);
    expect(corpses.length).toBeGreaterThan(first);
  });
});
