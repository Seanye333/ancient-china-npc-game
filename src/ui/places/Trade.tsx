/**
 * 糴糶、做活、賽會 —— <b>錢的三個來去</b>。
 *
 * 這幾塊本來全擠在 PlacePanel 那一個七百行的元件裡。
 * 拆的判準是<b>它們彼此不相干</b>:改市集的米價和探病的湯藥沒有一點關係,
 * 可它們從前共用同一個捲軸 —— 找一段要靠搜尋字串。
 *
 * 共用的那一份東西(主角、村況、時辰、寫日誌、關面板)整包用 PlaceCtx 傳,
 * 各自解構自己要的:這樣<b>區塊裡的每一行都原封不動</b>,
 * 拆檔就不會順手改壞什麼。
 */

import type {} from 'react';
import {} from '../../game/interact';
import {} from '../../game/places';
import { useHero } from '../../game/hero';
import {} from '../../world/worldTime';
import {} from '../../game/journal';
import {
  grainCost, grainSale, jobsToday, 
  DAYS_PER_SHI,
} from '../../game/economy';
import {} from '../../game/daily';
import {} from '../../game/marauders';
import { WEAPONS, type WeaponId } from '../../game/weapons';
import { useFair, contenders } from '../../game/fair';
import { beginSpar } from '../../game/combat';
import { might, mightWord } from '../../game/npcs';
import { playerPos as heroPos } from '../../game/interact';
import { groundAt } from '../../world/field';
import {} from '../../game/quest';
import {} from '../../game/errands';
import {} from '../../game/bands';
import {} from '../../game/bands';
import {} from '../../game/raids';
import {} from '../../game/vendetta';
import {} from '../../game/interact';
import { useCalamity, reliefRenown, reliefOrder } from '../../game/calamity';
import { btn, dim, type PlaceCtx } from './ctx';

export function MarketPanel(p: PlaceCtx) {
  const { hero, village, market, day, note, setLine, qty, setQty, inCounty } = p;
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.82rem' }}>
            <span style={{ opacity: .7 }}>米價一石 {market.grainPrice} 錢</span>
            <span style={{ marginLeft: 'auto', opacity: .6 }}>一石夠一口人吃 {DAYS_PER_SHI} 天</span>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', opacity: .7 }}>幾石</span>
            {[1, 3, 5, 10].map((n) => (
              <button key={n} style={{ ...btn, padding: '.3rem .7rem',
                borderColor: qty === n ? '#c8a45a' : 'rgba(255,255,255,.2)' }}
                onClick={() => setQty(n)}>{n}</button>
            ))}
          </div>
          {/* 鐵器只有縣城有 —— 村裡的市集打不出一口刀 */}
          {(Object.values(WEAPONS) as Array<typeof WEAPONS[WeaponId]>)
            .filter((w) => w.price > 0 && (inCounty || !w.countyOnly) && w.id !== hero.weapon)
            .map((w) => (
              <button key={w.id} style={hero.gold >= w.price ? btn : dim} onClick={() => {
                if (!hero.spend(w.price)) { setLine('錢不夠。'); return; }
                useHero.setState({ weapon: w.id });
                setLine(`${w.name}到手。舊的那件,就留在攤上了。`);
                note(day, `買了${w.name} · ${w.price} 錢`);
              }}>
                買{w.name} · {w.price} 錢
                <span style={{ opacity: .55 }}> · {w.word}</span>
              </button>
            ))}

          {/*
            賑濟 —— 散糧換不到一個銅錢,換到的是全村都知道你在最難的時候
            拿出了東西。對一個要靠人過日子的白身來說,那比糧值錢。
          */}
          <button
            style={hero.grain >= qty ? { ...btn, borderColor: '#7fb08a' } : dim}
            onClick={() => {
              if (hero.grain < qty) { setLine('你自己都不夠吃。'); return; }
              const cal = useCalamity.getState().active;
              const fame = reliefRenown(qty, !!cal);
              hero.addGrain(-qty);
              useHero.setState((s) => ({ renown: s.renown + fame }));
              village.nudge({ order: village.order + reliefOrder(qty) });
              setLine(cal
                ? `${qty} 石糧散了出去。有人跪下磕頭,你沒攔住。`
                : `${qty} 石糧散給了幾戶揭不開鍋的。`);
              note(day, `賑濟 ${qty} 石 · 鄉望 +${fame}`, 'good');
            }}
          >
            賑濟 {qty} 石
            <span style={{ opacity: .55 }}>
              {' · '}鄉望 +{reliefRenown(qty, !!useCalamity.getState().active)}
              {useCalamity.getState().active ? '（災年,人記得住）' : ''}
            </span>
          </button>

          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button
              style={hero.gold >= grainCost(market, qty) ? btn : dim}
              onClick={() => {
                const cost = grainCost(market, qty);
                if (!hero.spend(cost)) { setLine('錢不夠。'); return; }
                hero.addGrain(qty);
                setLine(`糴了 ${qty} 石,去了 ${cost} 錢。`);
                note(day, `糴米 ${qty} 石 · ${cost} 錢`);
              }}
            >
              糴米 {qty} 石 · {grainCost(market, qty)} 錢
            </button>
            <button
              style={hero.grain >= qty ? btn : dim}
              onClick={() => {
                if (hero.grain < qty) { setLine('沒那麼多糧可賣。'); return; }
                const got = grainSale(market, qty, inCounty);
                hero.addGrain(-qty);
                hero.addGold(got);
                setLine(`糶了 ${qty} 石,得 ${got} 錢。`);
                note(day, `糶米 ${qty} 石 · ${got} 錢`);
              }}
            >
              糶米 {qty} 石 · {grainSale(market, qty, inCounty)} 錢
              {inCounty && <span style={{ opacity: .55 }}> · 城裡搶著收</span>}
            </button>
          </div>
        </div>
      );
}

export function WorkPanel(p: PlaceCtx) {
  const { hero, village, day, hour, season, advance, note, quest, setLine, place } = p;
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {jobsToday(village, season, hour)
            .filter((j) => j.kind === place.job)
            .map((j) => (
              <button
                key={j.kind}
                style={j.closed || hero.toil >= 9 ? dim : btn}
                onClick={() => {
                  if (j.closed) { setLine(j.closed); return; }
                  if (hero.toil >= 9) { setLine('腰都直不起來了,今天做不動了。'); return; }
                  hero.addGold(j.pay);
                  hero.addToil(j.toil);
                  advance(j.hours);
                  // 手上接的是搶收,而你正在田裡 —— 這一趟就算進去。
                  // 差事不是另一套動作,是<b>你本來就在做的事恰好是他託你的事</b>
                  const t = quest.taken;
                  const counts = t && !t.cleared
                    && t.errand.kind === 'harvest' && j.kind === 'field';
                  if (counts) quest.advance();
                  setLine(`做了${j.hours}個時辰,得 ${j.pay} 錢。`
                    + (counts ? `（搶收 ${Math.min(t!.done + 1, t!.need)}/${t!.need}）` : ''));
                  note(day, `${j.label} · 得 ${j.pay} 錢`);
                }}
              >
                {j.label} · {j.hours} 時辰 · {j.pay} 錢
                {j.closed && <span style={{ opacity: .8 }}> —— {j.closed}</span>}
              </button>
            ))}
          <span style={{ fontSize: '.76rem', opacity: .55 }}>
            身子 {hero.toil >= 9 ? '乏透了' : hero.toil >= 5 ? '有些累' : '還撐得住'}
          </span>
        </div>
      );
}

export function FairPanel(p: PlaceCtx) {
  const { hero, closePlace } = p;
  return (() => {
        const fair = useFair.getState();
        const list = contenders(hero.followers);
        if (fair.champion) {
          return (
            <p style={{ margin: 0, fontSize: '.88rem', lineHeight: 1.8, color: '#a8d4b4' }}>
              彩頭已經是你的了。台下還有人在學你最後那一下。
            </p>
          );
        }
        if (fair.out) {
          return (
            <p style={{ margin: 0, fontSize: '.86rem', lineHeight: 1.8, opacity: .75 }}>
              今年就到這裡 —— 台是別人的了。看了兩場,學了一手。
            </p>
          );
        }
        const foe = list[fair.round];
        if (!foe) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <span style={{ fontSize: '.8rem', opacity: .7 }}>
              第{['一', '二', '三'][fair.round]}場 · 台上是{foe.name} —— {mightWord(foe)}。
              三場全勝,彩頭八十錢。
            </span>
            <button style={btn} onClick={() => {
              beginSpar({
                me: { name: hero.name, war: hero.stats.war, weapon: WEAPONS[hero.weapon] },
                foe: { npcId: foe.id, name: foe.name, war: might(foe) },
                at: { x: heroPos.x, z: heroPos.z },
                ground: groundAt,
              });
              closePlace();
            }}>
              上擂台<span style={{ opacity: .55 }}> · 點到為止,當著全村的面</span>
            </button>
          </div>
        );
      })();
}
