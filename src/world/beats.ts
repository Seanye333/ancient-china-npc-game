/**
 * 事件鏡頭 —— 有事發生的時候,鏡頭讓一下。
 *
 * 這個遊戲的鏡頭一整局都掛在主角肩後,只有兩個例外:打架時往後讓一步,
 * 以及放倒最後一個時的那一拍。可世界裡真正該讓人抬頭的時刻不只那兩個 ——
 * 一夥賊從山上下來、身邊的人倒下、有人來投 —— 全都發生在你背後或側面,
 * 而畫面上什麼都沒變:你只會在事後從日誌裡讀到它。
 *
 * 做法刻意極輕:<b>不搶鏡頭</b>,只給解算器一組偏移量(往後拉多少、
 * 抬高多少、視線往那件事偏多少)。所以樹還是會讓路、鏡頭還是不會埋進山裡,
 * 玩家的手也一秒都沒有被拿走 —— 那是這個遊戲的底線。
 *
 * 純數字,不碰 three,所以曲線本身在 vitest 裡驗得到。
 */

export type BeatKind =
  /** 一夥人朝你來了 —— 往後拉開,把他們框進來。 */
  | 'engage'
  /** 身邊的人倒下 —— 短促地帶一下,不煽情。 */
  | 'fell'
  /** 有人來投 / 結義 —— 收近一點,看清楚那張臉。 */
  | 'join';

export interface Beat {
  kind: BeatKind;
  /** 這件事發生在哪。 */
  x: number;
  z: number;
  /** 開始的時刻(秒,三的鐘)。 */
  t0: number;
  /** 演多久。 */
  dur: number;
}

/** 此刻正在演的那一拍。模組級 —— 和 fighters / playerPos 同一套路。 */
export const beat: { now: Beat | null } = { now: null };

const DUR: Record<BeatKind, number> = { engage: 1.5, fell: 1.0, join: 1.3 };
/** 各自的力道:往後拉、抬高、視線往事發處偏。 */
const PULL: Record<BeatKind, [number, number, number]> = {
  // 一夥人來了:退後看全景,視線往他們那邊帶三成
  engage: [0.55, 0.45, 0.30],
  // 有人倒下:略收近、壓低,視線大幅偏過去 —— 這一拍要短
  fell: [-0.18, -0.30, 0.55],
  // 來投:收近看臉
  join: [-0.30, -0.20, 0.42],
};

/**
 * 起一拍。
 *
 * 同時來了兩件事就<b>讓給後來的那一件</b> —— 賊還沒走到跟前,
 * 身邊的人先倒了,那一刻該看的是倒下的人。唯一的例外是已經演到尾聲的
 * 不打斷剛起頭的(否則連著三個人倒下會讓鏡頭抽搐)。
 */
export function strikeBeat(kind: BeatKind, x: number, z: number, t: number) {
  const cur = beat.now;
  if (cur && t - cur.t0 < 0.25 && cur.kind === kind) return;   // 同一拍別疊
  beat.now = { kind, x, z, t0: t, dur: DUR[kind] };
}

export function clearBeat() {
  beat.now = null;
}

export interface BeatPull {
  /** 鏡頭距離的倍率調整(0 = 不動)。 */
  dist: number;
  /** 鏡頭高度的倍率調整。 */
  high: number;
  /** 視線往事發處偏多少(0..1)。 */
  look: number;
  /** 事發處。 */
  x: number;
  z: number;
}

const NONE: BeatPull = { dist: 0, high: 0, look: 0, x: 0, z: 0 };

/**
 * 這一刻該讓多少。
 *
 * 曲線用的是 sin(π·k):<b>進得快、出得慢是錯的</b> ——
 * 鏡頭一下子彈出去再慢慢收回來,讀起來像被撞了一下。
 * 對稱的一進一出才像「看過去,然後回來」。
 */
export function beatPull(t: number): BeatPull {
  const b = beat.now;
  if (!b) return NONE;
  const k = (t - b.t0) / b.dur;
  if (k < 0 || k >= 1) {
    if (k >= 1) beat.now = null;
    return NONE;
  }
  const e = Math.sin(k * Math.PI);
  const [d, h, l] = PULL[b.kind];
  return { dist: d * e, high: h * e, look: l * e, x: b.x, z: b.z };
}
