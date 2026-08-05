import { chromium } from '@playwright/test';

// 每格 = 一個 [季節, 時辰, 機位]
const frames = [
  { name: 'people',  season: 'autumn', hour: 16.4, cam: [18, 8, 26],   target: [3, 2.5, 6] },
  { name: 'bridge',  season: 'autumn', hour: 17.6, cam: [-16, 7, 22],  target: [-2, 2, 6] },
  { name: 'spring',  season: 'spring', hour: 9.0,  cam: [92, 44, 96],  target: [0, 4, 6] },
  { name: 'summer',  season: 'summer', hour: 12.5, cam: [92, 44, 96],  target: [0, 4, 6] },
  { name: 'autumn',  season: 'autumn', hour: 17.4, cam: [92, 44, 96],  target: [0, 4, 6] },
  { name: 'winter',  season: 'winter', hour: 8.6,  cam: [92, 44, 96],  target: [0, 4, 6] },
  { name: 'dawn',    season: 'spring', hour: 6.4,  cam: [64, 26, 70],  target: [0, 3, 6] },
  { name: 'night',   season: 'summer', hour: 22.5, cam: [64, 26, 70],  target: [0, 3, 6] },
];

const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(9000);

for (const f of frames) {
  // 季節與時辰直接推進 zustand store,不必去點 HUD
  await page.evaluate(({ season, hour, cam, target }) => {
    const w = window;
    if (w.__setClock) w.__setClock(hour, season);
    if (w.__setCam) w.__setCam(cam, target);
  }, f);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `docs/art-research/t-${f.name}.png` });
  console.log('shot', f.name);
}
console.log('ERRORS:', errors.length ? errors.slice(0, 4).join(' | ') : 'none');
await browser.close();
