import { walkable, setWorldChangeHook } from './field';

/**
 * 尋路。
 *
 * 在這之前,「自動走過去」是<b>朝著目標直線走,撞到東西就往旁邊偏一點</b>。
 * 村子裡夠用 —— 沒有迷宮,繞一下就過去了。可是河對岸不行:
 * 這條谷的中間橫著一條河,只有一座橋。直線走法會把你帶到岸邊,
 * 然後在那裡左右試探到天荒地老,而橋就在下游三十步的地方。
 *
 * 所以要有一張圖。做法刻意保守:
 *
 * - <b>粗網格</b>(四步一格)。人不需要走得多精準,只需要知道「先往橋那邊去」;
 *   精細的閃避交給既有的 steerMove。格子放粗,整張圖才建得起也搜得動。
 * - <b>第一次要用的時候才建</b>。開場沒有人要尋路,不該為它多花那半秒。
 * - 找到的路<b>只當航點用</b>。不逐格照走 —— 那樣人會沿著格線走成直角,
 *   一看就是機器。走向下一個看得見的航點,剩下的交給滑動與轉向。
 */

/** 一格四步。再細就建不動,再粗會漏掉橋。 */
const CELL = 4;
/** 世界的半徑 —— 比地形的可玩範圍略大一點。 */
const HALF = 244;
const N = Math.ceil((HALF * 2) / CELL);

let grid: Uint8Array | null = null;

/**
 * 世界變了就把圖丟掉。
 *
 * 這是一個<b>順序上的暗坑</b>:導航圖是第一次要用的時候才建的,而橋的板子
 * (deck)是 Settlement 掛載時才登記的。萬一有人在那之前先問了一次路,
 * 建出來的圖裡就沒有橋 —— 而且從此再也不會有,因為圖只建一次。
 * 河對岸從此永遠走不到,畫面上什麼都看不出來。
 */
export function invalidateNav() { grid = null; }

setWorldChangeHook(invalidateNav);

/**
 * 一格取九個點,只要有一個站得住,這一格就算通。
 *
 * 這一步是被橋逼出來的。橋板只有三步寬(z 方向),而格子四步一格 ——
 * 一格只取中心一個點的話,<b>整座橋可能剛好落在兩個取樣點中間</b>,
 * 於是導航圖上沒有橋,河對岸從此走不到,而畫面上什麼都看不出來:
 * 橋明明在那裡,人就是不肯走過去。
 *
 * 通則:<b>網格比最窄的通道還粗的時候,那條通道會安靜地消失。</b>
 * 要嘛把格子切細(這裡是四倍的建圖成本),要嘛在格子裡多取幾個點。
 * 取樣寬鬆會讓少數只有一角能走的格子被算成通的 —— 那沒關係,
 * 貼著障礙的閃避本來就交給 steerMove。
 */
function build() {
  const g = new Uint8Array(N * N);
  const q = CELL / 3;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const cx = -HALF + ix * CELL + CELL / 2;
      const cz = -HALF + iz * CELL + CELL / 2;
      let open = 0;
      for (let sz = -1; sz <= 1 && !open; sz++) {
        for (let sx = -1; sx <= 1 && !open; sx++) {
          if (walkable(cx + sx * q, cz + sz * q)) open = 1;
        }
      }
      g[iz * N + ix] = open;
    }
  }
  grid = g;
}

const toCell = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + HALF) / CELL)));
const toWorld = (i: number) => -HALF + i * CELL + CELL / 2;

/** 這一格能不能站人 —— 診斷用,也給測試看。 */
export function navOpen(x: number, z: number): boolean {
  if (!grid) build();
  return grid![toCell(z) * N + toCell(x)] === 1;
}

export function navStats() {
  if (!grid) build();
  let open = 0;
  for (let i = 0; i < grid!.length; i++) open += grid![i];
  return { cells: grid!.length, open, cell: CELL };
}

/**
 * 找一條路。回傳一串航點(不含起點),找不到就 null。
 *
 * A*,八方向,對角要兩邊都通(不然人會從兩棵樹中間的縫斜穿過去)。
 */
export function findPath(
  x0: number, z0: number, x1: number, z1: number,
): Array<[number, number]> | null {
  if (!grid) build();
  const g = grid!;

  // 圖外面就老實說走不到 —— toCell 會把座標夾到邊緣,
  // 不擋的話「走到九千步外」會回一條通往地圖角落的路
  if (Math.abs(x1) > HALF || Math.abs(z1) > HALF) return null;
  if (Math.abs(x0) > HALF || Math.abs(z0) > HALF) return null;

  const sx = toCell(x0), sz = toCell(z0);
  let tx = toCell(x1), tz = toCell(z1);
  const start = sz * N + sx;
  let goal = tz * N + tx;

  // 目標落在走不到的格子上(賊窩邊上、水裡)—— 退而求其次找最近的空格
  if (!g[goal]) {
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const cx = tx + dx, cz = tz + dz;
          if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
          if (!g[cz * N + cx]) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = cz * N + cx; }
        }
      }
    }
    if (best < 0) return null;
    goal = best; tx = goal % N; tz = Math.floor(goal / N);
  }
  if (!g[start]) return null;
  if (start === goal) return [];

  const open = [start];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[start, 0]]);
  const h = (i: number) => {
    const dx = (i % N) - tx, dz = Math.floor(i / N) - tz;
    return Math.hypot(dx, dz);
  };
  const fScore = new Map<number, number>([[start, h(start)]]);
  const seen = new Set<number>();

  let guard = 0;
  while (open.length && guard++ < 40000) {
    // 小規模用線性掃描就夠 —— 一張兩百步見方的圖不值得一個堆
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bi]) ?? Infinity)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) return rebuild(came, cur);
    seen.add(cur);

    const cx = cur % N, cz = Math.floor(cur / N);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx;
        if (!g[ni] || seen.has(ni)) continue;
        // 斜著走要兩邊都通,否則人會從兩棵樹中間的縫穿過去
        if (dx && dz && (!g[cz * N + nx] || !g[nz * N + cx])) continue;
        const step = dx && dz ? 1.414 : 1;
        const tentative = (gScore.get(cur) ?? Infinity) + step;
        if (tentative >= (gScore.get(ni) ?? Infinity)) continue;
        came.set(ni, cur);
        gScore.set(ni, tentative);
        fScore.set(ni, tentative + h(ni));
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  return null;
}

function rebuild(came: Map<number, number>, end: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    out.push([toWorld(cur % N), toWorld(Math.floor(cur / N))]);
    cur = came.get(cur);
  }
  out.reverse();
  return simplify(out);
}

/**
 * 把一串格子縮成幾個轉折點。
 *
 * 不做這一步的話,人會沿著格線走出一排直角 —— 一看就是機器在走。
 * 只留下方向真的變了的那些點,中間交給 steerMove 自己滑過去。
 */
function simplify(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length <= 2) return pts.slice(1);
  const out: Array<[number, number]> = [];
  let dirX = 0, dirZ = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.sign(pts[i][0] - pts[i - 1][0]);
    const dz = Math.sign(pts[i][1] - pts[i - 1][1]);
    if (dx !== dirX || dz !== dirZ) {
      out.push(pts[i - 1]);
      dirX = dx; dirZ = dz;
    }
  }
  out.push(pts[pts.length - 1]);
  return out.slice(1);
}
