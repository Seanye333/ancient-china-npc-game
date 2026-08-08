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
 * 這個檔只有<b>型別,和那幾張每幀都在動的表</b> —— 一行邏輯都沒有。
 *
 * 規則拆在隔壁:開場布陣與每步模擬留在 combat.ts,
 * 戰場留痕 battlefield.ts、調參 tuning.ts、跨檔的可變狀態 state.ts、
 * 低頻的那點狀態 store.ts。
 *
 * 拆的理由很實在:一千行的檔案裡,「這個常數到底是誰在讀」要靠全域搜尋才答得出來,
 * 而那正是最容易改壞的地方 —— 調一個數字,不知道自己動到了幾處。
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
   * 最後一次<b>擋掉/閃開</b>一刀的時刻,以及是怎麼躲的。
   *
   * 從前一刀沒中就是 `return` —— 邏輯上正確,畫面上是<b>一片空白</b>:
   * 兩個人面對面揮了十幾刀,只有其中三四刀看得出發生過事,
   * 其餘全是「揮空了」。可那些多半不是揮空,是被架開的。
   * 把「沒中」分成擋與閃,同一組數字就多出一半看得見的攻防。
   *
   * <b>數值一分不動</b> —— 命中率的算式完全沒碰,擲出來沒中的那些
   * 只是從此有了樣子。平衡鎖(combat.balance.test.ts)因此一動不動。
   */
  guardAt: number;
  guardKind: 'parry' | 'dodge' | null;
  /**
   * 弓手 —— 大寨才有(見 beginBattle)。隔著十來步放箭,你逼近他就退。
   *
   * 他改變的不是數值,是<b>玩家的腳</b>:近戰誰站著誰吃虧只在圍毆裡成立,
   * 有弓的場子裡「站著不動」本身就是挨箭的姿勢。箭有飛行時間,
   * 側著跑就躲得開 —— 這是整個戰鬥第一個逼你走位的東西。
   */
  bow?: boolean;
  /**
   * 義兄弟 —— 他會替你擋那一刀(見 applyHit)。
   *
   * 由外面填而不是在這裡查 oath 的狀態:戰鬥是純邏輯,空跑的場子要能
   * 單獨擺出「帶一個義弟」和「帶一個雇工」兩組來比。
   */
  sworn?: boolean;
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

/** 脫靶插在地上的箭 —— 打完一場,地上要留得下痕跡。 */
export interface StuckArrow {
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  life: number;
}
export const stuckArrows: StuckArrow[] = [];

/** 場上所有人 — 高頻資料,每幀動。 */
export const fighters: Fighter[] = [];

/**
 * 打在身上的那一下 —— 火花、血點。
 *
 * 和 fighters 一樣走模組級陣列:一場架一秒鐘可以有十幾下,
 * 每一下都進 store 的話,zustand 一秒要通知渲染樹十幾次。
 */
export interface Impact {
  x: number; y: number; z: number;
  /** 打過來的方向(單位向量的 xz)—— 火花與血要往這個方向濺。 */
  dx: number; dz: number;
  t: number;
  /** 擋掉的是火星(金屬相擊),打中的是血。 */
  kind: 'spark' | 'blood';
}

export const impacts: Impact[] = [];

export interface Corpse {
  x: number; y: number; z: number; yaw: number;
  side: Side;
  chief: boolean;
  /** 倒下那天。過幾天就收走了 —— 村裡會有人來埋。 */
  day: number;
}

export const corpses: Corpse[] = [];

/** 躺幾天。三天:夠你打完一趟回來看見,又不會積成一片亂葬崗。 */
export const CORPSE_DAYS = 3;

/** 地上的血漬 —— 比屍首留得久一點,雨會沖淡(渲染端管淡)。 */
export interface Stain { x: number; y: number; z: number; r: number; day: number }
export const stains: Stain[] = [];

/** 擋了幾刀、閃了幾刀、中了幾刀 —— 空跑要驗「這三個數加起來等於出手數」。 */
export const guardTally = { parries: 0, dodges: 0, hits: 0 };

/**
 * 打擊感的兩個旋鈕 —— 命中頓一下(hit-stop),放倒一個慢半拍(殺招慢鏡)。
 *
 * 高頻資料,和 fighters 一樣走模組級。渲染端(Battle/Player)每幀讀,
 * 邏輯端只負責在「打中了」的那一刻擰上去。
 *
 * 慢的只有<b>戰鬥模擬</b>,玩家自己的移動不慢 —— 放倒最後一個的那半秒,
 * 全場都凝住而你還能動,那半秒就是「是我砍倒他的」。
 */
export const fx = {
  slow: 0, shake: 0, finisher: 0,
  /** 這一場有沒有人替你擋過刀,擋的是誰 —— 收場那一頁要點名。 */
  shielded: null as string | null,
};

/**
 * 只給空跑用:量「背後那一下」到底占所有攻擊的幾成。
 *
 * 留著是因為它問倒過一次設計 —— 一個看起來很對的機制,量出來只有 1%,
 * 而它的代價有八個百分點的勝率。往這附近加東西之前,先跑 tools/sim/measure.ts。
 */
export const flankTally = { hits: 0, blows: 0 };

export function fighterAt(id: string): Fighter | undefined {
  return fighters.find((f) => f.id === id);
}

export const alive = (f: Fighter) => f.stance !== 'down' && f.stance !== 'fleeing';

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
  /** 結過義的 —— 你要倒下的那一下,他頂上去。 */
  sworn?: boolean;
}

/**
 * 擺開陣勢。雙方隔開一段距離對面站,而不是一開始就抱在一起 ——
 * 那幾秒的逼近是這場架唯一的「前搖」,少了它,遭遇戰會像被偷襲。
 */

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
