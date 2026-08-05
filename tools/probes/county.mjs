import { chromium } from '@playwright/test';

/** 走去縣城:半天路,兩個價,住店,投書。 */
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__walkToPlace === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin());
await page.evaluate(() => window.__heroStore.setState({ gold: 300, grain: 30, renown: 30 }));

const t0 = await page.evaluate(() => ({ d: window.__clock().day, h: window.__clock().hour }));
console.log('出發:', JSON.stringify(t0));
let arrived = false;
for (let i = 0; i < 90 && !arrived; i++) {
  await page.evaluate(() => window.__walkToPlace('county-market'));
  await page.waitForTimeout(1200);
  arrived = await page.evaluate(() => window.__nearPlace() === 'county-market');
  if (i % 12 === 0) console.log('  ', await page.evaluate(() => window.__probe().player));
}
const t1 = await page.evaluate(() => ({ d: window.__clock().day, h: window.__clock().hour }));
console.log('到城:', arrived, JSON.stringify(t1), '· 走了約',
  ((t1.d - t0.d) * 24 + t1.h - t0.h).toFixed(1), '個時辰');
if (!arrived) { console.log('errors:', errors.slice(0,2).join(' | ')); await browser.close(); process.exit(1); }

await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
const txt = () => page.evaluate(() => document.body.innerText).then(t => t.replace(/\s+/g,' '));
const m = await txt();
console.log('城裡市集:', m.slice(m.indexOf('縣城市集'), m.indexOf('縣城市集') + 130));
await page.keyboard.press('Escape');

for (const [id, label, btn] of [['county-inn','客棧',/投宿一宿/], ['county-yamen','縣衙',/投書自薦/]]) {
  for (let i = 0; i < 30; i++) {
    await page.evaluate((p) => window.__walkToPlace(p), id);
    await page.waitForTimeout(900);
    if (await page.evaluate((p) => window.__nearPlace() === p, id)) break;
  }
  const ok = await page.evaluate((p) => window.__nearPlace() === p, id);
  console.log(label, '到了嗎:', ok);
  if (!ok) continue;
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  // 用 DOM 直接點:這支腳本驗的是<b>邏輯</b>,不是命中判定。
  // 走 Playwright 的 click 會連帶驗「有沒有東西蓋在上面」,那是另一回事,
  // 混在一起的話,一個 z-index 問題會看起來像客棧壞了
  const g0 = await page.evaluate(() => window.__heroStore.getState().gold);
  const hit = await page.evaluate((re) => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => new RegExp(re).test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  }, btn.source);
  await page.waitForTimeout(500);
  if (hit) {
    const after = await txt();
    console.log('  ', after.slice(after.indexOf(label), after.indexOf(label) + 140));
    console.log('   錢', g0, '->', await page.evaluate(() => window.__heroStore.getState().gold));
  } else console.log('   找不到按鈕');
  await page.keyboard.press('Escape');
}
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
