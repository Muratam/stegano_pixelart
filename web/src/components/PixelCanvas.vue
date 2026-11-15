<script setup lang="ts">
// ドット絵のビューア。既定は枠に収まる最大の整数倍（枠より大きい画像は縮小）で、ぼかさずに描く。
// 拡大縮小（ボタン・ホイール・ピンチ・ダブルクリック・キー）、拡大したときのドラッグでの移動、大きく拡大したときの画素の格子線、
// カーソル（タップ）の下の座標と色の表示。同じ大きさの画像に差し替えても（比較の表示の切り替え）拡大と位置を保つ。
// resetKey が変わったら（別の画像を読んだら）枠に合わせ直す。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { hexOf } from "../core/color";
import { toRgba, type PixelImage } from "../core/pixel";

const props = defineProps<{
  image: PixelImage;
  highlights?: { x: number; y: number }[];
  label: string;
  resetKey?: string | number;
}>();

const viewport = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

// 1 画素あたりの CSS px。1 以上は整数（画素の大きさをそろえる）
const scale = ref(1);
// 画像の左上の位置（ビューポートの中の CSS px）
const ox = ref(0);
const oy = ref(0);
// 「枠に合わせる」の状態か（枠の大きさが変わったら合わせ直す）
const fitted = ref(true);
const vw = ref(0);
const vh = ref(0);
const hover = ref<{ x: number; y: number } | null>(null);

const MIN_SCALE = 1 / 8;
const MAX_SCALE = 64;
const PAD = 8;

function fitScale(): number {
  const img = props.image;
  const s = Math.min((vw.value - PAD * 2) / img.width, (vh.value - PAD * 2) / img.height);
  if (!(s > 0)) return 1;
  return s >= 1 ? Math.min(MAX_SCALE, Math.floor(s)) : Math.max(MIN_SCALE, s);
}

/** 1 以上は整数に、1 未満はそのまま（縮小） */
function snap(s: number): number {
  const c = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  return c >= 1 ? Math.round(c) : c;
}

/** はみ出さない向きは中央に、はみ出す向きは隙間ができないように位置を収める */
function clamp() {
  const w = props.image.width * scale.value;
  const h = props.image.height * scale.value;
  ox.value = w <= vw.value ? (vw.value - w) / 2 : Math.min(0, Math.max(vw.value - w, ox.value));
  oy.value = h <= vh.value ? (vh.value - h) / 2 : Math.min(0, Math.max(vh.value - h, oy.value));
}

function fit() {
  scale.value = fitScale();
  fitted.value = true;
  clamp();
  draw();
}

/** (ax, ay)（ビューポートの中の点）を動かさずに拡大率を変える */
function zoomTo(s: number, ax = vw.value / 2, ay = vh.value / 2) {
  const ns = snap(s);
  if (ns === scale.value) return;
  const ix = (ax - ox.value) / scale.value;
  const iy = (ay - oy.value) / scale.value;
  scale.value = ns;
  ox.value = ax - ix * ns;
  oy.value = ay - iy * ns;
  fitted.value = false;
  clamp();
  draw();
}

function zoomStep(dir: 1 | -1, ax?: number, ay?: number) {
  const s = scale.value;
  let next: number;
  if (dir > 0) next = s < 1 ? Math.min(1, s * 2) : s < 4 ? s + 1 : s * 1.5;
  else next = s <= 1 ? s / 2 : s <= 4 ? s - 1 : s / 1.5;
  zoomTo(next, ax, ay);
}

const zoomLabel = computed(() => (scale.value >= 1 ? `×${scale.value}` : `${Math.round(scale.value * 100)}%`));
const pannable = computed(
  () => props.image.width * scale.value > vw.value + 0.5 || props.image.height * scale.value > vh.value + 0.5,
);

// ---- 描く ----
let source: HTMLCanvasElement | null = null;
let sourceOf: PixelImage | null = null;
let frame = 0;

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function draw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paint();
  });
}

function paint() {
  const el = canvas.value;
  if (!el || vw.value === 0) return;
  const img = props.image;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(vw.value * dpr);
  const ch = Math.round(vh.value * dpr);
  if (el.width !== cw || el.height !== ch) {
    el.width = cw;
    el.height = ch;
  }
  const ctx = el.getContext("2d");
  if (!ctx) return;
  if (sourceOf !== img) {
    source = document.createElement("canvas");
    source.width = img.width;
    source.height = img.height;
    source.getContext("2d")?.putImageData(new ImageData(toRgba(img), img.width, img.height), 0, 0);
    sourceOf = img;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = scale.value;
  // 拡大は画素の境目を装置の画素にそろえる（にじませない）
  const x0 = s >= 1 ? Math.round(ox.value * dpr) / dpr : ox.value;
  const y0 = s >= 1 ? Math.round(oy.value * dpr) / dpr : oy.value;
  ctx.imageSmoothingEnabled = s < 1;
  if (source) ctx.drawImage(source, x0, y0, img.width * s, img.height * s);

  // 画素の格子線（1 画素が 12px 以上のとき）
  if (s >= 12) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = cssVar("--bg", "#0e1419");
    ctx.lineWidth = 1 / dpr;
    ctx.beginPath();
    const xs = Math.max(0, Math.floor(-x0 / s));
    const xe = Math.min(img.width, Math.ceil((vw.value - x0) / s));
    const ys = Math.max(0, Math.floor(-y0 / s));
    const ye = Math.min(img.height, Math.ceil((vh.value - y0) / s));
    for (let x = xs; x <= xe; x++) {
      ctx.moveTo(x0 + x * s, y0 + ys * s);
      ctx.lineTo(x0 + x * s, y0 + ye * s);
    }
    for (let y = ys; y <= ye; y++) {
      ctx.moveTo(x0 + xs * s, y0 + y * s);
      ctx.lineTo(x0 + xe * s, y0 + y * s);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 強調する画素（アクセントの色の枠。縮小しても見えるように最小 4px）
  if (props.highlights?.length) {
    const lw = Math.max(1, Math.min(3, s / 5));
    ctx.lineWidth = lw;
    ctx.strokeStyle = cssVar("--accent", "#47c8e6");
    const box = Math.max(s, 4);
    for (const { x, y } of props.highlights) {
      const cx = x0 + (x + 0.5) * s;
      const cy = y0 + (y + 0.5) * s;
      ctx.strokeRect(cx - box / 2 - lw / 2, cy - box / 2 - lw / 2, box + lw, box + lw);
    }
  }

  // カーソルの下の画素
  if (hover.value) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = cssVar("--ink", "#e3eaef");
    ctx.strokeRect(x0 + hover.value.x * s - 0.75, y0 + hover.value.y * s - 0.75, s + 1.5, s + 1.5);
  }
}

// ---- 操作 ----
const pointers = new Map<number, { x: number; y: number }>();
let dragFrom: { x: number; y: number; ox: number; oy: number } | null = null;
let pinchFrom: { dist: number; scale: number; ix: number; iy: number } | null = null;
let moved = false;

function local(e: { clientX: number; clientY: number }) {
  const r = viewport.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function pixelAt(p: { x: number; y: number }) {
  const x = Math.floor((p.x - ox.value) / scale.value);
  const y = Math.floor((p.y - oy.value) / scale.value);
  if (x < 0 || y < 0 || x >= props.image.width || y >= props.image.height) return null;
  return { x, y };
}

function onPointerDown(e: PointerEvent) {
  viewport.value?.setPointerCapture(e.pointerId);
  const p = local(e);
  pointers.set(e.pointerId, p);
  moved = false;
  if (pointers.size === 1) dragFrom = { ...p, ox: ox.value, oy: oy.value };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    pinchFrom = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      scale: scale.value,
      ix: (mx - ox.value) / scale.value,
      iy: (my - oy.value) / scale.value,
    };
    dragFrom = null;
  }
}

function onPointerMove(e: PointerEvent) {
  const p = local(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
  if (pinchFrom && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ns = snap(pinchFrom.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchFrom.dist));
    scale.value = ns;
    ox.value = mx - pinchFrom.ix * ns;
    oy.value = my - pinchFrom.iy * ns;
    fitted.value = false;
    moved = true;
    clamp();
    draw();
    return;
  }
  if (dragFrom && pointers.size === 1) {
    const dx = p.x - dragFrom.x;
    const dy = p.y - dragFrom.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    if (moved && pannable.value) {
      ox.value = dragFrom.ox + dx;
      oy.value = dragFrom.oy + dy;
      fitted.value = false;
      clamp();
    }
  }
  // マウスは動かすだけで、タッチは押している間だけ座標を出す
  if (e.pointerType === "mouse" || pointers.size === 1) hover.value = pixelAt(p);
  draw();
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchFrom = null;
  if (pointers.size === 1) {
    const [p] = [...pointers.values()];
    dragFrom = { ...p, ox: ox.value, oy: oy.value };
  } else if (pointers.size === 0) dragFrom = null;
  // タップした画素の座標と色は離しても残す（タッチには hover が無いため）
  if (!moved && e.pointerType !== "mouse") hover.value = pixelAt(local(e));
  draw();
}

function onPointerLeave(e: PointerEvent) {
  if (e.pointerType === "mouse" && !pointers.size) {
    hover.value = null;
    draw();
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const p = local(e);
  zoomStep(e.deltaY < 0 ? 1 : -1, p.x, p.y);
}

function onDblClick(e: MouseEvent) {
  const p = local(e);
  zoomStep(1, p.x, p.y);
}

function onKey(e: KeyboardEvent) {
  const step = 32;
  if (e.key === "+" || e.key === "=") zoomStep(1);
  else if (e.key === "-") zoomStep(-1);
  else if (e.key === "0") fit();
  else if (e.key === "1") zoomTo(1);
  else if (e.key.startsWith("Arrow") && pannable.value) {
    if (e.key === "ArrowLeft") ox.value += step;
    if (e.key === "ArrowRight") ox.value -= step;
    if (e.key === "ArrowUp") oy.value += step;
    if (e.key === "ArrowDown") oy.value -= step;
    fitted.value = false;
    clamp();
    draw();
  } else return;
  e.preventDefault();
}

const hoverInfo = computed(() => {
  const h = hover.value;
  if (!h) return null;
  const i = h.x + h.y * props.image.width;
  const changed = props.highlights?.some((p) => p.x === h.x && p.y === h.y) ?? false;
  return { ...h, hex: hexOf(props.image.data[i]), alpha: props.image.alpha?.[i], changed };
});

// ---- 大きさの変化 ----
let ro: ResizeObserver | null = null;
onMounted(() => {
  const el = viewport.value!;
  const measure = () => {
    vw.value = el.clientWidth;
    vh.value = el.clientHeight;
    if (fitted.value) scale.value = fitScale();
    clamp();
    draw();
  };
  ro = new ResizeObserver(measure);
  ro.observe(el);
  el.addEventListener("wheel", onWheel, { passive: false });
  measure();
});
onBeforeUnmount(() => {
  ro?.disconnect();
  viewport.value?.removeEventListener("wheel", onWheel);
  if (frame) cancelAnimationFrame(frame);
});

// 別の画像（大きさが違う・resetKey が変わった）なら枠に合わせ直す。同じ大きさの差し替え（比較の表示）は拡大と位置を保つ
watch(
  // 文字列で比べる（配列を返すと毎回別の値とみなされ、差し替えのたびに合わせ直してしまう）
  () => `${props.resetKey ?? ""}|${props.image.width}x${props.image.height}`,
  async () => {
    hover.value = null;
    await nextTick();
    fit();
  },
);
watch(() => [props.image, props.highlights], draw);

defineExpose({ scale, ox, oy, fit, zoomTo });
</script>

<template>
  <div class="viewer">
    <div
      ref="viewport"
      class="viewport"
      :class="{ pannable }"
      tabindex="0"
      role="img"
      :aria-label="`${label}（${image.width}×${image.height}、${zoomLabel}）`"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @dblclick="onDblClick"
      @keydown="onKey"
    >
      <canvas ref="canvas" />
    </div>
    <div class="toolbar">
      <div
        class="zoom"
        role="group"
        aria-label="拡大縮小"
      >
        <button
          type="button"
          class="tool"
          aria-label="縮小"
          title="縮小（−）"
          :disabled="scale <= MIN_SCALE"
          @click="zoomStep(-1)"
        >
          −
        </button>
        <span
          class="zoom-label"
          data-testid="zoom"
        >{{ zoomLabel }}</span>
        <button
          type="button"
          class="tool"
          aria-label="拡大"
          title="拡大（＋）"
          :disabled="scale >= MAX_SCALE"
          @click="zoomStep(1)"
        >
          ＋
        </button>
        <button
          type="button"
          class="tool text"
          title="枠に合わせる（0）"
          :aria-pressed="fitted"
          @click="fit"
        >
          枠に合わせる
        </button>
        <button
          type="button"
          class="tool text"
          title="等倍（1）"
          @click="zoomTo(1)"
        >
          等倍
        </button>
      </div>
      <p
        class="info"
        data-testid="pixel-info"
      >
        <template v-if="hoverInfo">
          <span
            class="swatch"
            :style="{ background: hoverInfo.hex }"
          />
          <span>({{ hoverInfo.x }}, {{ hoverInfo.y }}) {{ hoverInfo.hex
          }}<template v-if="hoverInfo.alpha !== undefined && hoverInfo.alpha !== 255"> α{{ hoverInfo.alpha }}</template></span>
          <span
            v-if="hoverInfo.changed"
            class="changed"
          >変えた画素</span>
        </template>
        <span
          v-else
          class="quiet"
        >{{ image.width }}×{{ image.height }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.viewport {
  position: relative;
  height: clamp(220px, 56vh, 560px);
  overflow: hidden;
  /* 枠に収まっているときは縦のスクロールをブラウザに任せる（ピンチはこちらで受ける） */
  touch-action: pan-y;
  cursor: crosshair;
  /* 透過の画素が分かるように市松の下地 */
  background-color: var(--bg-side);
  background-image:
    linear-gradient(45deg, var(--surface-2) 25%, transparent 25%),
    linear-gradient(-45deg, var(--surface-2) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--surface-2) 75%),
    linear-gradient(-45deg, transparent 75%, var(--surface-2) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  user-select: none;
  -webkit-user-select: none;
}
.viewport.pannable {
  touch-action: none;
  cursor: grab;
}
.viewport.pannable:active {
  cursor: grabbing;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
}
.zoom {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.tool {
  min-width: 34px;
  min-height: 34px;
  padding: 2px 8px;
  background: var(--surface-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}
.tool.text {
  font-size: 0.78rem;
}
.tool:hover {
  border-color: var(--ink-faint);
}
.tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tool[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: rgba(71, 200, 230, 0.35);
  color: var(--accent);
}
.zoom-label {
  min-width: 3.4em;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--ink-sub);
}
.info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--ink-sub);
}
.swatch {
  width: 14px;
  height: 14px;
  border: 1px solid var(--line-strong);
  border-radius: 3px;
}
.changed {
  padding: 0 6px;
  background: var(--accent-soft);
  border-radius: 999px;
  color: var(--accent);
  font-family: var(--font-sans);
}
</style>
