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
page.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 140)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
// macOS 會把被遮住的視窗節流到 1 FPS,量到的一切都成了慢動作 —— 必須把它拉到前面
await page.bringToFront();
await page.waitForTimeout(12000);
const b = (await page.evaluate(() => window.__bands()))[0];
for (let i = 0; i < 6; i++) {
  await page.evaluate(([x, z]) => window.__walkTo(x, z), [b.x, b.z]);
  await page.waitForTimeout(2500);
}
const p = await page.evaluate(() => window.__probe().player);
console.log('stuck at', p, '-> camp', b.x, b.z);
const grid = await page.evaluate(([px, pz]) => {
  const rows = [];
  for (let dz = -2; dz <= 2; dz += 0.5) {
    let row = '';
    for (let dx = -2; dx <= 2; dx += 0.5) {
      const t = window.__terrain(px + dx, pz + dz);
      row += t.walk ? '·' : (t.blocked ? 'T' : '#');
    }
    rows.push(row);
  }
  return rows;
}, p);
console.log('  (T=障礙 #=地形 ·=可走), 中心是玩家, 上=+z');
for (const r of grid) console.log('   ' + r);
console.log('exact:', JSON.stringify(await page.evaluate(([x,z]) => window.__terrain(x,z), p)));
await browser.close();
