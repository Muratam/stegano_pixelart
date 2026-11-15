/**
 * Web 版で足した部分（文字列の形式・鍵・画像の読み書き）の確認。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capacity, embedText, extractText } from "../src/core/api";
import { decodeImage, encodeImagePng, type PixelImage } from "../src/core/image";
import { crc16, decodeMessage, encodeMessage, maxColumns, seedFromKey } from "../src/core/message";
import { getBitMatrix } from "../src/core/stc";

const dir = join(__dirname, "golden");
const load = (f: string) => decodeImage(new Uint8Array(readFileSync(join(dir, f))));
const inputs = ["mon_123.bmp", "landscape.png", "shapes.png", "sprite_rgba.png"];

describe("鍵とメッセージの形式", () => {
  it("数字の鍵はそのままシード、空は 1234", () => {
    expect(seedFromKey("1234")).toBe(1234n);
    expect(seedFromKey("")).toBe(1234n);
    expect(seedFromKey(" 42 ")).toBe(42n);
    const s = seedFromKey("ひみつ");
    expect(s > 0n && s < 1n << 62n).toBe(true);
    expect(seedFromKey("ひみつ")).toBe(s);
    expect(seedFromKey("ひみつ2")).not.toBe(s);
  });
  it("CRC-16/CCITT-FALSE", () => {
    expect(crc16(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });
  it("w の上限の Ĥ が作れる", () => {
    for (let h = 6; h <= 12; h++) expect(getBitMatrix(maxColumns(h), h)).toHaveLength(maxColumns(h));
  });
  it("詰め物で w が上限以下になる", () => {
    const n = 5000;
    for (const h of [6, 8, 10]) {
      const M = encodeMessage("a", n, h);
      expect(Math.floor(n / M.length)).toBeLessThanOrEqual(maxColumns(h));
    }
  });
  it("長すぎるメッセージは断る", () => {
    expect(() => encodeMessage("x".repeat(20), 306, 10)).toThrow(/長すぎ/);
  });
  it("空のビット列からは何も出ない", () => {
    expect(decodeMessage(new Array(300).fill(0), 10)).toBeNull();
  });
});

describe.each(inputs)("%s で埋め込んで取り出す", (file) => {
  const img = load(file);
  const cap = capacity(img, 10);
  const texts = ["", "Hi", "ドット絵", "x".repeat(cap.bytes)];
  it.each(texts)("「%s」", (text) => {
    for (const [key, h] of [["1234", 10], ["ひみつ", 8], ["k", 6], ["99", 12]] as const) {
      if (new TextEncoder().encode(text).length > capacity(img, h).bytes) continue;
      const r = embedText(img, text, { key, h, wetColors: [] });
      // PNG に書いて読み直しても取り出せる
      const back = decodeImage(encodeImagePng(r.stego));
      expect(back.data).toEqual(r.stego.data);
      const out = extractText(back, key, h);
      expect(out.found).toBe(true);
      expect(out.text).toBe(text);
      // 変えた画素は 4 近傍のどれかの色になっている
      for (const c of r.changed) {
        const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => img.data[c.x + dx + (c.y + dy) * img.width]);
        expect(nb).toContain(c.to);
        expect(img.data[c.x + c.y * img.width]).toBe(c.from);
      }
      // 変えた画素の数は、ビット数の半分以下（STC の効率。1 ビットあたりの変更は 0.5 回未満）
      expect(r.changed.length).toBeLessThanOrEqual(r.m / 2);
    }
  });
  it("鍵が違うと取り出せない", () => {
    const secret = "secret".slice(0, cap.bytes);
    const r = embedText(img, secret, { key: "right", h: 10, wetColors: [] });
    expect(extractText(r.stego, "right", 10).text).toBe(secret);
    for (const k of ["wrong", "1234", "righ"]) {
      const out = extractText(r.stego, k, 10);
      expect(out.found && out.text === secret).toBe(false);
    }
  });
});

describe("アルファと BMP", () => {
  it("透過の PNG はアルファを保ったまま書き出す", () => {
    const img = load("sprite_rgba.png");
    expect(img.alpha).toBeDefined();
    const r = embedText(img, "hi", { key: "1", h: 10, wetColors: [] });
    const back = decodeImage(encodeImagePng(r.stego));
    expect(back.alpha).toBeDefined();
    for (let i = 0; i < img.data.length; i++) {
      // 変えていない画素のアルファは同じ
      if (img.data[i] === r.stego.data[i]) expect(back.alpha![i]).toBe(img.alpha![i]);
    }
  });
  it("24 ビットの BMP（上下が逆の行の並び）", () => {
    const src = load("landscape.png");
    const bmp = writeBmp24(src);
    const img = decodeImage(bmp);
    expect(img.data).toEqual(src.data);
  });
});

describe("大きめの画像", () => {
  it("128×128 を数秒で埋め込んで取り出す", () => {
    const img = synth(128, 128);
    const cap = capacity(img, 10);
    expect(cap.n).toBeGreaterThan(1000);
    const t = Date.now();
    const text = "大きめの画像のテスト".repeat(3);
    const r = embedText(img, text, { key: "big", h: 10, wetColors: [] });
    expect(extractText(r.stego, "big", 10).text).toBe(text);
    expect(Date.now() - t).toBeLessThan(20_000);
  });
});

function synth(w: number, h: number): PixelImage {
  const data = new Int32Array(w * h);
  const pal = [0x223344, 0xe0c060, 0xc04060, 0x60c0e0, 0x181414, 0xf0f0f0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.floor(Math.sin(x / 7) * 2 + Math.cos(y / 5) * 2 + ((x * y) % 7 === 0 ? 1 : 0));
      data[x + y * w] = pal[((v % pal.length) + pal.length) % pal.length];
    }
  return { width: w, height: h, data };
}

function writeBmp24(img: PixelImage): Uint8Array {
  const row = Math.ceil((img.width * 3) / 4) * 4;
  const size = 54 + row * img.height;
  const b = new Uint8Array(size);
  const dv = new DataView(b.buffer);
  b[0] = 0x42;
  b[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, img.width, true);
  dv.setInt32(22, img.height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const c = img.data[x + y * img.width];
      const p = 54 + (img.height - 1 - y) * row + x * 3;
      b[p] = c & 0xff;
      b[p + 1] = (c >> 8) & 0xff;
      b[p + 2] = (c >> 16) & 0xff;
    }
  return b;
}

describe("サンプルの画像", () => {
  it("public/samples/mon_123_stego.png から鍵 1234 で Hey が取り出せる", () => {
    const img = decodeImage(new Uint8Array(readFileSync(join(__dirname, "../public/samples/mon_123_stego.png"))));
    expect(extractText(img, "1234", 10)).toMatchObject({ found: true, text: "Hey" });
  });
});
