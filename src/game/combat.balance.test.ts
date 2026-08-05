import { describe, it, expect } from 'vitest';
import {
  beginBattle, stepBattle, battleOver, fighters, alive, useBattle,
  type BattleTally,
} from './combat';

/**
 * 打架的手感沒法用眼睛調 —— 一場架在畫面上過去只有幾秒,
 * 你看不出「那是因為傷害太高還是因為士氣太脆」。
 *
 * 所以把 combat.ts 拿出來空跑一千場:這個檔<b>不驗對錯,驗手感</b>——
 * 一場架該打多久、幾個打幾個該有幾成勝率、輸的時候是不是真的輸得掉。
 * 第一版就是靠這個抓到「四打六在四秒內全滅、對方一個沒倒」。
 */

/** 決定論亂數,好讓同一組參數每次跑出同一個結論。 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const flat = (x: number, z: number) => { void x; void z; return 0; };
const nowhere = (x: number, z: number, nx: number, nz: number) => { void x; void z; return { x: nx, z: nz }; };

interface Outcome { tally: BattleTally; seconds: number }

/** 空跑一場:玩家交給 AI 打(和同伴同一套),看結果。 */
function sim(ourWar: number[], foes: number, fierce: number, seed: number): Outcome {
  beginBattle({
    ours: ourWar.map((war, i) => ({ id: `u${i}`, name: `u${i}`, war })),
    band: { id: 'b', x: 0, z: 12, fierce, count: foes },
    at: { x: 0, z: 0 },
    ground: flat,
    rng: seeded(seed),
  });
  let t = 0;
  let over: BattleTally | null = null;
  while (!over && t < 180) {
    stepBattle(1 / 30, flat, nowhere);
    t += 1 / 30;
    over = battleOver();
  }
  useBattle.getState().clear();
  const nothing: BattleTally = {
    won: false, fell: [], scattered: [], foesDown: 0, foesFled: 0, playerDown: false,
  };
  return { tally: over ?? nothing, seconds: t };
}

function runs(n: number, ourWar: number[], foes: number, fierce = 0.45) {
  const out: Outcome[] = [];
  for (let i = 0; i < n; i++) out.push(sim(ourWar, foes, fierce, 1000 + i * 7919));
  return {
    winRate: out.filter((o) => o.tally.won).length / n,
    medianSeconds: out.map((o) => o.seconds).sort((a, b) => a - b)[Math.floor(n / 2)],
    avgFoesDown: out.reduce((a, o) => a + o.tally.foesDown, 0) / n,
    avgFled: out.reduce((a, o) => a + o.tally.foesFled, 0) / n,
  };
}

describe('打起來該是什麼節奏', () => {
  it('單挑不是兩刀的事 —— 一對一要打上十來秒', () => {
    const r = runs(60, [52], 1);
    expect(r.medianSeconds).toBeGreaterThan(6);
    expect(r.medianSeconds).toBeLessThan(34);
  });

  it('人數是這條線的兌現點:一個打三個沒戲,三個打三個有得打', () => {
    const alone = runs(80, [52], 3);
    const even = runs(80, [52, 48, 48], 3);
    expect(alone.winRate).toBeLessThan(0.25);
    expect(even.winRate).toBeGreaterThan(alone.winRate + 0.3);
  });

  it('賊不是被砍到最後一個 —— 打贏多半是把他們打散', () => {
    // 要量「對面潰不潰」就得挑一場打得贏的架:第一版拿四打六來量,
    // 那場我們自己先全滅了,量到的當然是零 —— 測試問錯了問題。
    const r = runs(80, [58, 52, 50, 46], 4, 0.3);
    expect(r.winRate).toBeGreaterThan(0.5);
    expect(r.avgFled).toBeGreaterThan(0.5);
  });

  it('沒指望的時候人會自己跑,不會站著被砍完', () => {
    // 一個人打六個:結局是輸,但輸法該是「跑了」,不是「屍體堆在那」
    let ranAway = 0;
    for (let i = 0; i < 40; i++) {
      const o = sim([46], 6, 0.5, 500 + i * 3301);
      if (!o.tally.won && o.tally.fell.length === 0) ranAway++;
    }
    expect(ranAway).toBeGreaterThan(20);
  });

  it('打贏也要留下代價 —— 對面不會一個沒倒就散', () => {
    const r = runs(80, [58, 52, 50], 3);
    expect(r.avgFoesDown).toBeGreaterThan(0.8);
  });

  it('一場混戰不該在五秒內結束', () => {
    const r = runs(60, [58, 52, 50, 46], 6);
    expect(r.medianSeconds).toBeGreaterThan(8);
  });
});

describe('收場的帳要對得上', () => {
  it('沒回來的人要按 npcId 記名 —— 「折了兩人」不是一件事,「王安沒回來」才是', () => {
    // 不假設某一場一定死人:輸的方式有兩種(倒下、嚇跑),
    // 這裡驗的是<b>帳記在誰頭上</b>,不是驗誰一定會死。
    const ids = ['v7', 'v8'];
    let sawCasualty = 0;
    for (let i = 0; i < 60; i++) {
      beginBattle({
        ours: ids.map((npcId, k) => ({ id: `u${k}`, name: '王安', npcId, war: 22 })),
        band: { id: 'b', x: 0, z: 4, fierce: 0.9, count: 4 },
        at: { x: 0, z: 0 }, ground: flat, rng: seeded(3 + i * 977),
      });
      let over: BattleTally | null = null;
      for (let k = 0; k < 4000 && !over; k++) {
        stepBattle(1 / 30, flat, nowhere);
        over = battleOver();
      }
      expect(over).not.toBeNull();
      expect(over!.won).toBe(false);
      for (const id of [...over!.fell, ...over!.scattered]) expect(ids).toContain(id);
      if (over!.fell.length) sawCasualty++;
      useBattle.getState().clear();
    }
    // 打不過的仗總會有人真的倒下,不會每次都全身而退
    expect(sawCasualty).toBeGreaterThan(5);
  });

  it('全滅或全跑,場上不會剩下站著的人卻說打完了', () => {
    beginBattle({
      ours: [{ id: 'u0', name: 'a', war: 70 }, { id: 'u1', name: 'b', war: 66 }],
      band: { id: 'b', x: 0, z: 6, fierce: 0.2, count: 2 },
      at: { x: 0, z: 0 }, ground: flat, rng: seeded(11),
    });
    let over: BattleTally | null = null;
    for (let i = 0; i < 3000 && !over; i++) {
      stepBattle(1 / 30, flat, nowhere);
      over = battleOver();
    }
    expect(over).not.toBeNull();
    const oursUp = fighters.filter((f) => f.side === 'you' && alive(f)).length;
    const foesUp = fighters.filter((f) => f.side === 'foe' && alive(f)).length;
    expect(oursUp === 0 || foesUp === 0).toBe(true);
    useBattle.getState().clear();
  });
});
