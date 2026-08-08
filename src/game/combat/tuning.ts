/**
 * 打鬥的節奏參數 —— <b>調這裡就能改「一場架有多長」</b>。
 *
 * 單獨一個檔,是因為這幾個數字有一個共同的性質:改任何一個都會動到勝率,
 * 而勝率是<b>空跑一千場調出來的,不是看畫面調的</b>。
 * 擺在一起,下次要調的人才看得見彼此;散在一千行裡的話,
 * 你會以為自己只動了一個數字。
 *
 * 動它們之前先跑 combat.balance.test.ts 與 tools/sim/measure.ts。
 */

export const REACH = 1.35;          // 兵器夠得著的距離
export const SWING = 0.55;                 // 一次揮砍的長度
export const HIT_AT = 0.42;                // 揮到這個相位判定命中
export const RECOVER = 0.62;               // 收招
export const MOVE = 2.5;                   // 接敵的腳程
export const FLEE = 4.6;                   // 逃命跑得比誰都快

/**
 * 弓的參數 —— 和近戰一樣是空跑調的,見 combat.balance.test.ts。
 * 箭速決定「躲不躲得開」:十來步的距離飛過來要大半秒,
 * 側著跑兩步就讓過去了;站樁的人(和直線衝鋒的同伴)才會挨。
 */
export const BOW_RANGE = 15;               // 這個距離內才射
export const BOW_KEEP = 5.0;               // 逼近到這裡他就往後退
export const BOW_COOL = 2.6;               // 兩箭之間
export const ARROW_SPEED = 15;
export const ARROW_G = 7;                  // 拋物線的墜 — 樣式化的重力,別當物理讀

/**
 * 圍攻:每多一個人貼著你,閃避就掉一截 —— 人數的價值在這裡。
 * 要封頂,否則五個打一個等於一刀一個,人數會從「優勢」變成「開關」。
 */
export const SURROUND_PENALTY = 0.10;
export const SURROUND_CAP = 0.20;
/**
 * 從背後砍的加成。
 *
 * 「人多」在這之前只是一個命中加值(SURROUND),而人多真正的用處是<b>繞到後面去</b>——
 * 一個人只有一張臉,同時招呼兩個方向就是不行。分開成兩件事以後,
 * 帶人打架第一次有了「怎麼打」而不只是「帶幾個」。
 */
export const FLANK_BONUS = 0.16;
/** 被人從背後招呼,士氣掉得比正面快 —— 亂起來的都是後排。 */
export const FLANK_MORALE = 6;

export const MAX_ATTACKERS = 2;

/**
 * 多久沒人挨到一刀就算僵住了(秒)。
 *
 * 兩邊都還站著,可是誰也打不到誰 —— 最後一個賊縮在柵欄後面,我方三個人在外頭繞,
 * 而戰鬥沒有尋路(只有貼著障礙滑),於是永遠不會結束。畫面上看起來是
 * 「大家站著發呆」,而且不會自己好。真人遇到這種情況會走開,所以超過這段時間
 * 沒人挨到一刀,士氣就開始垮 —— 這一場架自己就散了。
 * 比起特判「誰卡住了」,這個做法對所有卡法都成立。
 */
export const STALE_AFTER = 25;
