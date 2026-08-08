import { useEffect, useState } from 'react';
import { btn, type PlaceCtx } from './places/ctx';
import { MarketPanel, WorkPanel, FairPanel } from './places/Trade';
import { HerbPanel, SickbedPanel, ApothecaryPanel } from './places/Care';
import { TavernPanel, InnPanel, HomePanel } from './places/Rest';
import { YamenPanel, RefugeesPanel } from './places/Civic';
import type {} from 'react';
import { useInteract } from '../game/interact';
import { placeById } from '../game/places';
import { useHero } from '../game/hero';
import { useVillage, type VillageState } from '../game/village';
import { useClock } from '../world/worldTime';
import { useJournal } from '../game/journal';
import { grainDays } from '../game/daily';
import { shichenWord } from '../game/calendar';
import {
  tavernMood,
} from '../game/tavern';
import { countyPrice } from '../game/economy';
import {} from '../game/marauders';
import {} from '../game/combat';
import {} from '../world/field';
import { useQuest } from '../game/quest';
import {} from '../game/errands';
import {} from '../game/bands';
import {} from '../game/bands';
import {} from '../game/raids';
import {} from '../game/vendetta';
import { livingVillagers } from '../game/folk';
import {} from '../game/interact';

/**
 * 場所面板 —— 錢第一次有地方去的那個介面。
 *
 * 三件事共用一個框:糴糶、做活、歇息。共用是有理由的 ——
 * 它們是同一種動作的三個面向:<b>拿時辰換錢,拿錢換糧,拿糧換命</b>。
 * 分成三個漂亮的介面反而看不出這件事。
 *
 * 每個按鈕都寫明「花幾個時辰」。這個遊戲真正稀缺的不是錢是時間,
 * 介面上不寫出來,玩家就永遠不會知道自己在賭什麼。
 */


export function PlacePanel() {
  const atPlace = useInteract((s) => s.atPlace);
  const closePlace = useInteract((s) => s.closePlace);
  const hero = useHero();
  const village = useVillage();
  const day = useClock((s) => s.day);
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const advance = useClock((s) => s.advance);
  const note = useJournal((s) => s.note);
  const quest = useQuest();
  const [line, setLine] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  // 換了地方就把上一句話丟掉 —— 否則在碼頭聽到的「今日的船都卸完了」
  // 會跟著你飄到市集的面板上
  useEffect(() => { setLine(null); }, [atPlace]);

  if (!atPlace) return null;
  const place = placeById(atPlace);
  if (!place) return null;

  const days = grainDays(hero.grain, hero.followers.length, hero.retinue);
  const heads = 1 + hero.followers.length + hero.retinue;
  /*
   * 同一塊面板,兩個市集,兩個價。
   *
   * 把縣城的價做成 village 的一個變體(而不是另一套資料),
   * 是為了讓它<b>跟著世界擺動</b>:商路一斷,城裡先慌,價差自己就拉開了。
   */
  const inCounty = place.id.startsWith('county');
  const market: VillageState = inCounty
    ? { ...village, grainPrice: countyPrice(village) }
    : village;

  const close = () => { setLine(null); closePlace(); };

  /*
   * 一包遞下去,而不是十一個子元件各自去呼叫 hook。
   *
   * 這樣拆出去的那些區塊<b>一行都不必改</b> —— 它們原本就是在這個閉包裡寫的,
   * 名字全對得上。拆檔最容易出事的地方就是「順手」動了幾個字。
   */
  const ctx: PlaceCtx = {
    hero, village, market, day, hour, season, advance, note, quest,
    line, setLine, qty, setQty, place, days, heads, inCounty, close, closePlace,
  };

  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
      width: 'min(620px, calc(100vw - 3rem))',
      background: 'rgba(14,17,22,.9)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,.16)', color: '#e6e2d8',
      fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
      padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '.75rem',
      zIndex: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem' }}>
        <strong style={{ fontSize: '1.16rem', letterSpacing: '.06em' }}>{place.label}</strong>
        <span style={{ fontSize: '.76rem', opacity: .55 }}>{shichenWord(hour)}</span>
        <span style={{ fontSize: '.78rem', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          錢 {hero.gold} · 糧 {hero.grain.toFixed(1)} 石
          <span style={{ opacity: .55 }}>（{heads} 口,夠 {days} 天）</span>
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.75, minHeight: '1.75em', opacity: .9 }}>
        {line ?? blurbFor(place.kind, market, hero.lodging, inCounty)}
      </p>

      {place.kind === 'market' && <MarketPanel {...ctx} />}

      {place.kind === 'work' && <WorkPanel {...ctx} />}

      {/*
        採藥 —— 一趟一個時辰,採空的那一叢要十二天才長得回來。
        數量寫在按鈕上是不可能的(採之前誰知道有多少),
        但<b>季節寫得出來</b>:冬天上山是白跑,那句話要在按之前就看得到。
      */}
      {place.kind === 'herb' && <HerbPanel {...ctx} />}

      {/*
        病家。這一塊是整個採藥系統存在的理由 ——
        「某某病倒了」從前只是日誌上的一行字,你連上門都上不了。
      */}
      {place.kind === 'sickbed' && <SickbedPanel {...ctx} />}

      {place.kind === 'apothecary' && <ApothecaryPanel {...ctx} />}

      {place.kind === 'tavern' && <TavernPanel {...ctx} />}

      {place.kind === 'inn' && <InnPanel {...ctx} />}

      {place.kind === 'fair' && <FairPanel {...ctx} />}

      {place.kind === 'refugees' && <RefugeesPanel {...ctx} />}

      {place.kind === 'yamen' && <YamenPanel {...ctx} />}

      {place.kind === 'home' && <HomePanel {...ctx} />}

      <div style={{ display: 'flex' }}>
        <button style={{ ...btn, marginLeft: 'auto', opacity: .8 }} onClick={close}>
          走開（Esc）
        </button>
      </div>
    </div>
  );
}

function blurbFor(
  kind: string, village: VillageState, lodging: string, inCounty = false,
): string {
  if (kind === 'herb') return '坡上這一片,葉子的樣子和旁邊的草不一樣。';
  if (kind === 'sickbed') return '門口的竿子上挑著一條白布。屋裡有人在咳。';
  if (kind === 'apothecary') {
    return '一牆的抽屜,銅秤擦得發亮。郎中頭也不抬:「看病,還是抓藥?」';
  }
  if (kind === 'inn') return '堂上幾張桌子,樓上是通鋪。掌櫃抬眼看了看你的行頭。';
  if (kind === 'yamen') return '衙門口的石獸叫日頭曬得發白。門吏靠在那裡,沒有要理你的意思。';
  if (kind === 'tavern') return tavernMood(village, livingVillagers());
  if (kind === 'market') {
    if (inCounty) {
      return village.grainPrice > 45
        ? '城裡的糧行前頭排著長隊,米價牌上的數字一天改三回。'
        : '城裡的市面比村裡熱鬧,價錢也硬。';
    }
    return village.grainPrice > 45 ? '糧行前頭圍了一圈人,米價牌上的數字又改了。'
      : '糧行的夥計正在翻曬新米。';
  }
  if (kind === 'work') return '把式們蹲在邊上等活。有人抬眼看了看你。';
  return lodging === 'none'
    ? '你還沒有落腳的地方。柴垛底下也能對付一夜,只是不好睡。'
    : '這裡是你歇腳的地方。';
}
