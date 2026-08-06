import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useInteract, playerPos } from '../game/interact';
import { useBands, bandWord } from '../game/bands';
import { useQuest, wayWord, needFor } from '../game/quest';
import { startConvoy, endConvoy, cargoWorth } from '../game/convoy';
import { DOCKS } from '../world/sites';
import { groundAt } from '../world/field';
import { findPath } from '../world/nav';
import { COUNTY } from '../world/County';
import { lostSpot } from '../game/places';
import {
  makeVillagers, smallTalk, addressYou, mightWord, TRADE_LABEL, TEMPER_LABEL,
} from '../game/npcs';
import { useCalamity, CALAMITY_LABEL } from '../game/calamity';
import { anyPerson, isCountyFolk } from '../game/countyfolk';
import { beginSpar } from '../game/combat';
import { might } from '../game/npcs';
import { WEAPONS } from '../game/weapons';
import { countyPrice } from '../game/economy';
import { raidParties } from '../game/raids';
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
  errandFrom, reward, errandBlurb, ERRAND_LABEL, type Errand,
} from '../game/errands';
import { Portrait } from './Portrait';

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

  const npc = useMemo(
    () => (talkingTo ? anyPerson(talkingTo) ?? null : null),
    [talkingTo],
  );

  // 同一個人同一旬的活是固定的 —— 反覆搭話刷不出更好的差事。
  // 從前這裡是 `Math.floor(hour/24) + season.length` 拼出來的「旬」,
  // 而 hour 永遠小於 24,所以那個值只跟季節的英文字母數有關 ——
  // 換季才換活,一季之內怎麼等都是同一件。現在有真的曆法了
  const span = useClock((s) => partsFor(s.day).xunIndex);
  const day = useClock((s) => s.day);
  const errand = useMemo(() => {
    if (!npc) return null;
    const e = errandFrom(npc, village, span, hero.merit, bands);
    // 城裡人出手闊 —— 同一件活,城裡給一倍半。跑這一趟遠路才有人肯接
    if (e && isCountyFolk(npc.id)) e.pay = Math.round(e.pay * 1.5);
    return e;
  }, [npc, village, span, hero.merit, bands]);
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
  const cal = useCalamity.getState().active;
  const ctx = {
    hour, season, weather,
    // 城裡人講城裡的價 —— 門吏引村裡的米價,一開口就穿幫
    village: isCountyFolk(npc.id)
      ? { ...village, grainPrice: countyPrice(village) }
      : village,
    calamity: cal ? CALAMITY_LABEL[cal.kind] : null,
    raiding: raidParties.find((r) => r.phase !== 'back')?.name ?? null,
  };
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
    // 押貨:碼頭上真的擺著一輛車,而且它會拖慢你
    if (e.kind === 'escort') {
      const [dx, dz] = DOCKS[0];
      // 車自己認得路 —— 出發前就把整條算好
      const road = findPath(dx, dz, COUNTY.x, COUNTY.z) ?? [];
      startConvoy({ x: dx, y: groundAt(dx, dz), z: dz }, cargoWorth(e.pay), road);
    }
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
    } else if (e.kind === 'escort') {
      setLine(`貨在碼頭上裝好了,${wayWord(playerPos.x, playerPos.z, DOCKS[0][0], DOCKS[0][1])}。`
        + `往縣城走 —— 車比人慢,你得陪著它。`);
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
    endConvoy();
    quest.drop();
    setLine(`「這事你真辦成了。」 · 得錢 ${r.gold} · 功績 +${r.merit} · 人情 +${r.favor}`);
  };

  const men = hero.followers.length + hero.retinue;
  const short = errand ? errand.wantMen > men : false;
  /** 手上這件活是不是這個人託的 —— 覆命只能找託你的那個人。 */
  const mine = quest.taken?.errand.patronId === npc.id;

  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
      width: 'min(640px, calc(100vw - 3rem))',
      background: 'rgba(14,17,22,.88)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,.16)',
      color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
      padding: '1rem 1.2rem',
      display: 'flex', flexDirection: 'column', gap: '.75rem',
    }}>
      <Portrait id={npc.id} trade={npc.trade} age={npc.age + deltaOf(npc.id).aged} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.16rem', letterSpacing: '.04em' }}>{npc.name}</strong>
        <span style={{ fontSize: '.76rem', opacity: .6 }}>
          {TRADE_LABEL[npc.trade]} · {TEMPER_LABEL[npc.temper]} · {npc.age + deltaOf(npc.id).aged} 歲
          {' · '}{homeOf(npc.id)}人{homeBonus(hero.hometown, npc.id) >= 4 && (
            <span style={{ color: '#a8d4b4' }}> · 同鄉</span>
          )}
          {' · '}{kinWord(npc.id)}
          {!joined && <span style={{ opacity: .75 }}>{' · '}{mightWord(npc)}</span>}
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

      {/*
        接活之前攤開的東西。
        <b>這裡曾經有一條「勝算 72%」的槽</b>,那是抽象結算年代的儀表:
        它告訴你這次擲骰的期望值。四種活現在都要自己走出去辦了,
        那條槽也就跟著沒有意義 —— 剩下的是實話:要打誰、要幾趟、要走多遠。
      */}
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
          <div style={{ fontSize: '.78rem', opacity: .72, lineHeight: 1.7 }}>
            {target
              ? `${target.name} · ${bandWord(target)} · ${wayWord(playerPos.x, playerPos.z, target.x, target.z)}`
              : shown.kind === 'harvest' ? `要下 ${needFor(shown.kind, shown.tier)} 趟田`
                : shown.kind === 'guard' ? `要守 ${needFor(shown.kind, shown.tier)} 個夜`
                  : shown.kind === 'escort'
                    ? `碼頭裝車,往縣城 · ${wayWord(DOCKS[0][0], DOCKS[0][1], COUNTY.x, COUNTY.z)}`
                    : '得自己去找'}
            <br />這一趟得自己走一遭。沒有人替你擲骰子。
          </div>
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
            endConvoy();
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
        {!shown && errand && !quest.taken && (
          <button style={{ ...btn, borderColor: '#c8a45a', color: '#f0d9a0' }}
                  onClick={() => { setShown(errand); setLine(null); }}>
            有事要辦?
          </button>
        )}
        {!shown && errand && quest.taken && !mine && (
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
        {/* 切磋 —— 怕事的不肯;比武是直脾氣世界的社交 */}
        {!shown && !joined && npc.temper !== 'timid' && (
          <button style={btn} onClick={() => {
            beginSpar({
              me: { name: hero.name, war: hero.stats.war, weapon: WEAPONS[hero.weapon] },
              foe: { npcId: npc.id, name: npc.name, war: might(npc) },
              at: { x: playerPos.x, z: playerPos.z },
              ground: groundAt,
            });
            close();
          }}>
            切磋一場<span style={{ opacity: .55 }}> · 點到為止</span>
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
                    onClick={() => walkOut(shown)}>
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
