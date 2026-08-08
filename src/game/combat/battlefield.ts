/**
 * 打完之後<b>地上還剩下什麼</b> —— 火花、血點、屍首、血漬。
 *
 * 和戰鬥模擬分開,是因為它們的壽命不一樣:場上那些人一收場就清掉,
 * 而屍首要躺三天、血漬六天 —— 它們活在<b>曆法</b>裡,不活在這一場的計時器裡。
 * 混在一起寫的下場,是每次改開場布陣都得小心別把上一場的屍首也清了。
 */

import type { Fighter, Impact } from './types';
import { impacts, corpses, stains, CORPSE_DAYS } from './types';
import { sim } from './state';

const IMPACT_CAP = 40;

/** 從 (fx,fz) 打到 tgt 身上 —— 濺出去的方向就是這一擊來的方向。 */
export function addImpact(fx: number, fz: number, tgt: Fighter, kind: Impact['kind']) {
  const d = Math.hypot(tgt.x - fx, tgt.z - fz) || 1;
  if (impacts.length >= IMPACT_CAP) impacts.shift();
  impacts.push({
    // 打在胸口高度,不是腳下 —— 火花從地上冒出來很怪
    x: (fx + tgt.x) / 2, y: tgt.y + 0.85, z: (fz + tgt.z) / 2,
    dx: (tgt.x - fx) / d, dz: (tgt.z - fz) / d, t: sim.clock, kind,
  });
}

/**
 * 倒在地上的人 —— <b>打完了還留著</b>。
 *
 * 從前一場打完,fighters 整個清空,屍首跟著消失:你走回頭看那片草地,
 * 什麼都沒發生過。一個把「死」寫進日誌、寫進仇家名單的遊戲,
 * 地上卻乾乾淨淨,那是最說不通的一處。
 *
 * 存的是 day 而不是秒:屍首躺幾天,由曆法決定,不由這一局的計時器。
 */

const CORPSE_CAP = 24;

const STAIN_CAP = 32;

/** 今天過去了 —— 收走該收的屍首。由 daily 的結算呼叫。 */
export function ageBattlefield(day: number) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    if (day - corpses[i].day >= CORPSE_DAYS) corpses.splice(i, 1);
  }
  for (let i = stains.length - 1; i >= 0; i--) {
    if (day - stains[i].day >= CORPSE_DAYS * 2) stains.splice(i, 1);
  }
}

/** 有人倒下 —— 留一具屍首、一攤血。 */
export function layDown(f: Fighter, day: number) {
  if (corpses.length >= CORPSE_CAP) corpses.shift();
  corpses.push({ x: f.x, y: f.y, z: f.z, yaw: f.yaw, side: f.side, chief: !!f.chief, day });
  if (stains.length >= STAIN_CAP) stains.shift();
  stains.push({ x: f.x, y: f.y, z: f.z, r: 0.5 + Math.random() * 0.35, day });
}
