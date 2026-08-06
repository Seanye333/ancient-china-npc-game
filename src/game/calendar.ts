import type { Season } from '../world/worldTime';

/**
 * 日子。
 *
 * 這個模組存在,是因為在它之前這個遊戲<b>沒有日子</b>:時辰在 0–24 之間繞圈,
 * 「今天第幾天」是拿 `Math.floor(hour / 24)` 算的 —— 而 hour 每次都對 24 取餘,
 * 所以那個式子<b>永遠是 0</b>。村況每天推一次的那段程式,開場推了一次以後
 * 就再也沒有推過;打散的賊窩「過些時日會有人回來」也從來沒回來過。
 * 畫面上完全看不出來,因為沒有任何東西顯示日期。
 *
 * 曆法照漢制的形狀來:十日一旬,三旬一月,三月一季,四季一年。
 * 用旬而不用週,是因為差事、租金、傷勢都按旬算 —— 旬是這個遊戲的心跳。
 */

export const DAYS_PER_XUN = 10;
export const DAYS_PER_MONTH = 30;
export const DAYS_PER_SEASON = 90;
export const DAYS_PER_YEAR = 360;

/** 年號。改元是後面朝廷那條線的事,先留一個常數在這裡。 */
export const ERA = '初平';

const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const XUN_LABEL = ['上旬', '中旬', '下旬'];
/** 十二時辰 —— 一個時辰兩小時,子時跨半夜。 */
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export interface DateParts {
  /** 第幾年,從 1 起。 */
  year: number;
  /** 第幾月,1–12。 */
  month: number;
  /** 月裡第幾天,1–30。 */
  dayOfMonth: number;
  /** 0 上旬 · 1 中旬 · 2 下旬。 */
  xun: number;
  /** 從開局算起的第幾旬 —— 差事按這個換。 */
  xunIndex: number;
  season: Season;
}

export function partsFor(day: number): DateParts {
  const d = Math.max(0, Math.floor(day));
  const dayOfYear = d % DAYS_PER_YEAR;
  return {
    year: Math.floor(d / DAYS_PER_YEAR) + 1,
    month: Math.floor(dayOfYear / DAYS_PER_MONTH) + 1,
    dayOfMonth: (d % DAYS_PER_MONTH) + 1,
    xun: Math.floor((d % DAYS_PER_MONTH) / DAYS_PER_XUN),
    xunIndex: Math.floor(d / DAYS_PER_XUN),
    season: SEASON_ORDER[Math.floor(dayOfYear / DAYS_PER_SEASON)],
  };
}

/** 季節<b>從日子推導</b>,不另存 —— 兩個來源遲早會對不上。 */
export function seasonOf(day: number): Season {
  return SEASON_ORDER[
    Math.floor((Math.max(0, Math.floor(day)) % DAYS_PER_YEAR) / DAYS_PER_SEASON)
  ];
}

/** 某一季的第一天是第幾日 —— 除錯面板上直接跳季用得到。 */
export function firstDayOf(season: Season, fromDay: number): number {
  const year = Math.floor(fromDay / DAYS_PER_YEAR);
  return year * DAYS_PER_YEAR + SEASON_ORDER.indexOf(season) * DAYS_PER_SEASON;
}

/** 「初平二年 · 八月中旬」 */
export function dateWord(day: number): string {
  const p = partsFor(day);
  const y = p.year === 1 ? '元' : numberWord(p.year);
  return ERA + y + '年 · ' + numberWord(p.month) + '月' + XUN_LABEL[p.xun];
}

/** 「辰時」—— 時辰比 07:40 像話。除錯面板還是給數字。 */
export function shichenWord(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return SHICHEN[Math.floor(((h + 1) % 24) / 2)] + '時';
}

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 小數目的中文寫法 —— 只需要顧到一百以內,曆法用不著更大的。 */
export function numberWord(n: number): string {
  if (n < 0) return String(n);
  if (n < 10) return DIGITS[n];
  if (n === 10) return '十';
  if (n < 20) return '十' + DIGITS[n % 10];
  const t = Math.floor(n / 10);
  return n % 10 === 0 ? DIGITS[t] + '十' : DIGITS[t] + '十' + DIGITS[n % 10];
}

/**
 * 社日 —— 春秋各一次,祭土地神的日子,也是全村聚在一起的日子。
 *
 * 曆法跑了這麼久,日子和日子還是一樣的:沒有一天值得<b>盼</b>。
 * 社日就是那一天:市集搭起擂台,比武奪彩,吃席到黃昏。
 * 定在每季第十五天 —— 玩家看得見它從日曆上一天天走近。
 */
export function festivalOn(day: number): '春社' | '秋社' | null {
  const dayOfYear = Math.max(0, Math.floor(day)) % DAYS_PER_YEAR;
  if (dayOfYear === 14) return '春社';
  if (dayOfYear === DAYS_PER_SEASON * 2 + 14) return '秋社';
  return null;
}

/** 還有幾天到下一個社日 —— 給「盼」一個數字。 */
export function daysToFestival(day: number): number {
  for (let d = 1; d <= DAYS_PER_YEAR; d++) if (festivalOn(day + d)) return d;
  return DAYS_PER_YEAR;
}
