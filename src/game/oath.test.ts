import { describe, it, expect, beforeEach } from 'vitest';
import {
  useOath, isSworn, canSwear, payrollCount, mayLeave, pickShield, heroIsElder,
  OATH_MAX, OATH_FAVOR, OATH_GOLD, OATH_GRAIN,
} from './oath';
import { beginBattle, stepBattle, battleOver, useBattle, fx, type BattleTally } from './combat';
import { makeVillagers } from './npcs';
import { WEAPONS } from './weapons';

/**
 * 義結金蘭。
 *
 * 這個世界裡的每個人都是雇來的:吃你的糧、按旬領月錢,你名聲爛了他就走。
 * 結義是唯一一條<b>帳本管不到</b>的關係,而它值不值錢全看三件事:
 * 不領月錢、不會走、替你擋那一刀。三件事各釘一條。
 */

const villagers = makeVillagers(38);
const warm = villagers.find((v) => v.temper === 'warm')!;
const timid = villagers.find((v) => v.temper === 'timid')!;

const rich = { favor: OATH_FAVOR, joined: true, count: 0, gold: OATH_GOLD, grain: OATH_GRAIN };

describe('結義的門檻', () => {
  beforeEach(() => useOath.getState().reset());

  it('沒一起走過路的人談不上生死', () => {
    expect(canSwear({ npc: warm, ...rich, joined: false }).why).toContain('走過路');
  });

  it('交情不夠、酒錢不夠,都要說得出為什麼', () => {
    expect(canSwear({ npc: warm, ...rich, favor: OATH_FAVOR - 1 }).why).toContain('交情');
    expect(canSwear({ npc: warm, ...rich, gold: OATH_GOLD - 1 }).why).toContain('擺一桌');
    expect(canSwear({ npc: warm, ...rich, grain: 0 }).why).toContain('擺一桌');
  });

  it('怕事的擔不起這種事', () => {
    expect(canSwear({ npc: timid, ...rich }).ok).toBe(false);
  });

  it('最多兩個 —— 桃園那一回也只有三個人', () => {
    expect(canSwear({ npc: warm, ...rich }).ok).toBe(true);
    expect(canSwear({ npc: warm, ...rich, count: OATH_MAX }).ok).toBe(false);
  });

  it('結過就不能再結一次,而且記得住是哪一天', () => {
    useOath.getState().swear(warm.id, 42);
    useOath.getState().swear(warm.id, 99);
    expect(useOath.getState().sworn).toEqual([warm.id]);
    expect(useOath.getState().swornOn[warm.id]).toBe(42);
    expect(canSwear({ npc: warm, ...rich }).why).toContain('已經是兄弟');
  });

  it('年齒排兄弟 —— 一樣大就算你長,總得有個說法', () => {
    expect(heroIsElder(30, 24)).toBe(true);
    expect(heroIsElder(24, 30)).toBe(false);
    expect(heroIsElder(27, 27)).toBe(true);
  });
});

describe('帳本管不到的那部分', () => {
  beforeEach(() => useOath.getState().reset());

  it('義兄弟不領月錢', () => {
    const men = ['v1', 'v2', 'v3'];
    expect(payrollCount(men, 4)).toBe(7);
    useOath.getState().swear('v2', 0);
    expect(payrollCount(men, 4)).toBe(6);
    // 鄉勇沒有名字,結不了義 —— 它們一個都不能被折抵掉
    useOath.getState().swear('v9', 0);
    expect(payrollCount(men, 4)).toBe(6);
  });

  it('義兄弟不會走', () => {
    expect(mayLeave('v1')).toBe(true);
    useOath.getState().swear('v1', 0);
    expect(mayLeave('v1')).toBe(false);
    expect(isSworn('v1')).toBe(true);
  });

  it('死了就從隨行名單除名,但名字留在生平裡', () => {
    useOath.getState().swear('v1', 7);
    useOath.getState().mourn('v1');
    expect(useOath.getState().sworn).toEqual([]);
    expect(useOath.getState().fallen).toEqual(['v1']);
    expect(useOath.getState().swornOn['v1'], '結義那天要留著').toBe(7);
    // 悼過一次就夠 —— 重複呼叫不該讓同一個名字出現兩遍
    useOath.getState().mourn('v1');
    expect(useOath.getState().fallen).toEqual(['v1']);
  });

  it('擋刀挑血最多的那個 —— 快倒的人頂上去是浪費不是義氣', () => {
    expect(pickShield([{ hp: 12 }, { hp: 44 }, { hp: 30 }])).toEqual({ hp: 44 });
    expect(pickShield([])).toBeNull();
  });
});

/* ── 空跑:那一刀真的救得了你嗎 ────────────────────── */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const flat = () => 0;
const nowhere = (_x: number, _z: number, nx: number, nz: number) => ({ x: nx, z: nz });

/** 帶一個同伴打一窩,同伴是義兄弟還是雇工 —— 只差這一個旗子。 */
let FIERCE = 0.4, COUNT = 2;
function fight(sworn: boolean, seed: number): BattleTally | null {
  beginBattle({
    ours: [
      { id: 'you', name: 'me', war: 58, isPlayer: true, driven: false,
        weapon: WEAPONS.blade },
      { id: 'mate', npcId: 'v1', name: '同行', war: 46, sworn },
    ],
    band: { id: 'b', x: 0, z: 9, fierce: FIERCE, count: COUNT },
    at: { x: 0, z: 0 }, ground: flat, rng: seeded(seed),
  });
  let over: BattleTally | null = null;
  for (let i = 0; i < 9000 && !over; i++) { stepBattle(1 / 30, flat, nowhere); over = battleOver(); }
  useBattle.getState().clear();
  return over;
}

describe('他替你擋的那一刀', () => {
  beforeEach(() => useOath.getState().reset());

  /**
   * 這一條是整個系統的意思:誓言值錢,恰恰在它讓他付出一切的那一刻。
   * 所以要同時成立兩件事 —— 你被撈回來了,而<b>他倒下了</b>。
   */
  it('空跑:義兄弟把主角從倒地裡撈回來,代價是他自己', () => {
    let plainDown = 0, swornDown = 0, shields = 0, guardFell = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      if (fight(false, 700 + i * 3319)?.playerDown) plainDown++;
    }
    for (let i = 0; i < N; i++) {
      const t = fight(true, 700 + i * 3319);
      if (t?.playerDown) swornDown++;
      if (fx.shielded) {
        shields++;
        // 擋了刀的人一定沒回來 —— 沒有這一條,它就只是一層免費的護甲
        if (t?.fell.includes('v1')) guardFell++;
      }
    }
    const word = `雇工 ${plainDown}/${N} 倒地 → 義弟 ${swornDown}/${N};`
      + `擋刀 ${shields} 次,擋的人全倒 ${guardFell}`;
    // 擋一次要死一個結義兄弟,而你一輩子只結得了兩個 —— 撈得回來才對得起這個價

    expect(shields, word).toBeGreaterThan(0);
    expect(swornDown, word).toBeLessThan(plainDown);
    expect(guardFell, word).toBe(shields);
  });

  it('一場只擋一次 —— 擋成護甲它就從一個時刻變成一個數值', () => {
    // 開一場新的,fx.shielded 要被清掉,不然上一場的名字會漏到這一場
    fight(true, 4242);
    beginBattle({
      ours: [{ id: 'you', name: 'me', war: 58, isPlayer: true, driven: false }],
      band: { id: 'b', x: 0, z: 9, fierce: 0.3, count: 1 },
      at: { x: 0, z: 0 }, ground: flat, rng: seeded(1),
    });
    expect(fx.shielded).toBeNull();
    useBattle.getState().clear();
  });
});
