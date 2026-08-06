import { describe, it, expect } from 'vitest';
import { beginBattle, stepBattle, battleOver, useBattle, type BattleTally } from './combat';
import { chiefAccepts } from './bands';
import { WEAPONS } from './weapons';

/**
 * 叫陣 —— 這件事的價值全在<b>它是一場賭博</b>。
 *
 * 打贏賊首整窩就散(走既有的 rout 那條路),所以它必須真的險:
 * 穩贏就沒人再帶人手去端窩了,穩輸就沒人會按那個鈕。
 * 這個檔釘住兩件事:誰肯出來,以及出來以後的勝負大概什麼樣。
 */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const flat = () => 0;
const nowhere = (_x: number, _z: number, nx: number, nz: number) => ({ x: nx, z: nz });

/** 一對一:你(帶刀)對上那一夥的頭子。 */
function duelChief(fierce: number, seed: number, myWar = 58): boolean {
  beginBattle({
    ours: [{
      id: 'you', name: 'me', war: myWar, isPlayer: true, driven: false,
      weapon: WEAPONS.blade,
    }],
    band: { id: 'b', x: 0, z: 8, fierce, count: 1 },
    at: { x: 0, z: 0 }, ground: flat, rng: seeded(seed),
  });
  let over: BattleTally | null = null;
  for (let i = 0; i < 6000 && !over; i++) { stepBattle(1 / 30, flat, nowhere); over = battleOver(); }
  useBattle.getState().clear();
  return !!over?.won;
}

describe('叫陣', () => {
  it('兇的頭子更肯出來 —— 面子是他坐那把交椅的本錢', () => {
    expect(chiefAccepts(0.2)).toBeLessThan(0.5);
    expect(chiefAccepts(0.9)).toBeGreaterThan(0.7);
    // 機率是機率,不能滑出 0..1
    for (const f of [0, 0.5, 1]) {
      expect(chiefAccepts(f)).toBeGreaterThanOrEqual(0);
      expect(chiefAccepts(f)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * 賭博的形狀:對上兇窩的頭子勝負在五五上下 —— 贏了白撿一個窩,
   * 輸了重傷掉錢(帶著傷去更是拿命賭)。太穩或太沒指望都不成立。
   */
  it('對上兇窩的頭子是一場真的賭 —— 不穩贏也不是送死', () => {
    let win = 0;
    const N = 60;
    for (let i = 0; i < N; i++) if (duelChief(0.85, 3000 + i * 7919)) win++;
    expect(win / N, `勝率 ${(win / N * 100).toFixed(0)}%`).toBeGreaterThan(0.2);
    expect(win / N, `勝率 ${(win / N * 100).toFixed(0)}%`).toBeLessThan(0.8);
  });

  it('小股的頭子好對付得多 —— 願不願意出來是另一回事', () => {
    let weak = 0, fierce = 0;
    const N = 50;
    for (let i = 0; i < N; i++) {
      if (duelChief(0.2, 4000 + i * 3301)) weak++;
      if (duelChief(0.9, 4000 + i * 3301)) fierce++;
    }
    expect(weak, `毛賊首 ${weak} vs 兇首 ${fierce}`).toBeGreaterThan(fierce);
  });
});
