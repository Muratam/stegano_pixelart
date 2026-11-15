<script setup lang="ts">
// VPiet の取り出し: 画像を Piet のプログラムとして実行し、出力を見る（1 ステップずつの実行と、今のコーデル・スタックの表示）
import { computed, ref, shallowRef, watch } from "vue";
import AppIcon from "./AppIcon.vue";
import ImagePicker, { type LoadedImage } from "./ImagePicker.vue";
import PixelCanvas from "./PixelCanvas.vue";
import { vpietRunSamples } from "../samples";
import type { PixelImage } from "../core/pixel";
import { imageToProgram, pietToImage, PietMachine } from "../vpiet/api";

const props = defineProps<{ incoming: { image: PixelImage; name: string } | null }>();

const loaded = shallowRef<{ image: PixelImage; name: string } | null>(null);
const codelInput = ref(0); // 0 = 自動
const stdin = ref("");
const machine = shallowRef<PietMachine | null>(null);
const tick = ref(0); // machine の中身が変わったら増やす（再描画用）
const info = shallowRef<{ codel: number; unknown: number; width: number; height: number } | null>(null);
const MAX_STEPS = 100000;
const DP_NAMES = ["右", "下", "左", "上"];
const CC_NAMES = ["右", "左"];

watch(
  () => props.incoming,
  (v) => {
    if (!v) return;
    loaded.value = { image: v.image, name: v.name };
    codelInput.value = 0;
    reset();
  },
  { immediate: true },
);

function onLoaded(l: LoadedImage) {
  loaded.value = { image: l.image, name: l.name };
  codelInput.value = 0;
  reset();
}

function reset() {
  const l = loaded.value;
  if (!l) return;
  const p = imageToProgram(l.image, codelInput.value);
  info.value = { codel: p.codel, unknown: p.unknown, width: p.program.width, height: p.program.height };
  machine.value = new PietMachine(p.program, stdin.value);
  tick.value++;
}
watch(codelInput, reset);

function step() {
  const m = machine.value;
  if (!m) return;
  m.step();
  tick.value++;
}
function runAll() {
  const m = machine.value;
  if (!m) return;
  m.run(m.steps + MAX_STEPS);
  tick.value++;
}

const programImage = computed(() => {
  void tick.value;
  const m = machine.value;
  return m ? pietToImage(m.prog.colors, m.prog.width, m.prog.height) : null;
});
const state = computed(() => {
  void tick.value;
  const m = machine.value;
  if (!m) return null;
  return {
    x: m.x,
    y: m.y,
    dp: DP_NAMES[m.dp],
    cc: CC_NAMES[m.cc],
    steps: m.steps,
    stack: [...m.stack],
    output: m.output,
    finished: m.finished,
    last: m.lastOrder,
    limited: !m.finished && m.steps >= MAX_STEPS,
  };
});
const highlights = computed(() => (state.value && !state.value.finished ? [{ x: state.value.x, y: state.value.y }] : []));
</script>

<template>
  <div class="layout">
    <section class="panel">
      <div class="panel-head">
        <h2>1. 画像</h2>
        <span
          v-if="loaded && info"
          class="quiet meta"
        >{{ loaded.name.replace(/^.*\//, "") }} · {{ info.width }}×{{ info.height }} コーデル</span>
      </div>
      <ImagePicker
        :samples="vpietRunSamples"
        @loaded="onLoaded"
      />
      <template v-if="programImage">
        <PixelCanvas
          class="preview"
          :image="programImage"
          :highlights="highlights"
          label="Piet のプログラム（枠は今のコーデル）"
        />
        <p
          v-if="info && info.unknown > 0"
          class="quiet note"
        >
          Piet の 20 色でない色のコーデルが {{ info.unknown }} 個あります（白として扱います）。
        </p>
      </template>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>2. 実行</h2>
      </div>
      <div class="form">
        <div class="row2">
          <label class="field">
            <span class="field-label">コーデルの大きさ（0 は自動<template v-if="info">。いまは {{ info.codel }}</template>）</span>
            <input
              v-model.number="codelInput"
              class="input"
              type="number"
              min="0"
              max="64"
            >
          </label>
          <label class="field">
            <span class="field-label">標準入力（inn・inc で読む）</span>
            <input
              v-model="stdin"
              class="input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              @change="reset"
            >
          </label>
        </div>
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="vpiet-runall"
            :disabled="!machine || state?.finished"
            @click="runAll"
          >
            <AppIcon name="extract" />
            実行
          </button>
          <button
            type="button"
            class="btn"
            data-testid="vpiet-step"
            :disabled="!machine || state?.finished"
            @click="step"
          >
            1 ステップ
          </button>
          <button
            type="button"
            class="btn"
            :disabled="!machine"
            @click="reset"
          >
            最初から
          </button>
        </div>
        <dl
          v-if="state"
          class="stats"
        >
          <div>
            <dt>状態</dt>
            <dd>{{ state.finished ? "終了" : state.limited ? `${MAX_STEPS} ステップで中断` : "実行中" }} <span class="quiet">/ {{ state.steps }} ステップ</span></dd>
          </div>
          <div>
            <dt>今のコーデル・DP・CC</dt>
            <dd>({{ state.x }}, {{ state.y }}) <span class="quiet">DP {{ state.dp }} · CC {{ state.cc }}</span></dd>
          </div>
          <div>
            <dt>直前の命令</dt>
            <dd>{{ state.last ?? "—" }}</dd>
          </div>
        </dl>
        <div
          v-if="state"
          class="field"
        >
          <span class="field-label">スタック（右が上）</span>
          <code
            class="stack"
            data-testid="vpiet-stack"
          >[{{ state.stack.join(", ") }}]</code>
        </div>
        <label
          v-if="state"
          class="field"
        >
          <span class="field-label">出力</span>
          <textarea
            class="textarea"
            data-testid="vpiet-output"
            readonly
            rows="3"
            :value="state.output"
          />
        </label>
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
.note {
  margin-top: 8px;
  font-size: 0.8rem;
}
.form {
  display: grid;
  gap: 12px;
}
.row2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 0;
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
  font-size: 0.92rem;
  font-weight: 600;
}
.stack {
  display: block;
  padding: 8px 10px;
  max-height: 120px;
  overflow: auto;
  background: var(--bg-side);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  color: var(--ink-sub);
  overflow-wrap: anywhere;
}
</style>
