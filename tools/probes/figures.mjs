import { chromium } from '@playwright/test';

/**
 * 人 —— 這個世界裡的每一種身子各看一眼:主角、村民、隨行、陣上、縣城站樁的。
 *
 * 這支腳本是加「腿」那一批留下來的。在那之前每個人都是一件垂到地的袍子
 * 加一顆頭,遠看是棋子、走起來像在冰上滑;下擺提到胯露出腿以後,
 * <b>全世界的人都得跟著改</b> —— 漏掉任何一處,那一處的人就成了半截。
 * 所以這裡一種身子拍一張:漏了誰,一眼看得出來。
 *
 * 取景的坑:村子裡隨手挑座標,十次有八次鏡頭埋在屋簷或樹冠裡。
 * 河邊最保險 —— 水面上不長樹也不蓋房,從河心往岸上看中間什麼都沒有。
 */

const PORT = process.env.PORT || 5179;
const OUT = process.env.OUT || 'docs/art-research';
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__place === 'function', null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__setClock(11.0, 'autumn'); window.__setWeather('clear'); });

const ok = (b, t) => console.log(b ? `  \u2713 ${t}` : `  \u2717 ${t}`);
const shot = async (n) => {
  await page.bringToFront();
  await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 60000 });
  console.log(' ', n);
};
const at = (x, z) => page.evaluate(([a, b]) => window.__terrain(a, b).h, [x, z]);
/** 從河心往岸上看,擺完立刻按快門(解算器半秒就把鏡頭拉回肩後)。 */
async function fromRiver(off, name) {
  const [px, pz] = await page.evaluate(() => window.__probe().player);
  const py = await at(px, pz);
  await page.evaluate(([c, l]) => window.__setCam(c, l),
    [[px + off[0], py + off[1], pz + off[2]], [px, py + 0.55, pz]]);
  await page.waitForTimeout(24);
  await shot(name);
}

const dk = await page.evaluate(() => window.__dockAt());
await page.evaluate(([x, z]) => window.__place(x, z), dk);
await page.waitForTimeout(2600);
// 河在碼頭的哪一側 —— 往兩邊掃,最低的那一點是水面
const side = await page.evaluate(([x, z]) => {
  let best = null;
  for (let d = -18; d <= 18; d += 1.5) {
    const h = window.__terrain(x + d, z).h;
    if (!best || h < best.h) best = { d, h };
  }
  return best.d;
}, dk);

console.log('── 主角:站、走、跑');
await fromRiver([side * 0.55, 1.05, 0.6], 'f-stand');
// A/D 是橫著走,不會一頭鑽進屋子裡
await page.keyboard.down('KeyA');
for (const i of [0, 1, 2]) {
  await page.waitForTimeout(190);
  await fromRiver([side * 0.55, 1.05, 0.6], `f-walk-${i}`);
}
await page.keyboard.up('KeyA');
await page.evaluate(([x, z]) => window.__place(x, z), dk);
await page.waitForTimeout(1600);
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyA');
for (const i of [0, 1]) {
  await page.waitForTimeout(190);
  await fromRiver([side * 0.55, 1.05, 0.6], `f-run-${i}`);
}
await page.keyboard.up('KeyA');
await page.keyboard.up('ShiftLeft');

/*
 * 四肢真的在擺嗎。
 *
 * 這一段不看圖 —— 走路時手腳的角度用眼睛在截圖上判不出來,而接線壞掉
 * (ref 沒接上、相位算錯)在畫面上只是「人有點僵」,沒人說得清哪裡不對。
 * 直接把場上每一條四肢的 rotation.x 讀出來:'YXZ' 這個轉序是四肢專用的記號。
 */
console.log('── 四肢');
await page.evaluate(() => {
  window.__limbs = () => {
    const out = [];
    window.__scene.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && o.rotation.order === 'YXZ') {
        out.push(+o.rotation.x.toFixed(3));
      }
    });
    return out;
  };
});
// 先站定 —— 四肢是「動起來才不為零」的東西,量之前得先真的停下來
await page.waitForTimeout(700);
const still = await page.evaluate(() => window.__limbs());
await page.keyboard.down('KeyA');
let swung = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(120);
  const now = await page.evaluate(() => window.__limbs());
  if (now.some((v) => Math.abs(v) > 0.15)) swung = now;
}
await page.keyboard.up('KeyA');
await page.waitForTimeout(600);
const rest = await page.evaluate(() => window.__limbs());
console.log(`  站著 ${JSON.stringify(still)} · 走著 ${JSON.stringify(swung)}`);
ok(still.length >= 4 && still.every((v) => v === 0), '站住的時候四肢歸零(不然人會劈著腿站著)');
ok(swung.length >= 4, '走起來四肢真的在擺');
ok(rest.every((v) => v === 0), '停下來又收回去');

console.log('── 隨行的兩個');
await page.evaluate(() => {
  const h = window.__heroStore.getState();
  for (const id of window.__braveIds().slice(0, 2)) h.recruit(id);
});
await page.evaluate(([x, z]) => window.__place(x, z), dk);
await page.waitForTimeout(2000);
await page.keyboard.down('KeyA');
await page.waitForTimeout(1400);
await page.keyboard.up('KeyA');
await page.waitForTimeout(200);
await fromRiver([side * 0.7, 2.0, 2.4], 'f-followers');

console.log('── 陣上');
await page.evaluate(() => {
  const p = window.__probe().player;
  window.__forceBattle(p[0] + 7, p[1] + 3, 5, 0.7);
});
await page.waitForTimeout(1400);
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => { window.__strike(); window.__closeIn(); });
  await page.waitForTimeout(160);
}
await fromRiver([side * 0.8, 2.4, 3.0], 'f-battle');

console.log('errors:', errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
