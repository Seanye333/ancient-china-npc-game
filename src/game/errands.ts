import type { Npc, Trade } from './npcs';
import type { VillageState } from './village';
import type { Band } from './bands';
import { rng } from '../world/field';
import { rankForMerit, RANK_COMMONER, RANK_RETAINER, type Stats } from './hero';
import { wayWord } from './quest';

/**
 * 差事 — 從人嘴裡接的活。
 *
 * 四條規矩,每一條都是為了讓活「像是這個村子真的需要」:
 *
 * 一、<b>活從村子的處境長出來</b>。治安低才有匪剿、商路旺才有鏢押、
 *     秋收才有糧要護。村民抱怨的事和你能接的活是同一件事。
 * 二、<b>誰給的活跟他的行當對得上</b>。佃農請你護糧,不會請你押鏢;
 *     船工託你的事在河上。給錯了人,對話就不可信。
 * 三、<b>會賠</b>。人手不夠硬接會折人、會傷。這條不成立的話,
 *     所有的「要不要接」都不是選擇。
 * 四、<b>剿匪指的是地圖上真的那一夥</b>。難度、要幾個人、酬勞多少,
 *     全部從那夥人實際有幾個、有多兇算出來 —— 委託人說的話和你走過去
 *     看見的東西必須是同一件事。剩下三種活目前還是抽象結算(resolve),
 *     那是誠實的欠帳,不是設計。
 */

export type ErrandKind = 'bandits' | 'escort' | 'guard' | 'search' | 'harvest';

export const ERRAND_LABEL: Record<ErrandKind, string> = {
  bandits: '剿匪',
  escort: '押貨',
  guard: '護院',
  search: '尋人',
  harvest: '搶收',
};

export const ERRAND_BLURB: Record<ErrandKind, string> = {
  bandits: '西邊林子裡有夥人,搶了兩回糧道了。你若肯去,酬勞好說。',
  escort: '有批貨要往下游走,路上不太平,想請個人押著。',
  guard: '家裡這幾日不安生,想請你夜裡看著點。',
  search: '我家那口子出去兩日沒回,想煩你幫著找找。',
  harvest: '眼看要下雨,田裡的糧收不完。多雙手就多一分。',
};

/**
 * 委託人開口的那句話。剿匪要<b>指得出地方</b> ——
 * 「西邊林子裡有夥人」是文本,「黑石岡那夥,西南約七十步」是差事。
 */
export function errandBlurb(
  e: Errand,
  band?: Pick<Band, 'name' | 'x' | 'z'> | null,
  from?: { x: number; z: number },
): string {
  if (e.kind !== 'bandits' || !band) return ERRAND_BLURB[e.kind];
  const where = from ? wayWord(from.x, from.z, band.x, band.z) : '不遠';
  return `${band.name}那夥人,搶了兩回糧道了 —— 就在${where}。你若肯去,酬勞好說。`;
}

export interface Errand {
  id: string;
  kind: ErrandKind;
  /** 委託人。 */
  patronId: string;
  /** 難度 1–5。 */
  tier: number;
  /** 帶夠這麼多人才穩。0 = 一個人也辦得了。 */
  wantMen: number;
  pay: number;
  /** 剿匪:地圖上那一夥的 id。沒有它,這件活就只是一段文字。 */
  bandId?: string;
}

/**
 * 一夥賊有多難剿 —— 難度全從<b>那夥人實際有幾個、有多兇</b>算出來,
 * 不從治安那個數字拍腦袋。委託人說「一大夥,不好惹」的時候,
 * 你走過去就該真的看見一大夥。
 */
export function banditTier(b: Pick<Band, 'count' | 'fierce'>): number {
  const weight = b.count * (0.6 + b.fierce);
  return weight >= 6.5 ? 4 : weight >= 4 ? 3 : 2;
}

/**
 * 這一夥要帶幾個人去才辦得下來(你自己不算在內)。
 *
 * 這是差事對玩家的<b>承諾</b>:畫面上寫「需人 5」,帶了 5 個就該打得贏。
 * 所以這個數字不能拍腦袋 —— 它是空跑出來的,見 combat.balance.test.ts
 * 裡引用本函式的那一條。帶足人的勝率落在八成上下,愈兇的一夥愈接近八成:
 * 打得贏,但仍舊會折人。
 *
 * 早先寫成 count - 1 + fierce,兩三個毛賊那一段還對得上,到了五個兇賊
 * 就成了謊話:它說帶 6 個,而帶 6 個的實際勝率是 16%。兇悍不是加法 ——
 * 一個兇賊抵得上兩個扛鋤頭的村民,所以 fierce 得乘進人數裡。
 */
export function menNeeded(b: Pick<Band, 'count' | 'fierce'>): number {
  return Math.max(1, Math.round(b.count * (0.7 + b.fierce * 0.9)));
}

/** 哪種人給哪種活 — 對不上的話,對話就不可信。 */
const BY_TRADE: Record<Trade, ErrandKind[]> = {
  farm: ['harvest', 'guard', 'bandits'],
  dock: ['escort', 'search', 'bandits'],
  market: ['escort', 'guard', 'search'],
};

/**
 * 這個人現在有沒有活給你。
 *
 * 純函式,且對同一個人同一旬<b>恆定</b> —— 反覆搭話刷不出更好的活。
 */
export function errandFrom(
  npc: Npc,
  village: VillageState,
  span: number,        // 第幾旬 — 換旬才換活
  heroMerit: number,
  bands: Band[] = [],
): Errand | null {
  const rand = rng(hash(`${npc.id}-${span}`));
  const rank = rankForMerit(heroMerit);

  // 不是誰都有事託你。觀感差、脾氣怕事的人不會開口
  const willing = 0.30 + (npc.regard >= 15 ? 0.18 : 0) + (npc.temper === 'warm' ? 0.10 : 0)
    - (npc.temper === 'timid' ? 0.12 : 0);
  if (rand() > willing) return null;

  // 白身接不到太難的活 —— 沒人會把要命的事託給一個沒名沒姓的人
  const ceiling = rank >= RANK_COMMONER ? 2 : rank >= RANK_RETAINER ? 3 : 5;

  // 從村子的處境挑一件他這行當出得起的活
  const pool: Array<{ kind: ErrandKind; tier: number; want: number; bandId?: string }> = [];
  for (const kind of BY_TRADE[npc.trade]) {
    if (kind === 'bandits') {
      if (village.order >= 55) continue;             // 太平就沒匪
      // 剿光了就真的沒這活可接 —— 由世界說了算,不是由治安這個數字說了算。
      // (治安會自己緩慢回升,若不看實際的賊窩,就會出現「剿無可剿卻還在派剿匪」。)
      //
      // 挑之前<b>先按身分濾一遍</b>:村民不會拉著一個白身去端最兇的那一夥。
      // 先隨機挑再讓身分門檻把它擋掉的話,結果是「這件活整個消失」——
      // 玩家看見的是一個沒人有事託他的村子,而不是一個看不起他的村子。
      const live = bands.filter((b) => !b.routed && banditTier(b) <= ceiling);
      if (!live.length) continue;
      const b = live[Math.floor(rand() * live.length) % live.length];
      // 需人是空跑出來的,不是拍腦袋的 —— 見 menNeeded
      pool.push({ kind, tier: banditTier(b), bandId: b.id, want: menNeeded(b) });
    } else if (kind === 'escort') {
      if (village.trade < 40) continue;              // 商路斷了沒鏢可押
      pool.push({ kind, tier: 2, want: 4 });
    } else if (kind === 'harvest') {
      if (village.harvest < 45) continue;            // 沒糧可收
      pool.push({ kind, tier: 1, want: 0 });
    } else if (kind === 'search') {
      pool.push({ kind, tier: 1, want: 0 });
    } else {
      pool.push({ kind, tier: 1, want: 0 });         // 護院 — 保底
    }
  }
  if (!pool.length) return null;

  const usable = pool.filter((p) => p.tier <= ceiling);
  if (!usable.length) return null;

  const pick = usable[Math.floor(rand() * usable.length) % usable.length];
  return {
    id: `${npc.id}-${span}-${pick.kind}`,
    kind: pick.kind,
    patronId: npc.id,
    tier: pick.tier,
    wantMen: pick.want,
    pay: Math.round(12 * pick.tier * pick.tier * (0.85 + rand() * 0.4)),
    ...(pick.bandId ? { bandId: pick.bandId } : {}),
  };
}

/**
 * 勝算 0..1 — 抽出來是為了讓玩家<b>看得見自己在賭什麼</b>。
 * 不給資訊的風險不叫風險。
 */
export function odds(e: Errand, stats: Stats, men: number): number {
  const skill = e.kind === 'search'
    ? stats.intelligence * 0.7 + stats.charisma * 0.3
    : e.kind === 'harvest'
      ? stats.leadership * 0.5 + stats.politics * 0.5
      : stats.war * 0.55 + stats.leadership * 0.45;
  const skillPull = Math.max(0, Math.min(1, (skill - 35) / 55));
  const manning = e.wantMen <= 0 ? 1 : Math.max(0, Math.min(1.15, men / e.wantMen));
  return Math.max(0.05, Math.min(0.95,
    0.34 + skillPull * 0.44 + (manning - 0.5) * 0.32 - (e.tier / 5) * 0.30,
  ));
}

export interface ErrandResult {
  /** 0 大敗 · 1 沒辦成 · 2 辦成 · 3 漂亮 */
  grade: 0 | 1 | 2 | 3;
  gold: number;
  merit: number;
  favor: number;
  /** 折損的人。 */
  losses: number;
  /** 主角受傷幾旬。 */
  wounded: number;
  /** 對村子的影響 — 剿了匪治安就會好。 */
  village: Partial<Pick<VillageState, 'order' | 'harvest' | 'trade'>>;
  text: string;
}

export function resolve(
  e: Errand,
  stats: Stats,
  men: number,
  heroMerit: number,
  roll: () => number,
): ErrandResult {
  const p = odds(e, stats, men);
  const r = roll();
  const grade: 0 | 1 | 2 | 3 = r < p * 0.26 ? 3 : r < p ? 2 : r < p + 0.30 ? 1 : 0;

  const rank = rankForMerit(heroMerit);
  // 白身的第一件差事該有份量 —— 同一件活,越低微的人做越算數
  const meritMul = rank >= RANK_COMMONER ? 1.7 : rank >= RANK_RETAINER ? 1.3 : 1.0;
  const shortfall = e.wantMen <= 0 ? 0 : Math.max(0, 1 - men / e.wantMen);

  if (grade >= 2) {
    const good = grade === 3;
    return {
      grade,
      gold: Math.round(e.pay * (good ? 1.5 : 1)),
      merit: Math.round(e.tier * 2.4 * meritMul * (good ? 1.6 : 1)),
      favor: good ? 3 + e.tier : 2 + Math.floor(e.tier / 2),
      losses: Math.round(men * 0.05 * e.tier * (good ? 0.4 : 1) * roll()),
      wounded: 0,
      village: e.kind === 'bandits' ? { order: undefined } : {},
      text: good ? `${ERRAND_LABEL[e.kind]}辦得漂亮` : `${ERRAND_LABEL[e.kind]}辦成了`,
    };
  }

  const routed = grade === 0;
  const hurt = routed && roll() < 0.26 + shortfall * 0.45;
  return {
    grade,
    gold: 0,
    merit: 0,
    favor: routed ? -(3 + e.tier) : -2,
    losses: Math.round(men * (0.12 + shortfall * 0.34) * (routed ? 1.7 : 1)),
    wounded: hurt ? (roll() < 0.25 ? 3 : 1) : 0,
    village: {},
    text: routed ? `${ERRAND_LABEL[e.kind]}大敗` : `${ERRAND_LABEL[e.kind]}沒辦成`,
  };
}

/**
 * 覆命的酬勞。
 *
 * 和 resolve() 分開,因為兩者回答的是<b>不同的問題</b>:
 * resolve 問「這件事辦成了沒」—— 那是抽象差事還欠著的一次擲骰;
 * reward 只問「已經辦成的事值多少」—— 剿匪的成敗已經在世界上打完了,
 * 這裡再擲一次骰就是把玩家剛剛親手做的事一筆勾銷。
 *
 * 功績集中在這裡發,是一個立場:<b>沒人託你,打贏了也只是私鬥</b>。
 * 白身要的不是戰績,是有人記得這件事是你辦的。
 */
export function reward(e: Errand, heroMerit: number): {
  gold: number; merit: number; favor: number; order: number;
} {
  const rank = rankForMerit(heroMerit);
  const meritMul = rank >= RANK_COMMONER ? 1.7 : rank >= RANK_RETAINER ? 1.3 : 1.0;
  return {
    gold: e.pay,
    merit: Math.round(e.tier * 3.2 * meritMul),
    favor: 2 + e.tier,
    order: e.kind === 'bandits' ? 6 + e.tier * 2 : 0,
  };
}

/** 字串雜湊 — 讓「同一個人同一旬」的活恆定。 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
