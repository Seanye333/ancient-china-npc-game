import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useInteract } from '../game/interact';
import { placeById } from '../game/places';
import { useHero } from '../game/hero';
import { useVillage, type VillageState } from '../game/village';
import { useClock } from '../world/worldTime';
import { useJournal } from '../game/journal';
import {
  grainCost, grainSale, jobsToday, restQuality,
  RENT_PER_XUN, HOUSE_PRICE, LODGING_LABEL, DAYS_PER_SHI,
} from '../game/economy';
import { grainDays } from '../game/daily';
import { DAYS_PER_XUN, shichenWord } from '../game/calendar';
import {
  DRINK_PRICE, NEWS_PRICE, DRINK_TOIL, newsFrom, hirePrice, canHire, tavernMood,
} from '../game/tavern';
import { countyPrice, INN_PRICE } from '../game/economy';
import { petition, PETITION_COST, bountyTarget, bountyPay, bountyMerit } from '../game/yamen';
import { useRefugees, takeWord } from '../game/refugees';
import { useMarauders } from '../game/marauders';
import { WEAPONS, type WeaponId } from '../game/weapons';
import { useFair, contenders } from '../game/fair';
import { beginSpar } from '../game/combat';
import { might, mightWord } from '../game/npcs';
import { playerPos as heroPos } from '../game/interact';
import { groundAt } from '../world/field';
import { useQuest } from '../game/quest';
import { menNeeded } from '../game/errands';
import { bandWord } from '../game/bands';
import { useBands } from '../game/bands';
import { raidParties } from '../game/raids';
import { hauntedBy } from '../game/vendetta';
import { livingVillagers, deltaOf } from '../game/folk';
import { playerPos } from '../game/interact';
import { retinueCap, rankForMerit } from '../game/hero';
import { useCalamity, reliefRenown, reliefOrder } from '../game/calamity';

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

const btn: CSSProperties = {
  padding: '.45rem .9rem', background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
  border: '1px solid rgba(255,255,255,.2)', cursor: 'pointer',
  fontSize: '.86rem', fontFamily: 'inherit', textAlign: 'left',
};
const dim: CSSProperties = { ...btn, opacity: .42, cursor: 'not-allowed' };

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

      {place.kind === 'market' && (
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
      )}

      {place.kind === 'work' && (
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
      )}

      {place.kind === 'tavern' && (
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
      )}

      {place.kind === 'inn' && (
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
      )}

      {place.kind === 'fair' && (() => {
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
      })()}

      {place.kind === 'refugees' && (() => {
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
      })()}

      {place.kind === 'yamen' && (
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
      )}

      {place.kind === 'home' && (
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
      )}

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
