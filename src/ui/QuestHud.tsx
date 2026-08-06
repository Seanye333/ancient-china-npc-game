import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuest, wayWord, needWord } from '../game/quest';
import { useBands, bandWord } from '../game/bands';
import { useHero } from '../game/hero';
import { playerPos, findPresence } from '../game/interact';
import { ERRAND_LABEL } from '../game/errands';

/**
 * 手上的活。
 *
 * 這一小塊是「接了活要自己走出去辦」唯一撐得住的東西:沒有它,
 * 玩家接完活就站在原地不知道往哪走 —— 這個世界沒有小地圖,也不該有。
 *
 * 所以給的是<b>路引,不是導航</b>:方位 + 大概幾步,像問路問來的。
 * 走近了它會跟著變,但它永遠不會替你畫一條線。
 */

const box: CSSProperties = {
  position: 'fixed', left: 16, top: 16, padding: '.7rem .95rem',
  background: 'rgba(14,17,22,.78)', backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,.14)',
  color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
  display: 'flex', flexDirection: 'column', gap: '.3rem',
  userSelect: 'none', minWidth: 168, maxWidth: 250,
};
const label: CSSProperties = { fontSize: '.62rem', letterSpacing: '.14em', opacity: .55 };

export function QuestHud() {
  const taken = useQuest((s) => s.taken);
  const bands = useBands((s) => s.bands);
  const men = useHero((s) => s.followers.length + s.retinue);

  // 玩家座標是高頻的模組級資料,不在 store 裡 —— 自己按 4Hz 去看一眼就夠了,
  // 每幀重繪一塊 HUD 是拿整棵 React 樹換一個沒人看得出來的更新
  const [, bump] = useState(0);
  useEffect(() => {
    const h = setInterval(() => bump((n) => n + 1), 250);
    return () => clearInterval(h);
  }, []);

  if (!taken) return null;

  const band = taken.bandId ? bands.find((b) => b.id === taken.bandId) ?? null : null;
  const short = taken.errand.wantMen > men;

  // 覆命的時候要找得到人 —— 村民整天在動,不能只說「回村裡」
  const patron = taken.cleared ? findPresence(taken.errand.patronId) : undefined;

  return (
    <div style={{ ...box, borderColor: taken.cleared ? 'rgba(127,176,138,.45)' : 'rgba(200,164,90,.45)' }}>
      <span style={label}>手上的活</span>
      <strong style={{ fontSize: '1.02rem', letterSpacing: '.04em' }}>
        {ERRAND_LABEL[taken.errand.kind]}
        {band && <span style={{ opacity: .78 }}> · {band.name}</span>}
      </strong>

      {taken.cleared ? (
        <>
          <span style={{ fontSize: '.84rem', color: '#a8d4b4' }}>已辦妥</span>
          <span style={{ fontSize: '.8rem', opacity: .72 }}>
            回去尋{taken.patronName}覆命
            {patron && ` · ${wayWord(playerPos.x, playerPos.z, patron.x, patron.z)}`}
          </span>
        </>
      ) : taken.lostAt && taken.done < taken.need ? (
        <>
          <span style={{ fontSize: '.84rem', fontVariantNumeric: 'tabular-nums' }}>
            {wayWord(playerPos.x, playerPos.z, taken.lostAt.x, taken.lostAt.z)}
          </span>
          <span style={{ fontSize: '.78rem', opacity: .66 }}>最後有人在那邊見著他</span>
        </>
      ) : taken.errand.kind !== 'bandits' ? (
        <span style={{ fontSize: '.84rem' }}>{needWord(taken)}</span>
      ) : band && !band.routed ? (
        <>
          <span style={{ fontSize: '.84rem', fontVariantNumeric: 'tabular-nums' }}>
            {wayWord(playerPos.x, playerPos.z, band.x, band.z)}
          </span>
          <span style={{ fontSize: '.78rem', opacity: .66 }}>{bandWord(band)}</span>
          <span style={{ fontSize: '.78rem', color: short ? '#d07862' : 'rgba(230,226,216,.55)' }}>
            需人 {taken.errand.wantMen}（你有 {men}）{short && ' · 人手不足'}
          </span>
        </>
      ) : (
        <span style={{ fontSize: '.8rem', opacity: .7 }}>
          回去尋{taken.patronName}說一聲
        </span>
      )}
    </div>
  );
}
