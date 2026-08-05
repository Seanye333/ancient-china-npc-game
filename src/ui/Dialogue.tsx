import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useInteract } from '../game/interact';
import { makeVillagers, smallTalk, addressYou, TRADE_LABEL, TEMPER_LABEL } from '../game/npcs';
import { useClock } from '../world/worldTime';
import { useHero } from '../game/hero';
import { useVillage } from '../game/village';
import { askToJoin, joinThreshold } from '../game/recruiting';
import { retinueCap, rankForMerit } from '../game/hero';
import {
  errandFrom, odds, resolve, ERRAND_LABEL, ERRAND_BLURB, type Errand,
} from '../game/errands';

/**
 * 對話 — 這個世界跟你說話的地方,也是<b>活兒的唯一入口</b>。
 *
 * 差事從人嘴裡給你,不是從選單刷出來 —— 這件事本身就是設計:
 * 你得認識人、走到他面前、他得看得起你,才有活幹。
 * 一個從選單接任務的遊戲,那些 NPC 就只是任務發放機。
 */
export function Dialogue() {
  const talkingTo = useInteract((s) => s.talkingTo);
  const close = useInteract((s) => s.close);
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const weather = useClock((s) => s.weather);
  const village = useVillage();
  const hero = useHero();
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState<Errand | null>(null);

  const villagers = useMemo(() => makeVillagers(38), []);
  const npc = useMemo(
    () => villagers.find((v) => v.id === talkingTo) ?? null,
    [villagers, talkingTo],
  );

  // 同一個人同一旬的活是固定的 —— 反覆搭話刷不出更好的差事
  const span = Math.floor(hour / 24) + season.length;   // 原型階段的「旬」
  const errand = useMemo(
    () => (npc ? errandFrom(npc, village, span, hero.merit) : null),
    [npc, village, span, hero.merit],
  );

  useEffect(() => { setLine(null); setShown(null); }, [talkingTo]);

  // 診斷:全村有幾個人現在有活給你 —— 找不到活時得知道是判定太嚴還是腳本繞不開人
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__errands = () => {
      const v = useVillage.getState();
      const m = useHero.getState().merit;
      const list = makeVillagers(38)
        .map((n) => ({ n, e: errandFrom(n, v, span, m) }))
        .filter((x) => x.e);
      return { total: 38, withWork: list.length,
               ids: list.map((x) => x.n.id),
               sample: list.slice(0, 4).map((x) => `${x.n.name}:${x.e!.kind}`) };
    };
  }, [span]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!npc) return null;

  const favor = hero.favors[npc.id] ?? 0;
  const joined = hero.followers.includes(npc.id);
  const ctx = { hour, season, weather, village };
  const opening = `${addressYou(npc)},${smallTalk(npc, ctx)}`;

  const btn: CSSProperties = {
    padding: '.42rem .9rem',
    background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
    border: '1px solid rgba(255,255,255,.2)',
    cursor: 'pointer', fontSize: '.86rem', fontFamily: 'inherit', textAlign: 'left',
  };

  const takeIt = (e: Errand) => {
    const r = resolve(e, hero.stats, hero.followers.length + hero.retinue, hero.merit, Math.random);
    hero.addGold(r.gold);
    hero.addMerit(r.merit);
    hero.addFavor(npc.id, r.favor);
    if (r.wounded) hero.hurt(r.wounded);
    if (r.losses) useHero.setState((s) => ({ retinue: Math.max(0, s.retinue - r.losses) }));
    // 剿了匪治安就會好 —— 你做的事要在世界上留下痕跡
    if (e.kind === 'bandits' && r.grade >= 2) {
      village.nudge({ order: village.order + 6 + e.tier * 2 });
    }
    const bits = [r.text];
    if (r.gold) bits.push(`得錢 ${r.gold}`);
    if (r.merit) bits.push(`功績 +${r.merit}`);
    if (r.losses) bits.push(`折了 ${r.losses} 人`);
    if (r.wounded) bits.push(`你掛了彩,${r.wounded} 旬不能動`);
    setLine(bits.join(' · '));
    setShown(null);
  };

  const men = hero.followers.length + hero.retinue;
  const p = errand ? odds(errand, hero.stats, men) : 0;
  const pct = Math.round(p * 100);
  const short = errand ? errand.wantMen > men : false;

  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
      width: 'min(640px, calc(100vw - 3rem))',
      background: 'rgba(14,17,22,.88)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,.16)',
      color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
      padding: '1rem 1.2rem',
      display: 'flex', flexDirection: 'column', gap: '.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.16rem', letterSpacing: '.04em' }}>{npc.name}</strong>
        <span style={{ fontSize: '.76rem', opacity: .6 }}>
          {TRADE_LABEL[npc.trade]} · {TEMPER_LABEL[npc.temper]} · {npc.age} 歲
        </span>
        {joined && (
          <span style={{ fontSize: '.74rem', padding: '.05rem .4rem',
                         border: '1px solid #7fb08a', color: '#a8d4b4' }}>隨行</span>
        )}
        <span style={{ fontSize: '.76rem', marginLeft: 'auto',
                       color: favor > 0 ? '#7fb08a' : favor < 0 ? '#d07862' : 'rgba(230,226,216,.45)' }}>
          人情 {favor > 0 ? '+' : ''}{favor}
          {!joined && <span style={{ opacity: .6 }}> / {joinThreshold(npc)} 可招</span>}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '.95rem', lineHeight: 1.75, minHeight: '1.75em' }}>
        {line ?? (shown ? ERRAND_BLURB[shown.kind] : opening)}
      </p>

      {/* 攤開賭注 —— 藏起來的風險不叫風險 */}
      {shown && (
        <div style={{
          border: '1px solid rgba(255,255,255,.16)', padding: '.6rem .8rem',
          display: 'flex', flexDirection: 'column', gap: '.45rem',
        }}>
          <div style={{ display: 'flex', gap: '.9rem', flexWrap: 'wrap',
                        fontSize: '.8rem', fontVariantNumeric: 'tabular-nums' }}>
            <strong style={{ fontSize: '.92rem' }}>{ERRAND_LABEL[shown.kind]}</strong>
            <span style={{ opacity: .7 }}>難度 {'▮'.repeat(shown.tier)}</span>
            <span style={{ color: short ? '#d07862' : 'rgba(230,226,216,.7)' }}>
              需人 {shown.wantMen || '—'}（你有 {men}）{short && ' 人手不足'}
            </span>
            <span style={{ marginLeft: 'auto' }}>酬 {shown.pay}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <span style={{ fontSize: '.78rem', opacity: .7 }}>勝算 {pct}%</span>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.14)' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: pct >= 70 ? '#6b9e63' : pct >= 45 ? '#c8a45a' : '#b25a48',
              }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {!shown && (
          <button style={btn} onClick={() => setLine(smallTalk(npc, ctx))}>再說兩句</button>
        )}
        {!shown && errand && (
          <button style={{ ...btn, borderColor: '#c8a45a', color: '#f0d9a0' }}
                  onClick={() => { setShown(errand); setLine(null); }}>
            有事要辦?
          </button>
        )}
        {!shown && (
          <button style={btn} onClick={() => {
            hero.addFavor(npc.id, 1);
            setLine(npc.temper === 'gruff' ? '不必客氣。有事說一聲便是。'
              : '有心了。日後有事,盡管來尋我。');
          }}>
            幫他搭把手
          </button>
        )}
        {!shown && (
          <button
            style={{
              ...btn,
              borderColor: joined ? 'rgba(255,255,255,.2)' : '#7fb08a',
              color: joined ? 'rgba(230,226,216,.5)' : '#a8d4b4',
            }}
            onClick={() => {
              const res = askToJoin({
                npc, favor,
                merit: hero.merit,
                charisma: hero.stats.charisma,
                headcount: men,
                cap: retinueCap(rankForMerit(hero.merit), hero.stats.leadership),
                alreadyWith: joined,
              });
              if (res.ok) hero.recruit(npc.id);
              setLine(res.ok ? res.line
                : `${res.line}${res.needMore > 0 ? `（還差些交情）` : ''}`);
            }}
          >
            {joined ? '已隨你左右' : '跟我走吧'}
          </button>
        )}
        {!shown && joined && (
          <button style={{ ...btn, opacity: .85 }} onClick={() => {
            hero.dismiss(npc.id);
            setLine(npc.temper === 'gruff' ? '⋯⋯行罷。要用得著我,再來喊一聲。'
              : '那我便回去了。保重。');
          }}>
            你先回去罷
          </button>
        )}
        {shown && (
          <>
            <button style={{ ...btn, borderColor: '#c8a45a', color: '#f0d9a0' }}
                    onClick={() => takeIt(shown)}>
              我去
            </button>
            <button style={btn} onClick={() => { setShown(null); setLine('改日再說罷。'); }}>
              容我想想
            </button>
          </>
        )}
        <button style={{ ...btn, marginLeft: 'auto', opacity: .8 }} onClick={close}>
          告辭（Esc）
        </button>
      </div>
    </div>
  );
}
