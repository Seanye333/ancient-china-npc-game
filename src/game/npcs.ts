import { rng } from '../world/field';
import { orderWord, harvestWord, type VillageState } from './village';

/**
 * 村裡的人 — 名字、行當、脾氣。
 *
 * 這些不是那 797 個武將。史書記得住的是少數,一個縣裡絕大多數人
 * 沒有留下名字 —— 他們才是這個遊戲的日常。名將要等你走出這個村子才遇得到。
 *
 * 名字用漢代的樣子生:單名為主(漢人尚單名,王莽之後尤甚),偶爾雙名。
 * 生出來的名字要<b>能叫得出口</b> —— 玩家會反覆看到這幾十個人,
 * 「張二」「李三」那種編號式的名字會讓整個村子瞬間變回背景板。
 */

const SURNAMES = [
  '王', '李', '張', '劉', '陳', '楊', '趙', '黃', '周', '吳',
  '徐', '孫', '馬', '朱', '胡', '郭', '何', '高', '林', '鄭',
  '梁', '謝', '宋', '唐', '許', '韓', '馮', '鄧', '曹', '彭',
];

/** 單名 — 漢人取名愛用的字:德行、器物、方位、時令。 */
const GIVEN = [
  '安', '平', '順', '康', '寧', '和', '義', '仁', '忠', '信',
  '成', '立', '同', '通', '達', '進', '興', '盛', '茂', '豐',
  '山', '石', '林', '江', '河', '雲', '風', '雷', '霜', '雪',
  '春', '夏', '秋', '冬', '朝', '暮', '辰', '午', '申', '酉',
];

const GIVEN2 = ['子', '文', '元', '公', '伯', '仲', '叔', '季'];

export type Trade = 'farm' | 'dock' | 'market';

export const TRADE_LABEL: Record<Trade, string> = {
  farm: '佃農', dock: '船工', market: '販夫',
};

/** 脾氣 — 決定他怎麼跟你說話,以及肯不肯託你辦事。 */
export type Temper = 'warm' | 'gruff' | 'timid' | 'shrewd';

export const TEMPER_LABEL: Record<Temper, string> = {
  warm: '和氣', gruff: '直脾氣', timid: '怕事', shrewd: '精明',
};

export interface Npc {
  id: string;
  name: string;
  trade: Trade;
  temper: Temper;
  age: number;
  /** 對你的觀感 −100..100。初見多半是零。 */
  regard: number;
}

/**
 * 生一村的人。決定論 —— 同一顆種子每次載入都是同一批人,
 * 玩家記得住「河邊那個怕事的老船工」才有意義。
 */
export function makeVillagers(count: number, seed = 4242): Npc[] {
  const rand = rng(seed);
  const used = new Set<string>();
  const out: Npc[] = [];
  const tempers: Temper[] = ['warm', 'gruff', 'timid', 'shrewd'];

  while (out.length < count) {
    const sur = SURNAMES[Math.floor(rand() * SURNAMES.length)];
    const given = rand() < 0.82
      ? GIVEN[Math.floor(rand() * GIVEN.length)]
      : GIVEN2[Math.floor(rand() * GIVEN2.length)] + GIVEN[Math.floor(rand() * GIVEN.length)];
    const name = sur + given;
    if (used.has(name)) continue;      // 一個村裡不該有兩個同名的人
    used.add(name);

    const roll = rand();
    out.push({
      id: `v${out.length}`,
      name,
      trade: roll < 0.55 ? 'farm' : roll < 0.78 ? 'dock' : 'market',
      temper: tempers[Math.floor(rand() * tempers.length)],
      age: 17 + Math.floor(rand() * 44),
      regard: 0,
    });
  }
  return out;
}

/**
 * 這個人能不能打 — 從行當、脾氣、年紀推,不另存一個數。
 *
 * 有了這個,「招誰」才是個選擇:船工扛慣了貨,比佃農經打;
 * 直脾氣的敢往前站,怕事的到場先想著跑。四十往上力氣就開始退。
 * 這些數字全都是玩家能從人物卡上讀出來的東西,<b>不必再開一個武力欄</b>——
 * 一個村民的戰力應該是他這個人的自然結果。
 */
export function might(npc: Npc): number {
  const byTrade = npc.trade === 'dock' ? 34 : npc.trade === 'market' ? 26 : 30;
  const byTemper = npc.temper === 'gruff' ? 12 : npc.temper === 'shrewd' ? 4
    : npc.temper === 'warm' ? 6 : 0;
  const prime = 1 - Math.abs(npc.age - 27) / 46;         // 二十七上下最能打
  return Math.round(byTrade + byTemper + prime * 22);
}

/** 給玩家看的一句話,不給數字 —— 這個世界不該有戰力標籤。 */
export function mightWord(npc: Npc): string {
  const m = might(npc);
  if (m >= 58) return '看著就能打';
  if (m >= 48) return '身子還硬朗';
  if (m >= 40) return '尋常身手';
  return '怕是提不動刀';
}

/* ── 閒話 ────────────────────────────────────────────── */

/**
 * 隨口一句 — 按行當、時辰、天氣、脾氣挑。
 *
 * 這些話不是裝飾:它們是<b>玩家讀世界的主要管道</b>。
 * 佃農抱怨收成、船工說河上的事、販夫講價錢 —— 走一圈聽下來,
 * 你就知道這個縣現在過得怎麼樣,而不必去翻一張數值表。
 */
export function smallTalk(
  npc: Npc,
  ctx: {
    hour: number; season: string; weather: string; village: VillageState;
    /** 眼下有沒有天災。世界出了大事,人卻在聊米價,那個村子就是假的。 */
    calamity?: string | null;
    /** 有沒有哪一夥賊下了山、正往這邊來。 */
    raiding?: string | null;
  },
): string {
  const night = ctx.hour < 6 || ctx.hour > 19;
  const v = ctx.village;

  /*
   * 眼前正在發生的事壓過一切閒話。
   *
   * 這一段擺在最前面是有道理的:蝗蟲剛過境,而村民還在跟你講米價公道 ——
   * 那不是「對話沒寫好」,是這個村子看起來不像活的。
   */
  if (ctx.raiding) {
    return npc.temper === 'timid'
      ? `${ctx.raiding}的人下山了!你別往那邊去⋯⋯`
      : `${ctx.raiding}那夥又下來了。這回不知道要遭誰家。`;
  }
  if (ctx.calamity) {
    return npc.trade === 'farm'
      ? `${ctx.calamity}啊⋯⋯今年的收成算是完了。`
      : `${ctx.calamity}。這光景,誰家還有心思做買賣。`;
  }

  if (night) {
    return npc.temper === 'timid'
      ? `這時候還在外頭走?${v.order < 42 ? '近來不太平,小心些。' : '小心些。'}`
      : '夜路難行,早些歇了罷。';
  }
  if (ctx.weather === 'snow') return '這雪下得不是時候,路都封了。';
  if (ctx.weather === 'rain') {
    return npc.trade === 'farm'
      ? (v.harvest < 45 ? '這雨來得晚了,苗都黃了。' : '這場雨來得好。')
      : '雨天沒生意,白站一日。';
  }

  // 治安是所有人都會提的事 —— 差事就是從這裡長出來的
  if (v.order < 30 && npc.temper !== 'timid') {
    return `西邊林子裡那夥人又下來了,${orderWord(v.order)}啊。`;
  }

  switch (npc.trade) {
    case 'farm':
      return ctx.season === 'autumn'
        ? `今年${harvestWord(v.harvest)},租子交完剩不了多少。`
        : ctx.season === 'winter' ? '地凍了,閒著也是閒著。'
          : `田裡的活兒沒個完${v.harvest < 40 ? ',今年怕是不好過。' : '。'}`;
    case 'dock':
      return ctx.season === 'winter' ? '河面結冰,船都靠著,沒得做。'
        : v.trade < 40 ? '上游來的船少了,聽說路上不太平。'
          : '這幾日船多,忙得腳不沾地。';
    case 'market':
      return `米價一石${v.grainPrice}錢${v.grainPrice > 45 ? ',貴得離譜。' : ',還算公道。'}`;
  }
}

/** 稱呼 — 觀感夠好才會拿你當自己人。 */
export function addressYou(npc: Npc): string {
  if (npc.regard >= 40) return npc.temper === 'warm' ? '兄弟' : '你這後生';
  if (npc.regard >= 15) return '這位';
  return '客官';
}
