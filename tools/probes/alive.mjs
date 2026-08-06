import { chromium } from '@playwright/test';

/** 活的世界批的驗收:晨霧、雞犬、酒旗、飛鳥、樹搖(靠 FPS 與報錯兜底)。 */
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

console.log('── 夏晨河邊(晨霧)');
await page.evaluate(() => {
  window.__setClock(5.9, 'summer'); window.__setWeather('clear');
  const d = window.__dockAt();
  window.__place(d[0] + 2, d[1] + 6);
});
await page.waitForTimeout(3000);
await page.screenshot({ path: 'docs/art-research/v4-morning-mist.png', timeout: 60000 });

console.log('── 市集上午(酒旗+雞+飛鳥)');
await page.evaluate(() => {
  window.__setClock(10, 'summer');
  window.__place(14, 14);       // 市集空地,四周開闊
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'docs/art-research/v4-alive-day.png', timeout: 60000 });

console.log('── 秋晨同機位(和 v2 基線對比,查回歸)');
await page.evaluate(() => { window.__setClock(9.5, 'autumn'); window.__place(18, 6); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'docs/art-research/v4-regress-check.png', timeout: 60000 });

const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const loop = () => {
    n++;
    if (performance.now() - t0 > 2000) { res(Math.round(n / 2)); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}));
console.log('穩態 FPS:', fps);
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
