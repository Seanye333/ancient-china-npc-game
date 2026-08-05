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
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
// macOS 會把被遮住的視窗節流到 1 FPS,量到的一切都成了慢動作 —— 必須把它拉到前面
await page.bringToFront();
await page.waitForTimeout(11000);
await page.evaluate(() => { window.__setClock?.(11, 'autumn'); window.__heroStore.setState({ followers: ['v0','v1','v2'] }); });
// 河在 x ≈ meander(z)。從東岸走到橋頭,再過橋到西岸。
const meander = (z) => Math.sin(z * 0.02) * 9 + Math.sin(z * 0.047) * 3.5;
const bz = 6, bm = meander(bz);
const start = await page.evaluate(() => window.__probe().player);
console.log('start', start, 'bridge x', bm.toFixed(1));
for (const [x, z] of [[bm + 11, bz], [bm + 3, bz], [bm - 4, bz], [bm - 12, bz]]) {
  await page.evaluate(([a, b]) => window.__walkTo(a, b), [x, z]);
  await page.waitForTimeout(5200);
  const p = await page.evaluate(() => ({ pos: window.__probe().player, cam: window.__cam() }));
  console.log(`want x=${x.toFixed(1)} ->`, JSON.stringify(p));
}
await page.screenshot({ path: 'docs/art-research/g-bridge.png' });
console.log('crossed:', (await page.evaluate(() => window.__probe().player))[0] < bm - 6 ? 'YES' : 'NO');
console.log('errors:', errors.slice(0,2).join(' | ') || 'none');
await browser.close();
