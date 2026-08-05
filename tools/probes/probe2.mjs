import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: false, args: ['--use-gl=angle'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(11000);
await page.evaluate(() => { window.__setClock?.(10.5, 'autumn'); window.__village?.(22); });
await page.waitForTimeout(600);
// 對話面板要開著 __errands 才掛得上 —— 先靠近誰都行
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => { const p = window.__probe(); window.__walkTo(p.player[0]+p.toward[0], p.player[1]+p.toward[1]); });
  await page.waitForTimeout(500);
  if (await page.evaluate(() => window.__near?.())) break;
}
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
console.log(JSON.stringify(await page.evaluate(() => window.__errands ? window.__errands() : 'not mounted')));
await b.close();
