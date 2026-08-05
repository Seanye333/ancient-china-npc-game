import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useInteract, playerPos } from '../game/interact';
import { useBands, bandWord } from '../game/bands';
import { useQuest, wayWord, needFor } from '../game/quest';
import { lostSpot } from '../game/places';
import { makeVillagers, smallTalk, addressYou, TRADE_LABEL, TEMPER_LABEL } from '../game/npcs';
import { kinWord } from '../game/kin';
import { deltaOf, isSick, spreadRumor } from '../game/folk';
import { homeOf, homeBonus, moodOf, isGrieving } from '../game/company';
import { useClock } from '../world/worldTime';
import { partsFor } from '../game/calendar';
import { lifeTally } from '../game/daily';
import { useHero } from '../game/hero';
import { useVillage } from '../game/village';
import { askToJoin, joinThreshold } from '../game/recruiting';
import { retinueCap, rankForMerit } from '../game/hero';
import {
  errandFrom, odds, resolve, reward, errandBlurb, ERRAND_LABEL, type Errand,
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
  const bands = useBands((s) => s.bands);
  const quest = useQuest();
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState<Errand | null>(null);

  const villagers = useMemo(() => makeVillagers(38), []);
  const npc = useMemo(
    () => villagers.find((v) => v.id === talkingTo) ?? null,
    [villagers, talkingTo],
  );

  // 同一個人同一旬的活是固定的 —— 反覆搭話刷不出更好的差事。
  // 從前這裡是 `Math.floor(hour/24) + season.length` 拼出來的「旬」,
  // 而 hour 永遠小於 24,所以那個值只跟季節的英文字母數有關 ——
  // 換季才換活,一季之內怎麼等都是同一件。現在有真的曆法了
  const span = useClock((s) => partsFor(s.day).xunIndex);
  const day = useClock((s) => s.day);
  const errand = useMemo(
    () => (npc ? errandFrom(npc, village, span, hero.merit, bands) : null),
    [npc, village, span, hero.merit, bands],
  );
  // 差事指的那一夥 —— 有它,「西邊林子裡那夥人」才是地圖上一個真的地方
  const target = errand?.bandId ? bands.find((b) => b.id === errand.bandId) ?? null : null;

  useEffect(() => { setLine(null); setShown(null); }, [talkingTo]);

  // 診斷:全村有幾個人現在有活給你 —— 找不到活時得知道是判定太嚴還是腳本繞不開人
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__errands = () => {
      const v = useVillage.getState();
      const m = useHero.getState().merit;
      // 賊窩要一起傳進去 —— 少了它,剿匪的活會整批消失,而畫面上什麼都看不出來
      const bs = useBands.getState().bands;
      const list = makeVillagers(38)
        .map((n) => ({ n, e: errandFrom(n, v, span, m, bs) }))
        .filter((x) => x.e);
      return { total: 38, withWork: list.length,
               ids: list.map((x) => x.n.id),
               bandits: list.filter((x) => x.e!.kind === 'bandits')
                 .map((x) => `${x.n.id}:${x.n.name}→${x.e!.bandId}`),
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

  /**
   * 接一件要自己走出去辦的活。
   *
   * 這裡<b>什麼都不結算</b> —— 按下「我去」只是把一句話變成一個地方。
   * 成敗留給你的腿和你的刀,不留給 Math.random。
   */
  const walkOut = (e: Errand) => {
    if (!npc) return;
    // 尋人:那個人真的在世界上某個地方,不是一個判定
    const lost = e.kind === 'search' ? lostSpot(e.id) : null;
    quest.accept({
      errand: e, patronName: npc.name, bandId: target?.id ?? null, cleared: false,
      done: 0, need: needFor(e.kind, e.tier),
      ...(lost ? { lostAt: { x: lost.x, z: lost.z }, lostId: lost.whoId } : {}),
    });
    setShown(null);
    if (target) {
      setLine(`${target.name}就在${wayWord(playerPos.x, playerPos.z, target.x, target.z)}。`
        + `${e.wantMen > men ? '你這點人手⋯⋯多喊幾個一道去罷。' : '早去早回。'}`);
    } else if (lost) {
      setLine(`聽人說最後是在${wayWord(playerPos.x, playerPos.z, lost.x, lost.z)}那邊見著的。`);
    } else if (e.kind === 'harvest') {
      setLine('那就有勞了。田頭見 —— 多下幾趟,趕在雨前收完。');
    } else {
      setLine('這幾夜就偏勞你了。天黑以後別走遠。');
    }
  };

  /** 覆命。事情已經在世界上辦完了,這裡只發該發的。 */
  const reportBack = () => {
    if (!npc || !quest.taken) return;
    const r = reward(quest.taken.errand, hero.merit);
    hero.addGold(r.gold);
    hero.addMerit(r.merit);
    hero.addFavor(npc.id, r.favor);
    if (r.order) village.nudge({ order: village.order + r.order });
    lifeTally.errandsDone++;
    quest.drop();
    setLine(`「這事你真辦成了。」 · 得錢 ${r.gold} · 功績 +${r.merit} · 人情 +${r.favor}`);
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
  /** 手上這件活是不是這個人託的 —— 覆命只能找託你的那個人。 */
  const mine = quest.taken?.errand.patronId === npc.id;

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
          {TRADE_LABEL[npc.trade]} · {TEMPER_LABEL[npc.temper]} · {npc.age + deltaOf(npc.id).aged} 歲
          {' · '}{homeOf(npc.id)}人{homeBonus(hero.hometown, npc.id) >= 4 && (
            <span style={{ color: '#a8d4b4' }}> · 同鄉</span>
          )}
          {' · '}{kinWord(npc.id)}
        </span>
        {isSick(npc.id) && (
          <span style={{ fontSize: '.74rem', padding: '.05rem .4rem',
                         border: '1px solid #b25a48', color: '#d8a898' }}>病中</span>
        )}
        {joined && (
          <span style={{ fontSize: '.74rem', padding: '.05rem .4rem',
                         border: '1px solid #7fb08a', color: '#a8d4b4' }}>
            隨行 · {moodOf({
              npc, favor, renown: hero.renown, hungryDays: 0,
              grieving: isGrieving(npc.id, day),
            }).word}
          </span>
        )}
        <span style={{ fontSize: '.76rem', marginLeft: 'auto',
                       color: favor > 0 ? '#7fb08a' : favor < 0 ? '#d07862' : 'rgba(230,226,216,.45)' }}>
          人情 {favor > 0 ? '+' : ''}{favor}
          {!joined && <span style={{ opacity: .6 }}> / {joinThreshold(npc)} 可招</span>}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '.95rem', lineHeight: 1.75, minHeight: '1.75em' }}>
        {line ?? (shown ? errandBlurb(shown, target, playerPos) : opening)}
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
          {/*
            要自己走出去辦的活<b>不給勝算</b>。
            那條槽是抽象結算的儀表:它在告訴你「這次擲骰的期望值」。
            剿匪已經不擲骰了,再擺一條就是騙人 —— 你的勝算是你帶了幾個人、
            走過去的時候他們還剩幾個、以及你的手。
          */}
          {shown.kind !== 'escort' ? (
            <div style={{ fontSize: '.78rem', opacity: .72, lineHeight: 1.7 }}>
              {target
                ? `${target.name} · ${bandWord(target)} · ${wayWord(playerPos.x, playerPos.z, target.x, target.z)}`
                : shown.kind === 'harvest' ? `要下 ${needFor(shown.kind, shown.tier)} 趟田`
                  : shown.kind === 'guard' ? `要守 ${needFor(shown.kind, shown.tier)} 個夜`
                    : '得自己去找'}
              <br />這一趟得自己走一遭。沒有人替你擲骰子。
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
              <span style={{ fontSize: '.78rem', opacity: .7 }}>勝算 {pct}%</span>
              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.14)' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: pct >= 70 ? '#6b9e63' : pct >= 45 ? '#c8a45a' : '#b25a48',
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {/* 覆命擺在最前面 —— 走了一趟回來,第一句話不該是「再說兩句」 */}
        {!shown && mine && quest.taken!.cleared && (
          <button style={{ ...btn, borderColor: '#7fb08a', color: '#a8d4b4' }}
                  onClick={reportBack}>
            {quest.taken!.lostId ? '把人帶回來了' : '回來覆命'}
          </button>
        )}
        {!shown && mine && !quest.taken!.cleared && (
          <button style={{ ...btn, opacity: .85 }} onClick={() => {
            hero.addFavor(npc.id, -2);
            quest.drop();
            setLine(npc.temper === 'gruff' ? '「⋯⋯罷了。我另尋人便是。」'
              : '「不打緊,是我強人所難了。」（他嘴上這麼說）');
          }}>
            這事我辦不了
          </button>
        )}
        {!shown && (
          <button style={btn} onClick={() => setLine(smallTalk(npc, ctx))}>再說兩句</button>
        )}
        {!shown && errand && !(errand.kind !== 'escort' && quest.taken) && (
          <button style={{ ...btn, borderColor: '#c8a45a', color: '#f0d9a0' }}
                  onClick={() => { setShown(errand); setLine(null); }}>
            有事要辦?
          </button>
        )}
        {!shown && errand && errand.kind !== 'escort' && quest.taken && !mine && (
          <span style={{ ...btn, cursor: 'default', opacity: .5, borderStyle: 'dashed' }}>
            手上還有{quest.taken.patronName}託的事
          </span>
        )}
        {!shown && (
          <button style={btn} onClick={() => {
            hero.addFavor(npc.id, 1);
            // 幫人是掙鄉里口碑最實在的路 —— 官府一個字不會寫,可是全村都知道
            useHero.setState((s) => ({ renown: s.renown + 1 }));
            spreadRumor({
              text: `他替${npc.name}搭了把手。`, delta: 0.6, life: 3, aboutId: npc.id,
            });
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
                renown: hero.renown,
                homeBonus: homeBonus(hero.hometown, npc.id),
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
                    onClick={() => (shown.kind === 'escort' ? takeIt(shown) : walkOut(shown))}>
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
