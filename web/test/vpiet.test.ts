/**
 * VPiet の照合。test/vpiet-golden/golden.json は元の vpiet（github.com/Muratam/vpiet、d3adcbb）を Nim 1.2.18 でビルドして
 * 作った記録（作り直しは tools/vpiet-golden/make.sh）。
 * - 元と同じ扱い（fixPush: false）では、Piet の色に寄せた元の画像・探索の結果（全部の画素）・色差の合計がビット単位で一致すること
 * - 直した扱い（既定）では、結果の画像を Piet として実行すると目的の文字列が出て終わること、変えた画素の数が元と同程度であること
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeImage } from "../src/core/image";
import { DISTANCE, toNearestPietColor } from "../src/vpiet/distance";
import { PietMachine } from "../src/vpiet/interpreter";
import { parsePasm, stringToPasm, formatPasm } from "../src/vpiet/pasm";
import { quasiStegano2D, DEFAULT_PARAMS } from "../src/vpiet/search";

interface Case {
  name: string;
  input: string;
  text: string;
  params: number[];
  orders: string[];
  base: number[][];
  result: number[][];
  changed: number;
  cost: number;
}
const dir = join(__dirname, "vpiet-golden");
const golden = JSON.parse(readFileSync(join(dir, "golden.json"), "utf8")) as {
  cases: Case[];
  failures: { name: string; input: string; text: string; params: number[]; orders: string[] }[];
  distance: number[][];
};
const load = (f: string) => decodeImage(new Uint8Array(readFileSync(join(dir, f))));
const toBase = (f: string) => {
  const img = load(f);
  return { img, base: Int8Array.from(img.data, (c) => toNearestPietColor(c)) };
};
const run = (w: number, h: number, colors: Int8Array) => {
  const m = new PietMachine({ width: w, height: h, colors });
  m.run(100000);
  return m;
};

describe("色差の表", () => {
  it("Nim の値と同じ", () => expect(DISTANCE).toEqual(golden.distance));
});

describe.each(golden.cases)("$name（$text）", (c) => {
  const { img, base } = toBase(c.input);
  const params = { maxFrontierNum: c.params[0], maxFundLevel: c.params[1], maxTrackBackOrderLen: c.params[2] };

  it("Piet の色に寄せた元の画像", () => {
    expect(Array.from(base)).toEqual(c.base.flat());
  });
  it("命令列（Web 版の文字列からの変換）", () => {
    if (c.name !== "apple_piet") expect(formatPasm(stringToPasm(c.text)).split("\n")).toEqual(c.orders);
  });
  it("元と同じ扱いで探索の結果がビット単位で一致", () => {
    const r = quasiStegano2D(base, img.width, img.height, parsePasm(c.orders.join("\n")), { ...params, fixPush: false, anyFundAtEnd: false });
    expect(Array.from(r.colors)).toEqual(c.result.flat());
    expect(r.cost).toBe(c.cost);
  });
  it("直した扱いで、実行すると文字列が出て終わる", () => {
    const r = quasiStegano2D(base, img.width, img.height, parsePasm(c.orders.join("\n")), { ...params, fixPush: true, anyFundAtEnd: true });
    const m = run(img.width, img.height, r.colors);
    expect(m.output).toBe(c.text);
    expect(m.finished).toBe(true);
    const changed = r.colors.reduce((s, v, i) => s + (v !== base[i] ? 1 : 0), 0);
    expect(changed).toBeLessThanOrEqual(Math.ceil(c.changed * 1.5) + 5);
  });
});

describe("元でも見つからない組み合わせ", () => {
  it.each(golden.failures)("$name（$text）は見つからないと返す", (f) => {
    const { img, base } = toBase(f.input);
    const params = { ...DEFAULT_PARAMS, maxFrontierNum: f.params[0], maxFundLevel: f.params[1], maxTrackBackOrderLen: f.params[2], fixPush: false, anyFundAtEnd: false };
    expect(() => quasiStegano2D(base, img.width, img.height, parsePasm(f.orders.join("\n")), params)).toThrow(/見つかりません/);
  });
});

describe("サンプルの画像", () => {
  it("public/samples/vpiet/heart_piet.png を実行すると Piet と出る", async () => {
    const { imageToProgram } = await import("../src/vpiet/api");
    const img = decodeImage(new Uint8Array(readFileSync(join(__dirname, "../public/samples/vpiet/heart_piet.png"))));
    const p = imageToProgram(img);
    expect(p.codel).toBe(1);
    expect(p.unknown).toBe(0);
    const m = run(p.program.width, p.program.height, p.program.colors);
    expect(m.output).toBe("Piet");
  });
  it("10 倍に拡大してもコーデルの大きさを推定して同じ出力", async () => {
    const { imageToProgram, pietToImage } = await import("../src/vpiet/api");
    const img = decodeImage(new Uint8Array(readFileSync(join(__dirname, "../public/samples/vpiet/heart_piet.png"))));
    const p1 = imageToProgram(img);
    const big = pietToImage(p1.program.colors, p1.program.width, p1.program.height, 10);
    const p = imageToProgram(big);
    expect(p.codel).toBe(10);
    expect(run(p.program.width, p.program.height, p.program.colors).output).toBe("Piet");
  });
});
