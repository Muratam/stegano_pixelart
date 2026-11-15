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
