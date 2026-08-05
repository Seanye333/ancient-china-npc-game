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
const bands = await page.evaluate(() => window.__bands());
console.log('bands:', JSON.stringify(bands));
const b = bands[0];
// 沿玩家→營地的直線每 4 步驗一次地
const p0 = await page.evaluate(() => window.__probe().player);
const n = Math.round(Math.hypot(b.x - p0[0], b.z - p0[1]) / 4);
const line = await page.evaluate(([p, q, n]) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t;
    out.push([Math.round(x), Math.round(z), window.__terrain(x, z)]);
  }
  return out;
}, [p0, [b.x, b.z], n]);
for (const [x, z, t] of line) console.log(`(${x},${z})`, JSON.stringify(t));
await browser.close();
