/**
 * crmiLTP（中心と 8 近傍が「同じ色か」の 2 値のパターンを、回転・反転で同一視した番号）と、その重み。
 * 元の src/crmi.nim を移したもの。
 */
import type { PixelImage } from "./image";
import type { Rgb } from "./color";

/** パターンごとの重み（元の W） */
export const W: Record<number, number> = {
  1: 1.5691, 57: 1.1864, 31: 1.1385, 2: 0.788,
  10: 0.7293, 11: 0.6203, 14: 0.5586, 46: 0.5159, 63: 0.5041,
  61: 0.3367, 19: 0.3278, 23: 0.3224, 0: 0.249, 27: 0.208,
  42: 0.2016, 191: 0.1804, 175: 0.1634, 17: 0.1581,
  127: 0.1341, 255: 1.2955,
};

/**
 * 重みを足す順。元は Table（ハッシュ表）を回した順で、浮動小数の和の結果に効く。
 * Nim 1.2.18 での順（test/golden/golden.json の keyOfW と照合する）。
 */
export const KEY_OF_W = [191, 1, 2, 127, 255, 10, 11, 14, 17, 19, 23, 27, 31, 0, 42, 46, 175, 57, 61, 63];
export const W_ORDERED = KEY_OF_W.map((k) => W[k]);

/** 8 ビットのパターン → 回転（90° 単位）と反転で同一視した最小の値 */
export const CRMI_DP: Int32Array = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    const I = Array.from({ length: 8 }, (_, k) => ((1 << k) & i ? 1 : 0));
    let ans = 1e12;
    for (let b = 0; b <= 6; b += 2) {
      let s1 = 0;
      let s2 = 0;
      for (let k = 0; k < 8; k++) {
        s1 += I[(k + b) % 8] << k;
        s2 += I[(((65536 - k - b) % 8) + 8) % 8] << k;
      }
      ans = Math.min(ans, s1, s2);
    }
    t[i] = ans;
  }
  return t;
})();

/** 8 近傍の並び（上から時計回り）と 4 近傍（上・右・下・左） */
export const DP8: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export const DP4: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * (x, y) の crmiLTP。checkColor の色を「黒」、それ以外を「白」とみなす。
 * override があれば、その 1 画素だけ色を差し替えて計算する（中心の色を変えたときの計算用）。
 */
export function crmiLTP(img: PixelImage, x: number, y: number, checkColor: Rgb, ox = -1, oy = -1, oc: Rgb = 0): number {
  const w = img.width;
  const d = img.data;
  const at = (px: number, py: number) => (px === ox && py === oy ? oc : d[px + py * w]);
  const xx = at(x, y) === checkColor;
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const [dx, dy] = DP8[i];
    if (xx !== (at(x + dx, y + dy) === checkColor)) v |= 1 << i;
  }
  return CRMI_DP[v];
}
