import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { fighters, alive, useBattle } from '../game/combat';
import { playerPos } from '../game/interact';
import { useBands, bandWord } from '../game/bands';
import { useHero } from '../game/hero';
import { useVillage } from '../game/village';
import { makeVillagers } from '../game/npcs';

/**
 * 打架的時候畫面上該有的字 —— 少得不能再少。
 *
 * 沒有血條、沒有傷害數字。只有<b>兩邊還剩幾個人</b>,因為那是這場架真正的變數。
 * 你自己的傷勢用畫面壓暗來講,不用一條紅槽 —— 低頭看槽的人不會抬頭看敵人。
 */

const wrap: CSSProperties = {
  position: 'fixed', left: '50%', transform: 'translateX(-50%)',
  color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
  pointerEvents: 'none',
};

export function BattleHud() {
  const bandId = useBattle((s) => s.bandId);
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

  if (tally) {
    const band = bands.find((b) => b.id === bandId);
    return (
      <Aftermath
        onClose={() => {
          if (tally.won && band) {
            hero.addGold(Math.round(tally.foesDown * 7 + band.fierce * band.count * 5));
            hero.addMerit(Math.round(band.count * 2 + band.fierce * 7));
            // 剿了匪治安就該好轉 —— 你做的事要在世界上留下痕跡
            village.nudge({ order: village.order + 7 + Math.round(band.fierce * 6) });
          }
          if (tally.playerDown) {
            hero.hurt(3);
            hero.addGold(-Math.round(hero.gold * 0.25));
          }
          // 倒下的人不會再跟著你走 —— 這一步就是招募那條線的代價
          for (const id of tally.fell) hero.dismiss(id);
          clear();
        }}
        won={tally.won}
        playerDown={tally.playerDown}
        foesDown={tally.foesDown}
        foesFled={tally.foesFled}
        fell={tally.fell}
        scattered={tally.scattered}
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
            空白鍵 揮刀 · 打的是你面前那一片
          </div>
        </div>
      </>
    );
  }

  if (near) {
    const d = Math.round(Math.hypot(near.x - playerPos.x, near.z - playerPos.z));
    return (
      <div style={{ ...wrap, top: 26, textAlign: 'center' }}>
        <div style={{
          background: 'rgba(14,17,22,.66)', border: '1px solid rgba(190,110,80,.4)',
          padding: '.34rem 1rem', fontSize: '.84rem',
        }}>
          <strong style={{ letterSpacing: '.06em' }}>{near.name}</strong>
          <span style={{ opacity: .6 }}> · {bandWord(near)} · {d} 步</span>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * 收場。
 *
 * 這一頁的重點<b>不是戰利品,是誰沒回來</b>:名字要一個一個列出來。
 * 「折了 2 人」是一個數字,「王安沒能回來」是一件事。
 */
function Aftermath(p: {
  won: boolean; playerDown: boolean; foesDown: number; foesFled: number;
  fell: string[]; scattered: string[]; bandName: string; onClose: () => void;
}) {
  const villagers = makeVillagers(38);
  const nameOf = (id: string) => villagers.find((v) => v.id === id)?.name ?? '同行';

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: 'rgba(8,9,12,.62)', backdropFilter: 'blur(3px)',
      color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
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
