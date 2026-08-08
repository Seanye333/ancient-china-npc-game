import { pickShield } from './oath';
import type { Fighter, Recruit, BandSpec, BattleTally, Side } from './combat/types';
import {
  fighters, arrows, arrowTally, stuckArrows, guardTally, flankTally, fx,
  alive, fighterAt, impacts,
} from './combat/types';
import { sim } from './combat/state';
import { addImpact, layDown } from './combat/battlefield';
import { useBattle } from './combat/store';
import {
  REACH, SWING, HIT_AT, RECOVER, MOVE, FLEE,
  BOW_RANGE, BOW_KEEP, BOW_COOL, ARROW_SPEED, ARROW_G,
  SURROUND_PENALTY, SURROUND_CAP, FLANK_BONUS, FLANK_MORALE,
  MAX_ATTACKERS, STALE_AFTER,
} from './combat/tuning';

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
 *
 * 這個檔留的是<b>模擬本身</b>:開場布陣、每一步走位與出手、命中與傷害、箭、收場。
 * 拆出去的五塊各有各的理由:型別 types、調參 tuning、跨檔狀態 state、
 * 打完留在地上的 battlefield、低頻狀態 store —— 而模擬<b>沒有拆</b>:
 * 開場與每一步共用同一組節奏參數與同一顆骰子,拆開只會讓那條線更難讀。
 *
 * 舊的 import 路徑一個都沒變:這個檔同時是那五塊的出口(見檔尾的 re-export)。
 */

/* ── 開打 ────────────────────────────────────────────── */

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
  /** 今天第幾天 —— 屍首要記在哪一天倒的。不給就沿用上一次。 */
  day?: number;
  rng?: () => number;
}) {
  sim.rand = input.rng ?? Math.random;
  sim.clock = 0;
  sim.lastBlow = 0;
  fighters.length = 0;
  arrows.length = 0;
  arrowTally.loosed = 0;
  impacts.length = 0;
  guardTally.parries = 0; guardTally.dodges = 0; guardTally.hits = 0;
  sim.day = input.day ?? sim.day;
  fx.shielded = null;
  // 屍首與血漬<b>不清</b> —— 那是上一場留下的,清了就等於沒留過

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
    if (r.sworn) f.sworn = true;
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
    const war = Math.round(24 + band.fierce * 36 + (chief ? 8 : 0) + sim.rand() * 9);
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
      f.cool = 1.6 + i * 2.0 + sim.rand() * 1.2;
      f.x += (sim.rand() - 0.5) * 7;           // 各睡各的,不是列隊等你
      f.z += (sim.rand() - 0.5) * 7;
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
    targetId: null, cool: 0.4 + sim.rand() * 0.5, stance: 'closing',
    phase: 0, hurtAt: -9, guardAt: -9, guardKind: null,
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
  sim.clock += dt;

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
        f.cool = Math.max(f.cool, RECOVER + sim.rand() * 0.35);
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
            f.cool = BOW_COOL + sim.rand() * 0.9;
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
        /*
         * 這裡曾經有一段「已經有人纏著他,我就繞後面去」。空跑之後拿掉了,
         * 而拿掉的理由值得留著 —— 免得哪天有人照著同一個直覺再寫一次。
         *
         * 量出來的是:繞後<b>幾乎不會發生</b>。四個局面裡三個是 0%,
         * 最擠的五打五也只有 1% 的攻擊落在背後。原因是結構性的 ——
         * 這個模型裡<b>每個人每幀都轉身面對自己的目標</b>(f.yaw = atan2 ...),
         * 所以「背後」這個位置存在不到一秒就沒了。
         *
         * 而代價是實打實的:繞路的那幾步不砍人,純粹是節奏損失。
         * 五打五兇的勝率從 0.43 掉到 0.35 —— 掉的不是被包抄打的,
         * 是自己人在繞圈。一個 1% 的機制換八個百分點的勝率,不划算。
         *
         * 留下來的是<b>玩家自己繞</b>那一半:走位是真人在控的,
         * 他真的繞到背後去,命中加成與士氣打擊照樣生效(見 flankOf)。
         * 那一半不花任何代價,而且是玩家<b>能決定</b>的事 ——
         * 這本來就是「隊形」該給的東西。
         */
        const gx = dx, gz = dz;
        const gd = d || 1;
        const step = Math.min(MOVE * dt, Math.max(0.02, d - f.reach * 0.8));
        const got = slide(f.x, f.z, f.x + (gx / gd) * step, f.z + (gz / gd) * step);
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
  const ax = tgt.x + (sim.rand() - 0.5) * spread;
  const az = tgt.z + (sim.rand() - 0.5) * spread;
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
    dmg: (7.2 + f.war * 0.11) * (0.75 + sim.rand() * 0.5),
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
        applyHit(f, a.dmg, a.x - a.vx, a.z - a.vz);
        hit = true;
        break;
      }
    }
    const grounded = a.y < ground(a.x, a.z) + 0.04;
    if (grounded && !hit) {
      // 插在土裡,斜著,箭羽朝天 —— 半分鐘後自己爛掉
      const L = Math.hypot(a.vx, a.vy, a.vz) || 1;
      stuckArrows.push({
        x: a.x, y: ground(a.x, a.z), z: a.z,
        dx: a.vx / L, dy: a.vy / L, dz: a.vz / L, life: 30,
      });
    }
    if (hit || a.life <= 0 || grounded) arrows.splice(i, 1);
  }
  for (let i = stuckArrows.length - 1; i >= 0; i--) {
    stuckArrows[i].life -= dt;
    if (stuckArrows[i].life <= 0) stuckArrows.splice(i, 1);
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

/**
 * 這一下是從哪個方向來的。0 = 正面,1 = 正背後。
 *
 * 純函式,因為它是這條規則的全部 —— 空跑要拿它算,測試要拿它釘。
 */
export function flankOf(
  from: { x: number; z: number }, target: { x: number; z: number; yaw: number },
): number {
  const dx = from.x - target.x, dz = from.z - target.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  // 對方面朝 (sin yaw, cos yaw);我在他前面時點積為正
  const facing = (Math.sin(target.yaw) * dx + Math.cos(target.yaw) * dz) / d;
  return Math.max(0, -facing);
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
      dmg: (7.2 + f.war * 0.11) * (0.75 + sim.rand() * 0.5),
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
  // 繞到背後那一下最狠 —— 人多的用處在這裡,不在多一個人站著
  const flank = flankOf(f, tgt) * FLANK_BONUS;
  /*
   * 一寸長一寸強 —— 長兵的優勢做在<b>命中</b>上,不是傷害上。
   *
   * 第一版只給矛加了 reach,空跑五十場矛 23 勝、刀 32 勝:接近時多戳到的
   * 那零點一五秒,貼身以後全還回去了 —— 這個模型裡沒有「拒止」,
   * reach 只是白佔一個格子。拿短傢伙的人得先擠進來才打得到,
   * 這件事就是命中率:對面的桿子比你的長,你每一下都是冒著戳臉遞進去的。
   */
  const reachEdge = (f.reach - tgt.reach) * 0.22;
  const chance = clampf(
    0.44 + (f.war - tgt.war) / 190 + crowd + flank + reachEdge, 0.15, 0.90);
  if (sim.rand() > chance) {
    /*
     * 沒中 —— 但沒中<b>也有樣子</b>。
     *
     * 站定了對砍的人是<b>架開</b>那一刀(兵器相擊,火星);
     * 正在逼近、剛挨過打、或者被繞到背後的人來不及架,只能<b>閃</b>。
     * 這一段一分數值都沒改:上面那個 chance 和從前一模一樣,
     * 擲出來沒中的那些只是從此看得見。
     */
    const canParry = tgt.stance === 'engaged' || tgt.stance === 'striking';
    tgt.guardAt = sim.clock;
    tgt.guardKind = canParry ? 'parry' : 'dodge';
    if (canParry) {
      guardTally.parries++;
      addImpact(f.x, f.z, tgt, 'spark');
      // 架開也是要力氣的 —— 下一刀慢一點點。這一項小到不動勝率,
      // 但它讓「一直被壓著打」在手感上真的比較吃虧
      tgt.cool = Math.max(tgt.cool, 0.06);
    } else {
      guardTally.dodges++;
    }
    return;
  }
  guardTally.hits++;

  applyHit(tgt, (6.5 + f.war * 0.10) * f.dmgMul * (0.75 + sim.rand() * 0.6), f.x, f.z);
  // 背後挨的那一下另外掉士氣 —— 「被包了」該是感覺得到的
  if (flank > FLANK_BONUS * 0.6 && alive(tgt)) {
    tgt.morale -= FLANK_MORALE;
    flankTally.hits++;
  }
  flankTally.blows++;
}

/**
 * 挨了一下 —— 刀和箭共用的那半段:掉血、閃紅、驚醒、頓幀、倒地與士氣。
 * 刀在這之前擲過命中,箭沒有 —— 箭的「命中率」是空間裡飛出來的。
 */
/**
 * 挨了一下。
 *
 * 血點<b>擺在這裡</b>而不是擺在刀那一路 —— 因為挨打不只一種來源:
 * 第一版只讓刀濺血,結果驗收裡打了二十秒一滴血都沒有,
 * 原因是那一場的三個近戰卡在障礙後面過不來,真正在打人的是<b>弓手</b>,
 * 而箭走的是另一條路。凡是掉血的地方只有一處,血就只該畫在那一處。
 */
function applyHit(tgt: Fighter, dmg: number, fromX?: number, fromZ?: number) {
  sim.lastBlow = sim.clock;
  if (fromX !== undefined && fromZ !== undefined) {
    addImpact(fromX, fromZ, tgt, 'blood');
  }
  /*
   * 義兄弟替你擋那一刀。
   *
   * 判在「這一下會要了你」的時候,不是每一下都擋 —— 擋成一層護甲的話,
   * 它就從一個時刻變成一個數值。一場只擋一次(fx.shielded 記帳),
   * 而且擋的人自己倒下:誓言值錢,恰恰在它讓他付出一切的那一刻。
   */
  if (tgt.isPlayer && tgt.hp - dmg <= 0 && fx.shielded === null) {
    const guard = pickShield(fighters.filter(
      (f) => f.side === tgt.side && f.sworn && alive(f) && !f.isPlayer));
    if (guard) {
      fx.shielded = guard.npcId ?? guard.id;
      guard.hp = 0;
      guard.stance = 'down';
      guard.phase = 0;
      layDown(guard, sim.day);
      // 他把你推開了。留下的不能只是一口氣 —— 空跑出來的:
      // 撈回一成八的血,下一刀照樣要你的命,倒地率一個點都沒動
      tgt.hp = Math.max(1, tgt.maxHp * 0.35);
      tgt.hurtAt = sim.clock;
      fx.slow = 0.85;
      fx.shake = Math.max(fx.shake, 0.7);
      /*
       * 這一下<b>不能走 shakeMorale</b>。
       *
       * 那個函式算的是「我方少了一個人」:我方 −15、對面 +5 ——
       * 於是他替你死的那一刻,反而幫了對面一把。可是一個肯橫過來擋刀的人,
       * 在場上兩邊看見的根本不是同一件事:你這邊是死戰,對面是
       * 「這夥人是肯替人死的」。所以兩邊都往同一個方向動,而且動得比誰倒下都大。
       */
      for (const g of fighters) {
        if (!alive(g)) continue;
        if (g.side === guard.side) g.morale += 18;
        else g.morale -= 22;
      }
      return;
    }
  }
  tgt.hp -= dmg;
  tgt.hurtAt = sim.clock;
  // 睡夢裡挨刀的人也醒了 —— 不清這個 cool,他會站著挨砍到排程醒來,像個木樁
  if (tgt.cool > 1.2) tgt.cool = 0.6;
  // 命中頓一下;自己挨打晃得比打中人狠 —— 疼要疼在鏡頭上
  fx.slow = Math.max(fx.slow, 0.05);
  fx.shake = Math.max(fx.shake, tgt.isPlayer ? 0.5 : 0.16);
  if (tgt.hp <= 0) {
    tgt.hp = 0;
    tgt.stance = 'down';
    tgt.phase = 0;
    layDown(tgt, sim.day);
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
  if (sim.clock < 2.5) return;
  for (const f of fighters) {
    if (!alive(f)) continue;
    // 自己傷得重也會怕
    const hurt = f.hp / f.maxHp;
    // 被幾個人<b>圍著打</b>也算進膽氣裡 —— 人多不只是打得快,還讓對面先怕。
    // 注意算的是「正在打我的人」而不是「附近的人」:
    // 照附近算的話,對面老遠看見你們四個站成一排就掉頭跑了,架根本打不起來。
    const pinned = attackersOn(f, '');
    // 僵住太久,膽氣就一路垮下去 —— 打不到人的架,誰都不會一直站在那裡
    const stale = sim.clock - sim.lastBlow > STALE_AFTER
      ? (sim.clock - sim.lastBlow - STALE_AFTER) * 6
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

/**
 * 開一場切磋。單挑 —— 你的人不上,他的臉面也不許別人上。
 */
export function beginSpar(input: {
  me: { name: string; war: number; weapon?: { reach: number; dmgMul: number } };
  foe: { npcId: string; name: string; war: number };
  at: { x: number; z: number };
  ground: (x: number, z: number) => number;
}) {
  sim.rand = Math.random;
  sim.clock = 0;
  sim.lastBlow = 0;
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

/* ── 出口 ──────────────────────────────────────────────
 *
 * 這一批 re-export 是<b>刻意</b>的:拆檔是為了讓寫這一塊的人好找東西,
 * 不是為了讓其他二十個檔案跟著改 import。
 * `from './combat'` 在拆之前拿得到什麼,拆之後就還拿得到什麼。
 */
export type {
  Side, Stance, Fighter, Arrow, StuckArrow, Impact, Corpse, Stain,
  BandSpec, Recruit, BattleTally,
} from './combat/types';
export {
  fighters, arrows, arrowTally, stuckArrows, impacts, corpses, stains,
  guardTally, flankTally, fx, alive, fighterAt, CORPSE_DAYS,
} from './combat/types';
export { battleTime } from './combat/state';
export { ageBattlefield } from './combat/battlefield';
export { useBattle } from './combat/store';
export { REACH } from './combat/tuning';
