import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: false, args: ['--use-gl=angle'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForTimeout(11000);
await page.evaluate(() => window.__setClock?.(10.5, 'autumn'));
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  hasNear: typeof window.__near,
  // 從模組拿不到,改看畫面上有幾個人在動 — 用 presences 需要 export 到 window
  probe: window.__probe ? window.__probe() : 'no probe',
}));
console.log(JSON.stringify(info));
await b.close();
