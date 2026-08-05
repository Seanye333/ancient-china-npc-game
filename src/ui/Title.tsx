import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ORIGINS, randomName, type Origin } from '../game/origin';
import { useHero } from '../game/hero';
import { useClock } from '../world/worldTime';
import { useJournal } from '../game/journal';
import { hasSave, loadGame, savedAt } from '../game/save';
import { startAudio } from '../game/audio';

/**
 * 開場。
 *
 * 刻意不做成一張美術大圖配一個「開始遊戲」:這個遊戲的第一個決定
 * 就該是<b>你是誰</b>,而不是按一顆按鈕。五個出身擺在一起看得見差別 ——
 * 錢、糧、有沒有片瓦、村裡人一開始怎麼看你。那四個數字就是這個遊戲的全部難處。
 *
 * 世界在背後已經跑起來了(這一頁只是蓋在上面),所以按下去不會有載入。
 */

export function Title({ onStart }: { onStart: () => void }) {
  const [pick, setPick] = useState<Origin>(ORIGINS[0]);
  const [name, setName] = useState(() => randomName(Math.random));
  const saved = useMemo(() => savedAt(), []);

  const begin = (o: Origin, who: string) => {
    // 瀏覽器不准沒有互動就出聲 —— 這一下點擊正好是使用者的第一個手勢
    startAudio();
    useHero.setState({
      name: who || randomName(Math.random),
      hometown: o.hometown,
      stats: { ...o.stats },
      gold: o.gold,
      grain: o.grain,
      renown: o.renown,
      lodging: o.lodging,
      rentPaidThrough: o.lodging === 'rented' ? 10 : 0,
      merit: 0, retinue: 0, followers: [], favors: {}, wounded: 0, toil: 0,
    });
    useJournal.getState().clear();
    useJournal.getState().note(0, `${who}到了河谷。${o.blurb.split('。')[0]}。`);
    useClock.setState({ auto: true });
    onStart();
  };

  const card = (o: Origin): CSSProperties => ({
    padding: '.7rem .9rem', cursor: 'pointer', textAlign: 'left',
    background: pick.id === o.id ? 'rgba(200,164,90,.14)' : 'rgba(255,255,255,.05)',
    border: `1px solid ${pick.id === o.id ? '#c8a45a' : 'rgba(255,255,255,.16)'}`,
    color: '#e6e2d8', fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column', gap: '.25rem',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'linear-gradient(180deg, rgba(9,10,13,.94), rgba(14,17,22,.97))',
      backdropFilter: 'blur(6px)',
      color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
      display: 'grid', placeItems: 'center', padding: '2rem 1rem', overflowY: 'auto',
    }}>
      <div style={{ width: 'min(760px, 100%)', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: '2.6rem', letterSpacing: '.3em', fontWeight: 500,
          }}>白身</h1>
          <p style={{ margin: '.5rem 0 0', opacity: .6, fontSize: '.92rem', lineHeight: 1.8 }}>
            漢末,某個縣的河谷。你不是諸侯,是一個沒有名分的人。<br />
            先替人跑腿掙口飯,攢下人情把村裡的人一個一個帶走,再帶著這幾個人去摸山賊的窩。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.76rem', letterSpacing: '.14em', opacity: .55 }}>姓名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 6))}
            style={{
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.2)',
              color: '#e6e2d8', padding: '.35rem .7rem', fontFamily: 'inherit',
              fontSize: '1rem', width: 130,
            }}
          />
          <button
            onClick={() => setName(randomName(Math.random))}
            style={{
              background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.2)',
              color: '#e6e2d8', padding: '.35rem .7rem', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '.82rem',
            }}
          >另取一個</button>
        </div>

        <div style={{
          display: 'grid', gap: '.5rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {ORIGINS.map((o) => (
            <button key={o.id} style={card(o)} onClick={() => setPick(o)}>
              <strong style={{ fontSize: '1.02rem', letterSpacing: '.06em' }}>{o.name}</strong>
              <span style={{ fontSize: '.8rem', opacity: .7, lineHeight: 1.65 }}>{o.blurb}</span>
              <span style={{
                fontSize: '.74rem', opacity: .62, marginTop: '.2rem',
                fontVariantNumeric: 'tabular-nums',
              }}>
                錢 {o.gold} · 糧 {o.grain} 石 · {LODGE[o.lodging]}
                <span style={{ color: o.renown < 0 ? '#d07862' : o.renown > 5 ? '#a8d4b4' : undefined }}>
                  {' · '}鄉望 {o.renown > 0 ? '+' : ''}{o.renown}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => begin(pick, name)}
            style={{
              padding: '.6rem 1.6rem', cursor: 'pointer',
              background: '#c8a45a', color: '#1a1206', border: 'none',
              fontFamily: 'inherit', fontSize: '1rem', letterSpacing: '.1em',
            }}
          >
            就這樣開始
          </button>
          {hasSave() && (
            <button
              onClick={() => {
                startAudio();
                if (loadGame()) { useClock.setState({ auto: true }); onStart(); }
              }}
              style={{
                padding: '.6rem 1.2rem', cursor: 'pointer',
                background: 'rgba(255,255,255,.07)', color: '#e6e2d8',
                border: '1px solid rgba(255,255,255,.22)',
                fontFamily: 'inherit', fontSize: '.92rem',
              }}
            >
              接著上次
              {saved && <span style={{ opacity: .5, fontSize: '.78rem' }}>
                {' · '}{new Date(saved).toLocaleDateString()}
              </span>}
            </button>
          )}
          <span style={{ fontSize: '.76rem', opacity: .45, marginLeft: 'auto' }}>
            WASD 走 · Shift 跑 · E 搭話 · F 場所 · 空白鍵 揮刀 · J 日誌
          </span>
        </div>
      </div>
    </div>
  );
}

const LODGE: Record<string, string> = {
  none: '無處落腳', shed: '柴房一角', rented: '賃了一間', owned: '有屋',
};
