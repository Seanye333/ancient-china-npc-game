import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', String(e).slice(0, 140)));
await page.goto('http://localhost:5178/', { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForTimeout(12000);
const fps = async () => (await page.evaluate(() => document.body.innerText.match(/(\d+)\s*FPS/)?.[1]));
console.log('before battle:', await fps());
// 直接在原地開一場,省掉長途跋涉
await page.evaluate(() => {
  window.__heroStore.setState({ followers: ['v0','v1','v2'] });
  const b = window.__bands()[0];
  const p = window.__probe().player;
  window.__forceBattle?.(p[0] + 6, p[1] + 6, 3, 0.4);
  void b;
});
await page.waitForTimeout(1500);
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => window.__battle());
  console.log(i, 'fps', await fps(), 'ours', st.ours, 'foes', st.foes, 'bandId', st.bandId);
}
await browser.close();
