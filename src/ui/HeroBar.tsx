import type { CSSProperties } from 'react';
import { useHero, rankForMerit, rankLabel, nextRankMerit, retinueCap } from '../game/hero';
import { useVillage, orderWord, harvestWord } from '../game/village';
import { useClock } from '../world/worldTime';
import { grainDays } from '../game/daily';
import { LODGING_LABEL } from '../game/economy';
import { dateWord, shichenWord } from '../game/calendar';
import { renownWord } from '../game/folk';
import { WEAPONS } from '../game/weapons';
import { useCalamity, CALAMITY_LABEL } from '../game/calamity';

/** 主角欄 — 你是誰、爬到哪、養得起幾個人。沒有這一條,玩家不知道自己在玩什麼。 */
export function HeroBar() {
  const merit = useHero((s) => s.merit);
  const gold = useHero((s) => s.gold);
  const retinue = useHero((s) => s.retinue);
  const followers = useHero((s) => s.followers);
  const lead = useHero((s) => s.stats.leadership);
  const wounded = useHero((s) => s.wounded);
  const grain = useHero((s) => s.grain);
  const renown = useHero((s) => s.renown);
  const lodging = useHero((s) => s.lodging);
  const weapon = useHero((s) => s.weapon);
  const day = useClock((s) => s.day);
  const hour = useClock((s) => s.hour);
  const village = useVillage();
  const calamity = useCalamity((s) => s.active);
  const days = grainDays(grain, followers.length, retinue);
  const rank = rankForMerit(merit);
  const label = rankLabel(rank);
  const next = nextRankMerit(rank);
  const cap = retinueCap(rank, lead);

  const cell: CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '.1rem', minWidth: '3.4rem',
  };
  const k: CSSProperties = {
    fontSize: '.62rem', letterSpacing: '.14em', opacity: 0.55,
  };
  const v: CSSProperties = { fontSize: '.98rem', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, padding: '.8rem 1.1rem',
      background: 'rgba(14,17,22,.78)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,.14)',
      color: '#e6e2d8', fontFamily: '"Kaiti SC","STKaiti","KaiTi","BiauKai","PingFang SC",serif',
      display: 'flex', gap: '1.4rem', alignItems: 'flex-end', userSelect: 'none',
    }}>
      <div style={cell}>
        <span style={k}>身份</span>
        <span style={{ ...v, fontSize: '1.25rem' }}>{label.zh}</span>
      </div>
      <div style={cell}>
        <span style={k}>功績</span>
        <span style={v}>{merit}{next !== null && <span style={{ opacity: .5 }}> / {next}</span>}</span>
      </div>
      {/* 官府記的功和鄉里傳的名是兩回事 —— 兩個都擺出來,玩家才看得出差別 */}
      <div style={cell}>
        <span style={k}>鄉望</span>
        <span style={{ ...v, fontSize: '.86rem' }}>{renownWord(renown)}</span>
      </div>
      <div style={cell}>
        <span style={k}>隨行</span>
        <span style={v}>{followers.length + retinue}<span style={{ opacity: .5 }}> / {cap}</span></span>
      </div>
      <div style={cell}>
        <span style={k}>錢</span>
        <span style={v}>{gold}</span>
      </div>
      <div style={cell}>
        <span style={k}>糧</span>
        <span style={{ ...v, color: days <= 3 ? '#d07862' : undefined }}>
          {grain.toFixed(1)}<span style={{ opacity: .5, fontSize: '.72rem' }}> 石 · {days} 天</span>
        </span>
      </div>
      {wounded > 0 && (
        <div style={cell}>
          <span style={k}>傷</span>
          <span style={{ ...v, color: '#d07862' }}>{wounded}</span>
        </div>
      )}
      <div style={cell}>
        <span style={k}>村況</span>
        <span style={{ ...v, fontSize: '.86rem' }}>{village.order}<span style={{ opacity: .5 }}> 治安</span></span>
      </div>
      {calamity && (
        <div style={cell}>
          <span style={k}>災</span>
          <span style={{ ...v, color: '#d07862' }}>{CALAMITY_LABEL[calamity.kind]}</span>
        </div>
      )}
      <div style={{ ...k, alignSelf: 'flex-end', marginLeft: '.4rem', lineHeight: 1.5 }}>
        {dateWord(day)} · {shichenWord(hour)} · {WEAPONS[weapon].name} · {LODGING_LABEL[lodging]}<br />
        {orderWord(village.order)} · {harvestWord(village.harvest)} · 米 {village.grainPrice}
        <span style={{ opacity: .7 }}> · WASD 走 · E 搭話 · F 場所 · J 日誌</span>
      </div>
    </div>
  );
}
