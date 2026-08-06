import { chromium } from '@playwright/test';

/** 夜與光批的驗收:星月夜、水面反射、清晨體積光。 */
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

console.log('── 星月夜(河邊,看反射+星空)');
await page.evaluate(() => {
  window.__setClock(22.4, 'autumn'); window.__setWeather('clear');
  const d = window.__dockAt();
  window.__place(d[0] + 2, d[1] + 5);
});
await page.waitForTimeout(3000);
await page.screenshot({ path: 'docs/art-research/v4-night-sky.png', timeout: 60000 });

console.log('── 清晨斜光(體積光)');
await page.evaluate(() => { window.__setClock(6.9, 'autumn'); window.__place(18, 6); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'docs/art-research/v4-godrays.png', timeout: 60000 });

console.log('── 黃昏村景(反射裡的燈)');
await page.evaluate(() => { window.__setClock(18.1, 'autumn'); window.__place(6, -8); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'docs/art-research/v4-dusk-lights.png', timeout: 60000 });

const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const loop = () => {
    n++;
    if (performance.now() - t0 > 2000) { res(Math.round(n / 2)); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}));
console.log('黃昏稳態 FPS(反射開著):', fps);
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
