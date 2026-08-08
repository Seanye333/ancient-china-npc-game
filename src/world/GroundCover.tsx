import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  terrainHeight, slopeAt, riverMask, humanMask, waterLevel,
} from './field';
import { paletteFor, useClock } from './worldTime';
import { jitteredColor, rngGate } from './palette';
import { snow } from './Storms';

/**
 * 腳邊的東西 —— 草叢、碎石、斷枝。
 *
 * 遠景一直是好看的:層林、河、屋頂。可鏡頭一壓低,地面就是<b>一整片
 * 沒有東西的顏色</b> —— 一個人站在一塊純色的板子上。差的不是貼圖,
 * 是「人這麼高的尺度上什麼都沒有」:沒有一叢草、沒有一顆石子,
 * 所以走十步和走一步看起來一樣,腳下沒有速度感。
 *
 * 做法和落葉、雨雪同一套:<b>只鋪鏡頭周圍那一圈</b>。滿世界撒到這個
 * 密度是二十萬個實例,而人一次只看得到腳邊那三十步。
 *
 * 位置<b>不能每次重生就重擲</b> —— 那樣草會跟著你爬。這裡用格子:
 * 世界被切成 CELL 見方的格,每格的草長在哪、多高、什麼顏色,
 * 全由格子座標的雜湊定死。你走開再走回來,那叢草還在原地。
 */

const CELL = 1.45;              // 一格一叢
const RING = 16;                // 鏡頭周圍 ±16 格 ≈ 23 步
const MAX = (RING * 2 + 1) ** 2;

/**
 * 中景那一圈。
 *
 * 腳邊那一圈只鋪到二十三步 —— 走著走著你會看見一條線:線裡有草,
 * 線外是一整片沒有東西的顏色。二十三步在這個尺度上<b>就在畫面正中間</b>,
 * 那條界線比「完全沒有草」還顯眼。
 *
 * 中景不能照著近景的密度往外鋪(格數是平方成長,鋪到五十步就是七千叢)。
 * 改成:格子大三倍、一叢也大三倍 —— 遠看的密度差不多,數量只有九分之一。
 * 遠處本來就分不出「一叢草」和「三叢草」,分得出的只有「有」跟「沒有」。
 */
const CELL2 = 4.35;
const RING2 = 12;               // ±52 步
const MAX2 = (RING2 * 2 + 1) ** 2;

/**
 * 一叢草 = 三片交錯的葉子。
 *
 * 葉子是<b>上窄下寬的尖片</b>,不是矩形 —— 沒有貼圖的矩形近看就是一張
 * 綠卡片,而尖頭是「草」這個字的全部。三片交錯開,從任何角度看都不是一張紙。
 */
function bladeGeom(w: number, h: number, lean: number): THREE.BufferGeometry {
  /*
   * 葉根紮到地面<b>以下</b>。
   *
   * 地形網格一格 1.73 公尺,而擺放讀的是解析高度函式 —— 兩者在起伏處差得出
   * 十幾二十公分。樹和房子夠高看不出來,一叢三十公分的草就整叢埋進坡裡:
   * 第一版鋪了八百多叢,畫面上只剩零星幾根黑刺露在外面(而且看起來像壞了)。
   * 根紮深一截,再把整叢抬高一點,兩頭的誤差就都吃得下。
   */
  const root = -0.16;
  const v = [
    -w, root, 0, w, root, 0, w * 0.42, h * 0.55, lean * 0.4,
    -w, root, 0, w * 0.42, h * 0.55, lean * 0.4, -w * 0.42, h * 0.55, lean * 0.4,
    -w * 0.42, h * 0.55, lean * 0.4, w * 0.42, h * 0.55, lean * 0.4, 0, h, lean,
  ];
  /*
   * 正反面各鋪一份三角形,而不是用 side: DoubleSide。
   *
   * 因為法線是<b>造假朝上</b>的(見下),而 DoubleSide 的背面 three 會
   * 自動把法線翻過來 —— 翻完就朝下,一整面不受光,於是俯視一叢草是
   * 幾根黑刺。自己把背面補齊(反繞序),兩面就都朝上了。
   *
   * 法線朝上而不是垂直葉面:草該和它長的那塊地吃同一份光。
   * 用真法線的話,三片交錯的葉子總有一兩片背著太陽,一叢草黑一半。
   * 這是所有葉片卡都用的那一招。
   */
  const pos = new Float32Array(v.length * 2);
  pos.set(v, 0);
  for (let t = 0; t < 3; t++) {
    const b = t * 9;
    // 反繞序:第二、三個頂點對調
    for (const [k, src] of [[0, 0], [1, 2], [2, 1]] as Array<[number, number]>) {
      pos[v.length + b + k * 3] = v[b + src * 3];
      pos[v.length + b + k * 3 + 1] = v[b + src * 3 + 1];
      pos[v.length + b + k * 3 + 2] = v[b + src * 3 + 2];
    }
  }
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

function tuftGeom(): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    gs.push(bladeGeom(0.10, 0.32 + i * 0.06, (i - 1) * 0.08).rotateY((i / 3) * Math.PI));
  }
  return mergeGeometries(gs, false)!;
}

/** 碎石與斷枝共用一份 —— 一顆壓扁的多面體,躺著是石頭,立起來是枝子。 */
function grittGeom(): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(0.11, 0);
  g.scale(1, 0.55, 1.25);
  return g;
}

/**
 * 這一格該不該有東西,有的話長在哪。
 *
 * 排除的地方都是有理由的:水底下不長草;陡坡上是裸岩(而且草會穿出斜面);
 * 人跡重的地方(村心、路、場院)踩禿了 —— 那一條讓村子和野地看起來不一樣,
 * 比多撒一萬叢草有用。
 */
function pick(cx: number, cz: number) {
  const h0 = rngGate(cx * 1.7 + 0.3, cz * 2.3 - 0.7);
  const x = (cx + 0.5 + (h0 - 0.5) * 0.9) * CELL;
  const h1 = rngGate(cx * 3.1 - 1.9, cz * 1.3 + 2.7);
  const z = (cz + 0.5 + (h1 - 0.5) * 0.9) * CELL;
  /*
   * 篩的順序 = 從便宜到貴。
   *
   * slopeAt 內部要再問四次 terrainHeight,是這裡最貴的一項,所以放最後 ——
   * 能被水位和人跡帶刷掉的格子,就別再為它算一次坡度。
   * 一千格重鋪一次 2.3 毫秒,而走一步就重鋪一次,順序是白撿的。
   */
  const y = terrainHeight(x, z);
  if (y < waterLevel() + 0.05) return null;
  const hm = humanMask(x, z);
  // 人跡帶<b>稀疏而不是清空</b> —— 全清的話村子四周會出現一圈突兀的光板。
  // 門檻也不能訂得太狠:第一版 729 格只長得出 84 叢,等於沒鋪
  if (hm > 0.30 && h0 > 0.62 - hm * 0.45) return null;
  if (slopeAt(x, z) > 0.46) return null;
  return { x, y, z, h0, h1 };
}

/** 這一格該不該有東西 —— 中景版。格子大,門檻也放寬(遠處看不出疏密)。 */
function pick2(cx: number, cz: number) {
  const h0 = rngGate(cx * 2.9 + 5.1, cz * 1.7 - 3.3);
  const x = (cx + 0.5 + (h0 - 0.5) * 0.9) * CELL2;
  const h1 = rngGate(cx * 1.3 - 4.7, cz * 3.7 + 1.1);
  const z = (cz + 0.5 + (h1 - 0.5) * 0.9) * CELL2;
  const y = terrainHeight(x, z);
  if (y < waterLevel() + 0.05) return null;
  if (humanMask(x, z) > 0.34 && h0 > 0.55) return null;
  if (slopeAt(x, z) > 0.5) return null;
  return { x, y, z, h0, h1 };
}

/** 原型階段的把手:腳邊與中景各鋪了幾叢、重鋪一次多少毫秒。 */
export const coverStat = { ms: 0, tufts: 0, grit: 0, far: 0 };

export function GroundCover() {
  const season = useClock((s) => s.season);
  const weather = useClock((s) => s.weather);
  const p = useMemo(() => paletteFor(season), [season]);
  /*
   * 草比它腳下那塊地亮一截。
   *
   * 同色的話一叢草和地面在畫面上是同一片顏色,鋪了八百叢等於沒鋪。
   * 亮度直接乘(線性空間),不走 offsetHSL —— 那個函式內部
   * getHSL 讀線性、setHSL 寫 sRGB,兩個空間不一樣,調出來的量不是你想的量。
   */
  const tint = useMemo(() => ({
    grass: p.grass.clone().multiplyScalar(1.5),
    dry: p.dry.clone().multiplyScalar(1.35),
  }), [p]);
  const { camera } = useThree();

  const tuft = useRef<THREE.InstancedMesh>(null);
  const grit = useRef<THREE.InstancedMesh>(null);
  const far = useRef<THREE.InstancedMesh>(null);
  const geoms = useMemo(() => ({ tuft: tuftGeom(), grit: grittGeom() }), []);
  const tmp = useMemo(() => ({ o: new THREE.Object3D() }), []);
  /** 上次重鋪時鏡頭在哪一格 —— 沒換格就不必重算。 */
  const last = useRef({ cx: NaN, cz: NaN, season: '', weather: '', pack: -1 });

  useFrame(() => {
    const tm = tuft.current, gm = grit.current;
    if (!tm || !gm) return;
    const cx = Math.round(camera.position.x / CELL);
    const cz = Math.round(camera.position.z / CELL);
    const st = last.current;
    /*
     * 積雪也要當成「該重鋪」的理由之一,但只認到小數第一位 ——
     * snow.pack 每幀都在動,認到底的話等於每幀重鋪一次(量過 1.9 毫秒,
     * 走一步重鋪一次是划算的,每幀重鋪就不是了)。
     */
    const pack = Math.round(snow.pack * 10) / 10;
    if (cx === st.cx && cz === st.cz && season === st.season
        && weather === st.weather && pack === st.pack) return;
    last.current = { cx, cz, season, weather, pack };
    const t0 = performance.now();

    /*
     * 雪把草<b>一叢一叢</b>埋掉,不是「下雪就全沒了」。
     *
     * 從前這裡是 `weather === 'snow'`:雪一開始下,滿地的草同一幀集體消失;
     * 雪一停又同一幀集體長回來。雪是一層一層積起來的 ——
     * 矮的先沒頂、高的還露著幾根,積到八成才真的看不見一根草。
     * 門檻用位置雜湊(h0)決定哪一叢先被埋,所以同一個地方每次都一樣。
     */
    let nT = 0, nG = 0;
    for (let dx = -RING; dx <= RING; dx++) {
      for (let dz = -RING; dz <= RING; dz++) {
        const s = pick(cx + dx, cz + dz);
        if (!s) continue;
        /*
         * 石子只長在河灘。
         *
         * 第一版是「五分之一是石子」,結果青草地上均勻散著一顆顆深色扁球,
         * 讀起來不是石頭是垃圾。石頭該有石頭的地方:近水多、內陸幾乎沒有。
         */
        const stony = s.h1 < 0.04 + riverMask(s.x, s.z) * 0.55;
        // 石頭壓在雪底下比草更早不見 —— 它本來就矮
        if (stony && pack > 0.55) continue;
        if (!stony && pack > 0.12 + s.h0 * 0.72) continue;
        // 抬高一點點:網格在凹處高於解析面,不抬的話草根露不出來
        tmp.o.position.set(s.x, s.y + 0.05, s.z);
        tmp.o.rotation.set(0, s.h0 * Math.PI * 2, 0);
        if (stony) {
          tmp.o.scale.setScalar(0.55 + s.h0 * 1.0);
          tmp.o.updateMatrix();
          if (nG < MAX) {
            gm.setMatrixAt(nG, tmp.o.matrix);
            // 用河泥色不用山岩色 —— 河灘的卵石是淺的,深灰擺在草上像塊煤
            gm.setColorAt(nG, jitteredColor(p.silt, s.x, s.z, 0.006, 0.06, 0.12));
            nG++;
          }
        } else {
          const k = 0.6 + s.h1 * 0.9;
          tmp.o.scale.set(k, k * (0.7 + s.h0 * 0.8), k);
          tmp.o.updateMatrix();
          if (nT < MAX) {
            tm.setMatrixAt(nT, tmp.o.matrix);
            // 草色在青與枯之間,按位置雜湊挑 —— 一片草地不是一種綠
            const base = s.h0 < 0.42 ? tint.dry : tint.grass;
            tm.setColorAt(nT, jitteredColor(base, s.x, s.z, 0.014, 0.10, 0.09));
            nT++;
          }
        }
      }
    }
    tm.count = nT; gm.count = nG;
    tm.instanceMatrix.needsUpdate = true;
    gm.instanceMatrix.needsUpdate = true;
    if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
    if (gm.instanceColor) gm.instanceColor.needsUpdate = true;

    /* 中景那一圈 —— 同一套規矩,格子與叢都放大三倍 */
    const fm = far.current;
    if (fm) {
      const fcx = Math.round(camera.position.x / CELL2);
      const fcz = Math.round(camera.position.z / CELL2);
      let nF = 0;
      for (let dx = -RING2; dx <= RING2; dx++) {
        for (let dz = -RING2; dz <= RING2; dz++) {
          // 近景蓋得到的地方就不必再鋪一層 —— 疊在一起只是白畫
          if (Math.abs(dx) * CELL2 < RING * CELL && Math.abs(dz) * CELL2 < RING * CELL) continue;
          const g = pick2(fcx + dx, fcz + dz);
          if (!g) continue;
          if (pack > 0.12 + g.h0 * 0.72) continue;
          tmp.o.position.set(g.x, g.y + 0.05, g.z);
          tmp.o.rotation.set(0, g.h0 * Math.PI * 2, 0);
          const k = 2.4 + g.h1 * 1.6;
          tmp.o.scale.set(k, k * (0.7 + g.h0 * 0.7), k);
          tmp.o.updateMatrix();
          if (nF < MAX2) {
            fm.setMatrixAt(nF, tmp.o.matrix);
            // 遠一點就<b>暗一點</b>:大叢草迎光的面積大,不壓下來會比腳邊還亮
            const base = g.h0 < 0.42 ? tint.dry : tint.grass;
            fm.setColorAt(nF, jitteredColor(base, g.x, g.z, 0.012, 0.09, 0.07)
              .multiplyScalar(0.82));
            nF++;
          }
        }
      }
      fm.count = nF;
      fm.instanceMatrix.needsUpdate = true;
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
      coverStat.far = nF;
    }
    // 原型階段的把手:重鋪一次要多久。走一步就重鋪的東西,這個數字是它的成本
    coverStat.ms = +(performance.now() - t0).toFixed(2);
    coverStat.tufts = nT; coverStat.grit = nG;
    (window as unknown as Record<string, unknown>).__groundCover = { ...coverStat };
  });

  return (
    <>
      <instancedMesh
        ref={tuft} args={[geoms.tuft, undefined, MAX]} frustumCulled={false}
      >
        {/*
          * 底色<b>必須是白</b>、而且<b>不能開 vertexColors</b>。
          *
          * 顏色是每叢一個(instanceColor),不是烘在頂點上的。開了 vertexColors
          * 而幾何沒有 color 屬性,著色器照樣去乘那個屬性 —— WebGL 給的是
          * (0,0,0) —— 於是整片草是純黑的。畫面上讀作「地上長了一叢叢黑刺」,
          * 而且怎麼調光都沒用,因為它根本不是光的問題。
          * (人的身體是另一套:那邊顏色真的烘在頂點裡,所以那邊要開。)
          *
          * 草不投影 —— 幾百叢各投一份陰影,換來的是看不見的差別和一半的幀。
          */}
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={grit} args={[geoms.grit, undefined, MAX]} frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      {/* 中景。同一份幾何,只是矩陣放大 —— 多一次 draw call,不多一份記憶體 */}
      <instancedMesh
        ref={far} args={[geoms.tuft, undefined, MAX2]} frustumCulled={false}
      >
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </>
  );
}
