/**
 * 後處理那幾樣的把手 —— 光柱多強、焦點多遠。
 *
 * 單獨一個小檔,是因為<b>寫的人和讀的人不在同一邊</b>:
 * 寫的是 App 裡的 Focus(它每幀在調合成器),讀的是 dev/handles 那一排探針。
 * 讓探針去 import App 會繞成一個圈 —— 而這兩個數字本來就不屬於任何一邊,
 * 它們只是「此刻畫面上這一層調到哪」。
 */
export const rayStat = { weight: 0 };
export const dofStat = { focus: 0, bokeh: 0 };
