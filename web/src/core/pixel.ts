/**
 * 画素の入れ物（読み書きの fast-png に依存しない部分。画面からはこちらを使う）。
 */
import type { Rgb } from "./color";

export interface PixelImage {
  width: number;
  height: number;
  /** 画素の色（左上から行ごと。0xRRGGBB） */
  data: Int32Array;
  /** アルファ（無ければ不透明） */
  alpha?: Uint8Array;
}

export function createImage(width: number, height: number): PixelImage {
  return { width, height, data: new Int32Array(width * height) };
}

export function cloneImage(img: PixelImage): PixelImage {
  return { width: img.width, height: img.height, data: img.data.slice(), alpha: img.alpha?.slice() };
}

/** 表示用の RGBA（canvas の ImageData にそのまま入れる） */
export function toRgba(img: PixelImage): Uint8ClampedArray<ArrayBuffer> {
  const n = img.width * img.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const c = img.data[i];
    out[i * 4] = (c >> 16) & 0xff;
    out[i * 4 + 1] = (c >> 8) & 0xff;
    out[i * 4 + 2] = c & 0xff;
    out[i * 4 + 3] = img.alpha ? img.alpha[i] : 255;
  }
  return out;
}

export function palette(img: PixelImage): Rgb[] {
  return [...new Set(img.data)].sort((a, b) => a - b);
}
