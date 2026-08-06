import type { Npc } from './npcs';
import { makeVillagers } from './npcs';

/**
 * 縣城裡的人。
 *
 * 城蓋好的頭兩天是一座空城:有牆、有街、有衙門,沒有一個活人 ——
 * 比賊窩還安靜。而「城裡人」和村民是兩種人:他們不種田、看人先看衣裳、
 * 開口就是價錢。這一批人少(八個),但每個都有名有姓有崗位,
 * 和村裡「三十八個人各有作息」是同一條路線:有人住不是靠人多。
 *
 * 名冊寫死而不是從種子生成 —— 八個人犯不上一套生成器,
 * 而且門吏就該叫門吏的名字。ids 用 c 開頭,和村民(v)分開。
 *
 * 他們是 Npc 形狀,所以搭話、閒話、招募、給差事全部直接能用;
 * 只是親眷(kin)那一層沒有他們 —— 城裡人的家不在這裡,說得通。
 */
export const COUNTY_FOLK: Npc[] = [
  { id: 'c0', name: '門吏韓五', trade: 'market', temper: 'gruff', age: 41, regard: -5 },
  { id: 'c1', name: '門吏小竇', trade: 'market', temper: 'timid', age: 19, regard: 0 },
  { id: 'c2', name: '掌櫃樊大', trade: 'market', temper: 'shrewd', age: 47, regard: 5 },
  { id: 'c3', name: '米行祝翁', trade: 'market', temper: 'shrewd', age: 61, regard: 0 },
  { id: 'c4', name: '布販何三娘', trade: 'market', temper: 'warm', age: 34, regard: 5 },
  { id: 'c5', name: '腳夫石敢', trade: 'dock', temper: 'gruff', age: 28, regard: 0 },
  { id: 'c6', name: '游手陸小乙', trade: 'dock', temper: 'timid', age: 22, regard: -3 },
  { id: 'c7', name: '書手宋文', trade: 'market', temper: 'warm', age: 39, regard: 3 },
];

export function isCountyFolk(id: string): boolean {
  return id.startsWith('c');
}

/**
 * 按 id 找人 —— 村民或城裡人。
 *
 * 這個查找散在六七個檔案裡,原本各自寫 makeVillagers(38).find(...):
 * 縣城的人一加,每一處都會安靜地查不到,顯示成「同行」「某人」。
 * 收攏成一個函式,以後再加第三批人也只改這裡。
 */
export function anyPerson(id: string): Npc | undefined {
  return isCountyFolk(id)
    ? COUNTY_FOLK.find((p) => p.id === id)
    : makeVillagers(38).find((p) => p.id === id);
}

export function nameOf(id: string): string {
  return anyPerson(id)?.name ?? '某人';
}
