<script setup lang="ts">
// 取り出しの画面: 画像と鍵からメッセージを戻す
import { ref, shallowRef, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import ImagePicker, { type LoadedImage } from "./ImagePicker.vue";
import PixelCanvas from "./PixelCanvas.vue";
import { extract } from "../stegoClient";
import { extractSamples } from "../samples";
import type { ExtractTextResult } from "../core/api";
import type { PixelImage } from "../core/pixel";
import { DEFAULT_KEY } from "../core/message";

const props = defineProps<{ incoming: { image: PixelImage; key: string; h: number; name: string } | null }>();

const loaded = shallowRef<{ image: PixelImage; name: string } | null>(null);
const key = ref(DEFAULT_KEY);
const h = ref(10);
const busy = ref(false);
const error = ref("");
const result = ref<ExtractTextResult | null>(null);
// 別の画像を読んだらビューアを枠に合わせ直す
const loadCount = ref(0);

watch(
  () => props.incoming,
  (v) => {
    if (!v) return;
    loaded.value = { image: v.image, name: v.name };
    loadCount.value++;
    key.value = v.key;
    h.value = v.h;
    void run();
  },
  { immediate: true },
);

function onLoaded(l: LoadedImage) {
  loaded.value = { image: l.image, name: l.name };
  loadCount.value++;
  result.value = null;
  error.value = "";
  if (l.sample?.key) key.value = l.sample.key;
}

async function run() {
  if (!loaded.value) return;
  busy.value = true;
  error.value = "";
  try {
    result.value = await extract(loaded.value.image, key.value, h.value);
  } catch (e) {
    result.value = null;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="layout">
    <section class="panel">
      <div class="panel-head">
        <h2>1. 画像</h2>
        <span
          v-if="loaded"
          class="quiet meta"
        >{{ loaded.name }} · {{ loaded.image.width }}×{{ loaded.image.height }}</span>
      </div>
      <ImagePicker
        :samples="extractSamples"
        @loaded="onLoaded"
      />
      <PixelCanvas
        v-if="loaded"
        class="preview"
        :image="loaded.image"
        :reset-key="loadCount"
        label="取り出す画像"
      />
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>2. 鍵と取り出し</h2>
      </div>
      <div class="form">
        <label class="field">
          <span class="field-label">鍵（埋め込んだときと同じもの）</span>
          <input
            v-model="key"
            class="input"
            type="text"
            autocomplete="off"
            spellcheck="false"
          >
        </label>
        <label class="field">
          <span class="field-label">STC の h（埋め込んだときと同じ値。既定は 10）</span>
          <select
            v-model.number="h"
            class="input"
          >
            <option
              v-for="v in [6, 7, 8, 9, 10, 11, 12]"
              :key="v"
              :value="v"
            >
              {{ v }}
            </option>
          </select>
        </label>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!loaded || busy"
            @click="run"
          >
            <AppIcon name="extract" />
            {{ busy ? "取り出し中…" : "取り出す" }}
          </button>
        </div>
        <p
          v-if="error"
          class="error"
          role="alert"
        >
          {{ error }}
        </p>
        <template v-if="result">
          <label
            v-if="result.found"
            class="field"
          >
            <span class="field-label">取り出したメッセージ</span>
            <textarea
              class="textarea"
              readonly
              rows="3"
              :value="result.text"
            />
          </label>
          <p
            v-else
            class="error"
            role="status"
          >
            メッセージが見つかりませんでした。鍵か h が違うか、画像が変わっています（縮小・JPEG への変換など）。
          </p>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: start;
  }
}
.meta {
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.preview {
  margin-top: 12px;
}
.form {
  display: grid;
  gap: 12px;
}
.input {
  width: 100%;
  min-height: 40px;
  padding: 6px 10px;
  background: var(--bg-side);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}
.input:focus {
  outline: none;
  border-color: var(--accent);
}
.textarea {
  min-height: 72px;
  font-family: var(--font-sans);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error {
  padding: 8px 10px;
  background: var(--bad-soft);
  border-radius: var(--radius-sm);
  color: var(--bad);
  font-size: 0.86rem;
}
</style>
