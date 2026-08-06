import { chromium } from '@playwright/test';

/** 人的相批:市集看衣色與老人,搭話看立繪剪影。 */
const PORT = process.env.PORT || 5181;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__bands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(800);

console.log('── 市集晌午(衣色分行當)');
await page.evaluate(() => {
  window.__setClock(12.5, 'autumn'); window.__setWeather('clear');
  window.__place(18, 6);
});
await page.waitForTimeout(3000);
await page.screenshot({ path: 'docs/art-research/v4-trades.png', timeout: 60000 });

console.log('── 搭話(立繪剪影)');
let who = null;
for (let i = 0; i < 12 && !who; i++) {
  who = await page.evaluate(() => window.__near && window.__near());
  if (!who) {
    await page.evaluate(() => {
      const ids = ['v3', 'v7', 'v11', 'v15', 'v20'];
      window.__walkToNpc(ids[Math.floor(Math.random() * ids.length)]);
    });
    await page.waitForTimeout(1500);
  }
}
console.log('身邊的人:', who);
if (who) await page.evaluate((id) => window.__talkTo(id), who);
await page.waitForTimeout(700);
await page.screenshot({ path: 'docs/art-research/v4-portrait.png', timeout: 60000 });

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
