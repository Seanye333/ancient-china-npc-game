import { describe, it, expect, beforeEach } from 'vitest';
import {
  convoy, useConvoy, startConvoy, endConvoy, cargoWorth, lossPenalty,
  CART_SPEED, CART_LEASH, DELIVER_AT,
} from './convoy';

/**
 * 押貨 —— 「你不是去辦一件事,你是被一輛車綁住半天」。
 *
 * 這幾條測試盯的是那句話在數字上成不成立:車真的比人慢、繩子真的短到
 * 讓你不能先跑去探路、賠不出來的時候真的是欠著而不是扣到零。
 */

beforeEach(() => { convoy.car = null; });

describe('那輛車', () => {
  it('起了車就有車,收了就沒有 —— 而且兩次都要通知畫面', () => {
    const v0 = useConvoy.getState().version;
    startConvoy({ x: 1, y: 2, z: 3 }, 40, [[10, 0], [20, 0]]);
    expect(convoy.car).not.toBeNull();
    expect(convoy.car!.state).toBe('moving');
    expect(convoy.car!.worth).toBe(40);
    // 位置不進 store,可「有沒有車」要能觸發重繪 —— 版本號就是那個開關
    expect(useConvoy.getState().version).toBeGreaterThan(v0);

    const v1 = useConvoy.getState().version;
    endConvoy();
    expect(convoy.car).toBeNull();
    expect(useConvoy.getState().version).toBeGreaterThan(v1);
  });

  it('車自己認得路 —— 起車的時候就把整條路交給它', () => {
    const route: Array<[number, number]> = [[10, 0], [30, 12], [60, 30]];
    startConvoy({ x: 0, y: 0, z: 0 }, 10, route);
    expect(convoy.car!.route).toEqual(route);
    // 第一版讓車追著玩家跑,玩家一卡住車也停死 —— 而且趕車的本來就比你熟路
    expect(convoy.car!.lastD).toBe(Infinity);
    expect(convoy.car!.stuck).toBe(0);
  });
});

describe('被綁住的那半天', () => {
  it('車比人慢 —— 這一截就是押貨的全部感覺', () => {
    // 走路 2.6、跑 4.2(見 Player.tsx)。車要明顯慢過走路,不然這件差事沒有重量
    expect(CART_SPEED).toBeLessThan(2.6 * 0.7);
  });

  it('繩子短到不能先跑去探路,又長到不必貼著車走', () => {
    expect(CART_LEASH).toBeGreaterThan(DELIVER_AT * 0.8);   // 比交貨距離大,不然一到就斷線
    expect(CART_LEASH).toBeLessThan(30);                    // 三十步就等於沒有繩子
  });
});

describe('賠貨', () => {
  it('貨比工錢值錢 —— 丟了才會心疼', () => {
    expect(cargoWorth(20)).toBeGreaterThan(20);
    // 而且是成比例的:接越大的活,擔越大的風險
    expect(cargoWorth(100)).toBeGreaterThan(cargoWorth(20) * 4);
  });

  it('賠得起就賠錢,鄉望只掉一點', () => {
    const r = lossPenalty(50, 200);
    expect(r.paid).toBe(50);
    expect(r.renown).toBe(-3);
    expect(r.line).toContain('50');
  });

  it('<b>賠不起就欠著</b> —— 而不是把錢扣到零就算了', () => {
    const r = lossPenalty(200, 30);
    expect(r.paid).toBe(30);                       // 有多少賠多少
    // 代價轉到名聲上:一個押丟了貨的人,在鄉里就是那個押丟了貨的人
    expect(r.renown).toBeLessThan(-10);
    expect(r.line).toContain('賠不出來');
  });

  it('賠不起永遠比賠得起難看 —— 兩條路不能倒過來', () => {
    for (const worth of [10, 60, 300]) {
      const rich = lossPenalty(worth, worth + 1);
      const poor = lossPenalty(worth, 0);
      expect(poor.renown).toBeLessThan(rich.renown);
      expect(poor.paid).toBeLessThanOrEqual(rich.paid);
    }
  });
});
