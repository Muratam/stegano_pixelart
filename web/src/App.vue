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
    <div class="bar-sub">
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
  /* 左はタブの余白（16px）で本文の左端とそろえる */
  padding: 0 16px 0 0;
}
/*
 * タブ（Muratam/akochandaaaaaa の .ako-tab と同じ見た目）: 枠の無い文字だけのタブで、選んだタブは文字を明るく太くし、下にアクセントの線を引く。
 * 上の段がモード（ドット絵ステガノ・VPiet。GitHub へのリンクは右端）、下の段がページ（埋め込む・取り出す・説明）。どちらも左揃え。
 */
.modes,
.tabs {
  display: flex;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  margin-bottom: -1px;
  overflow-x: auto;
  scrollbar-width: none;
}
.mode,
.tab {
  flex: none;
  padding: 0 16px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.9rem;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.mode:hover,
.tab:hover {
  color: var(--ink);
}
.mode[aria-current="page"],
.tab[aria-current="page"] {
  color: var(--ink);
  font-weight: 600;
  border-bottom-color: var(--accent);
}
.bar-sub {
  border-top: 1px solid var(--line);
}
/* 高さは akochan と同じ（スマホ 48px・幅 700px 以上 56px。Muratam/tetris-esolang の T402 と同じ値） */
.bar-inner,
.bar-inner.sub {
  min-height: 48px;
}
@media (min-width: 700px) {
  .bar-inner,
  .bar-inner.sub {
    min-height: 56px;
  }
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
/* スマホ縦（390px）: 余白を詰める */
@media (max-width: 440px) {
  .bar-inner {
    gap: 4px 6px;
    padding: 0 6px 0 4px;
  }
  .mode,
  .tab {
    padding: 0 12px;
  }
}
</style>
