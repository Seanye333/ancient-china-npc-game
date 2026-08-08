import { describe, it, expect, beforeEach } from 'vitest';
import { strikeBeat, beatPull, clearBeat, beat } from './beats';

beforeEach(() => clearBeat());

describe('事件鏡頭', () => {
  it('沒有事發生的時候一動不動', () => {
    const p = beatPull(10);
    expect(p.dist).toBe(0);
    expect(p.high).toBe(0);
    expect(p.look).toBe(0);
  });

  it('一進一出是對稱的 —— 彈出去再慢慢收回來讀起來像被撞了一下', () => {
    strikeBeat('engage', 20, 5, 0);
    const at = (t: number) => beatPull(t).look;
    const mid = at(0.75);
    expect(at(0.05)).toBeLessThan(mid);
    expect(at(1.45)).toBeLessThan(mid);
    // 對稱:離中點一樣遠的兩點,力道一樣
    expect(at(0.45)).toBeCloseTo(at(1.05), 2);
  });

  it('演完就自己收掉,不必有人來清', () => {
    strikeBeat('fell', 1, 2, 0);
    expect(beatPull(0.5).look).toBeGreaterThan(0);
    expect(beatPull(9).look).toBe(0);
    expect(beat.now).toBeNull();
  });

  it('接戰是往後拉,倒下與來投是往前收', () => {
    strikeBeat('engage', 0, 0, 0);
    expect(beatPull(0.75).dist).toBeGreaterThan(0);
    clearBeat();
    strikeBeat('fell', 0, 0, 0);
    expect(beatPull(0.5).dist).toBeLessThan(0);
    clearBeat();
    strikeBeat('join', 0, 0, 0);
    expect(beatPull(0.65).dist).toBeLessThan(0);
  });

  it('後來的那一件蓋過前一件 —— 賊還沒到,身邊的人先倒了', () => {
    strikeBeat('engage', 30, 0, 0);
    strikeBeat('fell', 2, 1, 0.4);
    expect(beat.now?.kind).toBe('fell');
    const p = beatPull(0.9);
    expect(p.x).toBe(2);
  });

  it('同一拍不會自己疊自己 —— 連著三個人倒下鏡頭不該抽搐', () => {
    strikeBeat('fell', 1, 1, 0);
    strikeBeat('fell', 2, 2, 0.1);
    expect(beat.now?.x).toBe(1);       // 0.1 秒內的第二下被擋掉
    strikeBeat('fell', 3, 3, 0.6);
    expect(beat.now?.x).toBe(3);       // 過了門檻才換
  });

  it('力道有上限 —— 不能把鏡頭甩到天上', () => {
    for (const k of ['engage', 'fell', 'join'] as const) {
      clearBeat();
      strikeBeat(k, 0, 0, 0);
      for (let t = 0; t < 2; t += 0.02) {
        const p = beatPull(t);
        expect(Math.abs(p.dist)).toBeLessThan(0.7);
        expect(Math.abs(p.high)).toBeLessThan(0.7);
        expect(p.look).toBeGreaterThanOrEqual(0);
        expect(p.look).toBeLessThanOrEqual(1);
      }
    }
  });
});
