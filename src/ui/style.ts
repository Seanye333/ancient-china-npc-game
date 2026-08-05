import type { CSSProperties } from 'react';

/**
 * 介面的共同語彙。
 *
 * 在這之前,五個面板各自寫一份行內樣式:同一種「玻璃底 + 一像素邊」抄了五遍,
 * 而且已經開始長歪 —— 有的 .78 有的 .88,有的 blur(8) 有的 blur(10)。
 * 抄五遍的東西改一次就要改五處,改漏的那一處就是玩家看得出來的那一處。
 *
 * 這裡不做「元件庫」,只把重複的<b>值</b>收攏。面板長什麼樣還是各自決定,
 * 因為它們要說的話本來就不一樣。
 */

export const FONT = '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif';
export const INK = '#e6e2d8';
export const GOLD = '#c8a45a';
export const GREEN = '#a8d4b4';
export const RUST = '#d07862';

/** 玻璃底的浮層 —— 世界要透得出來,但字要看得清。 */
export const panel: CSSProperties = {
  background: 'rgba(14,17,22,.82)',
  backdropFilter: 'blur(9px)',
  border: '1px solid rgba(255,255,255,.15)',
  color: INK,
  fontFamily: FONT,
};

/** 一般按鈕。 */
export const button: CSSProperties = {
  padding: '.42rem .9rem',
  background: 'rgba(255,255,255,.08)',
  color: INK,
  border: '1px solid rgba(255,255,255,.2)',
  cursor: 'pointer',
  fontSize: '.86rem',
  fontFamily: 'inherit',
  textAlign: 'left',
};

/** 按不下去的按鈕 —— 不藏起來,因為「為什麼按不了」本身是資訊。 */
export const buttonOff: CSSProperties = {
  ...button, opacity: .42, cursor: 'not-allowed',
};

/** 要緊的那一顆。 */
export const buttonKey: CSSProperties = {
  ...button, borderColor: GOLD, color: '#f0d9a0',
};

/** 小標:字級最小、字距最寬的那一種。 */
export const label: CSSProperties = {
  fontSize: '.62rem', letterSpacing: '.14em', opacity: .55,
};

/** 數字一律等寬 —— 跳動的數字不等寬會左右抖。 */
export const numeric: CSSProperties = { fontVariantNumeric: 'tabular-nums' };
