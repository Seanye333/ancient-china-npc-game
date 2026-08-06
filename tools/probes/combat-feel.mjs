import { chromium } from '@playwright/test';

/**
 * 打法批的驗收:弓手放箭(畫面上有箭+弓)、致命一擊(fx.finisher 真的擺了那一拍)、
 * 古琴(音訊圖建起來了,樂句真的在撥)。
 * 聲音壞掉的樣子就是安靜 —— 所以琴不用耳朵驗,問 musicState 的計數。
 * 音訊要真手勢才啟動:這支 probe 點的是標題頁真正的「開始」鈕,不走 __begin。
 */

const PORT = process.env.PORT || 5181;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__bands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);

console.log('── 開局(真點按鈕,音訊要這個手勢)');
await page.getByRole('button', { name: /就這樣開始/ }).click();
await page.waitForTimeout(1500);
console.log('audio:', JSON.stringify(await page.evaluate(() => window.__audio())));

console.log('── 古琴');
await page.evaluate(() => window.__pluck());
await page.waitForTimeout(2500);
const au = await page.evaluate(() => window.__audio());
console.log('music:', JSON.stringify(au.music), au.music.plucked > 0 ? '✓ 在撥' : '✗ 沒聲音');

console.log('── 致命一擊(帶人速殺,採 fx.finisher)');
// 「最後一個倒地」才擺那一拍;嚇跑的不算(追潰兵拍特寫很滑稽,這是設計)。
// 所以打到出現「倒地收尾」為止,最多三場 —— 順便把收場的帳打出來對
let maxFin = 0;
for (let round = 0; round < 3 && maxFin === 0; round++) {
  await page.evaluate(() => {
    window.__setClock(11, 'autumn'); window.__setWeather('clear');
    window.__heroStore.setState({ followers: ['v3', 'v11', 'v20'] });
    window.__place(0, -40);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const p = window.__probe().player;
    window.__forceBattle(p[0] + 8, p[1] + 4, 1, 0.2);
  });
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => { window.__strike(); window.__closeIn(); });
    await page.waitForTimeout(160);
    const b = await page.evaluate(() => window.__battle());
    if (b.fx && b.fx.finisher > maxFin) {
      maxFin = b.fx.finisher;
      await page.screenshot({ path: 'docs/art-research/v3-finisher.png', timeout: 60000 }).catch(() => {});
    }
    if (b.tally) { console.log(`  第${round + 1}場收場:`, JSON.stringify(b.tally)); break; }
  }
  const closeBtn = page.getByRole('button', { name: /收兵|撐起身子/ });
  if (await closeBtn.count()) await closeBtn.click();
  await page.waitForTimeout(600);
}
console.log('fx.finisher 峰值:', maxFin, maxFin > 0 ? '✓ 那一拍擺上了' : '✗ 沒觸發(三場都是嚇跑收場?)');

console.log('── 弓手(6 人寨帶一把弓)');
await page.evaluate(() => {
  window.__heroStore.setState({ followers: ['v3', 'v11', 'v20'] });
  window.__place(0, -40);
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  const p = window.__probe().player;
  window.__forceBattle(p[0] + 13, p[1], 6, 0.6);
});
await page.waitForTimeout(400);
const b0 = await page.evaluate(() => window.__battle());
console.log('弓手在陣:', b0.list.filter((f) => f.bow).length, '把弓');
let maxArrows = 0, shot = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(250);
  const b = await page.evaluate(() => window.__battle());
  if (b.arrows > maxArrows) maxArrows = b.arrows;
  if (!shot && b.arrows > 0) {
    shot = true;
    await page.screenshot({ path: 'docs/art-research/v3-archer.png', timeout: 60000 }).catch(() => {});
  }
  if (b.tally) break;
}
const bEnd = await page.evaluate(() => window.__battle());
console.log(`放了 ${bEnd.loosed} 箭 · 同屏最多 ${maxArrows} 支`, bEnd.loosed > 0 ? '✓' : '✗ 弓是擺設');

console.log('── 玩家的弓(換獵弓,自己放箭)');
{
  const closeBtn = page.getByRole('button', { name: /收兵|撐起身子/ });
  if (await closeBtn.count()) await closeBtn.click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__heroStore.setState({ weapon: 'bow', followers: [] });
    window.__place(0, -40);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const p = window.__probe().player;
    window.__forceBattle(p[0] + 10, p[1] + 3, 2, 0.3);
  });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__battle().loosed);
  let shot = false;
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => { window.__strike(); });
    await page.waitForTimeout(300);
    const b = await page.evaluate(() => window.__battle());
    if (!shot && b.arrows > 0) {
      shot = true;
      await page.screenshot({ path: 'docs/art-research/v3-player-bow.png', timeout: 60000 }).catch(() => {});
    }
    if (b.tally) break;
  }
  const after = await page.evaluate(() => window.__battle());
  console.log(`玩家放了 ${after.loosed - before} 箭`, after.loosed > before ? '✓' : '✗ 空白鍵沒在射');
}

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
