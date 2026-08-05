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
page.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 160)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
// macOS 會把被遮住的視窗節流到 1 FPS,量到的一切都成了慢動作 —— 必須把它拉到前面
await page.bringToFront();
await page.waitForTimeout(12000);
const fps = () => page.evaluate(() => document.body.innerText.match(/(\d+)\s*FPS/)?.[1]);
console.log('A idle:', await fps());
await page.evaluate(() => window.__setClock?.(11, 'autumn'));
await page.waitForTimeout(1500);
console.log('B after clock:', await fps());
await page.evaluate(() => window.__heroStore.setState({ followers: ['v0','v1','v2'] }));
await page.waitForTimeout(2500);
console.log('C after 3 followers:', await fps());
const b = (await page.evaluate(() => window.__bands()))[0];
for (let i = 0; i < 8; i++) {
  await page.evaluate(([x, z]) => window.__walkTo(x, z), [b.x, b.z]);
  await page.waitForTimeout(2500);
  console.log(`D walk ${i}:`, await fps(), 'at', await page.evaluate(() => window.__probe().player),
              'battle', await page.evaluate(() => window.__battle().bandId));
}
await browser.close();
