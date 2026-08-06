import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { fighters, alive, useBattle } from '../game/combat';
import { playerPos, warpPlayer } from '../game/interact';
import { useBands, bandWord } from '../game/bands';
import { surrenderChance, surrenderCount } from '../game/raids';
import { useClock } from '../world/worldTime';
import { note } from '../game/journal';
import { useQuest } from '../game/quest';
import { convoy, endConvoy, lossPenalty } from '../game/convoy';
import { endLife } from '../game/daily';
import { useFair, contenders, FAIR_PRIZE_GOLD, FAIR_PRIZE_RENOWN } from '../game/fair';
import { festivalOn } from '../game/calendar';
import { useHero } from '../game/hero';
import { useVillage } from '../game/village';
import { anyPerson } from '../game/countyfolk';
import { walkable } from '../world/field';
import { MARKET } from '../world/sites';

/**
 * 打架的時候畫面上該有的字 —— 少得不能再少。
 *
 * 沒有血條、沒有傷害數字。只有<b>兩邊還剩幾個人</b>,因為那是這場架真正的變數。
 * 你自己的傷勢用畫面壓暗來講,不用一條紅槽 —— 低頭看槽的人不會抬頭看敵人。
 */

const wrap: CSSProperties = {
  position: 'fixed', left: '50%', transform: 'translateX(-50%)',
  color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
  pointerEvents: 'none',
};

export function BattleHud() {
  const bandId = useBattle((s) => s.bandId);
  const sparring = useBattle((s) => s.sparring);
  const sparWith = useBattle((s) => s.sparWith);
  const nightRaid = useBattle((s) => s.nightRaid);
  const tally = useBattle((s) => s.tally);
  const clear = useBattle((s) => s.clear);
  const bands = useBands((s) => s.bands);
  const hero = useHero();
  const village = useVillage();

  // 高頻資料不進 store,所以這裡自己按 4Hz 去看一眼
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(h);
  }, []);
  void tick;

  const near = bands.find(
    (b) => !b.routed && Math.hypot(b.x - playerPos.x, b.z - playerPos.z) < 46,
  );

  /*
   * 帶傷出門又被打倒 —— 這一趟沒能回來。
   *
   * 第一次倒下是重傷擊昏(掉錢、養三旬);<b>傷還沒好又倒一次,就是死</b>。
   * 這一條讓 wounded 不再只是「幾旬不能動」的計時器,而是一句實話:
   * 你現在出門,是在賭命。
   *
   * 判定放在收場出現的<b>那一刻</b>,不放在按鈕裡:第一版放在「撐起身子」的
   * onClose —— 於是畫面先給你看「再睜眼時人已經在路邊」,點了按鈕才突然死。
   * 死不能是按鈕的副作用。
   */
  useEffect(() => {
    if (!tally || sparring) return;
    if (tally.playerDown && useHero.getState().wounded > 0) {
      endLife('slain', useClock.getState().day);
      clear();
    }
  }, [tally, sparring, clear]);

  if (tally && sparring) {
    const foe = sparWith ? anyPerson(sparWith) : null;
    // 這一場是不是擂台上的 —— 擂台的勝負要接回比武的輪次
    const onStage = !!useFair.getState && festivalOn(useClock.getState().day) !== null
      && !useFair.getState().out
      && contenders(hero.followers).some((c) => c.id === sparWith);
    return (
      <SparAftermath
        won={tally.won}
        name={foe?.name ?? '那位'}
        stage={onStage ? useFair.getState().round : null}
        onClose={() => {
          if (tally.won) {
            if (onStage) {
              useFair.getState().advance();
              const fair = useFair.getState();
              if (fair.champion) {
                hero.addGold(FAIR_PRIZE_GOLD);
                useHero.setState((s) => ({ renown: s.renown + FAIR_PRIZE_RENOWN }));
                note(useClock.getState().day,
                  `三場全勝!彩頭 ${FAIR_PRIZE_GOLD} 錢捧回了家 —— 這個名字,半個縣都聽見了。`,
                  'good');
              } else {
                // 台上贏一場,比私下切磋值錢 —— 全村看著
                useHero.setState((s) => ({ renown: s.renown + 4 }));
              }
            } else {
              useHero.setState((s) => ({ renown: s.renown + 3 }));
            }
            if (sparWith) hero.addFavor(sparWith, 1);
          } else {
            if (onStage) useFair.getState().fall();
            useHero.setState((s) => ({ toil: Math.min(12, s.toil + 2) }));
          }
          clear();
        }}
      />
    );
  }

  if (tally) {
    const band = bands.find((b) => b.id === bandId);
    // 有人託你辦這件事嗎?這一句決定了這場架算「功勞」還是「私鬥」
    const commissioned = !!bandId && useQuest.getState().taken?.bandId === bandId;
    return (
      <Aftermath
        onClose={() => {
          if (tally.won && band) {
            // 戰利品是你自己搶下來的,誰託的都一樣 —— 這是你的手掙的
            hero.addGold(Math.round(tally.foesDown * 7 + band.fierce * band.count * 5));
            // 但功績不是。<b>沒人託你,打贏了也只是私鬥</b>:
            // 白身要的不是戰績,是有人記得這件事是你辦的 —— 大頭留到覆命才發
            hero.addMerit(commissioned
              ? Math.round(band.count * 0.6)
              : Math.round(band.count * 1.2 + band.fierce * 3));
            // 剿了匪治安就該好轉 —— 你做的事要在世界上留下痕跡
            village.nudge({ order: village.order + 7 + Math.round(band.fierce * 6) });
          }
          if (tally.playerDown) {
            // 傷在哪是抽的,但抽完就是<b>你的傷</b>:瘸著走一個月,
            // 或砍不動刀一個月,或臉上留一道好不了的疤
            const kind = (['leg', 'leg', 'arm', 'arm', 'face'] as const)[
              Math.floor(Math.random() * 5)];
            hero.hurt(3, kind);
            note(useClock.getState().day, kind === 'leg'
              ? '腿上挨了狠的 —— 這一個月,走不快了。'
              : kind === 'arm'
                ? '持刀的胳膊傷了筋 —— 這一個月,砍下去是輕的。'
                : '臉上開了口子。就算長好,這道疤也跟定你了。', 'bad');
            hero.addGold(-Math.round(hero.gold * 0.25));
          }
          // 倒下的人不會再跟著你走 —— 這一步就是招募那條線的代價
          for (const id of tally.fell) hero.dismiss(id);
          // 打輸了那夥人還在原地站著。不把你挪回路邊,收兵的視窗一關,
          // 下一幀就又撞上去 —— 一路輸到死,而那不是玩家的選擇
          /*
           * 押著貨打輸了,貨就沒了。
           *
           * 這是押貨這件差事唯一真正的風險 —— 少了它,「陪一輛車走半天」
           * 就只是走得慢一點而已。
           */
          const car = convoy.car;
          if (!tally.won && car && car.state === 'moving') {
            car.state = 'lost';
            const p = lossPenalty(car.worth, hero.gold);
            hero.addGold(-p.paid);
            useHero.setState((s) => ({ renown: s.renown + p.renown }));
            note(useClock.getState().day, `貨叫人搶了。${p.line}`, 'bad');
            endConvoy();
            useQuest.getState().drop();
          }
          if (!tally.won && band) warpPlayer(...retreatFrom(band.x, band.z));
          clear();
        }}
        won={tally.won}
        playerDown={tally.playerDown}
        foesDown={tally.foesDown}
        foesFled={tally.foesFled}
        fell={tally.fell}
        scattered={tally.scattered}
        commissioned={commissioned}
        bandName={band?.name ?? '那夥人'}
      />
    );
  }

  if (bandId) {
    const ours = fighters.filter((f) => f.side === 'you' && alive(f)).length;
    const foes = fighters.filter((f) => f.side === 'foe' && alive(f)).length;
    const me = fighters.find((f) => f.isPlayer);
    const hurt = me ? me.hp / me.maxHp : 1;
    return (
      <>
        {/* 傷重就壓暗四周 —— 比一條紅槽誠實,也逼你抬頭 */}
        {hurt < 0.5 && (
          <div style={{
            position: 'fixed', inset: 0, pointerEvents: 'none',
            boxShadow: `inset 0 0 ${180 * (1 - hurt)}px ${60 * (1 - hurt)}px rgba(120,12,12,${0.55 * (1 - hurt)})`,
          }} />
        )}
        <div style={{ ...wrap, top: 26, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', gap: '1.4rem', alignItems: 'baseline',
            background: 'rgba(14,17,22,.72)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,.14)', padding: '.4rem 1.1rem',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span><span style={{ opacity: .55, fontSize: '.76rem' }}>我方 </span>
              <strong style={{ fontSize: '1.1rem' }}>{ours}</strong></span>
            <span style={{ opacity: .4 }}>—</span>
            <span><span style={{ opacity: .55, fontSize: '.76rem' }}>賊 </span>
              <strong style={{ fontSize: '1.1rem', color: '#d08a72' }}>{foes}</strong></span>
          </div>
          <div style={{ marginTop: '.35rem', fontSize: '.78rem', opacity: .62 }}>
            {nightRaid ? '他們剛從夢裡爬起來 —— 趁現在'
              : useHero.getState().weapon === 'bow'
                ? '空白鍵 放箭 · 射的是你朝著的方向 —— 別讓他們貼上來'
                : '空白鍵 揮刀 · 打的是你面前那一片'}
          </div>
        </div>
      </>
    );
  }

  if (near) {
    const d = Math.round(Math.hypot(near.x - playerPos.x, near.z - playerPos.z));
    const hr = useClock.getState().hour;
    const night = hr < 5.6 || hr > 19.2;
    return (
      <div style={{ ...wrap, top: 26, textAlign: 'center' }}>
        <div style={{
          background: 'rgba(14,17,22,.66)', border: '1px solid rgba(190,110,80,.4)',
          padding: '.34rem 1rem', fontSize: '.84rem',
        }}>
          <strong style={{ letterSpacing: '.06em' }}>{near.name}</strong>
          <span style={{ opacity: .6 }}> · {bandWord(near)} · {d} 步</span>
          {night && <span style={{ color: '#a8d4b4' }}> · 夜深了 —— 摸得夠近,他們還在睡</span>}
        </div>
      </div>
    );
  }

  return null;
}

/** 切磋的收場 —— 沒有戰利品欄,只有一句話和一個台階。 */
function SparAftermath(p: {
  won: boolean; name: string; stage: number | null; onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'rgba(8,9,12,.5)', backdropFilter: 'blur(2px)',
      color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
      zIndex: 30,
    }}>
      <div style={{
        width: 'min(420px, calc(100vw - 3rem))',
        background: 'rgba(14,17,22,.94)', border: '1px solid rgba(255,255,255,.16)',
        padding: '1.3rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '.8rem',
      }}>
        <strong style={{ fontSize: '1.2rem', letterSpacing: '.08em' }}>
          {p.stage !== null
            ? (p.won ? `擂台第${['一', '二', '三'][p.stage]}場 · 勝` : '被打下台了')
            : (p.won ? '點到為止' : '技不如人')}
        </strong>
        <p style={{ margin: 0, fontSize: '.92rem', lineHeight: 1.8, opacity: .88 }}>
          {p.stage !== null
            ? (p.won
              ? `${p.name}拱了拱手退下去。台下鬨起來 —— ${p.stage >= 2 ? '彩頭是你的了!' : '下一場的人已經在脫外衣。'}`
              : `台下「嗐」了一聲。${p.name}把你扶到台邊:「明年再來。」`)
            : p.won
              ? `${p.name}坐在地上喘了半天,忽然笑了:「好手段。」圍著看的人都記住了這一場。`
              : `${p.name}收了棍,伸手把你拉起來:「承讓。再練練。」腰背疼了半日。`}
        </p>
        <button
          onClick={p.onClose}
          style={{
            padding: '.5rem 1rem', cursor: 'pointer',
            background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
            border: '1px solid rgba(255,255,255,.24)',
            fontFamily: 'inherit', fontSize: '.9rem',
          }}
        >
          {p.won ? '扶他起來' : '拍拍土站起來'}
        </button>
      </div>
    </div>
  );
}

/**
 * 敗走之後醒過來的地方 —— 從賊窩往集市那頭退三十幾步,退到路上為止。
 * 一格一格往回試,是因為<b>直接算一個點會把人扔進河裡或塞進山壁</b>。
 */
function retreatFrom(bx: number, bz: number): [number, number] {
  const dx = MARKET[0] - bx;
  const dz = MARKET[1] - bz;
  const len = Math.hypot(dx, dz) || 1;
  for (const back of [34, 40, 46, 52, 60]) {
    const t = Math.min(back, len) / len;
    const x = bx + dx * t;
    const z = bz + dz * t;
    if (walkable(x, z)) return [x, z];
  }
  return [MARKET[0], MARKET[1]];
}

/**
 * 收場。
 *
 * 這一頁的重點<b>不是戰利品,是誰沒回來</b>:名字要一個一個列出來。
 * 「折了 2 人」是一個數字,「王安沒能回來」是一件事。
 */
function Aftermath(p: {
  won: boolean; playerDown: boolean; foesDown: number; foesFled: number;
  fell: string[]; scattered: string[]; bandName: string; commissioned: boolean;
  onClose: () => void;
}) {
  const [taken, setTaken] = useState<string | null>(null);
  const nameOf = (id: string) => anyPerson(id)?.name ?? '同行';

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'rgba(8,9,12,.62)', backdropFilter: 'blur(3px)',
      color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
      zIndex: 30,
    }}>
      <div style={{
        width: 'min(460px, calc(100vw - 3rem))',
        background: 'rgba(14,17,22,.94)', border: '1px solid rgba(255,255,255,.16)',
        padding: '1.4rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '.9rem',
      }}>
        <strong style={{ fontSize: '1.24rem', letterSpacing: '.08em' }}>
          {p.playerDown ? '你倒在了' + p.bandName
            : p.won ? p.bandName + '散了' : '沒能打下來'}
        </strong>

        <p style={{ margin: 0, fontSize: '.92rem', lineHeight: 1.8, opacity: .88 }}>
          {p.playerDown
            ? '再睜眼時人已經在路邊。身上的錢不見了,骨頭疼得厲害 —— 這一趟走得太急了。'
            : p.won
              ? `打倒 ${p.foesDown} 人${p.foesFled ? `,另有 ${p.foesFled} 個丟下刀跑了` : ''}。
                 這片林子安靜下來了。`
              : '人手不夠,只能退。那夥人還在。'}
        </p>

        {/* 打贏了卻沒人託你 —— 這句話是在教這個遊戲怎麼玩,
            不是在扣你的東西:功勞要有人記,才叫功勞 */}
        {p.won && !p.playerDown && !p.commissioned && (
          <p style={{ margin: 0, fontSize: '.82rem', opacity: .6, lineHeight: 1.7 }}>
            沒人託你辦這件事。錢是你自己搶下來的,可這一場,沒人會替你記上。
          </p>
        )}
        {p.won && p.commissioned && (
          <p style={{ margin: 0, fontSize: '.84rem', color: '#a8d4b4', lineHeight: 1.7 }}>
            回去覆命罷 —— 有人等著這個消息。
          </p>
        )}

        {p.scattered.length > 0 && (
          <p style={{ margin: 0, fontSize: '.86rem', opacity: .7 }}>
            {p.scattered.map((id) => nameOf(id)).join('、')}
            {p.scattered.length > 1 ? ' 幾個' : ''}中途散了 —— 人還在,只是那陣勢沒撐住。
          </p>
        )}

        {p.fell.length > 0 && (
          <div style={{
            border: '1px solid rgba(190,110,80,.35)', padding: '.6rem .8rem',
            display: 'flex', flexDirection: 'column', gap: '.3rem',
          }}>
            <span style={{ fontSize: '.76rem', opacity: .6, letterSpacing: '.08em' }}>沒能跟你回來</span>
            {p.fell.map((id) => (
              <span key={id} style={{ fontSize: '.95rem', color: '#d8a898' }}>{nameOf(id)}</span>
            ))}
          </div>
        )}

        {/* 招安 —— 把丟下刀跑的收成自己的人。收下來的要吃飯,所以這是決定不是獎勵 */}
        {p.won && p.foesFled > 0 && !taken && (
          <button
            onClick={() => {
              const hero = useHero.getState();
              const ok = Math.random() < surrenderChance({
                foesDown: p.foesDown, foesFled: p.foesFled,
                charisma: hero.stats.charisma, merit: hero.merit,
              });
              if (!ok) { setTaken('none'); return; }
              const n = surrenderCount(p.foesFled, Math.random);
              const got = hero.addRetinue(n);
              setTaken(got.taken > 0 ? `${got.taken}` : 'full');
              if (got.taken > 0) {
                note(useClock.getState().day,
                  `收了 ${got.taken} 個降人 —— 他們也要吃飯。`, 'good');
              }
            }}
            style={{
              padding: '.5rem 1rem', cursor: 'pointer', textAlign: 'left',
              background: 'rgba(255,255,255,.06)', color: '#e6e2d8',
              border: '1px solid rgba(200,164,90,.5)',
              fontFamily: 'inherit', fontSize: '.88rem',
            }}
          >
            招安 —— 喊住那幾個跑的
            <span style={{ opacity: .55, fontSize: '.78rem' }}> · 收下來的人要吃你的糧</span>
          </button>
        )}
        {taken && (
          <p style={{ margin: 0, fontSize: '.85rem', lineHeight: 1.7,
                      color: taken === 'none' || taken === 'full' ? '#d8a898' : '#a8d4b4' }}>
            {taken === 'none' ? '那幾個頭也不回地跑進林子裡去了。'
              : taken === 'full' ? '有人肯留下,可是你養不起了。'
                : `${taken} 個放下刀,跟你回去。`}
          </p>
        )}

        <button
          onClick={p.onClose}
          style={{
            marginTop: '.2rem', padding: '.5rem 1rem', cursor: 'pointer',
            background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
            border: '1px solid rgba(255,255,255,.24)',
            fontFamily: 'inherit', fontSize: '.9rem',
          }}
        >
          {p.playerDown ? '撐起身子' : '收兵'}
        </button>
      </div>
    </div>
  );
}
