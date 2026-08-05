import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useJournal } from '../game/journal';
import { partsFor, numberWord } from '../game/calendar';

/**
 * 日誌 —— 你不在的時候世界做了什麼。
 *
 * 有了日子以後,很多事會在你走路的時候發生:糧見底、租到期、有人受不了走了。
 * 這些如果只改數字不留一句話,玩家會覺得遊戲在偷偷扣他的東西。
 * <b>世界可以對你不利,但不能瞞著你。</b>
 *
 * 收起來的時候只是一枚小牌子,上頭一顆紅點 —— 這種東西不該常駐在畫面上,
 * 但也不能藏到玩家找不著。
 */

const wrap: CSSProperties = {
  position: 'fixed', right: 16, top: 268,
  color: '#e6e2d8', fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.4rem',
  userSelect: 'none', zIndex: 12,
};

export function Journal() {
  const entries = useJournal((s) => s.entries);
  const unread = useJournal((s) => s.unread);
  const markRead = useJournal((s) => s.markRead);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyJ') setOpen((v) => !v);
      if (e.code === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) markRead(); }, [open, entries.length, markRead]);

  return (
    <div style={wrap}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative', padding: '.32rem .8rem', cursor: 'pointer',
          background: open ? '#c8a45a' : 'rgba(14,17,22,.78)',
          color: open ? '#1a1206' : '#e6e2d8',
          border: '1px solid rgba(255,255,255,.18)',
          fontFamily: 'inherit', fontSize: '.8rem', backdropFilter: 'blur(8px)',
        }}
      >
        日誌 · J
        {unread > 0 && !open && (
          <span style={{
            position: 'absolute', top: -5, right: -5, width: 9, height: 9,
            borderRadius: '50%', background: '#d07862',
          }} />
        )}
      </button>

      {open && (
        <div style={{
          width: 268, maxHeight: '46vh', overflowY: 'auto',
          background: 'rgba(14,17,22,.9)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,.16)', padding: '.7rem .85rem',
          display: 'flex', flexDirection: 'column', gap: '.42rem',
        }}>
          {entries.length === 0 && (
            <span style={{ fontSize: '.8rem', opacity: .5 }}>還沒有什麼可記的。</span>
          )}
          {entries.map((e, i) => {
            const p = partsFor(e.day);
            return (
              <div key={`${e.day}-${i}-${e.text}`} style={{ display: 'flex', gap: '.5rem' }}>
                <span style={{
                  fontSize: '.68rem', opacity: .45, whiteSpace: 'nowrap', paddingTop: '.15rem',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {numberWord(p.month)}月{p.dayOfMonth}
                </span>
                <span style={{
                  fontSize: '.82rem', lineHeight: 1.6,
                  color: e.tone === 'bad' ? '#d8a898' : e.tone === 'good' ? '#a8d4b4' : '#e6e2d8',
                }}>
                  {e.text}{e.count > 1 && <span style={{ opacity: .5 }}> ×{e.count}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
