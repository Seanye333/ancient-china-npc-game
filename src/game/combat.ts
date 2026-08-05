import { create } from 'zustand';

/**
 * 打架 — 這個遊戲最險的一塊。
 *
 * 三條決定了它長什麼樣:
 *
 * 一、<b>不切場景</b>。你走到那夥人面前,架就在你站的這塊地上打。
 *     切去一張戰鬥棋盤等於承認這個世界只是一層選單皮。
 * 二、<b>人數要看得見</b>。前面辛苦招來的人,價值必須出現在畫面上而不是加成欄裡:
 *     被兩個人夾住就躲不掉,同伴倒下全隊心就散。三個打七個會潰,
 *     五個打七個有得打 —— 這是招募這條線的兌現點。
 * 三、<b>多半不是打到全滅</b>。士氣歸零就轉身跑。真實的械鬥都是這樣結束的,
 *     而且它讓一場架收在十幾秒內,不是拉鋸兩分鐘。
 *
 * 這個檔<b>不碰 three.js</b>:只算位置與生死,誰來畫是另一回事。
 * 位置逐幀變,所以走模組級可變陣列,不進 store —— 進 store 就是每幀重繪整棵樹。
 */

export type Side = 'you' | 'foe';

export type Stance =
  | 'closing'    // 逼近
  | 'engaged'    // 接上了,互砍
  | 'striking'   // 正在出手
  | 'reeling'    // 挨了一下
  | 'fleeing'    // 心散了,轉身跑
  | 'down';      // 倒了

export interface Fighter {
  id: string;
  side: Side;
  name: string;
  /** 伙伴對應的村民 id — 戰後要按這個算誰傷了誰沒回來。 */
  npcId?: string;
  /** 頭目 — 倒下會動搖整夥人。 */
  chief?: boolean;
  x: number; y: number; z: number; yaw: number;
  hp: number; maxHp: number;
  war: number;
  morale: number;
  targetId: string | null;
  /** 出手冷卻,秒。 */
  cool: number;
  stance: Stance;
  /** 動作相位 0..1 — 給渲染做揮砍與踉蹌,邏輯不看它。 */
  phase: number;
  /** 主角本人 —— 血厚一點、不會自己嚇跑、收場要單獨記一筆。 */
  isPlayer: boolean;
  /**
   * 位置與出手<b>由外面推</b>(真人在鍵盤那頭),模擬不要碰他。
   *
   * 和 isPlayer 分開,是因為這兩件事只是<b>平常</b>同時成立。合在一起寫的時候,
   * 空跑的場子裡主角就成了一尊木頭:不動、不揮刀,還照樣吸引兩個賊來砍 ——
   * 於是「白身帶兩個村民打兩個毛賊」量出 4% 勝率,而那個數字量的其實是
   * 我的測試少了一個人,不是遊戲難。
   */
  driven: boolean;
  /** 最後一次挨打的時刻,用來閃紅。 */
  hurtAt: number;
}

/** 場上所有人 — 高頻資料,每幀動。 */
export const fighters: Fighter[] = [];

/**
 * 上一次有人挨刀是什麼時候。
 *
 * 用來拆<b>僵局</b>:兩邊都還站著,可是誰也打不到誰 —— 最後一個賊縮在柵欄後面,
 * 我方三個人在外頭繞,而戰鬥沒有尋路(只有貼著障礙滑),於是永遠不會結束。
 * 這種局面在畫面上看起來就是「大家站著發呆」,而且不會自己好。
 *
 * 真人遇到這種情況會走開。所以超過一段時間沒人挨到一刀,士氣就開始垮 ——
 * 這一場架自己就散了。比起特判「誰卡住了」,這個做法對所有卡法都成立。
 */
let lastBlow = 0;
const STALE_AFTER = 25;

/**
 * 打鬥的節奏參數 —— 調這裡就能改「一場架有多長」。
 *
 * 這幾個數字是<b>空跑一千場調出來的</b>,不是看畫面調的:
 * 第一版四打六在四秒內全滅、對方一個沒倒,眼睛看只覺得「輸了」,
 * 跑一遍模擬才知道是傷害過高 + 士氣根本沒發作。見 combat.balance.test.ts。
 */
export const REACH = 1.35;          // 兵器夠得著的距離
const SWING = 0.55;                 // 一次揮砍的長度
const HIT_AT = 0.42;                // 揮到這個相位判定命中
const RECOVER = 0.62;               // 收招
const MOVE = 2.5;                   // 接敵的腳程
const FLEE = 4.6;                   // 逃命跑得比誰都快

/**
 * 圍攻:每多一個人貼著你,閃避就掉一截 —— 人數的價值在這裡。
 * 要封頂,否則五個打一個等於一刀一個,人數會從「優勢」變成「開關」。
 */
const SURROUND_PENALTY = 0.10;
const SURROUND_CAP = 0.20;

let rand: () => number = Math.random;
let clock = 0;

export function fighterAt(id: string): Fighter | undefined {
  return fighters.find((f) => f.id === id);
}

export const alive = (f: Fighter) => f.stance !== 'down' && f.stance !== 'fleeing';

/* ── 開打 ────────────────────────────────────────────── */

export interface BandSpec {
  id: string;
  x: number; z: number;
  /** 這夥人的兇悍程度,0..1 — 決定武力與士氣。 */
  fierce: number;
  count: number;
}

export interface Recruit {
  id: string;
  name: string;
  npcId?: string;
  war: number;
  isPlayer?: boolean;
  /** 由外面推嗎。省略時等同 isPlayer —— 真人在鍵盤那頭是常態,空跑的場子才要另說。 */
  driven?: boolean;
}

/**
 * 擺開陣勢。雙方隔開一段距離對面站,而不是一開始就抱在一起 ——
 * 那幾秒的逼近是這場架唯一的「前搖」,少了它,遭遇戰會像被偷襲。
 */
export function beginBattle(input: {
  ours: Recruit[];
  band: BandSpec;
  at: { x: number; z: number };
  ground: (x: number, z: number) => number;
  /** 你的統率 — 帶得住人,他們就不那麼容易散。這是統率唯一該有的意思。 */
  leadership?: number;
  rng?: () => number;
}) {
  rand = input.rng ?? Math.random;
  clock = 0;
  lastBlow = 0;
  fighters.length = 0;

  const { band, at, ground } = input;
  const toBand = Math.atan2(band.x - at.x, band.z - at.z);

  input.ours.forEach((r, i) => {
    const off = (i - (input.ours.length - 1) / 2) * 1.15;
    const x = at.x + Math.cos(toBand) * off;
    const z = at.z - Math.sin(toBand) * off;
    fighters.push(mk({
      id: r.id, side: 'you', name: r.name, npcId: r.npcId,
      x, z, y: ground(x, z), yaw: toBand,
      war: r.war, morale: 30 + (input.leadership ?? 50) * 0.25, isPlayer: !!r.isPlayer,
      driven: r.driven ?? !!r.isPlayer,
    }));
  });

  for (let i = 0; i < band.count; i++) {
    const chief = i === 0;
    const off = (i - (band.count - 1) / 2) * 1.25;
    const x = band.x + Math.cos(toBand) * off;
    const z = band.z - Math.sin(toBand) * off;
    // 賊是烏合之眾:單論身手不如你的人,可怕的是<b>數量</b>。
    // 第一版把他們調得比村民還能打,於是三打三只有一成勝率 —— 那不叫難,叫沒得打。
    const war = Math.round(24 + band.fierce * 36 + (chief ? 8 : 0) + rand() * 9);
    fighters.push(mk({
      id: `${band.id}-${i}`, side: 'foe', name: chief ? '賊首' : '山賊',
      chief, x, z, y: ground(x, z), yaw: toBand + Math.PI,
      war, morale: 26 + band.fierce * 24 + (chief ? 18 : 0), isPlayer: false, driven: false,
    }));
  }
  useBattle.getState().open(band.id);
}

function mk(p: {
  id: string; side: Side; name: string; npcId?: string; chief?: boolean;
  x: number; y: number; z: number; yaw: number;
  war: number; morale: number; isPlayer: boolean; driven: boolean;
}): Fighter {
  // 主角厚一點 —— 這個遊戲裡你可以輸,但不該在看清楚發生什麼之前就倒下
  const hp = 42 + p.war * 0.38 + (p.isPlayer ? 16 : 0);
  return {
    ...p,
    hp, maxHp: hp,
    targetId: null, cool: 0.4 + rand() * 0.5, stance: 'closing',
    phase: 0, hurtAt: -9,
  };
}

/* ── 每一幀 ──────────────────────────────────────────── */

/**
 * 推一步。玩家那一格的位置由 Player 寫進來(他歸鍵盤管),
 * 其餘的人在這裡走、在這裡砍。
 */
export function stepBattle(
  dt: number,
  ground: (x: number, z: number) => number,
  slide: (x: number, z: number, nx: number, nz: number) => { x: number; z: number },
) {
  clock += dt;

  for (const f of fighters) {
    if (f.stance === 'down') continue;

    if (f.stance === 'fleeing') {
      // 往離戰場最遠的方向跑,跑遠了就從場上消失
      const step = FLEE * dt;
      const nx = f.x + Math.sin(f.yaw) * step;
      const nz = f.z + Math.cos(f.yaw) * step;
      const got = slide(f.x, f.z, nx, nz);
      f.x = got.x; f.z = got.z; f.y = ground(f.x, f.z);
      f.phase = (f.phase + dt * 6) % 1;
      continue;
    }

    f.cool -= dt;

    // 出手中 — 揮到一半才判定命中,這樣「看到揮」和「挨到」對得上
    if (f.stance === 'striking') {
      const before = f.phase;
      f.phase += dt / SWING;
      if (before < HIT_AT && f.phase >= HIT_AT) resolveStrike(f);
      if (f.phase >= 1) { f.stance = 'engaged'; f.phase = 0; f.cool = RECOVER + rand() * 0.35; }
      continue;
    }
    if (f.stance === 'reeling') {
      f.phase += dt / 0.34;
      if (f.phase >= 1) { f.stance = 'engaged'; f.phase = 0; }
      continue;
    }

    const tgt = pickTarget(f);
    f.targetId = tgt ? tgt.id : null;

    // 沒空位:壓到戰團邊上候著,誰倒下就補上去
    if (!tgt) {
      const w = nearestFoe(f);
      if (!w || f.driven) continue;
      const wx = w.x - f.x, wz = w.z - f.z;
      const wd = Math.hypot(wx, wz);
      f.yaw = Math.atan2(wx, wz);
      if (wd > REACH * 2.4) {
        const st = Math.min(MOVE * dt, wd - REACH * 2.2);
        const got = slide(f.x, f.z, f.x + (wx / wd) * st, f.z + (wz / wd) * st);
        f.x = got.x; f.z = got.z; f.y = ground(f.x, f.z);
        f.stance = 'closing';
        f.phase = (f.phase + dt * 5) % 1;
      } else {
        f.stance = 'engaged';
      }
      continue;
    }

    const dx = tgt.x - f.x, dz = tgt.z - f.z;
    const d = Math.hypot(dx, dz);
    // 真人自己走位,不由這裡推
    if (!f.driven) {
      f.yaw = Math.atan2(dx, dz);
      if (d > REACH) {
        const step = Math.min(MOVE * dt, d - REACH * 0.8);
        const got = slide(f.x, f.z, f.x + (dx / d) * step, f.z + (dz / d) * step);
        f.x = got.x; f.z = got.z; f.y = ground(f.x, f.z);
        f.stance = 'closing';
        f.phase = (f.phase + dt * 5) % 1;
        continue;
      }
      f.stance = 'engaged';
      if (f.cool <= 0) { f.stance = 'striking'; f.phase = 0; }
    }
  }

  reapAndRally();
}

/**
 * 挑對手 — 最近的,但<b>一個人最多被兩個人圍</b>。
 *
 * 找不到空位的人不會擠上去,而是逼近到外圍等 —— 這一條決定了人數優勢的形狀:
 * 允許無限圍毆的話,優勢是平方級的(空跑的矩陣顯示三打三五成、三打四只剩半成,
 * 多一個賊就從有得打變成毫無指望);讓多出來的人排隊,優勢就回到線性,
 * 玩家才判斷得出「這一夥我還吃不吃得下」。
 */
const MAX_ATTACKERS = 2;

function pickTarget(f: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const g of fighters) {
    if (g.side === f.side || !alive(g)) continue;
    if (attackersOn(g, f.id) >= MAX_ATTACKERS) continue;
    const d = Math.hypot(g.x - f.x, g.z - f.z);
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

/** 排不上隊的人往戰團外圍靠 —— 站在原地發呆比擠上去更假。 */
function nearestFoe(f: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const g of fighters) {
    if (g.side === f.side || !alive(g)) continue;
    const d = Math.hypot(g.x - f.x, g.z - f.z);
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

function attackersOn(target: Fighter, except: string): number {
  let n = 0;
  for (const g of fighters) {
    if (g.id === except || g.side === target.side || !alive(g)) continue;
    if (g.targetId === target.id && Math.hypot(g.x - target.x, g.z - target.z) < REACH * 1.6) n++;
  }
  return n;
}

/** 玩家出手 — 由鍵盤觸發,不看冷卻以外的東西。 */
export function playerStrike(id: string): boolean {
  const f = fighterAt(id);
  if (!f || f.stance === 'down' || f.stance === 'striking' || f.cool > 0) return false;
  f.stance = 'striking';
  f.phase = 0;
  return true;
}

/** 命中判定。玩家打的是<b>面前的扇區</b>,不是鎖定的目標 —— 揮空要能揮空。 */
function resolveStrike(f: Fighter) {
  const tgt = f.isPlayer ? inFront(f) : (f.targetId ? fighterAt(f.targetId) : null);
  if (!tgt || !alive(tgt)) return;
  if (Math.hypot(tgt.x - f.x, tgt.z - f.z) > REACH * 1.5) return;

  const crowd = Math.min(SURROUND_CAP, attackersOn(tgt, f.id) * SURROUND_PENALTY);
  const chance = clampf(0.44 + (f.war - tgt.war) / 190 + crowd, 0.15, 0.90);
  if (rand() > chance) return;

  const dmg = (6.5 + f.war * 0.10) * (0.75 + rand() * 0.6);
  lastBlow = clock;
  tgt.hp -= dmg;
  tgt.hurtAt = clock;
  if (tgt.hp <= 0) {
    tgt.hp = 0;
    tgt.stance = 'down';
    tgt.phase = 0;
    shakeMorale(tgt);
  } else if (tgt.stance !== 'striking') {
    tgt.stance = 'reeling';
    tgt.phase = 0;
  }
}

/** 玩家面前 100° 扇區內最近的一個。 */
function inFront(f: Fighter): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const g of fighters) {
    if (g.side === f.side || !alive(g)) continue;
    const dx = g.x - f.x, dz = g.z - f.z;
    const d = Math.hypot(dx, dz);
    if (d > REACH * 1.6) continue;
    const ang = Math.abs(wrapPi(Math.atan2(dx, dz) - f.yaw));
    if (ang > 0.87) continue;
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

/**
 * 有人倒下,活著的人心裡會動一下 —— 這是「人數」真正發威的地方:
 * 不是多一把刀,是少一個人時全隊一起晃。
 */
function shakeMorale(fallen: Fighter) {
  for (const g of fighters) {
    if (!alive(g)) continue;
    if (g.side === fallen.side) g.morale -= fallen.chief ? 28 : 15;
    else g.morale += 5;
  }
}

function reapAndRally() {
  // 開場前幾秒不許跑 —— 他們是衝著你來的,不會照面就散
  if (clock < 2.5) return;
  for (const f of fighters) {
    if (!alive(f)) continue;
    // 自己傷得重也會怕
    const hurt = f.hp / f.maxHp;
    // 被幾個人<b>圍著打</b>也算進膽氣裡 —— 人多不只是打得快,還讓對面先怕。
    // 注意算的是「正在打我的人」而不是「附近的人」:
    // 照附近算的話,對面老遠看見你們四個站成一排就掉頭跑了,架根本打不起來。
    const pinned = attackersOn(f, '');
    // 僵住太久,膽氣就一路垮下去 —— 打不到人的架,誰都不會一直站在那裡
    const stale = clock - lastBlow > STALE_AFTER
      ? (clock - lastBlow - STALE_AFTER) * 6
      : 0;
    const nerve = -stale + f.morale
      + (hurt < 0.32 ? -30 : hurt < 0.55 ? -14 : 0)
      - Math.max(0, pinned - 1) * 9
      + f.war * 0.15;
    // 玩家不會自己逃 —— 那是玩家的決定,不是模擬的
    if (!f.isPlayer && nerve <= 0) {
      f.stance = 'fleeing';
      f.phase = 0;
      const away = Math.atan2(f.x - center().x, f.z - center().z);
      f.yaw = away;
    }
  }
}

function center() {
  let x = 0, z = 0, n = 0;
  for (const f of fighters) { if (alive(f)) { x += f.x; z += f.z; n++; } }
  return n ? { x: x / n, z: z / n } : { x: 0, z: 0 };
}

/* ── 收場 ────────────────────────────────────────────── */

export interface BattleTally {
  won: boolean;
  /** 你這邊倒下的人(npcId)。 */
  fell: string[];
  /**
   * 你這邊嚇跑的人(npcId)。人還在,只是那一場沒撐住 ——
   * 這和「沒回來」是兩件事,收場的時候要分開講。
   */
  scattered: string[];
  /** 打倒的賊。 */
  foesDown: number;
  /** 跑掉的賊。 */
  foesFled: number;
  playerDown: boolean;
}

/** 還在打嗎 — 一方全倒或全跑就結束。 */
export function battleOver(): BattleTally | null {
  const ours = fighters.filter((f) => f.side === 'you');
  const foes = fighters.filter((f) => f.side === 'foe');
  const oursUp = ours.filter(alive);
  const foesUp = foes.filter(alive);
  if (oursUp.length && foesUp.length) return null;
  const me = ours.find((f) => f.isPlayer);
  return {
    won: foesUp.length === 0 && oursUp.length > 0,
    fell: ours.filter((f) => f.stance === 'down' && f.npcId).map((f) => f.npcId!),
    scattered: ours.filter((f) => f.stance === 'fleeing' && f.npcId).map((f) => f.npcId!),
    foesDown: foes.filter((f) => f.stance === 'down').length,
    foesFled: foes.filter((f) => f.stance === 'fleeing').length,
    playerDown: !!me && me.stance === 'down',
  };
}

const clampf = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/* ── 低頻狀態(進 store) ─────────────────────────────── */

interface BattleState {
  /** 正在打的那夥人的 id,null = 沒在打。 */
  bandId: string | null;
  tally: BattleTally | null;
  open: (bandId: string) => void;
  finish: (t: BattleTally) => void;
  clear: () => void;
}

export const useBattle = create<BattleState>((set) => ({
  bandId: null,
  tally: null,
  open: (bandId) => set({ bandId, tally: null }),
  finish: (tally) => set({ tally }),
  clear: () => { fighters.length = 0; set({ bandId: null, tally: null }); },
}));
