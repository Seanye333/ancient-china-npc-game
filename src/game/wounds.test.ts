import { describe, it, expect } from 'vitest';
import { useHero, woundPenalty } from './hero';

/**
 * 傷有形狀 —— 傷不該只是一個倒數計時。
 * 腿:走得慢;臂:砍得輕;面:好了也留疤。減益數字全從 woundPenalty
 * 一處讀,Player 的腳程和 Battle 的出手引的是同一個函式。
 */
describe('傷有形狀', () => {
  it('傷在哪、走多快砍多重、好了留不留疤', () => {
    useHero.setState({ wounded: 0, woundKind: null, scars: 0 });

    useHero.getState().hurt(3, 'face');
    expect(useHero.getState().woundKind).toBe('face');
    expect(woundPenalty(useHero.getState()).speed).toBeCloseTo(0.85);
    for (let i = 0; i < 3; i++) useHero.getState().heal();
    expect(useHero.getState().wounded).toBe(0);
    expect(useHero.getState().woundKind).toBeNull();
    // 破相的傷收口成疤 —— 疤不會再掉
    expect(useHero.getState().scars).toBe(1);

    useHero.getState().hurt(2, 'leg');
    expect(woundPenalty(useHero.getState()).speed).toBeLessThan(0.7);
    expect(woundPenalty(useHero.getState()).dmg).toBe(1);

    // 舊傷未愈又添新傷:傷處以新的為準,帳只有一本
    useHero.getState().hurt(2, 'arm');
    expect(woundPenalty(useHero.getState()).dmg).toBeLessThan(0.8);

    useHero.setState({ wounded: 0, woundKind: null });
    expect(woundPenalty(useHero.getState())).toEqual({ speed: 1, dmg: 1 });
  });
});
