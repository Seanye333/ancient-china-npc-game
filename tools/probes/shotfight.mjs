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
const bands = await page.evaluate(() => window.__bands());
console.log('bands:', JSON.stringify(bands));
const b = bands.sort((a, c) => a.count - c.count)[0];   // 挑最小的一夥練手
// 走過去 —— 一直走到打起來為止
for (let i = 0; i < 40; i++) {
  await page.evaluate(([x, z]) => window.__walkTo(x, z), [b.x, b.z]);
  await page.waitForTimeout(2000);
  if (await page.evaluate(() => window.__battle().bandId)) break;
}
console.log('arrived at', await page.evaluate(() => window.__probe().player), 'camp', b.x, b.z);
await page.evaluate(([x, z]) => window.__walkTo(x, z), [b.x, b.z]);
await page.waitForTimeout(3000);
console.log('engaged:', JSON.stringify(await page.evaluate(() => window.__battle())));
await page.screenshot({ path: 'docs/art-research/h-closing.png', timeout: 90000 }).catch((e) => console.log('shot1 failed:', e.message.slice(0,60)));
// 打:每 0.6 秒揮一刀,同時往敵人身上靠
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => {
    window.__strike();
    const b = window.__battle();
    window.__closeIn();
  });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.__battle());
  if (i % 8 === 0) console.log(i, 'ours', st.ours, 'foes', st.foes, 'me', JSON.stringify(st.me));
  if (st.tally) { console.log('TALLY', JSON.stringify(st.tally)); break; }
}
if (!(await page.evaluate(() => window.__battle().tally))) await page.screenshot({ path: 'docs/art-research/h-mid.png', timeout: 60000 }).catch(() => {});
await page.screenshot({ path: 'docs/art-research/h-melee.png', timeout: 90000 }).catch((e) => console.log('shot2 failed:', e.message.slice(0,60)));
const txt = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
console.log('screen:', txt.slice(0, 220));
console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
