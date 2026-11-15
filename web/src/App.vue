<script setup lang="ts">
import { ref, shallowRef } from "vue";
import AboutView from "./components/AboutView.vue";
import AppIcon from "./components/AppIcon.vue";
import EmbedView from "./components/EmbedView.vue";
import ExtractView from "./components/ExtractView.vue";
import type { PixelImage } from "./core/pixel";

type Page = "embed" | "extract" | "about";
const page = ref<Page>("embed");
const tabs: { id: Page; label: string }[] = [
  { id: "embed", label: "埋め込む" },
  { id: "extract", label: "取り出す" },
  { id: "about", label: "説明" },
];

// 埋め込みの結果を取り出しの画面に渡す
const incoming = shallowRef<{ image: PixelImage; key: string; h: number; name: string } | null>(null);
function onVerify(image: PixelImage, key: string, h: number, name: string) {
  incoming.value = { image, key, h, name };
  page.value = "extract";
}
</script>

<template>
  <header class="bar">
    <div class="bar-inner">
      <button
        type="button"
        class="brand"
        @click="page = 'embed'"
      >
        ドット絵ステガノ
      </button>
      <nav
        class="tabs"
        aria-label="ページ"
      >
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="tab"
          :aria-current="page === t.id ? 'page' : undefined"
          @click="page = t.id"
        >
          {{ t.label }}
        </button>
      </nav>
      <a
        class="gh"
        href="https://github.com/Muratam/stegano_pixelart"
        aria-label="GitHub"
        title="GitHub"
      >
        <AppIcon name="github" />
      </a>
    </div>
  </header>

  <main class="main">
    <p
      v-if="page !== 'about'"
      class="lead quiet"
    >
      ドット絵の色の境界に、見た目を保ったまま文字列を埋め込みます。処理はすべてブラウザの中で行います。
    </p>
    <!-- 入力と結果はタブを移っても残す -->
    <EmbedView
      v-show="page === 'embed'"
      @verify="onVerify"
    />
    <ExtractView
      v-show="page === 'extract'"
      :incoming="incoming"
    />
    <AboutView v-if="page === 'about'" />
  </main>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.bar-inner {
  display: flex;
  align-items: center;
  gap: 4px 12px;
  max-width: 1120px;
  min-height: var(--bar-h);
  margin: 0 auto;
  padding: 0 16px;
}
.brand {
  padding: 4px 0;
  text-align: left;
  background: none;
  border: 0;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  cursor: pointer;
}
.tabs {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  min-height: 34px;
  padding: 4px 10px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.tab:hover {
  color: var(--ink);
}
.tab[aria-current="page"] {
  background: var(--accent-soft);
  border-color: rgba(71, 200, 230, 0.35);
  color: var(--accent);
}
.gh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  color: var(--ink-soft);
  border-radius: var(--radius-sm);
}
.gh:hover {
  color: var(--ink);
  background: var(--surface-2);
}
.gh .icon {
  width: 18px;
  height: 18px;
}
.main {
  display: grid;
  gap: 16px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 16px 16px 48px;
}
.lead {
  font-size: 0.88rem;
}
/* スマホ縦（390px）でタブが切れないように詰める */
@media (max-width: 440px) {
  .bar-inner {
    gap: 4px 6px;
    padding: 0 10px;
  }
  .brand {
    font-size: 0.88rem;
  }
  .tab {
    padding: 4px 7px;
  }
}
</style>
