import { describe, it, expect, afterEach } from 'vitest';
import {
  places, placeAt, placeById, registerPlace, unregisterPlace, houseOf, lostSpot,
  type Place,
} from './places';
import { houseSites } from '../world/sites';
import { walkable } from '../world/field';

/**
 * 地方 —— 走過去做事的那些點。
 *
 * 這一組盯的是<b>「走得到」和「認得出」</b>兩件事。它們壞掉的樣子都很難看見:
 * 一個場所擺進了別人家的牆裡,你要真的走過去撞牆才知道;
 * 兩個場所疊在一起,靠近的時候永遠只認得出其中一個,另一個從此進不去。
 */

afterEach(() => { unregisterPlace('t-temp'); });

describe('這張表本身', () => {
  it('該有的都在,而且 id 不重複', () => {
    const all = places();
    const ids = all.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['market', 'dock', 'field', 'woods', 'tavern',
      'county-market', 'county-inn', 'county-yamen', 'county-apothecary', 'home']) {
      expect(ids, `少了 ${id}`).toContain(id);
    }
  });

  it('每一處都<b>站得上去</b> —— 擺進牆裡的場所你要撞了牆才知道', () => {
    for (const p of places()) {
      expect(Number.isFinite(p.y), `${p.id} 的高度是 NaN`).toBe(true);
      expect(walkable(p.x, p.z), `${p.id} 站不上去`).toBe(true);
    }
  });

  it('兩處不能疊在一起 —— 疊了就有一處永遠進不去', () => {
    const all = places();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]; const b = all[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        // 圓心至少要在對方的圈外,否則站在中間時較小的那個永遠不是「最近的」
        expect(d, `${a.id} 和 ${b.id} 疊住了`).toBeGreaterThan(Math.max(a.radius, b.radius) * 0.5);
      }
    }
  });

  it('做活的三處各是一種活 —— 三個地方發同一種活等於只有一個', () => {
    const jobs = places().filter((p) => p.kind === 'work').map((p) => p.job);
    expect(new Set(jobs).size).toBe(jobs.length);
  });

  it('藥鋪只有縣城有 —— 家門口買得到,就沒有人會上山採', () => {
    const shops = places().filter((p) => p.kind === 'apothecary');
    expect(shops.length).toBe(1);
    expect(shops[0].id.startsWith('county')).toBe(true);
  });
});

describe('站在哪個地方上', () => {
  it('圈外不算,圈內算 —— 而且認的是<b>最近</b>的那個', () => {
    const m = placeById('market')!;
    expect(placeAt(m.x, m.z)?.id).toBe('market');
    expect(placeAt(m.x + m.radius + 3, m.z)).toBeNull();

    // 兩個圈重疊的時候,站在誰腳下就是誰
    registerPlace({
      id: 't-temp', kind: 'refugees', label: '暫棚', radius: 30,
      x: m.x + 2, z: m.z, y: m.y,
    } as Place);
    expect(placeAt(m.x, m.z)?.id).toBe('market');
    expect(placeAt(m.x + 20, m.z)?.id).toBe('t-temp');
  });

  it('動態擺出來的收得回去 —— 流民走了,那個窩不能還在', () => {
    const m = placeById('market')!;
    registerPlace({
      id: 't-temp', kind: 'refugees', label: '暫棚', radius: 8,
      x: m.x + 200, z: m.z, y: 0,
    } as Place);
    expect(placeById('t-temp')).toBeTruthy();
    expect(placeAt(m.x + 200, m.z)?.id).toBe('t-temp');
    unregisterPlace('t-temp');
    expect(placeById('t-temp')).toBeUndefined();
    expect(placeAt(m.x + 200, m.z)).toBeNull();
  });
});

describe('誰住哪一棟', () => {
  it('和 Crowd 分房子的規矩必須對上 —— 對不上你就端著藥站在別人家門口', () => {
    const houses = houseSites();
    for (const i of [0, 1, 7, 37]) {
      const h = houseOf(`v${i}`);
      expect(h).not.toBeNull();
      expect(h!.x).toBe(houses[i % houses.length].x);
      expect(h!.door).toEqual(houses[i % houses.length].door);
    }
  });

  it('不是村民的 id 就回 null,不要瞎猜一棟', () => {
    expect(houseOf('mate-x')).toBeNull();
    expect(houseOf('')).toBeNull();
  });
});

describe('走丟的人在哪', () => {
  it('<b>同一件差事永遠在同一個地方</b> —— 問兩次得到同一個方位才可信', () => {
    for (const id of ['er-1', 'er-abc', '差事-7']) {
      expect(lostSpot(id)).toEqual(lostSpot(id));
    }
  });

  it('不同的差事在不同的地方', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const s = lostSpot(`er-${i}`);
      seen.add(`${Math.round(s.x)},${Math.round(s.z)}`);
    }
    expect(seen.size).toBeGreaterThan(18);
  });

  it('丟在走得到的地方 —— 找不到的人不是難度,是 bug', () => {
    for (let i = 0; i < 40; i++) {
      const s = lostSpot(`er-${i}`);
      expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
      expect(Math.hypot(s.x, s.z), '丟到世界外面去了').toBeLessThan(300);
      expect(s.whoId.startsWith('lost-')).toBe(true);
    }
  });
});
