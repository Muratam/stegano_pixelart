/**
 * STC（Syndrome-Trellis Codes）。元の src/stc.nim の stcEmbed・stcExtract・getBitMatrix を移したもの。
 * 各画素は 0/1 の 2 値（変えない／変える）で、コストの小さい組み合わせを動的計画法（Viterbi）で選ぶ。
 */
import { NimRand } from "./rand";

/** 小行列 Ĥ の列（h ビットの整数を w 個、互いに異なる）。乱数のシードは元と同じく 1 で固定 */
export function getBitMatrix(w: number, h: number): number[] {
  if (h < 6 || h > 15) throw new RangeError("h は 6〜15");
  if (w < 2) throw new RangeError("w は 2 以上");
  if (w > 1 << h) throw new RangeError("w が 2^h を超えている");
  const r = new NimRand(1);
  for (;;) {
    const B: number[] = [];
    for (let i = 0; i < w; i++) B.push(r.rand((1 << h) - 1));
    if (new Set(B).size === w) return B;
  }
}

const cache = new Map<string, number[]>();
export function bitMatrix(w: number, h: number): number[] {
  const key = `${w},${h}`;
  let b = cache.get(key);
  if (!b) {
    b = getBitMatrix(w, h);
    cache.set(key, b);
  }
  return b;
}

/** 取り出し: 先頭から m ビット。w は列の数（埋め込みのときの n div m） */
export function stcExtractW(Y: ArrayLike<number>, m: number, w: number, h: number): number[] {
  const hhat = bitMatrix(w, h);
  const result: number[] = new Array(m).fill(0);
  let tmp = 0;
  for (let mi = 0; mi < m; mi++) {
    for (let ci = 0; ci < w; ci++) {
      if (Y[mi * w + ci]) tmp ^= hhat[ci];
    }
    result[mi] ^= tmp & 1;
    tmp >>= 1;
  }
  return result;
}

export function stcExtract(Y: ArrayLike<number>, m: number, h: number): number[] {
  return stcExtractW(Y, m, Math.floor(Y.length / m), h);
}

/** 動的計画法の経路を覚えるビットの数の上限（n × 2^h）。超える入力は先に断る */
export const STC_PATH_BITS_LIMIT = 2 ** 28;

/**
 * 埋め込み（元の stcEmbed で XS = PS = [0,1] の場合）。
 * X: いまの値（0/1）、cost0/cost1: その画素を 0/1 にするコスト。返り値は埋め込んだ後の値。
 * 同じコストのときの選び方（後に見た方を採る・argmin は最初の最小）も元と同じにしている。
 */
export function stcEmbed(M: ArrayLike<number>, X: ArrayLike<number>, cost0: Float64Array, cost1: Float64Array, h: number): number[] {
  const n = X.length;
  const m = M.length;
  if (m === 0) throw new RangeError("メッセージが空");
  const w = Math.floor(n / m);
  const hhat = bitMatrix(w, h);
  const S = 1 << h;
  if (n * S > STC_PATH_BITS_LIMIT) throw new RangeError("画像が大きすぎる（h を小さくする）");
  const INF = 1e12;
  let dp = new Float64Array(S).fill(INF);
  let newDP = new Float64Array(S);
  const words = S >>> 5 || 1;
  // dpPath[ni][state] の kind（0/1）をビットで持つ
  const path = new Uint32Array(n * words);
  dp[0] = 0;
  for (let mi = 0; mi < m; mi++) {
    for (let ci = 0; ci < w; ci++) {
      newDP.fill(INF);
      const ni = mi * w + ci;
      const d0 = cost0[ni];
      const d1 = cost1[ni];
      const hc = hhat[ci];
      const base = ni * words;
      for (let k = 0; k < S; k++) {
        const dk = dp[k];
        // kind 0（p = 0）: 状態はそのまま
        let val = dk + d0;
        if (!(val > newDP[k])) {
          newDP[k] = val;
          path[base + (k >>> 5)] &= ~(1 << (k & 31));
        }
        // kind 1（p = 1）: 状態に Ĥ の列を足す
        const nx = k ^ hc;
        val = dk + d1;
        if (!(val > newDP[nx])) {
          newDP[nx] = val;
          path[base + (nx >>> 5)] |= 1 << (nx & 31);
        }
      }
      const t = dp;
      dp = newDP;
      newDP = t;
    }
    const h2 = S >> 1;
    for (let k = 0; k < h2; k++) dp[k] = dp[k * 2 + M[mi]];
    for (let k = 0; k < h2; k++) dp[k + h2] = INF;
  }
  let best = 0;
  for (let k = 1; k < S; k++) if (dp[k] < dp[best]) best = k;
  const result = Array.from(X);
  let state = best * 2 + M[m - 1];
  for (let mi = m - 1; mi >= 0; mi--) {
    for (let ci = w - 1; ci >= 0; ci--) {
      const ni = mi * w + ci;
      const kind = (path[ni * words + (state >>> 5)] >>> (state & 31)) & 1;
      result[ni] = kind;
      if (kind) state ^= hhat[ci];
    }
    if (mi === 0) break;
    state = (state * 2 + M[mi - 1]) & (S - 1);
  }
  return result;
}
