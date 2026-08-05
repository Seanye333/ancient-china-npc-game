import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(11000);
await page.evaluate(() => window.__setClock?.(10.5, 'autumn'));
await page.waitForTimeout(1200);

// 用自動導航走過去 —— 鍵盤映射會被鏡頭朝向繞暈,直接給座標最可靠
let found = null;
for (let i = 0; i < 24 && !found; i++) {
  await page.evaluate(() => {
    const p = window.__probe();
    window.__walkTo(p.player[0] + p.toward[0], p.player[1] + p.toward[1]);
  });
  await page.waitForTimeout(600);
  found = await page.evaluate(() => window.__near?.());
}
await page.screenshot({ path: 'docs/art-research/i-near.png' });
console.log('nearby:', found, JSON.stringify(await page.evaluate(() => window.__probe())));

if (found) {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'docs/art-research/i-talk.png' });
  console.log('dialogue:', (await page.evaluate(() => document.body.innerText))
    .replace(/\s+/g, ' ').slice(0, 180));
}
console.log('ERRORS:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
await browser.close();
