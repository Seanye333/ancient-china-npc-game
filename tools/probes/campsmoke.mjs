import { chromium } from '@playwright/test';

/**
 * 看得見那道煙嗎 —— 賊窩是這個遊戲唯一的「任務標記」,而它不是 UI。
 * 順帶驗兩件事:走到營地邊上鏡頭有沒有被樹埋掉、打散之後煙有沒有停。
 */
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__bands === 'function', null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { window.__setClock(9, 'autumn'); window.__setWeather('clear'); });

const bands = await page.evaluate(() => window.__bands());
const b = bands[1];
console.log('營地', b.name, [b.x, b.z]);

/**
 * 走到離營地 d 步,鏡頭自然就朝著營地 —— <b>不要用 __setCam</b>:
 * 鏡頭現在由 Player 每幀解算並覆寫,那個把手推不動它了(推了也在下一幀被蓋掉)。
 */
async function approach(d) {
  for (let i = 0; i < 70; i++) {
    await page.evaluate(([x, z]) => window.__walkTo(x, z), [b.x, b.z]);
    await page.waitForTimeout(1000);
    const now = await page.evaluate(([x, z]) => {
      const p = window.__probe().player;
      return Math.hypot(x - p[0], z - p[1]);
    }, [b.x, b.z]);
    if (now < d) return now;
  }
  return -1;
}

console.log('遠望,離營地', await approach(42), '步 · 鏡頭', JSON.stringify(await page.evaluate(() => window.__cam())));
await page.screenshot({ path: 'docs/art-research/q-smoke-far.png', timeout: 120000 });

console.log('走近,離營地', await approach(16), '步 · 鏡頭', JSON.stringify(await page.evaluate(() => window.__cam())));
await page.screenshot({ path: 'docs/art-research/q-smoke-near.png', timeout: 120000 });

// 打散以後煙該停 —— 你做過的事在地平線上就看得出來
// (直接讓那一夥散掉:這裡驗的是「煙停了沒」,不是再打一場)
await page.evaluate((id) => window.__routBand(id), b.id);
await page.waitForTimeout(2000);
await page.screenshot({ path: 'docs/art-research/q-smoke-gone.png', timeout: 120000 });
console.log('散了 ✓  剩下幾夥還在冒煙:', await page.evaluate(() =>
  window.__bands().filter((x) => !x.routed).length));

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
