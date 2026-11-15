<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import AboutView from "./components/AboutView.vue";
import AppIcon from "./components/AppIcon.vue";
import EmbedView from "./components/EmbedView.vue";
import ExtractView from "./components/ExtractView.vue";
import VpietAboutView from "./components/VpietAboutView.vue";
import VpietEmbedView from "./components/VpietEmbedView.vue";
import VpietRunView from "./components/VpietRunView.vue";
import type { PixelImage } from "./core/pixel";

// モード（ドット絵ステガノ・VPiet）とページ（埋め込む・取り出す・説明）。URL の #/<モード>/<ページ> と対応させる
type Mode = "stegano" | "vpiet";
type Page = "embed" | "extract" | "about";
const modes: { id: Mode; label: string }[] = [
  { id: "stegano", label: "ドット絵ステガノ" },
  { id: "vpiet", label: "VPiet" },
];
const tabs: { id: Page; label: string; slug: Record<Mode, string> }[] = [
  { id: "embed", label: "埋め込む", slug: { stegano: "embed", vpiet: "embed" } },
  { id: "extract", label: "取り出す", slug: { stegano: "extract", vpiet: "run" } },
  { id: "about", label: "説明", slug: { stegano: "about", vpiet: "about" } },
];
const mode = ref<Mode>("stegano");
const page = ref<Page>("embed");

function parseHash() {
  const [, m, p] = location.hash.replace(/^#/, "").split("/");
  const nm: Mode = m === "vpiet" ? "vpiet" : "stegano";
  const t = tabs.find((x) => x.slug[nm] === p);
  mode.value = nm;
  page.value = t?.id ?? "embed";
}
function go(m: Mode, p: Page) {
  const slug = tabs.find((t) => t.id === p)!.slug[m];
  const hash = `#/${m}/${slug}`;
  if (location.hash !== hash) location.hash = hash;
  mode.value = m;
  page.value = p;
}
onMounted(() => {
  parseHash();
  window.addEventListener("hashchange", parseHash);
});
onBeforeUnmount(() => window.removeEventListener("hashchange", parseHash));

const lead = computed(() =>
  mode.value === "stegano"
    ? "ドット絵の色の境界に、見た目を保ったまま文字列を埋め込みます。処理はすべてブラウザの中で行います。"
    : "ドット絵をなるべく保ったまま、Piet のプログラムとして実行すると文字列が出る画像に作り変えます。処理はすべてブラウザの中で行います。",
);

// 埋め込みの結果を取り出しの画面に渡す
const incoming = shallowRef<{ image: PixelImage; key: string; h: number; name: string } | null>(null);
function onVerify(image: PixelImage, key: string, h: number, name: string) {
  incoming.value = { image, key, h, name };
  go("stegano", "extract");
}
const vpietIncoming = shallowRef<{ image: PixelImage; name: string } | null>(null);
function onVpietRun(image: PixelImage, name: string) {
  vpietIncoming.value = { image, name };
  go("vpiet", "extract");
}
</script>

<template>
  <header class="bar">
    <div class="bar-inner">
      <nav
        class="modes"
        aria-label="モード"
      >
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="mode"
          :aria-current="mode === m.id ? 'page' : undefined"
          @click="go(m.id, mode === m.id ? page : 'embed')"
        >
          {{ m.label }}
        </button>
      </nav>
      <a
        class="gh"
        :href="mode === 'vpiet' ? 'https://github.com/Muratam/vpiet' : 'https://github.com/Muratam/stegano_pixelart'"
        aria-label="GitHub"
        title="GitHub"
      >
        <AppIcon name="github" />
      </a>
    </div>
    <div class="bar-inner sub">
      <nav
        class="tabs subtabs"
        aria-label="ページ"
      >
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="tab"
          :aria-current="page === t.id ? 'page' : undefined"
          @click="go(mode, t.id)"
        >
          {{ t.label }}
        </button>
      </nav>
    </div>
  </header>

  <main class="main">
    <p
      v-if="page !== 'about'"
      class="lead quiet"
    >
      {{ lead }}
    </p>
    <!-- 入力と結果はタブ・モードを移っても残す -->
    <EmbedView
      v-show="mode === 'stegano' && page === 'embed'"
      @verify="onVerify"
    />
    <ExtractView
      v-show="mode === 'stegano' && page === 'extract'"
      :incoming="incoming"
    />
    <AboutView v-if="mode === 'stegano' && page === 'about'" />
    <VpietEmbedView
      v-show="mode === 'vpiet' && page === 'embed'"
      @run="onVpietRun"
    />
    <VpietRunView
      v-show="mode === 'vpiet' && page === 'extract'"
      :incoming="vpietIncoming"
    />
    <VpietAboutView v-if="mode === 'vpiet' && page === 'about'" />
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
/* 上の段: モード（ドット絵ステガノ・VPiet）。いまのモードは文字を明るくし、下に線を引く */
.modes {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 4px;
  align-self: stretch;
}
.mode {
  position: relative;
  padding: 4px 10px;
  background: none;
  border: 0;
  color: var(--ink-soft);
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  cursor: pointer;
}
.mode:first-child {
  padding-left: 0;
}
.mode:hover {
  color: var(--ink);
}
.mode[aria-current="page"] {
  color: var(--ink);
}
.mode[aria-current="page"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 10px;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px;
}
.mode:not(:first-child)[aria-current="page"]::after {
  left: 10px;
}
/* 下の段: ページ（埋め込む・取り出す・説明） */
.bar-inner.sub {
  min-height: 44px;
  border-top: 1px solid var(--line);
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
  .mode {
    padding: 4px 8px;
    font-size: 0.92rem;
  }
  .tab {
    padding: 4px 7px;
  }
}
</style>
