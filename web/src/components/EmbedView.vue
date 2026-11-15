<script setup lang="ts">
// 埋め込みの画面: 画像 → メッセージと鍵 → 結果（比較の表示・PNG で保存）
import { computed, ref, shallowRef, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import ImagePicker, { type LoadedImage } from "./ImagePicker.vue";
import PixelCanvas from "./PixelCanvas.vue";
import { embed, getCapacity } from "../stegoClient";
import { embedSamples } from "../samples";
import { hexOf, type Rgb } from "../core/color";
import type { PixelImage } from "../core/pixel";
import type { Capacity, EmbedTextResult } from "../core/api";
import { DEFAULT_KEY } from "../core/message";

const emit = defineEmits<{ verify: [PixelImage, string, number, string] }>();

const loaded = shallowRef<LoadedImage | null>(null);
const cap = ref<Capacity | null>(null);
const text = ref("");
const key = ref(DEFAULT_KEY);
const h = ref(10);
const wet = ref<Set<Rgb>>(new Set());
const busy = ref(false);
const error = ref("");
const result = shallowRef<(EmbedTextResult & { png: Uint8Array }) | null>(null);
// 埋め込んだ後は結果の画像をそのまま出す（変えた画素の強調はしない）
type View = "stego" | "cover" | "cost";
const view = ref<View>("stego");
const views: { id: View; label: string }[] = [
  { id: "stego", label: "結果" },
  { id: "cover", label: "元の画像" },
  { id: "cost", label: "変えやすさ" },
];
const MAX_PALETTE_CHIPS = 64;

const bytes = computed(() => new TextEncoder().encode(text.value).length);
const tooLong = computed(() => cap.value !== null && bytes.value > cap.value.bytes);

function onLoaded(l: LoadedImage) {
  loaded.value = l;
  result.value = null;
  error.value = "";
  wet.value = new Set((l.sample?.wetColors ?? []).filter((c) => l.palette.includes(c)));
  if (l.sample && !text.value) text.value = "Hello!";
}

watch([loaded, h], async () => {
  cap.value = null;
  if (!loaded.value) return;
  try {
    cap.value = await getCapacity(loaded.value.image, h.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

function toggleWet(c: Rgb) {
  const s = new Set(wet.value);
  if (s.has(c)) s.delete(c);
  else s.add(c);
  wet.value = s;
}

async function run() {
  if (!loaded.value) return;
  error.value = "";
  busy.value = true;
  try {
    result.value = await embed(loaded.value.image, text.value, { key: key.value, h: h.value, wetColors: [...wet.value] });
    view.value = "stego";
  } catch (e) {
    result.value = null;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

const shown = computed<PixelImage | null>(() => {
  if (!loaded.value) return null;
  const r = result.value;
  if (!r) return loaded.value.image;
  if (view.value === "cover") return loaded.value.image;
  if (view.value === "cost") return r.distortion;
  return r.stego;
});

const downloadName = computed(() => (loaded.value?.name ?? "image").replace(/\.[^.]+$/, "") + "_stego.png");
function download() {
  if (!result.value) return;
  const blob = new Blob([result.value.png as Uint8Array<ArrayBuffer>], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadName.value;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function verify() {
  if (result.value) emit("verify", result.value.stego, key.value, h.value, downloadName.value);
}

const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "∞");
</script>

<template>
  <div class="layout">
    <section class="panel">
      <div class="panel-head">
        <h2>1. 画像</h2>
        <span
          v-if="loaded"
          class="quiet meta"
        >{{ loaded.name }} · {{ loaded.image.width }}×{{ loaded.image.height }} · {{ loaded.palette.length }} 色</span>
      </div>
      <ImagePicker
        :samples="embedSamples"
        @loaded="onLoaded"
      />
      <template v-if="loaded && shown">
        <PixelCanvas
          class="preview"
          :image="shown"
          :label="result ? views.find((v) => v.id === view)?.label ?? '' : '読み込んだ画像'"
        />
        <div
          v-if="result"
          class="seg"
          role="group"
          aria-label="表示"
        >
          <button
            v-for="v in views"
            :key="v.id"
            type="button"
            class="seg-btn"
            :aria-pressed="view === v.id"
            @click="view = v.id"
          >
            {{ v.label }}
          </button>
        </div>
        <p
          v-if="result && view === 'cost'"
          class="quiet note"
        >
          暗いほど変えても目立ちにくい画素（元のプログラムの distortion.png と同じ図）。白は変えられない画素と、変えない色に関わる画素。
        </p>
      </template>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>2. メッセージと鍵</h2>
        <span
          v-if="cap"
          class="quiet meta"
        >最大 {{ cap.bytes }} バイト</span>
      </div>
      <div class="form">
        <label class="field">
          <span class="field-label">メッセージ（UTF-8 で {{ bytes }}<template v-if="cap"> / {{ cap.bytes }}</template> バイト）</span>
          <textarea
            v-model="text"
            class="textarea"
            :class="{ invalid: tooLong }"
            rows="3"
            placeholder="埋め込む文字列"
          />
        </label>
        <label class="field">
          <span class="field-label">鍵（取り出すときに同じものが必要。数字だけなら乱数のシードそのもの。元のプログラムは 1234）</span>
          <input
            v-model="key"
            class="input"
            type="text"
            autocomplete="off"
            spellcheck="false"
          >
        </label>
        <details class="more">
          <summary>詳しい設定</summary>
          <div class="form">
            <label class="field">
              <span class="field-label">STC の h（大きいほど変える画素が少なく、計算が重い。取り出しでも同じ値が必要）</span>
              <select
                v-model.number="h"
                class="input"
              >
                <option
                  v-for="v in [6, 7, 8, 9, 10, 11, 12]"
                  :key="v"
                  :value="v"
                >
                  {{ v }}{{ v === 10 ? "（元のプログラムと同じ）" : "" }}
                </option>
              </select>
            </label>
            <div
              v-if="loaded"
              class="field"
            >
              <span class="field-label">変えない色（押して選ぶ。この色の画素は変えず、この色にも変えない）</span>
              <div
                v-if="loaded.palette.length <= MAX_PALETTE_CHIPS"
                class="palette"
              >
                <button
                  v-for="c in loaded.palette"
                  :key="c"
                  type="button"
                  class="swatch"
                  :aria-pressed="wet.has(c)"
                  :title="hexOf(c)"
                  :aria-label="`${hexOf(c)} を変えない`"
                  @click="toggleWet(c)"
                >
                  <span :style="{ background: hexOf(c) }" />
                </button>
              </div>
              <p
                v-else
                class="quiet note"
              >
                色が {{ loaded.palette.length }} 色あります（ドット絵向けの方法なので、色の少ない画像のほうが向いています）。
              </p>
            </div>
          </div>
        </details>
        <p
          v-if="cap && cap.n < 64"
          class="error"
        >
          この画像には埋め込める場所がほとんどありません（色の境界が少ないか、画像が小さすぎます）。
        </p>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!loaded || busy || tooLong"
            @click="run"
          >
            <AppIcon name="embed" />
            {{ busy ? "埋め込み中…" : "埋め込む" }}
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
    </section>

    <section
      v-if="result"
      class="panel"
    >
      <div class="panel-head">
        <h2>3. 結果</h2>
      </div>
      <dl class="stats">
        <div>
          <dt>変えた画素</dt>
          <dd>{{ result.changed.length }} <span class="quiet">/ 候補 {{ result.n }}</span></dd>
        </div>
        <div>
          <dt>埋め込んだビット</dt>
          <dd>{{ result.m }} <span class="quiet">（本文 {{ result.bytes }} バイト）</span></dd>
        </div>
        <div>
          <dt>色差 ΔE00</dt>
          <dd>平均 {{ fmt(result.meanDeltaE) }} <span class="quiet">/ 最大 {{ fmt(result.maxDeltaE) }}</span></dd>
        </div>
        <div>
          <dt>PSNR</dt>
          <dd>{{ fmt(result.psnr) }} dB</dd>
        </div>
      </dl>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          @click="download"
        >
          <AppIcon name="download" />
          PNG で保存
        </button>
        <button
          type="button"
          class="btn"
          @click="verify"
        >
          <AppIcon name="arrow" />
          取り出しで確認
        </button>
      </div>
      <p class="quiet note">
        画素の値が 1 つでも変わると取り出せません。PNG のまま渡してください（JPEG への変換・縮小・SNS の再圧縮で壊れます）。
      </p>
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
  .layout > .panel:first-child {
    grid-row: span 2;
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
.input:focus,
.textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.textarea {
  min-height: 72px;
  font-family: var(--font-sans);
}
.textarea.invalid {
  border-color: var(--bad);
}
.more summary {
  cursor: pointer;
  color: var(--ink-sub);
  font-size: 0.86rem;
}
.more[open] summary {
  margin-bottom: 10px;
}
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.swatch {
  display: inline-flex;
  width: 32px;
  height: 32px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.swatch span {
  flex: 1;
  border-radius: 3px;
}
.swatch[aria-pressed="true"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
  background-image: linear-gradient(135deg, transparent 45%, var(--accent) 45%, var(--accent) 55%, transparent 55%);
}
.swatch[aria-pressed="true"] span {
  opacity: 0.45;
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
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
}
.seg-btn {
  min-height: 34px;
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.seg-btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: rgba(71, 200, 230, 0.35);
  color: var(--accent);
}
.note {
  margin-top: 8px;
  font-size: 0.8rem;
}
.error {
  padding: 8px 10px;
  background: var(--bad-soft);
  border-radius: var(--radius-sm);
  color: var(--bad);
  font-size: 0.86rem;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 0 0 12px;
}
.stats div {
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.stats dt {
  font-size: 0.75rem;
  color: var(--ink-soft);
}
.stats dd {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}
</style>
