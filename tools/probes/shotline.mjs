import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: [
    '--use-gl=angle',
    // macOS 會判定被遮住的視窗「不可見」而把 rAF 節流到 1 FPS ——
    // 量出來的一切都會變成慢動作。這兩個旗標把那個判定關掉。
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
// macOS 會把被遮住的視窗節流到 1 FPS,量到的一切都成了慢動作 —— 必須把它拉到前面
await page.bringToFront();
await page.waitForTimeout(11000);
// 直接塞三個隨行,省掉招募流程

const ok = await page.evaluate(() => {
  const h = window.__heroStore; if (!h) return false;
  h.setState({ followers: ['v0','v1','v2'] }); return true;
});
console.log('seeded:', ok);
for (const leg of [[20,0],[0,20],[-25,-10],[14,-18]]) {
  await page.evaluate((d) => { const p = window.__probe(); window.__walkTo(p.player[0]+d[0], p.player[1]+d[1]); }, leg);
  await page.waitForTimeout(2600);
  console.log('walking:', JSON.stringify(await page.evaluate(() => window.__line())));
  await page.waitForTimeout(2600);
  console.log('settled:', JSON.stringify(await page.evaluate(() => window.__line())));
}
await page.screenshot({ path: 'docs/art-research/g-line.png' });
await browser.close();
