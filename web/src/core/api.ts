/**
 * 画面（Web Worker）から使う入口: 文字列を埋め込む・取り出す。
 */
import type { Rgb } from "./color";
import { distanceCiede2000 } from "./color";
import type { PixelImage } from "./pixel";
import { capacityBytes, decodeMessage, encodeMessage, maxColumns, seedFromKey } from "./message";
import { STC_PATH_BITS_LIMIT } from "./stc";
import { countSlots, decodeBits, distortionImage, embedBits, psnr } from "./stego";

export interface EmbedTextOptions {
  key: string;
  h: number;
  wetColors: Rgb[];
}

export interface EmbedTextResult {
  stego: PixelImage;
  /** 変えやすさの図（暗いほど変えやすい） */
  distortion: PixelImage;
  changed: { x: number; y: number; from: Rgb; to: Rgb }[];
  n: number;
  m: number;
  w: number;
  psnr: number;
  /** 変えた画素の CIEDE2000 の色差（平均・最大） */
  meanDeltaE: number;
  maxDeltaE: number;
  bytes: number;
}

export interface Capacity {
  /** ビットを持てる画素の数 */
  n: number;
  /** 入る本文の最大のバイト数 */
  bytes: number;
  /** この h で計算できる大きさか */
  tooLarge: boolean;
}

export function capacity(img: PixelImage, h: number): Capacity {
  const n = countSlots(img);
  return { n, bytes: capacityBytes(n), tooLarge: n * 2 ** h > STC_PATH_BITS_LIMIT };
}

export function embedText(img: PixelImage, text: string, opt: EmbedTextOptions): EmbedTextResult {
  const cap = capacity(img, opt.h);
  if (cap.n < 2 * 32) throw new Error("この画像には埋め込める場所がほとんどありません（色の境界が少ないか、画像が小さすぎます）");
  if (cap.tooLarge) throw new Error("画像が大きすぎて計算できません。h を小さくしてください");
  const M = encodeMessage(text, cap.n, opt.h);
  const res = embedBits(img, M, { seed: seedFromKey(opt.key), h: opt.h, wetColors: opt.wetColors });
  if (res.w > maxColumns(opt.h)) throw new Error("内部の不整合（w が大きすぎる）");
  const des = res.changed.map((c) => distanceCiede2000(c.from, c.to));
  return {
    stego: res.stego,
    distortion: distortionImage(img, res.dist),
    changed: res.changed,
    n: res.n,
    m: res.m,
    w: res.w,
    psnr: psnr(img, res.stego),
    meanDeltaE: des.length ? des.reduce((a, b) => a + b, 0) / des.length : 0,
    maxDeltaE: des.length ? Math.max(...des) : 0,
    bytes: new TextEncoder().encode(text).length,
  };
}

export interface ExtractTextResult {
  found: boolean;
  text: string;
  n: number;
}

export function extractText(img: PixelImage, key: string, h: number): ExtractTextResult {
  const EX = decodeBits(img, seedFromKey(key));
  const r = decodeMessage(EX, h);
  return { found: r !== null, text: r?.text ?? "", n: EX.length };
}
