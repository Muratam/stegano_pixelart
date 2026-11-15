/**
 * VPiet の画面から使う入口（画像 ↔ Piet の色、埋め込み、実行の準備）。
 */
import type { PixelImage } from "../core/pixel";
import { toNearestPietColor } from "./distance";
import { PietMachine, type Program } from "./interpreter";
import { pasmCost, stringToPasm, type PasmOrder } from "./pasm";
import { exactPietColor, pietRgb, WHITE } from "./piet";
import { quasiStegano2D, type SearchParams, type SearchProgress } from "./search";

/** 探索に使える画像の大きさの上限（縦横） */
export const VPIET_MAX_SIDE = 48;

/** 画像を Piet の 20 色に寄せる（いちばん近い色） */
export function toPietBase(img: PixelImage): Int8Array {
  return Int8Array.from(img.data, (c) => toNearestPietColor(c));
}

export function pietToImage(colors: ArrayLike<number>, width: number, height: number, codel = 1): PixelImage {
  const w = width * codel;
  const h = height * codel;
  const data = new Int32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = colors[Math.floor(x / codel) + Math.floor(y / codel) * width];
      data[x + y * w] = pietRgb(c < 0 ? WHITE : c);
    }
  return { width: w, height: h, data };
}

export interface VpietEmbedResult {
  colors: Int8Array;
  base: Int8Array;
  width: number;
  height: number;
  orders: number;
  changed: number;
  cost: number;
  iterations: number;
  output: string;
  ok: boolean;
  /** 見つかったときの探索の幅 */
  searchWidth: number;
}

/** 見つからなかったときに試し直す探索の幅（指定の幅の後に、まだ試していないものを順に） */
export const RETRY_WIDTHS = [300, 50, 720];

export interface VpietProgress extends SearchProgress {
  /** 何回目の試行か（1 から）と、その探索の幅 */
  attempt: number;
  width: number;
}

export function embedVpiet(img: PixelImage, text: string, params: SearchParams, onProgress?: (p: VpietProgress) => boolean | void, retry = true): VpietEmbedResult {
  if (!text) throw new Error("文字列を入れてください");
  if (img.width > VPIET_MAX_SIDE || img.height > VPIET_MAX_SIDE) throw new Error(`画像が大きすぎます（VPiet は縦横 ${VPIET_MAX_SIDE}px まで）`);
  if (img.width * img.height < 16) throw new Error("画像が小さすぎます");
  const base = toPietBase(img);
  const orders = stringToPasm(text);
  // 探索は幅によって見つかったり見つからなかったりする（終了の形が作れないなど）。見つからなければ幅を変えて試し直す
  const widths = [params.maxFrontierNum, ...(retry ? RETRY_WIDTHS.filter((w) => w !== params.maxFrontierNum) : [])];
  let r: ReturnType<typeof quasiStegano2D> | null = null;
  let usedWidth = widths[0];
  let lastError: unknown = null;
  for (let i = 0; i < widths.length && !r; i++) {
    usedWidth = widths[i];
    try {
      r = quasiStegano2D(base, img.width, img.height, orders, { ...params, maxFrontierNum: usedWidth }, (p) =>
        onProgress?.({ ...p, attempt: i + 1, width: usedWidth }),
      );
    } catch (e) {
      if (!(e instanceof Error) || !/見つかりません/.test(e.message)) throw e;
      lastError = e;
    }
  }
  if (!r) throw lastError;
  // 実行して確かめる
  const m = new PietMachine({ width: img.width, height: img.height, colors: r.colors });
  m.run(200000);
  let changed = 0;
  for (let i = 0; i < base.length; i++) if (r.colors[i] !== base[i]) changed++;
  return {
    colors: r.colors,
    base,
    width: img.width,
    height: img.height,
    orders: orders.length,
    changed,
    cost: r.cost,
    iterations: r.iterations,
    output: m.output,
    ok: m.finished && m.output === text,
    searchWidth: usedWidth,
  };
}

export function planOrders(text: string): { orders: PasmOrder[]; cost: number } {
  const orders = stringToPasm(text);
  return { orders, cost: pasmCost(orders) };
}

/**
 * 画像 → Piet のプログラム。codel が 0 なら、同じ色の並びの長さの最大公約数から推定する。
 * Piet の 20 色でない色は白として扱い、その数を返す。
 */
export function imageToProgram(img: PixelImage, codel = 0): { program: Program; codel: number; unknown: number } {
  const size = codel > 0 ? codel : guessCodelSize(img);
  const w = Math.floor(img.width / size);
  const h = Math.floor(img.height / size);
  const colors = new Int8Array(w * h);
  let unknown = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = exactPietColor(img.data[x * size + y * size * img.width]);
      if (c < 0) unknown++;
      colors[x + y * w] = c < 0 ? WHITE : c;
    }
  return { program: { width: w, height: h, colors }, codel: size, unknown };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function guessCodelSize(img: PixelImage): number {
  let g = 0;
  const { width: w, height: h, data } = img;
  for (let y = 0; y < h; y++) {
    let run = 1;
    for (let x = 1; x <= w; x++) {
      if (x < w && data[x + y * w] === data[x - 1 + y * w]) run++;
      else {
        g = gcd(g, run);
        run = 1;
      }
      if (g === 1) return 1;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 1;
    for (let y = 1; y <= h; y++) {
      if (y < h && data[x + y * w] === data[x + (y - 1) * w]) run++;
      else {
        g = gcd(g, run);
        run = 1;
      }
      if (g === 1) return 1;
    }
  }
  g = gcd(gcd(g, w), h);
  return Math.max(1, g);
}

export { PietMachine };
