// VPiet の探索（重い）を行う Web Worker。進み具合を送り、中止は呼ぶ側が worker を terminate する。
import { embedVpiet } from "./vpiet/api";
import type { PixelImage } from "./core/pixel";
import type { SearchParams } from "./vpiet/search";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ image: PixelImage; text: string; params: SearchParams }>) => void) | null;
  postMessage(message: unknown): void;
};

ctx.onmessage = (e) => {
  const { image, text, params } = e.data;
  try {
    let last = 0;
    const result = embedVpiet(image, text, params, (p) => {
      const now = Date.now();
      if (now - last > 100) {
        last = now;
        ctx.postMessage({ type: "progress", progress: p });
      }
    });
    ctx.postMessage({ type: "done", result });
  } catch (err) {
    ctx.postMessage({ type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
