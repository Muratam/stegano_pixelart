/**
 * 元の Nim のプログラム（Nim 1.2.18 でビルド）の記録 test/golden/golden.json と照合する。
 * 作り直しは tools/golden/make.sh（リポジトリの直下から）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NimRand } from "../src/core/rand";
import { KEY_OF_W } from "../src/core/crmi";
import { decodeImage, type PixelImage } from "../src/core/image";
import { decodeBits, distortionScoreMap, embedBits, psnr } from "../src/core/stego";
import { getBitMatrix, stcExtract } from "../src/core/stc";

interface GoldenCase {
  name: string;
  input: string;
  width: number;
  height: number;
  seed: number;
  h: number;
  wetColors: number[][];
  message: string;
  n: number;
  w: number;
  hhat: number[];
  representative: string;
  distortion: [number, string][][];
  S: [number, number, number, number, string][];
  SX: string;
  EX: string;
  decodedEX: string;
  changedPixels: number;
  psnr: string;
  stego: string;
  stegoRGB: string;
}
interface Golden {
  nim: string;
  keyOfW: number[];
  rand1234next: string[];
  rand1234bits: number[];
  rand1h10: number[];
  cases: GoldenCase[];
}

const dir = join(__dirname, "golden");
const golden: Golden = JSON.parse(readFileSync(join(dir, "golden.json"), "utf8"));
const load = (f: string) => decodeImage(new Uint8Array(readFileSync(join(dir, f))));
const bits = (s: string) => [...s].map(Number);
const fromHex = (s: string) => {
  const b = new DataView(new ArrayBuffer(8));
  b.setBigUint64(0, BigInt("0x" + s));
  return b.getFloat64(0);
};
const rgbHex = (img: PixelImage) => Array.from(img.data, (c) => c.toString(16).toUpperCase().padStart(6, "0")).join("");
const rgbHexOf = (data: ArrayLike<number>) => Array.from(data, (c) => c.toString(16).toUpperCase().padStart(6, "0")).join("");

describe("乱数と定数（Nim 1.2.18）", () => {
  it("Nim の版", () => expect(golden.nim).toBe("1.2.18"));
  it("initRand(1234).next()", () => {
    const r = new NimRand(1234);
    expect(golden.rand1234next.map(() => r.next().toString())).toEqual(golden.rand1234next);
  });
  it("initRand(1234).rand(0..1)", () => {
    const r = new NimRand(1234);
    expect(golden.rand1234bits.map(() => r.rand(1))).toEqual(golden.rand1234bits);
  });
  it("initRand(1).rand(0..<1024)", () => {
    const r = new NimRand(1);
    expect(golden.rand1h10.map(() => r.rand(1023))).toEqual(golden.rand1h10);
  });
  it("crmi の重みを足す順", () => expect(KEY_OF_W).toEqual(golden.keyOfW));
});

describe.each(golden.cases)("$name", (c) => {
  const img = load(c.input);
  const M = bits(c.message);
  const wet = c.wetColors.map(([r, g, b]) => (r << 16) | (g << 8) | b);
  const opt = { seed: c.seed, h: c.h, wetColors: wet };
  const res = embedBits(img, M, opt);

  it("入力の大きさ", () => {
    expect([img.width, img.height]).toEqual([c.width, c.height]);
  });
  it("代表色", () => {
    expect(rgbHexOf(res.dist.represent)).toBe(c.representative);
  });
  // コスト（歪み）は CIEDE2000 の cbrt・atan2・sin・cos・exp・pow を通るので、libm（元は glibc、ここは V8）の違いで
  // 下位の数ビットが変わる。値は相対誤差 1e-12 以内で一致すること、選ばれる画素・色・ビットと結果の画像は完全に一致することを確かめる。
  it("歪み（コスト）が相対誤差 1e-12 以内で一致（色の候補は完全に一致）", () => {
    const dist = distortionScoreMap(img, wet);
    expect(dist.candidates.map((cell) => cell.map((d) => d.color))).toEqual(c.distortion.map((cell) => cell.map((d) => d[0])));
    let maxRel = 0;
    dist.candidates.forEach((cell, i) =>
      cell.forEach((d, j) => {
        const g = fromHex(c.distortion[i][j][1]);
        if (g === 0) expect(d.distortion).toBe(0);
        else maxRel = Math.max(maxRel, Math.abs(d.distortion - g) / Math.abs(g));
      }),
    );
    expect(maxRel).toBeLessThan(1e-12);
  });
  it("STC の小行列", () => {
    expect(getBitMatrix(c.w, c.h)).toEqual(c.hhat);
  });
  it("並べ替えた後の候補（位置・色・ビット・コスト）", () => {
    expect(res.n).toBe(c.n);
    expect(res.w).toBe(c.w);
    expect(res.slots.map((s) => [s.x, s.y, s.color, s.bit])).toEqual(c.S.map((s) => s.slice(0, 4)));
    res.slots.forEach((s, i) => {
      const g = fromHex(c.S[i][4]);
      expect(Math.abs(s.distortion - g)).toBeLessThanOrEqual(Math.abs(g) * 1e-12);
    });
    expect(res.SX.join("")).toBe(c.SX);
  });
  it("STC の埋め込みの結果", () => {
    expect(res.EX.join("")).toBe(c.EX);
    expect(res.changed.length).toBe(c.changedPixels);
  });
  it("ステゴ画像が画素単位で一致（記録の RGB と PNG の両方）", () => {
    expect(rgbHex(res.stego)).toBe(c.stegoRGB);
    expect(rgbHex(load(c.stego))).toBe(c.stegoRGB);
  });
  it("PSNR", () => {
    expect(psnr(img, res.stego)).toBe(fromHex(c.psnr));
  });
  it("取り出し（元のステゴ画像から）", () => {
    const EX2 = decodeBits(load(c.stego), c.seed);
    expect(EX2.join("")).toBe(c.decodedEX);
    expect(stcExtract(EX2, M.length, c.h)).toEqual(M);
  });
});
