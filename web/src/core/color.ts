/**
 * 色差（CIEDE2000）。元のプログラムの src/image.nim（sRGB → XYZ → L*a*b*）と src/ciede2000.h をそのまま移したもの。
 * 色は 0xRRGGBB の整数で持つ（Nim の toI と同じ）。
 */
export type Rgb = number;

export const rgbOf = (c: Rgb): [number, number, number] => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
export const rgb = (r: number, g: number, b: number): Rgb => (r << 16) | (g << 8) | b;
export const hexOf = (c: Rgb): string => "#" + c.toString(16).padStart(6, "0");

const LIN = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const nx = i / 255;
    t[i] = nx > 0.04045 ? Math.pow((nx + 0.055) / 1.055, 2.4) : nx / 12.92;
  }
  return t;
})();

export function rgbToLab(c: Rgb): [number, number, number] {
  const [r, g, b] = rgbOf(c);
  const lr = LIN[r];
  const lg = LIN[g];
  const lb = LIN[b];
  const x = lr * 0.4124 + lg * 0.3576 + lb * 0.1805;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505;
  const lin = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 0.1379);
  const nx = lin(x / 0.95047);
  const ny = lin(y / 1.0);
  const nz = lin(z / 1.08883);
  return [116 * ny - 16, 500 * (nx - ny), 200 * (ny - nz)];
}

const tolZero = (x: number) => Math.abs(x) < 1e-9;
const cosd = (d: number) => Math.cos((d * Math.PI) / 180.0);
const sind = (d: number) => Math.sin((d * Math.PI) / 180.0);
function fqatan(y: number, x: number): number {
  let t = (Math.atan2(y, x) / Math.PI) * 180.0;
  if (t < 0.0) t += 360.0;
  return t;
}
function f7(x: number): number {
  if (x < 1.0) return Math.pow(x / 25.0, 3.5);
  return 1.0 / Math.sqrt(1.0 + Math.pow(25.0 / x, 7.0));
}

export function ciede2000(L1: number, a1: number, b1: number, L2: number, a2: number, b2: number): number {
  const epsilon = 1e-9;
  const C1ab = Math.sqrt(a1 * a1 + b1 * b1);
  const C2ab = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1ab + C2ab) / 2.0;
  const G = 0.5 * (1.0 - f7(Cab));
  const a1_ = (1.0 + G) * a1;
  const a2_ = (1.0 + G) * a2;
  const C1_ = Math.sqrt(a1_ * a1_ + b1 * b1);
  const C2_ = Math.sqrt(a2_ * a2_ + b2 * b2);
  const h1_ = tolZero(a1_) && tolZero(b1) ? 0.0 : fqatan(b1, a1_);
  const h2_ = tolZero(a2_) && tolZero(b2) ? 0.0 : fqatan(b2, a2_);

  const dL_ = L2 - L1;
  const dC_ = C2_ - C1_;
  const C12 = C1_ * C2_;
  // C の元のコードでは、どの分岐にも当たらないとき dh_ と h_ は未初期化（実際には当たらない）
  let dh_ = 0.0;
  if (!tolZero(C12)) {
    const tmp = h2_ - h1_;
    if (Math.abs(tmp) <= 180.0 + epsilon) dh_ = tmp;
    else if (tmp > 180.0) dh_ = tmp - 360.0;
    else if (tmp < -180.0) dh_ = tmp + 360.0;
  }
  const dH_ = 2.0 * Math.sqrt(C12) * sind(dh_ / 2.0);

  const L_ = (L1 + L2) / 2.0;
  const C_ = (C1_ + C2_) / 2.0;
  let h_ = 0.0;
  if (tolZero(C12)) {
    h_ = h1_ + h2_;
  } else {
    const tmp1 = Math.abs(h1_ - h2_);
    const tmp2 = h1_ + h2_;
    if (tmp1 <= 180.0 + epsilon) h_ = tmp2 / 2.0;
    else if (tmp2 < 360.0) h_ = (tmp2 + 360.0) / 2.0;
    else if (tmp2 >= 360.0) h_ = (tmp2 - 360.0) / 2.0;
  }
  const T =
    1.0 - 0.17 * cosd(h_ - 30.0) + 0.24 * cosd(2.0 * h_) + 0.32 * cosd(3.0 * h_ + 6.0) - 0.2 * cosd(4.0 * h_ - 63.0);
  const dTh = 30.0 * Math.exp(-Math.pow((h_ - 275.0) / 25.0, 2.0));

  const L_2 = (L_ - 50.0) * (L_ - 50.0);
  const RC = 2.0 * f7(C_);
  const SL = 1.0 + (0.015 * L_2) / Math.sqrt(20.0 + L_2);
  const SC = 1.0 + 0.045 * C_;
  const SH = 1.0 + 0.015 * C_ * T;
  const RT = -sind(2.0 * dTh) * RC;

  const LP = dL_ / SL;
  const CP = dC_ / SC;
  const HP = dH_ / SH;
  return Math.sqrt(LP * LP + CP * CP + HP * HP + RT * CP * HP);
}

export function distanceCiede2000(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  return ciede2000(l1, a1, b1, l2, a2, b2);
}

/**
 * 元の makeColorDistanceFunction と同じ結果を返す色差の関数。
 * 元はパレットを並べ替えてから「並びの番号の組」で結果を覚えるが、計算は最初に呼ばれたときの引数の順で行う
 * （CIEDE2000 は引数の順で浮動小数の結果がわずかに変わりうる）。ここでも組ごとに最初の呼び出しの順で計算して覚える。
 * 呼ぶ順は元と同じにすること（stego.ts の distortionScoreMap は元と同じく y が外側の順で呼ぶ）。
 */
export function makeColorDistance(): (a: Rgb, b: Rgb) => number {
  const cache = new Map<number, number>();
  return (a, b) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const k = lo * 0x1000000 + hi;
    let d = cache.get(k);
    if (d === undefined) {
      d = distanceCiede2000(a, b);
      cache.set(k, d);
    }
    return d;
  };
}
