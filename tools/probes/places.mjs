import { chromium } from '@playwright/test';

/**
 * 十一種場所面板都還打得開嗎。
 *
 * 這支是<b>為了拆檔才寫的</b>:PlacePanel 從七百行拆成四個檔,
 * 而 UI 這一層一條測試都沒有 —— 拆壞了不會有人告訴你,
 * 要等到某天真的走進藥鋪才發現那一頁是空白的。
 *
 * 驗法很笨但夠用:走到每一處、按 F、把面板上的字抓下來,
 * 看它有沒有出現該有的那幾個關鍵詞。文案改了這裡會紅 —— 那是刻意的,
 * 這幾個詞就是那一頁存在的理由。
 */

const PORT = process.env.PORT || 5178;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.bringToFront();
await page.waitForFunction(() => typeof window.__placePos === 'function', null, { timeout: 60000 });
await page.evaluate(() => window.__begin && window.__begin());
await page.waitForTimeout(1800);
await page.evaluate(() => { window.__setWeather('clear'); window.__setClock(10, 'summer'); });

const ok = (b, s) => console.log(b ? `  ✓ ${s}` : `  ✗ ${s}`);

/** 場所 id → 那一頁上非有不可的字。 */
const WANT = {
  market: ['米價', '糴', '糶'],
  dock: ['扛', '時辰'],
  field: ['時辰'],
  woods: ['時辰'],
  tavern: ['酒', '打聽'],
  home: ['歇'],
  'county-market': ['米價'],
  'county-inn': ['通鋪'],
  'county-yamen': ['衙'],
  'county-apothecary': ['藥'],
};

let bad = 0;
for (const [id, words] of Object.entries(WANT)) {
  const at = await page.evaluate((i) => window.__placePos(i), id);
  if (!at) { console.log(`  ✗ ${id} 找不到這個場所`); bad++; continue; }
  await page.evaluate(([x, z]) => window.__place(x, z), at);
  await page.waitForTimeout(900);
  const near = await page.evaluate(() => window.__nearPlace());
  if (near !== id) { console.log(`  ✗ ${id} 站過去了卻沒認出來(認到 ${near})`); bad++; continue; }
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(500);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, '');
  const miss = words.filter((w) => !text.includes(w));
  ok(miss.length === 0, `${id} ${miss.length ? `少了 ${miss.join('/')}` : `打得開(${text.length} 字)`}`);
  if (miss.length) bad++;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

// 藥草叢是動態註冊的,id 每局不同 —— 從 __herbs 拿一個
const herb = await page.evaluate(() => (window.__herbs().spots[0] || null));
if (herb) {
  await page.evaluate(([x, z]) => window.__place(x, z), herb.at);
  await page.waitForTimeout(900);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(500);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, '');
  ok(text.includes('藥'), `藥草叢打得開(${text.length} 字)`);
  if (!text.includes('藥')) bad++;
  await page.keyboard.press('Escape');
}

console.log(bad ? `!! ${bad} 處有問題` : '  十一處都打得開');
console.log(errors.length ? `!! ${errors.length} 個錯誤:\n${errors.slice(0, 4).join('\n')}` : '  無錯誤');
await browser.close();
