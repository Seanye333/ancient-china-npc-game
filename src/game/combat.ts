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
  /** 兵器夠得著的距離。人各一把 —— 拳腳要貼上去,矛隔一步就戳得到。 */
  reach: number;
  /** 兵器的傷害係數。 */
  dmgMul: number;
  /** 最後一次挨打的時刻,用來閃紅。 */
  hurtAt: number;
  /**
   * 弓手 —— 大寨才有(見 beginBattle)。隔著十來步放箭,你逼近他就退。
   *
   * 他改變的不是數值,是<b>玩家的腳</b>:近戰誰站著誰吃虧只在圍毆裡成立,
   * 有弓的場子裡「站著不動」本身就是挨箭的姿勢。箭有飛行時間,
   * 側著跑就躲得開 —— 這是整個戰鬥第一個逼你走位的東西。
   */
  bow?: boolean;
}

/** 一支在飛的箭。命中判定在 stepArrows —— 躲箭靠腳,不靠擲骰。 */
export interface Arrow {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  side: Side;
  dmg: number;
  life: number;
}

export const arrows: Arrow[] = [];
/** 放過幾箭 —— 渲染端靠它配弓弦聲,測試靠它驗「弓手真的在射」。 */
export const arrowTally = { loosed: 0 };

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
 * 打擊感的兩個旋鈕 —— 命中頓一下(hit-stop),放倒一個慢半拍(殺招慢鏡)。
 *
 * 高頻資料,和 fighters 一樣走模組級。渲染端(Battle/Player)每幀讀,
 * 邏輯端只負責在「打中了」的那一刻擰上去。
 *
 * 慢的只有<b>戰鬥模擬</b>,玩家自己的移動不慢 —— 放倒最後一個的那半秒,
 * 全場都凝住而你還能動,那半秒就是「是我砍倒他的」。
 */
export const fx = { slow: 0, shake: 0, finisher: 0 };

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
 * 弓的參數 —— 和近戰一樣是空跑調的,見 combat.balance.test.ts。
 * 箭速決定「躲不躲得開」:十來步的距離飛過來要大半秒,
 * 側著跑兩步就讓過去了;站樁的人(和直線衝鋒的同伴)才會挨。
 */
const BOW_RANGE = 15;               // 這個距離內才射
const BOW_KEEP = 5.0;               // 逼近到這裡他就往後退
const BOW_COOL = 2.6;               // 兩箭之間
const ARROW_SPEED = 15;
const ARROW_G = 7;                  // 拋物線的墜 — 樣式化的重力,別當物理讀

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
  /** 手上的傢伙。省略 = 尋常的刀(1.35 / 1.0)。bow = 空白鍵放的是箭。 */
  weapon?: { reach: number; dmgMul: number; bow?: boolean };
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
  /**
   * 夜襲 —— 對面是從夢裡爬起來的。
   *
   * 手感上是三件事:起手慢(摸刀都要摸半天)、膽氣先掉一截
   * (黑燈瞎火不知道來了多少人)、站位散(本來各睡各的)。
   * 數值全在這裡,判定(摸得夠近、有沒有哨)在外面 —— 這個函式不看時辰。
   */
  sleeping?: boolean;
  /** 弓手幾把 —— 平常由 count 推(見下),調參要能單獨關掉它量基線。 */
  archers?: number;
  rng?: () => number;
}) {
  rand = input.rng ?? Math.random;
  clock = 0;
  lastBlow = 0;
  fighters.length = 0;
  arrows.length = 0;
  arrowTally.loosed = 0;

  const { band, at, ground } = input;
  const toBand = Math.atan2(band.x - at.x, band.z - at.z);
  /**
   * 大寨有弓手 —— 四人以上一個,八人以上兩個,<b>替換</b>隊尾的刀手而不是白加。
   * 這是「這夥人大不大」在打法上的兌現:小股毛賊撲上來就是了,
   * 端大寨得一邊躲箭一邊突臉,不然同伴會在半路上被一支支釘下來。
   */
  const bowmen = input.archers ?? (band.count >= 8 ? 2 : band.count >= 4 ? 1 : 0);

  input.ours.forEach((r, i) => {
    const off = (i - (input.ours.length - 1) / 2) * 1.15;
    const x = at.x + Math.cos(toBand) * off;
    const z = at.z - Math.sin(toBand) * off;
    const f = mk({
      id: r.id, side: 'you', name: r.name, npcId: r.npcId,
      x, z, y: ground(x, z), yaw: toBand,
      war: r.war, morale: 30 + (input.leadership ?? 50) * 0.25, isPlayer: !!r.isPlayer,
      driven: r.driven ?? !!r.isPlayer,
      reach: r.weapon?.reach ?? REACH, dmgMul: r.weapon?.dmgMul ?? 1,
    });
    if (r.weapon?.bow) f.bow = true;
    fighters.push(f);
  });

  for (let i = 0; i < band.count; i++) {
    const chief = i === 0;
    const bow = i >= band.count - bowmen;
    const off = (i - (band.count - 1) / 2) * 1.25;
    // 弓手站在刀手身後幾步 —— 陣形本身就把「先破誰」擺給你看
    const back = bow ? 3.2 : 0;
    const x = band.x + Math.cos(toBand) * off + Math.sin(toBand) * back;
    const z = band.z - Math.sin(toBand) * off + Math.cos(toBand) * back;
    // 賊是烏合之眾:單論身手不如你的人,可怕的是<b>數量</b>。
    // 第一版把他們調得比村民還能打,於是三打三只有一成勝率 —— 那不叫難,叫沒得打。
    const war = Math.round(24 + band.fierce * 36 + (chief ? 8 : 0) + rand() * 9);
    const f = mk({
      id: `${band.id}-${i}`, side: 'foe', name: bow ? '弓手' : chief ? '賊首' : '山賊',
      chief, x, z, y: ground(x, z), yaw: toBand + Math.PI,
      war, morale: 26 + band.fierce * 24 + (chief ? 18 : 0), isPlayer: false, driven: false,
      // 弓手貼了身只有短傢伙 —— 突進去他就是全場最軟的一個
      reach: bow ? 1.0 : REACH, dmgMul: bow ? 0.7 : 1,
    });
    if (bow) f.bow = true;
    if (input.sleeping) {
      /*
       * 夜襲的核心不是「他們變弱」,是<b>他們不會一起醒</b>。
       *
       * 醒的時刻按人頭排開(2、4、6 秒⋯⋯):你衝進去的時候只有一個人
       * 摸到了刀,放倒他,第二個才剛坐起來 —— 各個擊破,
       * 一場 2v4 打成四場 1v1 帶幫手。第一版全體同時慢兩秒,
       * 空跑出來 4/60 對 0/60:慢兩秒翻不了一場人數劣勢的盤,
       * <b>只有「不同時」翻得了</b>。
       * 睡夢裡挨刀的人也醒得快 —— 挨打會立刻清醒(見 hurtAt 那條)。
       */
      f.morale -= 20;
      f.cool = 1.6 + i * 2.0 + rand() * 1.2;
      f.x += (rand() - 0.5) * 7;           // 各睡各的,不是列隊等你
      f.z += (rand() - 0.5) * 7;
      f.y = ground(f.x, f.z);
    }
    fighters.push(f);
  }
  useBattle.getState().open(band.id);
  if (input.sleeping) useBattle.setState({ nightRaid: true });
}

function mk(p: {
  id: string; side: Side; name: string; npcId?: string; chief?: boolean;
  x: number; y: number; z: number; yaw: number;
  war: number; morale: number; isPlayer: boolean; driven: boolean;
  reach: number; dmgMul: number;
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
      // 收招的冷卻取較大者 —— 弓手放箭也走 striking 做拉弓動作,
      // 直接覆寫會把 BOW_COOL 洗成收招的 0.7 秒,弓手就成了機關枪
      if (f.phase >= 1) {
        f.stance = 'engaged'; f.phase = 0;
        f.cool = Math.max(f.cool, RECOVER + rand() * 0.35);
      }
      continue;
    }
    if (f.stance === 'reeling') {
      f.phase += dt / 0.34;
      if (f.phase >= 1) { f.stance = 'engaged'; f.phase = 0; }
      continue;
    }

    /**
     * 弓手的風箏:遠了追、近了退,<b>弦一滿就放,退著也放</b>。
     *
     * 第一版只有站定才射,空跑五十場弓 3 勝對拳 3 勝 —— 從被逼近到被貼身
     * 的整段路上一箭不放,弓等於只在開場射了一兩下。現在射擊優先於走位:
     * 放箭的那半秒(striking 相位)人是站住的,被追近一步半 —— 這就是
     * 弓的代價,不必另外扣什麼。真被貼到一步七以內才掉進近戰,
     * 手裡那根軟棍自己說話。
     */
    if (f.bow && !f.driven) {
      const foe = nearestFoe(f);
      if (foe) {
        const dx = foe.x - f.x, dz = foe.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.7) {
          f.yaw = Math.atan2(dx, dz);
          if (f.cool <= 0 && d <= BOW_RANGE) {
            loose(f, foe, d);
            f.cool = BOW_COOL + rand() * 0.9;
            continue;
          }
          if (d < BOW_KEEP) {
            // 退著走,臉還朝著你 —— 弓手最怕的就是讓你貼上
            const st = MOVE * 0.86 * dt;
            const got = slide(f.x, f.z, f.x - (dx / d) * st, f.z - (dz / d) * st);
            f.x = got.x; f.z = got.z; f.y = ground(f.x, f.z);
            f.stance = 'closing';
            f.phase = (f.phase + dt * 5) % 1;
          } else if (d > BOW_RANGE) {
            const st = MOVE * dt;
            const got = slide(f.x, f.z, f.x + (dx / d) * st, f.z + (dz / d) * st);
            f.x = got.x; f.z = got.z; f.y = ground(f.x, f.z);
            f.stance = 'closing';
            f.phase = (f.phase + dt * 5) % 1;
          } else {
            f.stance = 'engaged';
          }
          continue;
        }
      }
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
      if (d > f.reach) {
        const step = Math.min(MOVE * dt, d - f.reach * 0.8);
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

  stepArrows(dt, ground);
  reapAndRally();
}

/**
 * 放一箭。瞄的是<b>此刻</b>的人 —— 不帶提前量。
 *
 * 這是刻意的:箭飛十來步要大半秒,朝著現在的位置射,側著跑的人自然讓過去。
 * 「弓手可怕」和「箭躲得開」必須同時成立,躲開的辦法就是別站著。
 * 散布隨距離放大 —— 遠箭是威嚇,近箭才要命。
 */
function loose(f: Fighter, tgt: Fighter, d: number) {
  const t = d / ARROW_SPEED;
  const spread = 0.4 + d * 0.055;
  const ax = tgt.x + (rand() - 0.5) * spread;
  const az = tgt.z + (rand() - 0.5) * spread;
  const y0 = f.y + 1.35;
  const ty = tgt.y + 0.95;
  arrows.push({
    x: f.x, y: y0, z: f.z,
    vx: (ax - f.x) / t,
    vy: (ty - y0) / t + 0.5 * ARROW_G * t,
    vz: (az - f.z) / t,
    side: f.side,
    // 一箭要配得上他頂替的那把刀:第一版 5.5+0.09war,空跑出來「有弓的寨
    // 比沒弓的好打十五個點」;「退著也放」之後又收回一點,不然需人承諾壓線
    dmg: (7.2 + f.war * 0.11) * (0.75 + rand() * 0.5),
    life: 2.4,
  });
  arrowTally.loosed++;
  // 拉弓也是個動作 —— 渲染端拿 striking 的相位做開弓,傷害不從這裡走
  f.stance = 'striking';
  f.phase = 0;
}

/** 箭往前飛。命中查的是<b>這一步掃過的線段</b>,不是端點 —— 箭一幀半步,查點會穿人。 */
function stepArrows(dt: number, ground: (x: number, z: number) => number) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    const px = a.x, py = a.y, pz = a.z;
    a.vy -= ARROW_G * dt;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    a.life -= dt;

    let hit = false;
    for (const f of fighters) {
      if (f.side === a.side || !alive(f)) continue;
      if (segDist(px, py, pz, a.x, a.y, a.z, f.x, f.y + 1.0, f.z) < 0.55) {
        applyHit(f, a.dmg);
        hit = true;
        break;
      }
    }
    if (hit || a.life <= 0 || a.y < ground(a.x, a.z) + 0.04) arrows.splice(i, 1);
  }
}

/** 點到線段的距離 —— 箭的掃掠命中用。 */
function segDist(
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  px: number, py: number, pz: number,
): number {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const L2 = dx * dx + dy * dy + dz * dz;
  const t = L2 === 0 ? 0
    : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy + (pz - z0) * dz) / L2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t), pz - (z0 + dz * t));
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

/** 玩家出手 — 由鍵盤觸發,不看冷卻以外的東西。拿弓的人放的是箭。 */
export function playerStrike(id: string): boolean {
  const f = fighterAt(id);
  if (!f || f.stance === 'down' || f.stance === 'striking' || f.cool > 0) return false;
  if (f.bow && f.driven) {
    /**
     * 玩家的箭<b>朝你面對的方向</b>飛,不鎖定任何人 —— 和揮刀打扇區同一個
     * 立場:瞄準是你的事。平射,十幾步外落地;誰站在這條線上誰挨。
     */
    const y0 = f.y + 1.35;
    const t = 13 / ARROW_SPEED;
    arrows.push({
      x: f.x, y: y0, z: f.z,
      vx: Math.sin(f.yaw) * ARROW_SPEED,
      vy: -0.4 / t + 0.5 * ARROW_G * t,
      vz: Math.cos(f.yaw) * ARROW_SPEED,
      side: f.side,
      // 和 loose() 同一條傷害式 —— 誰放的箭都是箭
      dmg: (7.2 + f.war * 0.11) * (0.75 + rand() * 0.5),
      life: 2.0,
    });
    arrowTally.loosed++;
    f.cool = 1.7;               // 搭箭上弦比揮一刀慢 —— 弓的代價在節奏裡
  }
  f.stance = 'striking';
  f.phase = 0;
  return true;
}

/** 命中判定。玩家打的是<b>面前的扇區</b>,不是鎖定的目標 —— 揮空要能揮空。 */
function resolveStrike(f: Fighter) {
  // 真人拿弓,striking 是拉弓的動作,傷害全在箭上 —— 這裡不再補一下近戰,
  // 不然點著臉放箭等於箭刀齊下。被貼身的弓手的「防身」就是抵著放的那一箭
  if (f.bow && f.driven) return;
  const tgt = f.isPlayer ? inFront(f) : (f.targetId ? fighterAt(f.targetId) : null);
  if (!tgt || !alive(tgt)) return;
  if (Math.hypot(tgt.x - f.x, tgt.z - f.z) > f.reach * 1.5) return;

  const crowd = Math.min(SURROUND_CAP, attackersOn(tgt, f.id) * SURROUND_PENALTY);
  /*
   * 一寸長一寸強 —— 長兵的優勢做在<b>命中</b>上,不是傷害上。
   *
   * 第一版只給矛加了 reach,空跑五十場矛 23 勝、刀 32 勝:接近時多戳到的
   * 那零點一五秒,貼身以後全還回去了 —— 這個模型裡沒有「拒止」,
   * reach 只是白佔一個格子。拿短傢伙的人得先擠進來才打得到,
   * 這件事就是命中率:對面的桿子比你的長,你每一下都是冒著戳臉遞進去的。
   */
  const reachEdge = (f.reach - tgt.reach) * 0.22;
  const chance = clampf(0.44 + (f.war - tgt.war) / 190 + crowd + reachEdge, 0.15, 0.90);
  if (rand() > chance) return;

  applyHit(tgt, (6.5 + f.war * 0.10) * f.dmgMul * (0.75 + rand() * 0.6));
}

/**
 * 挨了一下 —— 刀和箭共用的那半段:掉血、閃紅、驚醒、頓幀、倒地與士氣。
 * 刀在這之前擲過命中,箭沒有 —— 箭的「命中率」是空間裡飛出來的。
 */
function applyHit(tgt: Fighter, dmg: number) {
  lastBlow = clock;
  tgt.hp -= dmg;
  tgt.hurtAt = clock;
  // 睡夢裡挨刀的人也醒了 —— 不清這個 cool,他會站著挨砍到排程醒來,像個木樁
  if (tgt.cool > 1.2) tgt.cool = 0.6;
  // 命中頓一下;自己挨打晃得比打中人狠 —— 疼要疼在鏡頭上
  fx.slow = Math.max(fx.slow, 0.05);
  fx.shake = Math.max(fx.shake, tgt.isPlayer ? 0.5 : 0.16);
  if (tgt.hp <= 0) {
    tgt.hp = 0;
    tgt.stance = 'down';
    tgt.phase = 0;
    // 放倒一個 —— 慢半拍,讓那一下看得清
    fx.slow = 0.42;
    fx.shake = Math.max(fx.shake, 0.45);
    shakeMorale(tgt);
    /**
     * 最後一個 —— 全場最重的一拍。慢鏡拉長,鏡頭壓低推近(見 Player.tsx)。
     * 只認「放倒收尾」:對面全是嚇跑的就不擺這個譜,追著潰兵拍特寫很滑稽。
     */
    if (tgt.side === 'foe' && !fighters.some((g) => g.side === 'foe' && alive(g))
        && fighters.some((g) => g.side === 'you' && alive(g))) {
      fx.slow = 0.85;
      fx.finisher = 1.3;
    }
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
    if (d > f.reach * 1.6) continue;
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
  /**
   * 切磋 —— 點到為止的打。
   *
   * 和真打共用整個戰鬥系統(走位、揮刀、士氣、姿態全部一樣),
   * 只在<b>收場</b>那一刻分岔:沒有戰利品、沒有折損、輸了不掉錢不受傷。
   * 對面認輸(逃)或倒地都算分出勝負 —— 倒地在切磋裡是「被放倒」,不是死。
   */
  sparring: boolean;
  /** 切磋的對手(npcId)—— 收場要記人情。 */
  sparWith: string | null;
  /** 這一場是夜襲 —— HUD 要說一句,收場的文案也不一樣。 */
  nightRaid: boolean;
  tally: BattleTally | null;
  open: (bandId: string) => void;
  finish: (t: BattleTally) => void;
  clear: () => void;
}

export const useBattle = create<BattleState>((set) => ({
  bandId: null,
  sparring: false,
  sparWith: null,
  nightRaid: false,
  tally: null,
  open: (bandId) => set({ bandId, tally: null, sparring: false, sparWith: null, nightRaid: false }),
  finish: (tally) => set({ tally }),
  clear: () => {
    fighters.length = 0;
    arrows.length = 0;
    set({ bandId: null, tally: null, sparring: false, sparWith: null, nightRaid: false });
  },
}));

/**
 * 開一場切磋。單挑 —— 你的人不上,他的臉面也不許別人上。
 */
export function beginSpar(input: {
  me: { name: string; war: number; weapon?: { reach: number; dmgMul: number } };
  foe: { npcId: string; name: string; war: number };
  at: { x: number; z: number };
  ground: (x: number, z: number) => number;
}) {
  rand = Math.random;
  clock = 0;
  lastBlow = 0;
  fighters.length = 0;
  arrows.length = 0;
  const { at, ground } = input;
  fighters.push(mk({
    id: 'you', side: 'you', name: input.me.name,
    x: at.x, z: at.z, y: ground(at.x, at.z), yaw: 0,
    war: input.me.war, morale: 60, isPlayer: true, driven: true,
    reach: input.me.weapon?.reach ?? REACH, dmgMul: input.me.weapon?.dmgMul ?? 1,
  }));
  const fx = at.x + 4, fz = at.z + 3;
  fighters.push(mk({
    id: `spar-${input.foe.npcId}`, side: 'foe', name: input.foe.name, npcId: input.foe.npcId,
    x: fx, z: fz, y: ground(fx, fz), yaw: Math.PI,
    war: input.foe.war, morale: 46, isPlayer: false, driven: false,
    reach: REACH, dmgMul: 0.85,          // 切磋拿的是棍,不是刀
  }));
  useBattle.setState({ bandId: 'spar', tally: null, sparring: true, sparWith: input.foe.npcId });
}
