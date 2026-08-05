import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__walkTo === 'function' && typeof window.__walkToPlace === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
// 標題頁蓋在世界上面 —— 驗收腳本要先開局,否則點不到任何東西
await page.evaluate(() => window.__begin && window.__begin());
await page.evaluate(() => { localStorage.clear(); window.__heroStore.setState({ gold: 300 }); window.__village(20); });

for (let i = 0; i < 45; i++) {
  await page.evaluate(() => window.__walkToPlace('tavern'));
  await page.waitForTimeout(900);
  if (await page.evaluate(() => window.__nearPlace() === 'tavern')) break;
}
console.log('到酒肆了嗎:', await page.evaluate(() => window.__nearPlace()));
await page.keyboard.press('KeyF');
await page.waitForTimeout(400);
const txt = () => page.evaluate(() => document.body.innerText).then((t) => t.replace(/\s+/g, ' '));
console.log('面板:', (await txt()).slice(0, 220));

const gold0 = await page.evaluate(() => window.__heroStore.getState().gold);
await page.getByRole('button', { name: /打聽/ }).click();
await page.waitForTimeout(300);
const t2 = await txt();
console.log('打聽到:', t2.slice(t2.indexOf('「'), t2.indexOf('」') + 1) || '(沒有引號句)');

await page.getByRole('button', { name: /喝一碗/ }).click();
await page.waitForTimeout(300);
const gold1 = await page.evaluate(() => window.__heroStore.getState().gold);
console.log('錢:', gold0, '->', gold1);

await page.getByRole('button', { name: /雇一個鄉勇/ }).click();
await page.waitForTimeout(300);
const t3 = await txt();
console.log('白身雇人:', t3.slice(t3.indexOf('「'), t3.indexOf('」') + 1) || '(沒回話)');

// 升成部曲再試
await page.evaluate(() => window.__heroStore.setState({ merit: 30 }));
await page.waitForTimeout(300);
await page.getByRole('button', { name: /雇一個鄉勇/ }).click();
await page.waitForTimeout(400);
console.log('部曲雇人 · 隨行:', await page.evaluate(() => window.__heroStore.getState().retinue));
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
