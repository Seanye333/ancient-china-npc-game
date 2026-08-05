import { useHero } from './hero';
import { useVillage } from './village';
import { useBands } from './bands';
import { useQuest } from './quest';
import { useJournal } from './journal';
import { useFolk } from './folk';
import { useClock } from '../world/worldTime';
import { settleGuard } from './daily';

/**
 * 存檔。
 *
 * 有了日子、糧、租金以後,「關掉分頁一切歸零」就不再只是不方便 ——
 * 它讓這個遊戲<b>沒法真的玩一局</b>:過冬這件事本身要好幾個鐘頭的遊戲時間。
 *
 * 兩條規矩:
 *
 * 一、<b>只存決定,不存推導</b>。存 day 不存 season(季節從日子算),
 *     存 merit 不存品階,存 routed 不存煙。派生的東西存下來,遲早會和來源對不上,
 *     而那種錯最難查:讀檔以後世界「差一點點」,但你不知道差在哪。
 * 二、<b>版本對不上就當沒有存檔</b>,不做遷移。原型階段欄位天天改,
 *     寫遷移的成本遠大於重開一局;但要說清楚,不能默默吃掉玩家的進度。
 */

const KEY = 'baishen.save.v1';
const VERSION = 1;

interface SaveData {
  v: number;
  at: number;
  clock: { day: number; hour: number; weather: string };
  hero: ReturnType<typeof heroSlice>;
  village: { order: number; harvest: number; trade: number; grainPrice: number };
  bands: Array<{ id: string; routed: boolean; count: number; fierce: number }>;
  quest: unknown;
  journal: unknown;
  /** 村民後來怎麼了 —— 不存的話讀檔以後死人會復活。 */
  folk: unknown;
}

function heroSlice() {
  const h = useHero.getState();
  return {
    name: h.name, courtesy: h.courtesy, hometown: h.hometown,
    stats: h.stats, merit: h.merit, gold: h.gold, grain: h.grain,
    retinue: h.retinue, followers: h.followers, renown: h.renown,
    favors: h.favors, wounded: h.wounded,
    lodging: h.lodging, rentPaidThrough: h.rentPaidThrough, toil: h.toil,
  };
}

export function saveGame(): boolean {
  try {
    const c = useClock.getState();
    const v = useVillage.getState();
    const data: SaveData = {
      v: VERSION,
      at: Date.now(),
      clock: { day: c.day, hour: c.hour, weather: c.weather },
      hero: heroSlice(),
      village: { order: v.order, harvest: v.harvest, trade: v.trade, grainPrice: v.grainPrice },
      // 賊窩只存會變的三個欄位;座標與名字由種子決定,存了反而會和世界生成對不上
      bands: useBands.getState().bands.map((b) => ({
        id: b.id, routed: b.routed, count: b.count, fierce: b.fierce,
      })),
      quest: useQuest.getState().taken,
      journal: useJournal.getState().entries,
      folk: useFolk.getState().deltas,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as SaveData).v === VERSION;
  } catch {
    return false;
  }
}

export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as SaveData;
    if (data.v !== VERSION) return false;

    useHero.setState(data.hero);
    useVillage.setState(data.village);
    useQuest.setState({ taken: data.quest as never });
    useJournal.setState({ entries: (data.journal as never) ?? [], unread: 0 });
    useFolk.setState({ deltas: (data.folk as never) ?? {} });
    useBands.setState((s) => ({
      bands: s.bands.map((b) => {
        const saved = data.bands.find((x) => x.id === b.id);
        return saved ? { ...b, ...saved } : b;
      }),
    }));
    // 時鐘最後放 —— 它一動就會觸發跨日結算,得等其餘狀態都到位。
    // 而且要先落閘:存的是結算之後的狀態,那些日子不能再結一遍
    settleGuard.skipUntil = data.clock.day;
    useClock.setState({
      day: data.clock.day, hour: data.clock.hour,
      weather: data.clock.weather as never,
    });
    return true;
  } catch {
    return false;
  }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* 無痕模式會丟,無所謂 */ }
}

export function savedAt(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as SaveData).at ?? null;
  } catch {
    return null;
  }
}
