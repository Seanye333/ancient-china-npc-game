/**
 * 酒肆、客棧、住處 —— 歇腳與消息。
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
  restQuality,
  RENT_PER_XUN, HOUSE_PRICE, LODGING_LABEL, 
} from '../../game/economy';
import {} from '../../game/daily';
import { DAYS_PER_XUN } from '../../game/calendar';
import {
  DRINK_PRICE, NEWS_PRICE, DRINK_TOIL, newsFrom, hirePrice, canHire, 
} from '../../game/tavern';
import { INN_PRICE } from '../../game/economy';
import { useMarauders } from '../../game/marauders';
import {} from '../../game/combat';
import {} from '../../world/field';
import {} from '../../game/quest';
import {} from '../../game/errands';
import {} from '../../game/bands';
import { useBands } from '../../game/bands';
import { raidParties } from '../../game/raids';
import { hauntedBy } from '../../game/vendetta';
import { livingVillagers, deltaOf } from '../../game/folk';
import {
  canDress, 
  DOSE_SELF, 
} from '../../game/herbs';
import { playerPos } from '../../game/interact';
import { retinueCap, rankForMerit } from '../../game/hero';
import { btn, dim, type PlaceCtx } from './ctx';

export function TavernPanel(p: PlaceCtx) {
  const { hero, village, day, advance, note, setLine } = p;
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <button style={hero.gold >= DRINK_PRICE ? btn : dim} onClick={() => {
            if (!hero.spend(DRINK_PRICE)) { setLine('連一碗酒的錢都沒有。'); return; }
            hero.addToil(-DRINK_TOIL);
            advance(1);
            setLine('一碗濁酒下去,骨頭鬆了些。');
          }}>
            喝一碗 · {DRINK_PRICE} 錢<span style={{ opacity: .55 }}> · 解乏</span>
          </button>

          <button style={hero.gold >= NEWS_PRICE ? btn : dim} onClick={() => {
            if (!hero.spend(NEWS_PRICE)) { setLine('買不起這句話。'); return; }
            advance(0.5);
            // 打聽來的必須是真的 —— 假情報比沒情報更糟,玩家會學會不聽
            setLine(newsFrom({
              bands: useBands.getState().bands,
              raids: raidParties.map((r) => ({ name: r.name, x: r.x, z: r.z })),
              marauders: useMarauders.getState(),
              village,
              at: { x: playerPos.x, z: playerPos.z },
              sickNames: livingVillagers()
                .filter((n) => deltaOf(n.id).sick > 0).map((n) => n.name),
              hunted: hauntedBy(),
            }));
          }}>
            打聽 · {NEWS_PRICE} 錢<span style={{ opacity: .55 }}> · 這一帶出了什麼事</span>
          </button>

          {(() => {
            const men = hero.followers.length + hero.retinue;
            const cap = retinueCap(rankForMerit(hero.merit), hero.stats.leadership);
            const price = hirePrice(village, men);
            const gate = canHire(hero.merit);
            return (
              <button
                style={gate.ok && hero.gold >= price && men < cap ? btn : dim}
                onClick={() => {
                  if (!gate.ok) { setLine(gate.why); return; }
                  if (men >= cap) { setLine('你已經帶不動更多人了。'); return; }
                  if (!hero.spend(price)) { setLine('錢不夠。'); return; }
                  const got = hero.addRetinue(1);
                  advance(1);
                  setLine(got.taken
                    ? '一個漢子放下碗,跟你走了。他從今天起吃你的糧。'
                    : '沒人肯來。');
                  if (got.taken) note(day, `雇了一個鄉勇 · ${price} 錢`);
                }}
              >
                雇一個鄉勇 · {price} 錢
                <span style={{ opacity: .55 }}>
                  {gate.ok ? ` · 他要吃你的糧（${men}/${cap}）` : ' · 白身雇不動人'}
                </span>
              </button>
            );
          })()}
        </div>
      );
}

export function InnPanel(p: PlaceCtx) {
  const { hero, day, hour, advance, note, setLine } = p;
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {/*
            猜枚 —— 快、蠢、但真能翻本。
            勝率四成五:閒漢的手總比你的眼快一點,可他給雙倍 ——
            這桌賭局誠實地寫在按鈕上,坑不坑得起是你的事。
          */}
          {[5, 20].map((bet) => (
            <button key={bet} style={hero.gold >= bet ? btn : dim} onClick={() => {
              if (!hero.spend(bet)) { setLine('陸小乙撇撇嘴:「錢呢?」'); return; }
              advance(0.5);
              if (Math.random() < 0.45) {
                hero.addGold(bet * 2);
                setLine(`開手 —— 你贏了!陸小乙把 ${bet * 2} 錢推過來,臉都綠了。`);
              } else {
                setLine(bet >= 20
                  ? `開手 —— 輸了。${bet} 錢沒了,陸小乙笑得見牙不見眼。`
                  : '開手 —— 輸了。「再來再來,手氣這就回來了。」');
              }
            }}>
              跟陸小乙猜枚 · 押 {bet} 錢
              <span style={{ opacity: .55 }}> · 贏了翻倍,勝率四成五</span>
            </button>
          ))}
          <button style={hero.gold >= INN_PRICE ? btn : dim} onClick={() => {
            if (!hero.spend(INN_PRICE)) { setLine('住不起。'); return; }
            const toDawn = ((24 - hour) + 6.2) % 24 || 24;
            advance(toDawn);
            useHero.setState({ toil: 0 });
            setLine('通鋪上翻了一夜身,天亮了。');
            note(day, `客棧投宿 · ${INN_PRICE} 錢`);
          }}>
            投宿一宿 · {INN_PRICE} 錢
            <span style={{ opacity: .55 }}> · 出門在外,總比露宿強</span>
          </button>
        </div>
      );
}

export function HomePanel(p: PlaceCtx) {
  const { hero, day, hour, advance, note, setLine } = p;
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <span style={{ fontSize: '.8rem', opacity: .7 }}>
            現在:{LODGING_LABEL[hero.lodging]}
            {hero.lodging === 'rented' && ` · 租到第 ${hero.rentPaidThrough} 天`}
          </span>
          <button style={btn} onClick={() => {
            const q = restQuality(hero.lodging);
            // 睡到隔天卯時 —— 不是「加八小時」,是「這一天過去了」
            const toDawn = ((24 - hour) + 6.2) % 24 || 24;
            advance(toDawn);
            useHero.setState({ toil: 0 });
            if (Math.random() < q.risk) {
              const lost = Math.min(hero.gold, 3 + Math.round(Math.random() * 12));
              hero.addGold(-lost);
              setLine(`睡得不踏實。醒來身上少了 ${lost} 錢。`);
              note(day, `露宿被摸走 ${lost} 錢`, 'bad');
            } else {
              setLine(hero.lodging === 'none'
                ? '就著草垛睡了一夜,骨頭發僵。'
                : '睡了一覺,天亮了。');
            }
          }}>
            歇一夜 · 到明日卯時
          </button>
          {hero.wounded > 0 && (() => {
            const gate = canDress(hero, day);
            return (
              <button style={gate.ok ? btn : dim} onClick={() => {
                if (!gate.ok) { setLine(gate.why); return; }
                hero.dress(day);
                advance(0.5);
                setLine(useHero.getState().wounded > 0
                  ? '把藥搗爛敷上,拿布纏了兩道。松快些了。'
                  : '換了最後一道藥。傷是好利索了。');
                note(day, `敷藥 · ${DOSE_SELF} 株`);
              }}>
                敷藥 · {DOSE_SELF} 株
                <span style={{ opacity: .55 }}> · {gate.ok ? '傷好一倍快' : gate.why}</span>
              </button>
            );
          })()}
          {hero.lodging !== 'owned' && (
            <button style={hero.gold >= RENT_PER_XUN ? btn : dim} onClick={() => {
              if (!hero.spend(RENT_PER_XUN)) { setLine('租錢不夠。'); return; }
              hero.setLodging('rented', day + DAYS_PER_XUN);
              setLine(`賃下一間,一旬 ${RENT_PER_XUN} 錢。到期會自己扣。`);
              note(day, '賃了一間屋', 'good');
            }}>
              賃屋 · 一旬 {RENT_PER_XUN} 錢
            </button>
          )}
          {hero.lodging !== 'owned' && (
            <button style={hero.gold >= HOUSE_PRICE ? btn : dim} onClick={() => {
              if (!hero.spend(HOUSE_PRICE)) { setLine('離買屋還差得遠。'); return; }
              hero.setLodging('owned');
              setLine('這間屋從今日起是你的了。');
              note(day, '置了屋 —— 你在這個縣有了根', 'good');
            }}>
              置屋 · {HOUSE_PRICE} 錢
            </button>
          )}
        </div>
      );
}
