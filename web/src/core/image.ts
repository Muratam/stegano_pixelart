/**
 * 画像の読み書き（PNG・BMP）。ブラウザの canvas を通さずに自前で読む（色の管理や乗算済みアルファで画素の値が変わらないように）。
 * 色は 0xRRGGBB の整数。アルファは別に持ち、埋め込みには使わない（元のプログラムと同じく RGB だけを見る）。
 */
import { decode as decodePng, encode as encodePng } from "fast-png";
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

export const MAX_SIDE = 1024;

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}
export function isBmp(bytes: Uint8Array): boolean {
  return bytes.length > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d;
}

export function decodeImage(bytes: Uint8Array): PixelImage {
  const img = isPng(bytes) ? readPng(bytes) : isBmp(bytes) ? readBmp(bytes) : null;
  if (!img) throw new Error("PNG か BMP の画像を選んでください");
  if (img.width > MAX_SIDE || img.height > MAX_SIDE) throw new Error(`画像が大きすぎます（縦横 ${MAX_SIDE}px まで）`);
  return img;
}

function readPng(bytes: Uint8Array): PixelImage {
  const png = decodePng(bytes);
  const { width, height } = png;
  const n = width * height;
  const out = createImage(width, height);
  // 16 ビットは上位 8 ビット（stb_image と同じ）
  const v8 = (v: number) => (png.depth === 16 ? v >> 8 : v);
  if (png.palette) {
    const bits = png.depth;
    const rowBytes = Math.ceil((width * bits) / 8);
    const src = png.data as Uint8Array;
    const trns = png.transparency;
    let hasAlpha = false;
    const alpha = new Uint8Array(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let idx: number;
        if (bits === 8) idx = src[y * rowBytes + x];
        else {
          const bit = x * bits;
          idx = (src[y * rowBytes + (bit >> 3)] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
        }
        const c = png.palette[idx] ?? [0, 0, 0];
        out.data[y * width + x] = (c[0] << 16) | (c[1] << 8) | c[2];
        const a = c.length > 3 ? c[3] : trns && idx < trns.length ? trns[idx] : 255;
        alpha[y * width + x] = a;
        if (a !== 255) hasAlpha = true;
      }
    }
    if (hasAlpha) out.alpha = alpha;
    return out;
  }
  const ch = png.channels;
  const d = png.data;
  if (png.depth < 8) {
    // 1・2・4 ビットのグレー
    const bits = png.depth;
    const rowBytes = Math.ceil((width * bits) / 8);
    const scale = 255 / ((1 << bits) - 1);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const bit = x * bits;
        const g = Math.round((((d[y * rowBytes + (bit >> 3)] >> (8 - bits - (bit & 7))) & ((1 << bits) - 1)) * scale));
        out.data[y * width + x] = (g << 16) | (g << 8) | g;
      }
    return out;
  }
  const alpha = new Uint8Array(n);
  let hasAlpha = false;
  for (let i = 0; i < n; i++) {
    let r: number, g: number, b: number, a = 255;
    if (ch >= 3) {
      r = v8(d[i * ch]);
      g = v8(d[i * ch + 1]);
      b = v8(d[i * ch + 2]);
      if (ch === 4) a = v8(d[i * ch + 3]);
    } else {
      r = g = b = v8(d[i * ch]);
      if (ch === 2) a = v8(d[i * ch + 1]);
    }
    out.data[i] = (r << 16) | (g << 8) | b;
    alpha[i] = a;
    if (a !== 255) hasAlpha = true;
  }
  if (hasAlpha) out.alpha = alpha;
  return out;
}

function readBmp(bytes: Uint8Array): PixelImage {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = dv.getUint32(10, true);
  const headerSize = dv.getUint32(14, true);
  if (headerSize < 40) throw new Error("この BMP の形式（OS/2 など）は読めません");
  const width = dv.getInt32(18, true);
  const rawH = dv.getInt32(22, true);
  const bpp = dv.getUint16(28, true);
  const compression = dv.getUint32(30, true);
  const topDown = rawH < 0;
  const height = Math.abs(rawH);
  if (width <= 0 || height <= 0) throw new Error("BMP の大きさが読めません");
  if (width > MAX_SIDE || height > MAX_SIDE) throw new Error(`画像が大きすぎます（縦横 ${MAX_SIDE}px まで）`);
  if (!(compression === 0 || (compression === 3 && (bpp === 32 || bpp === 16)))) throw new Error("圧縮された BMP は読めません");
  const out = createImage(width, height);
  const rowBytes = Math.ceil((width * bpp) / 32) * 4;
  let palette: number[] = [];
  if (bpp <= 8) {
    let colors = dv.getUint32(46, true);
    if (colors === 0) colors = 1 << bpp;
    const pOff = 14 + headerSize;
    palette = Array.from({ length: colors }, (_, i) => {
      const p = pOff + i * 4;
      return (bytes[p + 2] << 16) | (bytes[p + 1] << 8) | bytes[p];
    });
  }
  // ビットフィールド（16・32 ビット）
  let masks = bpp === 16 ? [0x7c00, 0x03e0, 0x001f, 0] : [0xff0000, 0xff00, 0xff, 0];
  if (compression === 3) {
    const mo = headerSize >= 52 ? 54 : 14 + headerSize;
    masks = [dv.getUint32(mo, true), dv.getUint32(mo + 4, true), dv.getUint32(mo + 8, true), headerSize >= 56 ? dv.getUint32(mo + 12, true) : 0];
  }
  const field = (v: number, mask: number) => {
    if (!mask) return 255;
    let shift = 0;
    while (((mask >>> shift) & 1) === 0) shift++;
    const max = mask >>> shift;
    return Math.round((((v & mask) >>> shift) * 255) / max);
  };
  const alpha = new Uint8Array(width * height);
  let hasAlpha = false;
  for (let y = 0; y < height; y++) {
    const row = offset + (topDown ? y : height - 1 - y) * rowBytes;
    if (row + Math.ceil((width * bpp) / 8) > bytes.length) throw new Error("BMP が途中で切れています");
    for (let x = 0; x < width; x++) {
      let c: Rgb;
      let a = 255;
      if (bpp <= 8) {
        const bit = x * bpp;
        const idx = (bytes[row + (bit >> 3)] >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        c = palette[idx] ?? 0;
      } else if (bpp === 24) {
        const p = row + x * 3;
        c = (bytes[p + 2] << 16) | (bytes[p + 1] << 8) | bytes[p];
      } else if (bpp === 32) {
        const v = dv.getUint32(row + x * 4, true);
        c = (field(v, masks[0]) << 16) | (field(v, masks[1]) << 8) | field(v, masks[2]);
        if (masks[3]) a = field(v, masks[3]);
      } else if (bpp === 16) {
        const v = dv.getUint16(row + x * 2, true);
        c = (field(v, masks[0]) << 16) | (field(v, masks[1]) << 8) | field(v, masks[2]);
      } else throw new Error(`${bpp} ビットの BMP は読めません`);
      out.data[y * width + x] = c;
      alpha[y * width + x] = a;
      if (a !== 255) hasAlpha = true;
    }
  }
  if (hasAlpha) out.alpha = alpha;
  return out;
}

/** PNG に書き出す（アルファがあれば RGBA、無ければ RGB。8 ビット） */
export function encodeImagePng(img: PixelImage): Uint8Array {
  const n = img.width * img.height;
  const ch = img.alpha ? 4 : 3;
  const data = new Uint8Array(n * ch);
  for (let i = 0; i < n; i++) {
    const c = img.data[i];
    data[i * ch] = (c >> 16) & 0xff;
    data[i * ch + 1] = (c >> 8) & 0xff;
    data[i * ch + 2] = c & 0xff;
    if (img.alpha) data[i * ch + 3] = img.alpha[i];
  }
  return encodePng({ width: img.width, height: img.height, data, depth: 8, channels: ch });
}

/** 表示用の RGBA（canvas の ImageData にそのまま入れる） */
export function toRgba(img: PixelImage): Uint8ClampedArray {
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
