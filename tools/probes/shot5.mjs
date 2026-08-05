import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(10000);
await page.evaluate(() => window.__setClock?.(11.5, 'autumn'));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'docs/art-research/p-start.png' });
// 走一段路,看鏡頭跟不跟得上、人有沒有踩進地裡
await page.keyboard.down('KeyW');
await page.waitForTimeout(2600);
await page.screenshot({ path: 'docs/art-research/p-walk.png' });
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(2600);
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/art-research/p-run.png' });
console.log('ERRORS:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
await browser.close();
