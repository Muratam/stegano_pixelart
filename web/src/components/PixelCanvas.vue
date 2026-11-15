<script setup lang="ts">
// ドット絵を整数倍に拡大して描く（ぼかさない）。
import { onMounted, ref, watch } from "vue";
import { toRgba, type PixelImage } from "../core/pixel";

const props = defineProps<{
  image: PixelImage;
  label: string;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);

function draw() {
  const el = canvas.value;
  if (!el) return;
  const img = props.image;
  // 内部の解像度は長い辺がおよそ 640px になる整数倍（表示の大きさは CSS で決める）
  const scale = Math.max(1, Math.min(32, Math.floor(640 / Math.max(img.width, img.height))));
  el.width = img.width * scale;
  el.height = img.height * scale;
  const ctx = el.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext("2d");
  if (!sctx) return;
  sctx.putImageData(new ImageData(toRgba(img), img.width, img.height), 0, 0);
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.drawImage(src, 0, 0, el.width, el.height);
}

onMounted(draw);
watch(() => props.image, draw);
</script>

<template>
  <div class="pixel-frame">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="label"
    />
  </div>
</template>

<style scoped>
.pixel-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 10px;
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
}
canvas {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  width: auto;
  height: auto;
  image-rendering: pixelated;
}
</style>
