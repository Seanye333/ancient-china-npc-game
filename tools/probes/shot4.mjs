import { chromium } from '@playwright/test';
const shots = [
  { n: 'morning', h: 7.6,  s: 'spring', w: 'clear', cam: [40, 12, 40], t: [16, 3, 12] },
  { n: 'tavern',  h: 17.4, s: 'autumn', w: 'clear', cam: [40, 7.5, -2], t: [26.5, 2.4, 9] },
  { n: 'tavern2', h: 20.6, s: 'autumn', w: 'clear', cam: [36, 6.5, 1], t: [26.5, 2.2, 9] },
  { n: 'rain',    h: 14.0, s: 'summer', w: 'rain',  cam: [44, 16, 46], t: [12, 3, 10] },
  { n: 'snow',    h: 10.5, s: 'winter', w: 'snow',  cam: [44, 16, 46], t: [12, 3, 10] },
  { n: 'dusk',    h: 18.2, s: 'autumn', w: 'clear', cam: [56, 20, 54], t: [10, 3, 8] },
];
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(10000);
for (const f of shots) {
  await page.evaluate((x) => {
    window.__setClock?.(x.h, x.s);
    window.__setWeather?.(x.w);
    window.__setCam?.(x.cam, x.t);
  }, f);
  await page.waitForTimeout(3200);       // 讓 NPC 走到位、屋頂淡完
  await page.screenshot({ path: `docs/art-research/x-${f.n}.png` });
  console.log('shot', f.n);
}
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
                       else res(Math.round((n * 1000) / (performance.now() - t0))); };
  requestAnimationFrame(loop);
}));
console.log('FPS:', fps);
console.log('ERRORS:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
await browser.close();
