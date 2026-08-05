import type { VillageState } from './village';
import type { Season } from '../world/worldTime';

/**
 * 生計 —— 這個遊戲第一次讓錢有地方去。
 *
 * 在這之前 `gold` 只有加沒有減:差事給你錢,錢變成一個越來越大的數字,
 * 然後就沒有然後了。沒有出口的收入不是收入,是計分板 ——
 * 而這個遊戲不該有計分板,它該有<b>過冬</b>。
 *
 * 三條規矩:
 *
 * 一、<b>糧按人頭吃</b>。你帶的人也要吃飯。招人不再是白撿的戰力,
 *     每多一個名字,冬天就早來一天 —— 招募那條線的代價從這裡才算真的成立。
 * 二、<b>米價是活的</b>。收成好就便宜,商路斷就貴(village.ts 早就在算了,
 *     只是先前沒人買得到)。所以買糧的時機本身是一個決定。
 * 三、<b>做工按時辰給錢</b>,而且要花掉你的時辰。一天只有那麼長,
 *     去碼頭扛一天包就沒法去剿匪 —— 這才是白身真正的難處。
 */

/**
 * 一石米夠一個人吃幾天。
 *
 * 漢代口糧約每月一石半到兩石,所以一石大概十八天 —— 第一版寫成三十天,
 * 等於把口糧砍掉四成。差別不只是數字:糧價佔收入的比重從一成七變成三成五,
 * 而<b>那個比重才是「荒年」有沒有份量的關鍵</b>。
 * 米價翻倍的時候,前者只削掉你三成盈餘,後者直接削掉一半。
 */
export const DAYS_PER_SHI = 18;

/** 你和你帶的人今天要吃掉幾天份的口糧。 */
export function mouths(followers: number, retinue: number): number {
  return 1 + followers + retinue;
}

/**
 * 買糧要花多少錢。
 *
 * 零買比躉買貴 —— 一次只買一石的人付的是零售價。這條讓「攢一筆錢一次買足」
 * 成為一個真的划算的決定,而不是無所謂的介面操作。
 */
export function grainCost(village: VillageState, shi: number): number {
  const bulk = shi >= 10 ? 0.88 : shi >= 4 ? 0.95 : 1;
  return Math.max(1, Math.round(village.grainPrice * shi * bulk));
}

/** 賣糧只賣得到八成 —— 糧行不做慈善。 */
export function grainSale(village: VillageState, shi: number): number {
  return Math.max(0, Math.round(village.grainPrice * shi * 0.78));
}

/* ── 短工 ──────────────────────────────────────────── */

export type JobKind = 'field' | 'dock' | 'market' | 'wood';

export interface DayJob {
  kind: JobKind;
  label: string;
  /** 做一趟花幾個時辰(小時)。 */
  hours: number;
  /** 這一趟給幾錢。 */
  pay: number;
  /** 做這個累不累 —— 影響能不能接著再做一趟。 */
  toil: number;
  /** 為什麼今天沒這個活可做。 */
  closed?: string;
}

/**
 * 工錢。
 *
 * 這幾個數字是<b>空跑一年調出來的</b>,不是憑感覺定的 —— 見 economy.sim.test.ts。
 * 第一版一趟給九到十一錢,聽起來很寒酸,實際上是一天的工能買一個月的糧:
 * 空跑一年攢下一萬三千錢,而一間屋子六百二。錢完全沒有意義,
 * 「過冬」這個主題根本不存在,饑荒零挨餓,帶三個人也零挨餓。
 *
 * 現在照著一條規矩定:<b>一天做滿工,大約是兩三天的口糧</b>。
 * 於是一個人餓不死,帶三個人就得靠差事,而不是靠出賣力氣。
 */
const JOB_BASE: Record<JobKind, { label: string; hours: number; pay: number; toil: number }> = {
  field: { label: '下田幫工', hours: 5, pay: 2, toil: 4 },
  dock: { label: '碼頭扛包', hours: 4, pay: 2, toil: 5 },
  market: { label: '市集跑腿', hours: 3, pay: 1, toil: 2 },
  wood: { label: '上山砍柴', hours: 5, pay: 2, toil: 4 },
};

/**
 * 一趟活是<b>半天</b>,而且累。
 *
 * 這件事比工錢多少更要緊:第一版一趟只花三到五個時辰、累個三四分,
 * 於是一天做得完三趟 —— 空跑出來一年一萬三千錢,而一間屋子六百二。
 * 現在體力才是真正的上限,一天做兩趟就直不起腰,
 * 一天的工大約換三四天的口糧,這才是「白身」該有的匯率。
 */

/**
 * 今天有什麼活可做。
 *
 * 活跟著季節與村況走:農忙時田裡搶人、商路斷了碼頭就沒船。
 * 這樣「什麼時候該去做工」本身就是玩家要讀懂的東西,
 * 而不是一張永遠一樣的選單。
 */
export function jobsToday(village: VillageState, season: Season, hour: number): DayJob[] {
  const out: DayJob[] = [];
  const late = hour > 15.5;

  // 農忙加價,冬天田裡沒事
  const farmRush = season === 'spring' || season === 'autumn';
  out.push(job('field', {
    mul: farmRush ? 1.45 : 1,
    closed: season === 'winter' ? '田裡入冬了,沒活。'
      : late ? '這時候下田,天要黑了。' : undefined,
  }));

  // 碼頭吃商路
  out.push(job('dock', {
    mul: 0.7 + village.trade / 100,
    closed: village.trade < 22 ? '商路斷了,碼頭空著。'
      : late ? '今日的船都卸完了。' : undefined,
  }));

  out.push(job('market', {
    mul: 0.8 + village.trade / 140,
    closed: hour < 7 ? '市集還沒開。' : hour > 17 ? '市散了。' : undefined,
  }));

  // 砍柴不看人臉色,但冬天柴貴
  out.push(job('wood', {
    mul: season === 'winter' ? 1.5 : 1,
    closed: late ? '這時候上山,回來就摸黑了。' : undefined,
  }));

  return out;
}

function job(kind: JobKind, o: { mul: number; closed?: string }): DayJob {
  const b = JOB_BASE[kind];
  return {
    kind, label: b.label, hours: b.hours, toil: b.toil,
    pay: Math.max(1, Math.round(b.pay * o.mul)),
    closed: o.closed,
  };
}

/* ── 住處 ──────────────────────────────────────────── */

export type Lodging = 'none' | 'shed' | 'rented' | 'owned';

export const LODGING_LABEL: Record<Lodging, string> = {
  none: '無處落腳',
  shed: '借住柴房',
  rented: '賃了一間',
  owned: '自己的屋',
};

/** 賃屋一旬的租金。買屋要一次拿出這麼多。 */
export const RENT_PER_XUN = 10;
export const HOUSE_PRICE = 620;

/**
 * 養一個人一旬要多少錢 —— <b>他不只吃你的糧,還要月錢</b>。
 *
 * 少了這一條,「帶人」的代價只有糧,而糧便宜到帶十個人也吃不垮你。
 * 加上月錢以後,人手才真的是一筆要按時付的帳:
 * 打工養不起隊伍,只有差事養得起 —— 這正是這個遊戲想說的話。
 */
export const UPKEEP_PER_MAN = 8;

/**
 * 睡一覺回幾分。
 *
 * 露宿當然也能睡,只是睡不好、還可能被摸走東西 ——
 * 「有沒有片瓦」這件事要在身上感覺得到,不能只是一行狀態文字。
 */
export function restQuality(l: Lodging): { healChance: number; risk: number } {
  switch (l) {
    case 'owned': return { healChance: 1, risk: 0 };
    case 'rented': return { healChance: 0.9, risk: 0.02 };
    case 'shed': return { healChance: 0.7, risk: 0.06 };
    default: return { healChance: 0.35, risk: 0.18 };
  }
}

/* ── 官身的俸與百姓的稅 ────────────────────────────── */

/**
 * 一旬的俸祿。
 *
 * 品階在這之前只是兩個上限數字(帶幾個人、接多難的活)。
 * 有了俸,它才第一次<b>按時給你東西</b> —— 也才第一次值得去爭。
 * 白身沒有俸:白身本來就不在官府的簿子上。
 */
export function stipendFor(rank: number): number {
  if (rank >= 11) return 0;        // 白身
  if (rank >= 10) return 18;       // 部曲
  if (rank >= 8) return 60;
  if (rank >= 6) return 150;
  return 320;
}

/**
 * 一年一次的算賦(人頭錢)。
 *
 * 這是這個遊戲裡唯一一筆<b>你什麼都沒做也要付</b>的錢 ——
 * 也正因為如此,它是「白身」這個身分最誠實的一面:
 * 官府不管你今年過得怎麼樣,秋後就是要來收。
 *
 * 有屋要多收一份;帶著的人不算你的,他們各自有各自的戶籍。
 */
export function taxDue(lodging: Lodging): number {
  return 60 + (lodging === 'owned' ? 40 : 0);
}
