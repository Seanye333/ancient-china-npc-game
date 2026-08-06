import { useHero } from './hero';
import { useVillage } from './village';
import { useBands } from './bands';
import { useJournal } from './journal';
import {
  useFolk, deltaOf, livingVillagers, sickChance, deathChance, stepRumors, spreadRumor,
} from './folk';
import { relatives } from './kin';
import {
  useCalamity, calamityRoll, calamityDays, calamityBite, calamityWord, CALAMITY_LABEL,
} from './calamity';
import { useMarauders, marauderRoll, warnDays, marauderBite, personalLoss } from './marauders';
import { useRefugees, refugeeRoll, REFUGEE_STAY } from './refugees';
import { useQuest } from './quest';
import { moodOf, grumble, isGrieving } from './company';
import { anyPerson } from './countyfolk';
import { checkEnding, useEnding, type EndingKind } from './ending';
import { playerPos } from './interact';
import { MARKET } from '../world/sites';
import {
  DAYS_PER_SHI, mouths, RENT_PER_XUN, LODGING_LABEL, stipendFor, taxDue, UPKEEP_PER_MAN,
} from './economy';
import { rankForMerit } from './hero';
import { DAYS_PER_XUN, DAYS_PER_YEAR, partsFor, festivalOn, daysToFestival } from './calendar';
import { raidParties, useRaids, raidChance, raidSize, alreadyOut } from './raids';
import { groundAt, water } from '../world/field';
import { invalidateNav } from '../world/nav';
import type { Season } from '../world/worldTime';

/**
 * 過一天要結的帳。
 *
 * 這裡是整個遊戲唯一「時間會拿走東西」的地方。在它之前,日子只是天色在變:
 * 你可以站在原地一年,什麼都不會發生。現在每過一天,糧會少、租會到期、
 * 帶著的人會餓 —— <b>時間本身成了對手</b>,而白身這個身分才有了重量。
 *
 * 一天一結,不是一旬一結:一旬結一次的話,糧食見底那一刻玩家看不見過程,
 * 只會看見一則「你餓死了」。
 */

/**
 * 讀檔用的閘門。
 *
 * 讀檔會把 day 從 3 直接設成 180,而跨日結算是「一天一天補」的 ——
 * 不擋的話讀一次檔就會把一百七十七天的糧一次吃掉。
 * 存檔存的是<b>結算之後</b>的狀態,那些日子早就結過了。
 */
export const settleGuard = { skipUntil: -1 };

/** 抱怨過一次的人。走之前一定先抱怨 —— 這張表就是那個「先」。 */
const warnedOnce = new Set<string>();

/**
 * 一生的流水帳。
 *
 * 刻意<b>不叫 tally</b>:Battle.tsx 裡的 tally 是「這一場架的結果」,
 * 兩個都叫 tally 的話,import 進去就會和區域變數撞在一起 ——
 * 而且撞得很安靜,只有型別檢查會叫。
 *
 * 落幕那一頁要的不是分數是名字,所以這裡記的是<b>誰跟過你、誰沒回來</b>,
 * 外加幾個真的做過的事。放在模組層而不是 store,是因為它只在收場時讀一次。
 */
export const lifeTally = {
  starvingDays: 0,
  sickDays: 0,
  bandsCleared: 0,
  errandsDone: 0,
  companions: new Set<string>(),
  lost: new Set<string>(),
  reset() {
    this.starvingDays = 0; this.sickDays = 0;
    this.bandsCleared = 0; this.errandsDone = 0;
    this.companions.clear(); this.lost.clear();
  },
};

export interface DayReport {
  ate: number;
  starved: boolean;
  left: string[];
  rent: number;
  evicted: boolean;
}

export function settleDay(day: number, season: Season): DayReport {
  const hero = useHero.getState();
  const journal = useJournal.getState();
  const report: DayReport = { ate: 0, starved: false, left: [], rent: 0, evicted: false };

  /* 吃飯 —— 你帶的人也吃這一堆 */
  const heads = mouths(hero.followers.length, hero.retinue);
  const need = heads / DAYS_PER_SHI;
  if (hero.grain >= need) {
    hero.addGrain(-need);
    lifeTally.starvingDays = 0;      // 吃上飯就重新算 —— 餓的是「連著幾天」
    report.ate = need;
    // 快見底的時候提醒一次,而不是等斷糧才說
    const daysLeft = Math.floor((hero.grain - need) * DAYS_PER_SHI / heads);
    if (daysLeft === 3 || daysLeft === 1) {
      journal.note(day, `糧只剩 ${daysLeft} 天的了。`, 'bad');
    }
  } else {
    report.starved = true;
    lifeTally.starvingDays++;
    hero.addGrain(-hero.grain);
    hero.addToil(2);
    journal.note(day, heads > 1 ? '斷糧了。跟著你的人今天沒吃上飯。' : '斷糧了。', 'bad');

    /* 餓著的人不會一直跟著你 —— 這是招募那條線真正的代價 */
    for (const id of [...hero.followers]) {
      if (Math.random() > 0.34) continue;
      hero.dismiss(id);
      hero.addFavor(id, -4);
      const name = anyPerson(id)?.name ?? '同行';
      report.left.push(id);
      journal.note(day, `${name}餓了兩頓,跟你告了辭。`, 'bad');
      // 這種事村裡傳得最快 —— 跟著他的人吃不上飯,誰還敢跟你走
      spreadRumor({ text: `${name}跟著他,連飯都吃不上。`, delta: -1.5, life: 4, aboutId: id });
    }
    if (hero.retinue > 0 && Math.random() < 0.5) {
      const gone = Math.max(1, Math.round(hero.retinue * 0.3));
      useHero.setState((s) => ({ retinue: Math.max(0, s.retinue - gone) }));
      journal.note(day, `散了 ${gone} 個鄉勇 —— 誰也不跟著空鍋走。`, 'bad');
    }
  }

  /* 租金 —— 一旬結一次,到期沒錢就捲鋪蓋 */
  if (hero.lodging === 'rented' && day >= hero.rentPaidThrough) {
    const now = useHero.getState();
    if (now.spend(RENT_PER_XUN)) {
      report.rent = RENT_PER_XUN;
      now.setLodging('rented', day + DAYS_PER_XUN);
      journal.note(day, `交了一旬的租,${RENT_PER_XUN} 錢。`);
    } else {
      report.evicted = true;
      now.setLodging('none');
      journal.note(day, '房錢交不出,被請了出去。今晚睡哪還沒著落。', 'bad');
    }
  }

  /*
   * 月錢 —— 跟著你的人不只吃你的糧,還要按旬拿錢。
   *
   * 少了這一條,「帶人」的代價只有糧,而糧便宜到帶十個人也吃不垮你。
   * 給不出月錢,人會走 —— 而且會先抱怨(company.ts 那條路)。
   */
  if (day > 0 && day % DAYS_PER_XUN === 0) {
    const h = useHero.getState();
    const men = h.followers.length + h.retinue;
    if (men > 0) {
      const owe = men * UPKEEP_PER_MAN;
      if (h.spend(owe)) {
        journal.note(day, `發了這一旬的月錢,${owe} 錢。`);
      } else {
        journal.note(day, `月錢發不出來。跟著你的人臉色都不好看。`, 'bad');
        for (const id of h.followers) useFolk.getState().bumpRegard(id, -2);
        useHero.setState((s) => ({ renown: s.renown - 1 }));
      }
    }
  }

  /* 官身按旬領俸 —— 品階第一次按時給你東西,而不只是兩個上限數字 */
  if (day > 0 && day % DAYS_PER_XUN === 0) {
    const pay = stipendFor(rankForMerit(useHero.getState().merit));
    if (pay > 0) {
      useHero.getState().addGold(pay);
      journal.note(day, `領了這一旬的俸,${pay} 錢。`, 'good');
    }
  }

  /*
   * 秋後收算賦。
   *
   * 這是唯一一筆你什麼都沒做也要付的錢 —— 也正因如此,
   * 它是「白身」這個身分最誠實的一面:官府不管你今年過得怎麼樣。
   * 交不出來就得拿糧抵,糧也沒有就去服徭役,那是實打實的幾旬時間。
   */
  if (day > 0 && day % DAYS_PER_YEAR === Math.floor(DAYS_PER_YEAR * 0.75)) {
    const h = useHero.getState();
    const due = taxDue(h.lodging);
    if (h.spend(due)) {
      journal.note(day, `稅吏上門,算賦 ${due} 錢。`, 'bad');
    } else {
      const shi = Math.ceil((due - h.gold) / Math.max(1, useVillage.getState().grainPrice));
      if (h.grain >= shi) {
        h.addGold(-h.gold);
        h.addGrain(-shi);
        journal.note(day, `錢不夠,拿 ${shi} 石糧抵了算賦。`, 'bad');
      } else {
        h.addGold(-h.gold);
        h.hurt(2);
        useHero.setState((s) => ({ renown: s.renown - 3 }));
        journal.note(day, '算賦交不出,被拉去服了兩旬徭役。', 'bad');
      }
    }
  }

  /* 傷勢按旬好轉 —— 有片瓦遮頭好得快 */
  if (hero.wounded > 0 && day % DAYS_PER_XUN === 0) {
    useHero.getState().heal();
    journal.note(day, '傷好了些。');
  }

  /*
   * 村子每<b>旬</b>推一次,不是每天。
   *
   * village.ts 的註解白紙黑字寫著「世界的節奏 —— 每旬推一次」,而它的數字
   * 也是按旬寫的:冬天收成 -12、秋天治安 -3.5。先前那段程式因為 day 恆為 0
   * 從來沒跑過,所以沒人發現差別;曆法一接上,照天推就是六天把一村的收成
   * 歸零 —— 世界不是變嚴酷,是<b>時間單位錯了十倍</b>。
   */
  if (day % DAYS_PER_XUN === 0) useVillage.getState().tick(season);
  const before = useBands.getState().bands.filter((b) => b.routed).length;
  useBands.getState().regrow();
  const after = useBands.getState().bands.filter((b) => b.routed).length;
  if (after < before) journal.note(day, '聽說那邊的窩棚又冒起煙了。', 'bad');

  /*
   * 村裡的人也在過日子:老、病、死。
   *
   * 這一段是為了讓治安與收成<b>連到人身上</b> —— 一個過得去的村子死人少,
   * 一個崩掉的村子會空。數字掉到一半以下的時候,你會先在日誌上看見誰家沒了人,
   * 然後才發現街上少了一個攤子。
   */
  /*
   * 天災。
   *
   * 這個世界原本只有一種壞事:賊。可是漢末真正把人逼上山的從來不是賊,
   * 是旱澇蝗疫 —— 賊是結果不是原因。災一起,收成掉得比平時快,
   * 病倒的人多,而米價會一格一格往上爬。
   */
  const cal = useCalamity.getState();
  if (!cal.active && day > 0 && day % DAYS_PER_XUN === 0) {
    const kind = calamityRoll(season, useVillage.getState().harvest, Math.random);
    if (kind) {
      const c = { kind, since: day, daysLeft: calamityDays(kind, Math.random) };
      cal.begin(c);
      journal.note(day, `${CALAMITY_LABEL[kind]}。${calamityWord(c)}`, 'bad');
    }
  }
  /*
   * 水位。水患漲,大旱落 —— 天災第一次在腳下成立,
   * 而不只是收成那一欄掉得快一些。漲過的灘地是真的走不過去。
   */
  let calamityEnded = false;
  const active = useCalamity.getState().active;
  {
    const want = active?.kind === 'flood' ? 0.4 : active?.kind === 'drought' ? -0.3 : 0;
    if (Math.abs(water.offset - want) > 0.01) {
      // 一天挪一點,不要一夜之間河就滿了
      water.offset += Math.sign(want - water.offset) * Math.min(0.06, Math.abs(want - water.offset));
      invalidateNav();      // 淹掉的灘地不能再當成走得過去
    }
  }
  if (active) {
    const bite = calamityBite(active.kind);
    const v = useVillage.getState();
    v.nudge({
      harvest: v.harvest + bite.harvest,
      order: v.order + bite.order,
      trade: v.trade + bite.trade,
    });
    useCalamity.getState().step();
    if (useCalamity.getState().active === null) {
      calamityEnded = true;
      journal.note(day, `${CALAMITY_LABEL[active.kind]}過去了。`, 'good');
    }
  }

  /*
   * 亂兵過境 —— 第一個不能用刀解決的威脅。
   *
   * 它的全部玩法在「提前得信」:風聲先到兩三天,你有時間把人帶去縣城。
   * 人在村裡就被搜身;有屋的糧鎖在屋裡,睡柴垛的家當就在身上。
   */
  let maraudersLeft = false;
  {
    const m = useMarauders.getState();
    if (!m.phase && marauderRoll(useVillage.getState().order, Math.random)) {
      m.begin(warnDays(Math.random));
      journal.note(day, '路上行人腳步都急了 —— 說是北邊過兵,往這邊來。', 'bad');
    } else if (m.phase) {
      const turn = m.step();
      if (turn === 'arrived') {
        journal.note(day, '亂兵進了村。刀就掛在腰上,誰也不敢攔。', 'bad');
      } else if (turn === 'left') {
        maraudersLeft = true;
        journal.note(day, '兵走了。村裡靜得不像話,家家在數自己剩下什麼。', 'bad');
      }
      if (useMarauders.getState().phase === 'present') {
        const v = useVillage.getState();
        const bite = marauderBite();
        v.nudge({ order: v.order + bite.order, harvest: v.harvest + bite.harvest,
                  trade: v.trade + bite.trade });
        const h = useHero.getState();
        const loss = personalLoss({
          inVillage: Math.hypot(playerPos.x - MARKET[0], playerPos.z - MARKET[1]) < 46,
          lodging: h.lodging, gold: h.gold, grain: h.grain, roll: Math.random,
        });
        if (loss.word) {
          h.addGold(-loss.gold);
          h.addGrain(-loss.grain);
          journal.note(day, loss.word, 'bad');
        }
      }
    }
  }

  /*
   * 流民 —— 世道爛出來的人。亂兵剛走、大災剛完、或治安爛透的時候,
   * 村口會蹲下一小群外鄉人。收不收,是你的事。
   */
  {
    const r = useRefugees.getState();
    if (!r.band) {
      const n = refugeeRoll({
        order: useVillage.getState().order,
        justCalamity: calamityEnded, justMarauders: maraudersLeft,
        roll: Math.random,
      });
      if (n > 0) {
        r.arrive(n, day);
        journal.note(day, `村口來了${n}個外鄉人,蹲在路邊不走 —— 拖家帶口,是逃難的。`, 'bad');
      }
    } else if (day - r.band.since >= REFUGEE_STAY) {
      journal.note(day, '村口那幾個流民走了,往下游去了。');
      r.leave();
    }
  }

  /* 沒人剿,賊就坐大 —— 每旬看一次 */
  if (day % DAYS_PER_XUN === 0) {
    const famous = useBands.getState().swell(useVillage.getState().order, Math.random);
    if (famous) {
      journal.note(day, `聽說${famous.name}如今聚了好幾十口人,連縣裡都壓不住了。`, 'bad');
    }
  }

  const v0 = useVillage.getState();
  const winter = season === 'winter';
  const sickMul = active ? calamityBite(active.kind).sickMul : 1;
  const folkStore = useFolk.getState();
  for (const p of livingVillagers()) {
    const d = deltaOf(p.id);
    if (d.sick > 0) {
      if (Math.random() < deathChance(p.age, d.sick)) {
        folkStore.patch(p.id, { dead: true, sick: 0, diedOn: day });
        journal.note(day, `${p.name}沒能熬過去。`, 'bad');
        // 死了要有人記得 —— 親眷會低落一陣子,而這是流言傳得最快的時候
        for (const kid of relatives(p.id)) folkStore.bumpRegard(kid, -1);
        const v = useVillage.getState();
        v.nudge({ order: v.order - 1 });
        continue;
      }
      folkStore.patch(p.id, { sick: Math.random() < 0.22 ? 0 : d.sick + 1 });
      continue;
    }
    if (Math.random() < sickChance(p.age, v0.harvest, winter) * sickMul) {
      folkStore.patch(p.id, { sick: 1 });
      journal.note(day, `${p.name}病倒了。`, 'bad');
    }
  }

  /* 過年長一歲 —— 這個世界的人不會永遠二十五 */
  if (day > 0 && day % DAYS_PER_YEAR === 0) {
    for (const p of livingVillagers()) {
      folkStore.patch(p.id, { aged: deltaOf(p.id).aged + 1 });
    }
    journal.note(day, '又是一年。', 'plain');
  }

  /*
   * 跟著你的人怎麼想。
   *
   * <b>要走之前一定先抱怨。</b>沒有預兆的離開會讓玩家覺得系統在耍他;
   * 抱怨過一次再走,那才是他自己的決定。
   */
  {
    const h = useHero.getState();
    for (const id of [...h.followers]) {
      const npc = anyPerson(id);
      if (!npc) continue;
      const grieving = isGrieving(id, day);
      const m = moodOf({
        npc, favor: h.favors[id] ?? 0, renown: h.renown,
        hungryDays: report.starved ? 1 : 0, grieving,
      });
      if (!m.restless) continue;
      const warned = warnedOnce.has(id);
      if (!warned) {
        warnedOnce.add(id);
        journal.note(day, `${npc.name}${grumble({
          npc, hungryDays: report.starved ? 1 : 0, grieving, renown: h.renown,
        })}`, 'bad');
        continue;
      }
      if (Math.random() < 0.4) {
        h.dismiss(id);
        warnedOnce.delete(id);
        report.left.push(id);
        journal.note(day, `${npc.name}走了。你留不住他。`, 'bad');
      }
    }
  }

  /* 流言傳一天 —— 你做的事沿著血緣走,不會停在當事人身上 */
  stepRumors(Math.random);

  /* 有沒有人下山 —— 治安差、秋收前後最凶 */
  const village = useVillage.getState();
  for (const b of useBands.getState().bands) {
    if (alreadyOut(b.id)) continue;
    if (Math.random() > raidChance(b, village, season)) continue;
    const count = raidSize(b, Math.random);
    raidParties.push({
      id: `${b.id}-${day}`, bandId: b.id, name: b.name,
      count, fierce: b.fierce,
      x: b.x, y: groundAt(b.x, b.z), z: b.z, yaw: 0,
      phase: 'out', linger: 0, since: day,
    });
    useRaids.getState().bump();
    journal.note(day, `${b.name}的人出了窩,往村子這邊來了。`, 'bad');
  }

  /*
   * 護院:昨夜你在不在村裡。
   *
   * 判斷放在天亮結算這裡,而不是做一套「守夜」的介面 ——
   * 護院本來就不是一個動作,是<b>一整夜待在該待的地方</b>。
   * 你在村裡過夜,這一宿就算數;你跑去剿匪,今夜就沒守成。
   */
  const q = useQuest.getState();
  if (q.taken && !q.taken.cleared && q.taken.errand.kind === 'guard') {
    const inVillage = Math.hypot(playerPos.x - MARKET[0], playerPos.z - MARKET[1]) < 46;
    if (inVillage) {
      q.advance();
      const t = useQuest.getState().taken;
      journal.note(day, t?.cleared ? '守了一夜。這幾宿平安 —— 可以去回話了。'
        : `守了一夜。（${t?.done}/${t?.need}）`);
    } else {
      journal.note(day, '昨夜你不在村裡。託你護院的人一夜沒合眼。', 'bad');
    }
  }

  /* 記下跟過你的人 —— 落幕那一頁要的是名字 */
  for (const id of useHero.getState().followers) lifeTally.companions.add(id);
  for (const id of report.left) lifeTally.lost.add(id);

  /*
   * 該收場了嗎。
   *
   * 判斷全部放在 ending.ts 一處:分散在各系統裡的話,「怎樣算輸」
   * 會慢慢長成五個互相不知道的版本。
   */
  {
    const h = useHero.getState();
    const kind = checkEnding({
      starvingDays: lifeTally.starvingDays,
      sickDays: lifeTally.sickDays,
      merit: h.merit,
      renown: h.renown,
      lodging: h.lodging,
      gold: h.gold,
      bandsCleared: lifeTally.bandsCleared,
    });
    if (kind && !useEnding.getState().life) endLife(kind, day);
  }

  /* 社日 —— 值得盼的那一天。前三天先放風聲,盼要有得盼 */
  {
    const fest = festivalOn(day);
    if (fest) {
      journal.note(day, `今日${fest}!市集上搭了擂台,全村都在往那邊去。`, 'good');
    } else if (daysToFestival(day) === 3) {
      journal.note(day, `再過三天就是${festivalOn(day + 3)},聽說今年照例有比武奪彩。`);
    }
  }

  /* 旬首報一次日子,讓玩家對得上曆法 */
  const p = partsFor(day);
  if (day > 0 && day % DAYS_PER_XUN === 0) {
    journal.note(day, `${['上', '中', '下'][p.xun]}旬了。`);
  }

  return report;
}

/**
 * 就此收場 —— 把一生的流水帳結成一頁生平。
 *
 * 抽出來是因為收場有兩種來路:每天結算查出來的(餓、病、功成),
 * 和<b>當場發生的</b>(戰死)。兩邊要長出同一頁,就只能有一份結法。
 */
export function endLife(kind: EndingKind, day: number) {
  const h = useHero.getState();
  const nameOf = (id: string) => anyPerson(id)?.name ?? '某人';
  useEnding.getState().end({
    kind, days: day, merit: h.merit, renown: h.renown, gold: h.gold,
    lodging: h.lodging,
    companions: [...lifeTally.companions].map(nameOf),
    lost: [...lifeTally.lost].map(nameOf),
    bandsCleared: lifeTally.bandsCleared,
    errandsDone: lifeTally.errandsDone,
  });
}

/** 給 UI 的一句話:糧還夠幾天。 */
export function grainDays(grain: number, followers: number, retinue: number): number {
  return Math.floor((grain * DAYS_PER_SHI) / mouths(followers, retinue));
}

export function lodgingWord(l: keyof typeof LODGING_LABEL): string {
  return LODGING_LABEL[l];
}
