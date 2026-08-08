import { chromium } from '@playwright/test';

/**
 * 人與打鬥那一批的驗收 —— 神情、手勢、隨身物、擋閃、血、屍首。
 *
 * 前三樣要用眼睛看(而且要<b>湊近</b>看,遠景裡一張臉只有十幾個像素);
 * 後三樣要盯數字,因為火花只活 0.45 秒、擋刀只演 0.22 秒。
 */

const PORT = process.env.PORT || 5178;
const OUT = process.env.OUT || 'docs/art-research';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__fallen === 'function', null, { timeout: 60000 });
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__setWeather('clear'); window.__setClock(11, 'summer'); });

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);

/* ── 一、湊近看人:神情、手上帶的東西、說話的手勢 ── */
console.log('── 村口的人:臉、手上的東西、說話的樣子');
const roster = await page.evaluate(() => window.__villagers());
console.log(`  街上 ${roster.length} 人`);
let shot = 0;
for (const v of roster.slice(0, 30)) {
  if (shot >= 3) break;
  await page.evaluate(([x, z]) => window.__place(x + 2.0, z + 2.0), [v.x, v.z]);
  await page.waitForTimeout(1300);
  if (await page.evaluate(() => window.__cam().buried)) continue;
  // 凍住解算器,把鏡頭端到人臉前面 —— 神情是十幾個像素的事,退一步就沒了
  const at = await page.evaluate((id) => {
    const p = window.__villagers().find((q) => q.id === id);
    return p ? [p.x, p.z] : null;
  }, v.id);
  if (!at) continue;
  /*
   * 要拍到<b>臉</b>,得站在他面前 —— 而 __villagers 沒有給朝向。
   * 繞一圈拍四張,再挑最亮的那一張(臉是膚色的,背面是深色的頭髮與袍子:
   * 平均亮度就是一把夠用的尺)。
   */
  await page.evaluate(() => window.__freezeCam(true));
  let best = null;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    await page.evaluate(([x, z, ang]) => window.__setCam(
      [x + Math.sin(ang) * 1.7, 1.35, z + Math.cos(ang) * 1.7], [x, 1.12, z],
    ), [at[0], at[1], a]);
    await page.waitForTimeout(260);
    await page.bringToFront();
    const buf = await page.screenshot({ clip: { x: 560, y: 260, width: 280, height: 280 } });
    // 只看正中那一塊的平均亮度
    let sum = 0;
    for (let i = 0; i < buf.length; i += 997) sum += buf[i];
    if (!best || sum > best.lum) best = { lum: sum, ang: a };
  }
  await page.evaluate(([x, z, ang]) => window.__setCam(
    [x + Math.sin(ang) * 1.7, 1.35, z + Math.cos(ang) * 1.7], [x, 1.12, z],
  ), [at[0], at[1], best.ang]);
  await page.waitForTimeout(300);
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/folk-face-${shot}.png` });
  await page.evaluate(() => window.__freezeCam(false));
  console.log(`  拍了 folk-face-${shot}(${v.id})`);
  shot++;
}

/* ── 二、打一場:擋、閃、血、屍首 ── */
console.log('── 打一場');
/*
 * 挑一塊<b>空地</b>開打。
 * 第一版就地在 (0,0) 開,結果三個近戰全卡在屋子後面走不過來,
 * 二十秒只有弓手在射 —— 「擋刀」與「火星」一次都沒發生,
 * 看起來像新功能沒接上,其實是機位選錯了。
 */
await page.evaluate(() => window.__place(-4, 44));
await page.waitForTimeout(1800);
const before = await page.evaluate(() => window.__fallen());
await page.evaluate(() => window.__forceBattle(-4 + 5, 44 + 5, 4, 0.5));
await page.waitForTimeout(1200);

let maxImpacts = 0;
for (let i = 0; i < 60; i++) {
  // 每一拍都出手 —— 不打的話這一場會拖到僵局規則發作
  await page.keyboard.press('Space');
  await page.waitForTimeout(320);
  const f = await page.evaluate(() => window.__fallen());
  const bb = await page.evaluate(() => window.__battle());
  maxImpacts = Math.max(maxImpacts, f.impacts);
  if (i % 8 === 0) console.log(`    #${i} 畫出 ${f.impacts} · 陣列 ${bb.impacts} · 鐘 ${bb.bt} · ${JSON.stringify(bb.guard)} · 箭 ${bb.loosed}`);
  if (i === 6) {
    await page.bringToFront();
    await page.screenshot({ path: `${OUT}/fight-mid.png` });
  }
  const b = await page.evaluate(() => window.__battle());
  if (!b.bandId || b.tally) break;
}
const after = await page.evaluate(() => window.__fallen());
const bt = await page.evaluate(() => window.__battle());
console.log(`  收場 ${JSON.stringify(bt.tally)}`);
console.log(`  地上 ${JSON.stringify(after)} · 打鬥中最多 ${maxImpacts} 顆火花/血`);
ok(maxImpacts > 0, `打中/架開有東西濺出來(最多同時 ${maxImpacts} 顆)`);
ok(after.corpses > before.corpses, `地上留下 ${after.corpses} 具`);
ok(after.stains >= after.corpses, `血漬 ${after.stains} 攤`);

// 收場、走開幾步再回頭 —— 屍首該還在
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.evaluate(() => window.__place(10, 56));
await page.waitForTimeout(1600);
await page.evaluate(() => window.__place(-2, 46));
await page.waitForTimeout(1800);
const back = await page.evaluate(() => window.__fallen());
ok(back.corpses > 0, `走開再回來,人還躺在那裡(${back.corpses} 具)`);
await page.bringToFront();
await page.screenshot({ path: `${OUT}/fight-after.png` });

// 過幾天 —— 該收走了
await page.evaluate(() => {
  const d = window.__clock().day;
  window.__clock().advance(24 * 4);
  return d;
});
await page.waitForTimeout(1500);
const gone = await page.evaluate(() => window.__fallen());
console.log(`  四天後 ${JSON.stringify(gone)}`);
ok(gone.corpses === 0, '過幾天有人來收');
ok(gone.stains > 0, '血漬還留著 —— 比屍首久');

console.log(errors.length ? `!! ${errors.length} 個錯誤:\n${errors.slice(0, 4).join('\n')}` : '  無錯誤');
await browser.close();
