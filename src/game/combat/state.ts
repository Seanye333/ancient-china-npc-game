/**
 * 一場架跨檔共用的<b>可變狀態</b>。
 *
 * 這幾個值原本是 combat.ts 裡的裸 `let`:拆檔以後 battlefield.ts 也要讀
 * (火花要蓋時戳、屍首要記日子),而 ES 模組的 `let` 匯出去是<b>唯讀綁定</b> ——
 * 匯入的那一邊改不動它。所以收進一個物件裡:誰都讀得到、誰都改得動,
 * 而且「這一場的狀態有哪些」一眼看得完。
 */

export const sim = {
  /**
   * 這一場打了多久(秒)。<b>每開一場架就歸零</b>。
   *
   * 凡是和 hurtAt / guardAt / impact.t 比的都得用它,不能拿 three 的
   * clock.elapsedTime —— 那一條是從開網頁算起的。兩條軸混著減,
   * 得到的永遠是一個幾十秒的大數,而條件多半寫成「小於 0.05」,
   * 於是整條回饋<b>從來沒有發生過</b>,還不會報錯。(踩過,見 docs/NOTES.md。)
   */
  clock: 0,
  /** 上一次有人挨刀是什麼時候 —— 拆僵局用,見 combat.ts 的 reapAndRally。 */
  lastBlow: 0,
  /**
   * 這一場的骰子。空跑要能餵一個種子進來,不然「勝率」每跑一次都不一樣。
   */
  rand: Math.random as () => number,
  /**
   * 今天第幾天 —— 屍首要記在哪一天倒的。
   *
   * combat 不 import 世界時鐘(它是純邏輯,空跑一千場不該需要一個 store),
   * 所以日子是<b>餵進來</b>的:beginBattle 收一次就夠,一場架不會跨日。
   */
  day: 0,
};

/**
 * 這一場打了多久(秒)。
 *
 * <b>凡是和 hurtAt / guardAt / impact.t 比的,都得用這個</b>,
 * 不能拿 three 的 clock.elapsedTime。兩者不是同一條時間軸:
 * 這一條每開一場架就歸零,那一條從開網頁那一刻起一路加上去。
 *
 * 為什麼特地寫下來:渲染端原本就是拿 elapsedTime 去減 hurtAt 的,
 * 於是「挨打閃一下」和命中的聲音<b>從來沒有發生過</b> ——
 * 條件是 `elapsedTime - hurtAt < 0.05`,而左邊在開場一分鐘後就是 60,
 * 永遠不可能小於 0.05。畫面上什麼都沒有,又不會報錯,
 * 所以它安安靜靜地壞了很久(是加火花那一批才被抓到的:
 * 火花一顆都不出現,而屍首確實在增加)。
 *
 * 渲染端只讀,所以給個函式而不是直接把欄位露出去。
 */
export function battleTime(): number {
  return sim.clock;
}
