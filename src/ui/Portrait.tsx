/**
 * 對話立繪 — 一幅程序化的側臉剪影。
 *
 * 沒有畫師,但「說話的人有一張臉」這件事不能省:剪影從這個人的
 * 行當、年紀、身份雜湊拼出來 —— 斗笠是下田的,髮髻是市面上的,
 * 鬍子是上了年紀的。同一個人永遠拼出同一張臉。
 * 一色的墨,像皮影 —— 這個世界的人本來就是靠剪影認的。
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function Portrait({ id, trade, age }: { id: string; trade?: string; age?: number }) {
  const h = hash(id);
  const ink = '#181310';
  const old = (age ?? 30) >= 52;
  const hat = trade === 'farm' || trade === 'dock';
  const bunR = 7 + (h % 4);              // 髮髻大小 —— 同一個人永遠同一顆
  const noseL = 5 + ((h >> 3) % 4);      // 鼻子的挺法
  const beard = old || ((h >> 6) % 5 === 0);   // 老人都有鬍子,年輕人五個裡一個

  return (
    <svg
      width={86} height={104} viewBox="0 0 86 104"
      style={{
        position: 'absolute', left: -95, bottom: 0,
        background: 'rgba(14,17,22,.82)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,.14)',
      }}
      aria-hidden
    >
      <g fill={ink} opacity={0.92}>
        {/* 後腦與臉 —— 朝左的側臉 */}
        <circle cx={48} cy={44} r={25} />
        {/* 鼻與唇的起伏 */}
        <path d={`M 25 38 q -${noseL} 4 -2 9 q 3 3 0 6 q 4 4 8 3 L 31 34 Z`} />
        {/* 髮髻或斗笠 */}
        {hat ? (
          <path d="M 8 30 L 78 30 L 52 12 L 30 12 Z" />
        ) : (
          <>
            <circle cx={60} cy={16} r={bunR} />
            <rect x={52} y={20} width={14} height={5} rx={2} />
          </>
        )}
        {/* 鬍子 —— 順著下巴垂下來的一撮 */}
        {beard && <path d="M 30 60 q 4 16 10 20 q 4 -8 2 -19 Z" />}
        {/* 肩與襟 */}
        <path d="M 14 104 q 4 -26 30 -30 q 28 2 34 30 Z" />
        <path d="M 40 78 l 6 10 l -8 14 l -6 -2 Z" fill="#0e1116" opacity={0.5} />
      </g>
      {old && (
        // 白髮 —— 鬢角一縷
        <path d="M 62 26 q 8 2 9 10" stroke="#cfc9bd" strokeWidth={2.4} fill="none" opacity={0.8} />
      )}
    </svg>
  );
}
