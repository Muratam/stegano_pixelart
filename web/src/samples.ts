// サンプルの画像（public/samples/）。mon_123.bmp は元のリポジトリの samples/ のもの、ほかは tools/golden/make_inputs.py で作ったもの
export interface Sample {
  file: string;
  label: string;
  /** 変えない色（mon_123 は元のプログラムと同じく輪郭の色） */
  wetColors?: number[];
  /** 埋め込み済みのサンプル（取り出しの画面用）の鍵とメッセージ */
  key?: string;
}

export const embedSamples: Sample[] = [
  { file: "mon_123.bmp", label: "モンスター（40×64）", wetColors: [0x181414] },
  { file: "landscape.png", label: "風景（40×40）" },
  { file: "shapes.png", label: "図形（48×48）" },
];

export const extractSamples: Sample[] = [{ file: "mon_123_stego.png", label: "埋め込み済みのモンスター（鍵 1234）", key: "1234" }];

export const sampleUrl = (file: string) => `${import.meta.env.BASE_URL}samples/${file}`;

// VPiet のサンプル（public/samples/vpiet/）。heart・house・tree は tools/vpiet-golden/make_inputs.py で作ったもの、
// apple・dosei は github.com/Muratam/vpiet の test/src/png のもの。heart_piet.png は heart.png に「Piet」を埋め込んだ結果
export const vpietEmbedSamples: Sample[] = [
  { file: "vpiet/heart.png", label: "ハート（16×16）" },
  { file: "vpiet/apple.png", label: "りんご（16×16）" },
  { file: "vpiet/dosei.png", label: "土星（16×16）" },
  { file: "vpiet/house.png", label: "家（20×20）" },
  { file: "vpiet/tree.png", label: "木（24×24）" },
];
export const vpietRunSamples: Sample[] = [{ file: "vpiet/heart_piet.png", label: "サンプル（Piet と出るハート）" }];
