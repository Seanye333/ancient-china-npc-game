import { describe, it, expect } from 'vitest';
import { beforeAll } from 'vitest';
import { findPath, navOpen, navStats, invalidateNav } from './nav';
import { meanderAt, MARKET, BRIDGE } from './sites';
import { walkable, registerDecks, registerBlockers, clearBlockers, steerMove } from './field';

/**
 * 橋的板子是 Settlement 掛載時才登記的,測試裡沒有 React,
 * 所以要自己擺一座 —— 不擺的話這張圖上根本沒有橋,
 * 而「過得了河」那一條就會以一種很有說服力的方式失敗。
 */
beforeAll(() => {
  // 用 Settlement 裡那座橋的真實尺寸:橫跨河面 24.8 步,而板子只有 3 步寬。
  // 「只有三步寬」正是這條測試存在的理由 —— 見 nav.ts 裡取樣那一段
  registerDecks('test-bridge', [{
    x0: BRIDGE.x - 12.4, x1: BRIDGE.x + 12.4,
    z0: BRIDGE.z - 1.5, z1: BRIDGE.z + 1.5,
    y: BRIDGE.y,
  }]);
  invalidateNav();
});

/**
 * 尋路。守的是一件事:<b>過得了河</b>。
 *
 * 這條谷中間橫著一條河,只有一座橋。直線走法會把人帶到岸邊左右試探,
 * 而橋就在下游 —— 這正是「賊在河對岸,你追不到」那個 bug 的形狀。
 */

describe('走得到嗎', () => {
  it('這張圖有一半以上的地方站得住 —— 全是牆的話是格子畫錯了', () => {
    const s = navStats();
    console.log('  導航圖:', s.cells, '格 ·', s.open, '格可走 · 一格', s.cell, '步');
    expect(s.open / s.cells).toBeGreaterThan(0.3);
    expect(s.open / s.cells).toBeLessThan(0.98);
  });

  it('村子裡兩點之間走得通', () => {
    const path = findPath(MARKET[0], MARKET[1], MARKET[0] + 30, MARKET[1] + 20);
    expect(path).not.toBeNull();
  });

  /**
   * 這一條就是那個 bug:河東走到河西。
   * 直線走法在這裡會卡在岸邊,A* 該找到橋。
   */
  /**
   * 這一條就是那個 bug:河東走到河西。
   *
   * 起點刻意挑在<b>離橋很遠的地方</b>(z = -40,橋在 z = 6)——
   * 在橋那一排對走,路是一條直線,簡化完只剩一個航點,什麼都驗不到。
   * 要繞遠路,才看得出它真的知道橋在哪裡。
   */
  it('過得了河 —— 而且會為了橋繞一段遠路', () => {
    const z = -40;
    const east = meanderAt(z) + 40;
    const west = meanderAt(z) - 40;
    const path = findPath(east, z, west, z);
    expect(path, '河東到河西找不到路').not.toBeNull();

    // 直線過去是不通的 —— 所以這條路一定是繞出來的
    const midX = (east + west) / 2;
    expect(walkable(midX, z), '河中間居然走得過去,那這條測試沒有意義').toBe(false);

    // 路上必定north到橋那一帶再折回來
    const nearBridge = path!.some(([, pz]) => Math.abs(pz - BRIDGE.z) < 8);
    expect(nearBridge, '沒有繞到橋那一帶 —— 那是穿水過去的').toBe(true);
    expect(path!.length, '一條繞路不該只有一兩個轉折').toBeGreaterThan(2);
  });

  it('每一個航點都站得住', () => {
    const path = findPath(MARKET[0], MARKET[1], meanderAt(-40) - 30, -40);
    expect(path).not.toBeNull();
    for (const [x, z] of path!) {
      expect(navOpen(x, z), `航點 ${Math.round(x)},${Math.round(z)} 站不住`).toBe(true);
    }
  });

  it('目標落在水裡或牆裡時,退到最近站得住的地方 —— 不是直接放棄', () => {
    const z = 0;
    const inRiver = meanderAt(z);
    expect(walkable(inRiver, z)).toBe(false);
    const path = findPath(MARKET[0], MARKET[1], inRiver, z);
    expect(path, '目標在水裡就整個放棄,玩家會以為是遊戲壞了').not.toBeNull();
  });

  it('走不到的地方要老實回 null,不要繞地球一圈', () => {
    // 圖外面
    expect(findPath(MARKET[0], MARKET[1], 9999, 9999)).toBeNull();
  });
});

describe('走位不會把人永遠釘住', () => {
  /**
   * steerMove 先前<b>唯一沒有出路的狀態</b>:所有方向都不可走,於是原地不動;
   * 下一幀還是所有方向都不可走。人永遠釘在那棵樹上,而重算幾次路都沒有用 ——
   * 問題不在路,在腳。
   */
  it('被幾棵樹圍在口袋裡的時候,也擠得出去', () => {
    // 腳下這一點可走,四周一圈都是樹 —— 這才是真正卡死人的形狀,
    // 而不是「站在樹幹正中央」
    // 擺在村邊的乾地上 —— 第一版擺在世界原點,而原點正好在河裡,
    // 於是四周本來就沒有一處站得住,測到的是「河」不是「口袋」
    const [ox, oz] = [MARKET[0] + 24, MARKET[1] + 24];
    const ring = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ring.push({
        x: ox + Math.sin(a) * 1.1, z: oz + Math.cos(a) * 1.1,
        solid: 0.8, view: 0.8, top: 4,
      });
    }
    registerBlockers('test-pocket', ring);
    let p = { x: ox, z: oz };
    let moved = 0;
    let frozen = 0;
    for (let i = 0; i < 60; i++) {
      const got = steerMove(p.x, p.z, 1, 0, 0.04);
      const d = Math.hypot(got.x - p.x, got.z - p.z);
      moved += d;
      if (d < 1e-6) frozen++;
      p = { x: got.x, z: got.z };
    }
    /*
     * 驗的是<b>沒有被凍住</b>,不是「跑得多遠」。
     * 這裡一直叫他往東走,而東邊就是那圈樹 —— 他當然會被擠出去又走回來。
     * 真實情況下是上層重算路線把他帶開;走位函式的責任只有一條:
     * 任何一幀都要能動。一動不動才是那個永遠好不了的狀態。
     */
    expect(frozen, `六十幀裡有 ${frozen} 幀完全動不了`).toBe(0);
    expect(moved).toBeGreaterThan(1);
    clearBlockers('test-pocket');
  });

  it('陷在障礙裡的時候,會把自己推出來', () => {
    registerBlockers('test-stuck', [{
      x: MARKET[0] + 24, z: MARKET[1] + 24, solid: 3, view: 3, top: 5,
    }]);
    // 正好站在圓心 —— 四面八方都是這個障礙
    let p = { x: MARKET[0] + 24.1, z: MARKET[1] + 24.1 };
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const got = steerMove(p.x, p.z, 1, 0, 0.2);
      moved += Math.hypot(got.x - p.x, got.z - p.z);
      p = { x: got.x, z: got.z };
    }
    expect(moved, '四十幀下來一動都沒動 —— 那就是被釘住了').toBeGreaterThan(1);
    expect(Math.hypot(p.x - MARKET[0] - 24, p.z - MARKET[1] - 24), '沒有離開障礙的中心')
      .toBeGreaterThan(1);
    clearBlockers('test-stuck');
  });
});
