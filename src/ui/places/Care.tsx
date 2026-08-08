/**
 * 採藥、探病、藥鋪 —— 病與傷這條線上的三處。
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
import {} from '../../game/marauders';
import {} from '../../game/combat';
import {} from '../../world/field';
import {} from '../../game/quest';
import {} from '../../game/errands';
import {} from '../../game/bands';
import {} from '../../game/bands';
import {} from '../../game/raids';
import {} from '../../game/vendetta';
import { livingVillagers, deltaOf, useFolk } from '../../game/folk';
import {
  herbWord, pickYield, spotReady, useHerbs, canDress, dosedTurn,
  herbPrice, herbSale, DOSE_SELF, DOSE_SICK, PHYSICIAN_FEE,
} from '../../game/herbs';
import {} from '../../game/interact';
import { useCalamity } from '../../game/calamity';
import { btn, dim, type PlaceCtx } from './ctx';

export function HerbPanel(p: PlaceCtx) {
  const { hero, day, season, advance, note, setLine, place } = p;
  return (() => {
        const ready = spotReady(place.id, day);
        const wild = place.label.startsWith('深山');
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <span style={{ fontSize: '.8rem', opacity: .7 }}>
              {herbWord(season)}。{wild && '這麼遠的地方少有人來,長得比坡下密。'}
            </span>
            <button style={ready && hero.toil < 9 ? btn : dim} onClick={() => {
              if (!ready) { setLine('這一叢前些日子叫你採空了,還沒長回來。'); return; }
              if (hero.toil >= 9) { setLine('腰都直不起來了,蹲不下去。'); return; }
              const got = pickYield({
                season, intelligence: hero.stats.intelligence, wild, roll: Math.random,
              });
              useHerbs.getState().pick(place.id, day);
              hero.addToil(2);
              advance(1);
              if (got <= 0) {
                setLine(season === 'winter'
                  ? '扒開雪找了半天,枯稈子而已。'
                  : '翻了一遍,能用的沒幾根 —— 認得藥是門手藝。');
                note(day, '採藥 · 空手而回');
                return;
              }
              hero.addHerbs(got);
              setLine(`採了 ${got} 株,用布包好揣在懷裡。`);
              note(day, `採藥 ${got} 株`, 'good');
            }}>
              採藥 · 1 時辰
              <span style={{ opacity: .55 }}>
                {ready ? ` · 手上 ${hero.herbs} 株` : ' · 採空了,還沒長回來'}
              </span>
            </button>
          </div>
        );
      })();
}

export function SickbedPanel(p: PlaceCtx) {
  const { hero, day, advance, note, setLine, place } = p;
  return (() => {
        const id = place.id.replace(/^sick-/, '');
        const who = livingVillagers().find((p) => p.id === id);
        const d = deltaOf(id);
        if (!who || d.sick <= 0) {
          return <span style={{ fontSize: '.84rem', opacity: .7 }}>屋裡沒有聲響。</span>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <span style={{ fontSize: '.8rem', opacity: .75 }}>
              {who.name},{who.age} 歲,病了 {d.sick} 天。
              {d.dosed ? '你送的藥還在灶上熬著。'
                : who.age >= 58 ? '這個歲數,拖不起。' : '躺在草蓆上,認得出你。'}
            </span>
            <button
              style={hero.herbs >= DOSE_SICK && !d.dosed ? { ...btn, borderColor: '#7fb08a' } : dim}
              onClick={() => {
                if (d.dosed) { setLine('藥已經送過了。剩下的只能等。'); return; }
                if (hero.herbs < DOSE_SICK) {
                  setLine(`藥不夠 —— 一副要 ${DOSE_SICK} 株。`); return;
                }
                hero.addHerbs(-DOSE_SICK);
                useFolk.getState().patch(id, { dosed: true });
                useFolk.getState().bumpRegard(id, 8);
                useHero.setState((s) => ({ renown: s.renown + 2 }));
                advance(0.5);
                const turn = dosedTurn(hero.stats.intelligence, Math.random);
                if (turn) {
                  useFolk.getState().patch(id, { sick: 1 });
                  setLine(`藥灌下去半個時辰,${who.name}的燒退了些。他家裡人一直在道謝。`);
                } else {
                  setLine(`藥留下了,熬給他喝。剩下的看他自己 —— 和今晚。`);
                }
                note(day, `送藥給${who.name} · ${DOSE_SICK} 株`, 'good');
              }}>
              送一副藥 · {DOSE_SICK} 株
              <span style={{ opacity: .55 }}>
                {d.dosed ? ' · 已經送過了' : ` · 手上 ${hero.herbs} 株`}
              </span>
            </button>
            {/* 空手來也能坐一會兒 —— 沒有藥的時候,人還是可以到 */}
            <button style={btn} onClick={() => {
              advance(0.5);
              useFolk.getState().bumpRegard(id, 2);
              setLine(who.temper === 'gruff'
                ? `${who.name}擺擺手叫你別靠太近,說是過了病氣不好。`
                : `坐了半個時辰。${who.name}說了幾句話,又睡了。`);
            }}>
              坐一會兒<span style={{ opacity: .55 }}> · 半個時辰 · 空手也是心意</span>
            </button>
          </div>
        );
      })();
}

export function ApothecaryPanel(p: PlaceCtx) {
  const { hero, day, advance, note, setLine } = p;
  return (() => {
        const plague = useCalamity.getState().active?.kind === 'plague';
        const buy = herbPrice(plague);
        const sell = herbSale(plague);
        const gate = canDress(hero, day);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            <span style={{ fontSize: '.8rem', opacity: .7 }}>
              手上 {hero.herbs} 株 · 一株買 {buy} 錢、賣 {sell} 錢
              {plague && <span style={{ color: '#d07862' }}> · 疫年,藥價翻著跟頭往上走</span>}
            </span>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              {[2, 6].map((n) => (
                <button key={n} style={hero.gold >= buy * n ? btn : dim} onClick={() => {
                  if (!hero.spend(buy * n)) { setLine('錢不夠。'); return; }
                  hero.addHerbs(n);
                  setLine(`抓了 ${n} 株,${buy * n} 錢。夥計包得仔細。`);
                  note(day, `買藥 ${n} 株 · ${buy * n} 錢`);
                }}>
                  買 {n} 株 · {buy * n} 錢
                </button>
              ))}
              <button style={hero.herbs >= 2 ? btn : dim} onClick={() => {
                const n = Math.min(hero.herbs, 6);
                if (n < 2) { setLine('沒幾株,人家不收。'); return; }
                hero.addHerbs(-n);
                hero.addGold(sell * n);
                setLine(`賣了 ${n} 株,得 ${sell * n} 錢。`);
                note(day, `賣藥 ${n} 株 · ${sell * n} 錢`);
              }}>
                賣 {Math.min(hero.herbs, 6)} 株 · {sell * Math.min(hero.herbs, 6)} 錢
              </button>
            </div>
            <button style={hero.wounded > 0 && hero.gold >= PHYSICIAN_FEE ? btn : dim}
              onClick={() => {
                if (hero.wounded <= 0) { setLine('郎中翻了翻你的眼皮:「你沒病。」'); return; }
                if (!hero.spend(PHYSICIAN_FEE)) { setLine('診金給不起。'); return; }
                // 郎中把傷一次治利索 —— 也算敷過藥,所以破相不留疤
                useHero.setState({ wounded: 0, woundKind: null, dressedOn: null });
                advance(2);
                setLine('郎中拆了舊布,重新上藥裹好。「將養兩日,別再逞強。」');
                note(day, `請郎中 · ${PHYSICIAN_FEE} 錢 · 傷好利索了`, 'good');
              }}>
              請郎中看傷 · {PHYSICIAN_FEE} 錢
              <span style={{ opacity: .55 }}>
                {hero.wounded > 0 ? ' · 一次治利索,不留疤' : ' · 你身上沒傷'}
              </span>
            </button>
            <button style={gate.ok ? btn : dim} onClick={() => {
              if (!gate.ok) { setLine(gate.why); return; }
              hero.dress(day);
              setLine('借人家的桌子把藥搗了,自己裹上。');
              note(day, `敷藥 · ${DOSE_SELF} 株`);
            }}>
              自己敷一副 · {DOSE_SELF} 株
              <span style={{ opacity: .55 }}> · {gate.ok ? '傷好一倍快' : gate.why}</span>
            </button>
          </div>
        );
      })();
}
