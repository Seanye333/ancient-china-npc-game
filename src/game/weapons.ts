/**
 * 兵器。
 *
 * 一個人手上就一件傢伙 —— 沒有背包、沒有裝備欄。換兵器就是舊的不要了:
 * 白身的全部家當掛在腰上,這件事本身就該極簡。
 *
 * 兵器只改兩個數:<b>夠得著多遠、砍下去多重</b>。命中、士氣、體力全不碰 ——
 * 那些是人的事,不是鐵的事。長矛遠而稍輕,刀重而尋常,棍便宜,
 * 拳腳是破落戶的開局。
 *
 * 鐵器只有縣城有賣 —— 村裡的市集打不出一口刀,這是縣城存在的又一個理由。
 */

export type WeaponId = 'fists' | 'club' | 'blade' | 'spear';

export interface Weapon {
  id: WeaponId;
  name: string;
  /** 夠得著的距離。空手要貼上去,矛隔著一步就戳得到。 */
  reach: number;
  /** 傷害係數 —— 乘在人自己的力量上。 */
  dmgMul: number;
  /** 多少錢。0 = 買不到(拳腳)。 */
  price: number;
  /** 只有縣城有賣。 */
  countyOnly: boolean;
  word: string;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  fists: {
    id: 'fists', name: '拳腳', reach: 0.95, dmgMul: 0.55, price: 0, countyOnly: false,
    word: '一雙肉掌,打架先挨三下',
  },
  club: {
    id: 'club', name: '木棍', reach: 1.35, dmgMul: 0.85, price: 8, countyOnly: false,
    word: '削直的硬木,鄉下的道理',
  },
  blade: {
    id: 'blade', name: '環首刀', reach: 1.35, dmgMul: 1.0, price: 52, countyOnly: true,
    word: '軍中的制式,吃鐵的傢伙',
  },
  spear: {
    id: 'spear', name: '長矛', reach: 1.8, dmgMul: 0.9, price: 34, countyOnly: true,
    word: '一寸長一寸強,先戳得到就先說話',
  },
};

/** 各出身開局拿什麼 —— 破落士族一雙手沒拿過鋤頭,自然也沒拿過刀。 */
export const ORIGIN_WEAPON: Record<string, WeaponId> = {
  farm: 'club', clan: 'fists', trader: 'club', deserter: 'blade', wanderer: 'blade',
};
