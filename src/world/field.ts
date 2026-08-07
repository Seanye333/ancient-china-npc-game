/**
 * 地形場 — 高度、坡度、河谷。
 *
 * 建築與植被都要貼地,所以高度函式必須是<b>純函式</b>並且和頂點位移用同一份:
 * 網格頂點跟放置邏輯一旦各算各的,房子就會浮空或陷進山裡。
 */

function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** 河谷的權重 — 0 = 山,1 = 谷心。聚落就落在谷心。 */
export function valleyMask(x: number, z: number): number {
  // 河道略帶蛇行,免得看起來像人工開的渠
  const meander = Math.sin(z * 0.020) * 9 + Math.sin(z * 0.047) * 3.5;
  const d = Math.abs(x - meander);
  return Math.exp(-(d * d) / (2 * 21 * 21));
}

/** 河心的窄帶 — 水面畫在這裡。 */
export function riverMask(x: number, z: number): number {
  const meander = Math.sin(z * 0.020) * 9 + Math.sin(z * 0.047) * 3.5;
  const d = Math.abs(x - meander);
  return Math.exp(-(d * d) / (2 * 5.2 * 5.2));
}

export const WATER_Y = -0.85;

/**
 * 水位的偏移 —— 水患漲、大旱落。
 *
 * 這一項讓天災第一次<b>在腳下</b>成立:先前水患只是收成那一欄掉得快一些,
 * 河面一動不動。現在河會漫上灘地,而漫過的地方是真的走不過去
 * (walkable 吃的是同一個數)。
 *
 * 幅度刻意壓得很小(±0.4 步):再大就會淹到村子,把玩家困住 ——
 * 天災該讓人難過,不該讓人動不了。
 */
export const water = { offset: 0 };
export function waterLevel(): number { return WATER_Y + water.offset; }

export function terrainHeight(x: number, z: number): number {
  const v = valleyMask(x, z);
  const ridges = fbm(x * 0.0068, z * 0.0068, 5);
  // 抬到 1.6 次方 — 讓山脊尖、谷底平,線性的丘陵讀起來像麵團
  const mountains = Math.pow(ridges, 1.6) * 62;
  const mid = fbm(x * 0.026 + 11, z * 0.026 - 7, 4) * 5.4;
  const fine = fbm(x * 0.11 - 4, z * 0.11 + 9, 3) * 0.9;

  const plain = -1.2 + mid * 0.16 + fine * 0.5;      // 谷底幾乎是平的
  const hill = mountains + mid + fine;
  const h = hill * (1 - v) + plain * v;

  // 河床再挖一道
  return h - riverMask(x, z) * 2.4;
}

/** 坡度 — 建築只蓋在夠平的地方,樹則避開陡崖。 */
export function slopeAt(x: number, z: number, e = 1.6): number {
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

/** 決定論亂數 — 同一顆種子每次載入長出同一個世界。 */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 人跡帶 — 離河 8～46 那一圈是聚落、農田與道路。
 * 這裡的樹會被砍掉,所以植被要按這個遮罩讓位。少了這條規律,
 * 村子會被森林淹掉,看起來像沒人住。
 */
export function humanMask(x: number, z: number): number {
  const meander = Math.sin(z * 0.020) * 9 + Math.sin(z * 0.047) * 3.5;
  const d = Math.abs(x - meander);
  const inner = Math.min(1, Math.max(0, (d - 6) / 5));      // 河岸留給柳與蘆葦
  const outer = Math.min(1, Math.max(0, (52 - d) / 9));
  const band = Math.min(inner, outer);
  return band * band * (3 - 2 * band);
}

/**
 * 走得過去嗎 — 玩家與 NPC 共用同一套判斷。
 *
 * 少了這個,水就只是一層藍色的紙:主角會泡在河裡走,村民會從河心穿過去。
 * 一個世界要讓人相信,先得讓它<b>擋得住人</b>。
 *
 * 兩條規矩:水太深過不去(岸邊的淺灘可以踩),坡太陡爬不上去(山是牆不是坡道)。
 */
export const WADE_DEPTH = 0.55;          // 這個深度以內算淺灘,踩得過去
export const MAX_WALK_SLOPE = 0.72;

export function walkable(x: number, z: number): boolean {
  if (blocked(x, z, 0.34)) return false;      // 樹幹擋人 — 身體半徑算進去
  if (deckAt(x, z) !== null) return true;     // 橋面、埠板:走上去就是了
  const h = terrainHeight(x, z);
  if (h < waterLevel() - WADE_DEPTH) return false;
  return slopeAt(x, z) < MAX_WALK_SLOPE;
}

/* ── 走在什麼上面 ────────────────────────────────────── */

/**
 * 人踩得到的面 — 地面,或是架在地面上的橋板。
 *
 * 少了這一層,那座橋就只是<b>擺著看的</b>:主角會從橋底下趟過河,
 * 鏡頭插進橋樑之間,而河對岸實際上永遠去不了(河心兩公尺深,涉不過去)。
 * 一座過不去的橋比沒有橋更傷 —— 它在畫面上承諾了一條路。
 */
export interface Deck {
  /** 軸對齊矩形就夠了 —— 橋與埠都是正的。 */
  x0: number; x1: number; z0: number; z1: number;
  /** 板面的世界高度。 */
  y: number;
}

const decks = new Map<string, Deck[]>();

// 板子與障礙一動,導航圖就得重建 —— 橋是後來才登記的,
// 而導航圖是第一次要用時才建的,兩者的順序不保證
export function registerDecks(key: string, list: Deck[]) { decks.set(key, list); onWorldChange(); }
export function clearDecks(key: string) { decks.delete(key); onWorldChange(); }

/**
 * 世界的形狀變了要通知誰。
 *
 * 用回呼而不是直接 import nav,是為了不讓 field(誰都在用的底層)
 * 反過來相依於 nav。
 */
let onWorldChange: () => void = () => {};
export function setWorldChangeHook(fn: () => void) { onWorldChange = fn; }

/** 這一點上有板子嗎,有的話板面多高。 */
export function deckAt(x: number, z: number): number | null {
  let best: number | null = null;
  for (const list of decks.values()) {
    for (const d of list) {
      if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
      if (best === null || d.y > best) best = d.y;
    }
  }
  return best;
}

/** 站在這裡,腳底的高度 —— 所有會走路的東西都該用這個,而不是 terrainHeight。 */
export function groundAt(x: number, z: number): number {
  const d = deckAt(x, z);
  const h = terrainHeight(x, z);
  return d !== null && d > h ? d : h;
}

/* ── 擋路與擋視線的東西 ──────────────────────────────── */

/**
 * 地形以外的障礙 — 樹、屋、欄。
 *
 * 分成<b>擋人</b>和<b>擋鏡頭</b>兩種,因為這兩件事的形狀不一樣:
 * 樹冠不擋人(你從樹底下走過去),卻很擋鏡頭 —— 第一次驗收招募,
 * 截圖整張埋在一顆樹冠裡什麼都看不見,漏的就是這一層。
 * 反過來,敞開的堂屋擋鏡頭卻不該擋人,否則村民會被自己家卡死。
 *
 * 幾千個障礙每幀逐一比對太貴,所以進一張<b>格網</b>:
 * 只看鄰近那一格,實際比對數落到個位數。
 */
export interface Blocker {
  x: number; z: number;
  /** 擋人的半徑。0 = 不擋人。 */
  solid: number;
  /** 擋鏡頭的半徑。 */
  view: number;
  /** 頂端的世界高度 —— 鏡頭爬到這之上就看得過去了。 */
  top: number;
}

const CELL = 10;
const grid = new Map<number, Blocker[]>();
const groups = new Map<string, Blocker[]>();

const cellKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

function reindex() {
  grid.clear();
  for (const list of groups.values()) {
    for (const b of list) {
      const r = Math.max(b.solid, b.view);
      const x0 = Math.floor((b.x - r) / CELL), x1 = Math.floor((b.x + r) / CELL);
      const z0 = Math.floor((b.z - r) / CELL), z1 = Math.floor((b.z + r) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = cellKey(cx, cz);
          const cell = grid.get(k);
          if (cell) cell.push(b); else grid.set(k, [b]);
        }
      }
    }
  }
}

/**
 * 登記一組障礙。用 key 分組覆蓋 —— 同一個元件重掛(HMR、換季)
 * 不會把同一批樹登記兩次。
 */
export function registerBlockers(key: string, list: Blocker[]) {
  groups.set(key, list);
  reindex();
  onWorldChange();
}

export function clearBlockers(key: string) {
  if (groups.delete(key)) { reindex(); onWorldChange(); }
}

function near(x: number, z: number): Blocker[] | undefined {
  return grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
}

/** 擋住這一點的是哪一個(沒有就是 null)。 */
export function blockerAt(x: number, z: number, pad = 0): Blocker | null {
  const cell = near(x, z);
  if (!cell) return null;
  for (const b of cell) {
    if (b.solid <= 0) continue;
    const r = b.solid + pad;
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz < r * r) return b;
  }
  return null;
}

/**
 * 朝一個方向走一步,走不通就往兩邊偏著試。
 *
 * 純粹的直線 + 滑行過不了<b>凹進去的角落</b>:一叢樹圍成半圈,
 * 兩個軸和切線同時被擋,人就永遠貼在那裡。實測時主角就這樣停在半路。
 * 人遇到這種地形會繞一下再走,這個函式就是那個「繞一下」。
 */
const FAN = [0, 0.42, -0.42, 0.88, -0.88, 1.35, -1.35, 1.9, -1.9, 2.5, -2.5, Math.PI];

export function steerMove(
  x: number, z: number, wantX: number, wantZ: number, step: number,
  /**
   * 上一次是往哪一邊繞的(-1 左 / +1 右 / 0 沒有偏)。
   *
   * <b>繞路要認一邊繞到底</b>,這是這個函式最要緊的一條,也是踩了三次才想通的:
   * 每一幀都重新挑「最省的那一邊」,人就會在障礙前面左一下右一下 ——
   * 這一幀從左邊試著繞、下一幀站到新位置又覺得右邊近,一來一回淨位移為零。
   * 從外面看是「他站在那裡發抖」,而且<b>重算幾次路都一樣</b>,
   * 因為路根本沒錯,錯的是每一幀都改主意。
   */
  prefer = 0,
): { x: number; z: number; yaw: number; side: number } {
  // 先往前試,不行就往兩邊偏,最後連回頭都試 ——
  // 走進死胡同的時候,退出來是唯一的出路。
  // 上次繞哪一邊,這次就先試哪一邊
  const fan = prefer < 0 ? FAN.map((a) => -a) : FAN;
  for (const a of fan) {
    const c = Math.cos(a), s = Math.sin(a);
    const dx = wantX * c - wantZ * s;
    const dz = wantX * s + wantZ * c;
    const nx = x + dx * step, nz = z + dz * step;
    if (walkable(nx, nz)) {
      return { x: nx, z: nz, yaw: Math.atan2(dx, dz), side: Math.sign(a) };
    }
  }

  /*
   * 一個方向都走不通 —— 多半是<b>已經陷在某個圓裡</b>了。
   *
   * 這是這個函式先前<b>唯一沒有出路的狀態</b>:所有方向都不可走,
   * 於是原地不動;而下一幀還是所有方向都不可走。人就永遠釘在那棵樹上,
   * 畫面上看起來只是「他不走了」,任你重算幾次路都沒有用 ——
   * 因為問題不在路,在腳。
   *
   * slideMove 一直有這一段(推出圓心),steerMove 沒有 —— 兩個走位函式,
   * 一個有逃生口一個沒有,而自動走路用的正好是沒有的那個。
   */
  /*
   * 一個方向都走不通。
   *
   * 先前這裡直接原地不動 —— 而下一幀還是所有方向都走不通,人就永遠釘在那裡,
   * 畫面上只是「他不走了」,重算幾次路都沒有用:問題不在路,在腳。
   *
   * 卡死的形狀多半<b>不是「站在樹幹裡」,而是站在幾棵樹圍出來的口袋裡</b>:
   * 腳下這一點可走,可是往任何方向挪四公分都會踩進某一棵的邊上。
   * 樹夠密的時候,樹幹之間的空隙比人的半徑還小,這種口袋就會出現。
   *
   * 所以不去猜「是哪一棵擋著」,而是<b>往外找最近一個站得住的地方,朝它擠</b>。
   * 這一步允許中途不可走(本來就是在硬擠),但只要三步之內存在活路,
   * 人就出得去 —— 對所有卡法都成立,不必枚舉。
   */
  const stranded = !walkable(x, z);
  for (const r of [0.7, 1.3, 2.1, 3.2, 4.4]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const ex = x + Math.sin(a) * r;
      const ez = z + Math.cos(a) * r;
      if (!walkable(ex, ez)) continue;
      /*
       * 腳下本來就不能站的時候,<b>一步跨到那個站得住的點</b>,不要一點一點挪。
       *
       * 這是踩過的坑:原本無論如何都只挪 0.12,於是「人在不能站的地方」
       * 這個壞狀態會一直維持著 —— 這一幀往安全的方向挪一點,
       * 下一幀又被目標方向拉回來,兩邊各挪一點,淨位移為零。
       * 從外面看就是「他站在那裡發抖」,而且怎麼重算路都沒有用。
       *
       * 站在不能站的地方是個<b>壞狀態,不是一段距離</b>,要立刻修好而不是慢慢修。
       */
      if (stranded) return { x: ex, z: ez, yaw: Math.atan2(ex - x, ez - z), side: prefer };
      const k = Math.max(step, 0.12) / r;
      return {
        x: x + (ex - x) * k, z: z + (ez - z) * k,
        yaw: Math.atan2(ex - x, ez - z), side: prefer,
      };
    }
  }
  return { x, z, yaw: Math.atan2(wantX, wantZ), side: prefer };
}

/** 這裡站得住嗎(pad = 身體半徑)。 */
export function blocked(x: number, z: number, pad = 0): boolean {
  return blockerAt(x, z, pad) !== null;
}

/**
 * 視線經過這一點會被擋住嗎。
 *
 * 高度要一起看:樹冠只到那麼高,鏡頭爬過樹梢就該看得過去 ——
 * 只比平面距離的話,鏡頭永遠被一叢灌木逼到臉上。
 */
export function viewBlocked(x: number, z: number, y: number): boolean {
  const cell = near(x, z);
  if (!cell) return false;
  for (const b of cell) {
    if (y >= b.top) continue;
    const dx = x - b.x, dz = z - b.z;
    if (dx * dx + dz * dz < b.view * b.view) return true;
  }
  return false;
}

/**
 * 想往 (nx,nz) 走但走不過去時,試著沿障礙滑一下 ——
 * 直接卡住會讓人覺得是 bug,沿著河岸/山腳滑過去才像走路。
 *
 * 圓的障礙<b>必須走切線</b>,不能只試 x/z 兩軸。一步只有幾公分,
 * 貼上樹幹以後兩個軸都還在圓裡,於是人就永遠黏在那棵樹上 ——
 * 實測時主角就是這樣停在半路,離賊窩二十五步再也過不去。
 */
export function slideMove(
  x: number, z: number, nx: number, nz: number,
): { x: number; z: number } {
  if (walkable(nx, nz)) return { x: nx, z: nz };

  const b = blockerAt(nx, nz, 0.34);
  if (b) {
    let ux = nx - b.x, uz = nz - b.z;
    const len = Math.hypot(ux, uz) || 1;
    ux /= len; uz /= len;
    const dx = nx - x, dz = nz - z;
    const push = dx * ux + dz * uz;
    // 去掉朝著圓心的那一份,剩下的就是繞過去的那一份
    const tx = x + dx - ux * push;
    const tz = z + dz - uz * push;
    if (walkable(tx, tz)) return { x: tx, z: tz };
    // 已經陷在圓裡了就往外推一點,別黏在樹幹上
    const out = b.solid + 0.34 - Math.hypot(x - b.x, z - b.z);
    if (out > 0) {
      const px = x + ux * Math.min(out, 0.14);
      const pz = z + uz * Math.min(out, 0.14);
      if (walkable(px, pz)) return { x: px, z: pz };
    }
  }

  if (walkable(nx, z)) return { x: nx, z };      // 只走 x
  if (walkable(x, nz)) return { x, z: nz };      // 只走 z
  return { x, z };
}

/**
 * 把一個落腳點挪到最近的乾地上。
 *
 * 這條函式出現過兩次才被抽出來:第一次是碼頭工人站在河裡幹活,
 * 第二次是病家門口那根挑白布的竿子插在水面上 —— 而<b>兩次的根因是同一個</b>:
 * 房子與碼頭的位置本身都避開了水,可是「門前一步」「攤位偏移」
 * 是往外算的,算著算著就算到河裡去了。
 *
 * 容差放在水面<b>之上</b>一截:剛好貼著水面的地,腳踝還是泡著的。
 */
export function dryLandNear(x: number, z: number): [number, number] {
  const lvl = WATER_Y + water.offset + 0.08;
  if (terrainHeight(x, z) >= lvl) return [x, z];
  for (let r = 0.8; r <= 4.1; r += 0.8) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + r;
      const tx = x + Math.sin(a) * r, tz = z + Math.cos(a) * r;
      if (terrainHeight(tx, tz) >= lvl) return [tx, tz];
    }
  }
  return [x, z];
}
