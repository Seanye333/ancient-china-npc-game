import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForTimeout(12000);
await page.evaluate(() => { window.__setClock?.(10, 'autumn'); window.__heroStore.setState({ followers: ['v0','v1','v2'] }); });
await page.waitForTimeout(1200);
await page.evaluate(() => { const p = window.__probe().player; window.__forceBattle(p[0] + 11, p[1] + 11, 4, 0.4); });
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/art-research/i-closing.png', timeout: 60000 });
for (let i = 0; i < 26; i++) {
  await page.evaluate(() => { window.__strike(); window.__closeIn(); });
  await page.waitForTimeout(420);
  const st = await page.evaluate(() => window.__battle());
  if (i === 2 || i === 7) await page.screenshot({ path: `docs/art-research/i-melee${i}.png`, timeout: 60000 });
  if (st.tally) { console.log('tally after', i, JSON.stringify(st.tally)); break; }
  if (i % 6 === 0) console.log(i, 'ours', st.ours, 'foes', st.foes, 'me', JSON.stringify(st.me));
}
await page.screenshot({ path: 'docs/art-research/i-after.png', timeout: 60000 });
console.log('fps', await page.evaluate(() => document.body.innerText.match(/(\d+)\s*FPS/)?.[1]));
console.log('errors:', errors.slice(0, 2).join(' | ') || 'none');
await browser.close();
