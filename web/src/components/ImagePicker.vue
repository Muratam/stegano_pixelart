<script setup lang="ts">
// 画像を選ぶ: ファイル（PNG・BMP）・ドラッグ＆ドロップ・サンプル。読み込みは Web Worker で行う。
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";
import { loadImage } from "../stegoClient";
import { sampleUrl, type Sample } from "../samples";
import type { PixelImage } from "../core/pixel";
import type { Rgb } from "../core/color";

export interface LoadedImage {
  image: PixelImage;
  palette: Rgb[];
  name: string;
  sample?: Sample;
}

defineProps<{ samples: Sample[] }>();
const emit = defineEmits<{ loaded: [LoadedImage] }>();

const input = ref<HTMLInputElement | null>(null);
const error = ref("");
const busy = ref(false);
const dragging = ref(false);

async function load(bytes: Uint8Array, name: string, sample?: Sample) {
  error.value = "";
  busy.value = true;
  try {
    const r = await loadImage(bytes);
    emit("loaded", { ...r, name, sample });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function onFile(file: File | undefined) {
  if (!file) return;
  await load(new Uint8Array(await file.arrayBuffer()), file.name);
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement;
  void onFile(el.files?.[0]);
  el.value = "";
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  void onFile(e.dataTransfer?.files?.[0]);
}

async function loadSample(s: Sample) {
  error.value = "";
  try {
    const res = await fetch(sampleUrl(s.file));
    if (!res.ok) throw new Error(`サンプルを読めません（${res.status}）`);
    await load(new Uint8Array(await res.arrayBuffer()), s.file, s);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div
    class="picker"
    :class="{ dragging }"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="row">
      <button
        type="button"
        class="btn"
        :disabled="busy"
        @click="input?.click()"
      >
        <AppIcon name="upload" />
        画像を選ぶ
      </button>
      <span class="quiet hint">PNG・BMP（ドロップでも可）</span>
      <input
        ref="input"
        type="file"
        accept=".png,.bmp,image/png,image/bmp"
        hidden
        @change="onChange"
      >
    </div>
    <div class="row samples">
      <span class="field-label">サンプル</span>
      <button
        v-for="s in samples"
        :key="s.file"
        type="button"
        class="chip-btn"
        :disabled="busy"
        @click="loadSample(s)"
      >
        {{ s.label }}
      </button>
    </div>
    <p
      v-if="error"
      class="error"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  gap: 10px;
  padding: 2px;
  border: 1px dashed transparent;
  border-radius: var(--radius-sm);
}
.picker.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.hint {
  font-size: 0.8rem;
}
.chip-btn {
  min-height: 34px;
  padding: 4px 10px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--ink-sub);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.chip-btn:hover {
  color: var(--ink);
  border-color: var(--ink-faint);
}
.error {
  padding: 8px 10px;
  background: var(--bad-soft);
  border-radius: var(--radius-sm);
  color: var(--bad);
  font-size: 0.86rem;
}
</style>
