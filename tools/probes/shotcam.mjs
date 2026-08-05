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
await page.evaluate(() => window.__setClock?.(10.5, 'autumn'));
let buried = 0, samples = 0;
for (let i = 0; i < 26; i++) {
  const a = i * 0.62;
  await page.evaluate((v) => { const p = window.__probe(); window.__walkTo(p.player[0] + Math.sin(v)*22, p.player[1] + Math.cos(v)*22); }, a);
  await page.waitForTimeout(1700);
  const c = await page.evaluate(() => window.__cam());
  samples++; if (c.buried) buried++;
  if (i % 4 === 0) console.log(i, JSON.stringify(c));
}
console.log(`buried ${buried}/${samples}`);
await page.screenshot({ path: 'docs/art-research/cam-final.png' });
await browser.close();
