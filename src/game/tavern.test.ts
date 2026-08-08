import { describe, it, expect } from 'vitest';
import { newsFrom, hirePrice, canHire, tavernMood, DRINK_TOIL } from './tavern';
import type { Band } from './bands';
import type { VillageState } from './village';
import type { Npc } from './npcs';

/**
 * 酒肆賣的是<b>情報</b>,而情報只有一條規矩:它得是真的。
 *
 * 「假情報比沒有情報更糟:玩家會學會不聽」—— 這句話寫在 tavern.ts 的開頭,
 * 而它在程式上的意思是:<b>那句話裡的每一個名字、每一個方位,
 * 都得從傳進去的世界狀態裡讀出來</b>。所以下面每一條都在原字串裡找具體的東西,
 * 不只是「有回傳一個非空字串」。
 */

const V = (p: Partial<VillageState> = {}): VillageState => ({
  order: 60, harvest: 60, trade: 60, grainPrice: 30, ...p,
} as VillageState);

const band = (p: Partial<Band> = {}): Band => ({
  id: 'b0', name: '黑石岡', x: 40, z: 40, count: 4, fierce: 0.5, routed: false, ...p,
} as Band);

const base = {
  bands: [] as Band[],
  raids: [] as Array<{ name: string; x: number; z: number }>,
  village: V(),
  at: { x: 0, z: 0 },
  sickNames: [] as string[],
};

describe('打聽來的那一句', () => {
  it('過兵的風聲壓過一切 —— 五個錢買的就是那兩天', () => {
    const s = newsFrom({
      ...base,
      raids: [{ name: '斷腸嶺', x: 10, z: 10 }],
      sickNames: ['王二'],
      village: V({ order: 5, trade: 5, grainPrice: 99 }),
      marauders: { phase: 'coming', daysLeft: 2 },
    });
    expect(s).toContain('2');            // 還剩幾天要說出來,不然這句話不值錢
    expect(s).not.toContain('斷腸嶺');    // 別的事全押後
  });

  it('兵已經進村了就別再賣消息', () => {
    const s = newsFrom({ ...base, marauders: { phase: 'present', daysLeft: 1 } });
    expect(s).toContain('兵');
  });

  it('下山的那夥要報<b>名字和方位</b>,不是「山裡有賊」', () => {
    const s = newsFrom({ ...base, raids: [{ name: '野狐灘', x: 0, z: 80 }] });
    expect(s).toContain('野狐灘');
    // 方位是從座標算的 —— 正北的目標不該說成「南邊」
    expect(s).toMatch(/[東南西北]/);
  });

  it('仇家在打聽你 —— 這是酒肆最該賣的一句', () => {
    const s = newsFrom({ ...base, hunted: '枯樹坳', sickNames: ['王二'] });
    expect(s).toContain('枯樹坳');
  });

  it('治安差的時候報<b>最橫的那一夥</b>,不是隨便一夥', () => {
    const small = band({ id: 'a', name: '小窩', count: 2, fierce: 0.2 });
    const big = band({ id: 'b', name: '大寨', count: 9, fierce: 0.9 });
    const s = newsFrom({ ...base, village: V({ order: 10 }), bands: [small, big] });
    expect(s).toContain('大寨');
    expect(s).not.toContain('小窩');
  });

  it('打散了的不算 —— 已經清掉的窩不該還被當成「最橫的一夥」', () => {
    const s = newsFrom({
      ...base, village: V({ order: 10 }),
      bands: [band({ name: '大寨', count: 9, fierce: 0.9, routed: true })],
    });
    expect(s).not.toContain('大寨');
    expect(s).toContain('清');
  });

  it('沒有急事就講行情:路斷了、米貴了、還是太平', () => {
    expect(newsFrom({ ...base, village: V({ trade: 10 }) })).toContain('路');
    expect(newsFrom({ ...base, village: V({ grainPrice: 60 }) })).toContain('米價');
    const calm = newsFrom({ ...base, bands: [band(), band({ id: 'b1' })] });
    expect(calm).toContain('2');          // 還剩幾處窩點,數字要對
    expect(newsFrom(base)).toContain('太平');
  });

  it('<b>永遠給得出一句話</b> —— 花了錢不能得到空字串', () => {
    for (const order of [0, 30, 60, 100]) {
      for (const trade of [0, 40, 90]) {
        for (const price of [10, 50]) {
          const s = newsFrom({ ...base, village: V({ order, trade, grainPrice: price }) });
          expect(s.length).toBeGreaterThan(6);
          expect(s.startsWith('「')).toBe(true);
        }
      }
    }
  });
});

describe('雇人的價', () => {
  it('亂世人賤 —— 治安越差越便宜', () => {
    expect(hirePrice(V({ order: 10 }), 0)).toBeGreaterThan(hirePrice(V({ order: 90 }), 0));
  });

  it('帶得越多,肯來的越少', () => {
    const p = [0, 1, 2, 3, 5].map((n) => hirePrice(V(), n));
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
  });

  it('再怎麼便宜也有個底 —— 不能出現一個錢雇一個人', () => {
    for (const order of [0, 50, 100]) {
      for (const n of [0, 10, 40]) expect(hirePrice(V({ order }), n)).toBeGreaterThanOrEqual(6);
    }
  });

  it('白身雇不到人 —— 品階第一個真正有用的地方', () => {
    const nobody = canHire(0);
    expect(nobody.ok).toBe(false);
    expect(nobody.why.length).toBeGreaterThan(0);
    // 掙到名分就雇得到,而且不必再說話
    const somebody = canHire(9999);
    expect(somebody.ok).toBe(true);
    expect(somebody.why).toBe('');
  });
});

describe('店裡的閒話', () => {
  const npcs = (n: number) => Array.from({ length: n }, () => ({} as Npc));

  it('村況決定他們在聊什麼,而且四種情形各有各的話', () => {
    const said = new Set([
      tavernMood(V({ order: 10 }), npcs(30)),
      tavernMood(V({ grainPrice: 60 }), npcs(30)),
      tavernMood(V({ harvest: 90 }), npcs(30)),
      tavernMood(V(), npcs(30)),
    ]);
    expect(said.size).toBe(4);
  });

  it('人少了火就不旺 —— 村子死了多少人,酒肆裡看得出來', () => {
    expect(tavernMood(V(), npcs(30))).not.toBe(tavernMood(V(), npcs(5)));
    expect(tavernMood(V(), npcs(5))).toContain('沒幾個人');
  });

  it('一碗酒解的乏是有限的 —— 這不是回血藥', () => {
    expect(DRINK_TOIL).toBeGreaterThan(0);
    expect(DRINK_TOIL).toBeLessThan(6);
  });
});
