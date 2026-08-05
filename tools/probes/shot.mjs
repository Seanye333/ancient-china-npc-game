import { chromium } from '@playwright/test';

const shots = [
  { name: 'wide',   cam: [96, 52, 118], target: [0, 4, 0] },
  { name: 'town',   cam: [26, 11, 34],  target: [4, 2, 4] },
  { name: 'valley', cam: [-40, 15, 62], target: [2, 1, 14] },
  { name: 'far',    cam: [150, 92, 175], target: [0, 6, 0] },
  { name: 'gate',   cam: [74, 30, -74],  target: [11, 5, -118] },
  { name: 'temple', cam: [72, 22, -6],   target: [34, 4, -34] },
  { name: 'farms',  cam: [92, 40, 56],   target: [34, 3, 16] },
];

// headless 下 WebGL 走 SwiftShader,3D 場景常常渲不出來 —— 用有頭模式才作數。
const browser = await chromium.launch({
  headless: false,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);          // 讓地形/植被建完再拍

for (const s of shots) {
  await page.evaluate(({ cam, target }) => {
    // R3F 沒有全域 handle,直接透過 three 的場景圖找相機比較穩
    const w = window;
    if (w.__setCam) w.__setCam(cam, target);
  }, s);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `docs/art-research/web-${s.name}.png` });
  console.log('shot', s.name);
}
console.log('ERRORS:', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
await browser.close();
