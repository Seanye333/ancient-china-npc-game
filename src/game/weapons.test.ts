import { describe, it, expect } from 'vitest';
import { WEAPONS, ORIGIN_WEAPON } from './weapons';
import { ORIGINS } from './origin';
import {
  beginBattle, beginSpar, stepBattle, battleOver, useBattle, arrowTally,
  type BattleTally,
} from './combat';

/**
 * 兵器與切磋。
 * 兵器的規格:改的是<b>夠得著多遠、砍下去多重</b>,別的一概不碰。
 */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const flat = () => 0;
const nowhere = (x: number, z: number, nx: number, nz: number) => { void x; void z; return { x: nx, z: nz }; };

function duel(myWeapon: keyof typeof WEAPONS, seed: number): boolean {
  beginBattle({
    ours: [{
      id: 'u0', name: 'me', war: 52, isPlayer: true, driven: false,
      weapon: WEAPONS[myWeapon],
    }],
    band: { id: 'b', x: 0, z: 8, fierce: 0.5, count: 1 },
    at: { x: 0, z: 0 }, ground: flat, rng: seeded(seed),
  });
  let over: BattleTally | null = null;
  for (let i = 0; i < 6000 && !over; i++) { stepBattle(1 / 30, flat, nowhere); over = battleOver(); }
  useBattle.getState().clear();
  return !!over?.won;
}

describe('兵器', () => {
  it('每個出身都拿得出一件(哪怕是拳腳)', () => {
    for (const o of ORIGINS) expect(WEAPONS[ORIGIN_WEAPON[o.id]]).toBeTruthy();
  });

  it('鐵器只有縣城有 —— 村裡買得到的只有木棍', () => {
    const villageGoods = Object.values(WEAPONS).filter((w) => w.price > 0 && !w.countyOnly);
    expect(villageGoods.map((w) => w.id)).toEqual(['club']);
    expect(WEAPONS.blade.countyOnly).toBe(true);
  });

  it('刀比拳腳能打 —— 五十場對五十場,勝率差得出來', () => {
    let blade = 0, fists = 0;
    for (let i = 0; i < 50; i++) {
      if (duel('blade', 100 + i * 7919)) blade++;
      if (duel('fists', 100 + i * 7919)) fists++;
    }
    expect(blade, `刀 ${blade} vs 拳 ${fists}`).toBeGreaterThan(fists + 10);
  });

  it('矛靠得是先夠得到 —— 對上同一個人不輸刀', () => {
    let spear = 0, blade = 0;
    for (let i = 0; i < 50; i++) {
      if (duel('spear', 900 + i * 3301)) spear++;
      if (duel('blade', 900 + i * 3301)) blade++;
    }
    expect(spear, `矛 ${spear} vs 刀 ${blade}`).toBeGreaterThanOrEqual(blade - 6);
  });

  /**
   * 弓是唯一改「打法」的兵器:遠了射、近了只有一根軟棍。
   * 空跑裡 AI 替玩家風箏(退著射),所以量得出「會用的人拿它什麼水準」。
   * 它不該全面壓過刀 —— 貼身要命這個短板必須真的存在,
   * 不然人人買弓,近戰三件全成擺設。
   */
  it('弓真的在射,而且打得過拳腳 —— 但貼了身就是軟的', () => {
    let bow = 0, fists = 0, blade = 0;
    let shot = 0;
    for (let i = 0; i < 50; i++) {
      if (duel('bow', 700 + i * 4409)) bow++;
      if (arrowTally.loosed > 0) shot++;
      if (duel('fists', 700 + i * 4409)) fists++;
      if (duel('blade', 700 + i * 4409)) blade++;
    }
    expect(shot, '五十場裡幾乎每場都該放過箭').toBeGreaterThan(45);
    expect(bow, `弓 ${bow} vs 拳 ${fists}`).toBeGreaterThan(fists + 8);
    // 不許全面壓過刀:高出太多,近戰的短板就是假的
    expect(bow, `弓 ${bow} vs 刀 ${blade}`).toBeLessThanOrEqual(blade + 12);
  });
});

describe('切磋', () => {
  it('點到為止也分得出勝負,而且記得對手是誰', () => {
    beginSpar({
      me: { name: '我', war: 70, weapon: WEAPONS.blade },
      foe: { npcId: 'v7', name: '對手', war: 30 },
      at: { x: 0, z: 0 }, ground: flat,
    });
    expect(useBattle.getState().sparring).toBe(true);
    expect(useBattle.getState().sparWith).toBe('v7');
    let over: BattleTally | null = null;
    for (let i = 0; i < 9000 && !over; i++) { stepBattle(1 / 30, flat, nowhere); over = battleOver(); }
    expect(over).not.toBeNull();
    useBattle.getState().clear();
    expect(useBattle.getState().sparring).toBe(false);
  });
});
