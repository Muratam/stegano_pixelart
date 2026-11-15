// 重い処理（画像の読み込み・埋め込み・取り出し）はここで行う（画面を止めないため）。
import { capacity, embedText, extractText, type EmbedTextOptions } from "./core/api";
import { decodeImage, encodeImagePng, palette, type PixelImage } from "./core/image";

export type WorkerRequest =
  | { type: "load"; bytes: Uint8Array }
  | { type: "capacity"; image: PixelImage; h: number }
  | { type: "embed"; image: PixelImage; text: string; options: EmbedTextOptions }
  | { type: "extract"; image: PixelImage; key: string; h: number };

function handle(req: WorkerRequest) {
  switch (req.type) {
    case "load": {
      const image = decodeImage(req.bytes);
      return { image, palette: palette(image) };
    }
    case "capacity":
      return capacity(req.image, req.h);
    case "embed": {
      const r = embedText(req.image, req.text, req.options);
      return { ...r, png: encodeImagePng(r.stego) };
    }
    case "extract":
      return extractText(req.image, req.key, req.h);
  }
}

// 型は DOM の lib だけで書く（WebWorker の lib と同時には読めないため）
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; req: WorkerRequest }>) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  const { id, req } = e.data;
  try {
    const result = handle(req);
    ctx.postMessage({ id, ok: true, result });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
