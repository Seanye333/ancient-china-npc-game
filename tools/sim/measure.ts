import { beginBattle, stepBattle, battleOver, useBattle, flankTally, type BattleTally } from '../../src/game/combat';
const seeded = (seed: number) => { let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const flat = () => 0;
const nowhere = (_x: number, _z: number, nx: number, nz: number) => ({ x: nx, z: nz });
function sim(ourWar: number[], foes: number, fierce: number, seed: number) {
  beginBattle({
    ours: ourWar.map((war, i) => ({ id: `u${i}`, name: `u${i}`, war,
      ...(i === 0 ? { isPlayer: true, driven: false } : {}) })),
    band: { id: 'b', x: 0, z: 12, fierce, count: foes },
    at: { x: 0, z: 0 }, ground: flat, rng: seeded(seed),
  });
  let t = 0; let over: BattleTally | null = null;
  while (!over && t < 180) { stepBattle(1 / 30, flat, nowhere); t += 1 / 30; over = battleOver(); }
  useBattle.getState().clear();
  return { over, t };
}
function runs(n: number, ourWar: number[], foes: number, fierce: number) {
  let won = 0, down = 0, secs = 0;
  for (let i = 0; i < n; i++) {
    const r = sim(ourWar, foes, fierce, 1000 + i * 7919);
    if (r.over?.won) won++;
    if (r.over?.playerDown) down++;
    secs += r.t;
  }
  return { win: +(won / n).toFixed(3), down: +(down / n).toFixed(3), secs: +(secs / n).toFixed(1) };
}
function withTally(label: string, fn: () => unknown) {
  flankTally.hits = 0; flankTally.blows = 0;
  const r = fn();
  const pct = flankTally.blows ? (flankTally.hits / flankTally.blows * 100).toFixed(1) : '0';
  console.log(label, JSON.stringify(r), `· 背後那一下佔 ${pct}%`);
}
const W = 58;
withTally('一打三 ', () => runs(200, [W], 3, 0.45));
withTally('三打三 ', () => runs(200, [W, 50, 50], 3, 0.45));
withTally('五打三 ', () => runs(200, [W, 50, 50, 46, 46], 3, 0.45));
withTally('五打五兇', () => runs(200, [W, 50, 50, 46, 46], 5, 0.75));
