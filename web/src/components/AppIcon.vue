<script setup lang="ts">
// 外部の CDN を使わないインラインの SVG（github は GitHub の Octicons、ほかは線で描く）
defineProps<{ name: "github" | "upload" | "download" | "embed" | "extract" | "arrow" }>();
</script>

<template>
  <svg
    v-if="name === 'github'"
    class="icon"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
  <svg
    v-else
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'upload'">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line
        x1="12"
        y1="3"
        x2="12"
        y2="15"
      />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="3"
      />
    </template>
    <template v-else-if="name === 'embed'">
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
      />
      <path d="M9 9h2v2H9zM13 13h2v2h-2z" />
    </template>
    <template v-else-if="name === 'extract'">
      <circle
        cx="11"
        cy="11"
        r="7"
      />
      <line
        x1="21"
        y1="21"
        x2="16.65"
        y2="16.65"
      />
    </template>
    <template v-else>
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
      />
      <polyline points="12 5 19 12 12 19" />
    </template>
  </svg>
</template>
