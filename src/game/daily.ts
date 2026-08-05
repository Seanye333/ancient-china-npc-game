import { useHero } from './hero';
import { useVillage } from './village';
import { useBands } from './bands';
import { useJournal } from './journal';
import { makeVillagers } from './npcs';
import { DAYS_PER_SHI, mouths, RENT_PER_XUN, LODGING_LABEL } from './economy';
import { DAYS_PER_XUN, partsFor } from './calendar';
import { raidParties, useRaids, raidChance, raidSize, alreadyOut } from './raids';
import { groundAt } from '../world/field';
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
    report.ate = need;
    // 快見底的時候提醒一次,而不是等斷糧才說
    const daysLeft = Math.floor((hero.grain - need) * DAYS_PER_SHI / heads);
    if (daysLeft === 3 || daysLeft === 1) {
      journal.note(day, `糧只剩 ${daysLeft} 天的了。`, 'bad');
    }
  } else {
    report.starved = true;
    hero.addGrain(-hero.grain);
    hero.addToil(2);
    journal.note(day, heads > 1 ? '斷糧了。跟著你的人今天沒吃上飯。' : '斷糧了。', 'bad');

    /* 餓著的人不會一直跟著你 —— 這是招募那條線真正的代價 */
    const villagers = makeVillagers(38);
    for (const id of [...hero.followers]) {
      if (Math.random() > 0.34) continue;
      hero.dismiss(id);
      hero.addFavor(id, -4);
      const name = villagers.find((v) => v.id === id)?.name ?? '同行';
      report.left.push(id);
      journal.note(day, `${name}餓了兩頓,跟你告了辭。`, 'bad');
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

  /* 旬首報一次日子,讓玩家對得上曆法 */
  const p = partsFor(day);
  if (day > 0 && day % DAYS_PER_XUN === 0) {
    journal.note(day, `${['上', '中', '下'][p.xun]}旬了。`);
  }

  return report;
}

/** 給 UI 的一句話:糧還夠幾天。 */
export function grainDays(grain: number, followers: number, retinue: number): number {
  return Math.floor((grain * DAYS_PER_SHI) / mouths(followers, retinue));
}

export function lodgingWord(l: keyof typeof LODGING_LABEL): string {
  return LODGING_LABEL[l];
}
