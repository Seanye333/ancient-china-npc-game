import { walkable, deckAt, setWorldChangeHook } from './field';

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
 * 一格通不通:<b>中心站得住,或者格子裡有橋板</b>。
 *
 * 這條規則是兩次犯錯之間的那條線。
 *
 * 第一版只看中心一點 —— 橋板只有三步寬,格子四步一格,整座橋可能剛好落在
 * 兩個取樣點中間。導航圖上沒有橋,河對岸從此走不到,而畫面上什麼都看不出來。
 *
 * 第二版改成「一格取九點,任一點能走就算通」。橋回來了,可是<b>山坡也一起
 * 回來了</b>:陡坡上一格常常只有一角勉強站得住,圖上卻標成通的 ——
 * 於是規劃出一條爬不上去的路,人走到半山腰就卡在那裡。這比沒有橋更難查,
 * 因為路看起來完全合理。
 *
 * 通則:<b>放寬取樣要放得有理由,不能為了救一個特例而普遍放寬。</b>
 * 這裡真正的特例是「橋」,而橋是明確登記過的(deck)—— 那就只放寬這一種。
 */
function build() {
  const g = new Uint8Array(N * N);
  const q = CELL / 3;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const cx = -HALF + ix * CELL + CELL / 2;
      const cz = -HALF + iz * CELL + CELL / 2;
      // 一格通不通,只看它自己 —— 兩格之間過不過得去是「邊」的事,見 passable()
      let open = walkable(cx, cz) ? 1 : 0;
      if (!open) {
        // 只為橋放寬 —— 板子是明確登記的東西,不是「碰巧有一角能站」
        for (let sz = -1; sz <= 1 && !open; sz++) {
          for (let sx = -1; sx <= 1 && !open; sx++) {
            if (deckAt(cx + sx * q, cz + sz * q) !== null) open = 1;
          }
        }
      }
      g[iz * N + ix] = open;
    }
  }
  grid = g;
}

const toCell = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + HALF) / CELL)));
const toWorld = (i: number) => -HALF + i * CELL + CELL / 2;

/**
 * 這兩格之間走得過去嗎 —— 看的是<b>邊</b>,不是格子。
 *
 * 這條檢查是被「人原地擺動」逼出來的:兩格中心都站得住,可是中間夾著一棵樹。
 * 圖說通,腳說不通;走位函式這一幀偏左繞、下一幀從新位置偏右繞,淨位移為零,
 * 而且重算幾次路都一樣 —— 每次都算出同一條穿不過去的路。
 *
 * 第一版把它做進建圖:一格要「中心加四個邊中點都站得住」才算通。
 * 結果<b>關掉了兩千一百格</b>,把碼頭所在的那條河灘整條切了出去 ——
 * 車從碼頭出發永遠算不出路。那是把「邊的性質」硬塞進「格子的性質」的下場。
 *
 * 現在放回它該在的地方:A* 展開鄰格的時候才檢查兩點之間那一小段。
 * 貴一點(每條邊多一次取樣),但貴得有道理。
 */
function passable(a: number, b: number): boolean {
  const ax = toWorld(a % N), az = toWorld(Math.floor(a / N));
  const bx = toWorld(b % N), bz = toWorld(Math.floor(b / N));
  // 沿著這條邊取三個點,不是只取中點。
  // 只取中點的話,一棵長在四分之一處的樹會整條漏掉 —— 而漏掉的下場是
  // 規劃出一條「圖上通、腳下不通」的路,東西走到那裡就在原地打轉。
  for (const t of [0.25, 0.5, 0.75]) {
    const mx = ax + (bx - ax) * t;
    const mz = az + (bz - az) * t;
    if (!walkable(mx, mz) && deckAt(mx, mz) === null) return false;
  }
  return true;
}

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

  /**
   * 起點和終點都要能<b>退到最近站得住的格子</b>。
   *
   * 先前只退終點,起點站不住就直接回 null —— 而「起點站不住」比想像中常見:
   * 碼頭本來就搭在水邊,車停在碼頭上,於是「從碼頭出發」永遠算不出路來,
   * 車一步都不會動。而畫面上看到的是「車就是不走」,沒有任何線索。
   */
  const snap = (ci: number): number => {
    if (g[ci]) return ci;
    const cx0 = ci % N, cz0 = Math.floor(ci / N);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const cx = cx0 + dx, cz = cz0 + dz;
          if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
          if (!g[cz * N + cx]) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = cz * N + cx; }
        }
      }
    }
    return best;
  };

  const start = snap(sz * N + sx);
  let goal = snap(tz * N + tx);
  if (start < 0 || goal < 0) return null;
  tx = goal % N; tz = Math.floor(goal / N);
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
        // 兩格之間那一段也要走得過去 —— 中心站得住不代表中間沒有樹
        if (!passable(cur, ni)) continue;
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
