// Web Worker（src/worker.ts）を Promise で呼ぶ。
import type { Capacity, EmbedTextOptions, EmbedTextResult, ExtractTextResult } from "./core/api";
import type { Rgb } from "./core/color";
import type { PixelImage } from "./core/pixel";
import type { WorkerRequest } from "./worker";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "処理に失敗しました"));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function call<T>(req: WorkerRequest): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, req });
  });
}

export const loadImage = (bytes: Uint8Array) => call<{ image: PixelImage; palette: Rgb[] }>({ type: "load", bytes });
export const getCapacity = (image: PixelImage, h: number) => call<Capacity>({ type: "capacity", image, h });
export const embed = (image: PixelImage, text: string, options: EmbedTextOptions) =>
  call<EmbedTextResult & { png: Uint8Array }>({ type: "embed", image, text, options });
export const extract = (image: PixelImage, key: string, h: number) => call<ExtractTextResult>({ type: "extract", image, key, h });
