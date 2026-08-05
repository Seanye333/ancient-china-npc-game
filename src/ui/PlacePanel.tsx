import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useInteract } from '../game/interact';
import { placeById } from '../game/places';
import { useHero } from '../game/hero';
import { useVillage, type VillageState } from '../game/village';
import { useClock } from '../world/worldTime';
import { useJournal } from '../game/journal';
import {
  grainCost, grainSale, jobsToday, restQuality,
  RENT_PER_XUN, HOUSE_PRICE, LODGING_LABEL, DAYS_PER_SHI,
} from '../game/economy';
import { grainDays } from '../game/daily';
import { useQuest } from '../game/quest';
import { DAYS_PER_XUN, shichenWord } from '../game/calendar';
import {
  DRINK_PRICE, NEWS_PRICE, DRINK_TOIL, newsFrom, hirePrice, canHire, tavernMood,
} from '../game/tavern';
import { useBands } from '../game/bands';
import { raidParties } from '../game/raids';
import { livingVillagers, deltaOf } from '../game/folk';
import { playerPos } from '../game/interact';
import { retinueCap, rankForMerit } from '../game/hero';

/**
 * 場所面板 —— 錢第一次有地方去的那個介面。
 *
 * 三件事共用一個框:糴糶、做活、歇息。共用是有理由的 ——
 * 它們是同一種動作的三個面向:<b>拿時辰換錢,拿錢換糧,拿糧換命</b>。
 * 分成三個漂亮的介面反而看不出這件事。
 *
 * 每個按鈕都寫明「花幾個時辰」。這個遊戲真正稀缺的不是錢是時間,
 * 介面上不寫出來,玩家就永遠不會知道自己在賭什麼。
 */

const btn: CSSProperties = {
  padding: '.45rem .9rem', background: 'rgba(255,255,255,.08)', color: '#e6e2d8',
  border: '1px solid rgba(255,255,255,.2)', cursor: 'pointer',
  fontSize: '.86rem', fontFamily: 'inherit', textAlign: 'left',
};
const dim: CSSProperties = { ...btn, opacity: .42, cursor: 'not-allowed' };

export function PlacePanel() {
  const atPlace = useInteract((s) => s.atPlace);
  const closePlace = useInteract((s) => s.closePlace);
  const hero = useHero();
  const village = useVillage();
  const day = useClock((s) => s.day);
  const hour = useClock((s) => s.hour);
  const season = useClock((s) => s.season);
  const advance = useClock((s) => s.advance);
  const note = useJournal((s) => s.note);
  const quest = useQuest();
  const [line, setLine] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  // 換了地方就把上一句話丟掉 —— 否則在碼頭聽到的「今日的船都卸完了」
  // 會跟著你飄到市集的面板上
  useEffect(() => { setLine(null); }, [atPlace]);

  if (!atPlace) return null;
  const place = placeById(atPlace);
  if (!place) return null;

  const days = grainDays(hero.grain, hero.followers.length, hero.retinue);
  const heads = 1 + hero.followers.length + hero.retinue;

  const close = () => { setLine(null); closePlace(); };

  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
      width: 'min(620px, calc(100vw - 3rem))',
      background: 'rgba(14,17,22,.9)', backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,.16)', color: '#e6e2d8',
      fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
      padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '.75rem',
      zIndex: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.6rem' }}>
        <strong style={{ fontSize: '1.16rem', letterSpacing: '.06em' }}>{place.label}</strong>
        <span style={{ fontSize: '.76rem', opacity: .55 }}>{shichenWord(hour)}</span>
        <span style={{ fontSize: '.78rem', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          錢 {hero.gold} · 糧 {hero.grain.toFixed(1)} 石
          <span style={{ opacity: .55 }}>（{heads} 口,夠 {days} 天）</span>
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.75, minHeight: '1.75em', opacity: .9 }}>
        {line ?? blurbFor(place.kind, village, hero.lodging)}
      </p>

      {place.kind === 'market' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.82rem' }}>
            <span style={{ opacity: .7 }}>米價一石 {village.grainPrice} 錢</span>
            <span style={{ marginLeft: 'auto', opacity: .6 }}>一石夠一口人吃 {DAYS_PER_SHI} 天</span>
          </div>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', opacity: .7 }}>幾石</span>
            {[1, 3, 5, 10].map((n) => (
              <button key={n} style={{ ...btn, padding: '.3rem .7rem',
                borderColor: qty === n ? '#c8a45a' : 'rgba(255,255,255,.2)' }}
                onClick={() => setQty(n)}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button
              style={hero.gold >= grainCost(village, qty) ? btn : dim}
              onClick={() => {
                const cost = grainCost(village, qty);
                if (!hero.spend(cost)) { setLine('錢不夠。'); return; }
                hero.addGrain(qty);
                setLine(`糴了 ${qty} 石,去了 ${cost} 錢。`);
                note(day, `糴米 ${qty} 石 · ${cost} 錢`);
              }}
            >
              糴米 {qty} 石 · {grainCost(village, qty)} 錢
            </button>
            <button
              style={hero.grain >= qty ? btn : dim}
              onClick={() => {
                if (hero.grain < qty) { setLine('沒那麼多糧可賣。'); return; }
                const got = grainSale(village, qty);
                hero.addGrain(-qty);
                hero.addGold(got);
                setLine(`糶了 ${qty} 石,得 ${got} 錢。`);
                note(day, `糶米 ${qty} 石 · ${got} 錢`);
              }}
            >
              糶米 {qty} 石 · {grainSale(village, qty)} 錢
            </button>
          </div>
        </div>
      )}

      {place.kind === 'work' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {jobsToday(village, season, hour)
            .filter((j) => j.kind === place.job)
            .map((j) => (
              <button
                key={j.kind}
                style={j.closed || hero.toil >= 9 ? dim : btn}
                onClick={() => {
                  if (j.closed) { setLine(j.closed); return; }
                  if (hero.toil >= 9) { setLine('腰都直不起來了,今天做不動了。'); return; }
                  hero.addGold(j.pay);
                  hero.addToil(j.toil);
                  advance(j.hours);
                  // 手上接的是搶收,而你正在田裡 —— 這一趟就算進去。
                  // 差事不是另一套動作,是<b>你本來就在做的事恰好是他託你的事</b>
                  const t = quest.taken;
                  const counts = t && !t.cleared
                    && t.errand.kind === 'harvest' && j.kind === 'field';
                  if (counts) quest.advance();
                  setLine(`做了${j.hours}個時辰,得 ${j.pay} 錢。`
                    + (counts ? `（搶收 ${Math.min(t!.done + 1, t!.need)}/${t!.need}）` : ''));
                  note(day, `${j.label} · 得 ${j.pay} 錢`);
                }}
              >
                {j.label} · {j.hours} 時辰 · {j.pay} 錢
                {j.closed && <span style={{ opacity: .8 }}> —— {j.closed}</span>}
              </button>
            ))}
          <span style={{ fontSize: '.76rem', opacity: .55 }}>
            身子 {hero.toil >= 9 ? '乏透了' : hero.toil >= 5 ? '有些累' : '還撐得住'}
          </span>
        </div>
      )}

      {place.kind === 'tavern' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <button style={hero.gold >= DRINK_PRICE ? btn : dim} onClick={() => {
            if (!hero.spend(DRINK_PRICE)) { setLine('連一碗酒的錢都沒有。'); return; }
            hero.addToil(-DRINK_TOIL);
            advance(1);
            setLine('一碗濁酒下去,骨頭鬆了些。');
          }}>
            喝一碗 · {DRINK_PRICE} 錢<span style={{ opacity: .55 }}> · 解乏</span>
          </button>

          <button style={hero.gold >= NEWS_PRICE ? btn : dim} onClick={() => {
            if (!hero.spend(NEWS_PRICE)) { setLine('買不起這句話。'); return; }
            advance(0.5);
            // 打聽來的必須是真的 —— 假情報比沒情報更糟,玩家會學會不聽
            setLine(newsFrom({
              bands: useBands.getState().bands,
              raids: raidParties.map((r) => ({ name: r.name, x: r.x, z: r.z })),
              village,
              at: { x: playerPos.x, z: playerPos.z },
              sickNames: livingVillagers()
                .filter((n) => deltaOf(n.id).sick > 0).map((n) => n.name),
            }));
          }}>
            打聽 · {NEWS_PRICE} 錢<span style={{ opacity: .55 }}> · 這一帶出了什麼事</span>
          </button>

          {(() => {
            const men = hero.followers.length + hero.retinue;
            const cap = retinueCap(rankForMerit(hero.merit), hero.stats.leadership);
            const price = hirePrice(village, men);
            const gate = canHire(hero.merit);
            return (
              <button
                style={gate.ok && hero.gold >= price && men < cap ? btn : dim}
                onClick={() => {
                  if (!gate.ok) { setLine(gate.why); return; }
                  if (men >= cap) { setLine('你已經帶不動更多人了。'); return; }
                  if (!hero.spend(price)) { setLine('錢不夠。'); return; }
                  const got = hero.addRetinue(1);
                  advance(1);
                  setLine(got.taken
                    ? '一個漢子放下碗,跟你走了。他從今天起吃你的糧。'
                    : '沒人肯來。');
                  if (got.taken) note(day, `雇了一個鄉勇 · ${price} 錢`);
                }}
              >
                雇一個鄉勇 · {price} 錢
                <span style={{ opacity: .55 }}>
                  {gate.ok ? ` · 他要吃你的糧（${men}/${cap}）` : ' · 白身雇不動人'}
                </span>
              </button>
            );
          })()}
        </div>
      )}

      {place.kind === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <span style={{ fontSize: '.8rem', opacity: .7 }}>
            現在:{LODGING_LABEL[hero.lodging]}
            {hero.lodging === 'rented' && ` · 租到第 ${hero.rentPaidThrough} 天`}
          </span>
          <button style={btn} onClick={() => {
            const q = restQuality(hero.lodging);
            // 睡到隔天卯時 —— 不是「加八小時」,是「這一天過去了」
            const toDawn = ((24 - hour) + 6.2) % 24 || 24;
            advance(toDawn);
            useHero.setState({ toil: 0 });
            if (Math.random() < q.risk) {
              const lost = Math.min(hero.gold, 3 + Math.round(Math.random() * 12));
              hero.addGold(-lost);
              setLine(`睡得不踏實。醒來身上少了 ${lost} 錢。`);
              note(day, `露宿被摸走 ${lost} 錢`, 'bad');
            } else {
              setLine(hero.lodging === 'none'
                ? '就著草垛睡了一夜,骨頭發僵。'
                : '睡了一覺,天亮了。');
            }
          }}>
            歇一夜 · 到明日卯時
          </button>
          {hero.lodging !== 'owned' && (
            <button style={hero.gold >= RENT_PER_XUN ? btn : dim} onClick={() => {
              if (!hero.spend(RENT_PER_XUN)) { setLine('租錢不夠。'); return; }
              hero.setLodging('rented', day + DAYS_PER_XUN);
              setLine(`賃下一間,一旬 ${RENT_PER_XUN} 錢。到期會自己扣。`);
              note(day, '賃了一間屋', 'good');
            }}>
              賃屋 · 一旬 {RENT_PER_XUN} 錢
            </button>
          )}
          {hero.lodging !== 'owned' && (
            <button style={hero.gold >= HOUSE_PRICE ? btn : dim} onClick={() => {
              if (!hero.spend(HOUSE_PRICE)) { setLine('離買屋還差得遠。'); return; }
              hero.setLodging('owned');
              setLine('這間屋從今日起是你的了。');
              note(day, '置了屋 —— 你在這個縣有了根', 'good');
            }}>
              置屋 · {HOUSE_PRICE} 錢
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex' }}>
        <button style={{ ...btn, marginLeft: 'auto', opacity: .8 }} onClick={close}>
          走開（Esc）
        </button>
      </div>
    </div>
  );
}

function blurbFor(kind: string, village: VillageState, lodging: string): string {
  if (kind === 'tavern') return tavernMood(village, livingVillagers());
  if (kind === 'market') {
    return village.grainPrice > 45 ? '糧行前頭圍了一圈人,米價牌上的數字又改了。'
      : '糧行的夥計正在翻曬新米。';
  }
  if (kind === 'work') return '把式們蹲在邊上等活。有人抬眼看了看你。';
  return lodging === 'none'
    ? '你還沒有落腳的地方。柴垛底下也能對付一夜,只是不好睡。'
    : '這裡是你歇腳的地方。';
}
