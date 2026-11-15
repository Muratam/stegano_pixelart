/**
 * ドット絵のステガノグラフィー（提案手法）。元の src/crmidot.nim の
 * representationMap・distortionScoreMap・crmiDotEmbed・crmiDotDecode・distortionMap を移したもの。
 *
 * 要点:
 * - 外側 2px を除いた画素のうち、市松模様の片方（x と y の偶奇が同じ）で、4 近傍が 1 色だけではない画素に 1 ビットずつ持たせる。
 * - 値は「中心の色が代表色（4 近傍でいちばん多い色。同数なら上・右・下・左の順で先の色）と同じか」と、鍵の乱数のマスクの xor。
 * - ビットを変えるには中心を 4 近傍のどれかの色に塗り替える。そのコストは crmiLTP のヒストグラムの変化と CIEDE2000 の色差の積。
 * - 並べ替え（鍵の乱数）をしてから STC でコストの小さい変え方を選ぶ。4 近傍は変えないので、取り出しは同じ画素を同じ順に読める。
 */
import { NimRand } from "./rand";
import { crmiLTP, DP4, KEY_OF_W, W_ORDERED } from "./crmi";
import { makeColorDistance, type Rgb } from "./color";
import { cloneImage, createImage, type PixelImage } from "./pixel";
import { stcEmbed } from "./stc";

export interface Candidate {
  color: Rgb;
  distortion: number;
}

export interface DistortionResult {
  /** 外側 2px を除いた大きさ */
  width: number;
  height: number;
  /** X の座標 (x, y) ごとの候補（4 近傍の色を色の値の順。自分と同じ色はコスト 0） */
  candidates: Candidate[][];
  /** 代表色（X の座標） */
  represent: Int32Array;
}

const WET_PENALTY = 100000.0;
// コストの式 (Σ W|ΔH|)^α + β の α と β（元と同じ 0.5。α = 0.5 は sqrt で計算する）
const BETA = 0.5;

/** 代表色: 4 近傍でいちばん多い色。同数のときは上・右・下・左の順で先に出てくる色 */
export function representationMap(img: PixelImage): Int32Array {
  const W = img.width;
  const d = img.data;
  const rw = W - 4;
  const res = new Int32Array(Math.max(0, rw * (img.height - 4)));
  for (let x = 2; x < W - 2; x++) {
    for (let y = 2; y < img.height - 2; y++) {
      const cs = DP4.map(([dx, dy]) => d[x + dx + (y + dy) * W]);
      const cnt = cs.map((c) => cs.filter((e) => e === c).length);
      const max = Math.max(...cnt);
      // 4 近傍の順で最初に最多の数に達する色（最多が 1 色だけのときもこれで同じ）
      res[x - 2 + (y - 2) * rw] = cs[cnt.indexOf(max)];
    }
  }
  return res;
}

export function distortionScoreMap(img: PixelImage, wetColors: Rgb[] = []): DistortionResult {
  const W = img.width;
  const H = img.height;
  const d = img.data;
  const dist = makeColorDistance();
  const wet = new Set(wetColors);
  const rw = W - 4;
  const rh = H - 4;
  const candidates: Candidate[][] = new Array(rw * rh);
  const diff = new Int32Array(256);
  const diff2 = new Int32Array(256);
  // 元と同じく y が外側（色差の計算の順が結果の浮動小数に効くため）
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const self = d[x + y * W];
      const colors = [...new Set(DP4.map(([dx, dy]) => d[x + dx + (y + dy) * W]))].sort((a, b) => a - b);
      const list: Candidate[] = [];
      for (const color of colors) {
        if (color === self) {
          list.push({ color, distortion: 0.0 });
          continue;
        }
        diff.fill(0);
        diff2.fill(0);
        for (const px of [x - 1, x, x + 1]) {
          for (const py of [y - 1, y, y + 1]) {
            diff[crmiLTP(img, px, py, color)] -= 1;
            diff[crmiLTP(img, px, py, color, x, y, color)] += 1;
            diff2[crmiLTP(img, px, py, self)] -= 1;
            diff2[crmiLTP(img, px, py, self, x, y, color)] += 1;
          }
        }
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < KEY_OF_W.length; i++) {
          s1 += W_ORDERED[i] * Math.abs(diff[KEY_OF_W[i]]);
          s2 += W_ORDERED[i] * Math.abs(diff2[KEY_OF_W[i]]);
        }
        // pow(x, 0.5) は sqrt で計算する（どちらも正しく丸めれば同じ値。glibc の pow とビット単位で一致することは golden で確認）
        const dCrmi = Math.sqrt(s1) + BETA;
        const dCrmi2 = Math.sqrt(s2) + BETA;
        let v = Math.max(dCrmi, dCrmi2) * dist(color, self);
        if (wet.has(color) || wet.has(self)) v += WET_PENALTY;
        list.push({ color, distortion: v });
      }
      candidates[x - 2 + (y - 2) * rw] = list;
    }
  }
  return { width: rw, height: rh, candidates, represent: representationMap(img) };
}

/** 4 近傍が全部同じ色の画素（ビットを持たない） */
function isFlat(img: PixelImage, x: number, y: number): boolean {
  const W = img.width;
  const d = img.data;
  const left = d[x - 1 + y * W];
  return DP4.every(([dx, dy]) => d[x + dx + (y + dy) * W] === left);
}

/** 鍵のマスク R[x][y]（元と同じく x が外側の順に乱数を引く） */
function maskBits(seed: number | bigint, rw: number, rh: number): Uint8Array {
  const r = new NimRand(seed);
  const R = new Uint8Array(rw * rh);
  for (let x = 0; x < rw; x++) for (let y = 0; y < rh; y++) R[x + y * rw] = r.rand(1);
  return R;
}

export interface Slot {
  /** X の座標 */
  x: number;
  y: number;
  /** 変えるときの色 */
  color: Rgb;
  /** いまのビット */
  bit: number;
  /** 変えるときのコスト */
  distortion: number;
}

export function checkSize(img: PixelImage): void {
  if (img.width < 5 || img.height < 5) throw new Error("画像が小さすぎます（縦横 5px 以上）");
}

/** ビットを持つ画素の一覧（並べ替えの後。埋め込みの順） */
export function collectSlots(img: PixelImage, dist: DistortionResult, seed: number | bigint): Slot[] {
  const { width: rw, height: rh, candidates, represent } = dist;
  const R = maskBits(seed, rw, rh);
  const S: Slot[] = [];
  for (let x = 0; x < rw; x++) {
    for (let y = 0; y < rh; y++) {
      if (x % 2 !== y % 2) continue;
      if (isFlat(img, x + 2, y + 2)) continue;
      let v = R[x + y * rw];
      const self = img.data[x + 2 + (y + 2) * img.width];
      const rep = represent[x + y * rw];
      const cands = candidates[x + y * rw];
      let color = 0xff00ff;
      let distortion = 1e12;
      if (self !== rep) {
        // 代表色に変えるしかない
        const dd = cands.find((c) => c.color === rep);
        if (!dd) throw new Error("代表色の候補が無い（起こらないはず）");
        color = dd.color;
        distortion = dd.distortion;
      } else {
        // 代表色以外のうち、いちばんコストの小さい色（同じなら色の値の順で先。元の安定な並べ替えと同じ）
        let best: Candidate | null = null;
        for (const c of cands) {
          if (c.color === self) continue;
          if (!best || c.distortion < best.distortion) best = c;
        }
        if (best) {
          color = best.color;
          distortion = best.distortion;
          v ^= 1;
        }
      }
      S.push({ x, y, color, bit: v, distortion });
    }
  }
  new NimRand(seed).shuffle(S);
  return S;
}

export interface EmbedOptions {
  /** 鍵（乱数のシード。元のプログラムは 1234） */
  seed: number | bigint;
  /** STC の h（6〜15。元は 10） */
  h: number;
  /** 変えたくない色（元のプログラムは [24,20,20]） */
  wetColors?: Rgb[];
}

export interface EmbedResult {
  stego: PixelImage;
  /** 変えた画素（元の画像の座標） */
  changed: { x: number; y: number; from: Rgb; to: Rgb }[];
  /** ビットを持てる画素の数 */
  n: number;
  /** 埋め込んだビットの数・STC の列の数 */
  m: number;
  w: number;
  SX: number[];
  EX: number[];
  slots: Slot[];
  dist: DistortionResult;
}

export function embedBits(img: PixelImage, M: number[], opt: EmbedOptions): EmbedResult {
  checkSize(img);
  const dist = distortionScoreMap(img, opt.wetColors ?? []);
  const S = collectSlots(img, dist, opt.seed);
  const n = S.length;
  const m = M.length;
  if (m === 0) throw new Error("メッセージが空です");
  if (n < 2 * m) throw new Error(`入りきりません（${m} ビットに ${2 * m} 画素が要るが、この画像は ${n} 画素）`);
  const SX = S.map((s) => s.bit);
  const cost0 = new Float64Array(n);
  const cost1 = new Float64Array(n);
  S.forEach((s, i) => {
    cost0[i] = s.bit === 0 ? 0 : s.distortion;
    cost1[i] = s.bit === 1 ? 0 : s.distortion;
  });
  const EX = stcEmbed(M, SX, cost0, cost1, opt.h);
  const stego = cloneImage(img);
  const changed: EmbedResult["changed"] = [];
  const W = img.width;
  for (let i = 0; i < n; i++) {
    if (EX[i] === SX[i]) continue;
    const { x, y, color } = S[i];
    const p = x + 2 + (y + 2) * W;
    changed.push({ x: x + 2, y: y + 2, from: img.data[p], to: color });
    stego.data[p] = color;
    // アルファは、新しい色を持つ 4 近傍（上・右・下・左の順で最初）のものにそろえる
    if (stego.alpha && img.alpha) {
      const nb = DP4.map(([dx, dy]) => x + 2 + dx + (y + 2 + dy) * W).find((q) => img.data[q] === color);
      if (nb !== undefined) stego.alpha[p] = img.alpha[nb];
    }
  }
  return { stego, changed, n, m, w: Math.floor(n / m), SX, EX, slots: S, dist };
}

/** 取り出し: 並べ替えた後のビットの列（元の crmiDotDecode） */
export function decodeBits(img: PixelImage, seed: number | bigint): number[] {
  checkSize(img);
  const rw = img.width - 4;
  const rh = img.height - 4;
  const rep = representationMap(img);
  const R = maskBits(seed, rw, rh);
  const EX: number[] = [];
  for (let x = 0; x < rw; x++) {
    for (let y = 0; y < rh; y++) {
      if (x % 2 !== y % 2) continue;
      if (isFlat(img, x + 2, y + 2)) continue;
      let v = R[x + y * rw];
      if (rep[x + y * rw] === img.data[x + 2 + (y + 2) * img.width]) v ^= 1;
      EX.push(v);
    }
  }
  new NimRand(seed).shuffle(EX);
  return EX;
}

/** ビットを持てる画素の数（埋め込みの前に容量を出す用。鍵によらない） */
export function countSlots(img: PixelImage): number {
  if (img.width < 5 || img.height < 5) return 0;
  let n = 0;
  for (let x = 0; x < img.width - 4; x++)
    for (let y = 0; y < img.height - 4; y++) if (x % 2 === y % 2 && !isFlat(img, x + 2, y + 2)) n++;
  return n;
}

/**
 * 変えやすさの図（元の distortionMap）: 外側 2px は白、ほかは「自分と違う色に変える最小のコスト」を 0〜255 に線形に並べた灰色。
 * 暗いほど変えやすい。変えられない画素は 255。
 * 元と違う点: 「変えない色」のコスト（+100000）は範囲の計算から外して白にする（入れると他が全部黒になって見分けられないため）。
 */
export function distortionImage(img: PixelImage, dist: DistortionResult): PixelImage {
  const { width: rw, height: rh, candidates } = dist;
  const out = createImage(rw + 4, rh + 4);
  out.data.fill(0xffffff);
  const mins = new Float64Array(rw * rh).fill(NaN);
  let minR = 1e10;
  let maxR = 0;
  for (let i = 0; i < rw * rh; i++) {
    const self = img.data[(i % rw) + 2 + (Math.floor(i / rw) + 2) * img.width];
    const ds = candidates[i].filter((c) => c.color !== self && c.distortion < WET_PENALTY).map((c) => c.distortion);
    if (ds.length === 0) continue;
    const m = Math.min(...ds);
    mins[i] = m;
    minR = Math.min(minR, m);
    maxR = Math.max(maxR, m);
  }
  for (let i = 0; i < rw * rh; i++) {
    let r = 255;
    if (!Number.isNaN(mins[i])) r = maxR > minR ? Math.trunc((255.0 * (mins[i] - minR)) / (maxR - minR)) : 0;
    out.data[(i % rw) + 2 + (Math.floor(i / rw) + 2) * out.width] = (r << 16) | (r << 8) | r;
  }
  return out;
}

/** PSNR（元の pSNR。RGB の 3 チャンネル） */
export function psnr(a: PixelImage, b: PixelImage): number {
  let mse = 0;
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i];
    const y = b.data[i];
    for (const s of [16, 8, 0]) {
      const dd = ((x >> s) & 0xff) - ((y >> s) & 0xff);
      mse += dd * dd;
    }
  }
  mse /= a.data.length * 3.0;
  return 10 * Math.log10((255 * 255 * 3) / mse);
}
