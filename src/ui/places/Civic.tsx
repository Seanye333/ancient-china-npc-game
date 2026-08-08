/**
 * 衙門、流民 —— 你和「官」與「外面的人」打交道的兩處。
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
import {} from '../../game/daily';
import { petition, PETITION_COST, bountyTarget, bountyPay, bountyMerit } from '../../game/yamen';
import { useRefugees, takeWord } from '../../game/refugees';
import {} from '../../game/marauders';
import {} from '../../game/combat';
import {} from '../../world/field';
import {} from '../../game/quest';
import { menNeeded } from '../../game/errands';
import { bandWord } from '../../game/bands';
import { useBands } from '../../game/bands';
import {} from '../../game/raids';
import {} from '../../game/vendetta';
import {} from '../../game/interact';
import { useCalamity } from '../../game/calamity';
import { btn, dim, type PlaceCtx } from './ctx';

export function YamenPanel(p: PlaceCtx) {
  const { hero, village, day, note, quest, setLine } = p;
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {(() => {
            const q = quest.taken;
            // 領賞 —— 榜上那一夥已散,錢貨兩清
            if (q?.errand.patronId === 'yamen' && q.cleared) {
              return (
                <button style={{ ...btn, borderColor: '#7fb08a', color: '#a8d4b4' }}
                  onClick={() => {
                    const band = useBands.getState().bands.find((b) => b.id === q.errand.bandId);
                    const merit = band ? bountyMerit(band) : 10;
                    hero.addGold(q.errand.pay);
                    hero.addMerit(merit);
                    quest.drop();
                    setLine(`主簿數了錢,一枚一枚。「${q.errand.pay} 錢,點清。」 · 功績 +${merit}`);
                    note(day, `領了懸賞 · ${q.errand.pay} 錢`, 'good');
                  }}>
                  領賞 · {q.errand.pay} 錢
                </button>
              );
            }
            // 貼榜 —— 賊坐大到縣裡壓不住,官府才肯出錢
            const mark = bountyTarget(useBands.getState().bands, village.order);
            if (!mark || q) return null;
            const pay = bountyPay(mark);
            return (
              <button style={{ ...btn, borderColor: '#c8a45a', color: '#f0d9a0' }}
                onClick={() => {
                  quest.accept({
                    errand: {
                      id: `bounty-${mark.id}`, kind: 'bandits', patronId: 'yamen',
                      tier: 5, wantMen: menNeeded(mark), pay, bandId: mark.id,
                    },
                    patronName: '縣衙', bandId: mark.id, cleared: false,
                    done: 0, need: 1,
                  });
                  setLine(`榜文抄给了你。${mark.name} —— ${bandWord(mark)}。活要見人,寨要見平。`);
                  note(day, `接了縣衙的懸賞:${mark.name}`, 'good');
                }}>
                榜上懸賞:{mark.name} · {pay} 錢
                <span style={{ opacity: .55 }}> · {bandWord(mark)} · 需人 {menNeeded(mark)}</span>
              </button>
            );
          })()}
          <button style={hero.gold >= PETITION_COST ? btn : dim} onClick={() => {
            const r = petition({
              gold: hero.gold, merit: hero.merit, renown: hero.renown,
              politics: hero.stats.politics, roll: Math.random,
            });
            if (!r.ok) { setLine(r.line); return; }
            hero.spend(PETITION_COST);
            hero.addMerit(r.merit);
            if (r.merit) note(day, `縣衙投書 · 功績 +${r.merit}`, 'good');
            setLine(r.line);
          }}>
            投書自薦 · {PETITION_COST} 錢
            <span style={{ opacity: .55 }}> · 門吏要打點,成不成看你的名聲</span>
          </button>
        </div>
      );
}

export function RefugeesPanel(p: PlaceCtx) {
  const { hero, day, note, setLine } = p;
  return (() => {
        const band = useRefugees.getState().band;
        if (!band) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <span style={{ fontSize: '.8rem', opacity: .7 }}>
              {band.count} 個人,面有菜色。看見你過來,有人把孩子往身後攏了攏。
            </span>
            {/* 收留:最便宜的人手 —— 不要身價錢,但一樣吃糧領月錢 */}
            <button style={btn} onClick={() => {
              const got = hero.addRetinue(Math.min(band.count, 3));
              if (!got.taken) { setLine('你自己都養不起了。'); return; }
              useRefugees.getState().take(got.taken);
              useHero.setState((s) => ({ renown: s.renown + got.taken }));
              setLine(takeWord(got.taken));
              note(day, `收留了 ${got.taken} 個流民`, 'good');
            }}>
              收留幾個<span style={{ opacity: .55 }}> · 不要身價錢,吃糧領月錢</span>
            </button>
            <button style={hero.grain >= 1 && !band.fed ? btn : dim} onClick={() => {
              if (band.fed) { setLine('粥已經施過了。他們沒再伸手 —— 逃難的人也有臉面。'); return; }
              if (hero.grain < 1) { setLine('你自己的糧也見底了。'); return; }
              hero.addGrain(-1);
              useRefugees.getState().feed();
              const fame = useCalamity.getState().active ? 4 : 2;
              useHero.setState((s) => ({ renown: s.renown + fame }));
              setLine('一鍋粥見了底。有個老的朝你作了個長揖,沒說話。');
              note(day, `施粥一石 · 鄉望 +${fame}`, 'good');
            }}>
              施一石粥<span style={{ opacity: .55 }}> · 鄉望</span>
            </button>
            <button style={{ ...btn, opacity: .8 }} onClick={() => {
              useRefugees.getState().leave();
              useHero.setState((s) => ({ renown: s.renown - 2 }));
              setLine('他們沒爭辯,收拾起包袱往下游去了。有人回頭看了一眼。');
              note(day, '把流民趕走了', 'bad');
            }}>
              叫他們走<span style={{ opacity: .55 }}> · 村裡人會看在眼裡</span>
            </button>
          </div>
        );
      })();
}
