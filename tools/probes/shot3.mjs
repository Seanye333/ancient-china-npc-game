import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

// 走者沿主道來回,所以連拍三張看得出位移
const road = { cam: [34, 9, 30], target: [14, 2.5, 4] };
await page.evaluate(({ cam, target }) => {
  window.__setClock?.(15.6, 'autumn');
  window.__setCam?.(cam, target);
}, road);
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `docs/art-research/w-step${i}.png` });
  console.log('step', i);
}
// 幀率 — 動起來之後才知道扛不扛得住
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
                       else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(loop);
}));
console.log('FPS:', fps);
await page.evaluate(() => { window.__setCam?.([16, 6, 20], [10, 2, 4]); });
await page.waitForTimeout(1600);
await page.screenshot({ path: 'docs/art-research/w-close.png' });
console.log('ERRORS:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
await browser.close();
