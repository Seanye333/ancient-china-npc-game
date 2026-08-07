import type { CSSProperties } from 'react';
import { useEnding, ENDING_TITLE, epitaph, isFatal } from '../game/ending';
import { partsFor, numberWord } from '../game/calendar';
import { useHero } from '../game/hero';
import { panel, GOLD, RUST, GREEN } from './style';

/**
 * 生平。
 *
 * 收場那一頁的重點<b>不是分數,是名字</b>:跟過你的人、沒能跟你回來的人。
 * 「剿了三夥賊」是一個數字,「王安沒能回來」是一件事 ——
 * 這一頁要留在玩家心裡的是後者。
 */
export function Ending({ onRestart }: { onRestart: () => void }) {
  const life = useEnding((s) => s.life);
  const name = useHero((s) => s.name);
  if (!life) return null;

  const bad = isFatal(life.kind);
  const p = partsFor(life.days);

  const row: CSSProperties = {
    display: 'flex', justifyContent: 'space-between',
    fontSize: '.86rem', padding: '.24rem 0',
    borderBottom: '1px solid rgba(255,255,255,.07)',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'linear-gradient(180deg, rgba(8,9,12,.96), rgba(12,14,18,.99))',
      display: 'grid', placeItems: 'center', padding: '2rem 1rem', overflowY: 'auto',
      color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
    }}>
      <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div>
          <span style={{ fontSize: '.7rem', letterSpacing: '.3em', opacity: .5 }}>
            {name} · {ENDING_TITLE[life.kind]}
          </span>
          <h1 style={{
            margin: '.4rem 0 0', fontSize: '2.2rem', fontWeight: 500, letterSpacing: '.14em',
            color: bad ? RUST : GOLD,
          }}>
            {ENDING_TITLE[life.kind]}
          </h1>
        </div>

        <p style={{ margin: 0, fontSize: '.98rem', lineHeight: 2, opacity: .9 }}>
          {epitaph(life)}
        </p>

        <div>
          <div style={row}>
            <span style={{ opacity: .6 }}>在世</span>
            <span>{numberWord(p.year)}年 {numberWord(p.month)}月 · 共 {life.days} 天</span>
          </div>
          <div style={row}>
            <span style={{ opacity: .6 }}>功績 / 鄉望</span>
            <span>{life.merit} / {life.renown}</span>
          </div>
          <div style={row}>
            <span style={{ opacity: .6 }}>剿匪</span>
            <span>{life.bandsCleared} 夥 · 差事 {life.errandsDone} 件</span>
          </div>
          <div style={row}>
            <span style={{ opacity: .6 }}>身後</span>
            <span>{life.gold} 錢{life.lodging === 'owned' ? ' · 一間屋' : ''}</span>
          </div>
        </div>

        {/*
          義兄弟擺在最前面。一生裡跟過你的人可能有二十個,
          結過義的最多兩個 —— 那兩個名字不該埋在名單中間。
        */}
        {(life.sworn?.length || life.swornLost?.length) ? (
          <div style={{ ...panel, padding: '.8rem 1rem',
                        background: 'rgba(200,164,90,.07)', borderColor: 'rgba(200,164,90,.35)' }}>
            <div style={{ fontSize: '.68rem', letterSpacing: '.16em', opacity: .55,
                          marginBottom: '.4rem' }}>
              結過義的兄弟
            </div>
            {life.sworn?.length > 0 && (
              <div style={{ fontSize: '.94rem', lineHeight: 1.9, color: '#f0d9a0' }}>
                {life.sworn.join('、')}
              </div>
            )}
            {life.swornLost?.length > 0 && (
              <div style={{ fontSize: '.9rem', lineHeight: 1.9, color: '#d8a898' }}>
                {life.swornLost.join('、')} —— 沒能跟你回來。
              </div>
            )}
          </div>
        ) : null}

        {/* 這一段才是重點:名字,不是數字 */}
        {life.companions.length > 0 && (
          <div style={{ ...panel, padding: '.8rem 1rem', background: 'rgba(255,255,255,.04)' }}>
            <div style={{ fontSize: '.68rem', letterSpacing: '.16em', opacity: .5, marginBottom: '.4rem' }}>
              跟過你的人
            </div>
            <div style={{ fontSize: '.94rem', lineHeight: 1.9, color: GREEN }}>
              {life.companions.join('、')}
            </div>
          </div>
        )}

        {life.lost.length > 0 && (
          <div style={{
            border: `1px solid rgba(190,110,80,.4)`, padding: '.8rem 1rem',
          }}>
            <div style={{ fontSize: '.68rem', letterSpacing: '.16em', opacity: .5, marginBottom: '.4rem' }}>
              沒能跟你回來的
            </div>
            <div style={{ fontSize: '.94rem', lineHeight: 1.9, color: '#d8a898' }}>
              {life.lost.join('、')}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginTop: '.4rem' }}>
          <button
            onClick={onRestart}
            style={{
              padding: '.6rem 1.6rem', cursor: 'pointer',
              background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
              border: '1px solid rgba(255,255,255,.24)',
              fontFamily: 'inherit', fontSize: '.95rem', letterSpacing: '.1em',
            }}
          >
            再來一局
          </button>
          {/* 好下場不該由遊戲替你決定什麼時候夠了 */}
          {!bad && (
            <button
              onClick={() => useEnding.getState().decline(life.kind)}
              style={{
                padding: '.6rem 1.2rem', cursor: 'pointer',
                background: 'transparent', color: 'rgba(230,226,216,.7)',
                border: '1px solid rgba(255,255,255,.18)',
                fontFamily: 'inherit', fontSize: '.9rem',
              }}
            >
              再撐一年
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
