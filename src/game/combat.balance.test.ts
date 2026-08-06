import { describe, it, expect } from 'vitest';
import {
  beginBattle, stepBattle, battleOver, fighters, alive, useBattle,
  type BattleTally,
} from './combat';
import { menNeeded } from './errands';

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

/**
 * 空跑一場:玩家交給 AI 打(和同伴同一套),看結果。
 *
 * `player` 打開時第一個人是主角 —— 血厚一些,而且<b>不會自己逃</b>。
 * 這個開關是後來補的:原本每一場都沒有主角,於是「所有人都撲向衝在最前面
 * 那一個」整組測試都量不到,直到真的走過去打了一場才浮出來。
 */
function sim(
  ourWar: number[], foes: number, fierce: number, seed: number, player = false,
): Outcome {
  beginBattle({
    ours: ourWar.map((war, i) => ({
      id: `u${i}`, name: `u${i}`, war,
      // 主角在場,但這裡沒有真人推他 —— driven: false 讓模擬替他走位與出手。
      // 少了這一句,他就是一尊會挨打不會還手的木頭。
      ...(player && i === 0 ? { isPlayer: true, driven: false } : {}),
    })),
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

function runs(n: number, ourWar: number[], foes: number, fierce = 0.45, player = false) {
  const out: Outcome[] = [];
  for (let i = 0; i < n; i++) out.push(sim(ourWar, foes, fierce, 1000 + i * 7919, player));
  return {
    winRate: out.filter((o) => o.tally.won).length / n,
    medianSeconds: out.map((o) => o.seconds).sort((a, b) => a - b)[Math.floor(n / 2)],
    avgFoesDown: out.reduce((a, o) => a + o.tally.foesDown, 0) / n,
    avgFled: out.reduce((a, o) => a + o.tally.foesFled, 0) / n,
    playerDownRate: out.filter((o) => o.tally.playerDown).length / n,
    scatterRate: out.reduce((a, o) => a + o.tally.scattered.length, 0) / n,
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

  /**
   * 這一條是走過去打了一場才發現要立的。
   *
   * 村民託你去剿「三兩個毛賊」,你帶著兩個人走了六十步過去 ——
   * 結果全隊被兩個賊打散,對面一個沒倒。原因不是數值太硬,是<b>挑對手的規矩</b>:
   * 誰都挑最近的,而衝在最前面的永遠是玩家,於是兩個賊一起壓他一個,
   * 剩下兩個同伴在旁邊白打。玩家一倒,士氣連鎖,全隊就散了。
   *
   * 這一場是整條線的入口。它打不下來,前面的人情、招募、走那六十步全都白搭。
   */
  it('第一件差事打得下來 —— 白身帶兩個村民 vs 兩個毛賊', () => {
    const r = runs(80, [58, 36, 34], 2, 0.55, true);
    expect(r.winRate).toBeGreaterThan(0.6);
    expect(r.playerDownRate).toBeLessThan(0.35);
  });

  /**
   * 差事卡上寫「需人 5」,帶了 5 個就該打得贏 —— 這是這個遊戲對玩家的承諾,
   * 也是這兩個檔案之間唯一的硬約定。所以這條測試<b>直接引用 menNeeded</b>,
   * 而不是自己抄一份數字:抄一份,兩邊就會各自漂移,而漂移的那天畫面上
   * 什麼都看不出來 —— 玩家只會覺得「這遊戲騙我」。
   *
   * 原本的公式(count - 1 + fierce)在五個兇賊那一格說「帶 6 個」,
   * 而帶 6 個的真實勝率是 16%。
   */
  // 這一條要空跑三百場,慢是應該的 —— 機器忙的時候會超過預設的五秒。
  // 調高上限而不是減少場次:場次少了,勝率就抖得沒法當規格用
  it('差事寫的「需人」是真話 —— 帶足了就打得下來', { timeout: 30000 }, () => {
    for (const [count, fierce] of [[2, 0.3], [3, 0.5], [4, 0.6], [5, 0.8], [6, 0.7]] as const) {
      const mates = menNeeded({ count, fierce });
      // 村民不是武人:武力從 38 往下遞減,不是一支精兵
      const ours = [58, ...Array.from({ length: mates }, (_, i) => 38 - i * 2)];
      const r = runs(60, ours, count, fierce, true);
      expect(r.winRate, `${count} 賊(兇 ${fierce})帶 ${mates} 人`).toBeGreaterThan(0.65);
      // 但也不能是白拿的:愈大的一夥,愈該有人回不來
      if (count >= 5) expect(r.scatterRate + r.avgFoesDown).toBeGreaterThan(1);
    }
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

describe('架總會打完', () => {
  /**
   * 僵局。兩邊都還站著,可是誰也打不到誰 —— 最後一個賊縮在柵欄後面,
   * 我方在外頭繞。戰鬥沒有尋路(只有貼著障礙滑),所以這種局面不會自己好,
   * 在畫面上就是一群人站著發呆,而且永遠不結束。
   *
   * 這條測試用「誰都碰不到誰」的極端情形去逼它:所有人都被釘在原地。
   */
  it('誰也打不到誰的時候,這場架會自己散掉', () => {
    beginBattle({
      ours: [{ id: 'u0', name: 'a', war: 50 }, { id: 'u1', name: 'b', war: 50 }],
      band: { id: 'b', x: 0, z: 60, fierce: 0.5, count: 2 },   // 隔得老遠
      at: { x: 0, z: 0 }, ground: flat,
      // 誰都動不了 —— 移動函式把所有人釘回原地
      rng: seeded(4242),
    });
    const frozen = (x: number, z: number) => ({ x, z });
    let over: BattleTally | null = null;
    let t = 0;
    while (!over && t < 200) {
      stepBattle(1 / 30, flat, frozen);
      t += 1 / 30;
      over = battleOver();
    }
    expect(over, `兩百秒還沒打完 —— 這就是那個永遠不結束的局面`).not.toBeNull();
    useBattle.getState().clear();
  });
});

describe('夜襲', () => {
  /**
   * 夜襲的規格:同一夥人,睡著的比醒著的好打<b>一大截</b> ——
   * 差距要大到值得專程等天黑,又不能大到白撿(哨醒著就是硬仗,判定在外面)。
   */
  it('睡著的窩好打一大截', { timeout: 30000 }, () => {
    const N = 60;
    let awake = 0, asleep = 0;
    for (let i = 0; i < N; i++) {
      for (const sleeping of [false, true]) {
        beginBattle({
          ours: [
            { id: 'u0', name: 'me', war: 58, isPlayer: true, driven: false },
            { id: 'u1', name: 'a', war: 38 }, { id: 'u2', name: 'b', war: 36 },
          ],
          band: { id: 'b', x: 0, z: 12, fierce: 0.6, count: 4 },
          at: { x: 0, z: 0 }, ground: flat, rng: seeded(4000 + i * 7919),
          sleeping,
        });
        let over: BattleTally | null = null;
        for (let k = 0; k < 6000 && !over; k++) { stepBattle(1 / 30, flat, nowhere); over = battleOver(); }
        if (over?.won) { if (sleeping) asleep++; else awake++; }
        useBattle.getState().clear();
      }
    }
    expect(asleep, `夜襲 ${asleep}/${N} vs 硬仗 ${awake}/${N}`).toBeGreaterThan(awake + N * 0.2);
  });
});
