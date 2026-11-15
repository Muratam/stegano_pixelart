// VPiet の探索を Web Worker で動かす。cancel() で worker ごと止める。
import type { PixelImage } from "./core/pixel";
import type { VpietEmbedResult, VpietProgress } from "./vpiet/api";
import type { SearchParams } from "./vpiet/search";

export interface VpietJob {
  promise: Promise<VpietEmbedResult>;
  cancel: () => void;
}

export function startVpiet(image: PixelImage, text: string, params: SearchParams, onProgress: (p: VpietProgress) => void): VpietJob {
  const worker = new Worker(new URL("./vpietWorker.ts", import.meta.url), { type: "module" });
  let settle: { resolve: (v: VpietEmbedResult) => void; reject: (e: Error) => void } | null = null;
  const promise = new Promise<VpietEmbedResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = () => worker.terminate();
  worker.onmessage = (e: MessageEvent<{ type: string; progress?: VpietProgress; result?: VpietEmbedResult; error?: string }>) => {
    if (e.data.type === "progress" && e.data.progress) onProgress(e.data.progress);
    else if (e.data.type === "done" && e.data.result) {
      finish();
      settle?.resolve(e.data.result);
    } else if (e.data.type === "error") {
      finish();
      settle?.reject(new Error(e.data.error));
    }
  };
  worker.onerror = (e) => {
    finish();
    settle?.reject(new Error(e.message || "探索に失敗しました"));
  };
  worker.postMessage({ image, text, params });
  return {
    promise,
    cancel: () => {
      finish();
      settle?.reject(new Error("中止しました"));
    },
  };
}
