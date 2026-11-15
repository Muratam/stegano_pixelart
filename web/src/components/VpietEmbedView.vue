<script setup lang="ts">
// VPiet の埋め込み: ドット絵と文字列から、実行するとその文字列を出す Piet の画像を作る（探索は Web Worker）
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import AppIcon from "./AppIcon.vue";
import ImagePicker, { type LoadedImage } from "./ImagePicker.vue";
import PixelCanvas from "./PixelCanvas.vue";
import { vpietEmbedSamples } from "../samples";
import { encodeImagePng } from "../core/image";
import type { PixelImage } from "../core/pixel";
import { pietToImage, planOrders, toPietBase, VPIET_MAX_SIDE, type VpietEmbedResult, type VpietProgress } from "../vpiet/api";
import { formatPasm } from "../vpiet/pasm";
import { DEFAULT_PARAMS } from "../vpiet/search";
import { startVpiet, type VpietJob } from "../vpietClient";

const emit = defineEmits<{ run: [PixelImage, string] }>();

const loaded = shallowRef<LoadedImage | null>(null);
const text = ref("Hi");
const width = ref(100);
const widths = [
  { v: 50, label: "50（速い）" },
  { v: 100, label: "100（標準）" },
  { v: 300, label: "300（丁寧）" },
  { v: 720, label: "720（元の vpiet の既定。遅い）" },
];
const busy = ref(false);
const error = ref("");
const progress = ref<VpietProgress | null>(null);
const elapsed = ref(0);
const result = shallowRef<VpietEmbedResult | null>(null);
let job: VpietJob | null = null;
let timer = 0;

type View = "result" | "base" | "cover";
const view = ref<View>("result");
const views: { id: View; label: string }[] = [
  { id: "result", label: "結果" },
  { id: "base", label: "Piet の色に寄せた元" },
  { id: "cover", label: "元の画像" },
];

const tooLarge = computed(() => !!loaded.value && (loaded.value.image.width > VPIET_MAX_SIDE || loaded.value.image.height > VPIET_MAX_SIDE));
const plan = computed(() => {
  try {
    return text.value ? planOrders(text.value) : null;
  } catch {
    return null;
  }
});
const pasmText = computed(() => (plan.value ? formatPasm(plan.value.orders) : ""));

function onLoaded(l: LoadedImage) {
  loaded.value = l;
  result.value = null;
  error.value = "";
}

const baseImage = computed(() => {
  const l = loaded.value;
  if (!l) return null;
  return pietToImage(toPietBase(l.image), l.image.width, l.image.height);
});
const resultImage = computed(() => {
  const r = result.value;
  return r ? pietToImage(r.colors, r.width, r.height) : null;
});
const shown = computed<PixelImage | null>(() => {
  if (!loaded.value) return null;
  if (!result.value) return loaded.value.image;
  if (view.value === "base") return baseImage.value;
  if (view.value === "cover") return loaded.value.image;
  return resultImage.value;
});

async function run() {
  if (!loaded.value || busy.value) return;
  error.value = "";
  result.value = null;
  progress.value = null;
  busy.value = true;
  const start = Date.now();
  elapsed.value = 0;
  timer = window.setInterval(() => (elapsed.value = (Date.now() - start) / 1000), 200);
  job = startVpiet(loaded.value.image, text.value, { ...DEFAULT_PARAMS, maxFrontierNum: width.value }, (p) => (progress.value = p));
  try {
    result.value = await job.promise;
    view.value = "result";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    window.clearInterval(timer);
    elapsed.value = (Date.now() - start) / 1000;
    busy.value = false;
    job = null;
  }
}
function cancel() {
  job?.cancel();
}
onBeforeUnmount(() => {
  job?.cancel();
  window.clearInterval(timer);
});

const percent = computed(() => {
  const p = progress.value;
  return p ? Math.round((100 * p.reached) / Math.max(1, p.orders)) : 0;
});

const baseName = computed(() => (loaded.value?.name ?? "image").replace(/^.*\//, "").replace(/\.[^.]+$/, ""));
function download(codel: number) {
  const r = result.value;
  if (!r) return;
  const png = encodeImagePng(pietToImage(r.colors, r.width, r.height, codel));
  const url = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName.value}_piet${codel > 1 ? `_x${codel}` : ""}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toRun() {
  if (resultImage.value) emit("run", resultImage.value, `${baseName.value}_piet.png`);
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
        >{{ loaded.name.replace(/^.*\//, "") }} · {{ loaded.image.width }}×{{ loaded.image.height }}</span>
      </div>
      <ImagePicker
        :samples="vpietEmbedSamples"
        @loaded="onLoaded"
      />
      <p class="quiet note">
        小さいドット絵向けです（縦横 {{ VPIET_MAX_SIDE }}px まで。16×16 で数秒〜数十秒）。色は Piet の 20 色に寄せます。
      </p>
      <p
        v-if="tooLarge"
        class="error"
      >
        画像が大きすぎます（縦横 {{ VPIET_MAX_SIDE }}px まで）。
      </p>
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
      </template>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>2. 出力する文字列</h2>
        <span
          v-if="plan"
          class="quiet meta"
        >命令 {{ plan.orders.length }} 個</span>
      </div>
      <div class="form">
        <label class="field">
          <span class="field-label">文字列（実行するとこれが出る。短いほど速く、元の絵に近くなる）</span>
          <input
            v-model="text"
            data-testid="vpiet-text"
            class="input"
            type="text"
            autocomplete="off"
            spellcheck="false"
          >
        </label>
        <details class="more">
          <summary>命令列（PASM）と探索の設定</summary>
          <div class="form">
            <pre class="code-block pasm">{{ pasmText }}</pre>
            <label class="field">
              <span class="field-label">探索の幅（残す候補の数。大きいほど元の絵に近くなりやすいが遅い。見つからなければほかの幅で自動で試し直す）</span>
              <select
                v-model.number="width"
                class="input"
              >
                <option
                  v-for="o in widths"
                  :key="o.v"
                  :value="o.v"
                >
                  {{ o.label }}
                </option>
              </select>
            </label>
          </div>
        </details>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="vpiet-run"
            :disabled="!loaded || busy || !text || tooLarge"
            @click="run"
          >
            <AppIcon name="embed" />
            {{ busy ? "探索中…" : "Piet の画像を作る" }}
          </button>
          <button
            v-if="busy"
            type="button"
            class="btn"
            @click="cancel"
          >
            中止
          </button>
        </div>
        <div
          v-if="busy"
          class="progress"
          role="status"
        >
          <div class="bar-track">
            <div
              class="bar-fill"
              :style="{ width: `${percent}%` }"
            />
          </div>
          <span class="quiet">命令 {{ progress?.reached ?? 0 }} / {{ progress?.orders ?? plan?.orders.length ?? 0 }} · 反復 {{ progress?.iteration ?? 0 }} · {{ elapsed.toFixed(1) }} 秒<template v-if="progress && progress.attempt > 1"> · 見つからなかったので幅 {{ progress.width }} で試し直し中</template></span>
        </div>
        <p
          v-if="error"
          class="error"
          role="alert"
        >
          {{ error }}<template v-if="/見つかりません/.test(error)">
            文字列を短くするか、探索の幅を大きくするか、別の画像で試してください。
          </template>
        </p>
      </div>
    </section>

    <section
      v-if="result"
      class="panel"
      data-testid="vpiet-result"
    >
      <div class="panel-head">
        <h2>3. 結果</h2>
      </div>
      <dl class="stats">
        <div>
          <dt>変えたコーデル</dt>
          <dd>{{ result.changed }} <span class="quiet">/ {{ result.width * result.height }}</span></dd>
        </div>
        <div>
          <dt>色差の合計 ΔE00</dt>
          <dd>{{ (result.cost / 100).toFixed(1) }}</dd>
        </div>
        <div>
          <dt>探索</dt>
          <dd>{{ elapsed.toFixed(1) }} 秒 <span class="quiet">/ 幅 {{ result.searchWidth }} · 反復 {{ result.iterations }}</span></dd>
        </div>
      </dl>
      <p
        class="check"
        :class="{ ok: result.ok }"
        data-testid="vpiet-check"
      >
        {{ result.ok ? `実行すると「${result.output}」と出て終わることを確認しました` : `実行の確認に失敗しました（出力: ${JSON.stringify(result.output)}）` }}
      </p>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          @click="download(1)"
        >
          <AppIcon name="download" />
          PNG で保存
        </button>
        <button
          type="button"
          class="btn"
          @click="download(10)"
        >
          <AppIcon name="download" />
          10 倍で保存
        </button>
        <button
          type="button"
          class="btn"
          data-testid="vpiet-to-run"
          @click="toRun"
        >
          <AppIcon name="arrow" />
          実行してみる
        </button>
      </div>
      <p class="quiet note">
        1 倍の PNG はコーデルの大きさ 1、10 倍の PNG はコーデルの大きさ 10 です（npiet などでは -cs 10 を付けて実行）。
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
.input:focus {
  outline: none;
  border-color: var(--accent);
}
.more summary {
  cursor: pointer;
  color: var(--ink-sub);
  font-size: 0.86rem;
}
.more[open] summary {
  margin-bottom: 10px;
}
.pasm {
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
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
.progress {
  display: grid;
  gap: 6px;
  font-size: 0.8rem;
}
.bar-track {
  height: 8px;
  overflow: hidden;
  background: var(--surface-3);
  border-radius: 999px;
}
.bar-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
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
  margin-top: 8px;
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
.check {
  margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--bad-soft);
  border-radius: var(--radius-sm);
  color: var(--bad);
  font-size: 0.86rem;
}
.check.ok {
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  color: var(--ok);
}
</style>
